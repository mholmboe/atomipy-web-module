import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Target } from "lucide-react";
import type { NodeComponentProps } from "./types";

type PositionNodeData = {
  mode?: "absolute" | "relative";
  x?: number;
  y?: number;
  z?: number;
  resname?: string;
};

export function PositionNode({ id, data }: NodeComponentProps<PositionNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof PositionNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[240px] shadow-lg rounded-xl border border-orange-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      
      <div className="bg-orange-500/10 p-3 border-b border-border flex items-center gap-2">
        <Target className="w-4 h-4 text-orange-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Position/Translate</h3>
      </div>
      
      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Mode</label>
          <select 
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={data.mode || "absolute"}
            onChange={(e) => handleChange("mode", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="absolute">Absolute (COM)</option>
            <option value="relative">Relative (Translate)</option>
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">X</label>
            <input 
              type="number" step="0.1"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              value={data.x || 0}
              onChange={(e) => handleChange("x", parseFloat(e.target.value) || 0)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">Y</label>
            <input 
              type="number" step="0.1"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              value={data.y || 0}
              onChange={(e) => handleChange("y", parseFloat(e.target.value) || 0)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">Z</label>
            <input 
              type="number" step="0.1"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              value={data.z || 0}
              onChange={(e) => handleChange("z", parseFloat(e.target.value) || 0)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        {(data.mode || "absolute") === "relative" && (
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
        )}
      </div>
      
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
