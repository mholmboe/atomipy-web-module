import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Diff } from "lucide-react";
import type { NodeComponentProps } from "./types";

type SubstituteNodeData = {
  numOct?: number;
  o1Type?: string;
  o2Type?: string;
  minO2Dist?: number;
  numTet?: number;
  t1Type?: string;
  t2Type?: string;
  minT2Dist?: number;
  loLimit?: number;
  hiLimit?: number;
  dimension?: number;
};

export function SubstituteNode({ id, data }: NodeComponentProps<SubstituteNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: keyof SubstituteNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  const handleOptionalNumber = (field: keyof SubstituteNodeData, value: string) => {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) {
      handleChange(field, parsed);
    } else {
      updateNodeData(id, { ...data, [field]: undefined });
    }
  };

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-violet-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-violet-500/10 p-3 border-b border-border flex items-center gap-2">
        <Diff className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Substitute</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Oct Count</label>
            <input type="number" min="0" className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1" value={data.numOct || 0} onChange={(e) => handleChange("numOct", parseInt(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Min O2-O2</label>
            <input type="number" step="0.1" className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1" value={data.minO2Dist || 5.5} onChange={(e) => handleChange("minO2Dist", parseFloat(e.target.value) || 5.5)} onPointerDown={(e) => e.stopPropagation()} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input type="text" className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1" placeholder="O1 type (e.g. Al)" value={data.o1Type || "Al"} onChange={(e) => handleChange("o1Type", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
          <input type="text" className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1" placeholder="O2 type (e.g. Mgo)" value={data.o2Type || "Mgo"} onChange={(e) => handleChange("o2Type", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Tet Count</label>
            <input type="number" min="0" className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1" value={data.numTet || 0} onChange={(e) => handleChange("numTet", parseInt(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Min T2-T2</label>
            <input type="number" step="0.1" className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1" value={data.minT2Dist || 5.5} onChange={(e) => handleChange("minT2Dist", parseFloat(e.target.value) || 5.5)} onPointerDown={(e) => e.stopPropagation()} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input type="text" className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1" placeholder="T1 type (e.g. Si)" value={data.t1Type || "Si"} onChange={(e) => handleChange("t1Type", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
          <input type="text" className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1" placeholder="T2 type (e.g. Alt)" value={data.t2Type || "Alt"} onChange={(e) => handleChange("t2Type", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <input type="number" step="0.1" className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1" placeholder="lo limit" value={data.loLimit ?? ""} onChange={(e) => handleOptionalNumber("loLimit", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
          <input type="number" step="0.1" className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1" placeholder="hi limit" value={data.hiLimit ?? ""} onChange={(e) => handleOptionalNumber("hiLimit", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
          <select className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1" value={data.dimension || 3} onChange={(e) => handleChange("dimension", parseInt(e.target.value) || 3)} onPointerDown={(e) => e.stopPropagation()}>
            <option value={1}>X</option>
            <option value={2}>Y</option>
            <option value={3}>Z</option>
          </select>
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
