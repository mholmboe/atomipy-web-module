import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Handle, NodeResizer, Position, useReactFlow, useNodeConnections, useNodesData } from "@xyflow/react";
import { LineChart, BarChart2, Download, ZoomOut, Image as ImageIcon } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
  Brush,
} from "recharts";

type PlotSeries = { name: string; points: [number, number][] };
type ChartType = "line" | "scatter" | "bar";
type NormalizeMode = "none" | "minmax" | "zscore";

type PlotNodeData = {
  fileName?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  width?: number;
  height?: number;
  showGrid?: boolean;
  showDots?: boolean;
  logY?: boolean;
  chartType?: ChartType;
  normalize?: NormalizeMode;
  smooth?: number;       // moving-average window (1 = off)
  lockY?: boolean;       // freeze the Y range (don't autoscale as live data grows)
  showBrush?: boolean;   // pan/zoom mini-map under the chart
  plotData?: {
    sourceFile?: string;
    points?: [number, number][];     // legacy single series
    series?: PlotSeries[];           // multi-series (density per type, thermo quantities…)
    xLabel?: string;
    yLabel?: string;
  };
};

const LIVE_SOURCE_LABEL: Record<string, string> = {
  simulate: "Simulation (thermo)",
  analysis: "Analysis",
  stats: "Structure Stats",
  bvs: "Bond Valence",
};

const SERIES_COLORS = [
  "rgb(99 102 241)", "rgb(16 185 129)", "rgb(239 68 68)", "rgb(245 158 11)",
  "rgb(14 165 233)", "rgb(168 85 247)", "rgb(132 204 22)", "rgb(236 72 153)",
];

function movingAverage(points: [number, number][], w: number): [number, number][] {
  if (w <= 1) return points;
  const half = Math.floor(w / 2);
  return points.map(([x], i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j++) { sum += points[j][1]; n++; }
    return [x, sum / n];
  });
}

function normalizePoints(points: [number, number][], mode: NormalizeMode): [number, number][] {
  if (mode === "none" || points.length === 0) return points;
  const ys = points.map((p) => p[1]);
  if (mode === "minmax") {
    const lo = Math.min(...ys), hi = Math.max(...ys), d = hi - lo || 1;
    return points.map(([x, y]) => [x, (y - lo) / d]);
  }
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const std = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length) || 1;
  return points.map(([x, y]) => [x, (y - mean) / std]);
}

function mergeSeries(series: PlotSeries[]) {
  const rowMap = new Map<number, Record<string, number>>();
  series.forEach((s, si) => {
    s.points.forEach(([x, y]) => {
      const row = rowMap.get(x) ?? { x };
      row[`s${si}`] = y;
      rowMap.set(x, row);
    });
  });
  return {
    rows: Array.from(rowMap.values()).sort((a, b) => a.x - b.x),
    keys: series.map((s, si) => ({ key: `s${si}`, name: s.name })),
  };
}

