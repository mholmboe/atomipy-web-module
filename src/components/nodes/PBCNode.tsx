import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { BoxSelect } from "lucide-react";
import type { NodeComponentProps } from "./types";

type PBCMode = "condense" | "wrap";

type PBCNodeData = {
  mode?: PBCMode;
};

export function PBCNode({ id, data }: NodeComponentProps<PBCNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = data.mode ?? "condense";

  const descriptions: Record<PBCMode, string> = {
    condense: "Automatically tightens the simulation box to fit the atomic boundaries, removing unnecessary vacuum.",
    wrap: "Applies ap.wrap() to ensure all atoms are within the simulation box using periodic boundary conditions.",
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
            <option value="condense">Condense Box</option>
            <option value="wrap">Wrap Coordinates</option>
          </select>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {descriptions[mode]}
        </p>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
