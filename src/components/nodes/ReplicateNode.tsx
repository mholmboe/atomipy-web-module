import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, Grid3x3 } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type ReplicateNodeData = {
  x?: number;
  y?: number;
  z?: number;
  keepMolid?: boolean;
  keepResname?: boolean;
  renumberIndex?: boolean;
};

export function ReplicateNode({ id, data }: NodeComponentProps<ReplicateNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = useState(false);

  const handleInputChange = (axis: "x" | "y" | "z", value: string) => {
    updateNodeData(id, { ...data, [axis]: parseInt(value) || 1 });
  };

  const handleBooleanChange = (field: "keepMolid" | "keepResname" | "renumberIndex", value: boolean) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[220px] shadow-lg rounded-xl border border-secondary overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      
      <NodeHeader id={id} title="Replicate" Icon={Grid3x3} colorClass="text-purple-500" className="bg-purple-500/10" />
      <div className="p-4 space-y-3 bg-background">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">X</label>
            <input 
              type="number" min="1" 
              className="nodrag w-full text-center text-sm bg-muted border border-border rounded-md py-1"
              value={data.x || 1}
              onChange={(e) => handleInputChange("x", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">Y</label>
            <input 
              type="number" min="1"
              className="nodrag w-full text-center text-sm bg-muted border border-border rounded-md py-1"
              value={data.y || 1}
              onChange={(e) => handleInputChange("y", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block text-center mb-1">Z</label>
            <input 
              type="number" min="1"
              className="nodrag w-full text-center text-sm bg-muted border border-border rounded-md py-1"
              value={data.z || 1}
              onChange={(e) => handleInputChange("z", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <button
          type="button"
          className="nodrag w-full flex items-center justify-between text-xs font-semibold text-muted-foreground border border-border rounded-md px-2 py-1.5 bg-background hover:bg-muted/50"
          onClick={() => setShowMore((prev) => !prev)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          More options
          {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showMore && (
          <div className="space-y-2 border border-border rounded-md p-2 bg-muted/30">
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Keep original molid
              <input
                type="checkbox"
                className="nodrag"
                checked={data.keepMolid ?? true}
                onChange={(e) => handleBooleanChange("keepMolid", e.target.checked)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Keep original resname
              <input
                type="checkbox"
                className="nodrag"
                checked={data.keepResname ?? true}
                onChange={(e) => handleBooleanChange("keepResname", e.target.checked)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Renumber atom index
              <input
                type="checkbox"
                className="nodrag"
                checked={data.renumberIndex ?? true}
                onChange={(e) => handleBooleanChange("renumberIndex", e.target.checked)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
          </div>
        )}
      </div>
      
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
