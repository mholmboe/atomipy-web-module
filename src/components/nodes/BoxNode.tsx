import React, { useEffect, useMemo } from "react";
import { Handle, Position, useReactFlow, useEdges, useNodes } from "@xyflow/react";
import { Box, RefreshCw } from "lucide-react";
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

// --- Volume & density readout -----------------------------------
// Standard atomic weights (g/mol) for the elements common in MD/mineral systems.
// Used to estimate the system mass (hence density) from an upstream run-time PDB.
const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007,
  O: 15.999, F: 18.998, Ne: 20.18, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085,
  P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078, Sc: 44.956,
  Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693,
  Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.971, Br: 79.904,
  Kr: 83.798, Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95,
  Ag: 107.868, Cd: 112.414, In: 114.818, Sn: 118.71, Sb: 121.76, Te: 127.6, I: 126.904,
  Xe: 131.293, Cs: 132.905, Ba: 137.327, La: 138.905, Ce: 140.116, W: 183.84,
  Pt: 195.084, Au: 196.967, Hg: 200.592, Pb: 207.2, Bi: 208.98, U: 238.029,
};

function elementMass(token: string): number | undefined {
  if (!token) return undefined;
  const norm = token.length >= 2 ? token[0].toUpperCase() + token[1].toLowerCase() : token.toUpperCase();
  if (ATOMIC_MASS[norm] !== undefined) return ATOMIC_MASS[norm];
  // Fall back to the leading single letter (e.g. atom name "OW" -> O, "HW1" -> H)
  return ATOMIC_MASS[norm[0]];
}

// Sum the atomic masses of the FIRST model in a PDB string (g/mol) + atom count.
// Prefers the element column (77-78); falls back to inferring from the atom name.
function parseAtomsFromPdb(pdb: string): { mass: number; count: number; unknown: number } {
  let mass = 0, count = 0, unknown = 0;
  for (const line of pdb.split("\n")) {
    const rec = line.substring(0, 6).trim();
    if (rec === "ENDMDL") break;                 // only the first frame
    if (rec !== "ATOM" && rec !== "HETATM") continue;
    let el = line.substring(76, 78).trim();
    if (!el) el = (line.substring(12, 16).trim().match(/[A-Za-z]{1,2}/)?.[0]) ?? "";
    const m = elementMass(el);
    if (m === undefined) { unknown++; } else { mass += m; }
    count++;
  }
  return { mass, count, unknown };
}

// Parse the last CRYST1 line of a PDB into orthogonal box dims (lx, ly, lz).
function cryst1ToBoxDim(pdb: string): { lx: number; ly: number; lz: number } | null {
  const lines = pdb.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith("CRYST1")) continue;
    const a = parseFloat(line.substring(6, 15)), b = parseFloat(line.substring(15, 24)), c = parseFloat(line.substring(24, 33));
    const al = parseFloat(line.substring(33, 40)) || 90, be = parseFloat(line.substring(40, 47)) || 90, ga = parseFloat(line.substring(47, 54)) || 90;
    if ([a, b, c].every(Number.isFinite)) return cellToBoxDim(a, b, c, al, be, ga);
  }
  return null;
}

// Density of a molar mass M (g/mol) of atoms occupying V (Å³): rho = M / (N_A * V * 1e-24).
const DENSITY_FACTOR = 0.6022140760; // = N_A * 1e-24 ; rho[g/cm^3] = M / (DENSITY_FACTOR * V[Å^3])

// Molar masses (g/mol) for a composition-based density ESTIMATE before a build — from a
// Solvent count or a Topology molecule list, when no run-time PDB exists yet. Water models
// are all ~18.015 (H2O); monatomic ions by element. Anything we can't resolve (multi-atom
// mineral/organic residues, where we don't know atoms-per-molecule) returns null.
const WATER_MOLAR_MASS = 18.01528;
const ION_MOLAR_MASS: Record<string, number> = {
  H: 1.008, Li: 6.94, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Na: 22.98977, Mg: 24.305,
  Al: 26.982, P: 30.974, S: 32.06, Cl: 35.453, K: 39.0983, Ca: 40.078, Fe: 55.845, Zn: 65.38,
  Br: 79.904, Rb: 85.468, Sr: 87.62, I: 126.904, Cs: 132.905, Ba: 137.327,
};
function moleculeMolarMass(name: string, type?: string): { mass: number; atoms: number } | null {
  const t = (type || "").toLowerCase();
  const n = (name || "").trim();
  if (t === "water" || /^(sol|wat|hoh|spc|tip|opc)/i.test(n)) return { mass: WATER_MOLAR_MASS, atoms: 3 };
  if (t === "ion" || t === "" || t === "atom") {
    const el = n.replace(/[^A-Za-z]/g, "");
    if (el) {
      const norm = el.length >= 2 ? el[0].toUpperCase() + el[1].toLowerCase() : el.toUpperCase();
      const m = ION_MOLAR_MASS[norm] ?? ION_MOLAR_MASS[el.toUpperCase()] ?? ION_MOLAR_MASS[el[0].toUpperCase()];
      if (m != null) return { mass: m, atoms: 1 };
    }
  }
  return null;
}

