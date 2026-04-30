import React, { useMemo } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { LineChart, BarChart2 } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type PlotNodeData = {
  fileName?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  plotData?: {
    sourceFile: string;
    points: [number, number][];
  };
};

export function PlotNode({ id, data }: NodeComponentProps<PlotNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = <K extends keyof PlotNodeData>(field: K, value: PlotNodeData[K]) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  const chartData = useMemo(() => {
    if (!data.plotData?.points) return [];
    return data.plotData.points.map(([x, y]) => ({ x, y }));
  }, [data.plotData]);

  return (
    <div className="bg-card w-[340px] shadow-lg rounded-xl border border-indigo-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Data Plotter" Icon={LineChart} colorClass="text-indigo-500" className="bg-indigo-500/10" />

      <div className="p-4 space-y-4 bg-background">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Data Source</label>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <span className="text-[10px] text-muted-foreground block mb-1">File Name (.dat, .csv)</span>
              <input
                type="text"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1.5"
                placeholder="e.g. xrd.dat"
                value={data.fileName ?? "xrd.dat"}
                onChange={(e) => handleChange("fileName", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1">X-Axis Label</span>
              <input
                type="text"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                placeholder="2θ"
                value={data.xAxisLabel ?? ""}
                onChange={(e) => handleChange("xAxisLabel", e.target.value)}
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1">Y-Axis Label</span>
              <input
                type="text"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                placeholder="Intensity"
                value={data.yAxisLabel ?? ""}
                onChange={(e) => handleChange("yAxisLabel", e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Plot Area */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Interactive Plot</span>
            {data.plotData?.sourceFile && (
              <span className="text-[9px] text-muted-foreground truncate max-w-[140px]" title={data.plotData.sourceFile}>
                {data.plotData.sourceFile}
              </span>
            )}
          </div>
          
          <div className="w-full h-[180px] bg-muted/10 rounded-md border border-border relative">
            {chartData.length > 0 ? (
              <div className="absolute inset-0 nodrag cursor-crosshair">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border/40" />
                    <XAxis 
                      dataKey="x" 
                      type="number" 
                      domain={['auto', 'auto']}
                      tick={{ fontSize: 9, fill: 'currentColor' }} 
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      domain={['auto', 'auto']}
                      tick={{ fontSize: 9, fill: 'currentColor' }} 
                      className="text-muted-foreground"
                      width={40}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      labelFormatter={(val) => `${data.xAxisLabel || 'X'}: ${Number(val).toFixed(2)}`}
                      formatter={(val: number) => [val.toFixed(2), data.yAxisLabel || 'Y']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="y" 
                      stroke="rgb(99 102 241)" 
                      strokeWidth={1.5} 
                      dot={false}
                      isAnimationActive={false}
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
                <BarChart2 className="w-8 h-8 mb-2" />
                <span className="text-[10px] text-center px-4">
                  Connect an upstream node to run a simulation and generate plot data.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
