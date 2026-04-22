import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Combine, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

export function AddNode({ id, data: _data }: NodeComponentProps<Record<string, never>>) {
  return (
    <div className="bg-card w-[220px] shadow-lg rounded-xl border border-emerald-500/50 overflow-hidden font-sans select-none">
      <NodeHeader id={id} title="Join Branches" Icon={Combine} colorClass="text-emerald-500" className="bg-emerald-500/10" />

      <div className="p-4 space-y-2 bg-background relative min-h-[80px] flex items-center justify-center">
        <div className="text-xs text-muted-foreground italic text-center">
          Combines A and B directly with ap.update(A, B).
        </div>
      </div>

      <Handle type="target" position={Position.Left} id="inA" style={{ top: '35%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="inB" style={{ top: '65%' }} className="w-3 h-3 bg-emerald-600 -left-1.5 border-2 border-background" />
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
