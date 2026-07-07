import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import ReactFlow, { Background, Controls, Node, Edge, useNodesState, useEdgesState, ReactFlowProvider, useReactFlow, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import { dal } from './dal';
import { GraphNode } from './types';
import AtlasNode from './components/AtlasNode';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

function FlowApp() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();
  
  const nodeTypes = useMemo(() => ({ atlas: AtlasNode }), []);

  // Left Panel State
  const [referenda, setReferenda] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState<number | undefined>(undefined);
  
  // Graph State
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<GraphNode[]>([]);
  
  // Right Panel State
  const [clusterMembers, setClusterMembers] = useState<GraphNode[]>([]);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalContent, setModalContent] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  
  // Meta State
  const [dbUpdated, setDbUpdated] = useState<string>('');
  
  // Persistent Visited State
  const globalVisitedIds = useRef<Set<string>>(new Set());
  
  // Graph Cache
  const graphCache = useRef<Record<string, { nodes: Node[], edges: Edge[] }>>({});

  // Navigation Race Condition Guards
  const latestQueryId = useRef<string | null>(null);
  const renderedCenterRef = useRef<string | null>(null);
  const [renderedCenterId, setRenderedCenterId] = useState<string | null>(null);

  const handleInfoClick = useCallback(async (id: string) => {
    if (!id.startsWith('referendum:')) return;
    const idx = id.split(':')[1];
    setModalTitle(`Referendum ${idx} Description`);
    setModalOpen(true);
    setModalLoading(true);
    setModalContent(null);
    try {
      const res = await fetch(`https://api.polkassembly.io/api/v1/posts/on-chain-post?postId=${idx}&proposalType=referendums_v2`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setModalContent(data.content || "No description provided.");
    } catch (e) {
      setModalContent("Error fetching description. Polkassembly API might be rate-limiting or unavailable.");
    } finally {
      setModalLoading(false);
    }
  }, []);

  // Deep Link Initial Load & Manifest
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const center = params.get('center');
    if (center) {
      dal.entityDetail(center).then(node => {
        if (node) handleSelectRef(node, true);
      }).catch(console.error);
    }

    dal.manifest().then(m => {
      const date = new Date(m.builtAt);
      setDbUpdated(date.toLocaleString());
    }).catch(console.error);
  }, []);

  // Left Sidebar Fetch
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        if (searchQuery.trim().length > 0) {
          const res = await dal.searchReferendaAndAccounts(searchQuery, 20);
          setReferenda(res);
        } else {
          const res = await dal.referendaPage({ offset: 0, limit: 20, track: trackFilter });
          setReferenda(res.rows);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    const timer = setTimeout(loadData, 300); // debounce
    return () => clearTimeout(timer);
  }, [searchQuery, trackFilter]);

  const handleSelectRef = useCallback(async (ref: GraphNode, isInitial: boolean = false) => {
    try {
      latestQueryId.current = ref.id;

      if (ref.kind !== 'box') {
        setSelectedNode(ref);
        setClusterMembers([]);
      }
      
      if (!isInitial) {
        const url = new URL(window.location.toString());
        url.searchParams.set('center', ref.id);
        window.history.pushState({}, '', url);
      }

      setNodes(nds => nds.map(n => n.id === ref.id ? { ...n, data: { ...n.data, isLoading: true } } : n));

      const applyNavigation = (layoutedNodes: Node[], layoutedEdges: Edge[]) => {
        if (latestQueryId.current !== ref.id) return;
        
        setBreadcrumbs(prev => {
          let trail = [...prev];
          const existingIdx = trail.findIndex(p => p.id === ref.id);
          if (existingIdx !== -1) {
            return trail.slice(0, existingIdx + 1);
          }
          
          const parentIdx = trail.findIndex(b => b.id === renderedCenterRef.current);
          if (parentIdx !== -1) {
            trail = trail.slice(0, parentIdx + 1);
          }
          trail.push(ref);
          return trail;
        });

        globalVisitedIds.current.add(ref.id);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        renderedCenterRef.current = ref.id;
        setRenderedCenterId(ref.id);
      };

      if (graphCache.current[ref.id]) {
        applyNavigation(graphCache.current[ref.id].nodes, graphCache.current[ref.id].edges);
        return;
      }

      const previousNodeId = renderedCenterRef.current;

      const hood = await dal.neighbours(ref.id);
      
      let tempNodes: Node[] = [];
      let tempEdges: Edge[] = [];

      const getVoteColor = (direction: number) => {
        switch(direction) {
          case 0: return { bg: '#10b981', border: '#059669' };
          case 1: return { bg: '#f43f5e', border: '#e11d48' };
          default: return { bg: '#f59e0b', border: '#d97706' };
        }
      };

      const getColor = (kind: string, data?: any) => {
        if (kind === 'vote' && data?.direction !== undefined) {
          return getVoteColor(data.direction);
        }
        switch(kind) {
          case 'referendum': return { bg: '#3b82f6', border: '#2563eb' };
          case 'account': return { bg: '#0ea5e9', border: '#0284c7' };
          case 'preimage': return { bg: '#8b5cf6', border: '#7c3aed' };
          case 'track': return { bg: '#a855f7', border: '#9333ea' };
          case 'delegation': return { bg: '#ec4899', border: '#db2777' };
          case 'group': return { bg: '#334155', border: '#475569' };
          default: return { bg: '#64748b', border: '#475569' };
        }
      };

      const centerColors = getColor(hood.center.kind, hood.center.data);
      tempNodes.push({
        id: hood.center.id,
        type: 'atlas',
        position: { x: 0, y: 0 },
        data: { label: hood.center.label, radius: 100, nodeData: hood.center },
        style: { 
          background: centerColors.bg, color: 'white', border: `2px solid ${centerColors.border}`, 
          borderRadius: '8px', padding: '12px', fontWeight: 'bold', fontSize: '14px',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
        }
      });

      // 1. Render Non-Vote Nodes
      const centerIsVote = hood.center.id.startsWith('vote:');
      const voteNodes = centerIsVote ? [] : hood.nodes.filter(n => n.kind === 'vote');
      const nonVoteNodes = centerIsVote ? hood.nodes.filter(n => n.id !== hood.center.id) : hood.nodes.filter(n => n.kind !== 'vote' && n.id !== hood.center.id);
      const isBoxMode = hood.center.id.startsWith('box:');

      nonVoteNodes.forEach(n => {
        const colors = getColor(n.kind, n.data);
        const isJustCameFrom = n.id === previousNodeId;
        const isGlobalVisited = globalVisitedIds.current.has(n.id);
        
        let opacity = 1;
        let borderStyle = 'solid';
        if (isJustCameFrom) {
          opacity = 0.4;
          borderStyle = 'dashed';
        } else if (isGlobalVisited) {
          opacity = 0.6;
          borderStyle = 'solid';
        }
        
        const radius = isBoxMode ? 40 : 80;
        const padding = isBoxMode ? '4px' : '8px';
        const fontSize = isBoxMode ? '9px' : '12px';

        tempNodes.push({
          id: n.id,
          type: 'atlas',
          position: { x: 0, y: 0 },
          data: { label: n.label, nodeData: n, radius },
          style: { 
            background: colors.bg, color: 'white', border: `2px ${borderStyle} ${colors.border}`, 
            borderRadius: '6px', padding, fontSize, opacity
          }
        });
      });

      // 2. Render Non-Vote Edges Verbatim
      const nonVoteEdges = centerIsVote ? hood.edges : hood.edges.filter(e => !e.target.startsWith('vote:') && !e.source.startsWith('vote:'));
      nonVoteEdges.forEach(e => {
        tempEdges.push({
          id: `e-${e.source}-${e.target}-${e.relation || 'unknown'}`,
          source: e.source,
          target: e.target,
          label: e.relation,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
          style: { stroke: '#475569', strokeWidth: 1.5 }
        });
      });

      // 3. Cluster Vote Nodes to prevent hairballs
      if (voteNodes.length > 0) {
        const groupId = `group:vote`;
        const gColors = getColor('group');
        tempNodes.push({
          id: groupId,
          type: 'atlas',
          position: { x: 0, y: 0 },
          data: { label: `votes (${voteNodes.length})`, radius: 60, nodeData: { kind: 'group' } },
          style: {
            background: gColors.bg, color: 'white', border: `1px dashed ${gColors.border}`,
            borderRadius: '9999px', padding: '6px 12px', fontSize: '11px', textTransform: 'uppercase'
          }
        });
        
        tempEdges.push({
          id: `e-center-${groupId}`,
          source: hood.center.id,
          target: groupId,
          label: 'votes',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
          style: { stroke: '#475569', strokeWidth: 1.5 }
        });

        voteNodes.forEach(n => {
          const colors = getColor(n.kind, n.data);
          const isJustCameFrom = n.id === previousNodeId;
          const isGlobalVisited = globalVisitedIds.current.has(n.id);
          
          let opacity = 1;
          let borderStyle = 'solid';
          if (isJustCameFrom) {
            opacity = 0.4;
            borderStyle = 'dashed';
          } else if (isGlobalVisited) {
            opacity = 0.6;
            borderStyle = 'solid';
          }

          let p = '8px';
          let fs = '12px';
          let radius = 80;
          
          if (n.data.effective_weight !== undefined) {
            const weight = parseFloat(String(n.data.effective_weight));
            if (weight > 1000) { p = '12px'; fs = '14px'; radius = 100; }
            if (weight < 10) { p = '4px'; fs = '10px'; radius = 60; }
          }

          tempNodes.push({
            id: n.id,
            type: 'atlas',
            position: { x: 0, y: 0 },
            data: { label: n.label, nodeData: n, radius },
            style: { 
              background: colors.bg, color: 'white', border: `2px ${borderStyle} ${colors.border}`, 
              borderRadius: '6px', padding: p, fontSize: fs, opacity
            }
          });
          
          tempEdges.push({
            id: `e-${groupId}-${n.id}`,
            source: groupId,
            target: n.id,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
            style: { stroke: '#475569', strokeWidth: 1.5 }
          });

          const castByEdge = hood.edges.find(e => e.target === n.id && e.relation === 'cast_by');
          if (castByEdge) {
            tempEdges.push({
              id: `e-castby-${castByEdge.source}-${n.id}`,
              source: castByEdge.source,
              target: n.id,
              label: 'cast_by',
              markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
              style: { stroke: '#475569', strokeWidth: 1.5 }
            });
          }
        });
      }

      if (hood.cluster) {
        const clusterId = `cluster:${hood.cluster.pollIndex}`;
        tempNodes.push({
          id: clusterId,
          type: 'atlas',
          position: { x: 0, y: 0 },
          data: { label: `+${hood.cluster.remainderCount} others`, radius: 90, nodeData: { id: clusterId, kind: 'cluster', label: 'Minority Voters', data: hood.cluster } },
          style: {
            background: '#334155', color: '#cbd5e1', border: '1px dashed #475569',
            borderRadius: '9999px', padding: '10px 16px', fontWeight: 'bold'
          }
        });
        tempEdges.push({
          id: `e-group-vote-${clusterId}`,
          source: `group:vote`,
          target: clusterId,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
          style: { stroke: '#475569', strokeWidth: 1.5 }
        });
      }

      const cleanNodes = tempNodes.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      const { nodes: layoutedNodes, edges: layoutedEdges } = await (dal as any).layout(cleanNodes, tempEdges);
      
      if (latestQueryId.current !== ref.id) return;
      
      const finalNodes = layoutedNodes.map((n: any) => ({
        ...n,
        data: { ...n.data, onInfoClick: handleInfoClick }
      }));
      
      graphCache.current[ref.id] = { nodes: finalNodes, edges: layoutedEdges };
      
      applyNavigation(finalNodes, layoutedEdges);
      
      setTimeout(() => {
        fitView({ duration: 800, padding: 0.2 });
      }, 50);

    } catch (e) {
      console.error(e);
      // Reset loading state on error
      setNodes(nds => nds.map(n => n.id === ref.id ? { ...n, data: { ...n.data, isLoading: false } } : n));
    }
  }, [breadcrumbs, setNodes, setEdges, fitView, handleInfoClick]);

  const handleNodeClick = useCallback(async (_event: React.MouseEvent, node: Node) => {
    const data = node.data.nodeData as GraphNode;
    if (!data) return;
    
    if (data.kind === 'cluster') {
      setSelectedNode(data);
      const res = await dal.clusterMembers(data.data.pollIndex as number, { offset: 0, limit: 50 });
      setClusterMembers(res.rows);
      return;
    }
    
    setClusterMembers([]);
    handleSelectRef(data);
  }, [handleSelectRef]);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const target = breadcrumbs[index];
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    handleSelectRef(target, true);
  }, [breadcrumbs, handleSelectRef]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 text-white overflow-hidden">
      <header className="flex-none p-4 bg-slate-800 border-b border-slate-700 shadow-md flex items-center justify-between z-20">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
          OpenGov Atlas
        </h1>
        {breadcrumbs.length > 0 && (
          <div className="flex space-x-2 text-sm text-slate-300">
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={b.id + i}>
                <span 
                  className="cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleBreadcrumbClick(i)}
                >
                  {b.label}
                </span>
                {i < breadcrumbs.length - 1 && <span className="text-slate-500">/</span>}
              </React.Fragment>
            ))}
          </div>
        )}
      </header>
      
      <main className="flex-grow flex relative overflow-hidden">
        {/* Left Panel */}
        <div className="w-72 flex-none bg-slate-800/80 border-r border-slate-700 p-4 backdrop-blur-sm z-10 shadow-lg flex flex-col h-full">
          <h2 className="text-lg font-semibold mb-4 text-slate-200">Explorer</h2>
          
          <input 
            type="text" 
            placeholder="Search ID or Account..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 mb-3"
          />

          {!searchQuery && (
            <select 
              value={trackFilter || ''}
              onChange={(e) => setTrackFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 mb-4"
            >
              <option value="">All Tracks</option>
              <option value="0">Root (0)</option>
              <option value="32">Root Cancel (32)</option>
              <option value="33">Root Kill (33)</option>
              <option value="11">Treasury Large Spends (11)</option>
              <option value="12">Treasury Medium Spends (12)</option>
              <option value="13">Treasury Small Spends (13)</option>
              <option value="14">Treasury Big Tipper (14)</option>
              <option value="15">Treasury Small Tipper (15)</option>
            </select>
          )}

          <div className="space-y-2 overflow-y-auto flex-grow pr-2">
            {loading ? (
               <div className="text-slate-400 text-sm">Loading...</div>
            ) : referenda.length === 0 ? (
               <div className="text-slate-400 text-sm">No results found.</div>
            ) : (
              referenda.map(r => (
                <div 
                  key={r.id} 
                  className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded cursor-pointer transition-colors text-sm"
                  onClick={() => handleSelectRef(r)}
                >
                  <div className="font-medium text-slate-200">{r.label}</div>
                  {r.kind === 'referendum' && <div className="text-xs text-slate-400 mt-1">{String(r.data.status)}</div>}
                </div>
              ))
            )}
          </div>
          
          {dbUpdated && (
            <div className="mt-4 text-[10px] text-slate-500 border-t border-slate-700 pt-3 text-center">
              DB Updated: {dbUpdated}
            </div>
          )}
        </div>
        
        {/* Graph Canvas */}
        <div className="flex-grow relative h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-slate-900"
          >
            <Background color="#334155" gap={16} />
            <Controls className="bg-slate-800 border-slate-700 fill-slate-300" />
            {renderedCenterId?.startsWith('box:') && breadcrumbs.length > 1 && (
              <button
                onClick={() => handleSelectRef(breadcrumbs[breadcrumbs.length - 2])}
                style={{
                  position: 'absolute', top: 20, right: 20, zIndex: 100,
                  background: '#ef4444', color: 'white', padding: '10px 20px',
                  borderRadius: '6px', border: 'none', cursor: 'pointer',
                  fontWeight: 'bold', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              >
                ← Exit Box
              </button>
            )}
          </ReactFlow>
        </div>

        {/* Right Panel */}
        {selectedNode && (
          <div className="w-80 flex-none bg-slate-800/80 border-l border-slate-700 p-4 backdrop-blur-sm z-10 shadow-lg flex flex-col h-full">
            <div className="flex justify-between items-center border-b border-slate-600 pb-2 mb-4">
               <h2 className="text-lg font-semibold text-slate-200">
                 Selected Node
               </h2>
               {selectedNode.alreadyVisited && (
                 <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">Visited</span>
               )}
            </div>
            
            <div className="overflow-y-auto flex-grow pr-2">
              <div className="text-sm font-medium text-blue-300 mb-2">{selectedNode.label}</div>
              <div className="text-xs text-slate-400 uppercase mb-4">{selectedNode.kind}</div>
              
              {selectedNode.kind === 'preimage' && Boolean(selectedNode.data.decoded_pallet) && (
                <div className="mb-4 bg-slate-700/30 p-3 rounded-lg border border-slate-600/50">
                  <div className="text-xs text-slate-400 mb-1">Call</div>
                  <div className="font-mono text-sm text-emerald-400 mb-2">
                    {String(selectedNode.data.decoded_pallet)}.{String(selectedNode.data.decoded_method)}
                  </div>
                  {Boolean(selectedNode.data.amount) && (
                    <>
                      <div className="text-xs text-slate-400 mb-1 mt-3">Treasury Spend</div>
                      <div className="text-sm text-slate-200">{String(selectedNode.data.amount)} planck</div>
                    </>
                  )}
                </div>
              )}

              {selectedNode.kind === 'cluster' ? (
                <div className="mt-4">
                  <div className="text-sm text-slate-300 mb-2">Cluster Details ({clusterMembers.length} displayed)</div>
                  <div className="space-y-2">
                    {clusterMembers.map(m => (
                      <div key={m.id} className="text-xs bg-slate-900 p-2 rounded cursor-pointer hover:bg-slate-700" onClick={() => handleSelectRef(m)}>
                        <div className="text-emerald-400">{m.label}</div>
                        <div className="text-slate-500 mt-1">{String(m.data.effective_weight)} weight</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <pre className="text-xs text-slate-400 overflow-x-auto p-3 bg-slate-900 rounded-lg whitespace-pre-wrap">
                  {JSON.stringify(selectedNode.data, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Polkassembly Modal */}
        {modalOpen && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center p-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-slate-200">{modalTitle}</h3>
                <button 
                  onClick={() => setModalOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-grow">
                {modalLoading ? (
                  <div className="flex justify-center items-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none">
                    {/* Render plain text for now, could use a markdown parser later */}
                    <div className="whitespace-pre-wrap text-slate-300">
                      {modalContent}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowApp />
    </ReactFlowProvider>
  );
}
