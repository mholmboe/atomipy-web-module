import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { SlidersHorizontal, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type EditMode = "slice" | "remove" | "molecule" | "resname" | "reorder" | "center" | "millerCut" | "slab";
const OPS = ["<", "<=", ">", ">=", "==", "!="] as const;

type CutPlaneDef = { h: number; k: number; l: number; side: "below" | "above"; levelAuto: boolean; level: number; offset: number };
const DEFAULT_CUT_PLANE: CutPlaneDef = { h: 1, k: 1, l: 1, side: "below", levelAuto: true, level: 0.5, offset: 0 };

type EditNodeData = {
  mode?: EditMode;
  // Slice
  xlo?: number; ylo?: number; zlo?: number;
  xhi?: number; yhi?: number; zhi?: number;
  removePartial?: boolean;
  // Remove
  atomType?: string;
  indices?: string;
  molids?: string;
  logic?: "and" | "or";
  xEnabled?: boolean; yEnabled?: boolean; zEnabled?: boolean;
  xOp?: typeof OPS[number]; yOp?: typeof OPS[number]; zOp?: typeof OPS[number];
  xValue?: number; yValue?: number; zValue?: number;
  // Molecule
  molid?: number;
  moleculeResname?: string;
  // Resname
  defaultResname?: string;
  // Reorder
  byMode?: "index" | "resname" | "type";
  neworder?: string;
  // Center
  centerOrigin?: boolean;
  // Cut by Miller plane(s) — intersection of half-spaces (carves a convex region)
  cutPlanes?: CutPlaneDef[];
  cutWholeMolecules?: boolean;
  cutFourIndex?: boolean;   // hexagonal Miller-Bravais (h k i l) input
  // legacy single-plane fields (migrated into cutPlanes)
  cutH?: number; cutK?: number; cutL?: number;
  cutSide?: "below" | "above";
  cutOffset?: number;
  cutLevelAuto?: boolean;
  cutLevel?: number;
  // Cut shape: Miller planes (default), sphere (nanoparticle), or cylinder (nanowire)
  cutShape?: "planes" | "sphere" | "cylinder";
  cutRadius?: number;
  cutShapeSide?: "inside" | "outside";
  cutAxis?: "x" | "y" | "z";
  cutLength?: number;            // optional axial cap for the cylinder (Å)
  cutCenterAuto?: boolean;       // default: cell centre
  cutCx?: number; cutCy?: number; cutCz?: number;
  // Make surface slab — oriented supercell exposing the (hkl) face along z
  slabH?: number; slabK?: number; slabL?: number;
  slabFourIndex?: boolean;
  slabLayers?: number;
  slabVacuum?: number;
  slabGromacs?: boolean;         // reduce box to GROMACS tilt limits
};

export function EditNode({ id, data }: NodeComponentProps<EditNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = data.mode ?? "remove";

  const set = (field: keyof EditNodeData, value: string | number | boolean | undefined) =>
    updateNodeData(id, { ...data, [field]: value });

  // Cut planes: normalize (migrating any legacy single-plane fields) + helpers.
  const cutPlanes: CutPlaneDef[] = (Array.isArray(data.cutPlanes) && data.cutPlanes.length > 0)
    ? data.cutPlanes
    : [{
        h: data.cutH ?? 1, k: data.cutK ?? 1, l: data.cutL ?? 1,
        side: data.cutSide ?? "below", levelAuto: data.cutLevelAuto ?? true,
        level: data.cutLevel ?? 0.5, offset: data.cutOffset ?? 0,
      }];
  const setCutPlanes = (planes: CutPlaneDef[]) => updateNodeData(id, { ...data, cutPlanes: planes });
  const updateCutPlane = (i: number, patch: Partial<CutPlaneDef>) =>
    setCutPlanes(cutPlanes.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addCutPlane = () => setCutPlanes([...cutPlanes, { ...DEFAULT_CUT_PLANE }]);
  const removeCutPlane = (i: number) => setCutPlanes(cutPlanes.filter((_, j) => j !== i));

  const inputCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1";
  const selectCls = "nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1";

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-amber-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Structure Edit" Icon={SlidersHorizontal} colorClass="text-zinc-500" className="bg-zinc-500/10" />

      <div className="p-4 space-y-3 bg-background">
        {/* Mode selector */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Operation</label>
          <select className={selectCls} value={mode} onChange={(e) => set("mode", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
            <option value="remove">Remove Atoms</option>
            <option value="slice">Slice Region</option>
            <option value="molecule">Set Molecule ID</option>
            <option value="resname">Assign Resname</option>
            <option value="reorder">Reorder Atoms</option>
            <option value="center">Center Coordinates</option>
            <option value="millerCut">Cut (plane / sphere / cylinder)</option>
            <option value="slab">Make surface slab</option>
          </select>
        </div>

        {/* SLICE */}
        {mode === "slice" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(["xlo", "ylo", "zlo"] as const).map((k) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block text-center mb-1">{k}</label>
                  <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                    value={data[k] ?? 0}
                    onChange={(e) => set(k, parseFloat(e.target.value) || 0)}
                    onPointerDown={(e) => e.stopPropagation()} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["xhi", "yhi", "zhi"] as const).map((k) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block text-center mb-1">{k}</label>
                  <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
                    value={data[k] ?? ""} placeholder="box"
                    onChange={(e) => { const v = parseFloat(e.target.value); set(k, isFinite(v) ? v : undefined); }}
                    onPointerDown={(e) => e.stopPropagation()} />
                </div>
              ))}
            </div>
            <label className="nodrag flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={data.removePartial ?? true}
                onChange={(e) => set("removePartial", e.target.checked)}
                onPointerDown={(e) => e.stopPropagation()} />
              Remove partial molecules
            </label>
          </>
        )}

        {/* REMOVE */}
        {mode === "remove" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Atom type(s) (comma-sep.)</label>
              <input type="text" className={inputCls} placeholder="Al or Al, Si"
                value={data.atomType ?? ""}
                onChange={(e) => set("atomType", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Index list</label>
                <input type="text" className={inputCls} placeholder="1,2,3"
                  value={data.indices ?? ""}
                  onChange={(e) => set("indices", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Molecule IDs</label>
                <input type="text" className={inputCls} placeholder="1,4,7"
                  value={data.molids ?? ""}
                  onChange={(e) => set("molids", e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Logic</label>
              <select className={selectCls} value={data.logic ?? "and"} onChange={(e) => set("logic", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                <option value="and">and (all criteria must match)</option>
                <option value="or">or (any criterion can match)</option>
              </select>
            </div>
            {(["x", "y", "z"] as const).map((axis) => {
              const enabledKey = `${axis}Enabled` as keyof EditNodeData;
              const opKey = `${axis}Op` as keyof EditNodeData;
              const valueKey = `${axis}Value` as keyof EditNodeData;
              const enabled = Boolean(data[enabledKey]);
              return (
                <div key={axis} className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center">
                  <label className="nodrag flex items-center gap-1 text-xs text-muted-foreground">
                    <input type="checkbox" checked={enabled} onChange={(e) => set(enabledKey, e.target.checked)} onPointerDown={(e) => e.stopPropagation()} />
                    {axis}
                  </label>
                  <select className="nodrag text-xs bg-muted border border-border rounded-md px-2 py-1" value={(data[opKey] as string) ?? "<"} disabled={!enabled} onChange={(e) => set(opKey, e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                    {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input type="number" step="0.1" className="nodrag text-xs bg-muted border border-border rounded-md px-2 py-1"
                    value={(data[valueKey] as number) ?? 0} disabled={!enabled}
                    onChange={(e) => set(valueKey, parseFloat(e.target.value) || 0)}
                    onPointerDown={(e) => e.stopPropagation()} />
                </div>
              );
            })}
          </>
        )}

        {/* MOLECULE */}
        {mode === "molecule" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Molecule ID</label>
              <input type="number" min="1" className={inputCls}
                value={data.molid ?? 1}
                onChange={(e) => set("molid", parseInt(e.target.value) || 1)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Resname (optional)</label>
              <input type="text" className={inputCls} placeholder="Keep existing"
                value={data.moleculeResname ?? ""}
                onChange={(e) => set("moleculeResname", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
          </>
        )}

        {/* RESNAME */}
        {mode === "resname" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Default Resname</label>
            <input type="text" className={inputCls}
              value={data.defaultResname ?? "MIN"}
              onChange={(e) => set("defaultResname", e.target.value)}
              onPointerDown={(e) => e.stopPropagation()} />
          </div>
        )}

        {/* REORDER */}
        {mode === "reorder" && (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Order By</label>
              <select className={selectCls} value={data.byMode ?? "index"} onChange={(e) => set("byMode", e.target.value)} onPointerDown={(e) => e.stopPropagation()}>
                <option value="index">Index (comma-separated integers)</option>
                <option value="resname">Residue Name</option>
                <option value="type">Atom Type</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {data.byMode === "index" ? "Indices (e.g. 1, 2, 4)" : "Values (e.g. SOL, MMT)"}
              </label>
              <input type="text" className={inputCls} placeholder={data.byMode === "index" ? "1, 2, 4, 5" : "Na, Ow, Hw"}
                value={data.neworder ?? ""}
                onChange={(e) => set("neworder", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()} />
            </div>
          </>
        )}

        {/* CENTER */}
        {mode === "center" && (
          <div className="space-y-2">
            <label className="nodrag flex items-center gap-2 text-xs text-muted-foreground">
              <input 
                type="checkbox" 
                checked={data.centerOrigin ?? false}
                onChange={(e) => set("centerOrigin", e.target.checked)}
                onPointerDown={(e) => e.stopPropagation()} 
              />
              Move to origin [0,0,0] (otherwise centers in box)
            </label>
            <p className="text-[10px] text-muted-foreground/60 leading-normal">
              Centering shifts atom positions relative to their center of geometry or center of mass.
            </p>
          </div>
        )}

        {mode === "millerCut" && (
          <div className="space-y-2">
            {/* Shape selector: Miller planes (convex region) / sphere / cylinder */}
            <div className="flex rounded-md overflow-hidden border border-border text-[10px] font-semibold">
              {(["planes", "sphere", "cylinder"] as const).map((s) => (
                <button key={s} type="button"
                  className={`nodrag flex-1 py-1 transition-colors ${
                    (data.cutShape ?? "planes") === s ? "bg-amber-500/20 text-amber-700" : "bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                  onClick={() => set("cutShape", s)} onPointerDown={(e) => e.stopPropagation()}>
                  {s === "planes" ? "Planes" : s === "sphere" ? "Sphere" : "Cylinder"}
                </button>
              ))}
            </div>

            {/* Shared centre (defaults to cell centre) for sphere/cylinder */}
            {(data.cutShape === "sphere" || data.cutShape === "cylinder") && (
              <div className="space-y-1 border border-border rounded-md p-2 bg-muted/30">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">radius Å
                    <input type="number" step={1} min={0} className={inputCls} value={data.cutRadius ?? 10}
                      onChange={(e) => set("cutRadius", parseFloat(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
                  </label>
                  <select className={selectCls} value={data.cutShapeSide ?? "inside"}
                    onChange={(e) => set("cutShapeSide", e.target.value as "inside" | "outside")} onPointerDown={(e) => e.stopPropagation()}>
                    <option value="inside">keep inside</option>
                    <option value="outside">keep outside</option>
                  </select>
                </div>
                {data.cutShape === "cylinder" && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">axis
                      <select className={selectCls} value={data.cutAxis ?? "z"}
                        onChange={(e) => set("cutAxis", e.target.value as "x" | "y" | "z")} onPointerDown={(e) => e.stopPropagation()}>
                        <option value="x">x</option><option value="y">y</option><option value="z">z</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap" title="Optional axial cap length (Å); blank = full box">length Å
                      <input type="number" step={1} min={0} className={inputCls} value={data.cutLength ?? ""}
                        placeholder="full" onChange={(e) => set("cutLength", e.target.value === "" ? undefined : (parseFloat(e.target.value) || 0))} onPointerDown={(e) => e.stopPropagation()} />
                    </label>
                  </div>
                )}
                <label className="nodrag flex items-center gap-1 text-[10px] text-muted-foreground">
                  <input type="checkbox" checked={data.cutCenterAuto ?? true}
                    onChange={(e) => set("cutCenterAuto", e.target.checked)} onPointerDown={(e) => e.stopPropagation()} />
                  centre at cell centre
                </label>
                {!(data.cutCenterAuto ?? true) && (
                  <div className="grid grid-cols-3 gap-1">
                    {(["cutCx", "cutCy", "cutCz"] as const).map((k, idx) => (
                      <input key={k} type="number" step={1} title={["cx", "cy", "cz"][idx]} placeholder={["cx", "cy", "cz"][idx]}
                        className={`${inputCls} text-center`} value={(data[k] as number) ?? ""}
                        onChange={(e) => set(k, parseFloat(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
                    ))}
                  </div>
                )}
                <label className="nodrag flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <input type="checkbox" checked={data.cutWholeMolecules ?? false}
                    onChange={(e) => set("cutWholeMolecules", e.target.checked)} onPointerDown={(e) => e.stopPropagation()} />
                  Keep whole molecules (by centroid)
                </label>
                <p className="text-[10px] text-muted-foreground/60 leading-normal">
                  {data.cutShape === "sphere"
                    ? "Carves a spherical nanoparticle (keep inside) or drills a cavity (keep outside)."
                    : "Carves a cylindrical nanowire/pore along the chosen axis. Length caps the rod; blank spans the whole box."}
                </p>
              </div>
            )}

            {/* Miller-plane cut (default shape) */}
            {(data.cutShape ?? "planes") === "planes" && (<>
            <label className="nodrag flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={data.cutFourIndex ?? false}
                onChange={(e) => set("cutFourIndex", e.target.checked)} onPointerDown={(e) => e.stopPropagation()} />
              4-index (hkil) — hexagonal
            </label>
            {cutPlanes.map((pl, i) => (
              <div key={i} className="space-y-1 border border-border rounded-md p-2 bg-muted/30">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">{(data.cutFourIndex ?? false) ? "(hkil)" : "(hkl)"}</span>
                  <input type="number" title="h" className={inputCls} value={pl.h}
                    onChange={(e) => updateCutPlane(i, { h: parseInt(e.target.value) || 0 })} onPointerDown={(e) => e.stopPropagation()} />
                  <input type="number" title="k" className={inputCls} value={pl.k}
                    onChange={(e) => updateCutPlane(i, { k: parseInt(e.target.value) || 0 })} onPointerDown={(e) => e.stopPropagation()} />
                  {(data.cutFourIndex ?? false) && (
                    <input type="number" title="i = −(h+k) (auto)" className={`${inputCls} opacity-60 cursor-not-allowed`} value={-(pl.h + pl.k)} readOnly tabIndex={-1} />
                  )}
                  <input type="number" title="l" className={inputCls} value={pl.l}
                    onChange={(e) => updateCutPlane(i, { l: parseInt(e.target.value) || 0 })} onPointerDown={(e) => e.stopPropagation()} />
                  {cutPlanes.length > 1 && (
                    <button type="button" title="Remove plane" onClick={() => removeCutPlane(i)}
                      className="nodrag px-1 text-muted-foreground hover:text-destructive">✕</button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <select className={selectCls} value={pl.side}
                    onChange={(e) => updateCutPlane(i, { side: e.target.value as "below" | "above" })} onPointerDown={(e) => e.stopPropagation()}>
                    <option value="below">keep ≤ (inner)</option>
                    <option value="above">keep ≥ (outer)</option>
                  </select>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap" title="Offset along the normal (Å)">off Å
                    <input type="number" step={0.5} className={inputCls} value={pl.offset}
                      onChange={(e) => updateCutPlane(i, { offset: parseFloat(e.target.value) || 0 })} onPointerDown={(e) => e.stopPropagation()} />
                  </label>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <label className="nodrag flex items-center gap-1">
                    <input type="checkbox" checked={pl.levelAuto}
                      onChange={(e) => updateCutPlane(i, { levelAuto: e.target.checked })} onPointerDown={(e) => e.stopPropagation()} />
                    auto level
                  </label>
                  {!pl.levelAuto && (
                    <label className="flex items-center gap-1">level
                      <input type="number" step={0.1} className={inputCls} value={pl.level}
                        onChange={(e) => updateCutPlane(i, { level: parseFloat(e.target.value) || 0 })} onPointerDown={(e) => e.stopPropagation()} />
                    </label>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={addCutPlane}
              className="nodrag text-[11px] px-2 py-0.5 rounded border border-border bg-muted hover:bg-amber-500/15 text-amber-700">
              + add plane (intersection)
            </button>
            <label className="nodrag flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={data.cutWholeMolecules ?? false}
                onChange={(e) => set("cutWholeMolecules", e.target.checked)} onPointerDown={(e) => e.stopPropagation()} />
              Keep whole molecules (by centroid)
            </label>
            <p className="text-[10px] text-muted-foreground/60 leading-normal">
              Keeps only atoms satisfying ALL planes (intersection). Needs a unit cell.
              Several planes carve a convex region — e.g. 6 side planes 60° apart → a hexagonal column. Preview planes in the Viewer node first.
            </p>
            </>)}
          </div>
        )}

        {/* MAKE SURFACE SLAB */}
        {mode === "slab" && (
          <div className="space-y-2">
            <label className="nodrag flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={data.slabFourIndex ?? false}
                onChange={(e) => set("slabFourIndex", e.target.checked)} onPointerDown={(e) => e.stopPropagation()} />
              4-index (hkil) — hexagonal
            </label>
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-muted-foreground">{(data.slabFourIndex ?? false) ? "(hkil)" : "(hkl)"}</span>
              <input type="number" title="h" className={inputCls} value={data.slabH ?? 1}
                onChange={(e) => set("slabH", parseInt(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
              <input type="number" title="k" className={inputCls} value={data.slabK ?? 1}
                onChange={(e) => set("slabK", parseInt(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
              {(data.slabFourIndex ?? false) && (
                <input type="number" title="i = −(h+k) (auto)" className={`${inputCls} opacity-60 cursor-not-allowed`} value={-((data.slabH ?? 1) + (data.slabK ?? 1))} readOnly tabIndex={-1} />
              )}
              <input type="number" title="l" className={inputCls} value={data.slabL ?? 1}
                onChange={(e) => set("slabL", parseInt(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">layers
                <input type="number" min={1} className={inputCls} value={data.slabLayers ?? 1}
                  onChange={(e) => set("slabLayers", parseInt(e.target.value) || 1)} onPointerDown={(e) => e.stopPropagation()} />
              </label>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap" title="Vacuum gap along z (Å); >0 makes a free-standing slab">vacuum Å
                <input type="number" min={0} step={1} className={inputCls} value={data.slabVacuum ?? 0}
                  onChange={(e) => set("slabVacuum", parseFloat(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} />
              </label>
            </div>
            <label className="nodrag flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={data.slabGromacs ?? false}
                onChange={(e) => set("slabGromacs", e.target.checked)} onPointerDown={(e) => e.stopPropagation()} />
              Reduce box for GROMACS
            </label>
            <p className="text-[10px] text-muted-foreground/60 leading-normal">
              Builds an oriented supercell with the (hkl) face in the xy-plane (surface ⟂ z), stacked over <i>layers</i> and capped with <i>vacuum</i>.
              {" "}Leave “Reduce box for GROMACS” off for OpenMM/LAMMPS/analysis; tick it only for GROMACS (high-index faces otherwise exceed its tilt limits). Needs a unit cell.
            </p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
