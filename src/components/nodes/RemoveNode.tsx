import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Eraser } from "lucide-react";
import type { NodeComponentProps } from "./types";

type RemoveNodeData = {
  atomType?: string;
  indices?: string;
  molids?: string;
  logic?: "and" | "or";
  xEnabled?: boolean;
  yEnabled?: boolean;
  zEnabled?: boolean;
  xOp?: "<" | "<=" | ">" | ">=" | "==" | "!=";
  yOp?: "<" | "<=" | ">" | ">=" | "==" | "!=";
  zOp?: "<" | "<=" | ">" | ">=" | "==" | "!=";
  xValue?: number;
  yValue?: number;
  zValue?: number;
};

const OPS = ["<", "<=", ">", ">=", "==", "!="] as const;

export function RemoveNode({ id, data }: NodeComponentProps<RemoveNodeData>) {
  const { updateNodeData } = useReactFlow();

  const setField = (field: keyof RemoveNodeData, value: string | number | boolean) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  const setNumericField = (field: keyof RemoveNodeData, value: string, fallback = 0) => {
    const parsed = parseFloat(value);
    setField(field, Number.isFinite(parsed) ? parsed : fallback);
  };

  return (
    <div className="bg-card w-[330px] shadow-lg rounded-xl border border-rose-600/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-rose-600/10 p-3 border-b border-border flex items-center gap-2">
        <Eraser className="w-4 h-4 text-rose-600" />
        <h3 className="text-sm font-semibold text-foreground m-0">Remove Sites</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">
            Atom type(s) (comma-separated)
          </label>
          <input
            type="text"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            placeholder="Al or Al, Si"
            value={data.atomType || ""}
            onChange={(e) => setField("atomType", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Atom index list
            </label>
            <input
              type="text"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
              placeholder="1,2,3"
              value={data.indices || ""}
              onChange={(e) => setField("indices", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Molecule ID list
            </label>
            <input
              type="text"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
              placeholder="1,4,7"
              value={data.molids || ""}
              onChange={(e) => setField("molids", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Logic</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            value={data.logic || "and"}
            onChange={(e) => setField("logic", e.target.value as "and" | "or")}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="and">and (all criteria must match)</option>
            <option value="or">or (any criterion can match)</option>
          </select>
        </div>

        {(["x", "y", "z"] as const).map((axis) => {
          const enabledKey = `${axis}Enabled` as const;
          const opKey = `${axis}Op` as const;
          const valueKey = `${axis}Value` as const;
          const enabled = Boolean(data[enabledKey]);
          const op = (data[opKey] || "<") as string;
          const value = (data[valueKey] ?? 0) as number;

          return (
            <div key={axis} className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center">
              <label className="nodrag flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setField(enabledKey, e.target.checked)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                {axis}
              </label>

              <select
                className="nodrag text-xs bg-muted border border-border rounded-md px-2 py-1"
                value={op}
                disabled={!enabled}
                onChange={(e) => setField(opKey, e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {OPS.map((curOp) => (
                  <option key={curOp} value={curOp}>
                    {curOp}
                  </option>
                ))}
              </select>

              <input
                type="number"
                step="0.1"
                className="nodrag text-xs bg-muted border border-border rounded-md px-2 py-1"
                value={value}
                disabled={!enabled}
                onChange={(e) => setNumericField(valueKey, e.target.value, 0)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          );
        })}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
