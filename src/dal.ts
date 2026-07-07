import { DataAccess, GraphNode, Neighbourhood, NodeId, ClusterAggregate, GraphEdge } from './types';
import { Node, Edge } from 'reactflow';

class WorkerRPC implements DataAccess {
  private worker: Worker;
  private msgId = 0;
  private callbacks = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const cb = this.callbacks.get(id);
      if (cb) {
        if (error) cb.reject(new Error(error));
        else cb.resolve(result);
        this.callbacks.delete(id);
      }
    };
  }

  private call(method: string, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.callbacks.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, args });
    });
  }

  entityDetail(id: NodeId): Promise<GraphNode> {
    return this.call('entityDetail', id);
  }

  neighbours(id: NodeId): Promise<Neighbourhood> {
    return this.call('neighbours', id);
  }

  clusterMembers(pollIndex: number, opts: { offset: number; limit: number; search?: string }): Promise<{ total: number; rows: GraphNode[] }> {
    return this.call('clusterMembers', pollIndex, opts);
  }

  searchReferendaAndAccounts(q: string, limit: number): Promise<GraphNode[]> {
    return this.call('searchReferendaAndAccounts', q, limit);
  }

  referendaPage(opts: { offset: number; limit: number; track?: number; status?: string; sort?: 'recent' | 'turnout' | 'approval' }): Promise<{ total: number; rows: GraphNode[] }> {
    return this.call('referendaPage', opts);
  }

  manifest(): Promise<{ schemaVersion: number; blockRange: [number, number]; builtAt: string }> {
    return this.call('manifest');
  }

  // Specialized RPC call for D3 Layout
  layout(tempNodes: Node[], tempEdges: Edge[]): Promise<{ nodes: Node[]; edges: Edge[] }> {
    return this.call('layout', { tempNodes, tempEdges });
  }
}

export const dal = new WorkerRPC();
