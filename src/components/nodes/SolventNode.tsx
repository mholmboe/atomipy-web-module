import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Droplet, ChevronDown, ChevronUp } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type SolventMode = "solvate" | "waterModel";

type SolventNodeData = {
  mode?: SolventMode;
  // Solvate
  waterModel?: string;
  density?: number;
  minDistance?: number;
  maxSolventMode?: "max" | "count" | "shell";
  maxSolventCount?: number;
  shellThickness?: number;
  includeSolute?: boolean;
  xlo?: number; ylo?: number; zlo?: number;
  xhi?: number; yhi?: number; zhi?: number;
  // Water model conversion
  conversion?: "spc2tip4p" | "tip3p2tip4p";
  omDist?: number;
};

export function SolventNode({ id, data }: NodeComponentProps<SolventNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = useState(false);

  const mode = data.mode ?? "solvate";
  const maxSolventMode = data.maxSolventMode ?? "max";

  const set = (field: keyof SolventNodeData, value: string | number | boolean | undefined) =>
    updateNodeData(id, { ...data, [field]: value });

  const setOptNum = (field: keyof SolventNodeData, value: string) => {
    const parsed = parseFloat(value);
    set(field, isFinite(parsed) ? parsed : undefined);
  };

  const inputCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1";
  const selectCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1";

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-cyan-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Solvent Operations" Icon={Droplet} colorClass="text-blue-500" className="bg-blue-500/10" />

      <div className="p-4 space-y-3 bg-background">
        {/* Mode selector */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Operation</label>
          <select className={selectCls} value={mode} onChange={(e) => set("mode", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
            <option value="solvate">Solvate System</option>
            <option value="waterModel">Convert Water Model</option>
          </select>
        </div>

        {/* SOLVATE */}
        {mode === "solvate" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Water Model</label>
              <select className={selectCls} value={data.waterModel ?? "spce"} onChange={(e) => set("waterModel", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                <option value="spce">SPC/E</option>
                <option value="spc">SPC</option>
                <option value="tip3p">TIP3P</option>
                <option value="tip4p">TIP4P</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Density (g/cm³)</label>
              <input type="number" step="0.01" className={inputCls}
                value={data.density ?? 1.0}
                onChange={(e) => set("density", parseFloat(e.target.value) || 1.0)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Min Distance (Å)</label>
              <input type="number" step="0.1" className={inputCls}
                value={data.minDistance ?? 2.25}
                onChange={(e) => set("minDistance", parseFloat(e.target.value) || 2.25)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
            {/* More Options */}
            <button
              className="nodrag w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded-md bg-muted/50 hover:bg-muted"
              onClick={() => setShowMore(!showMore)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span>More options</span>
              {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showMore && (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Max Molecules</label>
                  <select className={selectCls} value={maxSolventMode} onChange={(e) => set("maxSolventMode", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                    <option value="max">Auto (max possible)</option>
                    <option value="count">Fixed count</option>
                    <option value="shell">Shell thickness</option>
                  </select>
                </div>
                {maxSolventMode === "count" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Count</label>
                    <input type="number" min="1" className={inputCls}
                      value={data.maxSolventCount ?? 100}
                      onChange={(e) => set("maxSolventCount", parseInt(e.target.value) || 100)}
                      onPointerDown={(e) => e.stopPropagation()} />
                  </div>
                )}
                {maxSolventMode === "shell" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Shell Thickness (Å)</label>
                    <input type="number" step="0.5" className={inputCls}
                      value={data.shellThickness ?? 5.0}
                      onChange={(e) => set("shellThickness", parseFloat(e.target.value) || 5.0)}
                      onPointerDown={(e) => e.stopPropagation()} />
                  </div>
                )}
                <label className="nodrag flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={data.includeSolute ?? true}
                    onChange={(e) => set("includeSolute", e.target.checked)}
                    onPointerDown={(e) => e.stopPropagation()} />
                  Include solute in distance check
                </label>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground block">Solvation Limits (Å, blank = box)</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(["xlo", "ylo", "zlo"] as const).map((k) => (
                      <input key={k} type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                        value={data[k] ?? ""} placeholder={k}
                        onChange={(e) => setOptNum(k, e.target.value)}
                        onPointerDown={(e) => e.stopPropagation()} />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(["xhi", "yhi", "zhi"] as const).map((k) => (
                      <input key={k} type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                        value={data[k] ?? ""} placeholder={k}
                        onChange={(e) => setOptNum(k, e.target.value)}
                        onPointerDown={(e) => e.stopPropagation()} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* WATER MODEL CONVERSION */}
        {mode === "waterModel" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Conversion</label>
              <select className={selectCls} value={data.conversion ?? "spc2tip4p"} onChange={(e) => set("conversion", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                <option value="spc2tip4p">SPC/E → TIP4P</option>
                <option value="tip3p2tip4p">TIP3P → TIP4P</option>
              </select>
            </div>
            {(data.conversion ?? "spc2tip4p") === "spc2tip4p" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">OM Distance (Å)</label>
                <input type="number" step="0.01" className={inputCls}
                  value={data.omDist ?? 0.15}
                  onChange={(e) => set("omDist", parseFloat(e.target.value) || 0.15)}
                  onPointerDown={(e) => e.stopPropagation()} />
                <p className="text-[10px] text-muted-foreground mt-1">Distance of virtual OM site from oxygen.</p>
              </div>
            )}
          </>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
