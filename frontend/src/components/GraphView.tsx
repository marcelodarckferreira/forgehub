import { useEffect, useRef } from "react";
import ForceGraph from "force-graph";

export interface GraphNode {
  id: string;
  label: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface DocGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Obsidian-style force-directed graph: notes as nodes, [[wikilinks]] as
 * edges. Renders via the `force-graph` canvas lib (no React wrapper, no
 * three.js -- this is the lightweight 2D-only package). */
export function GraphView({
  graph,
  onSelectNode,
}: {
  graph: DocGraph;
  onSelectNode: (path: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraph | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const fg = new ForceGraph(el)
      .graphData({
        nodes: graph.nodes.map((n) => ({ ...n })),
        links: graph.edges.map((e) => ({ ...e })),
      })
      .nodeId("id")
      .nodeLabel("label")
      .nodeAutoColorBy("id")
      .nodeVal(() => 3)
      .linkColor(() => "rgba(148, 163, 184, 0.35)")
      .backgroundColor("rgba(0,0,0,0)")
      .onNodeClick((node) => onSelectNode(String((node as GraphNode).id)))
      .width(el.clientWidth)
      .height(el.clientHeight);
    fgRef.current = fg;

    const resizeObserver = new ResizeObserver(() => {
      fg.width(el.clientWidth).height(el.clientHeight);
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      fg.pauseAnimation();
      el.replaceChildren();
      fgRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  return <div ref={containerRef} className="h-full w-full" />;
}
