import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Combine, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

export function AddNode({ id, data: _data }: NodeComponentProps<Record<string, never>>) {
  return (
    <div className="bg-card w-[220px] shadow-lg rounded-xl border border-emerald-500/50 overflow-hidden font-sans select-none">
      <NodeHeader id={id} title="Join Branches" Icon={Combine} colorClass="text-emerald-500" className="bg-emerald-500/10" />

      <div className="p-4 space-y-2 bg-background relative min-h-[140px] flex items-center justify-center">
        <div className="text-xs text-muted-foreground italic text-center">
          Joins multiple branches (1-6) into a single system using ap.update().
        </div>
      </div>

      <Handle type="target" position={Position.Left} id="in1" style={{ top: '15%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="in2" style={{ top: '30%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="in3" style={{ top: '45%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="in4" style={{ top: '60%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="in5" style={{ top: '75%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="in6" style={{ top: '90%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
