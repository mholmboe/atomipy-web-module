import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type ForcefieldType = "minff" | "clayff" | "dummy" | "openff_sage" | "openff_parsley" | "gaff";

type ForcefieldNodeData = {
  forcefield?: ForcefieldType;
  log?: boolean;
  logFile?: string;
  resetMolid?: boolean;
  status?: string;
  rmaxLong?: number;
  rmaxH?: number;
  chargeMethod?: "am1bcc" | "gasteiger" | "none";
  minffVariant?: "0" | "250" | "500" | "1500" | "none";
  clayffAngles?: "none" | "0" | "250" | "500" | "1500";
  moleculeName?: string;
  // Frozen "dummy" model for materials not covered by the built-in force fields
  dummyMetalSite?: "Alo" | "Sit" | "Mgo";
  dummyChargeMode?: "pauling" | "half";
  dummyChargeScale?: number;
  dummyLjMode?: "element" | "minff";
};

export function ForcefieldNode({ id, data = {} }: NodeComponentProps<ForcefieldNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = useState(false);

  const forcefield = data?.forcefield ?? "minff";
  const log = data?.log ?? false;
  const logFile = data?.logFile ?? `${forcefield}.log`;
  const resetMolid = data?.resetMolid ?? true;
  const chargeMethod = data?.chargeMethod ?? "am1bcc";
  const isOrganic = ["openff_sage", "openff_parsley", "gaff"].includes(forcefield);

  const [activeTab, setActiveTab] = useState<"inorganic" | "organic">(isOrganic ? "organic" : "inorganic");

  const changeForcefield = (newValue: ForcefieldType) => {
    const next: ForcefieldNodeData = { ...data, forcefield: newValue };
    if (log && (!data.logFile || data.logFile === `${forcefield}.log`)) {
      next.logFile = `${newValue}.log`;
    }
    // Organic force fields have nothing to do with MINFF/CLAYFF angle terms —
    // never carry/emit minffVariant or clayffAngles on an organic node.
    if (["openff_sage", "openff_parsley", "gaff"].includes(newValue)) {
      delete next.minffVariant;
      delete next.clayffAngles;
    }
    updateNodeData(id, next);
  };

  return (
    <div className="bg-card w-[250px] shadow-lg rounded-xl border border-amber-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Forcefield" Icon={FlaskConical} colorClass="text-yellow-600" className="bg-yellow-500/10" />

      <div className="p-4 space-y-3 bg-background">
        <div className="flex border-b border-border/50 mb-3">
          <button
            type="button"
            className={`flex-1 pb-1.5 text-xs font-semibold ${activeTab === 'inorganic' ? 'text-amber-600 border-b-2 border-amber-500' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('inorganic')}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Inorganic
          </button>
          <button
            type="button"
            className={`flex-1 pb-1.5 text-xs font-semibold ${activeTab === 'organic' ? 'text-amber-600 border-b-2 border-amber-500' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('organic')}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Organic
          </button>
        </div>

        {activeTab === 'inorganic' ? (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Mineral Forcefield</label>
            <select
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
              value={forcefield}
              onChange={(e) => changeForcefield(e.target.value as ForcefieldType)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="minff">MINFF</option>
              <option value="clayff">CLAYFF</option>
              <option value="dummy">Dummy FF</option>
            </select>

            {forcefield === "minff" && (
              <div className="mt-2.5">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">MINFF Variant (Ka)</label>
                <select
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                  value={data.minffVariant ?? "500"}
                  onChange={(e) => updateNodeData(id, { ...data, minffVariant: e.target.value as any })}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="none">No angles (no angle terms; k0 nonbonded)</option>
                  <option value="0">Ka = 0 (Unbonded/Intercalated)</option>
                  <option value="250">Ka = 250 (Soft bonded)</option>
                  <option value="500">Ka = 500 (Standard default)</option>
                  <option value="1500">Ka = 1500 (Rigid framework)</option>
                </select>
              </div>
            )}

            {forcefield === "clayff" && (
              <div className="mt-2.5">
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Angle terms (borrowed from MINFF)</label>
                <select
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                  value={data.clayffAngles ?? "none"}
                  onChange={(e) => updateNodeData(id, { ...data, clayffAngles: e.target.value as any })}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="none">No angles (default)</option>
                  <option value="0">Ka = 0 (Unbonded/Intercalated)</option>
                  <option value="250">Ka = 250 (Soft bonded)</option>
                  <option value="500">Ka = 500 (Standard)</option>
                  <option value="1500">Ka = 1500 (Rigid framework)</option>
                </select>
              </div>
            )}

            {forcefield === "dummy" && (
              <div className="mt-2.5 space-y-2">
                <div className="text-[10px] leading-relaxed text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
                  ⚠️ <b>Dummy FF.</b> For materials not covered by the built-in force
                  fields. Builds a <b>frozen dummy</b>: per-element LJ calculated from
                  vdW data (UFF / Heinz metals) by default, framework frozen.
                  Qualitative only — <b>EM / NVT only</b> (no NPT).
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Charge model</label>
                  <select
                    className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                    value={data.dummyChargeMode ?? "pauling"}
                    onChange={(e) => updateNodeData(id, { ...data, dummyChargeMode: e.target.value as any })}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <option value="pauling">Pauling effective (q_eff; H=+0.4, anions balance)</option>
                    <option value="half">Half oxidation state (0.5 × q_formal)</option>
                  </select>
                </div>
                {(data.dummyChargeMode ?? "pauling") === "half" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Charge scale (× oxidation state)</label>
                    <input
                      type="number" step="0.05" min="0" max="1"
                      className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 h-7"
                      value={data.dummyChargeScale ?? 0.5}
                      onChange={(e) => updateNodeData(id, { ...data, dummyChargeScale: parseFloat(e.target.value) || 0.5 })}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">LJ parameters</label>
                  <select
                    className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                    value={data.dummyLjMode ?? "element"}
                    onChange={(e) => updateNodeData(id, { ...data, dummyLjMode: e.target.value as any })}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <option value="element">Per-element (UFF/Heinz, calculated from vdW)</option>
                    <option value="minff">MINFF-borrowed (O=OPC3, F=F⁻, metals=site)</option>
                  </select>
                </div>
                {(data.dummyLjMode ?? "element") === "minff" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Metal LJ site</label>
                    <select
                      className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                      value={data.dummyMetalSite ?? "Alo"}
                      onChange={(e) => updateNodeData(id, { ...data, dummyMetalSite: e.target.value as any })}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <option value="Alo">Alo — Al octahedral (σ=0.144 nm, recommended)</option>
                      <option value="Sit">Sit — Si tetrahedral (σ=0.082 nm, smallest)</option>
                      <option value="Mgo">Mgo — Mg octahedral (σ=0.196 nm, roomier)</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-border/50 pt-2">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Molecule name (optional)</label>
              <input
                type="text"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                placeholder="auto (MIN, MIN_1, …)"
                value={(data.moleculeName as string) ?? ""}
                onChange={(e) => updateNodeData(id, { ...data, moleculeName: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <div className="text-[10px] text-muted-foreground mt-0.5">Name this mineral (e.g. PYRO, KAOL) so different minerals don't merge as MIN.</div>
            </div>

            <p className="text-[10px] text-muted-foreground mt-2.5 leading-snug">
              Water model is set on the <strong>Solvent</strong> node and ion parameters on the <strong>Ions</strong> node.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Organic Forcefield</label>
              <select
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                value={forcefield}
                onChange={(e) => changeForcefield(e.target.value as ForcefieldType)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="openff_sage">OpenFF Sage</option>
                <option value="openff_parsley">OpenFF Parsley</option>
                <option value="gaff">GAFF</option>
              </select>
            </div>
            
            <div className="border-t border-border/50 pt-2">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Organic Charge Method</label>
              <select
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1.5 py-1"
                value={chargeMethod}
                onChange={(e) => updateNodeData(id, { ...data, chargeMethod: e.target.value as any })}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="am1bcc">AM1-BCC (Recommended)</option>
                <option value="gasteiger">Gasteiger (Fast)</option>
                <option value="none">None (Neutral / Preassigned)</option>
              </select>
            </div>

            <div className="border-t border-border/50 pt-2">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Molecule name (optional)</label>
              <input
                type="text"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                placeholder="auto (organic, organic_2, …)"
                value={(data.moleculeName as string) ?? ""}
                onChange={(e) => updateNodeData(id, { ...data, moleculeName: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <div className="text-[10px] text-muted-foreground mt-0.5">GROMACS moleculetype/residue name. Leave blank for auto-unique.</div>
            </div>
          </div>
        )}

        {activeTab === "inorganic" && (
          <>
        <button
          type="button"
          className="nodrag w-full flex items-center justify-between text-xs font-semibold text-muted-foreground border border-border rounded-md px-2 py-1.5 bg-background hover:bg-muted/50 mt-2"
          onClick={() => setShowMore((prev) => !prev)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Global options (mineral typing)
          {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showMore && (
          <div className="space-y-2 border border-border rounded-md p-2 bg-muted/30">
            <label className="nodrag flex items-start justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Reset MolID
                <span className="block text-[10px] text-muted-foreground/80">
                  On: merge all mineral atoms into one molecule (MolID 1) and separate water for
                  clean typing. Off: keep upstream MolIDs — needed to keep stacked layers as
                  distinct molecules (e.g. for “one [moleculetype] per slab” on export).
                </span>
              </span>
              <input
                type="checkbox"
                className="nodrag mt-0.5"
                checked={resetMolid}
                onChange={(e) => updateNodeData(id, { ...data, resetMolid: e.target.checked })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">rmax long (Å)</label>
                <input
                  type="number"
                  step="0.05"
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={data.rmaxLong || 2.45}
                  onChange={(e) => updateNodeData(id, { ...data, rmaxLong: parseFloat(e.target.value) || 2.45 })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">rmax H (Å)</label>
                <input
                  type="number"
                  step="0.05"
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                  value={data.rmaxH || 1.2}
                  onChange={(e) => updateNodeData(id, { ...data, rmaxH: parseFloat(e.target.value) || 1.2 })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Write typing log
              <input
                type="checkbox"
                className="nodrag"
                checked={log}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  const updates: Partial<ForcefieldNodeData> = { log: isChecked };
                  if (isChecked && !data.logFile) {
                    updates.logFile = `${forcefield}.log`;
                  }
                  updateNodeData(id, { ...data, ...updates });
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>

            {log && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Log filename</label>
                <input
                  type="text"
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                  placeholder="e.g. forcefield.log"
                  value={logFile}
                  onChange={(e) => updateNodeData(id, { ...data, logFile: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
