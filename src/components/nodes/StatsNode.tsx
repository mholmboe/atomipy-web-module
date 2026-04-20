import React from "react";
import { Handle, Position } from "@xyflow/react";
import { FileText } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function StatsNode({ id, data, isConnectable }: { id: string; data: any; isConnectable: boolean }) {
  const updateNodeData = data.updateNodeData;
  const logFile = data.logFile || "output.log";
  const ffname = data.ffname || "none";
  const showMore = data.showMore || false;

  return (
    <Card className="w-[260px] shadow-sm transition-shadow hover:shadow-md border-primary/20 bg-card">
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="w-3 h-3 bg-primary/80" />
      <CardHeader className="py-2.5 px-4 bg-muted/30 border-b">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Stats Report
          </div>
          <button 
            onClick={() => updateNodeData(id, { ...data, showMore: !showMore })}
            className="text-[10px] text-primary hover:underline font-medium"
          >
            {showMore ? "Less" : "More"}
          </button>
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

        {showMore && (
          <div className="space-y-1.5 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="border-t border-border/50 my-2" />
            <label className="text-[11px] font-medium text-muted-foreground">Forcefield Label (Header)</label>
            <select
              className="nodrag w-full text-xs bg-background border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
              value={ffname}
              onChange={(e) => updateNodeData(id, { ...data, ffname: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="none">None / Native</option>
              <option value="minff">MINFF</option>
              <option value="clayff">CLAYFF</option>
            </select>
            <p className="text-[9px] text-muted-foreground leading-tight">
              Adds a forcefield identifier to the report header.
            </p>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/20 p-1.5 rounded">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Auto-calculates coordination
        </div>
      </CardContent>
      <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="w-3 h-3 bg-primary/80" />
    </Card>
  );
}
