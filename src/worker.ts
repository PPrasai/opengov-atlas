import initSqlJs, { Database } from 'sql.js';
import { DataAccess, GraphNode, Neighbourhood, NodeId, ClusterAggregate, GraphEdge } from './types';
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceCenter } from 'd3-force';

// --- SQL DAL Logic ---
let dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const SQL = await initSqlJs({
      locateFile: file => `/${file}`
    });
    // In dev, Vite serves public folder at root.
    // fetch works in workers!
    const res = await fetch('/atlas.db');
    if (!res.ok) throw new Error("Failed to load atlas.db");
    const buf = await res.arrayBuffer();
    return new SQL.Database(new Uint8Array(buf));
  })();
  return dbPromise;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function encodeSS58(pubkeyBytes: Uint8Array): string {
  return '5' + toHex(pubkeyBytes).slice(0, 46);
}

const STATUS_MAP = ['Submitted', 'Deciding', 'Confirmed', 'Approved', 'Rejected', 'TimedOut', 'Cancelled', 'Killed'];
const DIRECTION_MAP = ['Aye', 'Nay', 'Split', 'SplitAbstain'];
const KIND_MAP = ['Lookup', 'Inline', 'Legacy'];
const CONVICTION_MAP = ['0.1x', '1x', '2x', '3x', '4x', '5x', '6x'];

