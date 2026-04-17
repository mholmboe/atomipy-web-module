import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Combine } from "lucide-react";
import type { NodeComponentProps } from "./types";

export function AddNode({ id: _id, data: _data }: NodeComponentProps<Record<string, never>>) {
  return (
    <div className="bg-card w-[220px] shadow-lg rounded-xl border border-green-500/50 overflow-hidden font-sans select-none">
      <div className="bg-green-500/10 p-3 border-b border-border flex items-center gap-2">
        <Combine className="w-4 h-4 text-green-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Join Branches</h3>
      </div>

      <div className="p-4 space-y-2 bg-background relative min-h-[80px] flex items-center justify-center">
        <div className="text-xs text-muted-foreground italic text-center">
          Combines A and B directly with ap.update(A, B).
        </div>

        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-around py-4">
          <Handle type="target" position={Position.Left} id="inA" className="w-3 h-3 bg-green-400 -left-1.5" />
          <Handle type="target" position={Position.Left} id="inB" className="w-3 h-3 bg-green-600 -left-1.5" />
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
