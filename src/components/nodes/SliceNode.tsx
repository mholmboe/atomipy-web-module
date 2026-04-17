import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Scissors } from "lucide-react";
import type { NodeComponentProps } from "./types";

type SliceNodeData = {
  xlo?: number;
  ylo?: number;
  zlo?: number;
  xhi?: number;
  yhi?: number;
  zhi?: number;
  removePartial?: boolean;
};

export function SliceNode({ id, data }: NodeComponentProps<SliceNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof SliceNodeData, value: string | number | boolean) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  const handleOptionalNumber = (field: keyof SliceNodeData, value: string) => {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) {
      handleChange(field, parsed);
    } else {
      updateNodeData(id, { ...data, [field]: undefined });
    }
  };

  return (
    <div className="bg-card w-[280px] shadow-lg rounded-xl border border-amber-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-amber-500/10 p-3 border-b border-border flex items-center gap-2">
        <Scissors className="w-4 h-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-foreground m-0">Slice Region</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">xlo</label>
            <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" value={data.xlo ?? 0} onChange={(e) => handleChange("xlo", parseFloat(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">ylo</label>
            <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" value={data.ylo ?? 0} onChange={(e) => handleChange("ylo", parseFloat(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">zlo</label>
            <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" value={data.zlo ?? 0} onChange={(e) => handleChange("zlo", parseFloat(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">xhi</label>
            <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" value={data.xhi ?? ""} placeholder="box x" onChange={(e) => handleOptionalNumber("xhi", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">yhi</label>
            <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" value={data.yhi ?? ""} placeholder="box y" onChange={(e) => handleOptionalNumber("yhi", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">zhi</label>
            <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" value={data.zhi ?? ""} placeholder="box z" onChange={(e) => handleOptionalNumber("zhi", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
          </div>
        </div>

        <label className="nodrag flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={data.removePartial ?? true}
            onChange={(e) => handleChange("removePartial", e.target.checked)}
            onPointerDown={(e) => e.stopPropagation()}
          />
          Remove partial molecules
        </label>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
