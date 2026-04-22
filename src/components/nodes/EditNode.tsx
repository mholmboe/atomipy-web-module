import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { SlidersHorizontal, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type EditMode = "slice" | "remove" | "molecule" | "resname" | "reorder";
const OPS = ["<", "<=", ">", ">=", "==", "!="] as const;

type EditNodeData = {
  mode?: EditMode;
  // Slice
  xlo?: number; ylo?: number; zlo?: number;
  xhi?: number; yhi?: number; zhi?: number;
  removePartial?: boolean;
  // Remove
  atomType?: string;
  indices?: string;
  molids?: string;
  logic?: "and" | "or";
  xEnabled?: boolean; yEnabled?: boolean; zEnabled?: boolean;
  xOp?: typeof OPS[number]; yOp?: typeof OPS[number]; zOp?: typeof OPS[number];
  xValue?: number; yValue?: number; zValue?: number;
  // Molecule
  molid?: number;
  moleculeResname?: string;
  // Resname
  defaultResname?: string;
  // Reorder
  byMode?: "index" | "resname" | "type";
  neworder?: string;
};

export function EditNode({ id, data }: NodeComponentProps<EditNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = data.mode ?? "remove";

  const set = (field: keyof EditNodeData, value: string | number | boolean | undefined) =>
    updateNodeData(id, { ...data, [field]: value });

  const inputCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1";
  const selectCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1";

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-amber-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Structure Edit" Icon={SlidersHorizontal} colorClass="text-zinc-500" className="bg-zinc-500/10" />

      <div className="p-4 space-y-3 bg-background">
        {/* Mode selector */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Operation</label>
          <select className={selectCls} value={mode} onChange={(e) => set("mode", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
            <option value="remove">Remove Atoms</option>
            <option value="slice">Slice Region</option>
            <option value="molecule">Set Molecule ID</option>
            <option value="resname">Assign Resname</option>
            <option value="reorder">Reorder Atoms</option>
          </select>
        </div>

        {/* SLICE */}
        {mode === "slice" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(["xlo", "ylo", "zlo"] as const).map((k) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block text-center mb-1">{k}</label>
                  <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                    value={data[k] ?? 0}
                    onChange={(e) => set(k, parseFloat(e.target.value) || 0)}
                    onPointerDown={(e) => e.stopPropagation()} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["xhi", "yhi", "zhi"] as const).map((k) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block text-center mb-1">{k}</label>
                  <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                    value={data[k] ?? ""} placeholder="box"
                    onChange={(e) => { const v = parseFloat(e.target.value); set(k, isFinite(v) ? v : undefined); }}
                    onPointerDown={(e) => e.stopPropagation()} />
                </div>
              ))}
            </div>
            <label className="nodrag flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={data.removePartial ?? true}
                onChange={(e) => set("removePartial", e.target.checked)}
                onPointerDown={(e) => e.stopPropagation()} />
              Remove partial molecules
            </label>
          </>
        )}

        {/* REMOVE */}
        {mode === "remove" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Atom type(s) (comma-sep.)</label>
              <input type="text" className={inputCls} placeholder="Al or Al, Si"
                value={data.atomType ?? ""}
                onChange={(e) => set("atomType", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Index list</label>
                <input type="text" className={inputCls} placeholder="1,2,3"
                  value={data.indices ?? ""}
                  onChange={(e) => set("indices", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Molecule IDs</label>
                <input type="text" className={inputCls} placeholder="1,4,7"
                  value={data.molids ?? ""}
                  onChange={(e) => set("molids", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Logic</label>
              <select className={selectCls} value={data.logic ?? "and"} onChange={(e) => set("logic", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                <option value="and">and (all criteria must match)</option>
                <option value="or">or (any criterion can match)</option>
              </select>
            </div>
            {(["x", "y", "z"] as const).map((axis) => {
              const enabledKey = `${axis}Enabled` as keyof EditNodeData;
              const opKey = `${axis}Op` as keyof EditNodeData;
              const valueKey = `${axis}Value` as keyof EditNodeData;
              const enabled = Boolean(data[enabledKey]);
              return (
                <div key={axis} className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center">
                  <label className="nodrag flex items-center gap-1 text-xs text-muted-foreground">
                    <input type="checkbox" checked={enabled} onChange={(e) => set(enabledKey, e.target.checked)} onPointerDown={(e) => e.stopPropagation()} />
                    {axis}
                  </label>
                  <select className="nodrag text-xs bg-muted border border-border rounded-md px-2 py-1" value={(data[opKey] as string) ?? "<"} disabled={!enabled} onChange={(e) => set(opKey, e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                    {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input type="number" step="0.1" className="nodrag text-xs bg-muted border border-border rounded-md px-2 py-1"
                    value={(data[valueKey] as number) ?? 0} disabled={!enabled}
                    onChange={(e) => set(valueKey, parseFloat(e.target.value) || 0)}
                    onPointerDown={(e) => e.stopPropagation()} />
                </div>
              );
            })}
          </>
        )}

        {/* MOLECULE */}
        {mode === "molecule" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Molecule ID</label>
              <input type="number" min="1" className={inputCls}
                value={data.molid ?? 1}
                onChange={(e) => set("molid", parseInt(e.target.value) || 1)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Resname (optional)</label>
              <input type="text" className={inputCls} placeholder="Keep existing"
                value={data.moleculeResname ?? ""}
                onChange={(e) => set("moleculeResname", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
          </>
        )}

        {/* RESNAME */}
        {mode === "resname" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Default Resname</label>
            <input type="text" className={inputCls}
              value={data.defaultResname ?? "MIN"}
              onChange={(e) => set("defaultResname", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()} />
          </div>
        )}

        {/* REORDER */}
        {mode === "reorder" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Order By</label>
              <select className={selectCls} value={data.byMode ?? "index"} onChange={(e) => set("byMode", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                <option value="index">Index (comma-separated integers)</option>
                <option value="resname">Residue Name</option>
                <option value="type">Atom Type</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {data.byMode === "index" ? "Indices (e.g. 1, 2, 4)" : "Values (e.g. SOL, MMT)"}
              </label>
              <input type="text" className={inputCls} placeholder={data.byMode === "index" ? "1, 2, 4, 5" : "Na, Ow, Hw"}
                value={data.neworder ?? ""}
                onChange={(e) => set("neworder", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
          </>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
