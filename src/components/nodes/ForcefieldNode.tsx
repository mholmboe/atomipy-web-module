import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import type { NodeComponentProps } from "./types";

type ForcefieldNodeData = {
  forcefield?: "minff" | "clayff";
  rmaxLong?: number;
  rmaxH?: number;
  log?: boolean;
  logFile?: string;
  resetMolid?: boolean;
};

export function ForcefieldNode({ id, data }: NodeComponentProps<ForcefieldNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = useState(false);

  const resetMolid = data.resetMolid ?? true;

  return (
    <div className="bg-card w-[250px] shadow-lg rounded-xl border border-amber-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-amber-500/10 p-3 border-b border-border flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Assign Forcefield</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Atomtype Scheme</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            value={data.forcefield || "minff"}
            onChange={(e) => {
              const newValue = e.target.value as "minff" | "clayff";
              const updates: Partial<ForcefieldNodeData> = { forcefield: newValue };
              if (data.log && (!data.logFile || data.logFile === `${data.forcefield || "minff"}.log`)) {
                updates.logFile = `${newValue}.log`;
              }
              updateNodeData(id, { ...data, ...updates });
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="minff">MINFF</option>
            <option value="clayff">CLAYFF</option>
          </select>
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
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Reset MolID (H2O sep)
              <input
                type="checkbox"
                className="nodrag"
                checked={resetMolid}
                onChange={(e) => updateNodeData(id, { ...data, resetMolid: e.target.checked })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">rmax long (Å)</label>
                <input
                  type="number"
                  step="0.05"
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={data.rmaxLong || 2.45}
                  onChange={(e) => updateNodeData(id, { ...data, rmaxLong: parseFloat(e.target.value) || 2.45 })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">rmax H (Å)</label>
                <input
                  type="number"
                  step="0.05"
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={data.rmaxH || 1.2}
                  onChange={(e) => updateNodeData(id, { ...data, rmaxH: parseFloat(e.target.value) || 1.2 })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Write typing log
              <input
                type="checkbox"
                className="nodrag"
                checked={data.log || false}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  const updates: Partial<ForcefieldNodeData> = { log: isChecked };
                  if (isChecked && !data.logFile) {
                    updates.logFile = `${data.forcefield || "minff"}.log`;
                  }
                  updateNodeData(id, { ...data, ...updates });
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>

            {(data.log || false) && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Log filename</label>
                <input
                  type="text"
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                  placeholder="e.g. forcefield.log"
                  value={data.logFile || ""}
                  onChange={(e) => updateNodeData(id, { ...data, logFile: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
