import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Eraser, Filter } from "lucide-react";
import type { NodeComponentProps } from "./types";

type RemoveNodeData = {
  atomType?: string;
  indices?: string;
  molids?: string;
  logic?: "and" | "or";
  mode?: "remove" | "keep";
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

  const mode = data.mode || "remove";
  const isKeep = mode === "keep";
  const borderClass = isKeep ? "border-emerald-500/50 shadow-emerald-950/20" : "border-rose-500/50 shadow-rose-950/20";
  const bgHeaderClass = isKeep ? "bg-emerald-500/10" : "bg-rose-500/10";
  const textClass = isKeep ? "text-emerald-400" : "text-rose-400";
  const titleText = isKeep ? "Keep / Filter Sites" : "Remove Sites";
  const Icon = isKeep ? Filter : Eraser;

  return (
    <div className={`bg-card w-[330px] shadow-lg rounded-xl border ${borderClass} overflow-hidden font-sans select-none transition-all duration-300`}>
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className={`${bgHeaderClass} p-3 border-b border-border flex items-center gap-2 transition-all duration-300`}>
        <Icon className={`w-4 h-4 ${textClass} transition-colors duration-300`} />
        <h3 className="text-sm font-semibold text-foreground m-0">{titleText}</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Action</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 font-medium focus:ring-1 focus:ring-primary outline-none"
            value={mode}
            onChange={(e) => setField("mode", e.target.value as "remove" | "keep")}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="remove">Remove matching atoms</option>
            <option value="keep">Keep matching atoms (remove others)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">
            Atom type(s) (comma-separated)
          </label>
          <input
            type="text"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 outline-none"
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
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 outline-none"
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
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 outline-none"
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
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 outline-none"
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
              <label className="nodrag flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setField(enabledKey, e.target.checked)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="rounded border-border text-primary focus:ring-0 cursor-pointer"
                />
                {axis}
              </label>

              <select
                className="nodrag text-xs bg-muted border border-border rounded-md px-2 py-1 outline-none disabled:opacity-50"
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
                className="nodrag text-xs bg-muted border border-border rounded-md px-2 py-1 outline-none disabled:opacity-50"
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
