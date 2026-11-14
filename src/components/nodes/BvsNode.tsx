import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Calculator } from "lucide-react";
import type { NodeComponentProps } from "./types";

type BvsNodeData = {
  topN?: number;
  logFile?: string;
  writeCsv?: boolean;
  csvFile?: string;
};

export function BvsNode({ id, data }: NodeComponentProps<BvsNodeData>) {
  const { updateNodeData } = useReactFlow();
  const writeCsv = data.writeCsv ?? true;

  const handleChange = (field: keyof BvsNodeData, value: string | number | boolean) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[260px] shadow-lg rounded-xl border border-rose-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-rose-500/10 p-3 border-b border-border flex items-center gap-2">
        <Calculator className="w-4 h-4 text-rose-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">BVS Analysis</h3>
      </div>

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Top-N worst atoms</label>
          <input
            type="number"
            min="1"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={data.topN || 10}
            onChange={(e) => handleChange("topN", parseInt(e.target.value) || 10)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">BVS log file</label>
          <input
            type="text"
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            value={data.logFile || "bvs_summary.log"}
            onChange={(e) => handleChange("logFile", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>

        <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
          Write detailed CSV
          <input
            type="checkbox"
            className="nodrag"
            checked={writeCsv}
            onChange={(e) => handleChange("writeCsv", e.target.checked)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </label>

        {writeCsv && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">CSV file</label>
            <input
              type="text"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
              value={data.csvFile || "bvs_results.csv"}
              onChange={(e) => handleChange("csvFile", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