// ----------------------------------------------------------------

export function BoxNode({ id, data }: NodeComponentProps<BoxNodeData>) {
  const { updateNodeData, getNode, setNodes } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes(); // Re-run effect when any node changes
  const mode = data.inputMode ?? "cell";

  // ------- Volume + density readout --------
  // Walk upstream for a run-time PDB (the only place actual atoms/masses exist) so we
  // can report the system density. `nodes` in the deps makes this recompute whenever
  // upstream data changes; the box dims come from `data`, so density updates live as
  // the box is resized (mass is constant, volume changes).
  const systemMass = useMemo(() => {
    const empty = { mass: 0, count: 0, unknown: 0, estimated: false, pdbDims: null as null | { lx: number; ly: number; lz: number } };
    // The atoms that fill this box are produced across the pipeline — the structure
    // upstream AND the solvent/ions added downstream — so search the whole connected
    // component (edges in either direction). Prefer the richest run-time PDB (exact, after
    // a build); if none exists yet, fall back to a composition ESTIMATE from a Topology
    // molecule list or a fixed-count Solvent node so density shows before/without a build.
    // Directed-upstream replication factor to reach each upstream node's atoms, so a
    // PDB cached upstream of a Replicate/Scale (e.g. the imported structure) is counted
    // for the replicated system. Keeps density right: dims and atom count scale together.
    const primaryOf = (nodeId: string): string | null => {
      const inc = edges.filter((e) => e.target === nodeId);
      if (!inc.length) return null;
      const inA = inc.find((e) => e.targetHandle === "inA");
      return (inA ?? inc[0]).source;
    };
    const upstreamFactor = new Map<string, [number, number, number]>();
    {
      let fx = 1, fy = 1, fz = 1;
      const seen = new Set<string>([id]);
      let cur = primaryOf(id);
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        upstreamFactor.set(cur, [fx, fy, fz]);
        const n = getNode(cur);
        const nd = (n?.data ?? {}) as Record<string, unknown>;
        const num = (v: unknown, d: number) =>
          typeof v === "number" && Number.isFinite(v) ? Number(v) : (Number.isFinite(parseFloat(String(v))) ? parseFloat(String(v)) : d);
        if (n?.type === "replicate") { fx *= Math.max(1, num(nd.x, 1)); fy *= Math.max(1, num(nd.y, 1)); fz *= Math.max(1, num(nd.z, 1)); }
        else if (n?.type === "scale") { fx *= num(nd.sx, 1); fy *= num(nd.sy, 1); fz *= num(nd.sz, 1); }
        cur = primaryOf(cur);
      }
    }

    const visited = new Set<string>([id]);
    const stack = [id];
    let best: { mass: number; count: number; unknown: number; pdbDims: typeof empty.pdbDims } | null = null;
    let topo: { mass: number; atoms: number; unresolved: number } | null = null;
    let solvent: { mass: number; atoms: number } | null = null;
    while (stack.length) {
      const nodeId = stack.pop()!;
      const node = getNode(nodeId);
      if (node) {
        const nd = (node.data ?? {}) as Record<string, unknown>;
        if (typeof nd.pdb === "string" && nd.pdb.trim()) {
          const parsed = parseAtomsFromPdb(nd.pdb);
          // A PDB found upstream of Replicate/Scale describes one (pre-transform) cell;
          // scale its counts/mass/dims so this box reflects the whole replicated system.
          // Downstream PDBs (e.g. a post-build result) aren't in the map → factor 1.
          const [fx, fy, fz] = upstreamFactor.get(nodeId) ?? [1, 1, 1];
          const p = fx * fy * fz;
          const count = parsed.count * p;
          if (count > 0 && (!best || count > best.count)) {
            const dims = cryst1ToBoxDim(nd.pdb);
            best = {
              mass: parsed.mass * p,
              count,
              unknown: parsed.unknown,
              pdbDims: dims ? { lx: dims.lx * fx, ly: dims.ly * fy, lz: dims.lz * fz } : null,
            };
          }
        }
        if (node.type === "topology" && !topo) {
          const detected = Array.isArray(nd.detectedMolecules) ? nd.detectedMolecules as Array<{ name: string; count: number; type: string }> : [];
          const manual = Array.isArray(nd.molecules) ? nd.molecules as Array<{ name?: string; count?: string }> : [];
          const rows = detected.length
            ? detected.map((r) => ({ name: r.name, count: Number(r.count) || 0, type: r.type as string | undefined }))
            : manual.map((r) => ({ name: r.name || "", count: Number(r.count) || 0, type: undefined as string | undefined }));
          let mass = 0, atoms = 0, unresolved = 0, any = false;
          for (const r of rows) {
            if (!r.count) continue;
            any = true;
            const mm = moleculeMolarMass(r.name, r.type);
            if (!mm) unresolved++;
            else { mass += r.count * mm.mass; atoms += r.count * mm.atoms; }
          }
          if (any && mass > 0) topo = { mass, atoms, unresolved };
        }
        if (node.type === "solvent" && !solvent) {
          const mode = (nd.maxSolventMode as string) ?? "max";
          const n = mode === "count" ? Number(nd.maxSolventCount) || 0 : 0;   // fixed-count is known pre-run
          if (n > 0) solvent = { mass: n * WATER_MOLAR_MASS, atoms: n * 3 };
        }
      }
      for (const e of edges) {
        const next = e.source === nodeId ? e.target : e.target === nodeId ? e.source : null;
        if (next && !visited.has(next)) { visited.add(next); stack.push(next); }
      }
    }
    if (best) return { mass: best.mass, count: best.count, unknown: best.unknown, estimated: false, pdbDims: best.pdbDims };
    // Topology composition is complete only if every molecule resolved (else it undercounts).
    if (topo && topo.unresolved === 0) return { mass: topo.mass, count: topo.atoms, unknown: 0, estimated: true, pdbDims: null };
    if (solvent) return { mass: solvent.mass, count: solvent.atoms, unknown: 0, estimated: true, pdbDims: null };
    return empty;
  }, [edges, nodes, id, getNode]);

  const volumeDims = (() => {
    const finite = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);
    if (mode === "fit") return systemMass.pdbDims; // fit box only known at run time (via the PDB)
    if (mode === "cell") {
      if (!finite(data.a) || !finite(data.b) || !finite(data.c)) return null;
      return cellToBoxDim(data.a, data.b, data.c, data.alpha ?? 90, data.beta ?? 90, data.gamma ?? 90);
    }
    if (!finite(data.lx) || !finite(data.ly) || !finite(data.lz)) return null;
    return { lx: data.lx, ly: data.ly, lz: data.lz };
  })();
  const volumeA3 = volumeDims ? Math.abs(volumeDims.lx * volumeDims.ly * volumeDims.lz) : null;
  const density =
    volumeA3 && systemMass.count > 0 && systemMass.mass > 0
      ? systemMass.mass / (DENSITY_FACTOR * volumeA3)
      : null;
  const volumeStr = volumeA3 != null
    ? `${volumeA3 >= 1e6 ? volumeA3.toExponential(3) : volumeA3.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
    : null;

  // ------- Auto-seed from upstream structure/replicate/scale --------
  useEffect(() => {
    const missing = (v: number | undefined) => !(typeof v === "number" && Number.isFinite(v));
    const hasValue = (v: number | undefined) => typeof v === "number" && Number.isFinite(v);
    
    type BoxSeed = BoxNodeData;

    const findSeedFromPresetData = (sourceData: {
      source?: string; value?: string; presets?: PresetOption[];
    }): BoxSeed | null => {
      const { source: sourceKind, value, presets } = sourceData;
      // Curated presets now live under the unified "library" source (librarySource
      // 'preset'), so accept "library" too — the value still matches a preset's
      // fileName, which carries the cell metrics. (Crystals use a "category/file"
      // value that won't match, so they fall through — no static cell available.)
      const canUsePreset = sourceKind === "preset" || sourceKind === "library" || sourceKind === undefined;
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

    // Scale a seed's lengths by per-axis factors (same rule inferSeed uses for a
    // replicate/scale node): a,lx by X; b,ly,xy by Y; c,lz,xz,yz by Z; angles fixed.
    const scaleSeed = (s: BoxSeed, fx: number, fy: number, fz: number): BoxSeed => ({
      a: hasValue(s.a) ? s.a! * fx : undefined,
      b: hasValue(s.b) ? s.b! * fy : undefined,
      c: hasValue(s.c) ? s.c! * fz : undefined,
      alpha: s.alpha, beta: s.beta, gamma: s.gamma,
      lx: hasValue(s.lx) ? s.lx! * fx : undefined,
      ly: hasValue(s.ly) ? s.ly! * fy : undefined,
      lz: hasValue(s.lz) ? s.lz! * fz : undefined,
      xy: hasValue(s.xy) ? s.xy! * fy : undefined,
      xz: hasValue(s.xz) ? s.xz! * fz : undefined,
      yz: hasValue(s.yz) ? s.yz! * fz : undefined,
    });

    // Replicate/scale factors of a node (1s for anything else).
    const nodeBoxFactors = (node: { type?: string; data?: unknown } | null): [number, number, number] => {
      const nd = (node?.data ?? {}) as Record<string, unknown>;
      const num = (v: unknown, d: number) =>
        typeof v === "number" && Number.isFinite(v) ? Number(v) : (Number.isFinite(parseFloat(String(v))) ? parseFloat(String(v)) : d);
      if (node?.type === "replicate")
        return [Math.max(1, num(nd.x, 1)), Math.max(1, num(nd.y, 1)), Math.max(1, num(nd.z, 1))];
      if (node?.type === "scale")
        return [num(nd.sx, 1), num(nd.sy, 1), num(nd.sz, 1)];
      return [1, 1, 1];
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
        "xrd", "viewer", "trajectory", "export", "simulate", "topology", "stats"
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
      
      // Keep traversing backwards. A cached CRYST1 found upstream reflects the cell
      // BEFORE this node's transform, so apply this node's replicate/scale factor on
      // the way back — otherwise a Box node placed directly after Replicate reads the
      // un-replicated box (this path short-circuits the inferSeed path that does scale).
      const incoming = edges.filter((e) => e.target === nodeId);
      if (incoming.length > 0) {
        const inA = incoming.find((e) => e.targetHandle === "inA") || incoming[0];
        const upstream = findDynamicBoxFromPdb(inA.source, visited);
        if (!upstream) return null;
        const [fx, fy, fz] = nodeBoxFactors(node);
        return (fx === 1 && fy === 1 && fz === 1) ? upstream : scaleSeed(upstream, fx, fy, fz);
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

  // ------- Reset: clear manual values so the box re-inherits from upstream ----
  const resetBoxToUpstream = () => {
    updateNodeData(id, {
      ...data,
      a: undefined, b: undefined, c: undefined,
      alpha: undefined, beta: undefined, gamma: undefined,
      lx: undefined, ly: undefined, lz: undefined,
      xy: undefined, xz: undefined, yz: undefined,
      lastInferredFrom: undefined,
    });
  };

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

      <NodeHeader id={id} title="System Box size" Icon={Box} colorClass="text-indigo-500" className="bg-indigo-500/10" helpKey="box"
        extraActions={
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); resetBoxToUpstream(); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="nodrag p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors text-muted-foreground hover:text-indigo-500"
            title="Reset box to the upstream structure's box"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        }
      />

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
              {numInput("a", "a (Å)", "auto")}
              {numInput("b", "b (Å)", "auto")}
              {numInput("c", "c (Å)", "auto")}
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
              {numInput("lx", "lx (Å)", "auto")}
              {numInput("ly", "ly (Å)", "auto")}
              {numInput("lz", "lz (Å)", "auto")}
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

        {/* Volume (always, when box dims are known) + density (when upstream atoms exist) */}
        {(volumeStr != null || density != null) && (
          <div className="rounded-lg p-2 border border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/20 text-center">
            {volumeStr != null && (
              <div className="text-[11px] font-mono text-foreground/80">
                <span className="text-indigo-500/70 font-bold">Volume</span>{" "}
                {volumeStr} Å³
                <span className="text-foreground/50"> ({fmt((volumeA3 as number) / 1000)} nm³)</span>
              </div>
            )}
            {density != null ? (
              <div className="text-[11px] font-mono text-foreground/80">
                <span className="text-indigo-500/70 font-bold">Density</span>{" "}
                {systemMass.estimated ? "≈ " : ""}{density.toFixed(3)} g/cm³
                <span className="text-foreground/50">
                  {" "}({systemMass.count} atoms{systemMass.unknown ? ", approx" : ""}{systemMass.estimated ? ", est. from composition" : ""})
                </span>
              </div>
            ) : volumeStr != null ? (
              <div className="text-[9px] text-muted-foreground/60 leading-snug mt-0.5">
                Density shows once the system has atoms (add a Solvent/Topology node or run the build).
              </div>
            ) : null}
          </div>
        )}

      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
