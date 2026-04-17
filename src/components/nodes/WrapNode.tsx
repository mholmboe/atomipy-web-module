import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Maximize } from "lucide-react";
import type { NodeComponentProps } from "./types";

export function WrapNode({ id: _id, data: _data }: NodeComponentProps<Record<string, never>>) {
  return (
    <div className="bg-card w-[200px] shadow-lg rounded-xl border border-purple-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />
      
      <div className="bg-purple-500/10 p-3 border-b border-border flex items-center gap-2">
        <Maximize className="w-4 h-4 text-purple-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Wrap Coordinates</h3>
      </div>
      
      <div className="p-4 bg-background text-xs text-muted-foreground italic">
        Applies ap.wrap() to ensure all atoms are within the simulation box.
      </div>
      
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
