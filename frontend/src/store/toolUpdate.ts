import { create } from "zustand";
import type { MonitoredTool } from "@/hooks/useToolVersions";

export interface ToolUpdateOutput {
  tool: MonitoredTool;
  output: string;
  error: string | null;
}

interface ToolUpdateState {
  updatingTool: MonitoredTool | null;
  expandedTool: MonitoredTool | null;
  lastUpdateOutput: ToolUpdateOutput | null;
  startUpdate: (tool: MonitoredTool) => void;
  finishUpdate: (result: ToolUpdateOutput) => void;
  failUpdate: (tool: MonitoredTool, error: string) => void;
  setExpandedTool: (tool: MonitoredTool | null) => void;
}

export const useToolUpdateStore = create<ToolUpdateState>((set) => ({
  updatingTool: null,
  expandedTool: null,
  lastUpdateOutput: null,
  startUpdate: (tool) => set({ updatingTool: tool, lastUpdateOutput: null }),
  finishUpdate: (result) =>
    set({ updatingTool: null, lastUpdateOutput: result, expandedTool: result.tool }),
  failUpdate: (tool, error) =>
    set({ updatingTool: null, lastUpdateOutput: { tool, output: "", error }, expandedTool: tool }),
  setExpandedTool: (tool) => set({ expandedTool: tool }),
}));
