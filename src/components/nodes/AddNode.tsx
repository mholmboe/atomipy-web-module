import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Combine, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

export function AddNode({ id, data: _data }: NodeComponentProps<Record<string, never>>) {
  return (
    <div className="bg-card w-[220px] shadow-lg rounded-xl border border-green-500/50 overflow-hidden font-sans select-none">
      <NodeHeader id={id} title="Join Systems" Icon={Combine} colorClass="text-pink-500" className="bg-pink-500/10" />

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
