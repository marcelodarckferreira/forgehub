import { useEffect, useRef } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { Toolbar } from "markmap-toolbar";
import "markmap-toolbar/dist/style.css";

const transformer = new Transformer();

const FENCE_RE = /^\s*```/;
const HEADING_RE = /^#{1,6}\s+\S/;

/** Reduce a doc to just its heading outline before mapping it. markmap
 * happily maps full markdown (headings + every nested list item), but
 * that turns a 40-heading doc into 150+ nodes and crushes the auto-fit
 * scale to near zero. NotebookLM-style mind maps show top-level
 * structure, not every bullet -- headings-only matches that and keeps
 * the initial view legible. */
function extractHeadings(markdown: string): string {
  const lines: string[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (HEADING_RE.test(line)) lines.push(line);
  }
  return lines.join("\n");
}

/** NotebookLM-style mind map: the doc's heading outline as a collapsible,
 * zoomable radial tree -- unlike GraphView's vault-wide [[wikilink]]
 * network, this is scoped to one document's structure. */
export function MindMapView({ markdown }: { markdown: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const mmRef = useRef<Markmap | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const { root } = transformer.transform(extractHeadings(markdown));
    const mm = Markmap.create(svgRef.current, { duration: 200, maxWidth: 280 }, root);
    mmRef.current = mm;

    if (toolbarRef.current) {
      toolbarRef.current.innerHTML = "";
      const toolbar = Toolbar.create(mm);
      toolbar.el.style.position = "absolute";
      toolbar.el.style.bottom = "0";
      toolbar.el.style.left = "0";
      toolbarRef.current.append(toolbar.el);
    }

    return () => {
      mm.destroy();
      mmRef.current = null;
    };
  }, [markdown]);

  return (
    <div className="relative h-full w-full">
      <svg ref={svgRef} className="h-full w-full" />
      <div ref={toolbarRef} className="absolute bottom-3 left-3" />
    </div>
  );
}