class SqlJsDAL implements DataAccess {
  private async query(sql: string, params: any[] = []): Promise<any[]> {
    const db = await getDb();
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  private async getAccountSs58(id: number): Promise<string> {
    const res = await this.query(`SELECT pubkey FROM account WHERE id = ?`, [id]);
    if (!res.length) return `account:unknown`;
    return encodeSS58(res[0].pubkey as Uint8Array);
  }

  private async getAccountId(ss58: string): Promise<number | null> {
    const expectedHex = ss58.substring(1);
    const res = await this.query(`SELECT id, pubkey FROM account`);
    for (const r of res) {
       const h = toHex(r.pubkey as Uint8Array).slice(0, 46);
       if (h === expectedHex) return r.id as number;
    }
    return null;
  }

  async entityDetail(id: NodeId): Promise<GraphNode> {
    const [type, ...rest] = id.split(':');
    const val = rest.join(':');

    if (type === 'referendum') {
      const idx = parseInt(val);
      const res = await this.query(`SELECT * FROM referendum WHERE idx = ?`, [idx]);
      if (!res.length) throw new Error("Not found");
      const r = res[0];
      return {
        id,
        kind: 'referendum',
        label: `Referendum ${idx}`,
        data: { ...r, status: STATUS_MAP[r.status as number], proposal_kind: KIND_MAP[r.proposal_kind as number] }
      };
    } else if (type === 'account') {
      const ss58 = val;
      const accId = await this.getAccountId(ss58);
      let data: any = { address: ss58 };
      if (accId) {
        const res = await this.query(`SELECT * FROM account WHERE id = ?`, [accId]);
        if (res.length) data = { ...data, ...res[0] };
      }
      return { id, kind: 'account', label: data.display || ss58.slice(0, 8), data };
    } else if (type === 'track') {
      return { id, kind: 'track', label: `Track ${val}`, data: { track: val } };
    } else if (type === 'preimage') {
      const res = await this.query(`SELECT * FROM preimage WHERE hex(hash) = upper(?)`, [val]);
      if (res.length) {
         return { id, kind: 'preimage', label: `Preimage`, data: { hash: val, ...res[0] } };
      }
      return { id, kind: 'preimage', label: `Preimage`, data: { hash: val } };
    } else if (type === 'vote') {
      return { id, kind: 'vote', label: `Vote`, data: {} };
    } else if (type === 'delegation') {
      return { id, kind: 'delegation', label: `Delegation`, data: {} };
    }
    
    return { id, kind: type as any, label: `${type}: ${val.slice(0,8)}`, data: {} };
  }

  async neighbours(id: NodeId): Promise<Neighbourhood> {
    const [type, ...rest] = id.split(':');
    const val = rest.join(':');

    const center = await this.entityDetail(id);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    let cluster: ClusterAggregate | undefined = undefined;

    if (type === 'referendum') {
      const idx = parseInt(val);
      const refRow = center.data;
      
      if (refRow.proposer_id != null) {
        const ss58 = await this.getAccountSs58(refRow.proposer_id as number);
        const propId = `account:${ss58}`;
        nodes.push(await this.entityDetail(propId));
        edges.push({ source: propId, target: id, relation: 'submitted_by' });
      }

      if (refRow.decision_deposit_who_id != null) {
        const ss58 = await this.getAccountSs58(refRow.decision_deposit_who_id as number);
        const depId = `account:${ss58}`;
        nodes.push(await this.entityDetail(depId));
        edges.push({ source: depId, target: id, relation: 'paid_decision_deposit' });
      }

      const trackId = `track:${refRow.track}`;
      nodes.push({ id: trackId, kind: 'track', label: `Track ${refRow.track}`, data: { track: refRow.track } });
      edges.push({ source: id, target: trackId, relation: 'runs_on' });

      if (refRow.proposal_hash) {
        const hashHex = toHex(refRow.proposal_hash as Uint8Array);
        const preId = `preimage:${hashHex}`;
        nodes.push({ id: preId, kind: 'preimage', label: `Preimage`, data: { hash: hashHex } });
        edges.push({ source: id, target: preId, relation: 'enacts' });
      }

      const votes = await this.query(`SELECT * FROM vote WHERE poll = ? AND active = 1 ORDER BY effective_weight DESC LIMIT 9`, [idx]);
      
      for (const v of votes) {
        const ss58 = await this.getAccountSs58(v.voter_id as number);
        const voteId = `vote:${ss58}:${idx}`;
        
        // Ensure the voter account exists in the graph so the 'cast_by' edge doesn't crash d3-force
        nodes.push(await this.entityDetail(`account:${ss58}`));
        
        nodes.push({
          id: voteId,
          kind: 'vote',
          label: `${DIRECTION_MAP[v.direction as number]} ${CONVICTION_MAP[v.conviction as number] || '0.1x'}`,
          data: { ...v, directionStr: DIRECTION_MAP[v.direction as number] }
        });
        edges.push({ source: `account:${ss58}`, target: voteId, relation: 'cast_by' });
        edges.push({ source: voteId, target: id, relation: 'received_vote' });
      }

      const agg = await this.query(`
        SELECT COUNT(*) as remainderCount,
               SUM(effective_weight) as totalEffectiveWeight,
               SUM(CASE WHEN direction = 0 THEN 1 ELSE 0 END) as ayes,
               SUM(CASE WHEN direction = 1 THEN 1 ELSE 0 END) as nays,
               SUM(CASE WHEN direction >= 2 THEN 1 ELSE 0 END) as abstains
        FROM (SELECT * FROM vote WHERE poll = ? AND active = 1 ORDER BY effective_weight DESC LIMIT -1 OFFSET 9)
      `, [idx]);

      if (agg.length && (agg[0].remainderCount as number) > 0) {
        cluster = {
          pollIndex: idx,
          remainderCount: agg[0].remainderCount as number,
          totalEffectiveWeight: String(agg[0].totalEffectiveWeight || '0'),
          ayes: agg[0].ayes as number,
          nays: agg[0].nays as number,
          abstains: agg[0].abstains as number
        };
      }
    } else if (type === 'account') {
      const ss58 = val;
      const accId = await this.getAccountId(ss58);
      if (accId) {
        const accRow = await this.query(`SELECT parent_id FROM account WHERE id = ?`, [accId]);
        if (accRow.length && accRow[0].parent_id != null) {
          const parentSs58 = await this.getAccountSs58(accRow[0].parent_id as number);
          const parentId = `account:${parentSs58}`;
          nodes.push(await this.entityDetail(parentId));
          edges.push({ source: id, target: parentId, relation: 'sub_identity_of' });
        }
        
        const childrenRows = await this.query(`SELECT id FROM account WHERE parent_id = ? LIMIT 50`, [accId]);
        for (const child of childrenRows) {
          const childSs58 = await this.getAccountSs58(child.id as number);
          const childId = `account:${childSs58}`;
          nodes.push(await this.entityDetail(childId));
          edges.push({ source: childId, target: id, relation: 'sub_identity_of' });
        }

        const proposed = await this.query(`SELECT idx FROM referendum WHERE proposer_id = ?`, [accId]);
        if (proposed.length > 10) {
          const boxId = `box:proposed:${accId}`;
          nodes.push({ id: boxId, kind: 'box', label: `Proposed (${proposed.length})`, data: { count: proposed.length } });
          edges.push({ source: id, target: boxId, relation: 'contains' });
        } else {
          for (const p of proposed) {
            const refId = `referendum:${p.idx}`;
            nodes.push(await this.entityDetail(refId));
            edges.push({ source: id, target: refId, relation: 'submitted_by' });
          }
        }
        
        const paidDeposit = await this.query(`SELECT idx FROM referendum WHERE decision_deposit_who_id = ?`, [accId]);
        if (paidDeposit.length > 10) {
          const boxId = `box:paid_deposit:${accId}`;
          nodes.push({ id: boxId, kind: 'box', label: `Deposits (${paidDeposit.length})`, data: { count: paidDeposit.length } });
          edges.push({ source: id, target: boxId, relation: 'contains' });
        } else {
          for (const p of paidDeposit) {
            const refId = `referendum:${p.idx}`;
            nodes.push(await this.entityDetail(refId));
            edges.push({ source: id, target: refId, relation: 'paid_decision_deposit' });
          }
        }

        const delTo = await this.query(`SELECT delegate_id, track FROM delegation WHERE delegator_id = ? AND active = 1`, [accId]);
        if (delTo.length > 10) {
          const boxId = `box:delegates_to:${accId}`;
          nodes.push({ id: boxId, kind: 'box', label: `Delegated (${delTo.length})`, data: { count: delTo.length } });
          edges.push({ source: id, target: boxId, relation: 'contains' });
        } else {
          for (const d of delTo) {
            const toSs58 = await this.getAccountSs58(d.delegate_id as number);
            const toId = `account:${toSs58}`;
            const delId = `delegation:${ss58}:${d.track}`;
            nodes.push(await this.entityDetail(toId));
            nodes.push(await this.entityDetail(delId));
            edges.push({ source: id, target: delId, relation: 'delegates_to' });
            edges.push({ source: delId, target: toId, relation: 'delegates_to' });
          }
        }
        
        const delFrom = await this.query(`SELECT delegator_id, track FROM delegation WHERE delegate_id = ? AND active = 1`, [accId]);
        if (delFrom.length > 10) {
          const boxId = `box:delegates_from:${accId}`;
          nodes.push({ id: boxId, kind: 'box', label: `Delegators (${delFrom.length})`, data: { count: delFrom.length } });
          edges.push({ source: id, target: boxId, relation: 'contains' });
        } else {
          for (const d of delFrom) {
            const fromSs58 = await this.getAccountSs58(d.delegator_id as number);
            const fromId = `account:${fromSs58}`;
            const delId = `delegation:${fromSs58}:${d.track}`;
            nodes.push(await this.entityDetail(fromId));
            nodes.push(await this.entityDetail(delId));
            edges.push({ source: fromId, target: delId, relation: 'delegates_from' });
            edges.push({ source: delId, target: id, relation: 'delegates_to' });
          }
        }
      }
    } else if (type === 'box') {
      const parts = val.split(':');
      const relation = parts[0];
      const accId = parseInt(parts[1]);
      const accSs58 = await this.getAccountSs58(accId);

      if (relation === 'delegates_to') {
        const delTo = await this.query(`SELECT delegate_id, track FROM delegation WHERE delegator_id = ? AND active = 1`, [accId]);
        for (const d of delTo) {
          const toSs58 = await this.getAccountSs58(d.delegate_id as number);
          const toId = `account:${toSs58}`;
          const delId = `delegation:${accSs58}:${d.track}`;
          nodes.push(await this.entityDetail(toId));
          nodes.push(await this.entityDetail(delId));
          edges.push({ source: id, target: delId, relation: 'contains' });
          edges.push({ source: delId, target: toId, relation: 'delegates_to' });
        }
      } else if (relation === 'delegates_from') {
        const delFrom = await this.query(`SELECT delegator_id, track FROM delegation WHERE delegate_id = ? AND active = 1`, [accId]);
        for (const d of delFrom) {
          const fromSs58 = await this.getAccountSs58(d.delegator_id as number);
          const fromId = `account:${fromSs58}`;
          const delId = `delegation:${fromSs58}:${d.track}`;
          nodes.push(await this.entityDetail(fromId));
          nodes.push(await this.entityDetail(delId));
          edges.push({ source: id, target: delId, relation: 'contains' });
          edges.push({ source: fromId, target: delId, relation: 'delegates_from' });
        }
      } else if (relation === 'proposed') {
        const proposed = await this.query(`SELECT idx FROM referendum WHERE proposer_id = ?`, [accId]);
        for (const p of proposed) {
          const refId = `referendum:${p.idx}`;
          nodes.push(await this.entityDetail(refId));
          edges.push({ source: id, target: refId, relation: 'contains' });
        }
      } else if (relation === 'paid_deposit') {
        const paidDeposit = await this.query(`SELECT idx FROM referendum WHERE decision_deposit_who_id = ?`, [accId]);
        for (const p of paidDeposit) {
          const refId = `referendum:${p.idx}`;
          nodes.push(await this.entityDetail(refId));
          edges.push({ source: id, target: refId, relation: 'contains' });
        }
      }
    } else if (type === 'track') {
      const trackId = parseInt(val);
      const refs = await this.query(`SELECT idx FROM referendum WHERE track = ? ORDER BY idx DESC LIMIT 15`, [trackId]);
      for (const r of refs) {
        const refId = `referendum:${r.idx}`;
        nodes.push(await this.entityDetail(refId));
        edges.push({ source: id, target: refId, relation: 'contains' });
      }
    } else if (type === 'preimage') {
      const refs = await this.query(`SELECT idx FROM referendum WHERE hex(proposal_hash) = upper(?)`, [val]);
      for (const r of refs) {
        const refId = `referendum:${r.idx}`;
        nodes.push(await this.entityDetail(refId));
        edges.push({ source: id, target: refId, relation: 'enacted_by' });
      }

      const preRows = await this.query(`SELECT beneficiary_id, proposer_id FROM preimage WHERE hex(hash) = upper(?)`, [val]);
      if (preRows.length) {
         const pre = preRows[0];
         if (pre.beneficiary_id != null) {
            const ss58 = await this.getAccountSs58(pre.beneficiary_id as number);
            const accId = `account:${ss58}`;
            nodes.push(await this.entityDetail(accId));
            edges.push({ source: id, target: accId, relation: 'pays' });
         }
         if (pre.proposer_id != null) {
            const ss58 = await this.getAccountSs58(pre.proposer_id as number);
            const accId = `account:${ss58}`;
            nodes.push(await this.entityDetail(accId));
            edges.push({ source: accId, target: id, relation: 'submitted_by' });
         }
      }
    } else if (type === 'delegation') {
      const parts = val.split(':');
      const delegatorSs58 = parts[0];
      const trackId = parseInt(parts[1]);

      const delAccId = await this.getAccountId(delegatorSs58);
      if (delAccId) {
        const rows = await this.query(`SELECT delegate_id FROM delegation WHERE delegator_id = ? AND track = ? AND active = 1 LIMIT 1`, [delAccId, trackId]);
        if (rows.length) {
           const delegateSs58 = await this.getAccountSs58(rows[0].delegate_id as number);
           
           const fromId = `account:${delegatorSs58}`;
           nodes.push(await this.entityDetail(fromId));
           edges.push({ source: fromId, target: id, relation: 'delegates_from' });
           
           const toId = `account:${delegateSs58}`;
           nodes.push(await this.entityDetail(toId));
           edges.push({ source: id, target: toId, relation: 'delegates_to' });
           
           const tId = `track:${trackId}`;
           nodes.push(await this.entityDetail(tId));
           edges.push({ source: id, target: tId, relation: 'runs_on' });
        }
      }
    } else if (type === 'vote') {
      const parts = val.split(':');
      const ss58 = parts[0];
      const poll = parts[1];
      const accId = `account:${ss58}`;
      nodes.push(await this.entityDetail(accId));
      edges.push({ source: accId, target: id, relation: 'cast_by' });
      const refId = `referendum:${poll}`;
      nodes.push(await this.entityDetail(refId));
      edges.push({ source: id, target: refId, relation: 'vote_on' });
    }

    const uniqueNodes = Array.from(new Map(nodes.map(n => [n.id, n])).values());
    const uniqueEdges = Array.from(new Map(edges.map(e => [`${e.source}-${e.target}-${e.relation}`, e])).values());

    return { center, nodes: uniqueNodes, edges: uniqueEdges, cluster };
  }

  async clusterMembers(pollIndex: number, opts: { offset: number; limit: number; search?: string }): Promise<{ total: number; rows: GraphNode[] }> {
    const totalRow = await this.query(`SELECT COUNT(*) as c FROM vote WHERE poll = ? AND active = 1`, [pollIndex]);
    const total = totalRow[0].c as number;
    const rows = await this.query(`
      SELECT * FROM vote WHERE poll = ? AND active = 1 
      ORDER BY effective_weight DESC 
      LIMIT ? OFFSET ?
    `, [pollIndex, opts.limit, opts.offset]);
    const graphNodes: GraphNode[] = [];
    for (const v of rows) {
      const ss58 = await this.getAccountSs58(v.voter_id as number);
      const voteId = `vote:${ss58}:${pollIndex}`;
      graphNodes.push({
        id: voteId,
        kind: 'vote',
        label: `${DIRECTION_MAP[v.direction as number]} ${CONVICTION_MAP[v.conviction as number] || '0.1x'}`,
        data: { ...v, directionStr: DIRECTION_MAP[v.direction as number] }
      });
    }
    return { total, rows: graphNodes };
  }

  async searchReferendaAndAccounts(q: string, limit: number): Promise<GraphNode[]> {
    const res: GraphNode[] = [];
    if (/^\d+$/.test(q)) {
      try {
        const ref = await this.entityDetail(`referendum:${q}`);
        res.push(ref);
      } catch (e) {}
    }
    const accts = await this.query(`SELECT id, display FROM account WHERE display LIKE ? LIMIT ?`, [`%${q}%`, limit]);
    for (const a of accts) {
      const ss58 = await this.getAccountSs58(a.id as number);
      res.push(await this.entityDetail(`account:${ss58}`));
    }
    return res;
  }

  async referendaPage(opts: { offset: number; limit: number; track?: number; status?: string; sort?: 'recent' | 'turnout' | 'approval' }): Promise<{ total: number; rows: GraphNode[] }> {
    let sql = `SELECT idx FROM referendum WHERE 1=1`;
    const params: any[] = [];
    if (opts.track !== undefined) {
      sql += ` AND track = ?`;
      params.push(opts.track);
    }
    const totalRow = await this.query(`SELECT COUNT(*) as c FROM (${sql})`, params);
    const total = totalRow[0].c as number;
    sql += ` ORDER BY idx DESC LIMIT ? OFFSET ?`;
    params.push(opts.limit, opts.offset);
    const rows = await this.query(sql, params);
    const graphNodes: GraphNode[] = [];
    for (const r of rows) {
      graphNodes.push(await this.entityDetail(`referendum:${r.idx as number}`));
    }
    return { total, rows: graphNodes };
  }

  async manifest(): Promise<{ schemaVersion: number; blockRange: [number, number]; builtAt: string }> {
    const res = await this.query(`SELECT * FROM meta`);
    const meta: any = {};
    for (const r of res) meta[r.key] = r.value;
    return {
      schemaVersion: parseInt(meta.schema_version || '1'),
      blockRange: [0, 0], 
      builtAt: meta.built_at || "Unknown"
    };
  }
}

const dal = new SqlJsDAL();

// --- RPC Worker Listener ---
self.onmessage = async (e: MessageEvent) => {
  const { id, method, args } = e.data;
  try {
    let result;
    if (method === 'layout') {
      const { tempNodes, tempEdges } = args[0];
      const d3Nodes = tempNodes.map((n: any) => ({ 
        ...n, 
        x: n.position.x === 0 ? (Math.random() - 0.5) * 50 : n.position.x, 
        y: n.position.y === 0 ? (Math.random() - 0.5) * 50 : n.position.y,
        radius: (n.data as any)?.radius || 80
      }));
      
      const d3Edges = tempEdges.map((e: any) => ({ ...e, source: e.source, target: e.target }));

      const simulation = forceSimulation(d3Nodes as any)
        .force('link', forceLink(d3Edges).id((d: any) => d.id).distance((d: any) => d.target.id.startsWith('cluster:') ? 150 : 120))
        .force('charge', forceManyBody().strength(d3Nodes.length > 30 ? -150 : -1000))
        .force('collide', forceCollide().radius((d: any) => d.radius))
        .force('center', forceCenter(0, 0))
        .stop();

      for (let i = 0; i < 300; ++i) {
        simulation.tick();
      }

      const layoutedNodes = tempNodes.map((node: any, i: number) => {
        const d3n = d3Nodes[i] as any;
        return {
          ...node,
          position: {
            x: d3n.x - (d3n.radius * 1.1),
            y: d3n.y - 30,
          }
        };
      });
      result = { nodes: layoutedNodes, edges: tempEdges };
    } else {
      // @ts-ignore
      result = await dal[method](...args);
    }
    self.postMessage({ id, result });
  } catch (error: any) {
    self.postMessage({ id, error: error.message || String(error) });
  }
};
