import { forceSimulation, forceLink, forceManyBody, forceCollide, forceCenter } from 'd3-force';
import { Node, Edge } from 'reactflow';

export const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const d3Nodes = nodes.map((n) => ({ 
    ...n, 
    x: n.position.x === 0 ? (Math.random() - 0.5) * 50 : n.position.x, 
    y: n.position.y === 0 ? (Math.random() - 0.5) * 50 : n.position.y,
    // Add collision radius dynamically based on node data if provided
    radius: (n.data as any)?.radius || 80
  }));
  
  const d3Edges = edges.map((e) => ({ ...e, source: e.source, target: e.target }));

  const simulation = forceSimulation(d3Nodes as any)
    .force(
      'link',
      forceLink(d3Edges)
        .id((d: any) => d.id)
        .distance((d: any) => d.target.id.startsWith('cluster:') ? 150 : 120) 
    )
    .force('charge', forceManyBody().strength(d3Nodes.length > 30 ? -150 : -1000)) 
    .force('collide', forceCollide().radius((d: any) => d.radius)) 
    .force('center', forceCenter(0, 0))
    .stop();

  for (let i = 0; i < 300; ++i) {
    simulation.tick();
  }

  const layoutedNodes = nodes.map((node, i) => {
    const d3n = d3Nodes[i] as any;
    return {
      ...node,
      position: {
        x: d3n.x - (d3n.radius * 1.1), // Offset to top-left anchor approximately
        y: d3n.y - 30,
      }
    };
  });

  return { nodes: layoutedNodes, edges };
};
