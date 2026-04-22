import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Minimize } from "lucide-react";
import type { NodeComponentProps } from "./types";

type CondenseNodeData = Record<string, never>;

export function CondenseNode(_: NodeComponentProps<CondenseNodeData>) {
  return (
    <div className="bg-card w-[220px] shadow-lg rounded-xl border border-emerald-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-emerald-500/10 p-3 border-b border-border flex items-center gap-2">
        <Minimize className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Condense Box</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Automatically tightens the simulation box to fit the atomic boundaries, removing unnecessary vacuum.
        </p>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
