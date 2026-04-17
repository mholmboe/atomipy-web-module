import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Tag } from "lucide-react";
import type { NodeComponentProps } from "./types";

type ResnameNodeData = {
  defaultResname?: string;
};

export function ResnameNode({ id, data }: NodeComponentProps<ResnameNodeData>) {
  const { updateNodeData } = useReactFlow();

  return (
    <div className="bg-card w-[240px] shadow-lg rounded-xl border border-emerald-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-emerald-500/10 p-3 border-b border-border flex items-center gap-2">
        <Tag className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Assign Resname</h3>
      </div>

      <div className="p-4 bg-background">
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Default Resname</label>
        <input
          type="text"
          className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
          value={data.defaultResname || "MIN"}
          onChange={(e) => updateNodeData(id, { ...data, defaultResname: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
