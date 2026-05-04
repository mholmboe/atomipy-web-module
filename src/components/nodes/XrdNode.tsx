import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { BarChart3, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type XrdPlotPoint = [number, number] | { twoTheta?: number; intensity?: number };

type XrdPlotData = {
  sourceFile?: string;
  points?: XrdPlotPoint[];
};

export type XrdNodeData = {
  wavelength?: number;
  angleStep?: number;
  twoThetaMin?: number;
  twoThetaMax?: number;
  fwhm00l?: number;
  fwhmhk0?: number;
  fwhmhkl?: number;
  bAll?: number;
  lorentzianFactor?: number;
  neutralAtoms?: boolean;
  pref?: number;
  prefH?: number;
  prefK?: number;
  prefL?: number;
  xrdPlot?: XrdPlotData;
};

const normalizePlotPoints = (points: XrdPlotPoint[] | undefined) =>
  (points ?? [])
    .map((point) => {
      const twoTheta = Array.isArray(point) ? point[0] : point.twoTheta;
      const intensity = Array.isArray(point) ? point[1] : point.intensity;
      return {
        twoTheta: typeof twoTheta === "number" ? twoTheta : Number.NaN,
        intensity: typeof intensity === "number" ? intensity : Number.NaN,
      };
    })
    .filter((point) => Number.isFinite(point.twoTheta) && Number.isFinite(point.intensity));

function XrdInlinePlot({ plot }: { plot?: XrdPlotData }) {
  const points = normalizePlotPoints(plot?.points);
  if (points.length < 2) return null;

  const width = 236;
  const height = 132;
  const left = 34;
  const right = 8;
  const top = 10;
  const bottom = 24;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const minX = Math.min(...points.map((point) => point.twoTheta));
  const maxX = Math.max(...points.map((point) => point.twoTheta));
  const maxY = Math.max(1, ...points.map((point) => point.intensity));
  const xRange = Math.max(1e-9, maxX - minX);
  const yRange = Math.max(1e-9, maxY);

  const polyline = points
    .map((point) => {
      const x = left + ((point.twoTheta - minX) / xRange) * plotWidth;
      const y = top + plotHeight - (Math.max(0, point.intensity) / yRange) * plotHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="pt-3 border-t border-border/50">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-blue-500 uppercase">XRD Profile</span>
        {plot?.sourceFile && <span className="text-[9px] text-muted-foreground truncate max-w-[118px]">{plot.sourceFile}</span>}
      </div>
      <svg
        className="nodrag w-full h-[132px] rounded-md border border-border bg-muted/20"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="XRD intensity profile"
      >
        <line x1={left} y1={top} x2={left} y2={top + plotHeight} stroke="currentColor" className="text-border" />
        <line x1={left} y1={top + plotHeight} x2={left + plotWidth} y2={top + plotHeight} stroke="currentColor" className="text-border" />
        <polyline points={polyline} fill="none" stroke="rgb(59 130 246)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        <text x={left} y={height - 7} className="fill-muted-foreground text-[9px]">
          {minX.toFixed(1)}°
        </text>
        <text x={left + plotWidth} y={height - 7} textAnchor="end" className="fill-muted-foreground text-[9px]">
          {maxX.toFixed(1)}°
        </text>
        <text x={left + plotWidth / 2} y={height - 7} textAnchor="middle" className="fill-muted-foreground text-[9px]">
          2θ
        </text>
        <text x={left - 5} y={top + 6} textAnchor="end" className="fill-muted-foreground text-[9px]">
          {maxY.toFixed(0)}
        </text>
        <text x={left - 5} y={top + plotHeight} textAnchor="end" className="fill-muted-foreground text-[9px]">
          0
        </text>
      </svg>
    </div>
  );
}

export function XrdNode({ id, data }: NodeComponentProps<XrdNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = <K extends keyof XrdNodeData>(field: K, value: XrdNodeData[K]) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[280px] shadow-lg rounded-xl border border-blue-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="XRD Simulation" Icon={BarChart3} colorClass="text-blue-500" className="bg-blue-500/10" />

      <div className="p-4 space-y-4 bg-background">
        {/* Instrument Parameters */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Instrument</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1">λ (Å)</span>
              <input
                type="number" step="0.00001"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                value={data.wavelength ?? 1.54187}
                onChange={(e) => handleChange("wavelength", parseFloat(e.target.value))}
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1">Step (°)</span>
              <input
                type="number" step="0.01"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                value={data.angleStep ?? 0.02}
                onChange={(e) => handleChange("angleStep", parseFloat(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1">2θ Min (°)</span>
              <input
                type="number" step="1"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                value={data.twoThetaMin ?? 2.0}
                onChange={(e) => handleChange("twoThetaMin", parseFloat(e.target.value))}
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1">2θ Max (°)</span>
              <input
                type="number" step="1"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                value={data.twoThetaMax ?? 90.0}
                onChange={(e) => handleChange("twoThetaMax", parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Peak Broadening (FWHM) */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Broadening (FWHM °)</label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1 text-center">00l</span>
              <input
                type="number" step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                value={data.fwhm00l ?? 1.0}
                onChange={(e) => handleChange("fwhm00l", parseFloat(e.target.value))}
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1 text-center">hk0</span>
              <input
                type="number" step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                value={data.fwhmhk0 ?? 0.5}
                onChange={(e) => handleChange("fwhmhk0", parseFloat(e.target.value))}
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1 text-center">hkl</span>
              <input
                type="number" step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                value={data.fwhmhkl ?? 0.5}
                onChange={(e) => handleChange("fwhmhkl", parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Preferred Orientation */}
        <div className="space-y-2 pt-1 border-t border-border/50">
          <label className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Preferred Orientation</label>
          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-1">
              <span className="text-[10px] text-muted-foreground block mb-1">Pref.</span>
              <input
                type="number" step="0.1"
                className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                placeholder="0"
                value={data.pref ?? 0}
                onChange={(e) => handleChange("pref", parseFloat(e.target.value))}
              />
            </div>
            <div className="col-span-3 grid grid-cols-3 gap-1">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1 text-center">h</span>
                <input
                  type="number"
                  className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                  value={data.prefH ?? 0}
                  onChange={(e) => handleChange("prefH", parseInt(e.target.value))}
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1 text-center">k</span>
                <input
                  type="number"
                  className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                  value={data.prefK ?? 0}
                  onChange={(e) => handleChange("prefK", parseInt(e.target.value))}
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1 text-center">l</span>
                <input
                  type="number"
                  className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                  value={data.prefL ?? 1}
                  onChange={(e) => handleChange("prefL", parseInt(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Options */}
        <div className="space-y-2 pt-1 border-t border-border/50">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1">B-factor</span>
              <input
                type="number" step="0.1"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                value={data.bAll ?? 0.0}
                onChange={(e) => handleChange("bAll", parseFloat(e.target.value))}
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1">Lorentzian</span>
              <input
                type="number" step="0.1" min="0" max="1"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                value={data.lorentzianFactor ?? 1.0}
                onChange={(e) => handleChange("lorentzianFactor", parseFloat(e.target.value))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id={`${id}-neutral`}
              className="w-3 h-3 rounded border-border bg-muted"
              checked={data.neutralAtoms ?? false}
              onChange={(e) => handleChange("neutralAtoms", e.target.checked)}
            />
            <label htmlFor={`${id}-neutral`} className="text-[10px] text-muted-foreground uppercase font-bold">Use Neutral Atoms</label>
          </div>
        </div>

        <XrdInlinePlot plot={data.xrdPlot} />
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
      <Handle type="source" position={Position.Right} id="data" style={{ top: '80%' }} className="w-3 h-3 bg-indigo-500" title="Plot Data" />
    </div>
  );
}
