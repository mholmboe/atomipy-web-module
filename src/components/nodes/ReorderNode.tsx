import React from "react";
import { Handle, Position } from "@xyflow/react";
import { ArrowUpDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ReorderNode({ data, isConnectable }: { data: any; isConnectable: boolean }) {
  const byMode = data.byMode || "index";
  const neworder = data.neworder || "";

  return (
    <Card className="w-[300px] shadow-sm transition-shadow hover:shadow-md border-primary/20 bg-card">
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="w-3 h-3 bg-primary/80" />
      <CardHeader className="py-3 px-4 bg-muted/30 border-b">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-primary" />
          Reorder Atoms
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Order By</label>
          <select
            className="nodrag w-full text-xs bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            value={byMode}
            onChange={(e) => {
              if (data.onChange) {
                data.onChange({ ...data, byMode: e.target.value });
              }
            }}
          >
            <option value="index">Index (comma-separated integers)</option>
            <option value="resname">Residue Name (comma-separated)</option>
            <option value="type">Atom Type (comma-separated)</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {byMode === "index" ? "Indices within molecule (e.g. 1, 2, 4, 5)" : "Values (e.g. SOL, MMT, ION)"}
          </label>
          <Input
            className="nodrag h-8 text-xs font-mono"
            value={neworder}
            onChange={(e) => {
              if (data.onChange) {
                data.onChange({ ...data, neworder: e.target.value });
              }
            }}
            placeholder={byMode === "index" ? "1, 2, 4, 5, 8" : "Na, Ow, Hw"}
          />
        </div>
      </CardContent>
      <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="w-3 h-3 bg-primary/80" />
    </Card>
  );
}
