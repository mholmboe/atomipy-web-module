import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Atom } from "lucide-react";
import type { NodeComponentProps } from "./types";

type AtomPropertiesNodeData = {
  applyElement?: boolean;
  applyFormalCharges?: boolean;
  applyMass?: boolean;
  computeCom?: boolean;
  comLogFile?: string;
};

export function AtomPropertiesNode({ id, data }: NodeComponentProps<AtomPropertiesNodeData>) {
  const { updateNodeData } = useReactFlow();
  const set = (field: keyof AtomPropertiesNodeData, value: string | boolean) =>
    updateNodeData(id, { ...data, [field]: value });

  const checkbox = (field: keyof AtomPropertiesNodeData, label: string, fallback: boolean) => (
    <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
      {label}
      <input
        type="checkbox"
        className="nodrag"
        checked={(data[field] as boolean | undefined) ?? fallback}
        onChange={(e) => set(field, e.target.checked)}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </label>
  );

  return (
    <div className="bg-card w-[280px] shadow-lg rounded-xl border border-cyan-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-cyan-500/10 p-3 border-b border-border flex items-center gap-2">
        <Atom className="w-4 h-4 text-cyan-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Atom Properties</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        {checkbox("applyElement", "Set element/type labels", true)}
        {checkbox("applyFormalCharges", "Assign formal charges", false)}
        {checkbox("applyMass", "Set atomic masses", false)}
        {checkbox("computeCom", "Compute center of mass", false)}

        {(data.computeCom ?? false) && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">COM report file</label>
            <input
              type="text"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
              value={data.comLogFile ?? "com_report.json"}
              onChange={(e) => set("comLogFile", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Applies lightweight atom annotations without changing geometry.
        </p>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
