import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, Activity } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type SimulationType = "minimize" | "nvt" | "npt";
type ForcefieldMode = "minff" | "clayff" | "preassigned";
type PrmFile = "minff" | "minff_gminff_k0" | "minff_gminff_k250" | "minff_gminff_k1500" | "clayff";

type SimulateNodeData = {
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
};

export function SimulateNode({ id, data }: NodeComponentProps<SimulateNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = useState(false);

  const forcefieldMode = data.forcefieldMode ?? "minff";
  const prmFile = data.prmFile ?? "minff";
  const simType = data.simType ?? "minimize";
  const miniSteps = data.miniSteps ?? 500;
  const mdSteps = data.mdSteps ?? 5000;
  const temperature = data.temperature ?? 298.15;
  const timestep = data.timestep ?? 1.0;
  const cutoff = data.cutoff ?? 12.0;
  const constraints = data.constraints ?? "HBonds";
  const pressure = data.pressure ?? 1.0;
  const frictionCoeff = data.frictionCoeff ?? 1.0;
  const switchDistance = data.switchDistance ?? 10.0;
  const writePdb = data.writePdb ?? data.writeDcd ?? false;
  const pdbFreq = data.pdbFreq ?? data.dcdFreq ?? 1000;

  const showMdFields = simType === "nvt" || simType === "npt";

  return (
    <div className="bg-card w-[260px] shadow-lg rounded-xl border border-emerald-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Simulate (OpenMM)" Icon={Activity} colorClass="text-emerald-600" className="bg-emerald-500/10" />

      <div className="p-4 space-y-3 bg-background">
        {/* Forcefield selection */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Forcefield</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            value={forcefieldMode}
            onChange={(e) => {
              const newMode = e.target.value as ForcefieldMode;
              const updates: Partial<SimulateNodeData> = { forcefieldMode: newMode };
              // Auto-select matching PRM when choosing a forcefield
              if (newMode === "minff") updates.prmFile = "minff";
              else if (newMode === "clayff") updates.prmFile = "clayff";
              updateNodeData(id, { ...data, ...updates });
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="minff">MINFF (assign types)</option>
            <option value="clayff">CLAYFF (assign types)</option>
            <option value="preassigned">Pre-assigned (FF node)</option>
          </select>
        </div>

        {/* Variant selector */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Parameter Set</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
            value={prmFile}
            onChange={(e) => updateNodeData(id, { ...data, prmFile: e.target.value as PrmFile })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="minff_gminff_k0">MINFF (GMINFF_k0, OPC3_IOD_LM, OPC3)</option>
            <option value="minff_gminff_k250">MINFF (GMINFF_k250, OPC3_IOD_LM, OPC3)</option>
            <option value="minff">MINFF (GMINFF_k500, OPC3_IOD_LM, OPC3)</option>
            <option value="minff_gminff_k1500">MINFF (GMINFF_k1500, OPC3_IOD_LM, OPC3)</option>
            <option value="clayff">CLAYFF (CLAYFF_EXT, SPCE_HFE_LM, SPCE)</option>
          </select>
        </div>

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

        {/* Minimization steps — only for minimize */}
        {simType === "minimize" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Minimization Steps
            </label>
            <input
              type="number"
              min={0}
              max={20000}
              step={100}
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
              value={miniSteps}
              onChange={(e) => updateNodeData(id, { ...data, miniSteps: Math.max(0, Math.min(20000, parseInt(e.target.value) || 0)) })}
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
                  max={20000}
                  step={500}
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={mdSteps}
                  onChange={(e) => updateNodeData(id, { ...data, mdSteps: Math.max(0, Math.min(20000, parseInt(e.target.value) || 0)) })}
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
            {writePdb && showMdFields && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">PDB frequency (steps)</label>
                <input
                  type="number"
                  min={10}
                  step={100}
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={pdbFreq}
                  onChange={(e) => updateNodeData(id, { ...data, pdbFreq: Math.max(10, parseInt(e.target.value) || 1000) })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/60 leading-tight">
          Requires OpenMM. Auto GPU/CPU. Water is rigid ({forcefieldMode === "clayff" || prmFile === "clayff" ? "SPC/E" : "OPC3"}).
        </p>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
