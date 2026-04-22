import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Droplets, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type AddHNodeData = {
  deltaThreshold?: number;
  maxAdditions?: number;
};

export function AddHNode({ id, data }: NodeComponentProps<AddHNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof AddHNodeData, value: number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[240px] shadow-lg rounded-xl border border-blue-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Add Hydrogens" Icon={Droplets} colorClass="text-blue-500" className="bg-blue-500/10" />

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">BVS Delta Threshold</label>
          <input
            type="number"
            step="0.05"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={data.deltaThreshold || -0.5}
            onChange={(e) => handleChange("deltaThreshold", parseFloat(e.target.value) || -0.5)}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <p className="text-[10px] text-muted-foreground mt-1">Sites with BVS delta below this get an H</p>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Max Additions</label>
          <input
            type="number"
            min="0"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={data.maxAdditions === undefined ? 10 : data.maxAdditions}
            onChange={(e) => handleChange("maxAdditions", parseInt(e.target.value) || 0)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
