import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { FileText } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { NodeComponentProps } from "./types";

type StatsNodeData = {
  logFile?: string;
};

type StatsNodeProps = NodeComponentProps<StatsNodeData> & {
  isConnectable?: boolean;
};

export function StatsNode({ id, data, isConnectable = true }: StatsNodeProps) {
  const { updateNodeData } = useReactFlow();
  const logFile = data.logFile || "output.log";

  return (
    <Card className="w-[260px] shadow-sm transition-shadow hover:shadow-md border-primary/20 bg-card">
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="w-3 h-3 bg-primary/80" />
      <CardHeader className="py-2.5 px-4 bg-muted/30 border-b">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          Structure Stats
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Log Filename</label>
          <Input
            className="nodrag h-7 text-xs font-mono bg-muted/40"
            value={logFile}
            onChange={(e) => updateNodeData(id, { ...data, logFile: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="output.log"
          />
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/20 p-1.5 rounded">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Auto-calculates coordination
        </div>
      </CardContent>
      <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="w-3 h-3 bg-primary/80" />
    </Card>
  );
}
