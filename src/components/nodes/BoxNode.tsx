import React, { useEffect } from "react";
import { Handle, Position, useReactFlow, useEdges, useNodes } from "@xyflow/react";
import { Box, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps, PresetOption } from "./types";

type BoxMode = "cell" | "box_dim" | "fit";

type BoxNodeData = {
  inputMode?: BoxMode;
  // Fit-to-molecule fields
  padding?: number;
  cubic?: boolean;
  centerMol?: boolean;
  // Cell fields
  a?: number;
  b?: number;
  c?: number;
  alpha?: number;
  beta?: number;
  gamma?: number;
  // Box_dim fields
  lx?: number;
  ly?: number;
  lz?: number;
  xy?: number;
  xz?: number;
  yz?: number;
  // Tracks what we last inherited so we can follow changes
  lastInferredFrom?: {
    nodeId: string;
    values: Partial<BoxNodeData>; // The actual values we last pushed
  };
};

type NumericBoxField = "a" | "b" | "c" | "alpha" | "beta" | "gamma" | "lx" | "ly" | "lz" | "xy" | "xz" | "yz";

// --- Pure JS conversions (mirrors atomipy/cell_utils.py) ---

function cellToBoxDim(a: number, b: number, c: number, alpha: number, beta: number, gamma: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const isOrtho = Math.abs((alpha || 90) - 90) < 1e-6 && Math.abs((beta || 90) - 90) < 1e-6 && Math.abs((gamma || 90) - 90) < 1e-6;
  if (isOrtho) {
    return { lx: a, ly: b, lz: c, xy: 0, xz: 0, yz: 0 };
  }
  const ar = toRad(alpha || 90), br = toRad(beta || 90), gr = toRad(gamma || 90);
  const lx = a;
  const xy = b * Math.cos(gr);
  const ly = Math.sqrt(Math.max(0, b * b - xy * xy));
  const xz = c * Math.cos(br);
  const yz = ly !== 0 ? (b * c * Math.cos(ar) - xy * xz) / ly : 0;
  const lz = Math.sqrt(Math.max(0, c * c - xz * xz - yz * yz));
  return { lx, ly, lz, xy, xz, yz };
}

function boxDimToCell(lx: number, ly: number, lz: number, xy: number, xz: number, yz: number) {
  const a = lx;
  const b = Math.sqrt(ly * ly + xy * xy);
  const c = Math.sqrt(lz * lz + xz * xz + yz * yz);
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const cosAlpha = b > 0 && c > 0 ? (ly * yz + xy * xz) / (b * c) : 0;
  const cosBeta = c > 0 ? xz / c : 0;
  const cosGamma = b > 0 ? xy / b : 0;
  const alpha = toDeg(Math.acos(Math.max(-1, Math.min(1, cosAlpha))));
  const beta = toDeg(Math.acos(Math.max(-1, Math.min(1, cosBeta))));
  const gamma = toDeg(Math.acos(Math.max(-1, Math.min(1, cosGamma))));
  return { a, b, c, alpha, beta, gamma };
}

function fmt(v: number) {
  return parseFloat(v.toFixed(4));
}

// ----------------------------------------------------------------

