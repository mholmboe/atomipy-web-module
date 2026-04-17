import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Scaling } from "lucide-react";
import type { NodeComponentProps } from "./types";

type ScaleNodeData = {
  sx?: number;
  sy?: number;
  sz?: number;
  resname?: string;
};

export function ScaleNode({ id, data }: NodeComponentProps<ScaleNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof ScaleNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[250px] shadow-lg rounded-xl border border-lime-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-lime-500/10 p-3 border-b border-border flex items-center gap-2">
        <Scaling className="w-4 h-4 text-lime-600" />
        <h3 className="text-sm font-semibold text-foreground m-0">Scale</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">SX</label>
            <input
              type="number"
              step="0.01"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              value={data.sx || 1.0}
              onChange={(e) => handleChange("sx", parseFloat(e.target.value) || 1.0)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">SY</label>
            <input
              type="number"
              step="0.01"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              value={data.sy || 1.0}
              onChange={(e) => handleChange("sy", parseFloat(e.target.value) || 1.0)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">SZ</label>
            <input
              type="number"
              step="0.01"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              value={data.sz || 1.0}
              onChange={(e) => handleChange("sz", parseFloat(e.target.value) || 1.0)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Only Resname (optional)</label>
          <input
            type="text"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            placeholder="e.g. SOL"
            value={data.resname || ""}
            onChange={(e) => handleChange("resname", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
