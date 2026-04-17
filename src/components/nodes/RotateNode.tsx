import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { RotateCw } from "lucide-react";
import type { NodeComponentProps } from "./types";

type RotateNodeData = {
  mode?: "random" | "manual";
  x?: number;
  y?: number;
  z?: number;
};

export function RotateNode({ id, data }: NodeComponentProps<RotateNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof RotateNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  const mode = data.mode || "random";

  return (
    <div className="bg-card w-[240px] shadow-lg rounded-xl border border-rose-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-rose-500/10 p-3 border-b border-border flex items-center gap-2">
        <RotateCw className="w-4 h-4 text-rose-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Rotate</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Mode</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={mode}
            onChange={(e) => handleChange("mode", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="random">Random</option>
            <option value="manual">Manual Angles</option>
          </select>
        </div>

        {mode === "manual" && (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block text-center mb-1">X</label>
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                value={data.x || 0}
                onChange={(e) => handleChange("x", parseFloat(e.target.value) || 0)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block text-center mb-1">Y</label>
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                value={data.y || 0}
                onChange={(e) => handleChange("y", parseFloat(e.target.value) || 0)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block text-center mb-1">Z</label>
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                value={data.z || 0}
                onChange={(e) => handleChange("z", parseFloat(e.target.value) || 0)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
