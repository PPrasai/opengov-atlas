import React, { useEffect, useState, useCallback } from 'react';
import ReactFlow, { Background, Controls, Node, Edge, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';
import { dal } from './dal';
import { GraphNode } from './types';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  const [referenda, setReferenda] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<GraphNode[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await dal.referendaPage({ offset: 0, limit: 20 });
        setReferenda(res.rows);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSelectRef = useCallback(async (ref: GraphNode, isBack: boolean = false) => {
    try {
      setSelectedNode(ref);
      if (!isBack) {
        setBreadcrumbs(prev => [...prev, ref]);
      }
      
      const hood = await dal.neighbours(ref.id);
      
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      
      newNodes.push({
        id: hood.center.id,
        position: { x: 400, y: 300 },
        data: { label: hood.center.label },
        type: 'default'
      });
      
      const radius = 250;
      hood.nodes.forEach((n, i) => {
        const angle = (i / hood.nodes.length) * 2 * Math.PI;
        newNodes.push({
          id: n.id,
          position: { 
            x: 400 + radius * Math.cos(angle), 
            y: 300 + radius * Math.sin(angle) 
          },
          data: { label: n.label, nodeData: n },
        });
      });
      
      if (hood.cluster) {
        newNodes.push({
          id: `cluster:${hood.cluster.pollIndex}`,
          position: { x: 400, y: 600 },
          data: { label: `+${hood.cluster.remainderCount} others` }
        });
        newEdges.push({
          id: `e-cluster-${hood.cluster.pollIndex}`,
          source: `cluster:${hood.cluster.pollIndex}`,
          target: hood.center.id,
          label: 'votes'
        });
      }

      hood.edges.forEach(e => {
        newEdges.push({
          id: `e-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          label: e.relation
        });
      });

      setNodes(newNodes);
      setEdges(newEdges);
      
    } catch (e) {
      console.error(e);
    }
  }, [setNodes, setEdges]);

  const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.data.nodeData) {
       handleSelectRef(node.data.nodeData);
    }
  }, [handleSelectRef]);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const target = breadcrumbs[index];
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    handleSelectRef(target, true);
  }, [breadcrumbs, handleSelectRef]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 text-white">
      <header className="flex-none p-4 bg-slate-800 border-b border-slate-700 shadow-md flex items-center justify-between">
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
      
      <main className="flex-grow flex relative">
        <div className="w-80 flex-none bg-slate-800/80 border-r border-slate-700 p-4 backdrop-blur-sm z-10 shadow-lg overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4 text-slate-200">Recent Referenda</h2>
          {loading ? (
             <div className="text-slate-400">Loading...</div>
          ) : (
            <div className="space-y-2">
              {referenda.map(r => (
                <div 
                  key={r.id} 
                  className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded cursor-pointer transition-colors"
                  onClick={() => handleSelectRef(r)}
                >
                  <div className="font-medium text-slate-200">{r.label}</div>
                  <div className="text-xs text-slate-400 mt-1">{String(r.data.status)}</div>
                </div>
              ))}
            </div>
          )}
          
          {selectedNode && (
            <div className="mt-8">
               <h3 className="text-md font-semibold text-slate-300 border-b border-slate-600 pb-2 mb-2">Selected Node</h3>
               <pre className="text-xs text-slate-400 overflow-x-auto p-2 bg-slate-900 rounded">
                 {JSON.stringify(selectedNode.data, null, 2)}
               </pre>
            </div>
          )}
        </div>
        
        <div className="flex-grow relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            fitView
            className="bg-slate-900"
          >
            <Background color="#334155" gap={16} />
            <Controls className="bg-slate-800 border-slate-700 fill-slate-300" />
          </ReactFlow>
        </div>
      </main>
    </div>
  );
}
