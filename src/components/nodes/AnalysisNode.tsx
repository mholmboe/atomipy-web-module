import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import type { NodeComponentProps } from "./types";

type AnalysisNodeData = {
  mode?: "unwrap" | "rdf" | "cn" | "closest";
  atomTypeA?: string;
  atomTypeB?: string;
  cutoff?: number;
  rmax?: number;
};

export function AnalysisNode({ id, data }: NodeComponentProps<AnalysisNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = data.mode || "unwrap";

  const handleChange = (field: keyof AnalysisNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[260px] shadow-lg rounded-xl border border-fuchsia-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-fuchsia-500/10 p-3 border-b border-border flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-fuchsia-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Structure Analysis</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Analysis Mode</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={mode}
            onChange={(e) => handleChange("mode", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="unwrap">Unwrap Molecules</option>
            <option value="rdf">Radial Distribution (RDF)</option>
            <option value="cn">Coordination Number</option>
            <option value="closest">Find Closest Atom</option>
          </select>
        </div>

        {mode === "unwrap" && (
          <p className="text-[10px] text-muted-foreground">
            Fixes molecules that are split across periodic boundaries.
          </p>
        )}

        {(mode === "rdf" || mode === "cn") && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Type A</label>
                <input
                  type="text"
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={data.atomTypeA || "Na"}
                  onChange={(e) => handleChange("atomTypeA", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              {mode === "rdf" && (
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Type B</label>
                  <input
                    type="text"
                    className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                    value={data.atomTypeB || "Cl"}
                    onChange={(e) => handleChange("atomTypeB", e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">
                {mode === "rdf" ? "R-max (Å)" : "Cutoff (Å)"}
              </label>
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                value={mode === "rdf" ? data.rmax || 12.0 : data.cutoff || 3.5}
                onChange={(e) => handleChange(mode === "rdf" ? "rmax" : "cutoff", parseFloat(e.target.value) || 3.5)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {mode === "closest" && (
          <p className="text-[10px] text-muted-foreground italic">
            Calculates distance to the nearest neighbor for all selected atoms.
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
