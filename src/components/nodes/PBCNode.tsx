import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { BoxSelect } from "lucide-react";
import type { NodeComponentProps } from "./types";

type PBCMode = "wrap" | "unwrap" | "condense";

type PBCNodeData = {
  mode?: PBCMode;
  unwrapMolid?: string;
};

export function PBCNode({ id, data }: NodeComponentProps<PBCNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = data.mode ?? "wrap";

  const descriptions: Record<PBCMode, string> = {
    wrap: "Applies ap.wrap() to ensure all atoms are within the simulation box using periodic boundary conditions.",
    unwrap: "Applies ap.unwrap_coordinates() to reconnect molecules that are split across periodic boundaries.",
    condense: "Automatically tightens the simulation box to fit the atomic boundaries, removing unnecessary vacuum.",
  };

  return (
    <div className="bg-card w-[240px] shadow-lg rounded-xl border border-purple-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-purple-500/10 p-3 border-b border-border flex items-center gap-2">
        <BoxSelect className="w-4 h-4 text-purple-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">PBC Tools</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Operation</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={mode}
            onChange={(e) => updateNodeData(id, { ...data, mode: e.target.value as PBCMode })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="wrap">Wrap Coordinates</option>
            <option value="unwrap">Unwrap Coordinates</option>
            <option value="condense">Condense Box</option>
          </select>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {descriptions[mode]}
        </p>
        {mode === "unwrap" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Target molid(s) (optional)</label>
            <input
              type="text"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
              placeholder="e.g. 1 or 1,2,3"
              value={data.unwrapMolid ?? ""}
              onChange={(e) => updateNodeData(id, { ...data, unwrapMolid: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Leave blank to unwrap all molecules.</p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
