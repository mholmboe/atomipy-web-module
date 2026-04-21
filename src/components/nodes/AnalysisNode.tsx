import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { BarChart3 } from "lucide-react";
import type { NodeComponentProps } from "./types";

type AnalysisMode = "unwrap" | "rdf" | "cn" | "closest" | "bvs" | "stats";

type AnalysisNodeData = {
  mode?: AnalysisMode;
  atomTypeA?: string;
  atomTypeB?: string;
  cutoff?: number;
  rmax?: number;
  // BVS
  topN?: number;
  bvsLogFile?: string;
  writeCsv?: boolean;
  csvFile?: string;
  // Stats
  statsLogFile?: string;
};

export function AnalysisNode({ id, data }: NodeComponentProps<AnalysisNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = (data.mode ?? "unwrap") as AnalysisMode;

  const set = (field: keyof AnalysisNodeData, value: string | number | boolean) =>
    updateNodeData(id, { ...data, [field]: value });

  const inputCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1";

  return (
    <div className="bg-card w-[270px] shadow-lg rounded-xl border border-fuchsia-500/50 overflow-hidden font-sans select-none">
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
            onChange={(e) => set("mode", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="unwrap">Unwrap Molecules</option>
            <option value="rdf">Radial Distribution (RDF)</option>
            <option value="cn">Coordination Number</option>
            <option value="closest">Find Closest Atom</option>
            <option value="bvs">Bond Valence Sum (BVS)</option>
            <option value="stats">Structure Stats</option>
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
                <input type="text" className={inputCls}
                  value={data.atomTypeA ?? "Na"}
                  onChange={(e) => set("atomTypeA", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()} />
              </div>
              {mode === "rdf" && (
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Type B</label>
                  <input type="text" className={inputCls}
                    value={data.atomTypeB ?? "Cl"}
                    onChange={(e) => set("atomTypeB", e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()} />
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">
                {mode === "rdf" ? "R-max (Å)" : "Cutoff (Å)"}
              </label>
              <input type="number" step="0.1" className={inputCls}
                value={mode === "rdf" ? (data.rmax ?? 12.0) : (data.cutoff ?? 3.5)}
                onChange={(e) => set(mode === "rdf" ? "rmax" : "cutoff", parseFloat(e.target.value) || 3.5)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
          </div>
        )}

        {mode === "closest" && (
          <p className="text-[10px] text-muted-foreground italic">
            Calculates distance to the nearest neighbor for all selected atoms.
          </p>
        )}

        {mode === "bvs" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Top-N worst atoms</label>
              <input type="number" min="1" className={inputCls}
                value={data.topN ?? 10}
                onChange={(e) => set("topN", parseInt(e.target.value) || 10)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Log file</label>
              <input type="text" className={inputCls}
                value={data.bvsLogFile ?? "bvs_summary.log"}
                onChange={(e) => set("bvsLogFile", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Write detailed CSV
              <input type="checkbox" className="nodrag"
                checked={data.writeCsv ?? true}
                onChange={(e) => set("writeCsv", e.target.checked)}
                onPointerDown={(e) => e.stopPropagation()} />
            </label>
            {(data.writeCsv ?? true) && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">CSV file</label>
                <input type="text" className={inputCls}
                  value={data.csvFile ?? "bvs_results.csv"}
                  onChange={(e) => set("csvFile", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()} />
              </div>
            )}
          </>
        )}

        {mode === "stats" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Log filename</label>
            <input type="text" className={inputCls}
              value={data.statsLogFile ?? "output.log"}
              onChange={(e) => set("statsLogFile", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()} />
            <p className="text-[10px] text-muted-foreground mt-1">Auto-calculates coordination and atom counts.</p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
