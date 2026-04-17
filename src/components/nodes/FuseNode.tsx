import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Spline } from "lucide-react";
import type { NodeComponentProps } from "./types";

type FuseNodeData = {
  rmax?: number;
  criteria?: "average" | "occupancy" | "order";
};

export function FuseNode({ id, data }: NodeComponentProps<FuseNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof FuseNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[240px] shadow-lg rounded-xl border border-fuchsia-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-fuchsia-500/10 p-3 border-b border-border flex items-center gap-2">
        <Spline className="w-4 h-4 text-fuchsia-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Fuse Atoms</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Rmax (Å)</label>
          <input
            type="number"
            step="0.05"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={data.rmax || 0.5}
            onChange={(e) => handleChange("rmax", parseFloat(e.target.value) || 0.5)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Criteria</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={data.criteria || "average"}
            onChange={(e) => handleChange("criteria", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="average">Average</option>
            <option value="occupancy">Occupancy</option>
            <option value="order">Order</option>
          </select>
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
