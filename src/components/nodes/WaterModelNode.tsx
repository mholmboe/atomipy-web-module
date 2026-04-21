import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Droplet } from "lucide-react";
import type { NodeComponentProps } from "./types";

type WaterModelNodeData = {
  conversion?: "spc2tip4p" | "tip3p2tip4p";
  omDist?: number;
};

export function WaterModelNode({ id, data }: NodeComponentProps<WaterModelNodeData>) {
  const { updateNodeData } = useReactFlow();
  const conversion = data.conversion || "spc2tip4p";

  const handleChange = (field: keyof WaterModelNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[240px] shadow-lg rounded-xl border border-sky-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-sky-500/10 p-3 border-b border-border flex items-center gap-2">
        <Droplet className="w-4 h-4 text-sky-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Water Model Converter</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Conversion</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={conversion}
            onChange={(e) => handleChange("conversion", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="spc2tip4p">SPC/E to TIP4P</option>
            <option value="tip3p2tip4p">TIP3P to TIP4P</option>
          </select>
        </div>

        {conversion === "spc2tip4p" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">OM Distance (Å)</label>
            <input
              type="number"
              step="0.01"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={data.omDist || 0.15}
              onChange={(e) => handleChange("omDist", parseFloat(e.target.value) || 0.15)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
