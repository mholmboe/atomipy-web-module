import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Orbit } from "lucide-react";
import type { NodeComponentProps } from "./types";

type BendNodeData = {
  radius?: number;
};

export function BendNode({ id, data }: NodeComponentProps<BendNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof BendNodeData, value: number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[240px] shadow-lg rounded-xl border border-orange-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-orange-500/10 p-3 border-b border-border flex items-center gap-2">
        <Orbit className="w-4 h-4 text-orange-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Bend System</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Curvature Radius (Å)</label>
          <input
            type="number"
            step="1"
            min="1"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
            value={data.radius || 50}
            onChange={(e) => handleChange("radius", parseFloat(e.target.value) || 50)}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Transforms the structure into a cylindrical geometry.
          </p>
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
