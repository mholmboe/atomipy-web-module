import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type ForcefieldType = "minff" | "clayff";

type ForcefieldNodeData = {
  forcefield?: ForcefieldType;
  log?: boolean;
  logFile?: string;
  resetMolid?: boolean;
  status?: string;
  rmaxLong?: number;
  rmaxH?: number;
};

export function ForcefieldNode({ id, data }: NodeComponentProps<ForcefieldNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = useState(false);

  const forcefield = data.forcefield ?? "minff";
  const log = data.log ?? false;
  const logFile = data.logFile ?? `${forcefield}.log`;
  const resetMolid = data.resetMolid ?? true;

  return (
    <div className="bg-card w-[250px] shadow-lg rounded-xl border border-amber-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Forcefield" Icon={FlaskConical} colorClass="text-yellow-600" className="bg-yellow-500/10" />

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Atomtype Scheme</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            value={forcefield}
            onChange={(e) => {
              const newValue = e.target.value as ForcefieldType;
              const updates: Partial<ForcefieldNodeData> = { forcefield: newValue };
              if (log && (!data.logFile || data.logFile === `${forcefield}.log`)) {
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
                checked={log}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  const updates: Partial<ForcefieldNodeData> = { log: isChecked };
                  if (isChecked && !data.logFile) {
                    updates.logFile = `${forcefield}.log`;
                  }
                  updateNodeData(id, { ...data, ...updates });
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>

            {log && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Log filename</label>
                <input
                  type="text"
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                  placeholder="e.g. forcefield.log"
                  value={logFile}
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
