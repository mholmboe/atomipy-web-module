import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { ArrowUpDown } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type CoordinateMode =
  | "cart_to_frac"
  | "frac_to_cart"
  | "triclinic_to_ortho"
  | "ortho_to_triclinic"
  | "cell_vectors";

type CoordinateFrameNodeData = {
  mode?: CoordinateMode;
  updateBox?: boolean;
  vectorsFile?: string;
};

export function CoordinateFrameNode({ id, data }: NodeComponentProps<CoordinateFrameNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = data.mode ?? "cart_to_frac";
  const set = (field: keyof CoordinateFrameNodeData, value: string | boolean) =>
    updateNodeData(id, { ...data, [field]: value });

  const selectCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1";
  const inputCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1";

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-indigo-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Coord Frame" Icon={ArrowUpDown} colorClass="text-lime-500" className="bg-lime-500/10" />

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Operation</label>
          <select
            className={selectCls}
            value={mode}
            onChange={(e) => set("mode", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="cart_to_frac">Cartesian -&gt; Fractional</option>
            <option value="frac_to_cart">Fractional -&gt; Cartesian</option>
            <option value="triclinic_to_ortho">Triclinic -&gt; Orthogonal</option>
            <option value="ortho_to_triclinic">Orthogonal -&gt; Triclinic</option>
            <option value="cell_vectors">Get Cell Vectors</option>
          </select>
        </div>

        {mode === "triclinic_to_ortho" && (
          <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
            Update output box to orthogonal
            <input
              type="checkbox"
              className="nodrag"
              checked={data.updateBox ?? true}
              onChange={(e) => set("updateBox", e.target.checked)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </label>
        )}

        {mode === "cell_vectors" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Vectors output file</label>
            <input
              type="text"
              className={inputCls}
              value={data.vectorsFile ?? "cell_vectors.json"}
              onChange={(e) => set("vectorsFile", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Adds coordinate-system metadata fields and optional cell-vector reports.
        </p>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
