import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { BarChart3, ChevronDown, ChevronUp, Download } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type XrdPlotPoint = [number, number] | { twoTheta?: number; intensity?: number };

type XrdPeak = {
  two_theta: number;
  intensity: number;
  hkl: number[];
  raw_hkl?: number[];
  multiplicity?: number;
  superlattice?: boolean;
};

type XrdPlotData = {
  sourceFile?: string;
  points?: XrdPlotPoint[];
  peaks?: XrdPeak[];
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
  showMiller?: boolean;
  superX?: number;
  superY?: number;
  superZ?: number;
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

const millerLabel = (hkl: number[] | undefined) =>
  Array.isArray(hkl) && hkl.length === 3
    ? `(${Math.abs(hkl[0])}${Math.abs(hkl[1])}${Math.abs(hkl[2])})`
    : "";

function downloadPeaksCsv(peaks: XrdPeak[], sourceFile?: string) {
  const header = "two_theta,intensity,h,k,l,multiplicity,superlattice";
  const rows = peaks.map((p) => {
    const [h, k, l] = Array.isArray(p.hkl) ? p.hkl : [NaN, NaN, NaN];
    return [
      p.two_theta,
      p.intensity,
      h,
      k,
      l,
      p.multiplicity ?? "",
      p.superlattice ? 1 : 0,
    ].join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (sourceFile?.replace(/\.[^.]+$/, "") || "xrd") + "_peaks.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function XrdInlinePlot({ plot, showMiller }: { plot?: XrdPlotData; showMiller?: boolean }) {
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

  const xOf = (tt: number) => left + ((tt - minX) / xRange) * plotWidth;
  const yOf = (i: number) => top + plotHeight - (Math.max(0, i) / yRange) * plotHeight;

  const polyline = points.map((point) => `${xOf(point.twoTheta).toFixed(1)},${yOf(point.intensity).toFixed(1)}`).join(" ");

  // Pick the strongest in-range peaks to label, then thin out any that would
  // collide horizontally in the small plot.
  const peaks = (plot?.peaks ?? []).filter(
    (p) => Array.isArray(p.hkl) && Number.isFinite(p.two_theta) && p.two_theta >= minX && p.two_theta <= maxX,
  );
  const labels: Array<{ x: number; y: number; text: string }> = [];
  if (showMiller && peaks.length) {
    const byStrength = [...peaks].sort((a, b) => b.intensity - a.intensity).slice(0, 10);
    byStrength.sort((a, b) => a.two_theta - b.two_theta);
    let lastX = -Infinity;
    for (const p of byStrength) {
      const x = xOf(p.two_theta);
      if (x - lastX < 22) continue;
      lastX = x;
      labels.push({ x, y: Math.max(top + 6, yOf(p.intensity) - 4), text: millerLabel(p.hkl) });
    }
  }

  return (
    <div className="pt-3 border-t border-border/50">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-blue-500 uppercase">XRD Profile</span>
        <div className="flex items-center gap-2">
          {plot?.peaks && plot.peaks.length > 0 && (
            <button
              type="button"
              className="nodrag flex items-center gap-1 text-[9px] text-muted-foreground hover:text-blue-500"
              onClick={() => downloadPeaksCsv(plot.peaks!, plot.sourceFile)}
              onPointerDown={(e) => e.stopPropagation()}
              title="Download peak list (2θ, hkl, intensity, multiplicity) as CSV"
            >
              <Download className="w-3 h-3" /> peaks.csv
            </button>
          )}
          {plot?.sourceFile && <span className="text-[9px] text-muted-foreground truncate max-w-[88px]">{plot.sourceFile}</span>}
        </div>
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
        {labels.map((lab, idx) => (
          <text
            key={idx}
            x={lab.x}
            y={lab.y}
            textAnchor="middle"
            className="fill-foreground"
            style={{ fontSize: "7px" }}
          >
            {lab.text}
          </text>
        ))}
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = <K extends keyof XrdNodeData>(field: K, value: XrdNodeData[K]) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  const isSupercell = (data.superX ?? 1) > 1 || (data.superY ?? 1) > 1 || (data.superZ ?? 1) > 1;

  return (
    <div className="bg-card w-[280px] shadow-lg rounded-xl border border-blue-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="XRD Simulation" Icon={BarChart3} colorClass="text-blue-500" className="bg-blue-500/10" />

      <div className="p-4 space-y-4 bg-background">
        {/* Instrument Parameters (always visible) */}
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

        {/* Advanced options (collapsible) */}
        <div className="pt-1 border-t border-border/50">
          <button
            type="button"
            className="nodrag w-full flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider hover:text-blue-500 py-1"
            onClick={() => setShowAdvanced((prev) => !prev)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Advanced options
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-2">
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
              <div className="space-y-2">
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

              {/* B-factor / Lorentzian / Neutral */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground block mb-1">B-factor (Å²)</span>
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

              {/* Miller indices + supercell replication */}
              <div className="space-y-2 pt-1 border-t border-border/50">
                <label className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Miller Indices</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`${id}-miller`}
                    className="w-3 h-3 rounded border-border bg-muted"
                    checked={data.showMiller ?? false}
                    onChange={(e) => handleChange("showMiller", e.target.checked)}
                  />
                  <label htmlFor={`${id}-miller`} className="text-[10px] text-muted-foreground uppercase font-bold">Show (hkl) labels above peaks</label>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-1">
                    Supercell replication (nx, ny, nz)
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number" min="1" step="1" aria-label="supercell nx"
                      className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                      value={data.superX ?? 1}
                      onChange={(e) => handleChange("superX", Math.max(1, parseInt(e.target.value) || 1))}
                    />
                    <input
                      type="number" min="1" step="1" aria-label="supercell ny"
                      className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                      value={data.superY ?? 1}
                      onChange={(e) => handleChange("superY", Math.max(1, parseInt(e.target.value) || 1))}
                    />
                    <input
                      type="number" min="1" step="1" aria-label="supercell nz"
                      className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                      value={data.superZ ?? 1}
                      onChange={(e) => handleChange("superZ", Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <span className="block text-[9px] text-muted-foreground/80 mt-1">
                    {isSupercell
                      ? "Miller indices are divided by these factors so peaks are labeled against the underlying cell. Reflections that don't divide evenly are kept as superlattice indices."
                      : "Leave at 1,1,1 for a single cell. Set to the replication used to build a supercell to relabel peaks to the primitive cell."}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <XrdInlinePlot plot={data.xrdPlot} showMiller={data.showMiller} />
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
