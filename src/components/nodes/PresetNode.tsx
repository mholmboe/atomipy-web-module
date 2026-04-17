import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Library } from "lucide-react";
import { formatPresetLabel } from "./types";
import type { NodeComponentProps, PresetOption } from "./types";

type PresetNodeData = {
  value?: string;
  presets?: PresetOption[];
};

export function PresetNode({ id, data }: NodeComponentProps<PresetNodeData>) {
  const { updateNodeData } = useReactFlow();
  const presets = data.presets || [];

  return (
    <div className="bg-card w-[280px] shadow-lg rounded-xl border border-primary/50 overflow-hidden font-sans select-none">
      <div className="bg-primary/10 p-3 border-b border-border flex items-center gap-2">

        <Library className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground m-0">Load Preset Slab</h3>
      </div>
      <div className="p-4 space-y-3 bg-secondary/20">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1 uppercase tracking-wider">Select Mineral</label>
          <select 
            className="nodrag w-full text-sm bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary h-8"
            value={data.value || ""}
            onChange={(e) => updateNodeData(id, { value: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="">-- Choose --</option>
            {presets.map((p) => (
              <option key={p.id} value={p.fileName}>
                {formatPresetLabel(p)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* Output handles for atoms and box (conceptually) */}
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
