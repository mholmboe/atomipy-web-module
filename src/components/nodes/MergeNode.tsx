import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { GitMerge, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type MergeNodeData = {
  typeMode?: "molid" | "index";
  minDistance?: number;
  minDistanceSmall?: number;
  atomLabels?: string;
};

export function MergeNode({ id, data }: NodeComponentProps<MergeNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof MergeNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  const handleOptionalNumber = (field: keyof MergeNodeData, value: string) => {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) {
      updateNodeData(id, { ...data, [field]: parsed });
    } else {
      updateNodeData(id, { ...data, [field]: undefined });
    }
  };

  return (
    <div className="bg-card w-[280px] shadow-lg rounded-xl border border-teal-500/50 overflow-hidden font-sans select-none">
      <NodeHeader id={id} title="Merge (Overlap Filter)" Icon={GitMerge} colorClass="text-orange-500" className="bg-orange-500/10" />

      <div className="p-4 space-y-3 bg-background relative min-h-[120px]">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Type Mode</label>
            <select
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
              value={data.typeMode || "molid"}
              onChange={(e) => handleChange("typeMode", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="molid">molid</option>
              <option value="index">index</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Default Dist (Å)</label>
            <input
              type="number"
              step="0.1"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
              value={data.minDistance || 2.0}
              onChange={(e) => handleChange("minDistance", parseFloat(e.target.value) || 2.0)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Lower Dist (Å) for labels</label>
          <input
            type="number"
            step="0.1"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={data.minDistanceSmall ?? ""}
            placeholder="optional"
            onChange={(e) => handleOptionalNumber("minDistanceSmall", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Atom labels for lower cutoff (optional)</label>
          <input
            type="text"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            placeholder="e.g. HW1;HW2"
            value={data.atomLabels || ""}
            onChange={(e) => handleChange("atomLabels", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>

        <div className="text-[10px] text-muted-foreground italic text-center">
          Removes overlapping atoms/molecules from input B before merging into input A.
        </div>
      </div>

      <Handle type="target" position={Position.Left} id="inA" style={{ top: '35%' }} className="w-3 h-3 bg-teal-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="inB" style={{ top: '65%' }} className="w-3 h-3 bg-teal-600 -left-1.5 border-2 border-background" />
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