export function PlotNode({ id, data, selected }: NodeComponentProps<PlotNodeData>) {
  const { updateNodeData } = useReactFlow();

  const handleChange = <K extends keyof PlotNodeData>(field: K, value: PlotNodeData[K]) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  // Resizable like the Viewer node.
  const nodeWidth = Math.max(340, Number.isFinite(data.width) ? Number(data.width) : 480);
  const nodeHeight = Math.max(320, Number.isFinite(data.height) ? Number(data.height) : 460);

  const showGrid = data.showGrid ?? true;
  const showDots = data.showDots ?? false;
  const logY = data.logY ?? false;
  const chartType: ChartType = data.chartType ?? "line";
  const normalize: NormalizeMode = data.normalize ?? "none";
  const smooth = Math.max(1, Number.isFinite(data.smooth) ? Number(data.smooth) : 1);
  const lockY = data.lockY ?? false;
  const showBrush = data.showBrush ?? false;

  // Hide the File Name field when a node streams the plot data live.
  const incoming = useNodeConnections({ handleType: "target" });
  const upstream = useNodesData(incoming.map((c) => c.source));
  const liveSource = useMemo(() => {
    for (const n of upstream) {
      if (!n) continue;
      if (n.type === "analysis" || n.type === "stats" || n.type === "bvs") return n.type;
      if (n.type === "simulate") {
        const d = n.data as Record<string, unknown>;
        const tp = d?.thermoPlots;
        if (Array.isArray(tp) && tp.length > 0) return "simulate";
        const legacy = d?.thermoPlot;
        if (typeof legacy === "string" && legacy !== "" && legacy !== "off") return "simulate";
      }
    }
    return null;
  }, [upstream]);

  const yLabelBase = data.yAxisLabel || data.plotData?.yLabel || "Y";
  const xLabel = data.xAxisLabel || data.plotData?.xLabel || "X";

  // Raw series (untransformed) — used for CSV export.
  const rawSeries: PlotSeries[] = useMemo(() => {
    const pd = data.plotData;
    if (pd?.series && pd.series.length > 0) return pd.series;
    if (pd?.points) return [{ name: yLabelBase, points: pd.points }];
    return [];
  }, [data.plotData, yLabelBase]);

  // Display series: apply smoothing then normalization (display-only transforms).
  const displaySeries: PlotSeries[] = useMemo(() => {
    let s = rawSeries;
    if (smooth > 1) s = s.map((ser) => ({ name: ser.name, points: movingAverage(ser.points, smooth) }));
    if (normalize !== "none") s = s.map((ser) => ({ name: ser.name, points: normalizePoints(ser.points, normalize) }));
    return s;
  }, [rawSeries, smooth, normalize]);

  const { chartData, seriesKeys } = useMemo(() => {
    if (displaySeries.length === 0) return { chartData: [] as Record<string, number>[], seriesKeys: [] as { key: string; name: string }[] };
    const { rows, keys } = mergeSeries(displaySeries);
    return { chartData: rows, seriesKeys: keys };
  }, [displaySeries]);

  const yLabel = data.yAxisLabel || (normalize === "minmax" ? "normalized (0–1)" : normalize === "zscore" ? "z-score" : (data.plotData?.yLabel || "Y"));

  // ─── Series show/hide (legend click) ───
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggleHidden = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // ─── Zoom (X drag; Y auto-fits) ───
  const [drag, setDrag] = useState<{ x1: number | null; x2: number | null }>({ x1: null, x2: null });
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  useEffect(() => { if (chartData.length === 0) setZoomDomain(null); }, [chartData.length]);

  const endDrag = useCallback(() => {
    setDrag((d) => {
      if (d.x1 != null && d.x2 != null && d.x1 !== d.x2) setZoomDomain([Math.min(d.x1, d.x2), Math.max(d.x1, d.x2)]);
      return { x1: null, x2: null };
    });
  }, []);

  // ─── Lock Y: freeze the Y range at the moment the lock is turned on ───
  const [lockedY, setLockedY] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!lockY) { setLockedY(null); return; }
    const ys: number[] = [];
    for (const row of chartData) for (const sk of seriesKeys) { const v = row[sk.key]; if (typeof v === "number" && Number.isFinite(v)) ys.push(v); }
    if (ys.length) setLockedY([Math.min(...ys), Math.max(...ys)]);
    // Freeze at toggle time — intentionally not re-running as data streams in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockY]);

  // ─── Effective Y axis. Precedence: log > x-zoom auto-fit > lock > auto ───
  const yAxis = useMemo(() => {
    const ys: number[] = [];
    for (const row of chartData) {
      if (zoomDomain && (row.x < zoomDomain[0] || row.x > zoomDomain[1])) continue;
      for (const sk of seriesKeys) {
        if (hidden.has(sk.key)) continue;
        const v = row[sk.key];
        if (typeof v === "number" && Number.isFinite(v)) ys.push(v);
      }
    }
    if (logY) {
      const pos = ys.filter((v) => v > 0);
      if (pos.length) return { scale: "log" as const, domain: [Math.min(...pos) * 0.9, Math.max(...pos) * 1.1] as [number, number], overflow: true, logFailed: false };
      return { scale: "auto" as const, domain: ["auto", "auto"] as [string, string], overflow: false, logFailed: true };
    }
    if (zoomDomain && ys.length) {
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const pad = (hi - lo) * 0.05 || Math.abs(hi) * 0.05 || 1;
      return { scale: "auto" as const, domain: [lo - pad, hi + pad] as [number, number], overflow: true, logFailed: false };
    }
    if (lockedY) return { scale: "auto" as const, domain: lockedY, overflow: true, logFailed: false };
    return { scale: "auto" as const, domain: ["auto", "auto"] as [string, string], overflow: false, logFailed: false };
  }, [chartData, seriesKeys, zoomDomain, logY, lockedY, hidden]);

  // ─── Exports ───
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const exportBase = () =>
    (data.plotData?.sourceFile || data.fileName || "plot").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_") || "plot";

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = useCallback(() => {
    if (!rawSeries.length) return;
    const { rows, keys } = mergeSeries(rawSeries);
    const header = [xLabel, ...keys.map((s) => s.name)];
    const lines = [header.join(",")];
    for (const row of rows) lines.push([row.x, ...keys.map((s) => (row[s.key] ?? ""))].join(","));
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv" }), `${exportBase()}.csv`);
  }, [rawSeries, xLabel, data.plotData?.sourceFile, data.fileName]);

  const exportImage = useCallback((fmt: "svg" | "png") => {
    const svg = chartWrapRef.current?.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(rect.width));
    clone.setAttribute("height", String(rect.height));
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    if (fmt === "svg") { downloadBlob(new Blob([xml], { type: "image/svg+xml" }), `${exportBase()}.svg`); return; }
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = rect.width * scale; canvas.height = rect.height * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) { ctx.scale(scale, scale); ctx.drawImage(img, 0, 0); canvas.toBlob((b) => b && downloadBlob(b, `${exportBase()}.png`)); }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [data.plotData?.sourceFile, data.fileName]);

  const tglCls = (on: boolean) =>
    `nodrag px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${
      on ? "bg-indigo-500 text-white border-indigo-500" : "bg-muted text-muted-foreground border-border hover:bg-indigo-500/20"
    }`;
  const iconBtn = "nodrag flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border border-border bg-muted text-muted-foreground hover:bg-indigo-500/20 disabled:opacity-40";

  return (
    <div className="relative" style={{ width: nodeWidth, height: nodeHeight }}>
      <NodeResizer
        isVisible={Boolean(selected)}
        minWidth={340}
        minHeight={320}
        lineClassName="border-indigo-400/70"
        handleClassName="w-2.5 h-2.5 bg-indigo-500 border border-white rounded-sm"
        onResizeEnd={(_, params) => updateNodeData(id, { ...data, width: Math.round(params.width), height: Math.round(params.height) })}
      />
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-card w-full h-full shadow-lg rounded-xl border border-indigo-500/50 overflow-hidden font-sans select-none flex flex-col">
        <NodeHeader id={id} title="Data Plotter" Icon={LineChart} colorClass="text-indigo-500" className="bg-indigo-500/10 shrink-0" />

        <div className="p-3 bg-background flex flex-col gap-2 flex-1 min-h-0">
          {/* Data source */}
          {liveSource ? (
            <div className="text-[10px] text-muted-foreground bg-muted/50 border border-border rounded-md px-2 py-1 shrink-0">
              Live from connected <span className="font-semibold text-foreground">{LIVE_SOURCE_LABEL[liveSource] ?? liveSource}</span> node
            </div>
          ) : (
            <div className="shrink-0">
              <span className="text-[10px] text-muted-foreground block mb-1">File Name (.dat, .log, .csv)</span>
              <input
                type="text"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                placeholder="e.g. output.log"
                value={data.fileName ?? "output.log"}
                onChange={(e) => handleChange("fileName", e.target.value)}
              />
            </div>
          )}

          {/* Axis labels */}
          <div className="grid grid-cols-2 gap-2 shrink-0">
            <input
              type="text"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
              placeholder={`X: ${data.plotData?.xLabel || "auto"}`}
              value={data.xAxisLabel ?? ""}
              onChange={(e) => handleChange("xAxisLabel", e.target.value)}
            />
            <input
              type="text"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
              placeholder={`Y: ${data.plotData?.yLabel || "auto"}`}
              value={data.yAxisLabel ?? ""}
              onChange={(e) => handleChange("yAxisLabel", e.target.value)}
            />
          </div>

          {/* Options row 1: chart type + normalize + smooth */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex rounded overflow-hidden border border-border">
              {(["line", "scatter", "bar"] as ChartType[]).map((t) => (
                <button key={t} className={`nodrag px-1.5 py-0.5 text-[9px] font-bold capitalize ${chartType === t ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground hover:bg-indigo-500/20"}`} onClick={() => handleChange("chartType", t)}>{t}</button>
              ))}
            </div>
            <select
              className="nodrag text-[9px] font-bold bg-muted border border-border rounded px-1 py-0.5 text-muted-foreground"
              value={normalize}
              onChange={(e) => handleChange("normalize", e.target.value as NormalizeMode)}
              title="Normalize each series so mixed-unit quantities share the Y axis"
            >
              <option value="none">Norm: off</option>
              <option value="minmax">Norm: 0–1</option>
              <option value="zscore">Norm: z-score</option>
            </select>
            <label className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground" title="Moving-average window (points). 1 = off.">
              Smooth
              <input
                type="number" min={1} max={999}
                className="nodrag w-11 text-[9px] bg-muted border border-border rounded px-1 py-0.5"
                value={smooth}
                onChange={(e) => handleChange("smooth", Math.max(1, parseInt(e.target.value) || 1))}
              />
            </label>
          </div>

          {/* Options row 2: display toggles + exports */}
          <div className="flex items-center justify-between gap-1 shrink-0 flex-wrap">
            <div className="flex items-center gap-1">
              <button className={tglCls(showGrid)} onClick={() => handleChange("showGrid", !showGrid)} title="Toggle grid">Grid</button>
              <button className={tglCls(showDots)} onClick={() => handleChange("showDots", !showDots)} title="Toggle point markers">Dots</button>
              <button className={tglCls(logY)} onClick={() => handleChange("logY", !logY)} title="Logarithmic Y axis (positive data only)">log Y</button>
              <button className={tglCls(lockY)} onClick={() => handleChange("lockY", !lockY)} title="Freeze the Y range (stop autoscaling as live data grows)">Lock Y</button>
              <button className={tglCls(showBrush)} onClick={() => handleChange("showBrush", !showBrush)} title="Pan/zoom mini-map under the chart">Pan</button>
            </div>
            <div className="flex items-center gap-1">
              {yAxis.logFailed && <span className="text-[9px] text-amber-500 font-semibold" title="Log scale is undefined for zero/negative values (e.g. potential energy). Showing linear.">log +ve only</span>}
              {zoomDomain && (
                <button className={iconBtn} onClick={() => setZoomDomain(null)} title="Reset zoom to full range"><ZoomOut className="w-3 h-3" /></button>
              )}
              <button className={iconBtn} onClick={downloadCsv} disabled={!chartData.length} title="Download data as CSV"><Download className="w-3 h-3" />CSV</button>
              <button className={iconBtn} onClick={() => exportImage("png")} disabled={!chartData.length} title="Export chart as PNG"><ImageIcon className="w-3 h-3" />PNG</button>
              <button className={iconBtn} onClick={() => exportImage("svg")} disabled={!chartData.length} title="Export chart as SVG">SVG</button>
            </div>
          </div>

          {/* Chart */}
          <div className="w-full flex-1 min-h-0 bg-muted/10 rounded-md border border-border relative" ref={chartWrapRef}>
            {chartData.length > 0 ? (
              <div
                className="absolute inset-0 nodrag nowheel cursor-crosshair"
                onDoubleClick={(e) => { e.stopPropagation(); setZoomDomain(null); }}
                title="Drag horizontally to zoom · double-click to reset"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 10, right: 14, left: 6, bottom: 18 }}
                    onMouseDown={(e: { activeLabel?: string | number }) => {
                      const v = e && e.activeLabel != null ? Number(e.activeLabel) : null;
                      if (v != null && Number.isFinite(v)) setDrag({ x1: v, x2: v });
                    }}
                    onMouseMove={(e: { activeLabel?: string | number }) => {
                      if (drag.x1 == null) return;
                      const v = e && e.activeLabel != null ? Number(e.activeLabel) : null;
                      if (v != null && Number.isFinite(v)) setDrag((d) => ({ ...d, x2: v }));
                    }}
                    onMouseUp={endDrag}
                    onMouseLeave={() => setDrag({ x1: null, x2: null })}
                  >
                    {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border/40" />}
                    <XAxis
                      dataKey="x" type="number"
                      domain={zoomDomain ?? ["auto", "auto"]}
                      allowDataOverflow={!!zoomDomain}
                      tick={{ fontSize: 9, fill: "currentColor" }}
                      className="text-muted-foreground"
                      label={{ value: xLabel, position: "insideBottom", offset: -8, fontSize: 10, fill: "currentColor" }}
                    />
                    <YAxis
                      domain={yAxis.domain} scale={yAxis.scale} allowDataOverflow={yAxis.overflow}
                      tick={{ fontSize: 9, fill: "currentColor" }}
                      className="text-muted-foreground" width={46}
                      label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 10, fill: "currentColor", style: { textAnchor: "middle" } }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      labelFormatter={(val) => `${xLabel}: ${Number(val).toFixed(2)}`}
                    />
                    {seriesKeys.length > 1 && (
                      <Legend
                        wrapperStyle={{ fontSize: "9px", cursor: "pointer" }}
                        onClick={(o: { dataKey?: string | number }) => o?.dataKey != null && toggleHidden(String(o.dataKey))}
                      />
                    )}
                    {seriesKeys.map((sk, i) => {
                      const color = SERIES_COLORS[i % SERIES_COLORS.length];
                      const isHidden = hidden.has(sk.key);
                      if (chartType === "bar") {
                        return <Bar key={sk.key} dataKey={sk.key} name={sk.name} fill={color} hide={isHidden} isAnimationActive={false} />;
                      }
                      // 'scatter' is a Line with no stroke + visible dots (robust vs. a separate Scatter series).
                      return (
                        <Line
                          key={sk.key} type="monotone" dataKey={sk.key} name={sk.name}
                          stroke={color}
                          strokeWidth={chartType === "scatter" ? 0 : 1.5}
                          dot={chartType === "scatter" ? { r: 1.8 } : (showDots ? { r: 1.5 } : false)}
                          hide={isHidden} isAnimationActive={false} connectNulls
                        />
                      );
                    })}
                    {drag.x1 != null && drag.x2 != null && drag.x1 !== drag.x2 && (
                      <ReferenceArea x1={drag.x1} x2={drag.x2} strokeOpacity={0.3} fill="rgb(99 102 241)" fillOpacity={0.12} />
                    )}
                    {showBrush && <Brush dataKey="x" height={16} stroke="rgb(99 102 241)" travellerWidth={6} tickFormatter={(v) => Number(v).toFixed(0)} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/50">
                <BarChart2 className="w-8 h-8 mb-2" />
                <span className="text-[10px] text-center px-4">Connect an upstream node to run a simulation and generate plot data.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
