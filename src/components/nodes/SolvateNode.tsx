import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, Droplet, HelpCircle } from "lucide-react";
import { NodeStatus } from "./NodeStatus";
import type { NodeComponentProps } from "./types";

type SolvateNodeData = {
  waterModel?: string;
  density?: number;
  minDistance?: number;
  maxSolventMode?: "max" | "count" | "shell";
  maxSolventCount?: number;
  shellThickness?: number;
  includeSolute?: boolean;
  xlo?: number;
  ylo?: number;
  zlo?: number;
  xhi?: number;
  yhi?: number;
  zhi?: number;
};

export function SolvateNode({ id, data }: NodeComponentProps<SolvateNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = useState(false);
  const maxSolventMode = data.maxSolventMode || "max";

  const handleChange = (field: keyof SolvateNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  const handleOptionalNumber = (field: keyof SolvateNodeData, value: string) => {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) {
      updateNodeData(id, { ...data, [field]: parsed });
    } else {
      updateNodeData(id, { ...data, [field]: undefined });
    }
  };

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-primary/50 overflow-hidden font-sans select-none relative">
      <NodeStatus status={data.status} />
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      
      <div className="bg-cyan-500/10 p-3 border-b border-border flex items-center gap-2">
        <Droplet className="w-4 h-4 text-cyan-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Solvate System</h3>
      </div>
      
      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Water Model</label>
          <select 
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={data.waterModel || "spce"}
            onChange={(e) => handleChange("waterModel", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="spce">SPC/E</option>
            <option value="spc">SPC</option>
            <option value="tip3p">TIP3P</option>
            <option value="tip4p">TIP4P</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Density (g/cm³)</label>
          <input 
            type="number" step="0.01"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={data.density || 1.0}
            onChange={(e) => handleChange("density", parseFloat(e.target.value) || 1.0)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>

        <div>
           <label className="text-xs font-semibold text-muted-foreground block mb-1">Min Distance (Å)</label>
           <input 
              type="number" step="0.1"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
              value={data.minDistance || 2.2}
              onChange={(e) => handleChange("minDistance", parseFloat(e.target.value) || 2.2)}
              onPointerDown={(e) => e.stopPropagation()}
           />
        </div>

        <button
          type="button"
          className="nodrag w-full flex items-center justify-between text-xs font-semibold text-muted-foreground border border-border rounded-md px-2 py-1.5 bg-background hover:bg-muted/50"
          onClick={() => setShowMore((prev) => !prev)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          More options
          {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showMore && (
          <div className="space-y-2 border border-border rounded-md p-2 bg-muted/30">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Max solvent mode</label>
              <select
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                value={maxSolventMode}
                onChange={(e) => handleChange("maxSolventMode", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="max">max</option>
                <option value="count">count</option>
                <option value="shell">shell</option>
              </select>
            </div>

            {maxSolventMode === "count" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Max solvent count</label>
                <input
                  type="number"
                  min="1"
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={data.maxSolventCount || 1}
                  onChange={(e) => handleChange("maxSolventCount", parseInt(e.target.value) || 1)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}

            {maxSolventMode === "shell" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Shell thickness (Å)</label>
                <select
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={data.shellThickness || 10}
                  onChange={(e) => handleChange("shellThickness", parseFloat(e.target.value) || 10)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                  <option value={25}>25</option>
                  <option value={30}>30</option>
                </select>
              </div>
            )}

            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Include solute in return
              <input
                type="checkbox"
                className="nodrag"
                checked={data.includeSolute || false}
                onChange={(e) => updateNodeData(id, { ...data, includeSolute: e.target.checked })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>

            <div className="text-[11px] text-muted-foreground">Optional subvolume limits (defaults to full box).</div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="xlo"
                value={data.xlo ?? ""}
                onChange={(e) => handleOptionalNumber("xlo", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="ylo"
                value={data.ylo ?? ""}
                onChange={(e) => handleOptionalNumber("ylo", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="zlo"
                value={data.zlo ?? ""}
                onChange={(e) => handleOptionalNumber("zlo", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="xhi"
                value={data.xhi ?? ""}
                onChange={(e) => handleOptionalNumber("xhi", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="yhi"
                value={data.yhi ?? ""}
                onChange={(e) => handleOptionalNumber("yhi", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="zhi"
                value={data.zhi ?? ""}
                onChange={(e) => handleOptionalNumber("zhi", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
