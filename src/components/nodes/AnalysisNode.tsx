import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { BarChart3, ChevronDown, ChevronUp, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type AnalysisMode = "rdf" | "density" | "msd" | "vacf" | "hbond" | "cn" | "closest" | "mindist" | "occupancy" | "bvs" | "distortion" | "stats";

type OutputMode = "none" | "json" | "csv" | "both";
type ClosestReferenceMode = "index" | "coords";

type AnalysisNodeData = {
  mode?: AnalysisMode;
  atomTypeA?: string;
  atomTypeB?: string;
  cutoff?: number;
  rmax?: number;
  dr?: number;
  // Min distances
  mindistGroupBy?: "molid" | "resname";
  mindistNPairs?: number;
  mindistCutoff?: number;
  mindistOutputMode?: OutputMode;
  mindistOutputBase?: string;
  // Closest
  closestReferenceMode?: ClosestReferenceMode;
  closestRefIndex?: number;
  closestRefX?: number;
  closestRefY?: number;
  closestRefZ?: number;
  closestOutputMode?: OutputMode;
  closestOutputBase?: string;
  // Occupancy
  occupancyRmax?: number;
  occupancyOutputMode?: OutputMode;
  occupancyOutputBase?: string;
  // RDF/CN output
  rdfOutputMode?: OutputMode;
  rdfOutputBase?: string;
  rdfPlot?: "gr" | "cn" | "both";
  // Density profile
  densityAxis?: "x" | "y" | "z";
  densityBins?: number;
  densityMode?: "number" | "mass" | "charge";
  densityTypes?: string;
  densityOutputBase?: string;
  // MSD / diffusion
  msdTypes?: string;
  msdDims?: "xyz" | "xy" | "z";
  msdDt?: number;
  msdOriginStride?: number;
  msdPlot?: "msd" | "dist";
  msdOutputBase?: string;
  // VACF / power spectrum / Green-Kubo
  vacfTypes?: string;
  vacfDt?: number;
  vacfOriginStride?: number;
  vacfPlot?: "spectrum" | "vacf";
  vacfOutputBase?: string;
  // H-bonding
  hbondDonors?: string;
  hbondAcceptors?: string;
  hbondDonorResnames?: string;
  hbondAcceptorResnames?: string;
  hbondRcut?: number;
  hbondAngle?: number;
  hbondExcludeSameMol?: boolean;
  hbondPlot?: "dist" | "series";
  hbondOutputBase?: string;
  cnOutputMode?: OutputMode;
  cnOutputBase?: string;
  // BVS
  topN?: number;
  bvsLogFile?: string;
  writeCsv?: boolean;
  csvFile?: string;
  // Ditrigonal / tetrahedral distortion
  distTetTypes?: string;
  distBondCutoff?: number;
  distTetTetCutoff?: number;
  distAlignTol?: number;
  distAxis?: "x" | "y" | "z";
  distPlot?: "alpha" | "angles" | "dz";
  distOutputBase?: string;
  // Stats
  statsLogFile?: string;
};

export function AnalysisNode({ id, data }: NodeComponentProps<AnalysisNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = (data.mode ?? "rdf") as AnalysisMode;

  const set = (field: keyof AnalysisNodeData, value: string | number | boolean) =>
    updateNodeData(id, { ...data, [field]: value });

  const inputCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1";
  const selectCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1";

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-fuchsia-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Analysis Ops" Icon={BarChart3} colorClass="text-blue-500" className="bg-blue-500/10" />

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Analysis Mode</label>
          <select
            className={selectCls}
            value={mode}
            onChange={(e) => set("mode", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="rdf">Radial Distribution (RDF)</option>
            <option value="density">Density Profile (x/y/z)</option>
            <option value="msd">MSD / Diffusion</option>
            <option value="vacf">VACF / Power spectrum</option>
            <option value="hbond">Hydrogen Bonds</option>
            <option value="cn">Coordination Number</option>
            <option value="closest">Find Closest Atom</option>
            <option value="mindist">Min Distances (Inter-mol)</option>
            <option value="occupancy">Site Occupancy</option>
            <option value="bvs">Bond Valence Sum (BVS)</option>
            <option value="distortion">Ditrigonal Distortion (α)</option>
            <option value="stats">Structure Stats</option>
          </select>
        </div>

        {mode === "rdf" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Type A</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.atomTypeA ?? "Na"}
                  onChange={(e) => set("atomTypeA", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Type B</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.atomTypeB ?? "Cl"}
                  onChange={(e) => set("atomTypeB", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">R-max (A)</label>
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  value={data.rmax ?? 12.0}
                  onChange={(e) => set("rmax", parseFloat(e.target.value) || 12.0)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">dr (A)</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={data.dr ?? 0.1}
                  onChange={(e) => set("dr", parseFloat(e.target.value) || 0.1)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output</label>
                <select
                  className={selectCls}
                  value={data.rdfOutputMode ?? "json"}
                  onChange={(e) => set("rdfOutputMode", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="both">JSON + CSV</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.rdfOutputBase ?? "rdf_results"}
                  onChange={(e) => set("rdfOutputBase", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Plot</label>
              <select
                className={selectCls}
                value={data.rdfPlot ?? "gr"}
                onChange={(e) => set("rdfPlot", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="gr">g(r)</option>
                <option value="cn">Running coordination n(r)</option>
                <option value="both">Both (shared axis)</option>
              </select>
            </div>
            <p className="text-[9px] text-muted-foreground/60 leading-snug">
              Computes g(r) <strong>and</strong> the running coordination number n(r) = ∫g(r)·4πr²ρ dr (both exported to .dat/.json; CN within R-max printed to console). Ensemble-averaged over a connected trajectory. Use trajectory atom names (e.g. <code>OW</code>). Connect a Data Plotter to chart it.
            </p>
          </div>
        )}

        {mode === "density" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Axis</label>
                <select
                  className={selectCls}
                  value={data.densityAxis ?? "z"}
                  onChange={(e) => set("densityAxis", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="x">x</option>
                  <option value="y">y</option>
                  <option value="z">z</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Quantity</label>
                <select
                  className={selectCls}
                  value={data.densityMode ?? "number"}
                  onChange={(e) => set("densityMode", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="number">Number (atoms/Å³)</option>
                  <option value="mass">Mass (g/cm³)</option>
                  <option value="charge">Charge (e/Å³)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">
                Atom types <span className="font-normal opacity-60">(comma-sep; blank = all; one curve per type)</span>
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. OW, Na"
                value={data.densityTypes ?? ""}
                onChange={(e) => set("densityTypes", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Bins</label>
                <input
                  type="number"
                  step="10"
                  className={inputCls}
                  value={data.densityBins ?? 100}
                  onChange={(e) => set("densityBins", Math.max(2, parseInt(e.target.value) || 100))}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.densityOutputBase ?? "density_profile"}
                  onChange={(e) => set("densityOutputBase", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground/60 leading-snug">
              Profile along the chosen axis, <strong>averaged over all trajectory frames</strong> (or the single structure). Charge mode needs per-atom charges (structure input, not a PDB trajectory). Connect a Data Plotter to chart it.
            </p>
          </div>
        )}

        {mode === "msd" && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">
                Atom types <span className="font-normal opacity-60">(comma-sep; e.g. Na, OW)</span>
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. Na"
                value={data.msdTypes ?? ""}
                onChange={(e) => set("msdTypes", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Dimensionality</label>
                <select
                  className={selectCls}
                  value={data.msdDims ?? "xyz"}
                  onChange={(e) => set("msdDims", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="xyz">3D isotropic (xyz)</option>
                  <option value="xy">2D in-plane (xy)</option>
                  <option value="z">1D normal (z)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Plot</label>
                <select
                  className={selectCls}
                  value={data.msdPlot ?? "msd"}
                  onChange={(e) => set("msdPlot", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="msd">MSD vs time</option>
                  <option value="dist">Displacement distribution</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5" title="Time between trajectory frames = MD timestep × output frequency (e.g. 1 fs × 1000 = 1 ps)">
                  Time/frame (ps)
                </label>
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  value={data.msdDt ?? 1.0}
                  onChange={(e) => set("msdDt", parseFloat(e.target.value) || 1.0)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5" title="Stride between time origins (restarts). 1 = use every frame as an origin (best statistics).">
                  Restart stride
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  className={inputCls}
                  value={data.msdOriginStride ?? 1}
                  onChange={(e) => set("msdOriginStride", Math.max(1, parseInt(e.target.value) || 1))}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
              <input
                type="text"
                className={inputCls}
                value={data.msdOutputBase ?? "msd_results"}
                onChange={(e) => set("msdOutputBase", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <p className="text-[9px] text-muted-foreground/60 leading-snug">
              Trajectory is <strong>unwrapped</strong> (PBC jumps removed) and averaged over <strong>multiple time origins</strong>. D = slope / (2·dim); printed to console (Å²/ps, cm²/s, 10⁻⁹ m²/s). Use trajectory atom names (e.g. <code>OW</code>). Connect a Data Plotter.
            </p>
          </div>
        )}

        {mode === "vacf" && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">
                Atom types <span className="font-normal opacity-60">(comma-sep; e.g. OW)</span>
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="blank = all atoms"
                value={data.vacfTypes ?? ""}
                onChange={(e) => set("vacfTypes", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5" title="Time between trajectory frames = MD timestep × output frequency. Sets the Nyquist frequency 1/(2·Δt).">
                  Time/frame (ps)
                </label>
                <input
                  type="number"
                  step="0.001"
                  className={inputCls}
                  value={data.vacfDt ?? 0.01}
                  onChange={(e) => set("vacfDt", parseFloat(e.target.value) || 0.01)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Plot</label>
                <select
                  className={selectCls}
                  value={data.vacfPlot ?? "spectrum"}
                  onChange={(e) => set("vacfPlot", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="spectrum">Power spectrum (cm⁻¹)</option>
                  <option value="vacf">VACF vs time</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5" title="Stride between time origins (restarts) for averaging the VACF.">
                  Restart stride
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  className={inputCls}
                  value={data.vacfOriginStride ?? 1}
                  onChange={(e) => set("vacfOriginStride", Math.max(1, parseInt(e.target.value) || 1))}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.vacfOutputBase ?? "vacf_results"}
                  onChange={(e) => set("vacfOutputBase", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="text-[9px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 leading-snug">
              ⚠️ <strong>No trajectory velocities are used.</strong> Velocities are estimated by central finite difference of the (unwrapped) positions, v(t) ≈ [r(t+Δt)−r(t−Δt)]/(2Δt). Consequences: the spectrum only resolves up to the <strong>Nyquist limit 1/(2·Δt)</strong> (save every few fs for vibrational modes), and the difference damps high frequencies (∝ sinc(ωΔt)). The Green-Kubo <strong>D</strong> (low-frequency) is robust; sharp spectra need true <code>.trr</code> velocities.
            </div>
            <p className="text-[9px] text-muted-foreground/60 leading-snug">
              Outputs the VACF, the power spectrum (vibrational DOS, cm⁻¹/THz) and the Green-Kubo diffusion D = ⅓∫⟨v(0)·v(t)⟩dt (cross-check of the MSD D). Console prints D + the Nyquist ceiling. Connect a Data Plotter.
            </p>
          </div>
        )}

        {mode === "hbond" && (
          <div className="space-y-2">
            <div className="text-[9px] text-muted-foreground/60 -mb-1">Donor — atom types / residue names (blank = all)</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className={inputCls}
                placeholder="types e.g. OW"
                value={data.hbondDonors ?? ""}
                onChange={(e) => set("hbondDonors", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="text"
                className={inputCls}
                placeholder="resnames e.g. SOL"
                value={data.hbondDonorResnames ?? ""}
                onChange={(e) => set("hbondDonorResnames", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="text-[9px] text-muted-foreground/60 -mb-1">Acceptor — atom types / residue names (blank = all)</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className={inputCls}
                placeholder="types e.g. Ob, Oh"
                value={data.hbondAcceptors ?? ""}
                onChange={(e) => set("hbondAcceptors", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="text"
                className={inputCls}
                placeholder="resnames e.g. MIN"
                value={data.hbondAcceptorResnames ?? ""}
                onChange={(e) => set("hbondAcceptorResnames", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5" title="Donor···Acceptor distance cutoff (GROMACS gmx hbond default 0.35 nm)">
                  D···A cutoff (Å)
                </label>
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  value={data.hbondRcut ?? 3.5}
                  onChange={(e) => set("hbondRcut", parseFloat(e.target.value) || 3.5)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5" title="H–D···A angle at the donor (GROMACS gmx hbond default 30°)">
                  Angle (°, H-D···A ≤)
                </label>
                <input
                  type="number"
                  step="5"
                  className={inputCls}
                  value={data.hbondAngle ?? 30}
                  onChange={(e) => set("hbondAngle", parseFloat(e.target.value) || 30)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <label className="nodrag flex items-center justify-between text-[11px] text-muted-foreground">
              Exclude intramolecular
              <input
                type="checkbox"
                className="nodrag"
                checked={data.hbondExcludeSameMol ?? true}
                onChange={(e) => set("hbondExcludeSameMol", e.target.checked)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Plot</label>
                <select
                  className={selectCls}
                  value={data.hbondPlot ?? "dist"}
                  onChange={(e) => set("hbondPlot", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="dist">Per-molecule distribution</option>
                  <option value="series">Count vs time</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.hbondOutputBase ?? "hbonds"}
                  onChange={(e) => set("hbondOutputBase", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground/60 leading-snug">
              Geometric H-bonds (GROMACS <code>gmx hbond</code> convention). Donors/acceptors are O/N/F by element, filtered by atom type <strong>and/or</strong> residue name (both blank = whole system; e.g. donor resname <code>SOL</code> → acceptor resname mineral for water↔surface). Reports mean total + the <strong>per-molecule distribution</strong> (single vs. multiple). Connect a Data Plotter.
            </p>
          </div>
        )}

        {mode === "cn" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Type A</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.atomTypeA ?? "Na"}
                  onChange={(e) => set("atomTypeA", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Neighbor Type B</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.atomTypeB ?? ""}
                  onChange={(e) => set("atomTypeB", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Cutoff (A)</label>
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  value={data.cutoff ?? 3.5}
                  onChange={(e) => set("cutoff", parseFloat(e.target.value) || 3.5)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output</label>
                <select
                  className={selectCls}
                  value={data.cnOutputMode ?? "json"}
                  onChange={(e) => set("cnOutputMode", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="both">JSON + CSV</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
              <input
                type="text"
                className={inputCls}
                value={data.cnOutputBase ?? "cn_results"}
                onChange={(e) => set("cnOutputBase", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {mode === "closest" && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Reference</label>
              <select
                className={selectCls}
                value={data.closestReferenceMode ?? "index"}
                onChange={(e) => set("closestReferenceMode", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="index">By atom index</option>
                <option value="coords">By XYZ coordinates</option>
              </select>
            </div>
            {(data.closestReferenceMode ?? "index") === "index" ? (
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Reference atom index</label>
                <input
                  type="number"
                  min="1"
                  className={inputCls}
                  value={data.closestRefIndex ?? 1}
                  onChange={(e) => set("closestRefIndex", parseInt(e.target.value, 10) || 1)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">X</label>
                  <input
                    type="number"
                    step="0.1"
                    className={inputCls}
                    value={data.closestRefX ?? 0}
                    onChange={(e) => set("closestRefX", parseFloat(e.target.value) || 0)}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Y</label>
                  <input
                    type="number"
                    step="0.1"
                    className={inputCls}
                    value={data.closestRefY ?? 0}
                    onChange={(e) => set("closestRefY", parseFloat(e.target.value) || 0)}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Z</label>
                  <input
                    type="number"
                    step="0.1"
                    className={inputCls}
                    value={data.closestRefZ ?? 0}
                    onChange={(e) => set("closestRefZ", parseFloat(e.target.value) || 0)}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output</label>
                <select
                  className={selectCls}
                  value={data.closestOutputMode ?? "json"}
                  onChange={(e) => set("closestOutputMode", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="both">JSON + CSV</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.closestOutputBase ?? "closest_results"}
                  onChange={(e) => set("closestOutputBase", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
        )}

        {mode === "mindist" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Group by</label>
                <select
                  className={selectCls}
                  value={data.mindistGroupBy ?? "molid"}
                  onChange={(e) => set("mindistGroupBy", e.target.value as "molid" | "resname")}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="molid">Molecule ID</option>
                  <option value="resname">Residue name</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Top N pairs</label>
                <input
                  type="number" min="1" max="100"
                  className={inputCls}
                  value={data.mindistNPairs ?? 10}
                  onChange={(e) => set("mindistNPairs", parseInt(e.target.value, 10) || 10)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Cutoff (Å, 0 = all)</label>
              <input
                type="number" step="0.1" min="0"
                className={inputCls}
                value={data.mindistCutoff ?? 0}
                onChange={(e) => set("mindistCutoff", parseFloat(e.target.value) || 0)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output</label>
                <select
                  className={selectCls}
                  value={data.mindistOutputMode ?? "json"}
                  onChange={(e) => set("mindistOutputMode", e.target.value as OutputMode)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="both">JSON + CSV</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.mindistOutputBase ?? "mindist_results"}
                  onChange={(e) => set("mindistOutputBase", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
        )}

        {mode === "occupancy" && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">r-max (A)</label>
              <input
                type="number"
                step="0.1"
                className={inputCls}
                value={data.occupancyRmax ?? 1.0}
                onChange={(e) => set("occupancyRmax", parseFloat(e.target.value) || 1.0)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output</label>
                <select
                  className={selectCls}
                  value={data.occupancyOutputMode ?? "json"}
                  onChange={(e) => set("occupancyOutputMode", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="both">JSON + CSV</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.occupancyOutputBase ?? "occupancy_results"}
                  onChange={(e) => set("occupancyOutputBase", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          </div>
        )}

        {mode === "bvs" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Top-N worst atoms</label>
              <input
                type="number"
                min="1"
                className={inputCls}
                value={data.topN ?? 10}
                onChange={(e) => set("topN", parseInt(e.target.value, 10) || 10)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Log file</label>
              <input
                type="text"
                className={inputCls}
                value={data.bvsLogFile ?? "bvs_summary.log"}
                onChange={(e) => set("bvsLogFile", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Write detailed CSV
              <input
                type="checkbox"
                className="nodrag"
                checked={data.writeCsv ?? true}
                onChange={(e) => set("writeCsv", e.target.checked)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            {(data.writeCsv ?? true) && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">CSV file</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.csvFile ?? "bvs_results.csv"}
                  onChange={(e) => set("csvFile", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </>
        )}

        {mode === "distortion" && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">
                Tetrahedral cation types <span className="font-normal opacity-60">(comma-sep; blank = Si/Sit/Alt/Tit/Fee3)</span>
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="blank = default set"
                value={data.distTetTypes ?? ""}
                onChange={(e) => set("distTetTypes", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5" title="T–O bond cutoff (Å) for identifying the oxygens of each tetrahedron.">
                  T–O cutoff (Å)
                </label>
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  value={data.distBondCutoff ?? 1.9}
                  onChange={(e) => set("distBondCutoff", parseFloat(e.target.value) || 1.9)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5" title="Max metal→neighbour-metal distance (Å) via the shared basal oxygen; caps the α bond search.">
                  T···T cutoff (Å)
                </label>
                <input
                  type="number"
                  step="0.1"
                  className={inputCls}
                  value={data.distTetTetCutoff ?? 3.6}
                  onChange={(e) => set("distTetTetCutoff", parseFloat(e.target.value) || 3.6)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5" title="Min |cos| between the basal-triplet plane normal and the metal→apical direction (0–1). Rejects mis-identified tetrahedra.">
                  Align tol (0–1)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className={inputCls}
                  value={data.distAlignTol ?? 0.5}
                  onChange={(e) => set("distAlignTol", parseFloat(e.target.value) || 0.5)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5" title="Sheet-normal (stacking) axis of the layer.">
                  Sheet normal
                </label>
                <select
                  className={selectCls}
                  value={data.distAxis ?? "z"}
                  onChange={(e) => set("distAxis", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="x">x</option>
                  <option value="y">y</option>
                  <option value="z">z</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Plot</label>
                <select
                  className={selectCls}
                  value={data.distPlot ?? "alpha"}
                  onChange={(e) => set("distPlot", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="alpha">α + apical tilt vs frame</option>
                  <option value="angles">α, tilt, τ−109.47, ψ−54.74</option>
                  <option value="dz">Δz corrugation vs frame</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Output base</label>
                <input
                  type="text"
                  className={inputCls}
                  value={data.distOutputBase ?? "distortion_results"}
                  onChange={(e) => set("distOutputBase", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground/60 leading-snug">
              Phyllosilicate sheet distortion: tetrahedral rotation <strong>α</strong> (ditrigonal, Bailey 1984; 0–30°) plus apical tilt, <strong>τ</strong> (O–T–O, ideal 109.47°), <strong>Δz</strong> basal corrugation (Å) and <strong>ψ</strong> (octahedral flattening, ideal 54.74°). Runs per frame and <strong>pools over a connected trajectory</strong> (within-structure std + frame-to-frame SEM). Writes <code>.dat</code>/<code>.json</code> + a per-frame series. Connect a Data Plotter.
            </p>
          </div>
        )}

        {mode === "stats" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Log filename</label>
            <input
              type="text"
              className={inputCls}
              value={data.statsLogFile ?? "output.log"}
              onChange={(e) => set("statsLogFile", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Auto-calculates structure composition and charge stats.</p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
      <Handle type="source" position={Position.Right} id="data" style={{ top: '70%' }} className="w-3 h-3 bg-indigo-500" title="Plot Data" />
    </div>
  );
}
