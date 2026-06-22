import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, Activity } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type SimulationType = "minimize" | "nvt" | "npt";
type ForcefieldMode = "minff" | "clayff" | "preassigned";
type PrmFile = "minff" | "minff_gminff_k0" | "minff_gminff_k250" | "minff_gminff_k1500" | "clayff";
type Engine = "openmm" | "gromacs";

type SimulateNodeData = {
  engine?: Engine;
  forcefieldMode?: ForcefieldMode;
  prmFile?: PrmFile;
  simType?: SimulationType;
  miniSteps?: number;
  mdSteps?: number;
  temperature?: number;
  timestep?: number;
  cutoff?: number;
  constraints?: string;
  pressure?: number;
  frictionCoeff?: number;
  switchDistance?: number;
  writeDcd?: boolean;
  dcdFreq?: number;
  writePdb?: boolean;
  pdbFreq?: number;
  logFreq?: number;
  posres?: boolean;
  posresFC?: number;
  wrapTrajectory?: boolean;
  excludeWater?: boolean;
};

export function SimulateNode({ id, data = {} }: NodeComponentProps<SimulateNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = useState(false);

  const forcefieldMode = data?.forcefieldMode ?? "minff";
  const prmFile = data?.prmFile ?? "minff";
  const simType = data?.simType ?? "minimize";
  const miniSteps = data?.miniSteps ?? 500;
  const mdSteps = data?.mdSteps ?? 5000;
  const temperature = data?.temperature ?? 298.15;
  const timestep = data?.timestep ?? 1.0;
  const cutoff = data?.cutoff ?? 12.0;
  const constraints = data?.constraints ?? "HBonds";
  const pressure = data?.pressure ?? 1.0;
  const frictionCoeff = data?.frictionCoeff ?? 1.0;
  const switchDistance = data?.switchDistance ?? 10.0;
  const writePdb = data?.writePdb ?? data?.writeDcd ?? false;
  const pdbFreq = data?.pdbFreq ?? data?.dcdFreq ?? 1000;
  const posres = data?.posres ?? false;
  const posresFC = data?.posresFC ?? 1000;
  const wrapTrajectory = data?.wrapTrajectory ?? true;
  const excludeWater = data?.excludeWater ?? true;

  const engine: Engine = data?.engine ?? "openmm";
  const isGromacs = engine === "gromacs";
  const gmxInfo = (window as any).gromacs as { version?: string } | null | undefined;
  const gmxAvailable = !!gmxInfo;

  const isSimulationDisabled = (window as any).disableSimulation === true;
  const simulationMode = (window as any).simulationMode || (isSimulationDisabled ? "disabled" : "full");
  const showMdFields = simType === "nvt" || simType === "npt";
  // On the public CPU server (em_only) NVT/NPT MD is blocked — recommend Colab/local.
  const mdBlockedHere = simulationMode === "em_only" && showMdFields;

  return (
    <div className={`bg-card w-[260px] shadow-lg rounded-xl border ${isSimulationDisabled ? "border-amber-500/40" : "border-emerald-500/50"} overflow-hidden font-sans select-none`}>
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader
        id={id}
        title={isGromacs ? "Simulate (GROMACS · local)" : (isSimulationDisabled ? "Simulate (Colab/Local)" : "Simulate (OpenMM)")}
        Icon={Activity}
        colorClass={isSimulationDisabled ? "text-amber-600" : "text-emerald-600"}
        className={isSimulationDisabled ? "bg-amber-500/10" : "bg-emerald-500/10"}
      />

      <div className="p-4 space-y-3 bg-background">
        {/* Engine selector: OpenMM (default) vs local GROMACS */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Engine</label>
          <div className="flex rounded-md overflow-hidden border border-border text-[10px] font-semibold">
            {(["openmm", "gromacs"] as const).map((e) => (
              <button
                key={e}
                type="button"
                className={`nodrag flex-1 py-1 transition-colors ${
                  engine === e ? "bg-emerald-500/20 text-emerald-700" : "bg-background text-muted-foreground hover:bg-muted/50"
                }`}
                onClick={() => updateNodeData(id, { ...data, engine: e })}
                onPointerDown={(e2) => e2.stopPropagation()}
              >
                {e === "openmm" ? "OpenMM" : "GROMACS (local)"}
              </button>
            ))}
          </div>
          {isGromacs && (
            <div className={`mt-1.5 rounded p-1.5 text-[10px] leading-relaxed border ${gmxAvailable ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700" : "bg-amber-500/10 border-amber-500/30 text-amber-700"}`}>
              {gmxAvailable
                ? <>Local <strong>gmx</strong> detected ({gmxInfo?.version}). Runs grompp + mdrun on this machine.</>
                : <>No local <strong>gmx</strong> detected — the GROMACS engine runs only where GROMACS is installed (local/Colab). The downloaded script will run it there.</>}
            </div>
          )}
        </div>

        {isSimulationDisabled && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-[10px] text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
            ⚡ <strong>Colab/Local Execution Mode</strong><br />
            Simulation is paused on this CPU instance. Configure the parameters here, then download the Python script to run on **Google Colab (GPU)** for 100x speed!
          </div>
        )}


        {/* Simulation type */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Simulation Type</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            value={simType}
            onChange={(e) => updateNodeData(id, { ...data, simType: e.target.value as SimulationType })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="minimize">Energy Minimization</option>
            <option value="nvt">NVT (constant volume)</option>
            <option value="npt">NPT (constant pressure)</option>
          </select>
        </div>

        {mdBlockedHere && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-[10px] text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
            ⚠️ <strong>NVT/NPT runs on Colab or locally, not here</strong><br />
            The public server is CPU-only and runs <strong>Energy Minimization</strong> only.
            Configure {simType.toUpperCase()} here, then download the Python script and run it on
            <strong> Google Colab (GPU)</strong> or a local install.
          </div>
        )}

        {/* Minimization steps — only for minimize */}
        {simType === "minimize" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Minimization Steps
            </label>
            <input
              type="number"
              min={0}
              step={100}
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
              value={miniSteps}
              onChange={(e) => updateNodeData(id, { ...data, miniSteps: Math.max(0, parseInt(e.target.value) || 0) })}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* MD-specific fields */}
        {showMdFields && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">MD Steps</label>
                <input
                  type="number"
                  min={0}
                  step={500}
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={mdSteps}
                  onChange={(e) => updateNodeData(id, { ...data, mdSteps: Math.max(0, parseInt(e.target.value) || 0) })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Temp (K)</label>
                <input
                  type="number"
                  min={1}
                  step={10}
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={temperature}
                  onChange={(e) => updateNodeData(id, { ...data, temperature: parseFloat(e.target.value) || 298.15 })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Timestep (fs)</label>
                <input
                  type="number"
                  min={0.1}
                  max={4.0}
                  step={0.5}
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={timestep}
                  onChange={(e) => updateNodeData(id, { ...data, timestep: parseFloat(e.target.value) || 1.0 })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              {simType === "npt" && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Pressure (bar)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                    value={pressure}
                    onChange={(e) => updateNodeData(id, { ...data, pressure: parseFloat(e.target.value) || 1.0 })}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>

            {/* Positional restraints (POSRES) */}
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              <span title="Harmonically restrain non-water/non-ion atoms to their initial positions (equivalent to GROMACS POSRES). Useful during equilibration to let water relax around a fixed solute.">
                Positional restraints (POSRES)
              </span>
              <input
                type="checkbox"
                className="nodrag"
                checked={posres}
                onChange={(e) => updateNodeData(id, { ...data, posres: e.target.checked })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            {posres && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1"
                  title="Force constant in kJ/mol/nm². GROMACS default is 1000. Lower values give softer restraints.">
                  POSRES fc (kJ/mol/nm²)
                </label>
                <input
                  type="number"
                  min={1}
                  step={100}
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                  value={posresFC}
                  onChange={(e) => updateNodeData(id, { ...data, posresFC: Math.max(1, parseFloat(e.target.value) || 1000) })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </>
        )}

        {/* More options toggle */}
        <button
          type="button"
          className="nodrag w-full flex items-center justify-between text-xs font-semibold text-muted-foreground border border-border rounded-md px-2 py-1.5 bg-background hover:bg-muted/50"
          onClick={() => setShowMore((prev) => !prev)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          More options
          {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showMore && (
          <div className="space-y-2 border border-border rounded-md p-2 bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Cutoff (Å)</label>
                <input
                  type="number"
                  min={6}
                  max={20}
                  step={0.5}
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={cutoff}
                  onChange={(e) => updateNodeData(id, { ...data, cutoff: parseFloat(e.target.value) || 12.0 })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Switch (Å)</label>
                <input
                  type="number"
                  min={4}
                  max={18}
                  step={0.5}
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={switchDistance}
                  onChange={(e) => updateNodeData(id, { ...data, switchDistance: parseFloat(e.target.value) || 10.0 })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Constraints</label>
              <select
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                value={constraints}
                onChange={(e) => updateNodeData(id, { ...data, constraints: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="None">None</option>
                <option value="HBonds">HBonds</option>
                <option value="AllBonds">AllBonds</option>
              </select>
            </div>

            {showMdFields && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Friction (1/ps)</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={frictionCoeff}
                  onChange={(e) => updateNodeData(id, { ...data, frictionCoeff: parseFloat(e.target.value) || 1.0 })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}

            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Write PDB trajectory
              <input
                type="checkbox"
                className="nodrag"
                checked={writePdb}
                onChange={(e) => updateNodeData(id, { ...data, writePdb: e.target.checked })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Wrap trajectory (periodic box)
              <input
                type="checkbox"
                className="nodrag"
                checked={wrapTrajectory}
                onChange={(e) => updateNodeData(id, { ...data, wrapTrajectory: e.target.checked })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground" title="Generates traj_no_water.pdb for high-performance visual display while retaining full traj.pdb">
              Exclude water in viewer
              <input
                type="checkbox"
                className="nodrag"
                checked={excludeWater}
                onChange={(e) => updateNodeData(id, { ...data, excludeWater: e.target.checked })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Log frequency (steps)</label>
              <input
                type="number"
                min={1}
                step={100}
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                value={data?.logFreq ?? 1000}
                onChange={(e) => updateNodeData(id, { ...data, logFreq: Math.max(1, parseInt(e.target.value) || 1000) })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            {writePdb && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">PDB frequency (steps)</label>
                <input
                  type="number"
                  min={1}
                  step={100}
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={pdbFreq}
                  onChange={(e) => updateNodeData(id, { ...data, pdbFreq: Math.max(1, parseInt(e.target.value) || 1000) })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/60 leading-tight">
          {isGromacs
            ? <>Local GROMACS: staged EM{showMdFields ? " → NVT" : ""}{simType === "npt" ? " → NPT" : ""} via grompp + mdrun (MINFF min.ff). Friction/constraints/switch are OpenMM-only and ignored here.</>
            : <>Requires OpenMM. Auto GPU/CPU. Water is rigid ({forcefieldMode === "clayff" || prmFile === "clayff" ? "SPC/E" : "OPC3"}).</>}
        </p>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
