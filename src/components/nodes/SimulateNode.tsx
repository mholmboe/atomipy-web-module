import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, Activity, Maximize2 } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { NodeComponentProps } from "./types";

type SimulationType = "minimize" | "nvt" | "npt";
type ForcefieldMode = "minff" | "clayff" | "preassigned";
type PrmFile = "minff" | "minff_gminff_k0" | "minff_gminff_k250" | "minff_gminff_k1500" | "clayff";
type Engine = "openmm" | "gromacs";

// MINFF .mdp common block (keep in sync with atomipy/gromacs/mdp.py _COMMON).
const MDP_COMMON: [string, string][] = [
  ["cutoff-scheme", "Verlet"], ["nstlist", "20"], ["rlist", "1.2"],
  ["coulombtype", "PME"], ["vdw-type", "Cut-off"], ["rcoulomb", "1.2"], ["rvdw", "1.2"],
  ["fourierspacing", "0.12"], ["pme-order", "4"], ["ewald-rtol", "1e-05"],
  ["pbc", "xyz"], ["periodic-molecules", "yes"],
  ["constraints", "none"], ["constraint_algorithm", "lincs"], ["lincs_order", "4"], ["lincs_iter", "1"],
];

// Build an editable .mdp template for a stage (mirrors atomipy/gromacs/mdp.py).
function buildMdp(
  stage: "em" | "nvt" | "npt",
  o: { nsteps: number; dt: number; temperature: number; pressure: number; nstxtc: number },
): string {
  const L: string[] = [
    "; Editable GROMACS .mdp — used verbatim when non-blank (blank = auto-generated).",
    ";",
    "; FORCE-FIELD DEFINES: for SOLVATED/merged systems the FF (e.g. GMINFF_k500 or",
    "; CLAYFF_EXT), water and ion #defines are set INSIDE the .top, so leave 'define'",
    "; blank here. For a DRY mineral (no solvent/ions) add them, e.g.:",
    ";   define = -DGMINFF_k500      (or -DCLAYFF_EXT)",
  ];
  const push = (k: string, v: string) => L.push(`${k.padEnd(22)}= ${v}`);
  push("define", "");
  if (stage === "em") {
    push("integrator", "steep"); push("nsteps", String(o.nsteps));
    push("emtol", "1000.0"); push("emstep", "0.01"); push("nstxout-compressed", String(o.nstxtc));
    MDP_COMMON.forEach(([k, v]) => push(k, v));
    push("DispCorr", "No");
  } else {
    push("integrator", "md"); push("nsteps", String(o.nsteps)); push("dt", String(o.dt));
    push("nstcomm", "100"); push("comm-mode", "Linear");
    push("nstxout-compressed", String(o.nstxtc)); push("nstenergy", "100"); push("nstlog", "100");
    push("continuation", stage === "nvt" ? "no" : "yes");
    MDP_COMMON.forEach(([k, v]) => push(k, v));
    push("tcoupl", "V-rescale"); push("tc-grps", "System"); push("tau_t", "1.0"); push("ref_t", String(o.temperature));
    if (stage === "npt") {
      push("pcoupl", "C-rescale"); push("pcoupltype", "semiisotropic"); push("tau_p", "2.0");
      push("ref_p", `${o.pressure} ${o.pressure}`); push("compressibility", "4.5e-5 4.5e-5"); push("refcoord-scaling", "all");
    } else {
      push("pcoupl", "no");
    }
    if (stage === "nvt") { push("gen_vel", "yes"); push("gen_temp", String(o.temperature)); push("gen_seed", "-1"); }
    push("DispCorr", "EnerPres");
  }
  return L.join("\n") + "\n";
}

