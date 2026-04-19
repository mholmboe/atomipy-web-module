import React from "react";
import { Handle, Position } from "@xyflow/react";
import { FileText } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function StatsNode({ data, isConnectable }: { data: any; isConnectable: boolean }) {
  const logFile = data.logFile || "output.log";
  const ffname = data.ffname || "minff";

  return (
    <Card className="w-[280px] shadow-sm transition-shadow hover:shadow-md border-primary/20 bg-card">
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="w-3 h-3 bg-primary/80" />
      <CardHeader className="py-3 px-4 bg-muted/30 border-b">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          Structure Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Log Filename</label>
          <Input
            className="nodrag h-8 text-xs font-mono"
            value={logFile}
            onChange={(e) => {
              if (data.onChange) {
                data.onChange({ ...data, logFile: e.target.value });
              }
            }}
            placeholder="output.log"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Forcefield Label</label>
          <select
            className="nodrag w-full text-xs bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            value={ffname}
            onChange={(e) => {
              if (data.onChange) {
                data.onChange({ ...data, ffname: e.target.value });
              }
            }}
          >
            <option value="minff">MINFF</option>
            <option value="clayff">CLAYFF</option>
          </select>
          <p className="text-[10px] text-muted-foreground mt-1">
            Determines the labeling logic in the report.
          </p>
        </div>
      </CardContent>
      <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="w-3 h-3 bg-primary/80" />
    </Card>
  );
}
