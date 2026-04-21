import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { LayoutGrid } from "lucide-react";
import type { NodeComponentProps } from "./types";

type GridNodeData = {
  atomType?: string;
  density?: number;
  xlo?: number;
  ylo?: number;
  zlo?: number;
  xhi?: number;
  yhi?: number;
  zhi?: number;
};

export function GridNode({ id, data }: NodeComponentProps<GridNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof GridNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[260px] shadow-lg rounded-xl border border-indigo-500/50 overflow-hidden font-sans select-none">
      <div className="bg-indigo-500/10 p-3 border-b border-border flex items-center gap-2">
        <LayoutGrid className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Create Grid</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Atom Type</label>
            <input
              type="text"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
              value={data.atomType || "Na"}
              onChange={(e) => handleChange("atomType", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Density (M)</label>
            <input
              type="number"
              step="0.01"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
              value={data.density || 0.1}
              onChange={(e) => handleChange("density", parseFloat(e.target.value) || 0.1)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Limits (Å)</div>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            className="nodrag w-full text-center text-[10px] bg-muted border border-border rounded-md py-1"
            placeholder="xlo"
            value={data.xlo ?? 0}
            onChange={(e) => handleChange("xlo", parseFloat(e.target.value) || 0)}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <input
            type="number"
            className="nodrag w-full text-center text-[10px] bg-muted border border-border rounded-md py-1"
            placeholder="ylo"
            value={data.ylo ?? 0}
            onChange={(e) => handleChange("ylo", parseFloat(e.target.value) || 0)}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <input
            type="number"
            className="nodrag w-full text-center text-[10px] bg-muted border border-border rounded-md py-1"
            placeholder="zlo"
            value={data.zlo ?? 0}
            onChange={(e) => handleChange("zlo", parseFloat(e.target.value) || 0)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            className="nodrag w-full text-center text-[10px] bg-muted border border-border rounded-md py-1"
            placeholder="xhi"
            value={data.xhi ?? 10}
            onChange={(e) => handleChange("xhi", parseFloat(e.target.value) || 10)}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <input
            type="number"
            className="nodrag w-full text-center text-[10px] bg-muted border border-border rounded-md py-1"
            placeholder="yhi"
            value={data.yhi ?? 10}
            onChange={(e) => handleChange("yhi", parseFloat(e.target.value) || 10)}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <input
            type="number"
            className="nodrag w-full text-center text-[10px] bg-muted border border-border rounded-md py-1"
            placeholder="zhi"
            value={data.zhi ?? 10}
            onChange={(e) => handleChange("zhi", parseFloat(e.target.value) || 10)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
