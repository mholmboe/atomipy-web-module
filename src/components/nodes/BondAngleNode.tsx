import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Waypoints } from "lucide-react";
import type { NodeComponentProps } from "./types";

type BondAngleNodeData = {
  rmaxH?: number;
  rmaxM?: number;
  sameElementBonds?: boolean;
  sameMoleculeOnly?: boolean;
  neighborElement?: string;
  dmMethod?: "auto" | "direct" | "sparse" | "fast_cl";
  calcBonds?: boolean;
  calcAngles?: boolean;
  calcDihedrals?: boolean;
  logFile?: string;
};

export function BondAngleNode({ id, data }: NodeComponentProps<BondAngleNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof BondAngleNodeData, value: string | number | boolean) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[270px] shadow-lg rounded-xl border border-emerald-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-emerald-500/10 p-3 border-b border-border flex items-center gap-2">
        <Waypoints className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Bonded Terms</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div className="grid grid-cols-3 gap-2">
          <label className="nodrag flex items-center justify-center gap-1 text-xs text-muted-foreground border border-border rounded-md py-1 bg-muted/30">
            <input
              type="checkbox"
              className="nodrag"
              checked={data.calcBonds ?? true}
              onChange={(e) => handleChange("calcBonds", e.target.checked)}
              onPointerDown={(e) => e.stopPropagation()}
            />
            Bonds
          </label>
          <label className="nodrag flex items-center justify-center gap-1 text-xs text-muted-foreground border border-border rounded-md py-1 bg-muted/30">
            <input
              type="checkbox"
              className="nodrag"
              checked={data.calcAngles ?? true}
              onChange={(e) => handleChange("calcAngles", e.target.checked)}
              onPointerDown={(e) => e.stopPropagation()}
            />
            Angles
          </label>
          <label className="nodrag flex items-center justify-center gap-1 text-xs text-muted-foreground border border-border rounded-md py-1 bg-muted/30">
            <input
              type="checkbox"
              className="nodrag"
              checked={data.calcDihedrals || false}
              onChange={(e) => handleChange("calcDihedrals", e.target.checked)}
              onPointerDown={(e) => e.stopPropagation()}
            />
            Dihedrals
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">rmaxH (Å)</label>
            <input
              type="number"
              step="0.05"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
              value={data.rmaxH || 1.2}
              onChange={(e) => handleChange("rmaxH", parseFloat(e.target.value) || 1.2)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">rmaxM (Å)</label>
            <input
              type="number"
              step="0.05"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
              value={data.rmaxM || 2.45}
              onChange={(e) => handleChange("rmaxM", parseFloat(e.target.value) || 2.45)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
          Same-element bonds
          <input
            type="checkbox"
            className="nodrag"
            checked={data.sameElementBonds || false}
            onChange={(e) => handleChange("sameElementBonds", e.target.checked)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </label>

        <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
          Same-molecule only
          <input
            type="checkbox"
            className="nodrag"
            checked={data.sameMoleculeOnly ?? true}
            onChange={(e) => handleChange("sameMoleculeOnly", e.target.checked)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Neighbor element</label>
            <input
              type="text"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
              placeholder="optional, e.g. O"
              value={data.neighborElement || ""}
              onChange={(e) => handleChange("neighborElement", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Distance method</label>
            <select
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
              value={data.dmMethod || "auto"}
              onChange={(e) => handleChange("dmMethod", e.target.value as BondAngleNodeData["dmMethod"])}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="auto">Auto</option>
              <option value="direct">Direct</option>
              <option value="sparse">Sparse</option>
              <option value="fast_cl">Fast Cell List</option>
            </select>
          </div>
        </div>
        {(data.calcDihedrals || false) && data.dmMethod && data.dmMethod !== "auto" && (
          <p className="text-[10px] text-muted-foreground">
            Distance method is currently applied to bond/angle mode; dihedral mode uses the default internal strategy.
          </p>
        )}

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Terms log file</label>
          <input
            type="text"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            value={data.logFile || "bonded_terms.log"}
            onChange={(e) => handleChange("logFile", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