export function BoxNode({ id, data }: NodeComponentProps<BoxNodeData>) {
  const { updateNodeData, getNode, setNodes } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes(); // Re-run effect when any node changes
  const mode = data.inputMode ?? "cell";

  // ------- Auto-seed from upstream structure/replicate/scale --------
  useEffect(() => {
    const missing = (v: number | undefined) => !(typeof v === "number" && Number.isFinite(v));
    const hasValue = (v: number | undefined) => typeof v === "number" && Number.isFinite(v);
    
    type BoxSeed = BoxNodeData;

    const findSeedFromPresetData = (sourceData: {
      source?: string; value?: string; presets?: PresetOption[];
    }): BoxSeed | null => {
      const { source: sourceKind, value, presets } = sourceData;
      const canUsePreset = sourceKind === "preset" || sourceKind === undefined;
      if (!canUsePreset || !value || !Array.isArray(presets)) return null;
      const metrics = presets.find((p) => p.fileName === value)?.metrics;
      if (!metrics) return null;
      
      const seed: BoxSeed = {
        a: metrics.a ?? 50, b: metrics.b ?? 50, c: metrics.c ?? 50,
        alpha: metrics.alpha ?? 90, beta: metrics.beta ?? 90, gamma: metrics.gamma ?? 90,
      };
      const bd = cellToBoxDim(seed.a!, seed.b!, seed.c!, seed.alpha!, seed.beta!, seed.gamma!);
      return { ...seed, ...bd };
    };

    const mergeSeed = (base: BoxSeed | null, extra: BoxSeed): BoxSeed => {
      // If extra has values, use them, otherwise use base
      const merged: BoxSeed = {
        a: hasValue(extra.a) ? extra.a : base?.a,
        b: hasValue(extra.b) ? extra.b : base?.b,
        c: hasValue(extra.c) ? extra.c : base?.c,
        alpha: hasValue(extra.alpha) ? extra.alpha : base?.alpha,
        beta: hasValue(extra.beta) ? extra.beta : base?.beta,
        gamma: hasValue(extra.gamma) ? extra.gamma : base?.gamma,
        lx: hasValue(extra.lx) ? extra.lx : base?.lx,
        ly: hasValue(extra.ly) ? extra.ly : base?.ly,
        lz: hasValue(extra.lz) ? extra.lz : base?.lz,
        xy: hasValue(extra.xy) ? extra.xy : base?.xy,
        xz: hasValue(extra.xz) ? extra.xz : base?.xz,
        yz: hasValue(extra.yz) ? extra.yz : base?.yz,
      };
      
      // Ensure cross-consistency if partial values provided
      if (mode === "cell" && (hasValue(merged.a) || hasValue(merged.alpha))) {
        const bd = cellToBoxDim(merged.a || 50, merged.b || 50, merged.c || 50, merged.alpha || 90, merged.beta || 90, merged.gamma || 90);
        Object.assign(merged, bd);
      } else if (mode === "box_dim" && (hasValue(merged.lx) || hasValue(merged.xy))) {
        const cell = boxDimToCell(merged.lx || 50, merged.ly || 50, merged.lz || 50, merged.xy || 0, merged.xz || 0, merged.yz || 0);
        Object.assign(merged, cell);
      }
      
      return merged;
    };

    const getPrimary = (nodeId: string) => {
      const incoming = edges.filter((e) => e.target === nodeId);
      if (!incoming.length) return null;
      const inA = incoming.find((e) => e.targetHandle === "inA");
      return (inA ?? incoming[0]).source;
    };

    const inferSeed = (nodeId: string, visited = new Set<string>()): BoxSeed | null => {
      if (visited.has(nodeId)) return null;
      visited.add(nodeId);
      const node = getNode(nodeId);
      if (!node) return null;
      const nd = (node.data ?? {}) as Record<string, unknown>;

      if (node.type === "structure" || node.type === "preset")
        return findSeedFromPresetData(nd as { source?: string; value?: string; presets?: PresetOption[] });

      if (node.type === "box") {
        const own = nd as BoxNodeData;
        const up = getPrimary(node.id);
        const upSeed = up ? inferSeed(up, visited) : null;
        return mergeSeed(upSeed, own);
      }

      if (node.type === "replicate") {
        const up = getPrimary(node.id);
        const parent = up ? inferSeed(up, visited) : null;
        if (!parent) return null;
        const rx = hasValue(nd.x as number) ? Math.max(1, Number(nd.x)) : 1;
        const ry = hasValue(nd.y as number) ? Math.max(1, Number(nd.y)) : 1;
        const rz = hasValue(nd.z as number) ? Math.max(1, Number(nd.z)) : 1;
        const res: BoxSeed = {
          a: parent.a ? parent.a * rx : undefined,
          b: parent.b ? parent.b * ry : undefined,
          c: parent.c ? parent.c * rz : undefined,
          alpha: parent.alpha, beta: parent.beta, gamma: parent.gamma,
          lx: parent.lx ? parent.lx * rx : undefined,
          ly: parent.ly ? parent.ly * ry : undefined,
          lz: parent.lz ? parent.lz * rz : undefined,
          xy: parent.xy ? parent.xy * ry : undefined, // xy scales with Y replication
          xz: parent.xz ? parent.xz * rz : undefined, // xz scales with Z replication
          yz: parent.yz ? parent.yz * rz : undefined, // yz scales with Z replication
        };
        return res;
      }

      if (node.type === "scale") {
        const up = getPrimary(node.id);
        const parent = up ? inferSeed(up, visited) : null;
        if (!parent) return null;
        const sx = hasValue(nd.sx as number) ? Number(nd.sx) : 1;
        const sy = hasValue(nd.sy as number) ? Number(nd.sy) : 1;
        const sz = hasValue(nd.sz as number) ? Number(nd.sz) : 1;
        const res: BoxSeed = {
          a: parent.a ? parent.a * sx : undefined,
          b: parent.b ? parent.b * sy : undefined,
          c: parent.c ? parent.c * sz : undefined,
          alpha: parent.alpha, beta: parent.beta, gamma: parent.gamma,
          lx: parent.lx ? parent.lx * sx : undefined,
          ly: parent.ly ? parent.ly * sy : undefined,
          lz: parent.lz ? parent.lz * sz : undefined,
          xy: parent.xy ? parent.xy * sy : undefined,
          xz: parent.xz ? parent.xz * sz : undefined,
          yz: parent.yz ? parent.yz * sz : undefined,
        };
        return res;
      }

      const passthroughTypes = new Set([
        "position", "rotate", "wrap", "addIons", "ions", "bondAngle", "bvs", "slice", "insert",
        "substitute", "fuse", "resname", "molecule", "merge", "add", "transform", "pbc", "edit", 
        "chemistry", "solvent", "analysis", "forcefield", "bend", "atomProps", "coordFrame", 
        "xrd", "viewer", "trajectory", "export", "simulate"
      ]);
      if (passthroughTypes.has(node.type ?? "")) {
        const up = getPrimary(node.id);
        return up ? inferSeed(up, visited) : null;
      }
      return null;
    };

    // Dynamically search upstream for any computed PDB coordinate string containing runtime CRYST1 box metrics
    const findDynamicBoxFromPdb = (nodeId: string, visited = new Set<string>()): BoxSeed | null => {
      if (visited.has(nodeId)) return null;
      visited.add(nodeId);
      const node = getNode(nodeId);
      if (!node) return null;
      
      const nd = (node.data ?? {}) as Record<string, unknown>;
      // If this node contains dynamic run-time PDB coordinate data, parse its CRYST1 line!
      if (typeof nd.pdb === "string" && nd.pdb.trim()) {
        const lines = nd.pdb.split("\n");
        // Loop backwards to read the CRYST1 line of the last/current frame
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith("CRYST1")) {
            const a = parseFloat(line.substring(6, 15).trim());
            const b = parseFloat(line.substring(15, 24).trim());
            const c = parseFloat(line.substring(24, 33).trim());
            const alpha = parseFloat(line.substring(33, 40).trim()) || 90.0;
            const beta = parseFloat(line.substring(40, 47).trim()) || 90.0;
            const gamma = parseFloat(line.substring(47, 54).trim()) || 90.0;
            if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) {
              const seed = { a, b, c, alpha, beta, gamma };
              const bd = cellToBoxDim(a, b, c, alpha, beta, gamma);
              return { ...seed, ...bd };
            }
          }
        }
      }
      
      // Keep traversing backwards
      const incoming = edges.filter((e) => e.target === nodeId);
      if (incoming.length > 0) {
        const inA = incoming.find((e) => e.targetHandle === "inA") || incoming[0];
        return findDynamicBoxFromPdb(inA.source, visited);
      }
      return null;
    };

    if (mode === "fit") return;   // fit mode computes the box from atoms at build time

    const edge = edges.find((e) => e.target === id);
    if (!edge) return;

    // First prioritize dynamic run-time box coordinates from upstream simulation PDB, falling back to static trace
    const seed = findDynamicBoxFromPdb(edge.source) || inferSeed(edge.source);
    if (!seed) return;

    const lastVals = data.lastInferredFrom?.values || {};
    const next: BoxNodeData = { ...data };
    let hasUpdates = false;

    // Tolerance-based comparison to handle floating point issues
    const isSame = (v1: number | undefined, v2: number | undefined) => {
      if (missing(v1) && missing(v2)) return true;
      if (missing(v1) || missing(v2)) return false;
      return Math.abs(v1! - v2!) < 0.001;
    };

    const updateIfClean = (field: NumericBoxField) => {
      const current = data[field];
      const target = seed[field];
      const last = lastVals[field] as number | undefined;

      // Update if: 1. Missing, or 2. Matches our last push (user hasn't edited)
      if (missing(current) || isSame(current, last)) {
        if (!isSame(current, target)) {
          next[field] = target;
          hasUpdates = true;
        }
      }
    };

    const fields: NumericBoxField[] = mode === "cell"
      ? ["a", "b", "c", "alpha", "beta", "gamma"] 
      : ["lx", "ly", "lz", "xy", "xz", "yz"];

    fields.forEach(updateIfClean);

    if (hasUpdates) {
      next.lastInferredFrom = { 
        nodeId: edge.source, 
        values: { ...seed } 
      };
      updateNodeData(id, next);
    }
  }, [data, edges, nodes, id, mode, updateNodeData, getNode]);

  // ------- Mode switch with live conversion --------
  const switchMode = (newMode: BoxMode) => {
    if (newMode === mode) return;
    let update: Partial<BoxNodeData> = { inputMode: newMode };

    if (newMode === "box_dim" && mode === "cell") {
      const a = data.a ?? 50, b = data.b ?? 50, c = data.c ?? 50;
      const alpha = data.alpha ?? 90, beta = data.beta ?? 90, gamma = data.gamma ?? 90;
      if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) {
        const bd = cellToBoxDim(a, b, c, alpha, beta, gamma);
        update = { ...update, lx: fmt(bd.lx), ly: fmt(bd.ly), lz: fmt(bd.lz), xy: fmt(bd.xy), xz: fmt(bd.xz), yz: fmt(bd.yz) };
      }
    } else if (newMode === "cell" && mode === "box_dim") {
      const lx = data.lx ?? 50, ly = data.ly ?? 50, lz = data.lz ?? 50;
      const xy = data.xy ?? 0, xz = data.xz ?? 0, yz = data.yz ?? 0;
      if (Number.isFinite(lx) && Number.isFinite(ly) && Number.isFinite(lz)) {
        const cell = boxDimToCell(lx, ly, lz, xy, xz, yz);
        update = { ...update, a: fmt(cell.a), b: fmt(cell.b), c: fmt(cell.c), alpha: fmt(cell.alpha), beta: fmt(cell.beta), gamma: fmt(cell.gamma) };
      }
    }
    updateNodeData(id, { ...data, ...update });
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const parent = getNode(id);
    if (!parent) return;
    const newId = `box_${new Date().getTime()}`;
    const newPosition = { x: parent.position.x + 30, y: parent.position.y + 30 };
    const newNode = {
      id: newId,
      type: "box",
      position: newPosition,
      data: {
        ...data,
        lastInferredFrom: undefined
      },
      selected: true,
    };
    setNodes((nds) => nds.map((n) => n.selected ? { ...n, selected: false } : n).concat(newNode));
  };

  const setField = (field: keyof BoxNodeData, raw: string) => {
    const v = parseFloat(raw);
    updateNodeData(id, { ...data, [field]: Number.isFinite(v) ? v : undefined });
  };

  const numInput = (field: keyof BoxNodeData, label: string, placeholder: string, step = "0.1") => (
    <div>
      <label className="text-[10px] font-bold text-muted-foreground flex items-center justify-center h-4">{label}</label>
      <input
        type="number" step={step}
        className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
        placeholder={placeholder}
        value={(data[field] as number | undefined) !== undefined ? fmt(data[field] as number) : ""}
        onChange={(e) => setField(field, e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );

  return (
    <div className="bg-card w-[270px] shadow-lg rounded-xl border border-indigo-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="System Box size" Icon={Box} colorClass="text-indigo-500" className="bg-indigo-500/10" />

      <div className="p-4 space-y-3 bg-background">
        {/* Mode Toggle */}
        <div className="flex rounded-md overflow-hidden border border-border text-[10px] font-bold">
          <button
            onClick={() => switchMode("cell")}
            className={`flex-1 py-1.5 transition-all ${mode === "cell" ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground hover:bg-indigo-500/20"}`}
          >
            Cell (abc/αβγ)
          </button>
          <button
            onClick={() => switchMode("box_dim")}
            className={`flex-1 py-1.5 transition-all ${mode === "box_dim" ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground hover:bg-indigo-500/20"}`}
          >
            Box Dim
          </button>
          <button
            onClick={() => switchMode("fit")}
            className={`flex-1 py-1.5 transition-all ${mode === "fit" ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground hover:bg-indigo-500/20"}`}
            title="Fit the box snugly to the structure (extent + margin), like gmx editconf -d"
          >
            Fit to mol
          </button>
        </div>

        {mode === "fit" ? (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground leading-snug">
              Box is fitted to the structure at run time: bounding box + margin on every
              side (like <span className="font-mono">gmx editconf -d</span>).
            </p>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground block mb-1">Margin / padding (Å per side)</label>
              <input
                type="number" step="0.5" min="0"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 h-7"
                value={data.padding ?? 10}
                onChange={(e) => updateNodeData(id, { ...data, padding: parseFloat(e.target.value) || 0 })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Cubic box (all edges equal)
              <input
                type="checkbox" className="nodrag"
                checked={data.cubic ?? false}
                onChange={(e) => updateNodeData(id, { ...data, cubic: e.target.checked })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
              Center molecule in box
              <input
                type="checkbox" className="nodrag"
                checked={data.centerMol ?? true}
                onChange={(e) => updateNodeData(id, { ...data, centerMol: e.target.checked })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            {data.centerMol === false && (
              <p className="text-[9px] text-muted-foreground/70 leading-snug">
                Original coordinates kept; box size is still the snug fit. Make sure the
                structure already sits inside the box (else it wraps under PBC).
              </p>
            )}
          </div>
        ) : mode === "cell" ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {numInput("a", "a (Å)", "50.0")}
              {numInput("b", "b (Å)", "50.0")}
              {numInput("c", "c (Å)", "50.0")}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {numInput("alpha", "α°", "90")}
              {numInput("beta", "β°", "90")}
              {numInput("gamma", "γ°", "90")}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {numInput("lx", "lx (Å)", "50.0")}
              {numInput("ly", "ly (Å)", "50.0")}
              {numInput("lz", "lz (Å)", "50.0")}
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-muted-foreground block text-center">TILT FACTORS (xy / xz / yz)</label>
              <div className="grid grid-cols-3 gap-2">
                {numInput("xy", "xy", "0", "0.001")}
                {numInput("xz", "xz", "0", "0.001")}
                {numInput("yz", "yz", "0", "0.001")}
              </div>
            </div>
          </>
        )}

        {/* Equivalent Preview & Duplicate Button Row (cell/box_dim only) */}
        {mode !== "fit" && (
        <div className="flex gap-2 items-stretch">
          <div className="flex-1 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg p-2 border border-indigo-500/20 flex flex-col justify-center">
            <label className="text-[8px] font-bold text-indigo-500/70 uppercase block mb-1 text-center">
              {mode === "cell" ? "Equivalent Box Dims" : "Equivalent Cell Params"}
            </label>
            <div className="text-[10px] text-foreground/80 font-mono text-center leading-relaxed">
              {mode === "cell" ? (() => {
                const bd = cellToBoxDim(data.a ?? 50, data.b ?? 50, data.c ?? 50, data.alpha ?? 90, data.beta ?? 90, data.gamma ?? 90);
                return (
                  <>
                    <div className="border-b border-indigo-500/10 pb-0.5 mb-0.5">
                      {fmt(bd.lx)}, {fmt(bd.ly)}, {fmt(bd.lz)}
                    </div>
                    <div>
                      {fmt(bd.xy)}, {fmt(bd.xz)}, {fmt(bd.yz)}
                    </div>
                  </>
                );
              })() : (() => {
                const c = boxDimToCell(data.lx ?? 50, data.ly ?? 50, data.lz ?? 50, data.xy ?? 0, data.xz ?? 0, data.yz ?? 0);
                return (
                  <>
                    <div className="border-b border-indigo-500/10 pb-0.5 mb-0.5">
                      {fmt(c.a)}, {fmt(c.b)}, {fmt(c.c)}
                    </div>
                    <div>
                      {fmt(c.alpha)}°, {fmt(c.beta)}°, {fmt(c.gamma)}°
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          <button
            onClick={handleDuplicate}
            className="px-2 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white rounded-lg text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-0.5 shadow-md shadow-indigo-500/15 shrink-0 w-[60px] text-center"
            title="Duplicate Box Size"
          >
            <span>Copy</span>
            <span>Box</span>
          </button>
        </div>
        )}

      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
