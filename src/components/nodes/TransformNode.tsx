import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Move3D } from "lucide-react";
import type { NodeComponentProps } from "./types";

type TransformMode = "translate" | "rotate" | "scale" | "bend";

type TransformNodeData = {
  mode?: TransformMode;
  // Translate (position)
  translateMode?: "absolute" | "relative";
  tx?: number;
  ty?: number;
  tz?: number;
  translateResname?: string;
  // Rotate
  rotateMode?: "random" | "manual";
  rx?: number;
  ry?: number;
  rz?: number;
  // Scale
  sx?: number;
  sy?: number;
  sz?: number;
  scaleResname?: string;
  // Bend
  radius?: number;
};

export function TransformNode({ id, data }: NodeComponentProps<TransformNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = data.mode ?? "translate";

  const set = (field: keyof TransformNodeData, value: string | number) =>
    updateNodeData(id, { ...data, [field]: value });

  const inputCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1";
  const selectCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1";

  return (
    <div className="bg-card w-[260px] shadow-lg rounded-xl border border-sky-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-sky-500/10 p-3 border-b border-border flex items-center gap-2">
        <Move3D className="w-4 h-4 text-sky-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Spatial Ops</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        {/* Mode selector */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Operation</label>
          <select className={selectCls} value={mode} onChange={(e) => set("mode", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
            <option value="translate">Translate / Position</option>
            <option value="rotate">Rotate</option>
            <option value="scale">Scale</option>
            <option value="bend">Bend (Cylinder)</option>
          </select>
        </div>

        {/* TRANSLATE */}
        {mode === "translate" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Mode</label>
              <select className={selectCls} value={data.translateMode ?? "absolute"} onChange={(e) => set("translateMode", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                <option value="absolute">Absolute (COM)</option>
                <option value="relative">Relative (Translate)</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["tx", "ty", "tz"].map((ax, i) => (
                <div key={ax}>
                  <label className="text-xs text-muted-foreground block text-center mb-1">{["X", "Y", "Z"][i]}</label>
                  <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                    value={(data as any)[ax] ?? 0}
                    onChange={(e) => set(ax as keyof TransformNodeData, parseFloat(e.target.value) || 0)}
                    onPointerDown={(e) => e.stopPropagation()} />
                </div>
              ))}
            </div>
            {(data.translateMode ?? "absolute") === "relative" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Only Resname (optional)</label>
                <input type="text" className={inputCls} placeholder="e.g. SOL"
                  value={data.translateResname ?? ""}
                  onChange={(e) => set("translateResname", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()} />
              </div>
            )}
          </>
        )}

        {/* ROTATE */}
        {mode === "rotate" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Mode</label>
              <select className={selectCls} value={data.rotateMode ?? "random"} onChange={(e) => set("rotateMode", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                <option value="random">Random</option>
                <option value="manual">Manual Angles</option>
              </select>
            </div>
            {(data.rotateMode ?? "random") === "manual" && (
              <div className="grid grid-cols-3 gap-2">
                {["rx", "ry", "rz"].map((ax, i) => (
                  <div key={ax}>
                    <label className="text-xs text-muted-foreground block text-center mb-1">{["X°", "Y°", "Z°"][i]}</label>
                    <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                      value={(data as any)[ax] ?? 0}
                      onChange={(e) => set(ax as keyof TransformNodeData, parseFloat(e.target.value) || 0)}
                      onPointerDown={(e) => e.stopPropagation()} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* SCALE */}
        {mode === "scale" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {["sx", "sy", "sz"].map((ax, i) => (
                <div key={ax}>
                  <label className="text-xs text-muted-foreground block text-center mb-1">{["SX", "SY", "SZ"][i]}</label>
                  <input type="number" step="0.01" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                    value={(data as any)[ax] ?? 1.0}
                    onChange={(e) => set(ax as keyof TransformNodeData, parseFloat(e.target.value) || 1.0)}
                    onPointerDown={(e) => e.stopPropagation()} />
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Only Resname (optional)</label>
              <input type="text" className={inputCls} placeholder="e.g. SOL"
                value={data.scaleResname ?? ""}
                onChange={(e) => set("scaleResname", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
          </>
        )}

        {/* BEND */}
        {mode === "bend" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Curvature Radius (Å)</label>
            <input type="number" step="1" min="1" className={inputCls}
              value={data.radius ?? 50}
              onChange={(e) => set("radius", parseFloat(e.target.value) || 50)}
              onPointerDown={(e) => e.stopPropagation()} />
            <p className="text-[10px] text-muted-foreground mt-1">Transforms structure into a cylindrical geometry.</p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