type SimulateNodeData = {
  engine?: Engine;
  gmxPath?: string;
  mdpText?: string;
  thermoPlot?: string;      // legacy single-select (kept for backward compat with saved workflows)
  thermoPlots?: string[];   // multi-select: one plotted series per selected quantity
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
  trajFormat?: string;   // download trajectory format: openmm pdb/dcd/xtc, gromacs pdb/xtc/trr
  excludeWater?: boolean;
  // Parameter sweep (GROMACS): run this stage once per value, varying one parameter.
  sweepEnabled?: boolean;
  sweepParam?: "temperature" | "pressure" | "mdpkey" | "mdp" | "fep" | "umbrella";   // 'mdpkey' = a .mdp key via extra={}; 'mdp' = __SWEEP__ in a custom .mdp; 'fep' = λ free-energy (gmx bar); 'umbrella' = PMF via SMD pull + gmx wham
  sweepMdpKey?: string;                              // for sweepParam='mdpkey', the .mdp key (e.g. ref_t, tau_t, init-lambda-state)
  sweepValues?: string;                              // comma-separated list, e.g. "280, 300, 320"
  sweepMode?: "independent" | "sequential";          // each value from the input, or from the previous window's output
  // Free-energy (λ-FEP), used when sweepParam='fep' — decouple a moleculetype over the λ schedule, then gmx bar → ΔG
  fepCoupleMoltype?: string;                         // moleculetype to decouple (the solute/ligand), e.g. MOL
  fepVdwLambdas?: string;                            // vdw-lambdas schedule, comma list "0.0, 0.25, 0.5, 0.75, 1.0"
  fepCoulLambdas?: string;                           // coul-lambdas schedule (optional)
  fepScAlpha?: number;                               // soft-core alpha (default 0.5)
  // Umbrella sampling (PMF), used when sweepParam='umbrella' — SMD pull along COM(G1,G2), pick windows, gmx wham
  usGroup1Sel?: string;                              // pull group 1 selection, e.g. "resname=MOL" or "molid=1"
  usGroup2Sel?: string;                              // pull group 2 selection
  usSpacing?: number;                                // window spacing along the reaction coordinate (nm), default 0.1
  usK?: number;                                      // umbrella/pull force constant (kJ/mol/nm²), default 1000
  usPullRate?: number;                               // SMD pull rate (nm/ps), default 0.01
  usPullDim?: string;                                // pull-coord dims, default "N N Y"
  usWindowSteps?: number;                            // MD steps per umbrella window, default 25000
  usWhamBegin?: number;                              // gmx wham -b (ps, skip equilibration), default 0
};

