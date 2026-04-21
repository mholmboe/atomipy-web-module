import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { FlaskConical } from "lucide-react";
import type { NodeComponentProps } from "./types";

type ChemMode = "substitute" | "fuse" | "addH";

type ChemistryNodeData = {
  mode?: ChemMode;
  // Substitute
  numOct?: number; o1Type?: string; o2Type?: string; minO2Dist?: number;
  numTet?: number; t1Type?: string; t2Type?: string; minT2Dist?: number;
  loLimit?: number; hiLimit?: number; dimension?: number;
  // Fuse
  fuseRmax?: number; fuseCriteria?: "average" | "occupancy" | "order";
  // AddH
  deltaThreshold?: number; maxAdditions?: number;
};

export function ChemistryNode({ id, data }: NodeComponentProps<ChemistryNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = data.mode ?? "substitute";

  const set = (field: keyof ChemistryNodeData, value: string | number | undefined) =>
    updateNodeData(id, { ...data, [field]: value });

  const inputCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1";
  const selectCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1";
  const numInputCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1";

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-violet-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-violet-500/10 p-3 border-b border-border flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Chemistry</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Operation</label>
          <select className={selectCls} value={mode} onChange={(e) => set("mode", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
            <option value="substitute">Isomorphic Substitution</option>
            <option value="fuse">Fuse Atoms</option>
            <option value="addH">Add Hydrogens</option>
          </select>
        </div>

        {/* SUBSTITUTE */}
        {mode === "substitute" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Oct Count</label>
                <input type="number" min="0" className={numInputCls} value={data.numOct ?? 0} onChange={(e) => set("numOct", parseInt(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Min O2-O2</label>
                <input type="number" step="0.1" className={numInputCls} value={data.minO2Dist ?? 5.5} onChange={(e) => set("minO2Dist", parseFloat(e.target.value) || 5.5)} onPointerDown={(e) => e.stopPropagation()} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" className={inputCls} placeholder="O1 type (Al)" value={data.o1Type ?? "Al"} onChange={(e) => set("o1Type", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
              <input type="text" className={inputCls} placeholder="O2 type (Mgo)" value={data.o2Type ?? "Mgo"} onChange={(e) => set("o2Type", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Tet Count</label>
                <input type="number" min="0" className={numInputCls} value={data.numTet ?? 0} onChange={(e) => set("numTet", parseInt(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Min T2-T2</label>
                <input type="number" step="0.1" className={numInputCls} value={data.minT2Dist ?? 5.5} onChange={(e) => set("minT2Dist", parseFloat(e.target.value) || 5.5)} onPointerDown={(e) => e.stopPropagation()} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" className={inputCls} placeholder="T1 type (Si)" value={data.t1Type ?? "Si"} onChange={(e) => set("t1Type", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
              <input type="text" className={inputCls} placeholder="T2 type (Alt)" value={data.t2Type ?? "Alt"} onChange={(e) => set("t2Type", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" step="0.1" className={numInputCls} placeholder="lo limit"
                value={data.loLimit ?? ""}
                onChange={(e) => { const v = parseFloat(e.target.value); set("loLimit", isFinite(v) ? v : undefined); }}
                onPointerDown={(e) => e.stopPropagation()} />
              <input type="number" step="0.1" className={numInputCls} placeholder="hi limit"
                value={data.hiLimit ?? ""}
                onChange={(e) => { const v = parseFloat(e.target.value); set("hiLimit", isFinite(v) ? v : undefined); }}
                onPointerDown={(e) => e.stopPropagation()} />
              <select className={selectCls} value={data.dimension ?? 3} onChange={(e) => set("dimension", parseInt(e.target.value) || 3)} onPointerDown={(e) => e.stopPropagation()}>
                <option value={1}>X</option>
                <option value={2}>Y</option>
                <option value={3}>Z</option>
              </select>
            </div>
          </>
        )}

        {/* FUSE */}
        {mode === "fuse" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Rmax (Å)</label>
              <input type="number" step="0.05" className={inputCls} value={data.fuseRmax ?? 0.5}
                onChange={(e) => set("fuseRmax", parseFloat(e.target.value) || 0.5)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Criteria</label>
              <select className={selectCls} value={data.fuseCriteria ?? "average"} onChange={(e) => set("fuseCriteria", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                <option value="average">Average</option>
                <option value="occupancy">Occupancy</option>
                <option value="order">Order</option>
              </select>
            </div>
          </>
        )}

        {/* ADD HYDROGENS */}
        {mode === "addH" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">BVS Delta Threshold</label>
              <input type="number" step="0.05" className={inputCls}
                value={data.deltaThreshold ?? -0.5}
                onChange={(e) => set("deltaThreshold", parseFloat(e.target.value) || -0.5)}
                onPointerDown={(e) => e.stopPropagation()} />
              <p className="text-[10px] text-muted-foreground mt-1">Sites with BVS delta below this get an H</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Max Additions</label>
              <input type="number" min="0" className={inputCls}
                value={data.maxAdditions ?? 10}
                onChange={(e) => set("maxAdditions", parseInt(e.target.value) || 0)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
          </>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
