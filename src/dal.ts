import initSqlJs, { Database } from 'sql.js';
import { DataAccess, GraphNode, Neighbourhood, NodeId, ClusterAggregate, GraphEdge } from './types';

let dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
  if (dbPromise) return dbPromise;
  
  dbPromise = (async () => {
    const SQL = await initSqlJs({
      locateFile: file => `https://sql.js.org/dist/${file}`
    });
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
  // Mock SS58 encoding. 
  // In a real app we'd use @polkadot/util-crypto's encodeAddress.
  return '5' + toHex(pubkeyBytes).slice(0, 46);
}

const STATUS_MAP = ['Submitted', 'Deciding', 'Confirmed', 'Approved', 'Rejected', 'TimedOut', 'Cancelled', 'Killed'];
const DIRECTION_MAP = ['Aye', 'Nay', 'Split', 'SplitAbstain'];
const KIND_MAP = ['Lookup', 'Inline', 'Legacy'];
const CONVICTION_MAP = ['0.1x', '1x', '2x', '3x', '4x', '5x', '6x'];

export class SqlJsDAL implements DataAccess {
  
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
    return encodeSS58(res[0].pubkey);
  }

  private async getAccountId(ss58: string): Promise<number | null> {
    // Mock: SS58 to id
    // Since we mock SS58 above, let's reverse mock it or just search all accounts if needed.
    // Real implementation would decode SS58 to pubkey and lookup id.
    const expectedHex = ss58.substring(1);
    const res = await this.query(`SELECT id, pubkey FROM account`);
    for (const r of res) {
       const h = toHex(r.pubkey).slice(0, 46);
       if (h === expectedHex) return r.id;
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
        data: { ...r, status: STATUS_MAP[r.status], proposal_kind: KIND_MAP[r.proposal_kind] }
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
    }
    
    return { id, kind: 'account', label: 'Unknown', data: {} };
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
      
      // Proposer
      if (refRow.proposer_id != null) {
        const ss58 = await this.getAccountSs58(refRow.proposer_id as number);
        const propId = `account:${ss58}`;
        nodes.push(await this.entityDetail(propId));
        edges.push({ source: propId, target: id, relation: 'submitted_by' });
      }

      // Track
      const trackId = `track:${refRow.track}`;
      nodes.push({ id: trackId, kind: 'track', label: `Track ${refRow.track}`, data: { track: refRow.track } });
      edges.push({ source: id, target: trackId, relation: 'runs_on' });

      // Preimage
      if (refRow.proposal_hash) {
        const hashHex = toHex(refRow.proposal_hash as Uint8Array);
        const preId = `preimage:${hashHex}`;
        nodes.push({ id: preId, kind: 'preimage', label: `Preimage`, data: { hash: hashHex } });
        edges.push({ source: id, target: preId, relation: 'enacts' });
      }

      // Votes (Whale top-9 + aggregate)
      const votes = await this.query(`SELECT * FROM vote WHERE poll = ? AND active = 1 ORDER BY effective_weight DESC LIMIT 9`, [idx]);
      
      for (const v of votes) {
        const ss58 = await this.getAccountSs58(v.voter_id);
        const voteId = `vote:${ss58}:${idx}`;
        nodes.push({
          id: voteId,
          kind: 'vote',
          label: `${DIRECTION_MAP[v.direction]} ${CONVICTION_MAP[v.conviction] || '0.1x'}`,
          data: { ...v, directionStr: DIRECTION_MAP[v.direction] }
        });
        edges.push({ source: `account:${ss58}`, target: voteId, relation: 'cast_by' });
        edges.push({ source: voteId, target: id, relation: 'received_vote' });
      }

      // Cluster aggregate
      const agg = await this.query(`
        SELECT COUNT(*) as remainderCount,
               SUM(effective_weight) as totalEffectiveWeight,
               SUM(CASE WHEN direction = 0 THEN 1 ELSE 0 END) as ayes,
               SUM(CASE WHEN direction = 1 THEN 1 ELSE 0 END) as nays,
               SUM(CASE WHEN direction >= 2 THEN 1 ELSE 0 END) as abstains
        FROM (SELECT * FROM vote WHERE poll = ? AND active = 1 ORDER BY effective_weight DESC LIMIT -1 OFFSET 9)
      `, [idx]);

      if (agg.length && agg[0].remainderCount > 0) {
        cluster = {
          pollIndex: idx,
          remainderCount: agg[0].remainderCount,
          totalEffectiveWeight: String(agg[0].totalEffectiveWeight || '0'),
          ayes: agg[0].ayes,
          nays: agg[0].nays,
          abstains: agg[0].abstains
        };
      }
    } else if (type === 'account') {
      const ss58 = val;
      const accId = await this.getAccountId(ss58);
      if (accId) {
        // Find referenda they proposed
        const proposed = await this.query(`SELECT idx FROM referendum WHERE proposer_id = ?`, [accId]);
        for (const p of proposed) {
          const refId = `referendum:${p.idx}`;
          nodes.push(await this.entityDetail(refId));
          edges.push({ source: id, target: refId, relation: 'submitted_by' });
        }
        // Find delegations
        const delTo = await this.query(`SELECT delegate_id, track FROM delegation WHERE delegator_id = ? AND active = 1`, [accId]);
        for (const d of delTo) {
          const toSs58 = await this.getAccountSs58(d.delegate_id);
          const toId = `account:${toSs58}`;
          const delId = `delegation:${ss58}:${d.track}`;
          nodes.push(await this.entityDetail(toId));
          edges.push({ source: id, target: delId, relation: 'delegates_to' });
          edges.push({ source: delId, target: toId, relation: 'runs_on' });
        }
      }
    }

    return { center, nodes, edges, cluster };
  }

  async clusterMembers(pollIndex: number, opts: { offset: number; limit: number; search?: string }): Promise<{ total: number; rows: GraphNode[] }> {
    const totalRow = await this.query(`SELECT COUNT(*) as c FROM vote WHERE poll = ? AND active = 1`, [pollIndex]);
    const total = totalRow[0].c;

    const rows = await this.query(`
      SELECT * FROM vote WHERE poll = ? AND active = 1 
      ORDER BY effective_weight DESC 
      LIMIT ? OFFSET ?
    `, [pollIndex, opts.limit, opts.offset]);

    const graphNodes: GraphNode[] = [];
    for (const v of rows) {
      const ss58 = await this.getAccountSs58(v.voter_id);
      const voteId = `vote:${ss58}:${pollIndex}`;
      graphNodes.push({
        id: voteId,
        kind: 'vote',
        label: `${DIRECTION_MAP[v.direction]} ${CONVICTION_MAP[v.conviction] || '0.1x'}`,
        data: { ...v, directionStr: DIRECTION_MAP[v.direction] }
      });
    }

    return { total, rows: graphNodes };
  }

  async searchReferendaAndAccounts(q: string, limit: number): Promise<GraphNode[]> {
    const res: GraphNode[] = [];
    // If it's a number, try referendum
    if (/^\\d+$/.test(q)) {
      try {
        const ref = await this.entityDetail(`referendum:${q}`);
        res.push(ref);
      } catch (e) {}
    }
    // Search accounts by display
    const accts = await this.query(`SELECT id, display FROM account WHERE display LIKE ? LIMIT ?`, [`%${q}%`, limit]);
    for (const a of accts) {
      const ss58 = await this.getAccountSs58(a.id);
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
    const total = totalRow[0].c;

    sql += ` ORDER BY idx DESC LIMIT ? OFFSET ?`;
    params.push(opts.limit, opts.offset);

    const rows = await this.query(sql, params);
    const graphNodes: GraphNode[] = [];
    for (const r of rows) {
      graphNodes.push(await this.entityDetail(`referendum:${r.idx}`));
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
      builtAt: meta.built_at || new Date().toISOString()
    };
  }
}

export const dal = new SqlJsDAL();
