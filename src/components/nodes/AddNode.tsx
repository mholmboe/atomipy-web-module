import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Combine, ChevronDown, ChevronUp } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type AddNodeData = {
  reorderMolids?: boolean;
  molid?: number;
  resname?: string;
};

export function AddNode({ id, data }: NodeComponentProps<AddNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = React.useState(false);

  const handleChange = (field: keyof AddNodeData, value: any) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[220px] shadow-lg rounded-xl border border-emerald-500/50 overflow-hidden font-sans select-none">
      <NodeHeader id={id} title="Join Branches" Icon={Combine} colorClass="text-emerald-500" className="bg-emerald-500/10" />

      <div className="p-4 space-y-2 bg-background relative min-h-[120px]">
        <div className="text-[10px] text-muted-foreground italic text-center mb-2">
          Joins multiple branches (1-6) into a single system using ap.update().
        </div>

        <button
          type="button"
          className="nodrag w-full flex items-center justify-between text-xs font-semibold text-muted-foreground border border-border rounded-md px-2 py-1.5 bg-background hover:bg-muted/50"
          onClick={() => setShowMore((prev) => !prev)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          More options
          {showMore ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        {showMore && (
          <div className="space-y-3 border border-border rounded-md p-2 bg-muted/30">
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Reorder molecules
              <input
                type="checkbox"
                className="nodrag"
                checked={data.reorderMolids ?? true}
                onChange={(e) => handleChange("reorderMolids", e.target.checked)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>

            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Set Molid (Optional)</label>
              <input
                type="number"
                min="1"
                placeholder="Auto"
                className="nodrag w-full text-[11px] bg-background border border-border rounded-md px-2 py-1"
                value={data.molid ?? ""}
                onChange={(e) => handleChange("molid", parseInt(e.target.value) || undefined)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Set Resname (Optional)</label>
              <input
                type="text"
                placeholder="Keep original"
                className="nodrag w-full text-[11px] bg-background border border-border rounded-md px-2 py-1"
                value={data.resname ?? ""}
                onChange={(e) => handleChange("resname", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Left} id="in1" style={{ top: '15%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="in2" style={{ top: '30%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="in3" style={{ top: '45%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="in4" style={{ top: '60%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="in5" style={{ top: '75%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="target" position={Position.Left} id="in6" style={{ top: '90%' }} className="w-3 h-3 bg-emerald-400 -left-1.5 border-2 border-background" />
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