export function SimulateNode({ id, data = {} }: NodeComponentProps<SimulateNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = useState(false);
  const [showMdp, setShowMdp] = useState(false);
  const [mdpOpen, setMdpOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
  const pdbFreq = data?.pdbFreq ?? data?.dcdFreq ?? 1000;
  // Thermo quantities to plot. New workflows use thermoPlots[]; fall back to the
  // legacy single thermoPlot string ("off" => none) so old saved graphs still work.
  const thermoSel: string[] = Array.isArray(data?.thermoPlots)
    ? data!.thermoPlots!
    : (data?.thermoPlot && data.thermoPlot !== "off" ? [data.thermoPlot] : []);
  const THERMO_OPTIONS: { key: string; label: string }[] = [
    { key: "potential", label: "Potential energy" },
    { key: "total", label: "Total energy" },
    { key: "temperature", label: "Temperature" },
    { key: "pressure", label: "Pressure (GROMACS only)" },
    { key: "volume", label: "Volume" },
    { key: "density", label: "Density" },
  ];
  const toggleThermo = (key: string) => {
    const next = thermoSel.includes(key)
      ? thermoSel.filter((k) => k !== key)
      : [...thermoSel, key];
    updateNodeData(id, { ...data, thermoPlots: next, thermoPlot: undefined });
  };
  const posres = data?.posres ?? false;
  const posresFC = data?.posresFC ?? 1000;
  const wrapTrajectory = data?.wrapTrajectory ?? true;
  const trajFormat = data?.trajFormat ?? "pdb";
  const excludeWater = data?.excludeWater ?? true;

  const engine: Engine = data?.engine ?? "openmm";
  const isGromacs = engine === "gromacs";
  // The GROMACS "Advanced" panel expands the node into a second column (wider, not taller).
  const wideNode = isGromacs && showAdvanced;
  const gmxInfo = (window as any).gromacs as { version?: string } | null | undefined;
  const gmxAvailable = !!gmxInfo;

  // Shared .mdp editor handlers (used by the inline editor and the pop-out dialog).
  const gmxStage = simType === "npt" ? "npt" : simType === "nvt" ? "nvt" : "em";
  const stageLabel = simType === "minimize" ? "EM" : simType.toUpperCase();
  const loadMdpTemplate = () => updateNodeData(id, { ...data, mdpText: buildMdp(gmxStage, {
    nsteps: simType === "minimize" ? (data?.miniSteps ?? 500) : (data?.mdSteps ?? 5000),
    dt: (data?.timestep ?? 1.0) / 1000, temperature: data?.temperature ?? 298.15,
    pressure: data?.pressure ?? 1.0, nstxtc: data?.pdbFreq ?? data?.dcdFreq ?? 1000,
  }) });
  const resetMdp = () => updateNodeData(id, { ...data, mdpText: "" });
  const setMdp = (t: string) => updateNodeData(id, { ...data, mdpText: t });
  // A non-blank custom .mdp drives the GROMACS run; the structured run-parameter
  // fields below are then ignored, so we hide them (the .mdp is the source of truth).
  const mdpActive = isGromacs && !!(data?.mdpText && data.mdpText.trim());

  const isSimulationDisabled = (window as any).disableSimulation === true;
  const simulationMode = (window as any).simulationMode || (isSimulationDisabled ? "disabled" : "full");
  const showMdFields = simType === "nvt" || simType === "npt";
  // On the public CPU server (em_only) NVT/NPT MD is blocked — recommend Colab/local.
  const mdBlockedHere = simulationMode === "em_only" && showMdFields;

  return (
    <div className={`bg-card ${wideNode ? "w-[560px]" : "w-[260px]"} transition-[width] duration-150 shadow-lg rounded-xl border ${isSimulationDisabled ? "border-amber-500/40" : "border-emerald-500/50"} overflow-hidden font-sans select-none`}>
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader
        id={id}
        title={isGromacs ? "Simulate (GROMACS)" : (isSimulationDisabled ? "Simulate (Colab/Local)" : "Simulate (OpenMM)")}
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
                {e === "openmm" ? "OpenMM" : "GROMACS"}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground/60 mt-1 leading-snug">
            {isGromacs
              ? <><strong>GROMACS</strong> — full <code>.mdp</code> control, parameter sweeps, free energy &amp; umbrella. Runs local / Colab.</>
              : <><strong>OpenMM</strong> — quick MD, auto-GPU, runs anywhere, live plots (EM / NVT / NPT).</>}
          </p>
          {isGromacs && (
            <button
              type="button"
              className="nodrag mt-2 w-full flex items-center justify-between text-[10px] font-semibold text-muted-foreground border border-border rounded-md px-2 py-1.5 bg-background hover:bg-muted/50"
              onClick={() => setShowAdvanced((p) => !p)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              Advanced (GROMACS): .mdp · sweeps · free energy
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          {isGromacs && showAdvanced && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2 pt-2 border-t border-border/60">
              <div className="space-y-2">
          {isGromacs && (
            <div className={`mt-1.5 rounded p-1.5 text-[10px] leading-relaxed border ${gmxAvailable ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700" : "bg-amber-500/10 border-amber-500/30 text-amber-700"}`}>
              {gmxAvailable
                ? <>Default <strong>gmx</strong> detected ({gmxInfo?.version}). Runs grompp + mdrun on this machine.</>
                : <>No default <strong>gmx</strong> on PATH — set a custom path below, or it runs only where GROMACS is installed (local/Colab).</>}
            </div>
          )}
          {isGromacs && (
            <div className="mt-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                GROMACS path <span className="font-normal opacity-60">(clear for <code>gmx</code> on PATH)</span>
              </label>
              <input
                type="text"
                className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="gmx"
                value={data?.gmxPath ?? "gmx"}
                onChange={(e) => updateNodeData(id, { ...data, gmxPath: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <p className="text-[9px] text-muted-foreground/60 mt-1 leading-snug">
Defaults to <code>gmx</code> on PATH — works on Colab (after the launcher's <strong>Step 1c</strong> cell) and any standard install. Set this only for a custom build: the <code>gmx</code> binary, its <code>GMXRC</code>, or the install dir; its libraries are added to the loader path automatically.
              </p>
            </div>
          )}
                <button
                  type="button"
                  title="Edit the GROMACS .mdp for this stage"
                  className="nodrag w-full flex items-center justify-between text-[10px] font-semibold text-muted-foreground border border-border rounded-md px-2 py-1.5 bg-background hover:bg-muted/50"
                  onClick={() => setMdpOpen(true)}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  Edit .mdp ({stageLabel}){mdpActive ? " — custom" : ""}
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
          {isGromacs && (
            <div className="mt-2 pt-2 border-t border-border/60">
              <label className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  className="nodrag"
                  checked={!!data?.sweepEnabled}
                  onChange={(e) => updateNodeData(id, { ...data, sweepEnabled: e.target.checked })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                Parameter sweep <span className="font-normal opacity-60">(run once per value)</span>
              </label>
              {data?.sweepEnabled && (
                <div className="mt-1.5 space-y-1.5 pl-1">
                  <div>
                    <label className="text-[9px] text-muted-foreground/70 block mb-0.5">Parameter</label>
                    <select
                      className="nodrag w-full text-[11px] bg-muted border border-border rounded-md px-2 py-1 h-7"
                      value={data?.sweepParam ?? "temperature"}
                      onChange={(e) => updateNodeData(id, { ...data, sweepParam: e.target.value as SimulateNodeData["sweepParam"] })}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <option value="temperature">Temperature (K)</option>
                      <option value="pressure">Pressure (bar) — NPT</option>
                      <option value="mdpkey">Custom .mdp key</option>
                      <option value="mdp">Custom .mdp value (__SWEEP__)</option>
                      <option value="fep">Free energy (λ-FEP → ΔG)</option>
                      <option value="umbrella">Umbrella sampling (PMF)</option>
                    </select>
                  </div>
                  {data?.sweepParam === "mdpkey" && (
                    <div>
                      <label className="text-[9px] text-muted-foreground/70 block mb-0.5">.mdp key</label>
                      <input
                        type="text"
                        className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                        placeholder="ref_t"
                        value={data?.sweepMdpKey ?? ""}
                        onChange={(e) => updateNodeData(id, { ...data, sweepMdpKey: e.target.value })}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                  {data?.sweepParam === "fep" && (
                    <div className="space-y-1.5">
                      <div>
                        <label className="text-[9px] text-muted-foreground/70 block mb-0.5">Decouple moleculetype</label>
                        <input
                          type="text"
                          className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                          placeholder="MOL"
                          value={data?.fepCoupleMoltype ?? ""}
                          onChange={(e) => updateNodeData(id, { ...data, fepCoupleMoltype: e.target.value })}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-muted-foreground/70 block mb-0.5">vdw-lambdas (one window per value)</label>
                        <input
                          type="text"
                          className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                          placeholder="0.0, 0.25, 0.5, 0.75, 1.0"
                          value={data?.fepVdwLambdas ?? ""}
                          onChange={(e) => updateNodeData(id, { ...data, fepVdwLambdas: e.target.value })}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-muted-foreground/70 block mb-0.5">coul-lambdas (optional)</label>
                        <input
                          type="text"
                          className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                          placeholder="0.0, 0.0, 0.0, 0.0, 0.0"
                          value={data?.fepCoulLambdas ?? ""}
                          onChange={(e) => updateNodeData(id, { ...data, fepCoulLambdas: e.target.value })}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-muted-foreground/70 block mb-0.5">soft-core α</label>
                        <input
                          type="number"
                          step="0.1"
                          className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                          placeholder="0.5"
                          value={data?.fepScAlpha ?? 0.5}
                          onChange={(e) => updateNodeData(id, { ...data, fepScAlpha: parseFloat(e.target.value) })}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  )}
                  {data?.sweepParam === "umbrella" && (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[9px] text-muted-foreground/70 block mb-0.5">Pull group 1</label>
                          <input
                            type="text"
                            className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                            placeholder="resname=MOL"
                            value={data?.usGroup1Sel ?? ""}
                            onChange={(e) => updateNodeData(id, { ...data, usGroup1Sel: e.target.value })}
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground/70 block mb-0.5">Pull group 2</label>
                          <input
                            type="text"
                            className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                            placeholder="molid=1"
                            value={data?.usGroup2Sel ?? ""}
                            onChange={(e) => updateNodeData(id, { ...data, usGroup2Sel: e.target.value })}
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[9px] text-muted-foreground/70 block mb-0.5">Window spacing (nm)</label>
                          <input
                            type="number"
                            step="0.05"
                            className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                            placeholder="0.1"
                            value={data?.usSpacing ?? 0.1}
                            onChange={(e) => updateNodeData(id, { ...data, usSpacing: parseFloat(e.target.value) })}
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground/70 block mb-0.5">Force k (kJ/mol/nm²)</label>
                          <input
                            type="number"
                            step="100"
                            className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                            placeholder="1000"
                            value={data?.usK ?? 1000}
                            onChange={(e) => updateNodeData(id, { ...data, usK: parseFloat(e.target.value) })}
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[9px] text-muted-foreground/70 block mb-0.5">SMD rate (nm/ps)</label>
                          <input
                            type="number"
                            step="0.005"
                            className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                            placeholder="0.01"
                            value={data?.usPullRate ?? 0.01}
                            onChange={(e) => updateNodeData(id, { ...data, usPullRate: parseFloat(e.target.value) })}
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground/70 block mb-0.5">Steps / window</label>
                          <input
                            type="number"
                            step="1000"
                            className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                            placeholder="25000"
                            value={data?.usWindowSteps ?? 25000}
                            onChange={(e) => updateNodeData(id, { ...data, usWindowSteps: parseInt(e.target.value, 10) })}
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[9px] text-muted-foreground/70 block mb-0.5">Pull dims</label>
                          <input
                            type="text"
                            className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                            placeholder="N N Y"
                            value={data?.usPullDim ?? "N N Y"}
                            onChange={(e) => updateNodeData(id, { ...data, usPullDim: e.target.value })}
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground/70 block mb-0.5">WHAM skip (ps)</label>
                          <input
                            type="number"
                            step="10"
                            className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                            placeholder="0"
                            value={data?.usWhamBegin ?? 0}
                            onChange={(e) => updateNodeData(id, { ...data, usWhamBegin: parseFloat(e.target.value) })}
                            onPointerDown={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {data?.sweepParam !== "fep" && data?.sweepParam !== "umbrella" && (
                  <div>
                    <label className="text-[9px] text-muted-foreground/70 block mb-0.5">Values (comma-separated)</label>
                    <input
                      type="text"
                      className="nodrag w-full text-[11px] font-mono bg-muted border border-border rounded-md px-2 py-1 h-7"
                      placeholder="280, 300, 320"
                      value={data?.sweepValues ?? ""}
                      onChange={(e) => updateNodeData(id, { ...data, sweepValues: e.target.value })}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  )}
                  {data?.sweepParam !== "umbrella" && (
                  <div>
                    <label className="text-[9px] text-muted-foreground/70 block mb-0.5">Mode</label>
                    <div className="flex gap-1">
                      {(["independent", "sequential"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`flex-1 text-[10px] px-2 py-1 rounded border ${(data?.sweepMode ?? "independent") === m ? "bg-emerald-500/20 text-emerald-700 border-emerald-500/40" : "bg-background text-muted-foreground border-border hover:bg-muted/50"}`}
                          onClick={() => updateNodeData(id, { ...data, sweepMode: m })}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          {m === "independent" ? "Independent" : "Sequential"}
                        </button>
                      ))}
                    </div>
                  </div>
                  )}
                  <p className="text-[9px] text-muted-foreground/60 leading-snug">
                    {data?.sweepParam === "umbrella"
                      ? <>Pulls <code>{data?.usGroup1Sel || "group 1"}</code> away from <code>{data?.usGroup2Sel || "group 2"}</code> (SMD), picks windows ~{data?.usSpacing ?? 0.1} nm apart along the COM distance, runs a restrained MD per window, then <code>gmx wham</code> → <code>pmf_profile.csv</code> / <code>pmf_result.json</code>; a connected Data Plotter shows the PMF vs ξ. Input should be equilibrated (chain an EM/NVT node first). NVT/NPT only.</>
                      : <>{(data?.sweepMode ?? "independent") === "sequential"
                      ? "Each window continues from the previous window's structure (e.g. annealing / staged equilibration)."
                      : "Each window starts from this node's input structure (independent replicas)."}{" "}
                    {data?.sweepParam === "fep"
                      ? <>Runs one window per <code>vdw-lambda</code> value (decoupling <code>{data?.fepCoupleMoltype || "the moleculetype"}</code>), then combines them with <code>gmx bar</code> → <code>fep_result.json</code> (ΔG ± error); a connected Data Plotter shows cumulative ΔG vs λ. NVT/NPT only.</>
                      : <>Writes <code>sweep_summary.csv</code>; a connected Data Plotter shows the metric-vs-value curve, filling in per window. The node passes the final window's structure downstream.</>}
                    {data?.sweepParam === "mdpkey" && <> Sets the given <code>.mdp</code> key (e.g. <code>ref_t</code>, <code>tau_t</code>, <code>init-lambda-state</code>) to each value on the auto-generated <code>.mdp</code>.</>}
                    {data?.sweepParam === "mdp" && <> Put <code>__SWEEP__</code> where the value goes in your full custom .mdp.</>}</>}
                  </p>
                </div>
              )}
            </div>
          )}
              </div>
            </div>
          )}
        </div>

        {/* Pop-out .mdp editor */}
        <Dialog open={mdpOpen} onOpenChange={setMdpOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>GROMACS .mdp — {stageLabel} stage</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                className="text-xs font-semibold px-3 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20"
                onClick={loadMdpTemplate}
              >
                Load template
              </button>
              <button
                type="button"
                className="text-xs font-semibold px-3 py-1 rounded border border-border bg-background text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
                disabled={!data?.mdpText}
                onClick={resetMdp}
              >
                Reset to auto
              </button>
            </div>
            <textarea
              className="w-full text-xs font-mono bg-muted border border-border rounded-md px-3 py-2 h-[60vh] resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Blank = auto-generated. Click 'Load template' to edit it, or paste a full .mdp to use verbatim."
              value={data?.mdpText ?? ""}
              spellCheck={false}
              onChange={(e) => setMdp(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground/70 leading-snug mt-1">
              Non-blank is used <strong>verbatim</strong> for this {stageLabel} run. For solvated/merged systems leave <code>define</code> blank (the .top sets the FF/water/ion #defines); for a dry mineral add e.g. <code>define = -DGMINFF_k500</code>.
            </p>
          </DialogContent>
        </Dialog>

        {isSimulationDisabled && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-[10px] text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
            ⚡ <strong>Colab/Local Execution Mode</strong><br />
            Simulation is paused on this CPU instance. Configure the parameters here, then download the Python script to run on **Google Colab (GPU)** for 100x speed!
          </div>
        )}


        {/* Run setup — two columns when the node is wide (Advanced open) */}
        <div className={wideNode ? "grid grid-cols-2 gap-x-3 gap-y-3 items-start" : "space-y-3"}>
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

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Trajectory format</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            value={trajFormat}
            onChange={(e) => updateNodeData(id, { ...data, trajFormat: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="pdb">PDB (multi-frame)</option>
            {isGromacs ? (
              <>
                <option value="xtc">XTC (GROMACS compressed)</option>
                <option value="trr">TRR (GROMACS full precision)</option>
              </>
            ) : (
              <>
                <option value="dcd">DCD (CHARMM/NAMD)</option>
                <option value="xtc">XTC (GROMACS compressed)</option>
              </>
            )}
          </select>
          <p className="text-[10px] text-muted-foreground/70 leading-snug mt-1">
            A multi-frame PDB is always written for the viewer &amp; analysis; a non-PDB choice
            adds that file to the download bundle.
          </p>
        </div>
        </div>

        {mdBlockedHere && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 text-[10px] text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
            ⚠️ <strong>NVT/NPT runs on Colab or locally, not here</strong><br />
            The public server is CPU-only and runs <strong>Energy Minimization</strong> only.
            Configure {simType.toUpperCase()} here, then download the Python script and run it on
            <strong> Google Colab (GPU)</strong> or a local install.
          </div>
        )}

        {/* GROMACS .mdp editing lives in the Advanced (GROMACS) panel's "Edit .mdp" button (pop-out dialog). */}

        {/* Minimization steps — only for minimize */}
        {!mdpActive && simType === "minimize" && (
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

        {/* When a custom .mdp drives the run, the structured fields are the .mdp's job. */}
        {mdpActive && (
          <p className="text-[10px] text-muted-foreground/70 leading-snug border border-emerald-500/20 bg-emerald-500/5 rounded-md px-2 py-1.5">
            Run parameters (steps, temperature, timestep{simType === "npt" ? ", pressure" : ""}, cut-offs, output frequency) come from your <strong>custom .mdp</strong> above.
          </p>
        )}

        {/* MD-specific fields */}
        {!mdpActive && showMdFields && (
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
            {/* Physics knobs — hidden when a custom .mdp supplies them */}
            {!mdpActive && (
            <>
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
            </>
            )}

            {/* Wrap is a trajectory post-processing step (GROMACS: trjconv -pbc atom vs
                whole; OpenMM: enforcePeriodicBox on/off), independent of the .mdp. */}
            <label
              className="nodrag flex items-center justify-between text-xs text-muted-foreground"
              title="ON: wrap everything into the periodic box (a periodic mineral slab stays in the box; a solvent molecule sitting on a box face may be split). OFF: keep molecules whole but do NOT wrap them into the box — they stay where they are and may lie outside it."
            >
              Wrap trajectory into box
              <input
                type="checkbox"
                className="nodrag"
                checked={wrapTrajectory}
                onChange={(e) => updateNodeData(id, { ...data, wrapTrajectory: e.target.checked })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <p className="text-[10px] text-muted-foreground/80 -mt-1">
              On: wrap all atoms into the box. Off: molecules whole, unwrapped (may lie outside the box).
            </p>
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
            {/* Thermo time-series -> connect a Data Plotter. Engine energy output
                (GROMACS .edr / OpenMM StateDataReporter), independent of the .mdp. */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1" title="Parses the run's energy output (GROMACS .edr / OpenMM StateDataReporter) and sends the selected quantities to a connected Data Plotter node. Each checked quantity becomes one series on the plot.">
                Plot data{thermoSel.length > 0 ? ` (${thermoSel.length})` : ""}
              </label>
              <div className="nodrag grid grid-cols-2 gap-x-2 gap-y-0.5 bg-muted border border-border rounded-md px-2 py-1">
                {THERMO_OPTIONS.map((opt) => (
                  <label key={opt.key} className="nodrag flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      className="nodrag"
                      checked={thermoSel.includes(opt.key)}
                      onChange={() => toggleThermo(opt.key)}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                    <span className="truncate" title={opt.label}>{opt.label}</span>
                  </label>
                ))}
              </div>
              {thermoSel.length > 1 && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">
                  All checked quantities share one Y axis — mixing units (e.g. energy + temperature) can flatten the smaller series.
                </p>
              )}
            </div>
            {!mdpActive && (
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
            )}
            {!mdpActive && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1" title="How often a frame is saved to the trajectory (nstxtc for GROMACS, reporter interval for OpenMM). Applies to the PDB and any DCD/XTC/TRR format.">Trajectory save frequency (steps)</label>
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
            ? <>GROMACS: runs this one {simType === "minimize" ? "EM" : simType.toUpperCase()} stage via grompp + mdrun (MINFF min.ff). Chain Simulate nodes for EM→NVT→NPT in any order. On Colab, enable GROMACS via the launcher's Step 1c cell. Friction/constraints/switch are OpenMM-only and ignored here.</>
            : <>Requires OpenMM. Auto GPU/CPU. Water is rigid ({forcefieldMode === "clayff" || prmFile === "clayff" ? "SPC/E" : "OPC3"}).</>}
        </p>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
