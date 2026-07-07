export type NodeId = string;

export interface GraphNode {
  id: NodeId;
  kind: 'referendum' | 'track' | 'account' | 'preimage' | 'vote' | 'delegation';
  label: string;
  data: Record<string, unknown>;
  alreadyVisited?: boolean;
}

export interface GraphEdge {
  source: NodeId;
  target: NodeId;
  relation: 'runs_on' | 'enacts' | 'submitted_by' | 'received_vote' | 'cast_by' | 'delegates_to' | 'pays';
}

export interface ClusterAggregate {
  pollIndex: number;
  remainderCount: number;
  totalEffectiveWeight: string;
  ayes: number;
  nays: number;
  abstains: number;
}

export interface Neighbourhood {
  center: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  cluster?: ClusterAggregate;
}

export interface DataAccess {
  neighbours(id: NodeId): Promise<Neighbourhood>;
  clusterMembers(pollIndex: number, opts: { offset: number; limit: number; search?: string }): Promise<{ total: number; rows: GraphNode[] }>;
  entityDetail(id: NodeId): Promise<GraphNode>;
  searchReferendaAndAccounts(q: string, limit: number): Promise<GraphNode[]>;
  referendaPage(opts: { offset: number; limit: number; track?: number; status?: string; sort?: 'recent' | 'turnout' | 'approval' }): Promise<{ total: number; rows: GraphNode[] }>;
  manifest(): Promise<{ schemaVersion: number; blockRange: [number, number]; builtAt: string }>;
}
