import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { BadgePlus, ChevronDown, ChevronUp, LayoutGrid, Shuffle, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type IonsNodeData = {
  method?: "random" | "grid";
  ionType?: string;
  // Ionize mode specific
  count?: number;
  minDistance?: number;
  placement?: "random" | "surface" | "bulk";
  direction?: "x" | "y" | "z" | "";
  directionValue?: number;
  // Grid mode specific
  density?: number;
  // Shared limits
  xlo?: number;
  ylo?: number;
  zlo?: number;
  xhi?: number;
  yhi?: number;
  zhi?: number;
};

export function IonsNode({ id, data }: NodeComponentProps<IonsNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = useState(false);

  const handleChange = (field: keyof IonsNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  const handleOptionalNumber = (field: keyof IonsNodeData, value: string) => {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) {
      updateNodeData(id, { ...data, [field]: parsed });
    } else {
      updateNodeData(id, { ...data, [field]: undefined });
    }
  };

  const method = data.method || "random";
  const placement = data.placement || "random";
  const direction = data.direction || "";

  return (
    <div className="bg-card w-[260px] shadow-lg rounded-xl border border-blue-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Ions" Icon={BadgePlus} colorClass="text-blue-500" className="bg-blue-500/10" />
      
      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Method</label>
          <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-md">
            <button
              onClick={() => handleChange("method", "random")}
              className={`flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                method === "random" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/50"
              }`}
            >
              <Shuffle className="w-3 h-3" />
              Random
            </button>
            <button
              onClick={() => handleChange("method", "grid")}
              className={`flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                method === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/50"
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              Grid
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Ion Type</label>
            <select 
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
              value={data.ionType || "Na"}
              onChange={(e) => handleChange("ionType", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="Na">Na+</option>
              <option value="K">K+</option>
              <option value="Li">Li+</option>
              <option value="Ca">Ca2+</option>
              <option value="Mg">Mg2+</option>
              <option value="Cl">Cl-</option>
            </select>
          </div>
          {method === "random" ? (
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Count</label>
              <input 
                type="number" min="0"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                value={data.count || 0}
                onChange={(e) => handleChange("count", parseInt(e.target.value) || 0)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Density (M)</label>
              <input 
                type="number" step="0.01" min="0"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                value={data.density || 0.1}
                onChange={(e) => handleChange("density", parseFloat(e.target.value) || 0.1)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>

        {method === "random" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Min Distance (Å)</label>
            <input 
                type="number" step="0.1"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                value={data.minDistance || 3.0}
                onChange={(e) => handleChange("minDistance", parseFloat(e.target.value) || 3.0)}
                onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        )}

        <button
          type="button"
          className="nodrag w-full flex items-center justify-between text-xs font-semibold text-muted-foreground border border-border rounded-md px-2 py-1.5 bg-background hover:bg-muted/50"
          onClick={() => setShowMore((prev) => !prev)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {method === "random" ? "More options" : "Limits (Å)"}
          {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showMore && (
          <div className="space-y-3 border border-border rounded-md p-2 bg-muted/30">
            {method === "random" && (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Placement</label>
                  <select
                    className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                    value={placement}
                    onChange={(e) => handleChange("placement", e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <option value="random">random</option>
                    <option value="surface">surface</option>
                    <option value="bulk">bulk</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Direction</label>
                    <select
                      className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                      value={direction}
                      onChange={(e) => handleChange("direction", e.target.value)}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <option value="">none</option>
                      <option value="x">x</option>
                      <option value="y">y</option>
                      <option value="z">z</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Dir Value</label>
                    <input
                      type="number"
                      step="0.1"
                      className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                      value={data.directionValue ?? ""}
                      placeholder="optional"
                      onChange={(e) => handleOptionalNumber("directionValue", e.target.value)}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="xlo"
                value={data.xlo ?? ""}
                onChange={(e) => handleOptionalNumber("xlo", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="ylo"
                value={data.ylo ?? ""}
                onChange={(e) => handleOptionalNumber("ylo", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="zlo"
                value={data.zlo ?? ""}
                onChange={(e) => handleOptionalNumber("zlo", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="xhi"
                value={data.xhi ?? ""}
                onChange={(e) => handleOptionalNumber("xhi", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="yhi"
                value={data.yhi ?? ""}
                onChange={(e) => handleOptionalNumber("yhi", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="zhi"
                value={data.zhi ?? ""}
                onChange={(e) => handleOptionalNumber("zhi", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
