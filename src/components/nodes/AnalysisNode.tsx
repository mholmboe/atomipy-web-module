import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { BarChart3, ChevronDown, ChevronUp, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type AnalysisMode = "rdf" | "cn" | "closest" | "occupancy" | "bvs" | "stats";
type OutputMode = "none" | "json" | "csv" | "both";
type ClosestReferenceMode = "index" | "coords";

type AnalysisNodeData = {
  mode?: AnalysisMode;
  atomTypeA?: string;
  atomTypeB?: string;
  cutoff?: number;
  rmax?: number;
  dr?: number;
  // Closest
  closestReferenceMode?: ClosestReferenceMode;
  closestRefIndex?: number;
  closestRefX?: number;
  closestRefY?: number;
  closestRefZ?: number;
  closestOutputMode?: OutputMode;
  closestOutputBase?: string;
  // Occupancy
  occupancyRmax?: number;
  occupancyOutputMode?: OutputMode;
  occupancyOutputBase?: string;
  // RDF/CN output
  rdfOutputMode?: OutputMode;
  rdfOutputBase?: string;
  cnOutputMode?: OutputMode;
  cnOutputBase?: string;
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
  const mode = (data.mode ?? "rdf") as AnalysisMode;

  const set = (field: keyof AnalysisNodeData, value: string | number | boolean) =>
    updateNodeData(id, { ...data, [field]: value });

  const inputCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1";
  const selectCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1";

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-fuchsia-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Analysis Ops" Icon={BarChart3} colorClass="text-blue-500" className="bg-blue-500/10" />

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Analysis Mode</label>
          <select
            className={selectCls}
            value={mode}
            onChange={(e) => set("mode", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="rdf">Radial Distribution (RDF)</option>
            <option value="cn">Coordination Number</option>
            <option value="closest">Find Closest Atom</option>
            <option value="occupancy">Site Occupancy</option>
            <option value="bvs">Bond Valence Sum (BVS)</option>
            <option value="stats">Structure Stats</option>
          </select>
        </div>

        {mode === "rdf" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Type A</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.atomTypeA ?? "Na"}
                  onChange={(e) => set("atomTypeA", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Type B</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.atomTypeB ?? "Cl"}
                  onChange={(e) => set("atomTypeB", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">R-max (A)</label>
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  value={data.rmax ?? 12.0}
                  onChange={(e) => set("rmax", parseFloat(e.target.value) || 12.0)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">dr (A)</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={data.dr ?? 0.1}
                  onChange={(e) => set("dr", parseFloat(e.target.value) || 0.1)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output</label>
                <select
                  className={selectCls}
                  value={data.rdfOutputMode ?? "json"}
                  onChange={(e) => set("rdfOutputMode", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="both">JSON + CSV</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.rdfOutputBase ?? "rdf_results"}
                  onChange={(e) => set("rdfOutputBase", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
        )}

        {mode === "cn" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Type A</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.atomTypeA ?? "Na"}
                  onChange={(e) => set("atomTypeA", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Neighbor Type B</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.atomTypeB ?? ""}
                  onChange={(e) => set("atomTypeB", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Cutoff (A)</label>
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  value={data.cutoff ?? 3.5}
                  onChange={(e) => set("cutoff", parseFloat(e.target.value) || 3.5)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output</label>
                <select
                  className={selectCls}
                  value={data.cnOutputMode ?? "json"}
                  onChange={(e) => set("cnOutputMode", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="both">JSON + CSV</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
              <input
                type="text"
                className={inputCls}
                value={data.cnOutputBase ?? "cn_results"}
                onChange={(e) => set("cnOutputBase", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {mode === "closest" && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Reference</label>
              <select
                className={selectCls}
                value={data.closestReferenceMode ?? "index"}
                onChange={(e) => set("closestReferenceMode", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="index">By atom index</option>
                <option value="coords">By XYZ coordinates</option>
              </select>
            </div>
            {(data.closestReferenceMode ?? "index") === "index" ? (
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Reference atom index</label>
                <input
                  type="number"
                  min="1"
                  className={inputCls}
                  value={data.closestRefIndex ?? 1}
                  onChange={(e) => set("closestRefIndex", parseInt(e.target.value, 10) || 1)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">X</label>
                  <input
                    type="number"
                    step="0.1"
                    className={inputCls}
                    value={data.closestRefX ?? 0}
                    onChange={(e) => set("closestRefX", parseFloat(e.target.value) || 0)}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Y</label>
                  <input
                    type="number"
                    step="0.1"
                    className={inputCls}
                    value={data.closestRefY ?? 0}
                    onChange={(e) => set("closestRefY", parseFloat(e.target.value) || 0)}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Z</label>
                  <input
                    type="number"
                    step="0.1"
                    className={inputCls}
                    value={data.closestRefZ ?? 0}
                    onChange={(e) => set("closestRefZ", parseFloat(e.target.value) || 0)}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output</label>
                <select
                  className={selectCls}
                  value={data.closestOutputMode ?? "json"}
                  onChange={(e) => set("closestOutputMode", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="both">JSON + CSV</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.closestOutputBase ?? "closest_results"}
                  onChange={(e) => set("closestOutputBase", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
        )}

        {mode === "occupancy" && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">r-max (A)</label>
              <input
                type="number"
                step="0.1"
                className={inputCls}
                value={data.occupancyRmax ?? 1.0}
                onChange={(e) => set("occupancyRmax", parseFloat(e.target.value) || 1.0)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output</label>
                <select
                  className={selectCls}
                  value={data.occupancyOutputMode ?? "json"}
                  onChange={(e) => set("occupancyOutputMode", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="both">JSON + CSV</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.occupancyOutputBase ?? "occupancy_results"}
                  onChange={(e) => set("occupancyOutputBase", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
        )}

        {mode === "bvs" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Top-N worst atoms</label>
              <input
                type="number"
                min="1"
                className={inputCls}
                value={data.topN ?? 10}
                onChange={(e) => set("topN", parseInt(e.target.value, 10) || 10)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Log file</label>
              <input
                type="text"
                className={inputCls}
                value={data.bvsLogFile ?? "bvs_summary.log"}
                onChange={(e) => set("bvsLogFile", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Write detailed CSV
              <input
                type="checkbox"
                className="nodrag"
                checked={data.writeCsv ?? true}
                onChange={(e) => set("writeCsv", e.target.checked)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            {(data.writeCsv ?? true) && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">CSV file</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.csvFile ?? "bvs_results.csv"}
                  onChange={(e) => set("csvFile", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </>
        )}

        {mode === "stats" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Log filename</label>
            <input
              type="text"
              className={inputCls}
              value={data.statsLogFile ?? "output.log"}
              onChange={(e) => set("statsLogFile", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Auto-calculates structure composition and charge stats.</p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
