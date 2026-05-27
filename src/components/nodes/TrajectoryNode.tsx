import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { History } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type TrajectoryNodeData = {
  mode?: "import" | "export";
  filename?: string;
  format?: "pdb" | "gro" | "xyz";
  extractMode?: boolean;
  frameIndex?: number;
};

export function TrajectoryNode({ id, data }: NodeComponentProps<TrajectoryNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = data.mode || "export";
  const extractMode = !!data.extractMode;

  const handleChange = (field: keyof TrajectoryNodeData, value: string | number | boolean) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[260px] shadow-lg rounded-xl border border-slate-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Trajectory Processing" Icon={History} colorClass="text-purple-500" className="bg-purple-500/10" />

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Mode</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={mode}
            onChange={(e) => handleChange("mode", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="import">Import Trajectory</option>
            <option value="export">Write Trajectory (Append)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Filename</label>
          <input
            type="text"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-500"
            value={data.filename || "trajectory.pdb"}
            onChange={(e) => handleChange("filename", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>

        <div>
           <label className="text-xs font-semibold text-muted-foreground block mb-1">Format</label>
           <select
             className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
             value={data.format || "pdb"}
             onChange={(e) => handleChange("format", e.target.value)}
             onPointerDown={(e) => e.stopPropagation()}
           >
             <option value="pdb">PDB</option>
             <option value="gro">GRO</option>
             <option value="xyz">XYZ</option>
           </select>
        </div>

        <div className="pt-2 border-t border-border space-y-2">
          <label className="nodrag flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={extractMode}
              onChange={(e) => handleChange("extractMode", e.target.checked)}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded border-border text-purple-500 focus:ring-0 cursor-pointer"
            />
            Extract single frame
          </label>

          {extractMode && (
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Frame Index</label>
              <input
                type="number"
                min="0"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={data.frameIndex ?? 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  handleChange("frameIndex", isNaN(val) ? 0 : val);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
