import React from "react";
import { Handle, Position } from "@xyflow/react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart, Maximize2 } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

export type PlotNodeData = {
  title?: string;
  xlabel?: string;
  ylabel?: string;
  plotData?: {
    x: number[];
    y: number[];
    title?: string;
    xlabel?: string;
    ylabel?: string;
  };
};

export function PlotNode({ id, data }: NodeComponentProps<PlotNodeData>) {
  const chartData = React.useMemo(() => {
    if (!data.plotData || !data.plotData.x || !data.plotData.y) return [];
    return data.plotData.x.map((xVal, i) => ({
      x: xVal,
      y: data.plotData!.y[i],
    }));
  }, [data.plotData]);

  const hasData = chartData.length > 0;

  return (
    <div className="bg-card w-[450px] shadow-lg rounded-xl border border-indigo-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader 
        id={id} 
        title={data.plotData?.title || data.title || "Data Plot"} 
        Icon={BarChart} 
        colorClass="text-indigo-500" 
        className="bg-indigo-500/10" 
      />

      <div className="p-4 bg-background min-h-[300px]">
        {hasData ? (
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis 
                  dataKey="x" 
                  type="number" 
                  domain={['auto', 'auto']} 
                  label={{ value: data.plotData?.xlabel || data.xlabel || "X", position: 'insideBottom', offset: -5, fontSize: 10, fill: '#888' }}
                  tick={{ fontSize: 10, fill: '#666' }}
                  stroke="#444"
                />
                <YAxis 
                  label={{ value: data.plotData?.ylabel || data.ylabel || "Y", angle: -90, position: 'insideLeft', fontSize: 10, fill: '#888' }}
                  tick={{ fontSize: 10, fill: '#666' }}
                  stroke="#444"
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: 10 }}
                  itemStyle={{ color: '#indigo-400' }}
                  labelStyle={{ color: '#888' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="y" 
                  stroke="#6366f1" 
                  strokeWidth={2} 
                  dot={false} 
                  animationDuration={500}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[250px] flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg text-muted-foreground bg-muted/20">
            <BarChart className="w-12 h-12 opacity-20 mb-2" />
            <p className="text-xs">No data to plot yet.</p>
            <p className="text-[10px] opacity-60">Run the workflow to see results.</p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
