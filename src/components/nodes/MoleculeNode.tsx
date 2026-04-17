import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Fingerprint } from "lucide-react";
import type { NodeComponentProps } from "./types";

type MoleculeNodeData = {
  molid?: number;
  resname?: string;
};

export function MoleculeNode({ id, data }: NodeComponentProps<MoleculeNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof MoleculeNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[240px] shadow-lg rounded-xl border border-cyan-600/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-cyan-600/10 p-3 border-b border-border flex items-center gap-2">
        <Fingerprint className="w-4 h-4 text-cyan-600" />
        <h3 className="text-sm font-semibold text-foreground m-0">Set Molecule ID</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Molecule ID</label>
          <input
            type="number"
            min="1"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={data.molid || 1}
            onChange={(e) => handleChange("molid", parseInt(e.target.value) || 1)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Resname (optional)</label>
          <input
            type="text"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            placeholder="Keep existing"
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
