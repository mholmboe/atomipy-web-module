import type { Node, Edge } from "@xyflow/react";

export type PythonScriptMode = "full" | "minimal" | "strict";
export type RunNodeStatus = "queued" | "running" | "done" | "error" | "skipped" | "success" | "failure";

export type NodeDataMap = Record<string, any>;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const deepClone = <T,>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export const makeTimestampSuffix = () => new Date().toISOString().replace(/[:.]/g, "-");

export const sanitizeFileName = (name: string) =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "workflow";

export const pyEscape = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export const getString = (data: NodeDataMap, key: string, fallback = ""): string => {
  const v = data[key];
  return typeof v === "string" ? v : fallback;
};

export const getNumber = (data: NodeDataMap, key: string, fallback = 0): number => {
  const v = data[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const p = parseFloat(v);
    return isNaN(p) ? fallback : p;
  }
  return fallback;
};

export const getOptionalNumber = (data: NodeDataMap, key: string): number | null => {
  const v = data[key];
  if (v === null || v === undefined || v === "") return null;
  const p = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(p) ? null : p;
};

export const getBoolean = (data: NodeDataMap, key: string, fallback = false): boolean => {
  const v = data[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    return v.toLowerCase() === "true" || v === "1";
  }
  if (typeof v === "number") return v !== 0;
  return fallback;
};

export function checkWorkflowPrerequisites(nodes: Node[], edges: Edge[]): string[] {
  const warnings: string[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Topological sorting to verify upstream dependencies
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  
  nodes.forEach((n) => {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  edges.forEach((e) => {
    if (adj.has(e.source)) {
      adj.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
  });

  // Collect all nodes upstream of a specific node
  const getUpstreamNodeTypes = (targetId: string): Set<string> => {
    const upstreamTypes = new Set<string>();
    const visited = new Set<string>();
    const queue = [targetId];
    
    // Reverse edges map to traverse backwards
    const revAdj = new Map<string, string[]>();
    nodes.forEach((n) => revAdj.set(n.id, []));
    edges.forEach((e) => {
      if (revAdj.has(e.target)) {
        revAdj.get(e.target)!.push(e.source);
      }
    });

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);
      
      const node = nodeMap.get(curr);
      if (node && curr !== targetId) {
        upstreamTypes.add(node.type || "");
      }
      
      const parents = revAdj.get(curr) || [];
      queue.push(...parents);
    }
    return upstreamTypes;
  };

  // Undirected adjacency: find the Solvent (water-model) node in the same system
  // as an Ions node regardless of their relative order in the pipeline.
  const undirected = new Map<string, string[]>();
  nodes.forEach((n) => undirected.set(n.id, []));
  edges.forEach((e) => {
    undirected.get(e.source)?.push(e.target);
    undirected.get(e.target)?.push(e.source);
  });
  const findConnectedNodeOfType = (startId: string, type: string): Node | null => {
    const visited = new Set<string>();
    const queue = [startId];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);
      const n = nodeMap.get(curr);
      if (n && curr !== startId && n.type === type) return n;
      for (const nb of undirected.get(curr) || []) queue.push(nb);
    }
    return null;
  };

  // Water model -> ion parameter sets that exist natively in the FF library.
  // Keep in sync with min.ff/ions.itp (#ifdef {WATER}_{SET} blocks). Anything
  // not listed is auto-substituted at run time by write_merged_top (and logged).
  const ION_COMPAT: Record<string, string[]> = {
    spce: ["JC", "HFE_LM", "IOD_LM"],
    spc: ["JC"],
    tip3p: ["JC", "HFE_LM", "IOD_LM"],
    opc3: ["HFE_LM", "IOD_LM", "CM_LM"],
    opc: ["HFE_LM", "IOD_LM", "CM_LM"],
    tip4pew: ["HFE_LM", "IOD_LM"],
  };

  // Collect all nodes upstream of a target (for inspecting their data).
  const getUpstreamNodes = (targetId: string): Node[] => {
    const revAdj = new Map<string, string[]>();
    nodes.forEach((n) => revAdj.set(n.id, []));
    edges.forEach((e) => { if (revAdj.has(e.target)) revAdj.get(e.target)!.push(e.source); });
    const out: Node[] = [];
    const visited = new Set<string>();
    const queue = [targetId];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);
      const n = nodeMap.get(curr);
      if (n && curr !== targetId) out.push(n);
      queue.push(...(revAdj.get(curr) || []));
    }
    return out;
  };
  const isOrganicNode = (n: Node): boolean =>
    (n.type === "forcefield" && ["gaff", "openff_sage", "openff_parsley"].includes(getString(n.data, "forcefield", ""))) ||
    (n.type === "structure" && getString(n.data, "source", "") === "organic");

  nodes.forEach((node) => {
    if (node.type === "simulate") {
      const upstreams = getUpstreamNodeTypes(node.id);
      const hasSolventOrIons = upstreams.has("solvent") || upstreams.has("ions");
      if (!upstreams.has("forcefield") && !hasSolventOrIons) {
        warnings.push(`Warning (Simulation Node ${node.id}): connect a Forcefield node (mineral/organic) — or a Solvate/Ions node for a pure solvent/ion system — upstream so simulation parameters are defined.`);
      }
    }
    if (node.type === "solvent") {
      const upstreams = getUpstreamNodeTypes(node.id);
      if (!upstreams.has("box")) {
        warnings.push(`Warning (Solvate Node ${node.id}): A Box node is recommended upstream to set boundaries before solvent placement.`);
      }
    }
    if (node.type === "ions") {
      const upstreams = getUpstreamNodeTypes(node.id);
      if (!upstreams.has("box") && !upstreams.has("forcefield")) {
        warnings.push(`Warning (Ions Node ${node.id}): Upstream box dimensions or forcefield charges are recommended to define limits for ionization placement.`);
      }
      // Ion-parameter / water-model compatibility (order-independent: the Solvent
      // node may sit before or after the Ions node).
      const solvent = findConnectedNodeOfType(node.id, "solvent");
      if (solvent) {
        const water = getString(solvent.data, "waterModel", "opc3").toLowerCase();
        const ionSet = getString(node.data, "ionSet", "IOD_LM");
        const compat = ION_COMPAT[water];
        if (compat && !compat.includes(ionSet)) {
          warnings.push(
            `Warning (Ions Node ${node.id} + Solvent Node ${solvent.id}): ion parameters '${ionSet}' are not defined for the '${water.toUpperCase()}' water model and will be substituted at run time. Compatible ion sets for ${water.toUpperCase()}: ${compat.join(", ")} — or switch the water model.`
          );
        }
      }
    }
    if (node.type === "export") {
      // LAMMPS .data and NAMD .psf are inorganic-only — warn if the system has
      // organic molecules (which will be excluded). Use GROMACS for organics.
      const topFmt = getString(node.data, "topologyFormat", "none");
      if (topFmt === "lmp" || topFmt === "psf") {
        const hasOrganic = getUpstreamNodes(node.id).some(isOrganicNode);
        if (hasOrganic) {
          const fmtLabel = topFmt === "lmp" ? "LAMMPS .data" : "NAMD .psf";
          warnings.push(
            `Warning (Export Node ${node.id}): ${fmtLabel} export is inorganic-only — organic molecule(s) in this system will be excluded. Use the GROMACS topology (.top) to include organics.`,
          );
        }
      }
    }
  });

  return warnings;
}

export function validateWorkflow(nodes: Node[], edges: Edge[]): string[] {
  const errors: string[] = [];
  if (nodes.length === 0) {
    errors.push("No nodes in canvas.");
    return errors;
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const incomingByTarget = new Map<string, Edge[]>();
  nodes.forEach((n) => incomingByTarget.set(n.id, []));
  edges.forEach((e) => {
    if (incomingByTarget.has(e.target)) {
      incomingByTarget.get(e.target)!.push(e);
    } else {
      errors.push(`Edge targets unknown node: ${e.target}`);
    }
    if (!nodeById.has(e.source)) {
      errors.push(`Edge source missing node: ${e.source}`);
    }
  });

  // Cycle check (Kahn)
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  nodes.forEach((n) => {
    indegree.set(n.id, 0);
    adjacency.set(n.id, []);
  });

  edges.forEach((e) => {
    if (adjacency.has(e.source)) {
      adjacency.get(e.source)!.push(e.target);
      indegree.set(e.target, (indegree.get(e.target) || 0) + 1);
    }
  });

  const q: string[] = [];
  indegree.forEach((val, key) => {
    if (val === 0) q.push(key);
  });

  let count = 0;
  while (q.length > 0) {
    const cur = q.shift()!;
    count++;
    adjacency.get(cur)?.forEach((neighbor) => {
      indegree.set(neighbor, indegree.get(neighbor)! - 1);
      if (indegree.get(neighbor) === 0) {
        q.push(neighbor);
      }
    });
  }

  if (count < nodes.length) {
    errors.push("Graph contains closed cyclic dependencies! Cyclic flows are unsupported.");
  }

  return errors;
}

export function generatePythonCode(nodes: Node[], edges: Edge[], mode: PythonScriptMode = "full") {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const activeEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  nodes.forEach((n) => {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  activeEdges.forEach((e) => {
    adj.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  });

  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });

  const sorted: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    sorted.push(cur);
    adj.get(cur)?.forEach((neighbor) => {
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    });
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const isMinimal = mode !== "full";
  const isStrictMinimal = mode === "strict";

  let pythonCode = `import atomipy as ap\n`;
  if (nodes.some((n) => n.type === "xrd")) {
    pythonCode += `import matplotlib\nmatplotlib.use('Agg')\n`;
  }
  
  if (mode === "full") {
    pythonCode += `import json\nimport os\nimport traceback\n`;
  } else if (mode === "minimal") {
    pythonCode += `import json\n`;
  }
  pythonCode += `\n`;

  if (mode === "full") {
    pythonCode += `"""\natomipy Workflow Script\nGenerated by atomipy web module\n\nTo run this script locally:\n1. Install atomipy: pip install git+https://github.com/mholmboe/atomipy.git\n2. Note: Built-in structures ('UC_conf/') are accessible when running in the web bundle.\n   For local use, you may need to provide absolute paths to your PDB/CIF files.\n"""\n\n`;

    pythonCode += `def __report_error__(node_type, node_id, exc):\n`;
    pythonCode += `    """Helper to log errors for the web interface while remaining readable."""\n`;
    pythonCode += `    with open('build_errors.log', 'a', encoding='utf-8') as _err:\n`;
    pythonCode += `        _err.write(f'Node {node_type} ({node_id}) failed: {exc}\\n')\n`;
    pythonCode += `        _err.write(traceback.format_exc() + '\\n')\n`;
    pythonCode += `    raise\n\n`;
  } else if (mode === "minimal") {
    pythonCode += `"""\natomipy Minimalist Script\nGenerated by atomipy web module\n"""\n\n`;
  } else {
    pythonCode += `"""\natomipy Strict Minimal Script\nGenerated by atomipy web module\n"""\n\n`;
  }

  if (mode === "full") {
    pythonCode += `open('build_errors.log', 'w', encoding='utf-8').close()\n`;
  }

  const stateVars = new Map<string, { atoms: string; box: string; traj?: string }>();

  // Unique GROMACS moleculetype/residue name per organic MOLECULE so distinct
  // organics never collide. A molecule may span a structure(SMILES/file) node AND
  // a downstream organic forcefield node — both anchor to the same upstream
  // structure node so they share one name. Single molecule keeps 'organic'
  // (back-compat); multiple become organic_1, organic_2, …; "moleculeName" overrides.
  const sanitizeMolName = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  const _isStructOrganic = (nn: Node): boolean => nn.type === "structure" && getString(nn.data, "source", "") === "organic";
  const _isFFOrganic = (nn: Node): boolean => nn.type === "forcefield" && ["gaff", "openff_sage", "openff_parsley"].includes(getString(nn.data, "forcefield", ""));
  const _upstreamStructOrganic = (startId: string): string | null => {
    const seen = new Set<string>([startId]);
    let frontier = [startId];
    while (frontier.length) {
      const next: string[] = [];
      for (const cur of frontier) for (const e of edges) if (e.target === cur && !seen.has(e.source)) {
        seen.add(e.source);
        const sn = nodeMap.get(e.source);
        if (sn && _isStructOrganic(sn)) return e.source;
        next.push(e.source);
      }
      frontier = next;
    }
    return null;
  };
  // Each organic node's molecule "anchor": its upstream structure node, else itself.
  const _anchorOf = (nn: Node): string => (_isFFOrganic(nn) ? (_upstreamStructOrganic(nn.id) ?? nn.id) : nn.id);
  const molIndex = new Map<string, number>();
  nodes.forEach((nn) => {
    if (_isStructOrganic(nn) || _isFFOrganic(nn)) {
      const a = _anchorOf(nn);
      if (!molIndex.has(a)) molIndex.set(a, molIndex.size + 1);
    }
  });
  // The user-set molecule name belongs to the whole organic chain, not a single
  // node. It may be set on the structure node OR on a downstream forcefield
  // node — and when an intermediate node (transform, box, …) forces the
  // structure node to parametrize early, that early call must use the same name.
  // Resolve one name per anchor: a forcefield-organic name is inherited, but the
  // structure node's own name (if any) takes precedence.
  const _anchorUserName = new Map<string, string>();
  nodes.forEach((nn) => {
    if (_isFFOrganic(nn)) {
      const name = sanitizeMolName(getString(nn.data, "moleculeName", "").trim());
      if (name) { const a = _anchorOf(nn); if (!_anchorUserName.has(a)) _anchorUserName.set(a, name); }
    }
  });
  nodes.forEach((nn) => {
    if (_isStructOrganic(nn)) {
      const name = sanitizeMolName(getString(nn.data, "moleculeName", "").trim());
      if (name) _anchorUserName.set(nn.id, name);  // structure node wins
    }
  });
  const organicBasename = (nn: Node): string => {
    // 1. This node's own name wins (e.g. a standalone organic node).
    const own = sanitizeMolName(getString(nn.data, "moleculeName", "").trim());
    if (own) return own;
    // 2. Otherwise inherit the name resolved for this molecule's chain (covers a
    //    structure node parametrizing early while the name is on the forcefield node).
    const a = _anchorOf(nn);
    const inherited = _anchorUserName.get(a);
    if (inherited) return inherited;
    // 3. Auto.
    const idx = molIndex.get(a) ?? 1;
    return molIndex.size <= 1 ? "organic" : `organic_${idx}`;
  };

  // Per-type counter for simulation output basenames: consecutive runs of each
  // type are numbered EM_1/EM_2, NVT_1/NVT_2, NPT_1/NPT_2 (in execution order).
  const _simTypeCount: Record<string, number> = {};

  // Re-attach the topology carriers (.itp/_defines/_top_path/_mol_counts_override)
  // from `inVar` onto a freshly-returned plain list `outVar`, so an organic
  // (GAFF/Sage) topology survives a coordinate-only transform. ONLY use this on
  // nodes that preserve the atom set AND order (wrap/pbc, translate, rotate,
  // scale, bend, coordinate-frame) — never on slice/remove/insert/reorder, where
  // the carried itp would be stale. (Dummy per-atom markers ride the dicts and
  // need no re-attach.) Emits module-level Python.
  const carryTopo = (outVar: string, inVar: string): string =>
    `_carry = [a for a in ('itp', '_defines', '_top_path', '_mol_counts_override') if hasattr(${inVar}, a)]\n` +
    `if _carry:\n` +
    `    class _SL_carry(list): pass\n` +
    `    ${outVar} = _SL_carry(${outVar})\n` +
    `    for _a in _carry: setattr(${outVar}, _a, getattr(${inVar}, _a))\n`;

  sorted.forEach((id, index) => {
    const n = nodeMap.get(id);
    if (!n) return;
    const data = (n.data ?? {}) as NodeDataMap;
    const blockOutAtoms = `${n.type}_atoms_${index}`;
    const blockOutBox = `${n.type}_box_${index}`;

    const incomingEdges = edges.filter((e) => e.target === id);
    let inAtoms = "None";
    let inBox = "None";
    let inTraj: string | undefined = undefined;

    const isMultiInputNode = n.type === "merge" || n.type === "add";

    if (!isMultiInputNode && incomingEdges.length > 0) {
      const validParents = incomingEdges
        .filter((e) => stateVars.has(e.source))
        .map((e) => stateVars.get(e.source)!);

      if (validParents.length === 1) {
        inAtoms = validParents[0].atoms;
        inBox = validParents[0].box;
        inTraj = validParents[0].traj;
      } else if (validParents.length > 1) {
        const atomVars = validParents.map((p) => p.atoms).join(", ");
        pythonCode += `\n# Auto-joining multiple standard inputs\n`;
        const joinedVar = `auto_join_${index}`;
        pythonCode += `${joinedVar} = ap.update(${atomVars})\n`;
        inAtoms = joinedVar;
        inBox = validParents.map(p => p.box).find(b => b !== "None") || "None";
      }
    }

    const opType = n.type || "unknown";
    const opTypeEscaped = pyEscape(opType);
    const opIdEscaped = pyEscape(id);

    if (data.disabled === true) {
      pythonCode += `\n# --- Operation: ${opType} (${id}) [BYPASSED] ---\n`;
      if (mode === "full" || mode === "minimal") {
        pythonCode += `print("__NODE_START__:${opIdEscaped}:${index}")\n`;
        pythonCode += `print("__NODE_STATUS__:${opIdEscaped}:success")\n`;
      }
      stateVars.set(id, { atoms: inAtoms, box: inBox, traj: inTraj });
      return;
    }

    pythonCode += `\n# --- Operation: ${opType} (${id}) ---\n`;
    if (mode === "full" || mode === "minimal") {
      pythonCode += `print("__NODE_START__:${opIdEscaped}:${index}")\n`;
    }

    switch (n.type) {
      case "structure": {
        const source = getString(data, "source", "preset");
        if (source === "upload") {
          // Use the stored relative path (uploads/<session>/<file>) — the upload
          // endpoint nests files under a session dir, so the bare filename alone
          // doesn't resolve in the build work dir.
          const upPath = pyEscape(getString(data, "path", "")) || `uploads/${pyEscape(getString(data, "filename", "uploaded.pdb"))}`;
          pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'${upPath}')\n`;
        } else if (source === "preset") {
          const file = pyEscape(getString(data, "value", "unknown.pdb"));
          pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'UC_conf/${file}')\n`;
        } else if (source === "library") {
          // Inorganic library: a curated MINFF preset (UC_conf) or a bundled
          // crystal (loaded from the package by ap.load_crystal, cwd-independent).
          const file = pyEscape(getString(data, "value", "unknown.cif"));
          const librarySource = getString(data, "librarySource", "crystal");
          if (librarySource === "preset") {
            pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'UC_conf/${file}')\n`;
          } else if (librarySource === "water") {
            // Bundled water boxes (structures/water), loaded by package path (cwd-independent).
            pythonCode += `import os as _wos\n`;
            pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(_wos.path.join(_wos.path.dirname(ap.__file__), 'structures', 'water', '${file}'))\n`;
          } else {
            pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.load_crystal('${file}')\n`;
          }
        } else if (source === "lattice") {
          // Parametric lattice builder (atomipy.make_lattice / build_cell).
          const A_DEFAULTS: Record<string, number> = { sc: 3.0, bcc: 2.87, fcc: 3.615, hcp: 3.21, diamond: 5.43, rocksalt: 5.64, fluorite: 5.46, perovskite: 3.905 };
          const num = (v: unknown, d = 0): number => {
            const x = parseFloat(String(v ?? "").trim());
            return Number.isFinite(x) ? x : d;
          };
          const rx = Math.max(1, Math.round(getNumber(data, "latticeRepX", 1)));
          const ry = Math.max(1, Math.round(getNumber(data, "latticeRepY", 1)));
          const rz = Math.max(1, Math.round(getNumber(data, "latticeRepZ", 1)));
          const rep = `replicate=(${rx}, ${ry}, ${rz})`;
          const latticeMode = getString(data, "latticeMode", "preset");
          if (latticeMode === "custom") {
            const cellRaw = (data as Record<string, unknown>).customCell as string[] | undefined ?? [];
            const cell = [0, 1, 2, 3, 4, 5].map((i) => {
              const v = String(cellRaw[i] ?? "").trim();
              return v !== "" ? num(v, i < 3 ? 1.0 : 90.0) : (i < 3 ? 1.0 : 90.0);
            });
            const basisRaw = (data as Record<string, unknown>).customBasis as { element: string; x: string; y: string; z: string }[] | undefined ?? [];
            const basisPy = basisRaw.length
              ? basisRaw.map((r) => `{'element': '${pyEscape((r.element || "X").trim())}', 'x': ${num(r.x)}, 'y': ${num(r.y)}, 'z': ${num(r.z)}}`).join(", ")
              : `{'element': 'X', 'x': 0.0, 'y': 0.0, 'z': 0.0}`;
            pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.build_cell([${cell.join(", ")}], [${basisPy}], ${rep})\n`;
          } else {
            const lt = getString(data, "latticeType", "fcc");
            const a = num(getString(data, "latticeA", ""), A_DEFAULTS[lt] ?? 3.5);
            const speciesRaw = (data as Record<string, unknown>).latticeSpecies as string[] | undefined ?? [];
            const speciesPy = (speciesRaw.length ? speciesRaw : ["X"]).map((s) => `'${pyEscape((s || "X").trim())}'`).join(", ");
            const cStr = getString(data, "latticeC", "").trim();
            const cArg = lt === "hcp" && cStr !== "" ? `, c=${num(cStr)}` : "";
            pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.make_lattice('${pyEscape(lt)}', ${a}, [${speciesPy}]${cArg}, ${rep})\n`;
          }
        } else {
          // source === "organic" (SMILES, uploaded file, or bundled library molecule)
          const smiles = pyEscape(getString(data, "smiles", ""));
          const inputMode = getString(data, "inputMode", "smiles");
          const uploadPath = pyEscape(getString(data, "uploadedFilePath", ""));
          const libraryMol = pyEscape(getString(data, "libraryMolecule", ""));
          const isLibrary = (inputMode === "library" || !!libraryMol) && !!libraryMol;

          // Bundled-library molecules carry curated 3D geometry + bond orders;
          // load and write an SDF up front so downstream GAFF/Sage parametrizes
          // from the real structure (the .sdf path then flows like an upload).
          const libSdf = `${organicBasename(n)}.sdf`;
          if (isLibrary) {
            pythonCode += `# Organic molecule from bundled library: ${libraryMol}\n`;
            pythonCode += `_lib_${blockOutAtoms}, _ = ap.load_molecule('${libraryMol}')\n`;
            pythonCode += `ap.write_sdf(_lib_${blockOutAtoms}, '${libSdf}')\n`;
          }

          // Defer parametrization only if the organic node is directly connected to a forcefield node.
          // If there are intermediate nodes (like System Box, Spatial Ops, etc.), we must parameterize immediately
          // so those nodes receive valid coordinates instead of raw SMILES strings.
          const hasDirectForcefield = edges.some(
            (e) => e.source === id && nodeMap.get(e.target)?.type === "forcefield"
          );
          const hasDownstreamFF = hasDirectForcefield;

          if (hasDownstreamFF) {
            pythonCode += `# Organic structure definition (parameterized downstream in Forcefield node)\n`;
            if (isLibrary) {
              pythonCode += `${blockOutAtoms} = "${libSdf}"\n`;
            } else if (inputMode === "file" && uploadPath) {
              pythonCode += `${blockOutAtoms} = "${uploadPath}"\n`;
            } else {
              pythonCode += `${blockOutAtoms} = "${smiles}"\n`;
            }
            pythonCode += `${blockOutBox} = None\n`;
          } else {
            pythonCode += `\n# Parametrize Organic Molecule (Fallback / Standalone)\n`;
            pythonCode += `try:\n`;
            if (isLibrary) {
              pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_file('${libSdf}', version='gaff-2.11', basename='${organicBasename(n)}')\n`;
            } else if (inputMode === "file" && uploadPath) {
              pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_file('${uploadPath}', version='gaff-2.11', basename='${organicBasename(n)}')\n`;
            } else {
              pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_gaff('${smiles}', version='gaff-2.11', basename='${organicBasename(n)}')\n`;
            }
            pythonCode += `except Exception as e:\n`;
            pythonCode += `    print(f"Failed to parametrize organic molecule: {e}")\n`;
            pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = [], None\n`;
          }
        }
        
        if (source !== "organic") {
          pythonCode += `if ${blockOutBox} is None or (not isinstance(${blockOutBox}, str) and hasattr(${blockOutBox}, '__len__') and len(${blockOutBox}) == 0):\n`;
          pythonCode += `    ${blockOutBox} = [50.0, 50.0, 50.0, 90.0, 90.0, 90.0]\n`;
          pythonCode += `if hasattr(${blockOutBox}, '__len__') and len(${blockOutBox}) in [3, 6]:\n`;
          pythonCode += `    ${blockOutBox} = ap.Cell2Box_dim(${blockOutBox})\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "preset": {
        const file = pyEscape(getString(data, "value", "unknown.pdb"));
        pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'UC_conf/${file}')\n`;
        pythonCode += `if ${blockOutBox} is None or (not isinstance(${blockOutBox}, str) and hasattr(${blockOutBox}, '__len__') and len(${blockOutBox}) == 0):\n`;
        pythonCode += `    ${blockOutBox} = [50.0, 50.0, 50.0, 90.0, 90.0, 90.0]\n`;
        pythonCode += `if hasattr(${blockOutBox}, '__len__') and len(${blockOutBox}) in [3, 6]:\n`;
        pythonCode += `    ${blockOutBox} = ap.Cell2Box_dim(${blockOutBox})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "upload": {
        const upPath = pyEscape(getString(data, "path", "")) || `uploads/${pyEscape(getString(data, "filename", "uploaded.pdb"))}`;
        pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'${upPath}')\n`;
        pythonCode += `if ${blockOutBox} is None or (not isinstance(${blockOutBox}, str) and hasattr(${blockOutBox}, '__len__') and len(${blockOutBox}) == 0):\n`;
        pythonCode += `    ${blockOutBox} = [50.0, 50.0, 50.0, 90.0, 90.0, 90.0]\n`;
        pythonCode += `if hasattr(${blockOutBox}, '__len__') and len(${blockOutBox}) in [3, 6]:\n`;
        pythonCode += `    ${blockOutBox} = ap.Cell2Box_dim(${blockOutBox})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "merge": {
        const edgeA = incomingEdges.find((e) => e.targetHandle === "inA");
        const edgeB = incomingEdges.find((e) => e.targetHandle === "inB");
        const stateA = edgeA ? stateVars.get(edgeA.source) : null;
        const stateB = edgeB ? stateVars.get(edgeB.source) : null;

        if (stateA && stateB) {
          const typeMode = pyEscape(getString(data, "typeMode", "molid"));
          const minDistance = getNumber(data, "minDistance", 2.0);
          const minDistanceSmall = getOptionalNumber(data, "minDistanceSmall");
          const atomLabelsRaw = getString(data, "atomLabels", "").trim() || getString(data, "atomLabel", "").trim();
          const atomLabels = atomLabelsRaw
            ? atomLabelsRaw
              .split(/[;,]+/)
              .map((token) => token.trim())
              .filter((token) => token.length > 0)
            : [];
          const filteredVar = `merged_${index}`;
          const minDistanceExpr =
            minDistanceSmall !== null && atomLabels.length > 0
              ? `[${minDistance}, ${minDistanceSmall}]`
              : `${minDistance}`;
          const atomLabelExpr =
            atomLabels.length > 1
              ? `[${atomLabels.map((label) => `'${pyEscape(label)}'`).join(", ")}]`
              : atomLabels.length === 1
                ? `'${pyEscape(atomLabels[0])}'`
                : "";

          pythonCode += `if hasattr(${stateA.atoms}, 'itp') or hasattr(${stateB.atoms}, 'itp'):\n`;
          pythonCode += `    raise ValueError("The 'Merge (Spatial)' node is for geometric overlap filtering of minerals. To merge topologies (organics or organics+minerals), please use the 'Add' node instead.")\n`;
          pythonCode += `else:\n`;
          if (atomLabelExpr) {
            pythonCode += `    ${filteredVar} = ap.merge(${stateA.atoms}, ${stateB.atoms}, ${stateA.box}, type_mode='${typeMode}', atom_label=${atomLabelExpr}, min_distance=${minDistanceExpr})\n`;
          } else {
            pythonCode += `    ${filteredVar} = ap.merge(${stateA.atoms}, ${stateB.atoms}, ${stateA.box}, type_mode='${typeMode}', min_distance=${minDistanceExpr})\n`;
          }
          pythonCode += `    ${blockOutAtoms} = ap.update(${stateA.atoms}, ${filteredVar})\n`;
          pythonCode += `    ${blockOutBox} = ${stateA.box}\n`;
          stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        } else {
          pythonCode += `# Error: Merge node missing input A or B\n`;
        }
        break;
      }
      case "add": {
        const orderedHandles = ["inA", "inB", "in1", "in2", "in3", "in4", "in5", "in6"];
        const gatheredStates: { atoms: string; box: string }[] = [];

        orderedHandles.forEach((h) => {
          incomingEdges
            .filter((e) => e.targetHandle === h)
            .forEach((e) => {
              const s = stateVars.get(e.source);
              if (s) gatheredStates.push(s);
            });
        });

        incomingEdges.forEach((e) => {
          if (!e.targetHandle || !orderedHandles.includes(e.targetHandle)) {
            const s = stateVars.get(e.source);
            if (s && !gatheredStates.includes(s)) gatheredStates.push(s);
          }
        });

        if (gatheredStates.length > 0) {
          const atomArgs = gatheredStates.map((s) => s.atoms).join(", ");
          const reorder = getBoolean(data, "reorderMolids", true);
          const customMolid = getNumber(data, "molid", undefined);
          const customResname = getString(data, "resname", "");

          pythonCode += `\n# Smart Branch Joining (Organic/Mixed SystemList vs Mineral/Solvent/Ions)\n`;
          pythonCode += `_organic_branches = []\n`;
          pythonCode += `_list_branches = []\n`;
          pythonCode += `for _b in [${atomArgs}]:\n`;
          pythonCode += `    if _b is None: continue\n`;
          pythonCode += `    if hasattr(_b, 'itp') and _b.itp is not None:\n`;
          pythonCode += `        _organic_branches.append(_b)\n`;
          pythonCode += `    else:\n`;
          pythonCode += `        _list_branches.append(_b)\n`;
          pythonCode += `\n`;
          pythonCode += `if len(_organic_branches) > 0:\n`;
          pythonCode += `    if len(_list_branches) > 0:\n`;
          if (reorder) {
            pythonCode += `        # Reorder molids sequentially across list branches using join_and_reorder\n`;
            pythonCode += `        _inorganic_combined = ap.join_and_reorder(*_list_branches)\n`;
          } else {
            pythonCode += `        _inorganic_combined = ap.update(*_list_branches, force=True)\n`;
          }
          if (customMolid !== undefined || customResname) {
            const molidArg = customMolid !== undefined ? `, molid=${customMolid}` : "";
            const resArg = customResname ? `, resname='${customResname}'` : "";
            pythonCode += `        _inorganic_combined = ap.molecule(_inorganic_combined${molidArg}${resArg})\n`;
          }
          pythonCode += `    else:\n`;
          pythonCode += `        _inorganic_combined = []\n`;
          pythonCode += `    \n`;
          // Merge the inorganic (mineral/solvent/ions) with the organic component(s)
          // via the real multi-component merger. ap.mix_systems does NOT exist — the
          // old call crashed, so the organic-branch path never worked. merge_top
          // builds the mineral itp inline and KEEPS each organic's GAFF itp; we carry
          // the merged itp forward so the downstream .top #includes the organic and
          // names/counts it correctly (instead of rebuilding it as a mineral -> MIN_1).
          pythonCode += `    _mix_components = []\n`;
          pythonCode += `    if _inorganic_combined:\n`;
          pythonCode += `        _mix_components.append({'atoms': list(_inorganic_combined), 'itp': None, 'box': ${gatheredStates[0].box}})\n`;
          pythonCode += `    for _ob in _organic_branches:\n`;
          pythonCode += `        _mix_components.append({'atoms': list(_ob), 'itp': getattr(_ob, 'itp', None), 'box': ${gatheredStates[0].box}})\n`;
          pythonCode += `    _mix_atoms, _mix_itp, _mix_box = ap.merge_top(*_mix_components, output_box=${gatheredStates[0].box})\n`;
          pythonCode += `    class _SL_mix(list): pass\n`;
          pythonCode += `    ${blockOutAtoms} = _SL_mix(_mix_atoms)\n`;
          pythonCode += `    ${blockOutAtoms}.itp = _mix_itp\n`;
          pythonCode += `    ${blockOutBox} = _mix_box or ${gatheredStates[0].box}\n`;
          pythonCode += `else:\n`;
          if (reorder) {
            pythonCode += `    # Join branches and sequentially reorder their molids using join_and_reorder\n`;
            pythonCode += `    ${blockOutAtoms} = ap.join_and_reorder(*_list_branches)\n`;
          } else {
            pythonCode += `    ${blockOutAtoms} = ap.update(*_list_branches, force=True)\n`;
          }
          
          if (customMolid !== undefined || customResname) {
            const molidArg = customMolid !== undefined ? `molid=${customMolid}` : "";
            const resArg = customResname ? `resname='${customResname}'` : "";
            const args = [molidArg, resArg].filter(Boolean).join(", ");
            pythonCode += `    ${blockOutAtoms} = ap.molecule(${blockOutAtoms}, ${args})\n`;
          }
          
          pythonCode += `    ${blockOutBox} = ${gatheredStates[0].box}\n`;
          pythonCode += `\n`;

          stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        } else {
          pythonCode += `# Error: Join node has no valid inputs connected\n`;
        }
        break;
      }
      case "box": {
        const inputMode = getString(data, "inputMode", "cell");

        if (inputMode === "fit") {
          // Fit the box snugly to the molecule (like `gmx editconf -d`): extent +
          // `padding` Å on every side. Centers the atoms in the new box.
          const pad = getNumber(data, "padding", 10.0);
          const cubic = getBoolean(data, "cubic", false) ? "True" : "False";
          // center=True translates the structure to the box centre; False keeps
          // the original coordinates and only sets the (same) box size.
          const centerMol = getBoolean(data, "centerMol", true) ? "True" : "False";
          pythonCode += `# Fit box to the structure (+${pad} Å margin per side)\n`;
          pythonCode += `if isinstance(${inAtoms}, list) and ${inAtoms}:\n`;
          pythonCode += `    ${blockOutBox} = ap.Cell2Box_dim(ap.fit_box(${inAtoms}, padding=${pad}, cubic=${cubic}, center=${centerMol}))\n`;
          pythonCode += `else:\n`;
          pythonCode += `    ${blockOutBox} = ap.Cell2Box_dim([${2 * pad}, ${2 * pad}, ${2 * pad}, 90.0, 90.0, 90.0])\n`;
        } else if (inputMode === "box_dim") {
          const lx = getOptionalNumber(data, "lx");
          const ly = getOptionalNumber(data, "ly");
          const lz = getOptionalNumber(data, "lz");
          const xy = getOptionalNumber(data, "xy");
          const xz = getOptionalNumber(data, "xz");
          const yz = getOptionalNumber(data, "yz");

          const lxExpr = lx !== null ? `${lx}` : (inBox !== "None" ? `(float(${inBox}[0]) if len(${inBox}) >= 1 else 50.0)` : "50.0");
          const lyExpr = ly !== null ? `${ly}` : (inBox !== "None" ? `(float(${inBox}[1]) if len(${inBox}) >= 2 else 50.0)` : "50.0");
          const lzExpr = lz !== null ? `${lz}` : (inBox !== "None" ? `(float(${inBox}[2]) if len(${inBox}) >= 3 else 50.0)` : "50.0");
          const xyExpr = xy !== null ? `${xy}` : (inBox !== "None" ? `(float(${inBox}[5]) if len(${inBox}) >= 9 else (float(${inBox}[3]) if len(${inBox}) == 6 else 0.0))` : "0.0");
          const xzExpr = xz !== null ? `${xz}` : (inBox !== "None" ? `(float(${inBox}[7]) if len(${inBox}) >= 9 else (float(${inBox}[4]) if len(${inBox}) == 6 else 0.0))` : "0.0");
          const yzExpr = yz !== null ? `${yz}` : (inBox !== "None" ? `(float(${inBox}[8]) if len(${inBox}) >= 9 else (float(${inBox}[5]) if len(${inBox}) == 6 else 0.0))` : "0.0");

          const definitelyOrtho = (xy === 0 && xz === 0 && yz === 0);
          if (definitelyOrtho) {
            pythonCode += `${blockOutBox} = [${lxExpr}, ${lyExpr}, ${lzExpr}]\n`;
          } else {
            pythonCode += `${blockOutBox} = [${lxExpr}, ${lyExpr}, ${lzExpr}, 0.0, 0.0, ${xyExpr}, 0.0, ${xzExpr}, ${yzExpr}]\n`;
          }
        } else {
          const a = getOptionalNumber(data, "a");
          const b = getOptionalNumber(data, "b");
          const c = getOptionalNumber(data, "c");
          const alpha = getOptionalNumber(data, "alpha");
          const beta = getOptionalNumber(data, "beta");
          const gamma = getOptionalNumber(data, "gamma");
          const inCell = `cell_${index}`;

          if (inBox !== "None") {
            pythonCode += `${inCell} = ap.Box_dim2Cell(${inBox})\n`;
          }

          const aExpr = a !== null ? `${a}` : (inBox !== "None" ? `${inCell}[0]` : "50.0");
          const bExpr = b !== null ? `${b}` : (inBox !== "None" ? `${inCell}[1]` : "50.0");
          const cExpr = c !== null ? `${c}` : (inBox !== "None" ? `${inCell}[2]` : "50.0");
          const alphaExpr = alpha !== null ? `${alpha}` : (inBox !== "None" ? `${inCell}[3]` : "90.0");
          const betaExpr = beta !== null ? `${beta}` : (inBox !== "None" ? `${inCell}[4]` : "90.0");
          const gammaExpr = gamma !== null ? `${gamma}` : (inBox !== "None" ? `${inCell}[5]` : "90.0");

          pythonCode += `${blockOutBox} = ap.Cell2Box_dim([${aExpr}, ${bExpr}, ${cExpr}, ${alphaExpr}, ${betaExpr}, ${gammaExpr}])\n`;
        }

        if (inAtoms !== "None") {
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        } else {
          pythonCode += `${blockOutAtoms} = []\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "replicate": {
        const nx = getNumber(data, "x", 1);
        const ny = getNumber(data, "y", 1);
        const nz = getNumber(data, "z", 1);
        // Per-axis "same molecule" flags. Default true = one continuous molecule
        // along that axis, so an inorganic framework stays a single molecule by
        // default (legacy keepMolid migrates to all three). Untick an axis to make
        // copies along it separate molecules — a clay supercell is one molecule in
        // X and Y (continuous layer) but separate molecules in Z (stacked layers).
        const legacyKeep = getBoolean(data, "keepMolid", true);
        const sameX = getBoolean(data, "sameMoleculeX", legacyKeep);
        const sameY = getBoolean(data, "sameMoleculeY", legacyKeep);
        const sameZ = getBoolean(data, "sameMoleculeZ", legacyKeep);
        const keepResname = getBoolean(data, "keepResname", true) ? "True" : "False";
        const renumberIndex = getBoolean(data, "renumberIndex", true) ? "True" : "False";
        // Replicate one axis at a time, "same molecule" axes first and "separate"
        // axes last, so new molids are appended as contiguous blocks (a valid,
        // contiguous GROMACS [ molecules ] section). The molecule count then falls
        // out of get_mol_sequence's molid grouping. An organic input (.itp) is
        // always separate on every axis (keep_molid False), and its .itp/#defines is
        // preserved so the replicated GAFF molecule keeps its forcefield.
        const axes = [
          { n: nx, vec: `[${nx}, 1, 1]`, same: sameX },
          { n: ny, vec: `[1, ${ny}, 1]`, same: sameY },
          { n: nz, vec: `[1, 1, ${nz}]`, same: sameZ },
        ];
        const ordered = [...axes.filter((a) => a.same), ...axes.filter((a) => !a.same)].filter((a) => a.n > 1);
        pythonCode += `_repl_has_itp = getattr(${inAtoms}, 'itp', None) is not None\n`;
        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        for (const a of ordered) {
          const keepExpr = a.same ? "(False if _repl_has_itp else True)" : "False";
          pythonCode += `${blockOutAtoms}, ${blockOutBox}, _ = ap.replicate_system(${blockOutAtoms}, ${blockOutBox}, replicate=${a.vec}, keep_molid=${keepExpr}, keep_resname=${keepResname}, renumber_index=${renumberIndex})\n`;
        }
        pythonCode += `if _repl_has_itp or getattr(${inAtoms}, '_defines', None) is not None:\n`;
        pythonCode += `    class _SL_repl(list): pass\n`;
        pythonCode += `    ${blockOutAtoms} = _SL_repl(${blockOutAtoms})\n`;
        pythonCode += `    if _repl_has_itp: ${blockOutAtoms}.itp = ${inAtoms}.itp\n`;
        pythonCode += `    if getattr(${inAtoms}, '_defines', None) is not None: ${blockOutAtoms}._defines = ${inAtoms}._defines\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "topology": {
        // Passthrough that attaches a user-defined GROMACS [ molecules ] override
        // (name + count rows from the Topology editor) onto the system. Export and
        // Simulate forward it to write_merged_top, which writes it verbatim in place
        // of the auto-detected sequence. Empty rows -> no override (auto-detect).
        const molRows = Array.isArray((data as { molecules?: unknown }).molecules)
          ? ((data as { molecules?: { name?: string; count?: string | number }[] }).molecules ?? [])
          : [];
        const pairs = molRows
          .filter((r) => r && String(r.name ?? "").trim() && Number(r.count) > 0)
          .map((r) => `('${pyEscape(String(r.name).trim())}', ${Math.trunc(Number(r.count))})`);
        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        if (pairs.length > 0) {
          pythonCode += `class _SL_topo(list): pass\n`;
          pythonCode += `${blockOutAtoms} = _SL_topo(${inAtoms})\n`;
          pythonCode += `${blockOutAtoms}._mol_counts_override = [${pairs.join(", ")}]\n`;
          pythonCode += `for _a in ('itp', '_defines', '_top_path'):\n`;
          pythonCode += `    if hasattr(${inAtoms}, _a): setattr(${blockOutAtoms}, _a, getattr(${inAtoms}, _a))\n`;
        }
        // Emit the detected [ molecules ] sequence (name, count, type) so the
        // Topology editor can show/pre-fill the apparent composition after a run.
        pythonCode += `try:\n`;
        pythonCode += `    import json as _json_ms\n`;
        pythonCode += `    _ms_typed = ap.get_mol_sequence_typed(list(${inAtoms}))\n`;
        pythonCode += `    print('__MOLSEQ__${id}=' + _json_ms.dumps([{'name': _n, 'count': _c, 'type': _k} for (_n, _c, _k) in _ms_typed]))\n`;
        pythonCode += `except Exception:\n`;
        pythonCode += `    pass\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "transform": {
        const tMode = getString(data, "mode", "translate");
        if (tMode === "translate") {
          const transMode = getString(data, "translateMode", "absolute");
          const tx = getNumber(data, "tx", 0);
          const ty = getNumber(data, "ty", 0);
          const tz = getNumber(data, "tz", 0);
          const resname = getString(data, "translateResname", "").trim();
          if (transMode === "absolute") {
            pythonCode += `${blockOutAtoms} = ap.place(${inAtoms}, [${tx}, ${ty}, ${tz}])\n`;
          } else {
            if (resname) {
              pythonCode += `${blockOutAtoms} = ap.translate(${inAtoms}, [${tx}, ${ty}, ${tz}], resname='${pyEscape(resname)}')\n`;
            } else {
              pythonCode += `${blockOutAtoms} = ap.translate(${inAtoms}, [${tx}, ${ty}, ${tz}])\n`;
            }
          }
          stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        } else if (tMode === "rotate") {
          const rotMode = getString(data, "rotateMode", "random");
          if (rotMode === "manual") {
            const rx = getNumber(data, "rx", 0);
            const ry = getNumber(data, "ry", 0);
            const rz = getNumber(data, "rz", 0);
            pythonCode += `${blockOutAtoms} = ap.rotate(${inAtoms}, Box=${inBox}, angles=[${rx}, ${ry}, ${rz}])\n`;
          } else {
            pythonCode += `${blockOutAtoms} = ap.rotate(${inAtoms}, Box=${inBox}, angles='random')\n`;
          }
          stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        } else if (tMode === "scale") {
          const sx = getNumber(data, "sx", 1.0);
          const sy = getNumber(data, "sy", 1.0);
          const sz = getNumber(data, "sz", 1.0);
          const resname = getString(data, "scaleResname", "").trim();
          if (resname) {
            pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.scale(${inAtoms}, ${inBox}, [${sx}, ${sy}, ${sz}], resname='${pyEscape(resname)}')\n`;
          } else {
            pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.scale(${inAtoms}, ${inBox}, [${sx}, ${sy}, ${sz}])\n`;
          }
          stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        } else if (tMode === "bend") {
          const radius = getNumber(data, "radius", 50);
          pythonCode += `${blockOutAtoms} = ap.bend(${inAtoms}, ${radius})\n`;
          stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        } else if (tMode === "center") {
          const useBox = getBoolean(data, "useBox", true);
          const centerDim = getString(data, "centerDim", "xyz");
          const centerResname = getString(data, "centerResname", "").trim();
          
          let boxArg = "None";
          if (useBox) {
            boxArg = inBox;
          }
          
          let resnameArg = "all";
          if (centerResname) {
            resnameArg = `'${pyEscape(centerResname)}'`;
          } else {
            resnameArg = "'all'";
          }
          
          pythonCode += `${blockOutAtoms} = ap.center(${inAtoms}, Box=${boxArg}, resname=${resnameArg}, dim='${pyEscape(centerDim)}')\n`;
          stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        }
        // Preserve organic .itp / topology metadata: ap.translate/rotate/scale/
        // bend/center return plain lists and would otherwise drop it, so a
        // transformed organic degrades into a mineral component downstream (MIN_1).
        pythonCode += `if hasattr(${inAtoms}, 'itp') or hasattr(${inAtoms}, '_defines') or hasattr(${inAtoms}, '_top_path'):\n`;
        pythonCode += `    class _SL_tf(list): pass\n`;
        pythonCode += `    ${blockOutAtoms} = _SL_tf(${blockOutAtoms})\n`;
        pythonCode += `    for _a in ('itp', '_defines', '_top_path'):\n`;
        pythonCode += `        if hasattr(${inAtoms}, _a): setattr(${blockOutAtoms}, _a, getattr(${inAtoms}, _a))\n`;
        break;
      }
      case "bend": {
        const radius = getNumber(data, "radius", 50);
        pythonCode += `${blockOutAtoms} = ap.bend(${inAtoms}, ${radius})\n`;
        pythonCode += carryTopo(blockOutAtoms, inAtoms);
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "position": {
        const mode = getString(data, "mode", "absolute");
        const tx = getNumber(data, "x", 0);
        const ty = getNumber(data, "y", 0);
        const tz = getNumber(data, "z", 0);
        const resname = getString(data, "resname", "").trim();
        if (mode === "absolute") {
          pythonCode += `${blockOutAtoms} = ap.place(${inAtoms}, [${tx}, ${ty}, ${tz}])\n`;
        } else {
          if (resname) {
            pythonCode += `${blockOutAtoms} = ap.translate(${inAtoms}, [${tx}, ${ty}, ${tz}], resname='${pyEscape(resname)}')\n`;
          } else {
            pythonCode += `${blockOutAtoms} = ap.translate(${inAtoms}, [${tx}, ${ty}, ${tz}])\n`;
          }
        }
        pythonCode += carryTopo(blockOutAtoms, inAtoms);
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "rotate": {
        const mode = getString(data, "mode", "random");
        if (mode === "manual") {
          const rx = getNumber(data, "x", 0);
          const ry = getNumber(data, "y", 0);
          const rz = getNumber(data, "z", 0);
          pythonCode += `${blockOutAtoms} = ap.rotate(${inAtoms}, Box=${inBox}, angles=[${rx}, ${ry}, ${rz}])\n`;
        } else {
          pythonCode += `${blockOutAtoms} = ap.rotate(${inAtoms}, Box=${inBox}, angles='random')\n`;
        }
        pythonCode += carryTopo(blockOutAtoms, inAtoms);
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "scale": {
        const sx = getNumber(data, "sx", 1.0);
        const sy = getNumber(data, "sy", 1.0);
        const sz = getNumber(data, "sz", 1.0);
        const resname = getString(data, "resname", "").trim();
        if (resname) {
          pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.scale(${inAtoms}, ${inBox}, [${sx}, ${sy}, ${sz}], resname='${pyEscape(resname)}')\n`;
        } else {
          pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.scale(${inAtoms}, ${inBox}, [${sx}, ${sy}, ${sz}])\n`;
        }
        pythonCode += carryTopo(blockOutAtoms, inAtoms);
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "reorder": {
        const byMode = getString(data, "byMode", "index");
        const rawNeworder = getString(data, "neworder", "").trim();
        const tokens = rawNeworder.split(/[;,]+/).map((t) => t.trim()).filter((t) => t.length > 0);
        if (tokens.length === 0) {
          pythonCode += `# Reorder node missing input values, passing unchanged\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        } else {
          let listExpr = "";
          if (byMode === "index") {
            const intTokens = tokens.filter(t => !isNaN(parseInt(t, 10)));
            listExpr = `[${intTokens.join(", ")}]`;
          } else {
            listExpr = `[${tokens.map(t => `'${pyEscape(t)}'`).join(", ")}]`;
          }
          pythonCode += `${blockOutAtoms} = ap.reorder(${inAtoms}, ${listExpr}, by='${byMode}')\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "slice": {
        const xlo = getNumber(data, "xlo", 0);
        const ylo = getNumber(data, "ylo", 0);
        const zlo = getNumber(data, "zlo", 0);
        const xhi = getOptionalNumber(data, "xhi");
        const yhi = getOptionalNumber(data, "yhi");
        const zhi = getOptionalNumber(data, "zhi");
        const removePartial = getBoolean(data, "removePartial", true);

        const xhiExpr = xhi !== null ? `${xhi}` : (inBox !== "None" ? `${inBox}[0]` : "50.0");
        const yhiExpr = yhi !== null ? `${yhi}` : (inBox !== "None" ? `${inBox}[1]` : "50.0");
        const zhiExpr = zhi !== null ? `${zhi}` : (inBox !== "None" ? `${inBox}[2]` : "50.0");
        const removePy = removePartial ? "True" : "False";

        pythonCode += `${blockOutAtoms} = ap.slice(${inAtoms}, [${xlo}, ${ylo}, ${zlo}, ${xhiExpr}, ${yhiExpr}, ${zhiExpr}], remove_partial_molecules=${removePy})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "remove": {
        const atomTypeRaw = getString(data, "atomType", "").trim();
        const indicesRaw = getString(data, "indices", "").trim();
        const molidsRaw = getString(data, "molids", "").trim();
        const logic = getString(data, "logic", "and").toLowerCase() === "or" ? "or" : "and";

        const mode = getString(data, "mode", "remove");

        const removeArgs: string[] = [];

        if (atomTypeRaw) {
          const atomTypeTokens = atomTypeRaw
            .split(/[;,]+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 0);
          if (atomTypeTokens.length === 1) {
            removeArgs.push(`atom_type='${pyEscape(atomTypeTokens[0])}'`);
          } else if (atomTypeTokens.length > 1) {
            removeArgs.push(`atom_type=[${atomTypeTokens.map((t) => `'${pyEscape(t)}'`).join(", ")}]`);
          }
        }

        if (indicesRaw) {
          const indexTokens = indicesRaw
            .split(/[;,]+/)
            .map((token) => token.trim())
            .filter((token) => /^-?\d+$/.test(token))
            .map((token) => parseInt(token, 10));
          if (indexTokens.length === 1) {
            removeArgs.push(`index=${indexTokens[0]}`);
          } else if (indexTokens.length > 1) {
            removeArgs.push(`index=[${indexTokens.join(", ")}]`);
          }
        }

        if (molidsRaw) {
          const molidTokens = molidsRaw
            .split(/[;,]+/)
            .map((token) => token.trim())
            .filter((token) => /^-?\d+$/.test(token))
            .map((token) => parseInt(token, 10));
          if (molidTokens.length === 1) {
            removeArgs.push(`molid=${molidTokens[0]}`);
          } else if (molidTokens.length > 1) {
            removeArgs.push(`molid=[${molidTokens.join(", ")}]`);
          }
        }

        (["x", "y", "z"] as const).forEach((axis) => {
          const enabled = getBoolean(data, `${axis}Enabled`, false);
          if (!enabled) return;
          const opRaw = getString(data, `${axis}Op`, "<");
          const op = ["<", "<=", ">", ">=", "==", "!="].includes(opRaw) ? opRaw : "<";
          const value = getNumber(data, `${axis}Value`, 0);
          removeArgs.push(`${axis}=('${op}', ${value})`);
        });

        const removedVar = `removed_${index}`;
        if (removeArgs.length === 0) {
          pythonCode += `# Remove node has no valid criteria, passing unchanged\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        } else {
          removeArgs.push(`logic='${logic}'`);
          removeArgs.push(`reindex=True`);
          if (mode === "keep") {
            removeArgs.push(`keep=True`);
          }
          pythonCode += `${removedVar} = ap.remove(${inAtoms}, ${removeArgs.join(", ")})\n`;
          pythonCode += `${blockOutAtoms} = ap.update(${removedVar}, force=True)\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "insert": {
        const source = getString(data, "source", "preset");
        const templateAtoms = `template_${index}`;
        const wrappedInAtoms = `wrapped_${index}`;
        const insertedVar = `inserted_${index}`;

        if (source === "upload") {
          const upPath = pyEscape(getString(data, "path", "")) || `uploads/${pyEscape(getString(data, "filename", "uploaded.pdb"))}`;
          pythonCode += `${templateAtoms}, _ = ap.import_auto(f'${upPath}')\n`;
        } else {
          // Library insert template: a UC_conf preset (librarySource 'preset',
          // also the legacy source==='preset' path) or a bundled crystal.
          const file = pyEscape(getString(data, "value", "unknown.pdb"));
          const librarySource = getString(data, "librarySource", "preset");
          if (source === "library" && librarySource === "crystal") {
            pythonCode += `${templateAtoms}, _ = ap.load_crystal('${file}')\n`;
          } else {
            pythonCode += `${templateAtoms}, _ = ap.import_auto(f'UC_conf/${file}')\n`;
          }
        }

        const numMolecules = getNumber(data, "numMolecules", 1);
        const minDistance = getNumber(data, "minDistance", 2.0);
        const rotateMode = getString(data, "rotateMode", "random");
        const rotateArg =
          rotateMode === "manual"
            ? `[${getNumber(data, "x", 0)}, ${getNumber(data, "y", 0)}, ${getNumber(data, "z", 0)}]`
            : "'random'";
        const xlo = getOptionalNumber(data, "xlo");
        const ylo = getOptionalNumber(data, "ylo");
        const zlo = getOptionalNumber(data, "zlo");
        const xhi = getOptionalNumber(data, "xhi");
        const yhi = getOptionalNumber(data, "yhi");
        const zhi = getOptionalNumber(data, "zhi");
        const hasCustomLimits = [xlo, ylo, zlo, xhi, yhi, zhi].some((v) => v !== null);
        const boxXExpr = inBox !== "None" ? `${inBox}[0]` : "50.0";
        const boxYExpr = inBox !== "None" ? `${inBox}[1]` : "50.0";
        const boxZExpr = inBox !== "None" ? `${inBox}[2]` : "50.0";
        const limitsExpr = hasCustomLimits
          ? `[${xlo !== null ? xlo : 0.0}, ${ylo !== null ? ylo : 0.0}, ${zlo !== null ? zlo : 0.0}, ${xhi !== null ? xhi : boxXExpr}, ${yhi !== null ? yhi : boxYExpr}, ${zhi !== null ? zhi : boxZExpr}]`
          : `[0, 0, 0, ${boxXExpr}, ${boxYExpr}, ${boxZExpr}]`;
        const constraint1 = getString(data, "typeConstraint1", "").trim();
        const constraint2 = getString(data, "typeConstraint2", "").trim();
        const zDiff = getOptionalNumber(data, "zDiff");
        const constraintsArg =
          constraint1 && constraint2
            ? `, type_constraints=['${pyEscape(constraint1)}', '${pyEscape(constraint2)}']`
            : "";
        const zDiffArg = zDiff !== null ? `, z_diff=${zDiff}` : "";

        pythonCode += `${wrappedInAtoms} = ap.wrap(${inAtoms}, ${inBox})\n`;
        pythonCode += `${insertedVar} = ap.insert(${templateAtoms}, ${limitsExpr}, Box=${inBox}, rotate=${rotateArg}, min_distance=${minDistance}, num_mols=${numMolecules}, solute_atoms=${wrappedInAtoms}${constraintsArg}${zDiffArg})\n`;
        pythonCode += `${blockOutAtoms} = ap.update(${inAtoms}, ${insertedVar})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "substitute": {
        const numOct = getNumber(data, "numOct", 0);
        const o1Type = pyEscape(getString(data, "o1Type", "Al"));
        const o2Type = pyEscape(getString(data, "o2Type", "Mgo"));
        const minO2Dist = getNumber(data, "minO2Dist", 5.5);
        const numTet = getNumber(data, "numTet", 0);
        const t1Type = pyEscape(getString(data, "t1Type", "Si"));
        const t2Type = pyEscape(getString(data, "t2Type", "Alt"));
        const minT2Dist = getNumber(data, "minT2Dist", 5.5);
        const dimension = getNumber(data, "dimension", 3);
        const loLimit = getOptionalNumber(data, "loLimit");
        const hiLimit = getOptionalNumber(data, "hiLimit");

        let limitsArg = "";
        if (loLimit !== null) {
          limitsArg += `, lo_limit=${loLimit}`;
        }
        if (hiLimit !== null) {
          limitsArg += `, hi_limit=${hiLimit}`;
        }

        pythonCode += `${blockOutAtoms}, ${blockOutBox}, _ = ap.substitute(${inAtoms}, ${inBox}, ${numOct}, '${o1Type}', '${o2Type}', ${minO2Dist}, num_tet_subst=${numTet}, t1_type='${t1Type}', t2_type='${t2Type}', min_t2t2_dist=${minT2Dist}${limitsArg}, dimension=${dimension})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "fuse": {
        const rmax = getNumber(data, "rmax", 0.5);
        const criteria = pyEscape(getString(data, "criteria", "average"));
        pythonCode += `${blockOutAtoms} = ap.fuse_atoms(${inAtoms}, ${inBox}, rmax=${rmax}, criteria='${criteria}')\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "resname": {
        const defaultResname = pyEscape(getString(data, "defaultResname", "MIN"));
        pythonCode += `${blockOutAtoms} = ap.assign_resname(${inAtoms}, default_resname='${defaultResname}')\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "molecule": {
        const molid = getNumber(data, "molid", 1);
        const resname = getString(data, "resname", "").trim();
        if (resname) {
          pythonCode += `${blockOutAtoms} = ap.molecule(${inAtoms}, molid=${molid}, resname='${pyEscape(resname)}')\n`;
        } else {
          pythonCode += `${blockOutAtoms} = ap.molecule(${inAtoms}, molid=${molid})\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "ions":
      case "addIons": {
        const method = getString(data, "method", "random");
        const ion = pyEscape(getString(data, "ionType", "Na"));

        const xlo = getOptionalNumber(data, "xlo");
        const ylo = getOptionalNumber(data, "ylo");
        const zlo = getOptionalNumber(data, "zlo");
        const xhi = getOptionalNumber(data, "xhi");
        const yhi = getOptionalNumber(data, "yhi");
        const zhi = getOptionalNumber(data, "zhi");
        const hasCustomLimits = [xlo, ylo, zlo, xhi, yhi, zhi].some((v) => v !== null);
        const boxXExpr = inBox !== "None" ? `${inBox}[0]` : "50.0";
        const boxYExpr = inBox !== "None" ? `${inBox}[1]` : "50.0";
        const boxZExpr = inBox !== "None" ? `${inBox}[2]` : "50.0";

        const limitsExpr = hasCustomLimits
          ? `[${xlo !== null ? xlo : 0.0}, ${ylo !== null ? ylo : 0.0}, ${zlo !== null ? zlo : 0.0}, ${xhi !== null ? xhi : boxXExpr}, ${yhi !== null ? yhi : boxYExpr}, ${zhi !== null ? zhi : boxZExpr}]`
          : (inBox !== "None" ? `${inBox}` : "[0, 0, 0, 50, 50, 50]");

        const ionsVar = `ions_${index}`;

        if (method === "grid") {
          const density = getNumber(data, "density", 0.1);
          pythonCode += `${ionsVar}, _ = ap.create_grid('${ion}', ${density}, ${limitsExpr})\n`;
          pythonCode += `${blockOutAtoms} = ap.update(${inAtoms}, ${ionsVar})\n`;
        } else {
          const count = getNumber(data, "count", 0);
          const dist = getNumber(data, "minDistance", 3.0);
          const placement = pyEscape(getString(data, "placement", "random"));
          const direction = getString(data, "direction", "").toLowerCase();
          const directionValue = getOptionalNumber(data, "directionValue");

          const directionArg =
            (direction === "x" || direction === "y" || direction === "z") && directionValue !== null
              ? `, direction='${direction}', direction_value=${directionValue}`
              : "";

          const wrappedInAtoms = `wrapped_${index}`;
          pythonCode += `${wrappedInAtoms} = ap.wrap(${inAtoms}, ${inBox})\n`;
          pythonCode += `${ionsVar} = ap.ionize('${ion}', resname='${ion}', limits=${limitsExpr}, num_ions=${count}, Box=${inBox}, min_distance=${dist}, solute_atoms=${wrappedInAtoms}, placement='${placement}'${directionArg})\n`;
          pythonCode += `${blockOutAtoms} = ap.update(${inAtoms}, ${ionsVar})\n`;
        }
        // Propagate .itp so downstream Simulate nodes use the merged-topology path
        pythonCode += `if hasattr(${inAtoms}, 'itp') and ${inAtoms}.itp is not None:\n`;
        pythonCode += `    class _SL_ions(list): pass\n`;
        pythonCode += `    _sl = _SL_ions(${blockOutAtoms}); _sl.itp = ${inAtoms}.itp; ${blockOutAtoms} = _sl\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "solvent": {
        const _wmSolv = getString(data, "waterModel", "opc3");
        // tip4pew shares the 4-site geometry but isn't a solvate insertion template
        const model = pyEscape(_wmSolv.toLowerCase() === "tip4pew" ? "tip4p" : _wmSolv);
        const dens = getNumber(data, "density", 1.0) * 1000.0;
        const spacing = getNumber(data, "minDistance", 2.0);
        // Max-solvent mode: 'max' fills the box at the given density, 'count'
        // inserts an EXACT number, 'shell' makes a solvation shell. This was
        // previously unwired — solvate always used its 'max' default, so the
        // UI's "Fixed count" was ignored (e.g. set 194 but got ~198).
        const maxMode = getString(data, "maxSolventMode", "max");
        let maxSolventArg = "'max'";
        if (maxMode === "count") {
          maxSolventArg = `${Math.max(1, Math.trunc(getNumber(data, "maxSolventCount", 100)))}`;
        } else if (maxMode === "shell") {
          const th = getNumber(data, "shellThickness", 15);
          const nearest = [10, 15, 20, 25, 30].reduce((a, b) => (Math.abs(b - th) < Math.abs(a - th) ? b : a), 10);
          maxSolventArg = `'shell${nearest}'`;
        }
        const includeSolute = getBoolean(data, "includeSolute", true) ? "True" : "False";
        pythonCode += `${blockOutAtoms} = ap.solvate(limits=${inBox}, Box=${inBox}, density=${dens}, min_distance=${spacing}, solute_atoms=${inAtoms}, solvent_type='${model}', max_solvent=${maxSolventArg}, include_solute=${includeSolute})\n`;
        // Propagate .itp so downstream Simulate nodes use the merged-topology path
        pythonCode += `if hasattr(${inAtoms}, 'itp') and ${inAtoms}.itp is not None:\n`;
        pythonCode += `    class _SL_solv2(list): pass\n`;
        pythonCode += `    _sl = _SL_solv2(${blockOutAtoms}); _sl.itp = ${inAtoms}.itp; ${blockOutAtoms} = _sl\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "edit": {
        const editMode = getString(data, "mode", "remove");

        if (editMode === "slice") {
          const xlo = getNumber(data, "xlo", 0);
          const ylo = getNumber(data, "ylo", 0);
          const zlo = getNumber(data, "zlo", 0);
          const xhi = getOptionalNumber(data, "xhi");
          const yhi = getOptionalNumber(data, "yhi");
          const zhi = getOptionalNumber(data, "zhi");
          const removePartial = getBoolean(data, "removePartial", true);

          const xhiExpr = xhi !== null ? `${xhi}` : (inBox !== "None" ? `${inBox}[0]` : "50.0");
          const yhiExpr = yhi !== null ? `${yhi}` : (inBox !== "None" ? `${inBox}[1]` : "50.0");
          const zhiExpr = zhi !== null ? `${zhi}` : (inBox !== "None" ? `${inBox}[2]` : "50.0");
          const removePy = removePartial ? "True" : "False";

          pythonCode += `${blockOutAtoms} = ap.slice(${inAtoms}, [${xlo}, ${ylo}, ${zlo}, ${xhiExpr}, ${yhiExpr}, ${zhiExpr}], remove_partial_molecules=${removePy})\n`;
        } else if (editMode === "remove") {
          const atomTypeRaw = getString(data, "atomType", "").trim();
          const indicesRaw = getString(data, "indices", "").trim();
          const molidsRaw = getString(data, "molids", "").trim();
          const logic = getString(data, "logic", "and").toLowerCase() === "or" ? "or" : "and";
          const modeVal = getString(data, "mode", "remove");

          const removeArgs: string[] = [];

          if (atomTypeRaw) {
            const atomTypeTokens = atomTypeRaw
              .split(/[;,]+/)
              .map((token) => token.trim())
              .filter((token) => token.length > 0);
            if (atomTypeTokens.length === 1) {
              removeArgs.push(`atom_type='${pyEscape(atomTypeTokens[0])}'`);
            } else if (atomTypeTokens.length > 1) {
              removeArgs.push(`atom_type=[${atomTypeTokens.map((t) => `'${pyEscape(t)}'`).join(", ")}]`);
            }
          }

          if (indicesRaw) {
            const indexTokens = indicesRaw
              .split(/[;,]+/)
              .map((token) => token.trim())
              .filter((token) => /^-?\d+$/.test(token))
              .map((token) => parseInt(token, 10));
            if (indexTokens.length === 1) {
              removeArgs.push(`index=${indexTokens[0]}`);
            } else if (indexTokens.length > 1) {
              removeArgs.push(`index=[${indexTokens.join(", ")}]`);
            }
          }

          if (molidsRaw) {
            const molidTokens = molidsRaw
              .split(/[;,]+/)
              .map((token) => token.trim())
              .filter((token) => /^-?\d+$/.test(token))
              .map((token) => parseInt(token, 10));
            if (molidTokens.length === 1) {
              removeArgs.push(`molid=${molidTokens[0]}`);
            } else if (molidTokens.length > 1) {
              removeArgs.push(`molid=[${molidTokens.join(", ")}]`);
            }
          }

          (["x", "y", "z"] as const).forEach((axis) => {
            const enabled = getBoolean(data, `${axis}Enabled`, false);
            if (!enabled) return;
            const opRaw = getString(data, `${axis}Op`, "<");
            const op = ["<", "<=", ">", ">=", "==", "!="].includes(opRaw) ? opRaw : "<";
            const value = getNumber(data, `${axis}Value`, 0);
            removeArgs.push(`${axis}=('${op}', ${value})`);
          });

          const removedVar = `removed_${index}`;
          if (removeArgs.length === 0) {
            pythonCode += `# Remove node has no valid criteria, passing unchanged\n`;
            pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          } else {
            removeArgs.push(`logic='${logic}'`);
            removeArgs.push(`reindex=True`);
            if (modeVal === "keep") {
              removeArgs.push(`keep=True`);
            }
            pythonCode += `${removedVar} = ap.remove(${inAtoms}, ${removeArgs.join(", ")})\n`;
            pythonCode += `${blockOutAtoms} = ap.update(${removedVar}, force=True)\n`;
          }
        } else if (editMode === "molecule") {
          const customMolid = getNumber(data, "molid", 1);
          const customResname = getString(data, "moleculeResname", "").trim();
          if (customResname) {
            pythonCode += `${blockOutAtoms} = ap.molecule(${inAtoms}, molid=${customMolid}, resname='${pyEscape(customResname)}')\n`;
          } else {
            pythonCode += `${blockOutAtoms} = ap.molecule(${inAtoms}, molid=${customMolid})\n`;
          }
        } else if (editMode === "resname") {
          const defaultResname = getString(data, "defaultResname", "MIN").trim();
          pythonCode += `${blockOutAtoms} = ap.assign_resname(${inAtoms}, default_resname='${pyEscape(defaultResname)}')\n`;
        } else if (editMode === "reorder") {
          const byMode = getString(data, "byMode", "index");
          const neworder = getString(data, "neworder", "").trim();
          let listExpr = "[]";
          if (neworder) {
            const tokens = neworder.split(/[;,]+/).map((t) => t.trim()).filter((t) => t.length > 0);
            if (byMode === "index") {
              const intTokens = tokens.map((t) => parseInt(t, 10)).filter((t) => isFinite(t));
              listExpr = `[${intTokens.join(", ")}]`;
            } else {
              listExpr = `[${tokens.map((t) => `'${pyEscape(t)}'`).join(", ")}]`;
            }
          }
          pythonCode += `${blockOutAtoms} = ap.reorder(${inAtoms}, ${listExpr}, by='${byMode}')\n`;
        } else if (editMode === "center") {
          const centerOrigin = getBoolean(data, "centerOrigin", false);
          if (centerOrigin) {
            pythonCode += `${blockOutAtoms} = ap.center(${inAtoms})\n`;
          } else {
            pythonCode += `if ${inBox} is not None:\n`;
            pythonCode += `    ${blockOutAtoms} = ap.center(${inAtoms}, ${inBox})\n`;
            pythonCode += `else:\n`;
            pythonCode += `    ${blockOutAtoms} = ap.center(${inAtoms})\n`;
          }
        } else if (editMode === "millerCut") {
          const cutWhole = getBoolean(data, "cutWholeMolecules", false) ? "True" : "False";
          const cutShape = getString(data, "cutShape", "planes");
          if (cutShape === "sphere" || cutShape === "cylinder") {
            const radius = getNumber(data, "cutRadius", 10);
            const side = getString(data, "cutShapeSide", "inside") === "outside" ? "outside" : "inside";
            const centerAuto = getBoolean(data, "cutCenterAuto", true);
            const centerArg = centerAuto
              ? ""
              : `, center=(${getNumber(data, "cutCx", 0)}, ${getNumber(data, "cutCy", 0)}, ${getNumber(data, "cutCz", 0)})`;
            if (cutShape === "sphere") {
              pythonCode += `${blockOutAtoms} = ap.cut_sphere(${inAtoms}, ${inBox}, radius=${radius}, side='${side}'${centerArg}, whole_molecules=${cutWhole})\n`;
            } else {
              const axis = getString(data, "cutAxis", "z");
              const lenRaw = (data as Record<string, unknown>).cutLength;
              const lenArg = (lenRaw === undefined || lenRaw === null || lenRaw === "") ? "" : `, length=${getNumber(data, "cutLength", 0)}`;
              pythonCode += `${blockOutAtoms} = ap.cut_cylinder(${inAtoms}, ${inBox}, radius=${radius}, axis='${pyEscape(axis)}', side='${side}'${lenArg}${centerArg}, whole_molecules=${cutWhole})\n`;
            }
            stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
            break;
          }
          // Build the list of cut planes (intersection of half-spaces). Migrate
          // a legacy single-plane definition if no list is present.
          type RawPlane = { h?: number; k?: number; l?: number; side?: string; levelAuto?: boolean; level?: number; offset?: number };
          const raw = (data as { cutPlanes?: RawPlane[] }).cutPlanes;
          const planeDefs: RawPlane[] = Array.isArray(raw) && raw.length > 0
            ? raw
            : [{
                h: getNumber(data, "cutH", 1), k: getNumber(data, "cutK", 1), l: getNumber(data, "cutL", 1),
                side: getString(data, "cutSide", "below"),
                levelAuto: getBoolean(data, "cutLevelAuto", true),
                level: getNumber(data, "cutLevel", 0.5), offset: getNumber(data, "cutOffset", 0),
              }];
          const planesPy = planeDefs.map((p) => {
            const lvl = p.levelAuto === false ? `${Number(p.level) || 0}` : `'auto'`;
            const side = p.side === "above" ? "above" : "below";
            return `{'h': ${Math.round(Number(p.h)) || 0}, 'k': ${Math.round(Number(p.k)) || 0}, 'l': ${Math.round(Number(p.l)) || 0}, 'side': '${side}', 'level': ${lvl}, 'offset': ${Number(p.offset) || 0}}`;
          }).join(", ");
          pythonCode += `${blockOutAtoms} = ap.cut_planes(${inAtoms}, ${inBox}, [${planesPy}], whole_molecules=${cutWhole})\n`;
        } else if (editMode === "slab") {
          // Oriented supercell / slab exposing the (hkl) face along z — updates the box.
          const sh = Math.round(getNumber(data, "slabH", 1));
          const sk = Math.round(getNumber(data, "slabK", 1));
          const sl = Math.round(getNumber(data, "slabL", 1));
          const hklTuple = getBoolean(data, "slabFourIndex", false) ? `(${sh}, ${sk}, ${-(sh + sk)}, ${sl})` : `(${sh}, ${sk}, ${sl})`;
          const layers = Math.max(1, Math.round(getNumber(data, "slabLayers", 1)));
          const vacuum = getNumber(data, "slabVacuum", 0);
          const gromacs = getBoolean(data, "slabGromacs", false) ? "True" : "False";
          pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.make_slab(${inAtoms}, ${inBox}, ${hklTuple}, layers=${layers}, vacuum=${vacuum}, gromacs_box=${gromacs})\n`;
          stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
          break;
        } else {
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "PBC":
      case "pbc": {
        const pbcMode = getString(data, "mode", "wrap");
        if (pbcMode === "unwrap") {
          const molidRaw = getString(data, "unwrapMolid", "").trim();
          const molids = molidRaw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          const molidArg = molids.length > 0 ? `, molid=[${molids.join(", ")}]` : "";
          pythonCode += `${blockOutAtoms} = ap.unwrap_coordinates(${inAtoms}, ${inBox}${molidArg})\n`;
          pythonCode += carryTopo(blockOutAtoms, inAtoms);
          stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        } else if (pbcMode === "condense") {
          // Tighten the box to the atomic extent (no padding), centering atoms in it.
          pythonCode += `${blockOutBox} = ap.Cell2Box_dim(ap.fit_box(${inAtoms}, padding=0.0, cubic=False, center=True))\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += carryTopo(blockOutAtoms, inAtoms);
          stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        } else {
          pythonCode += `${blockOutAtoms} = ap.wrap(${inAtoms}, ${inBox})\n`;
          pythonCode += carryTopo(blockOutAtoms, inAtoms);   // wrap preserves atoms → keep topology
          stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        }
        break;
      }
      case "wrap": {
        pythonCode += `${blockOutAtoms} = ap.wrap(${inAtoms}, ${inBox})\n`;
        pythonCode += carryTopo(blockOutAtoms, inAtoms);
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "forcefield": {
        const ff = getString(data, "forcefield", "minff");
        const isOrganic = ["openff_sage", "openff_parsley", "gaff"].includes(ff);
        
        if (isOrganic) {
          const chargeMethod = getString(data, "chargeMethod", "am1bcc");
          const chargeArg = chargeMethod === "none" ? "none" : chargeMethod === "gasteiger" ? "gasteiger" : "am1bcc";
          const versionArg = ff === "gaff" ? "gaff-2.11" : ff;

          pythonCode += `\n# Parametrize Organic Molecule via Forcefield node\n`;
          pythonCode += `if isinstance(${inAtoms}, str):\n`;
          pythonCode += `    try:\n`;
          pythonCode += `        if '/' in ${inAtoms} or ${inAtoms}.endswith(('.pdb', '.mol2', '.sdf', '.mol')):\n`;
          pythonCode += `            ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_file(${inAtoms}, version='${versionArg}', charge_method='${chargeArg}', basename='${organicBasename(n)}')\n`;
          pythonCode += `        else:\n`;
          pythonCode += `            ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_gaff(${inAtoms}, version='${versionArg}', charge_method='${chargeArg}', basename='${organicBasename(n)}')\n`;
          pythonCode += `    except Exception as e:\n`;
          pythonCode += `        print(f"Failed to parametrize organic molecule: {e}")\n`;
          pythonCode += `        ${blockOutAtoms}, ${blockOutBox} = [], None\n`;
          pythonCode += `else:\n`;
          pythonCode += `    # Legacy compat: pass-through pre-parameterized structure\n`;
          pythonCode += `    ${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `    ${blockOutBox} = ${inBox}\n`;
        } else if (ff === "dummy") {
          // Frozen "dummy mineral" for materials not covered by the built-in force fields: charges = scale ×
          // guessed oxidation state, LJ borrowed from MINFF (O→OPC3, metal→small
          // site), framework frozen. The atoms carry _dummy_type/frozen markers
          // that the Simulate node detects to build a bond-free frozen topology.
          const metalSite = pyEscape(getString(data, "dummyMetalSite", "Alo"));
          const chargeMode = pyEscape(getString(data, "dummyChargeMode", "pauling"));
          const ljMode = pyEscape(getString(data, "dummyLjMode", "element"));
          const chargeScale = getNumber(data, "dummyChargeScale", 0.5);
          // Same global bond-detection cutoffs as MINFF/CLAYFF — they set the
          // coordination used by the MINFF oxygen-charge formula.
          const dRmaxLong = getNumber(data, "rmaxLong", 2.45);
          const dRmaxH = getNumber(data, "rmaxH", 1.2);
          const dumName = sanitizeMolName(getString(data, "moleculeName", "").trim()) || "DUM";
          pythonCode += `\n# Frozen DUMMY mineral (Dummy FF) -- qualitative; EM/NVT only\n`;
          pythonCode += `if ${inBox} is None:\n`;
          pythonCode += `    raise ValueError("Dummy forcefield requires a mineral structure with a simulation box.")\n`;
          pythonCode += `ap.assign_dummy_mineral_params(${inAtoms}, Box=${inBox}, charge_mode='${chargeMode}', charge_scale=${chargeScale}, lj_mode='${ljMode}', metal_site='${metalSite}', rmaxlong=${dRmaxLong}, rmaxH=${dRmaxH}, resname='${dumName}')\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else {
          // Global options (mineral typing only): bond-detection cutoffs, typing
          // log, and resetMolid (separate water so its O don't perturb Al/Mg
          // coordination, and put the mineral framework on a single molid).
          const rmaxLong = getNumber(data, "rmaxLong", 2.45);
          const rmaxH = getNumber(data, "rmaxH", 1.2);
          const doLog = getBoolean(data, "log", false);
          const logFile = pyEscape(getString(data, "logFile", `${ff}.log`));
          const resetMolid = getBoolean(data, "resetMolid", false);
          const logArgs = doLog ? `, log=True, log_file='${logFile}'` : "";
          pythonCode += `if ${inBox} is None:\n`;
          pythonCode += `    raise ValueError("Forcefield node (${ff.toUpperCase()}) requires a mineral structure with a simulation box. Connect a mineral source node, not an organic molecule node.")\n`;
          if (resetMolid) {
            pythonCode += `_ff_SOL, _ff_noSOL = ap.find_H2O(${inAtoms}, ${inBox})\n`;
            pythonCode += `_ff_noSOL = ap.assign_resname(_ff_noSOL)\n`;
            pythonCode += `_ff_MIN = [a for a in _ff_noSOL if a.get('resname') == 'MIN']\n`;
            pythonCode += `_ff_OTHER = [a for a in _ff_noSOL if a.get('resname') != 'MIN']\n`;
            pythonCode += `if _ff_MIN: _ff_MIN = ap.update(_ff_MIN, molid=1)\n`;
            pythonCode += `_ff_in = ap.update(_ff_MIN, _ff_OTHER, _ff_SOL)\n`;
          } else {
            pythonCode += `_ff_in = ${inAtoms}\n`;
          }
          if (ff === "minff") {
            pythonCode += `${blockOutAtoms} = ap.minff(_ff_in, ${inBox}, rmaxlong=${rmaxLong}, rmaxH=${rmaxH}${logArgs})\n`;
          } else {
            pythonCode += `${blockOutAtoms} = ap.clayff(_ff_in, ${inBox}, rmaxlong=${rmaxLong}, rmaxH=${rmaxH}${logArgs})\n`;
          }
          // Optional user mineral name -> the built moleculetype follows the resname
          // (merge_top no longer hard-codes 'MIN'), so mixed/different minerals can
          // be named (PYRO, KAOL, ...). Blank = keep 'MIN' (auto-deduped on merge).
          const mineralName = sanitizeMolName(getString(data, "moleculeName", "").trim());
          if (mineralName) {
            pythonCode += `for _a in ${blockOutAtoms}:\n`;
            pythonCode += `    if str(_a.get('type','')).startswith(('Ow','Hw')) or _a.get('resname') == 'SOL': continue\n`;
            pythonCode += `    _a['resname'] = '${mineralName}'\n`;
          }
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "simulate": {
        const simType = getString(data, "simType", "nvt");
        const temp = getNumber(data, "temperature", 298.15);
        const timestepFs = getNumber(data, "timestep", 1.0);
        const frictionPs = getNumber(data, "frictionCoeff", 1.0);
        const miniSteps = getNumber(data, "miniSteps", 500);
        const mdSteps = getNumber(data, "mdSteps", 5000);
        const cutoffNm = getNumber(data, "cutoff", 12.0) / 10.0;
        const constraintsStr = getString(data, "constraints", "HBonds");
        const wrapTrajectory = getBoolean(data, "wrapTrajectory", true);
        // Walk upstream depth-first, visiting each node's inputs in handle order
        // (in1 before in2 …) so the FIRST-connected branch of a Join/Add node takes
        // precedence — e.g. an inorganic structure wired to in1 wins over an organic
        // one on in2.
        const orderedParents = (nodeId: string) =>
          edges.filter(e => e.target === nodeId)
               .sort((a, b) => String(a.targetHandle ?? "").localeCompare(String(b.targetHandle ?? "")));
        const findUpstreamForcefield = (startId: string): string => {
          const visited = new Set<string>();
          const dfs = (nodeId: string): string | null => {
            if (visited.has(nodeId)) return null;
            visited.add(nodeId);
            for (const edge of orderedParents(nodeId)) {
              const p = nodeMap.get(edge.source);
              if (!p) continue;
              if (p.type === "forcefield") return getString(p.data, "forcefield", "minff");
              const found = dfs(p.id);
              if (found !== null) return found;
            }
            return null;
          };
          return dfs(startId) ?? "minff";
        };
        // Resolve the INORGANIC (MINFF/CLAYFF) forcefield node specifically. A mixed
        // mineral+organic graph also has an organic forcefield node, so a plain BFS
        // "first forcefield" could read the mineral Ka/variant off the organic node.
        const findUpstreamMineralFF = (startId: string): Record<string, unknown> | null => {
          const visited = new Set<string>();
          const dfs = (nodeId: string): Record<string, unknown> | null => {
            if (visited.has(nodeId)) return null;
            visited.add(nodeId);
            for (const edge of orderedParents(nodeId)) {
              const p = nodeMap.get(edge.source);
              if (!p) continue;
              if (p.type === "forcefield") {
                const ff = getString(p.data, "forcefield", "minff");
                if (ff === "minff" || ff === "clayff") return p.data as Record<string, unknown>;
              }
              const found = dfs(p.id);
              if (found !== null) return found;
            }
            return null;
          };
          return dfs(startId);
        };
        // Water model comes from the Solvate/Solvent node (independent of any
        // Forcefield node) so pure-water, organic and mineral systems all pick it
        // the same way. Falls back to a sensible default per FF family.
        const findUpstreamWaterModel = (startId: string, ffType: string): string => {
          const visited = new Set<string>();
          const queue = [startId];
          while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);
            const parentEdges = edges.filter(e => e.target === current);
            for (const edge of parentEdges) {
              const parentNode = nodeMap.get(edge.source);
              if (parentNode) {
                if (parentNode.type === "solvent") {
                  const v = getString(parentNode.data, "waterModel", "");
                  if (v) return v.toUpperCase();  // match FF block names (SPCE, OPC3, TIP4PEW…)
                }
                queue.push(parentNode.id);
              }
            }
          }
          return ffType === "clayff" ? "SPCE" : "OPC3";
        };
        // Ion-pair parameter set comes from the Ions node (independent of any
        // Forcefield node). Falls back to a sensible default per FF family.
        const findUpstreamIonSet = (startId: string, ffType: string): string => {
          const visited = new Set<string>();
          const queue = [startId];
          while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);
            const parentEdges = edges.filter(e => e.target === current);
            for (const edge of parentEdges) {
              const parentNode = nodeMap.get(edge.source);
              if (parentNode) {
                if (parentNode.type === "ions" || parentNode.type === "addIons" || parentNode.type === "grid") {
                  const v = getString(parentNode.data, "ionSet", "");
                  if (v) return v;
                }
                queue.push(parentNode.id);
              }
            }
          }
          return ffType === "clayff" ? "HFE_LM" : "IOD_LM";
        };
        const upstreamFF = findUpstreamForcefield(id);
        // Mineral FF + angle Ka come from the inorganic (MINFF/CLAYFF) node, not the
        // first forcefield found (a mixed graph also has an organic forcefield node).
        const mineralFFData = findUpstreamMineralFF(id);
        const mineralFF = mineralFFData ? getString(mineralFFData, "forcefield", "minff") : "minff";
        const minffVariant = mineralFFData ? getString(mineralFFData, "minffVariant", "500") : "500";
        const clayffAngles = mineralFFData ? getString(mineralFFData, "clayffAngles", "none") : "none";
        // CLAYFF defaults to no angles; MINFF "none" also omits angles (and still
        // needs a nonbonded block → GMINFF_k0).
        const writeAngles = mineralFF === "clayff" ? (clayffAngles !== "none") : (minffVariant !== "none");
        const minffDefineVariant = minffVariant === "none" ? "0" : minffVariant;
        // atomipy's angle model: scanned θ0 for metal O-M-O/M-O-M at KANGLE, standard
        // M-O-H, all angles dropped when "none". Ka from the inorganic FF node.
        const mineralKangle = writeAngles ? Number(mineralFF === "clayff" ? clayffAngles : minffVariant) : 0;
        const waterModel = findUpstreamWaterModel(id, upstreamFF);
        const ionSet = findUpstreamIonSet(id, upstreamFF);
        const logFile = pyEscape(getString(data, "logFile", "output.log"));
        // Semantic, per-type output basename: EM_1, NVT_1, NPT_1, EM_2, … in
        // execution order (so consecutive EM -> NVT chains get readable filenames).
        const _simLabel = simType === "minimize" ? "EM" : simType === "npt" ? "NPT" : "NVT";
        _simTypeCount[_simLabel] = (_simTypeCount[_simLabel] || 0) + 1;
        const simBase = `${_simLabel}_${_simTypeCount[_simLabel]}`;
        const trajFile = `${simBase}.pdb`;
        const excludeWater = getBoolean(data, "excludeWater", true);
        const pdbFreq = getNumber(data, "pdbFreq", getNumber(data, "dcdFreq", 1000));
        const logFreq = getNumber(data, "logFreq", 1000);

        // Organic-only / pure-solvent systems must NOT pull in a mineral FF block.
        // Water atomtypes come from a direct water-model #include and ions from the
        // ion-set define, both independent of GMINFF_k…/CLAYFF — so dropping the
        // mineral define is safe and avoids loading unused mineral atomtypes.
        // Include the mineral nonbonded define whenever an inorganic FF is upstream
        // (independent of any organic FF), using the variant from that node.
        const mineralDefine = mineralFF === "clayff" ? "CLAYFF_EXT" : `GMINFF_k${minffDefineVariant}`;
        const defines = [
          ...(mineralFFData ? [mineralDefine] : []),
          `${waterModel}_${ionSet}`,
          waterModel,
        ];
        const definesExpr = `[${defines.map(d => `'${d}'`).join(", ")}]`;

        const constraintsExpr = constraintsStr === "None" ? "None"
          : constraintsStr === "AllBonds" ? "app.AllBonds" : "app.HBonds";
        const isMinimize = simType === "minimize";
        const isNPT = simType === "npt";
        const pressure = getNumber(data, "pressure", 1.0);

        // Thermodynamic time-series plot: parse the engine's energy output and emit it
        // to a connected Data Plotter (GROMACS .edr via gmx energy; OpenMM StateDataReporter log).
        const thermoPlot = getString(data, "thermoPlot", "off");
        const thermoPlotTarget = edges.find((e) => e.source === id && nodes.find((nn) => nn.id === e.target)?.type === "plot")?.target;
        const THERMO_MAP: Record<string, { gmx: string; omm: string; label: string }> = {
          potential:   { gmx: "Potential",    omm: "Potential Energy", label: "Potential energy" },
          total:       { gmx: "Total-Energy", omm: "Total Energy",      label: "Total energy" },
          temperature: { gmx: "Temperature",  omm: "Temperature",       label: "Temperature" },
          pressure:    { gmx: "Pressure",     omm: "",                  label: "Pressure" },
          volume:      { gmx: "Volume",       omm: "Box Volume",        label: "Volume" },
          density:     { gmx: "Density",      omm: "Density",           label: "Density" },
        };
        const thermo = THERMO_MAP[thermoPlot];
        const doThermo = !!thermo && !!thermoPlotTarget && mode !== "strict";

        // ===== Local GROMACS engine (grompp + mdrun) =====
        // Reuses the SAME topology writers as the OpenMM path (write_merged_top /
        // write_dummy_system_top / write_gmx_top), then runs gmx instead of OpenMM.
        const engine = getString(data, "engine", "openmm");
        if (engine === "gromacs") {
          // GROMACS path (gmx binary, GMXRC, or install dir). Default empty -> 'gmx' on
          // PATH (works on Colab/standard installs); set the field for a custom install.
          const gmxSpec = getString(data, "gmxPath", "").trim() || "gmx";
          pythonCode += `\n# Set up and execute LOCAL GROMACS simulation (grompp + mdrun)\n`;
          pythonCode += `# __ATOMIPY_SIM_TYPE__=${simType}\n`;
          pythonCode += `import os as _os\n`;
          pythonCode += `import atomipy.gromacs as _gmx\n`;
          pythonCode += `_gmx_spec = '${pyEscape(gmxSpec)}'\n`;
          pythonCode += `_gmx_info = _gmx.detect_gmx(_gmx_spec)\n`;
          pythonCode += `if not _gmx_info:\n`;
          pythonCode += `    raise RuntimeError(f"GROMACS engine selected but no usable gmx was found for '{_gmx_spec}'. Set a valid GROMACS path (gmx binary, GMXRC, or install dir) in the Simulate node, or use the OpenMM engine.")\n`;
          pythonCode += `print(f"[GROMACS] using {_gmx_info['version']} ({_gmx_info['path']})")\n`;
          pythonCode += `_top_path = "${simBase}.top"\n`;
          pythonCode += `_gro_path = "${simBase}.gro"\n`;
          pythonCode += `_solvent_ion_res = {'SOL','WAT','HOH','TIP3','OPC','OPC3','SPC','SPCE','TIP4','TIP5','ION','NA','CL','K','LI','CS','RB','F','BR','I','CA','MG','ZN','NA+','CL-','K+','CA2+','MG2+','ZN2+'}\n`;
          pythonCode += `_has_solvent_or_ions = any(str(a.get('resname','')).upper() in _solvent_ion_res for a in ${inAtoms})\n`;
          pythonCode += `_has_itp = hasattr(${inAtoms}, 'itp') and ${inAtoms}.itp is not None\n`;
          pythonCode += `_dummy_frame = [a for a in ${inAtoms} if a.get('_dummy_type')]\n`;
          pythonCode += `if _dummy_frame:\n`;
          pythonCode += `    # Frozen dummy mineral: self-contained dummy .top (true freezing via .mdp freezegrps is a follow-up; EM/NVT are meaningful as-is)\n`;
          pythonCode += `    ap.write_dummy_system_top(list(${inAtoms}), ${inBox}, _top_path, _gro_path, water_model="${waterModel}")\n`;
          pythonCode += `    _gmx_defines = []  # self-contained .top\n`;
          pythonCode += `elif _has_itp or _has_solvent_or_ions:\n`;
          pythonCode += `    _defines = ${definesExpr}\n`;
          pythonCode += `    _ff_variant = "GMINFF_k500"; _water_model = "${waterModel.toLowerCase()}"; _ion_model = "SPCE_HFE_LM"\n`;
          pythonCode += `    for _d in _defines:\n`;
          pythonCode += `        if "CLAYFF" in _d: _ff_variant = "CLAYFF_EXT"\n`;
          pythonCode += `        elif "MINFF" in _d: _ff_variant = _d\n`;
          pythonCode += `        _d_parts = [p.upper() for p in _d.split('_')]\n`;
          pythonCode += `        for _w in ['spce','opc3','tip3p','opc','tip4pew','spc','tip5p']:\n`;
          pythonCode += `            if _w.upper() in _d_parts or _w.upper() == _d.upper(): _water_model = _w\n`;
          pythonCode += `        for _ion in ['HFE_LM','IOD_LM','CM_LM','JC']:\n`;
          pythonCode += `            if _ion in _d: _ion_model = _d\n`;
          pythonCode += `    if not _has_itp:\n`;
          pythonCode += `        _mineral_atoms = [a for a in ${inAtoms} if str(a.get('resname','')).upper() not in _solvent_ion_res]\n`;
          pythonCode += `        if _mineral_atoms:\n`;
          pythonCode += `            _, _itp, _ = ap.merge_top({'atoms': _mineral_atoms, 'itp': None, 'box': ${inBox}})\n`;
          pythonCode += `        else:\n`;
          pythonCode += `            _itp = {'_original_itps': [], 'atomtypes': {}, '_component_labels': ['Solvent/Ions']}\n`;
          pythonCode += `    else:\n`;
          pythonCode += `        _itp = ${inAtoms}.itp\n`;
          pythonCode += `    _org_itps = []\n`;
          pythonCode += `    if _itp.get('_source_itp'): _org_itps.append(_os.path.basename(_itp['_source_itp']))\n`;
          pythonCode += `    for _oi in _itp.get('_original_itps', []) or []:\n`;
          pythonCode += `        _src = _oi.get('_source_itp') if isinstance(_oi, dict) else None\n`;
          pythonCode += `        if _src and _os.path.basename(_src) not in _org_itps: _org_itps.append(_os.path.basename(_src))\n`;
          pythonCode += `    ap.write_merged_top(list(${inAtoms}), _itp, ${inBox}, _top_path, _gro_path,\n`;
          pythonCode += `                        minff_variant=_ff_variant, water_model=_water_model, ion_model=_ion_model,\n`;
          pythonCode += `                        organic_itps=_org_itps or None, angle_ka=${writeAngles ? mineralKangle : "None"},\n`;
          pythonCode += `                        mol_counts_override=getattr(${inAtoms}, '_mol_counts_override', None))\n`;
          pythonCode += `    _gmx_defines = []  # merged .top self-defines its #defines\n`;
          pythonCode += `else:\n`;
          pythonCode += `    ap.write_gmx_top(list(${inAtoms}), Box=${inBox}, file_path=_top_path, explicit_angles=${writeAngles ? 1 : 0}, KANGLE=${mineralKangle}, max_angle=${writeAngles ? "None" : "0.0"})\n`;
          pythonCode += `    ap.write_gro(list(${inAtoms}), ${inBox}, _gro_path)\n`;
          pythonCode += `    _gmx_defines = ['-D'+_d for _d in ${definesExpr}]  # mineral-only .top needs -D flags in the .mdp\n`;
          pythonCode += `_gmx.stage_minff('.', defines=${definesExpr})  # define-aware: strips ffbonded lines for types absent under the active FF (e.g. Feo2/Feo3 under CLAYFF)\n`;
          pythonCode += `_gmx_top = _os.path.basename(_top_path)\n`;
          pythonCode += `def _gmx_run(_stage, _struct, **_kw):\n`;
          pythonCode += `    _lines = []\n`;
          pythonCode += `    def _cap(_l):\n`;
          pythonCode += `        _lines.append(_l); print(_l)\n`;
          pythonCode += `    _st = _gmx.run_local_gmx('.', _gmx_top, _struct, [_stage], defines=_gmx_defines, gmx=_gmx_spec, do_stage_minff=False, on_line=_cap, **_kw)\n`;
          pythonCode += `    if not _st or _st[-1].get('returncode') != 0 or not _st[-1].get('gro'):\n`;
          pythonCode += `        _txt = "\\n".join(_lines)\n`;
          pythonCode += `        if any(_p in _txt for _p in ('be settled', 'LINCS WARNING', 'Too many LINCS', 'is NaN', 'Water molecule', 'cannot be settled', 'too many warnings')):\n`;
          pythonCode += `            raise RuntimeError(f"GROMACS {_stage} could not start: the structure has close contacts / very high forces (e.g. 'water cannot be settled'). A freshly built or solvated box must be energy-minimized first \\u2014 add a Simulate node set to 'Energy Minimization' (Minimize) before this {_stage.upper()} node.")\n`;
          pythonCode += `        raise RuntimeError(f"GROMACS {_stage} failed \\u2014 see log above.")\n`;
          pythonCode += `    print(f"  {_stage.upper()} finished OK!")\n`;
          pythonCode += `    return _os.path.basename(_st[-1]['gro'])\n`;
          // Run ONLY the selected stage (no implicit EM before NVT/NPT) — like the
          // OpenMM node. Chain EM/NVT/NPT in any order by connecting Simulate nodes;
          // each continues from the previous one's relaxed structure (carried below).
          const stage = simType === "npt" ? "npt" : (simType === "nvt" ? "nvt" : "em");
          // nstxtc applies to MD (.xtc) AND EM (.trr via nstxout) so EM also yields a
          // viewable trajectory; dt/temperature only matter for the dynamics stages.
          let runKwargs = `nsteps=${isMinimize ? miniSteps : mdSteps}, nstxtc=${pdbFreq}`;
          if (!isMinimize) runKwargs += `, dt=${timestepFs / 1000.0}, temperature=${temp}`;
          if (isNPT) runKwargs += `, pressure=${pressure}`;
          // Full editable .mdp: if the user supplied one, it's used verbatim (the
          // structured kwargs above are then ignored by run_stage).
          const mdpText = getString(data, "mdpText", "").trim();
          if (mdpText) {
            pythonCode += `_gmx_mdp_text = ${JSON.stringify(mdpText)}\n`;
            runKwargs += `, mdp_text=_gmx_mdp_text`;
          }
          pythonCode += `_g = _gmx_run('${stage}', _os.path.basename(_gro_path), ${runKwargs})\n`;
          pythonCode += `print("GROMACS simulation finished OK!")\n`;
          // Convert the stage's trajectory -> multi-frame PDB (CRYST1 per MODEL so the
          // box shows in the viewer). MD writes .xtc; steepest-descent EM writes .trr
          // instead — so try .xtc first, then fall back to .trr.
          pythonCode += `_final_stage = "${stage}"\n`;
          // Wrap-trajectory toggle: trjconv -pbc atom (wrap atoms into the box) when on,
          // -pbc none (leave coordinates as-is) when off. Independent of the .mdp.
          const gmxPbc = wrapTrajectory ? "atom" : "none";
          pythonCode += `_traj = None\n`;
          pythonCode += `_traj_src = None\n`;
          pythonCode += `for _ext in ('xtc', 'trr'):\n`;
          pythonCode += `    _cand = _final_stage + '.' + _ext\n`;
          pythonCode += `    if not _os.path.exists(_cand):\n`;
          pythonCode += `        continue\n`;
          pythonCode += `    try:\n`;
          pythonCode += `        _traj = _gmx.trjconv_to_pdb('.', tpr=_final_stage+'.tpr', xtc=_cand, out="${trajFile}", group="System", pbc="${gmxPbc}", gmx=_gmx_spec, on_line=print)\n`;
          pythonCode += `        if _traj:\n`;
          pythonCode += `            _traj_src = _cand\n`;
          pythonCode += `            break\n`;
          pythonCode += `    except Exception as _e:\n`;
          pythonCode += `        print(f"(trajectory conversion error [{_ext}]: {_e})")\n`;
          pythonCode += `if _traj:\n`;
          pythonCode += `    print(f"Wrote trajectory ${trajFile} (from {_traj_src})")\n`;
          if (excludeWater) {
            pythonCode += `    try:\n`;
            pythonCode += `        _gmx.trjconv_to_pdb('.', tpr=_final_stage+'.tpr', xtc=_traj_src, out="${simBase}_no_water.pdb", group="non-Water", pbc="${gmxPbc}", gmx=_gmx_spec)\n`;
            pythonCode += `    except Exception:\n`;
            pythonCode += `        pass  # 'non-Water' group may be absent (no water) — viewer falls back to the full PDB\n`;
          }
          pythonCode += `else:\n`;
          pythonCode += `    # No .xtc frames (e.g. a short EM) — write the final frame so the viewer still shows the result.\n`;
          pythonCode += `    try:\n`;
          pythonCode += `        _fa, _fb = ap.import_auto(_g)\n`;
          pythonCode += `        ap.write_pdb(_fa, _fb, "${trajFile}")\n`;
          pythonCode += `        print(f"Wrote final frame ${trajFile} ({len(_fa)} atoms)")\n`;
          pythonCode += `    except Exception as _e:\n`;
          pythonCode += `        print(f"(note: could not write final pdb: {_e})")\n`;
          if (doThermo) {
            pythonCode += `# Thermodynamic time-series (${thermo.label}) -> Data Plotter\n`;
            pythonCode += `try:\n`;
            pythonCode += `    import json as _json\n`;
            pythonCode += `    _th = _gmx.energy_timeseries('.', _final_stage + '.edr', terms=['${thermo.gmx}'], gmx=_gmx_spec, on_line=print)\n`;
            pythonCode += `    if _th and _th.get('series'):\n`;
            pythonCode += `        _ts = _th['series'][0]\n`;
            pythonCode += `        _pts = [[float(t), float(v)] for t, v in zip(_th['time'], _ts['values'])]\n`;
            pythonCode += `        print("__PLOT_${thermoPlotTarget}__:" + _json.dumps({'series': [{'name': _ts['name'], 'points': _pts}], 'xLabel': 'time (ps)', 'yLabel': _ts['name']}))\n`;
            pythonCode += `    else:\n`;
            pythonCode += `        print("(thermo: '${thermo.gmx}' not found in ${"$"}{_final_stage}.edr)")\n`;
            pythonCode += `except Exception as _te:\n`;
            pythonCode += `    print(f"(thermo plot skipped: {_te})")\n`;
          }

          // Output the SIMULATED structure (relaxed coords + final box) so a chained
          // Simulate node continues from here. Keep the full FF metadata (itp etc.)
          // on the original atoms; only update x/y/z and the box from the result .gro.
          pythonCode += `try:\n`;
          pythonCode += `    _rel_atoms, _rel_box = ap.import_auto(_g)\n`;
          pythonCode += `    _out_atoms = [dict(_a) for _a in ${inAtoms}]\n`;
          pythonCode += `    for _i in range(min(len(_out_atoms), len(_rel_atoms))):\n`;
          pythonCode += `        _out_atoms[_i]['x'] = _rel_atoms[_i].get('x', _out_atoms[_i].get('x'))\n`;
          pythonCode += `        _out_atoms[_i]['y'] = _rel_atoms[_i].get('y', _out_atoms[_i].get('y'))\n`;
          pythonCode += `        _out_atoms[_i]['z'] = _rel_atoms[_i].get('z', _out_atoms[_i].get('z'))\n`;
          pythonCode += `    class _SimList(list): pass\n`;
          pythonCode += `    ${blockOutAtoms} = _SimList(_out_atoms)\n`;
          pythonCode += `    if hasattr(${inAtoms}, 'itp'): ${blockOutAtoms}.itp = ${inAtoms}.itp\n`;
          pythonCode += `    if hasattr(${inAtoms}, '_mol_counts_override'): ${blockOutAtoms}._mol_counts_override = ${inAtoms}._mol_counts_override\n`;
          pythonCode += `    ${blockOutBox} = _rel_box if (_rel_box is not None and hasattr(_rel_box, '__len__') and len(_rel_box)) else ${inBox}\n`;
          pythonCode += `except Exception as _e:\n`;
          pythonCode += `    print(f"(note: could not carry forward the simulated structure: {_e})")\n`;
          pythonCode += `    ${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `    ${blockOutBox} = ${inBox}\n`;
          stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox, traj: `'${trajFile}'` });
          break;
        }

        pythonCode += `\n# Set up and execute OpenMM Molecular Dynamics Simulation\n`;
        // Machine-readable marker of the ACTIVE simulation type, used by the
        // server to enforce SIMULATION_MODE (e.g. em_only). Both the EM and MD
        // code paths are always emitted (if/else), so the server cannot infer the
        // active type from the body — this marker states it explicitly.
        pythonCode += `# __ATOMIPY_SIM_TYPE__=${simType}\n`;
        pythonCode += `try:\n`;
        pythonCode += `    import openmm as mm\n`;
        pythonCode += `    import openmm.app as app\n`;
        pythonCode += `    from openmm import unit\n`;
        pythonCode += `    import tempfile, os as _os\n`;
        pythonCode += `    \n`;
        pythonCode += `    print("Setting up simulation system...")\n`;
        pythonCode += `    # _SimList: list subclass that carries topology metadata across chained nodes\n`;
        pythonCode += `    class _SimList(list): pass\n`;
        pythonCode += `    # Frozen DUMMY mineral? (atoms carry _dummy_type set by the dummy forcefield)\n`;
        pythonCode += `    _dummy_frame = [a for a in ${inAtoms} if a.get('_dummy_type')]\n`;
        pythonCode += `    _frozen_idx = [i for i, a in enumerate(${inAtoms}) if a.get('frozen')]\n`;
        if (isNPT) {
          pythonCode += `    if _dummy_frame:\n`;
          pythonCode += `        raise RuntimeError("Dummy FF frozen minerals support EM/NVT only -- a frozen framework is incompatible with an NPT barostat. Set the Simulate node to NVT or Energy Minimization (not NPT).")\n`;
        }
        pythonCode += `    # Priority 1: topology already built by an upstream simulation — reuse it\n`;
        pythonCode += `    _chain_top = getattr(${inAtoms}, '_top_path', None)\n`;
        pythonCode += `    if _chain_top and _os.path.exists(_chain_top):\n`;
        pythonCode += `        # The topology is unchanged from the upstream run (only coordinates\n`;
        pythonCode += `        # differ), so copy it to this run's own name -> each simulation is a\n`;
        pythonCode += `        # self-contained ${simBase}.top + ${simBase}.gro pair.\n`;
        pythonCode += `        import shutil as _shutil\n`;
        pythonCode += `        _top_path = "${simBase}.top"\n`;
        pythonCode += `        if _os.path.abspath(_chain_top) != _os.path.abspath(_top_path):\n`;
        pythonCode += `            _shutil.copyfile(_chain_top, _top_path)\n`;
        pythonCode += `        _defines  = getattr(${inAtoms}, '_defines', ${definesExpr})\n`;
        pythonCode += `        _gro_path = "${simBase}.gro"\n`;
        pythonCode += `        ap.write_gro(list(${inAtoms}), ${inBox}, _gro_path)\n`;
        pythonCode += `        _minff_dir = _os.path.join(_os.path.dirname(ap.__file__), 'ffparams')\n`;
        pythonCode += `        topology, system, positions = ap.load_minff_into_openmm(_top_path, _gro_path, _defines, include_dir=_minff_dir, rigid_water=True)\n`;
        pythonCode += `        _sim_atoms = list(${inAtoms})\n`;
        pythonCode += `        # Re-freeze a chained frozen-dummy framework (e.g. EM -> NVT): the reused\n`;
        pythonCode += `        # topology keeps real masses, so zero them again for the flagged atoms.\n`;
        pythonCode += `        for _ci, _ca in enumerate(_sim_atoms):\n`;
        pythonCode += `            if _ca.get('frozen'): system.setParticleMass(_ci, 0.0)\n`;
        pythonCode += `        _is_parmed = False\n`;
        pythonCode += `    elif _dummy_frame:\n`;
        pythonCode += `        # Frozen dummy mineral (+ optional organics/water/ions): self-contained bond-free topology\n`;
        pythonCode += `        print(f"[dummy] Frozen Dummy FF model: {len(_dummy_frame)} framework atoms frozen, charges = scaled oxidation states, borrowed LJ. Qualitative only.")\n`;
        pythonCode += `        _top_path = "${simBase}.top"\n`;
        pythonCode += `        _gro_path = "${simBase}.gro"\n`;
        pythonCode += `        _defines = []  # the dummy .top is self-contained; no external #defines (also carried to downstream nodes)\n`;
        pythonCode += `        # Collect any organic GAFF/OpenFF .itp files that reached here so they\n`;
        pythonCode += `        # are #included (otherwise OpenMM: "Unknown molecule type: organic").\n`;
        pythonCode += `        _dummy_org_itps = []\n`;
        pythonCode += `        _ex_itp = getattr(${inAtoms}, 'itp', None)\n`;
        pythonCode += `        if _ex_itp:\n`;
        pythonCode += `            _srcs = [_ex_itp.get('_source_itp')] + [(_o.get('_source_itp') if isinstance(_o, dict) else None) for _o in (_ex_itp.get('_original_itps') or [])]\n`;
        pythonCode += `            for _s in _srcs:\n`;
        pythonCode += `                if not _s: continue\n`;
        pythonCode += `                _bn = _os.path.basename(_s)\n`;
        pythonCode += `                if 'dummy' in _bn.lower() or _bn in _dummy_org_itps: continue\n`;
        pythonCode += `                if _os.path.exists(_bn): _dummy_org_itps.append(_bn)\n`;
        pythonCode += `        _dummy_ordered, _dummy_nfrozen = ap.write_dummy_system_top(list(${inAtoms}), ${inBox}, _top_path, _gro_path, water_model='${waterModel}', organic_itps=_dummy_org_itps or None)\n`;
        pythonCode += `        _minff_dir = _os.path.join(_os.path.dirname(ap.__file__), 'ffparams')\n`;
        pythonCode += `        topology, system, positions = ap.load_minff_into_openmm(_top_path, _gro_path, [], include_dir=_minff_dir, rigid_water=True)\n`;
        pythonCode += `        for _fi in range(_dummy_nfrozen):\n`;
        pythonCode += `            system.setParticleMass(_fi, 0.0)  # freeze framework (mass 0); framework is written first\n`;
        pythonCode += `        _sim_atoms = _dummy_ordered  # reordered (framework, organic, water, ions) to match the .gro\n`;
        pythonCode += `        _is_parmed = False\n`;
        pythonCode += `    else:\n`;
        pythonCode += `        # Ensure mixed systems (mineral + solvent/ions) always use merged topology even if itp is missing\n`;
        pythonCode += `        _solvent_ion_res = {'SOL', 'WAT', 'HOH', 'TIP3', 'OPC', 'OPC3', 'SPC', 'SPCE', 'TIP4', 'TIP5',\n`;
        pythonCode += `                            'ION', 'NA', 'CL', 'K', 'LI', 'CS', 'RB', 'F', 'BR', 'I', 'CA', 'MG', 'ZN',\n`;
        pythonCode += `                            'NA+', 'CL-', 'K+', 'CA2+', 'MG2+', 'ZN2+'}\n`;
        pythonCode += `        _has_solvent_or_ions = any(str(a.get('resname', '')).upper() in _solvent_ion_res for a in ${inAtoms})\n`;
        pythonCode += `        _has_itp = hasattr(${inAtoms}, 'itp') and ${inAtoms}.itp is not None\n`;
        pythonCode += `        if _has_itp or _has_solvent_or_ions:\n`;
        pythonCode += `            # Priority 2: merged topology (organic/mineral/water SystemList)\n`;
        pythonCode += `            _top_path = "${simBase}.top"\n`;
        pythonCode += `            _gro_path = "${simBase}.gro"\n`;
        pythonCode += `            _defines = ${definesExpr}\n`;
        pythonCode += `            _ff_variant = "GMINFF_k500"\n`;
        pythonCode += `            _water_model = "${waterModel.toLowerCase()}"\n`;
        pythonCode += `            _ion_model = "SPCE_HFE_LM"\n`;
        pythonCode += `            for _d in _defines:\n`;
        pythonCode += `                if "CLAYFF" in _d: _ff_variant = "CLAYFF_EXT"\n`;
        pythonCode += `                elif "MINFF" in _d: _ff_variant = _d\n`;
        pythonCode += `                _d_parts = [p.upper() for p in _d.split('_')]\n`;
        pythonCode += `                for _w in ['spce', 'opc3', 'tip3p', 'opc', 'tip4pew', 'spc', 'tip5p']:\n`;
        pythonCode += `                    if _w.upper() in _d_parts or _w.upper() == _d.upper(): _water_model = _w\n`;
        pythonCode += `                for _ion in ['HFE_LM', 'IOD_LM', 'CM_LM', 'JC']:\n`;
        pythonCode += `                    if _ion in _d: _ion_model = _d\n`;
        pythonCode += `            \n`;
        pythonCode += `            # Reconstruct itp if missing\n`;
        pythonCode += `            if not _has_itp:\n`;
        pythonCode += `                _mineral_atoms = [a for a in ${inAtoms} if str(a.get('resname', '')).upper() not in _solvent_ion_res]\n`;
        pythonCode += `                if _mineral_atoms:\n`;
        pythonCode += `                    _, _reconstructed_itp, _ = ap.merge_top({'atoms': _mineral_atoms, 'itp': None, 'box': ${inBox}})\n`;
        pythonCode += `                else:\n`;
        pythonCode += `                    # solvent/ions only, empty mineral itp\n`;
        pythonCode += `                    _reconstructed_itp = {'_original_itps': [], 'atomtypes': {}, '_component_labels': ['Solvent/Ions']}\n`;
        pythonCode += `                _itp = _reconstructed_itp\n`;
        pythonCode += `            else:\n`;
        pythonCode += `                _itp = ${inAtoms}.itp\n`;
        pythonCode += `            \n`;
        pythonCode += `            _org_itps = []\n`;
        pythonCode += `            if _itp.get('_source_itp'):\n`;
        pythonCode += `                _org_itps.append(_os.path.basename(_itp['_source_itp']))\n`;
        pythonCode += `            for _k, _v in _itp.items():\n`;
        pythonCode += `                if _k.startswith('_source_itp') and _v and _v not in _org_itps:\n`;
        pythonCode += `                    _org_itps.append(_os.path.basename(_v))\n`;
        pythonCode += `            # merge_top (Add node) keeps each component's source itp under\n`;
        pythonCode += `            # _original_itps; pull the organic #includes from there too, else a\n`;
        pythonCode += `            # mixed organic+mineral .top lists 'organic' in [molecules] with no\n`;
        pythonCode += `            # [moleculetype] -> OpenMM "Unknown molecule type: organic".\n`;
        pythonCode += `            for _oi in _itp.get('_original_itps', []) or []:\n`;
        pythonCode += `                _src = _oi.get('_source_itp') if isinstance(_oi, dict) else None\n`;
        pythonCode += `                if _src and _os.path.basename(_src) not in _org_itps:\n`;
        pythonCode += `                    _org_itps.append(_os.path.basename(_src))\n`;
        pythonCode += `            \n`;
        pythonCode += `            ap.write_merged_top(list(${inAtoms}), _itp, ${inBox}, _top_path, _gro_path,\n`;
        pythonCode += `                                 minff_variant=_ff_variant, water_model=_water_model,\n`;
        pythonCode += `                                 ion_model=_ion_model, organic_itps=_org_itps or None, angle_ka=${writeAngles ? mineralKangle : "None"},\n`;
        pythonCode += `                                 mol_counts_override=getattr(${inAtoms}, '_mol_counts_override', None))\n`;
        pythonCode += `            \n`;
        pythonCode += `            _minff_dir = _os.path.join(_os.path.dirname(ap.__file__), 'ffparams')\n`;
        pythonCode += `            # write_merged_top emits a self-contained .top whose #defines reflect the\n`;
        pythonCode += `            # ACTUAL mineral/water/ion composition, so pass NO external defines — only the\n`;
        pythonCode += `            # parameter blocks the system actually uses get loaded (no MINFF in a MINFF-free run).\n`;
        pythonCode += `            topology, system, positions = ap.load_minff_into_openmm(_top_path, _gro_path, [], include_dir=_minff_dir, rigid_water=True)\n`;
        pythonCode += `            _sim_atoms = list(${inAtoms})\n`;
        pythonCode += `            _is_parmed = False\n`;
        pythonCode += `        else:\n`;
        pythonCode += `            # Priority 3: mineral-only — build topology from scratch\n`;
        pythonCode += `            _top_path = "${simBase}.top"\n`;
        pythonCode += `            _gro_path = "${simBase}.gro"\n`;
        pythonCode += `            _sim_atoms = list(${inAtoms})\n`;
        pythonCode += `            ap.write_gmx_top(_sim_atoms, Box=${inBox}, file_path=_top_path, explicit_angles=${writeAngles ? 1 : 0}, KANGLE=${mineralKangle}, max_angle=${writeAngles ? "None" : "0.0"})\n`;
        pythonCode += `            ap.write_gro(_sim_atoms, ${inBox}, _gro_path)\n`;
        pythonCode += `            _minff_dir = _os.path.join(_os.path.dirname(ap.__file__), 'ffparams')\n`;
        pythonCode += `            _defines = ${definesExpr}\n`;
        pythonCode += `            topology, system, positions = ap.load_minff_into_openmm(_top_path, _gro_path, _defines, include_dir=_minff_dir, rigid_water=True)\n`;
        pythonCode += `            _is_parmed = False\n`;
        pythonCode += `    \n`;

        pythonCode += `    # Enable periodic boundaries for bonds, angles, and nonbonded exceptions (critical for periodic mineral systems!)\n`;
        pythonCode += `    for _force in system.getForces():\n`;
        pythonCode += `        if _force.__class__.__name__ in ('HarmonicBondForce', 'HarmonicAngleForce'):\n`;
        pythonCode += `            _force.setUsesPeriodicBoundaryConditions(True)\n`;
        pythonCode += `        elif _force.__class__.__name__ == 'NonbondedForce':\n`;
        pythonCode += `            _force.setExceptionsUsePeriodicBoundaryConditions(True)\n`;
        pythonCode += `    \n`;
        pythonCode += `    if ${isNPT ? "True" : "False"}:\n`;
        pythonCode += `        system.addForce(mm.MonteCarloBarostat(${pressure}*unit.bar, ${temp}*unit.kelvin))\n`;
        pythonCode += `    \n`;

        // Positional restraints (POSRES) — applied to non-water/non-ion atoms
        const posres = !isMinimize && (data.posres === true);
        const posresFC = getNumber(data, "posresFC", 1000.0);
        if (posres) {
          pythonCode += `    # Positional restraints (POSRES) on non-water/non-ion atoms\n`;
          pythonCode += `    _posres_force = mm.CustomExternalForce("0.5*k*((x-x0)^2+(y-y0)^2+(z-z0)^2)")\n`;
          pythonCode += `    _posres_force.addGlobalParameter("k", ${posresFC})  # kJ/mol/nm²\n`;
          pythonCode += `    _posres_force.addPerParticleParameter("x0")\n`;
          pythonCode += `    _posres_force.addPerParticleParameter("y0")\n`;
          pythonCode += `    _posres_force.addPerParticleParameter("z0")\n`;
          pythonCode += `    _water_rn = {'HOH','WAT','SOL','TIP3','SPC','OPC','OPC3','TIP4P','TIP4PEW','TIP5P'}\n`;
          pythonCode += `    _ion_rn = {'NA','CL','K','CA','MG','LI','RB','CS','ZN','BR','F','I'}\n`;
          pythonCode += `    _pos_nm = positions.value_in_unit(unit.nanometer)\n`;
          pythonCode += `    _posres_n = 0\n`;
          pythonCode += `    for _atom in topology.atoms():\n`;
          pythonCode += `        _rn = _atom.residue.name.upper()\n`;
          pythonCode += `        if _rn not in _water_rn and _rn not in _ion_rn:\n`;
          pythonCode += `            _p = _pos_nm[_atom.index]\n`;
          pythonCode += `            _posres_force.addParticle(_atom.index, [float(_p.x), float(_p.y), float(_p.z)])\n`;
          pythonCode += `            _posres_n += 1\n`;
          pythonCode += `    system.addForce(_posres_force)\n`;
          pythonCode += `    print(f"  Positional restraints: {_posres_n} atoms restrained at fc=${posresFC} kJ/mol/nm²")\n`;
          pythonCode += `    \n`;
        }

        pythonCode += `    integrator = mm.LangevinMiddleIntegrator(${temp}*unit.kelvin, ${frictionPs}/unit.picosecond, ${(timestepFs / 1000).toFixed(4)}*unit.picoseconds)\n`;

        pythonCode += `    simulation = app.Simulation(topology, system, integrator)\n`;
        pythonCode += `    simulation.context.setPositions(positions)\n`;
        pythonCode += `    \n`;
        pythonCode += `    class DynamicBoxPDBReporter:\n`;
        pythonCode += `        def __init__(self, file, reportInterval, write_no_water=False):\n`;
        pythonCode += `            self._out = open(file, 'w', encoding='utf-8')\n`;
        pythonCode += `            self._write_no_water = write_no_water\n`;
        pythonCode += `            if write_no_water:\n`;
        pythonCode += `                _nw_file = file.replace('.pdb', '_no_water.pdb')\n`;
        pythonCode += `                self._out_no_water = open(_nw_file, 'w', encoding='utf-8')\n`;
        pythonCode += `            self._reportInterval = reportInterval\n`;
        pythonCode += `            self._model = 1\n`;
        pythonCode += `            self._topology = None\n`;
        pythonCode += `            self._header_written = False\n`;
        pythonCode += `        def describeNextReport(self, simulation):\n`;
        pythonCode += `            steps = self._reportInterval - simulation.currentStep % self._reportInterval\n`;
        pythonCode += `            return {'steps': steps, 'periodic': True, 'include': ['positions']}\n`;
        pythonCode += `        def report(self, simulation, state):\n`;
        pythonCode += `            try:\n`;
        pythonCode += `                import io as _io, re as _re\n`;
        pythonCode += `                _state = simulation.context.getState(getPositions=True, enforcePeriodicBox=${wrapTrajectory ? "True" : "False"})\n`;
        pythonCode += `                _bv = _state.getPeriodicBoxVectors()\n`;
        pythonCode += `                if self._topology is None:\n`;
        pythonCode += `                    self._topology = simulation.topology\n`;
        pythonCode += `                self._topology.setPeriodicBoxVectors(_bv)\n`;
        pythonCode += `                # Write header (REMARK lines) once — strip CRYST1, we inject it per-frame\n`;
        pythonCode += `                if not self._header_written:\n`;
        pythonCode += `                    _hdr_buf = _io.StringIO()\n`;
        pythonCode += `                    app.PDBFile.writeHeader(self._topology, _hdr_buf)\n`;
        pythonCode += `                    _hdr = '\\n'.join(l for l in _hdr_buf.getvalue().split('\\n') if not l.startswith('CRYST1'))\n`;
        pythonCode += `                    self._out.write(_hdr)\n`;
        pythonCode += `                    if self._write_no_water:\n`;
        pythonCode += `                        self._out_no_water.write(_hdr)\n`;
        pythonCode += `                    self._header_written = True\n`;
        pythonCode += `                # Get CRYST1 for this frame's box\n`;
        pythonCode += `                _c_buf = _io.StringIO()\n`;
        pythonCode += `                app.PDBFile.writeHeader(self._topology, _c_buf)\n`;
        pythonCode += `                _cryst1 = next((l for l in _c_buf.getvalue().split('\\n') if l.startswith('CRYST1')), '')\n`;
        pythonCode += `                # Write MODEL block, injecting CRYST1 right after the MODEL line\n`;
        pythonCode += `                _m_buf = _io.StringIO()\n`;
        pythonCode += `                app.PDBFile.writeModel(self._topology, _state.getPositions(), _m_buf, self._model)\n`;
        pythonCode += `                _m_str = _m_buf.getvalue()\n`;
        pythonCode += `                if _cryst1:\n`;
        pythonCode += `                    _nl = _m_str.find('\\n')\n`;
        pythonCode += `                    if _nl >= 0:\n`;
        pythonCode += `                        _m_str = _m_str[:_nl+1] + _cryst1 + '\\n' + _m_str[_nl+1:]\n`;
        pythonCode += `                self._out.write(_m_str)\n`;
        pythonCode += `                if self._write_no_water:\n`;
        pythonCode += `                    _water_res = {'SOL', 'WAT', 'HOH', 'TIP3', 'OPC', 'OPC3', 'SPC', 'SPCE', 'TIP4', 'TIP5', 'MW', 'IW', 'HW', 'OW'}\n`;
        pythonCode += `                    _m_lines_no_water = []\n`;
        pythonCode += `                    for _l in _m_str.split('\\n'):\n`;
        pythonCode += `                        if _l.startswith(('ATOM', 'HETATM')):\n`;
        pythonCode += `                            _res = _l[17:21].strip()\n`;
        pythonCode += `                            if _res in _water_res:\n`;
        pythonCode += `                                continue\n`;
        pythonCode += `                        _m_lines_no_water.append(_l)\n`;
        pythonCode += `                    self._out_no_water.write('\\n'.join(_m_lines_no_water) + '\\n')\n`;
        pythonCode += `                self._model += 1\n`;
        pythonCode += `            except Exception as _rep_err:\n`;
        pythonCode += `                print(f"Warning: PDB frame {self._model} skipped ({_rep_err})")\n`;
        pythonCode += `        def __del__(self):\n`;
        pythonCode += `            self._out.close()\n`;
        pythonCode += `            if self._write_no_water:\n`;
        pythonCode += `                self._out_no_water.close()\n`;
        pythonCode += `\n`;
        pythonCode += `    if ${isMinimize ? "True" : "False"}:\n`;
        pythonCode += `        print("Running energy minimization (${miniSteps} max iterations)...")\n`;
        pythonCode += `        _em_state0 = simulation.context.getState(getEnergy=True)\n`;
        pythonCode += `        _em_pe0 = _em_state0.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)\n`;
        pythonCode += `        print(f"  Initial potential energy: {_em_pe0:,.1f} kJ/mol ({_em_pe0/4.184:,.1f} kcal/mol)")\n`;
        pythonCode += `        \n`;
        pythonCode += `        # EM Trajectory and CSV Log generation\n`;
        pythonCode += `        _em_reporter = DynamicBoxPDBReporter('${trajFile}', 1, write_no_water=${excludeWater ? "True" : "False"})\n`;
        pythonCode += `        _em_log_file = open('${logFile}', 'w', encoding='utf-8')\n`;
        pythonCode += `        _em_log_file.write("Step,Potential Energy (kJ/mole),Temperature (K)\\n")\n`;
        pythonCode += `        _em_chunk = min(max(1, ${logFreq}), max(1, ${pdbFreq}))\n`;
        pythonCode += `        _em_total_iter = ${miniSteps}\n`;
        pythonCode += `        _em_current_iter = 0\n`;
        pythonCode += `        # Print table header\n`;
        pythonCode += `        print(f"\\n{'Iter':<15} {'Potential Energy':<24} {'Max Force':<24}")\n`;
        pythonCode += `        # Initial state frame\n`;
        pythonCode += `        _em_reporter.report(simulation, simulation.context.getState(getPositions=True))\n`;
        pythonCode += `        _em_log_file.write(f"0,{_em_pe0},0.0\\n")\n`;
        pythonCode += `        \n`;
        pythonCode += `        while _em_current_iter < _em_total_iter:\n`;
        pythonCode += `            _em_steps = min(_em_chunk, _em_total_iter - _em_current_iter)\n`;
        pythonCode += `            simulation.minimizeEnergy(maxIterations=_em_steps)\n`;
        pythonCode += `            _em_current_iter += _em_steps\n`;
        pythonCode += `            \n`;
        pythonCode += `            # Write frame if reached PDB frequency\n`;
        pythonCode += `            if _em_current_iter % max(1, ${pdbFreq}) == 0 or _em_current_iter == _em_total_iter:\n`;
        pythonCode += `                _em_reporter.report(simulation, simulation.context.getState(getPositions=True))\n`;
        pythonCode += `            \n`;
        pythonCode += `            # Log energy and print values if reached Log frequency\n`;
        pythonCode += `            if _em_current_iter % max(1, ${logFreq}) == 0 or _em_current_iter == _em_total_iter:\n`;
        pythonCode += `                _em_state = simulation.context.getState(getEnergy=True, getForces=True)\n`;
        pythonCode += `                _em_cur_pe = _em_state.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)\n`;
        pythonCode += `                _em_forces = _em_state.getForces()\n`;
        pythonCode += `                _max_force = max((_f[0]**2 + _f[1]**2 + _f[2]**2)**0.5 for _f in _em_forces).value_in_unit_system(unit.md_unit_system)\n`;
        pythonCode += `                print(f"{_em_current_iter}/{_em_total_iter:<14} {_em_cur_pe:>14,.1f} kJ/mol  {_max_force:>14,.1f} kJ/mol/nm")\n`;
        pythonCode += `                _em_log_file.write(f"{_em_current_iter},{_em_cur_pe},0.0\\n")\n`;
        pythonCode += `            \n`;
        pythonCode += `        del _em_reporter\n`;
        pythonCode += `        _em_log_file.close()\n`;
        pythonCode += `        _em_state1 = simulation.context.getState(getEnergy=True)\n`;
        pythonCode += `        _em_pe1 = _em_state1.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)\n`;
        pythonCode += `        print(f"  Final potential energy:   {_em_pe1:,.1f} kJ/mol ({_em_pe1/4.184:,.1f} kcal/mol)")\n`;
        pythonCode += `        print(f"  Energy change: {_em_pe1 - _em_pe0:,.1f} kJ/mol  |  EM complete.")\n`;
        pythonCode += `        print("\\u2705 Energy Minimization (EM) simulation finished OK!")\n`;
        pythonCode += `    else:\n`;
        pythonCode += `        import math as _math\n`;
        pythonCode += `        _md_init_state = simulation.context.getState(getEnergy=True)\n`;
        pythonCode += `        _md_init_pe = _md_init_state.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)\n`;
        pythonCode += `        if _math.isnan(_md_init_pe) or _math.isinf(_md_init_pe) or abs(_md_init_pe) > 1e7:\n`;
        pythonCode += `            print(f"⚠️  Initial potential energy is unsafe: {_md_init_pe:,.0f} kJ/mol")\n`;
        pythonCode += `            print("   The system likely has atomic clashes from solvation.")\n`;
        pythonCode += `            print("   Solution: chain an Energy Minimization (EM) Simulate node BEFORE this ${simType.toUpperCase()} node.")\n`;
        pythonCode += `            raise RuntimeError(f"Unsafe initial energy ({_md_init_pe:,.0f} kJ/mol) — run EM first, then chain into ${simType.toUpperCase()}.")\n`;
        pythonCode += `        print(f"  Initial potential energy: {_md_init_pe:,.1f} kJ/mol — system looks stable, starting MD...")\n`;
        pythonCode += `        print(f"Executing ${simType.toUpperCase()} MD (${mdSteps} steps)...")\n`;
        pythonCode += `        simulation.reporters.append(DynamicBoxPDBReporter('${trajFile}', max(1, ${pdbFreq}), write_no_water=${excludeWater ? "True" : "False"}))\n`;
        pythonCode += `        import sys as _sys\n`;
        pythonCode += `        class CleanHeaderStream:\n`;
        pythonCode += `            def __init__(self, stream):\n`;
        pythonCode += `                self._stream = stream\n`;
        pythonCode += `            def write(self, message):\n`;
        pythonCode += `                _msg = message\n`;
        pythonCode += `                if _msg.startswith('#"Step"'):\n`;
        pythonCode += `                    _msg = _msg.replace('#', '').replace('"', '')\n`;
        pythonCode += `                self._stream.write(_msg)\n`;
        pythonCode += `            def flush(self):\n`;
        pythonCode += `                self._stream.flush()\n`;
        pythonCode += `            def close(self):\n`;
        pythonCode += `                if hasattr(self._stream, 'close'):\n`;
        pythonCode += `                    self._stream.close()\n`;
        pythonCode += `        simulation.reporters.append(app.StateDataReporter(CleanHeaderStream(open('${logFile}', 'w', encoding='utf-8')), max(1, ${logFreq}), step=True, potentialEnergy=True, totalEnergy=True, temperature=True, volume=True, density=True))\n`;
        pythonCode += `        simulation.reporters.append(app.StateDataReporter(CleanHeaderStream(_sys.stdout), max(1, ${logFreq}), step=True, potentialEnergy=True, temperature=True))\n`;
        pythonCode += `        simulation.step(${mdSteps})\n`;
        pythonCode += `        print("\\u2705 ${simType.toUpperCase()} simulation finished OK!")\n`;
        pythonCode += `    \n`;
        pythonCode += `    _state = simulation.context.getState(getPositions=True, enforcePeriodicBox=${wrapTrajectory ? "True" : "False"})\n`;
        pythonCode += `    _final_positions = _state.getPositions(asNumpy=True).value_in_unit(unit.angstrom)\n`;
        pythonCode += `    _bv = _state.getPeriodicBoxVectors(asNumpy=True).value_in_unit(unit.angstrom)\n`;
        pythonCode += `    # Convert OpenMM box vectors → GROMACS Box_dim [lx,ly,lz,0,0,xy,0,xz,yz]\n`;
        pythonCode += `    _lx = float(_bv[0][0]); _ly = float(_bv[1][1]); _lz = float(_bv[2][2])\n`;
        pythonCode += `    _xy = float(_bv[1][0]); _xz = float(_bv[2][0]); _yz = float(_bv[2][1])\n`;
        pythonCode += `    _new_box = [_lx, _ly, _lz, 0, 0, _xy, 0, _xz, _yz]\n`;
        pythonCode += `    if _is_parmed:\n`;
        pythonCode += `        for _i, _a in enumerate(_sim_atoms.atoms):\n`;
        pythonCode += `            _a.xx = float(_final_positions[_i][0])\n`;
        pythonCode += `            _a.xy = float(_final_positions[_i][1])\n`;
        pythonCode += `            _a.xz = float(_final_positions[_i][2])\n`;
        pythonCode += `        ${blockOutAtoms} = _sim_atoms\n`;
        pythonCode += `        ${blockOutBox} = _new_box\n`;
        pythonCode += `        _sim_atoms.save("${simBase}_final.pdb", overwrite=True)\n`;
        pythonCode += `    else:\n`;
        pythonCode += `        for _i, _pos in enumerate(_final_positions):\n`;
        pythonCode += `            _sim_atoms[_i]['x'] = float(_pos[0])\n`;
        pythonCode += `            _sim_atoms[_i]['y'] = float(_pos[1])\n`;
        pythonCode += `            _sim_atoms[_i]['z'] = float(_pos[2])\n`;
        pythonCode += `        # Wrap in _SimList to carry topology metadata to downstream nodes\n`;
        pythonCode += `        ${blockOutAtoms} = _SimList(_sim_atoms)\n`;
        pythonCode += `        ${blockOutAtoms}._top_path = _top_path\n`;
        pythonCode += `        ${blockOutAtoms}._defines  = _defines\n`;
        pythonCode += `        if hasattr(${inAtoms}, 'itp'): ${blockOutAtoms}.itp = ${inAtoms}.itp\n`;
        pythonCode += `        ${blockOutBox} = _new_box\n`;
        pythonCode += `        ap.write_pdb(list(_sim_atoms), _new_box, "${simBase}_final.pdb")\n`;

        if (doThermo && thermo.omm && !isMinimize) {
          pythonCode += `    # Thermodynamic time-series (${thermo.label}) -> Data Plotter\n`;
          pythonCode += `    try:\n`;
          pythonCode += `        import csv as _csv, json as _json\n`;
          pythonCode += `        with open('${logFile}', 'r', encoding='utf-8') as _lf: _rows = list(_csv.reader(_lf))\n`;
          pythonCode += `        _hdr = [str(_h).strip().strip('#').strip('"') for _h in _rows[0]]\n`;
          pythonCode += `        _ci = next((_i for _i, _h in enumerate(_hdr) if '${thermo.omm}' in _h), None)\n`;
          pythonCode += `        _si = next((_i for _i, _h in enumerate(_hdr) if 'Step' in _h), 0)\n`;
          pythonCode += `        if _ci is not None:\n`;
          pythonCode += `            _pts = [[float(_r[_si]), float(_r[_ci])] for _r in _rows[1:] if len(_r) > _ci]\n`;
          pythonCode += `            print("__PLOT_${thermoPlotTarget}__:" + _json.dumps({'series': [{'name': _hdr[_ci], 'points': _pts}], 'xLabel': 'Step', 'yLabel': _hdr[_ci]}))\n`;
          pythonCode += `    except Exception as _te:\n`;
          pythonCode += `        print(f"(thermo plot skipped: {_te})")\n`;
        } else if (doThermo && !thermo.omm && !isMinimize) {
          pythonCode += `    print("(thermo: '${thermo.label}' is not available from OpenMM's reporter — use the GROMACS engine for pressure)")\n`;
        }

        pythonCode += `except Exception as md_err:\n`;
        pythonCode += `    import traceback as _tb\n`;
        pythonCode += `    print(f"Simulation failed: {md_err}")\n`;
        pythonCode += `    print(_tb.format_exc())\n`;
        pythonCode += `    ${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `    ${blockOutBox} = ${inBox}\n`;
        if (!isMinimize) {
          pythonCode += `    with open('${logFile}', 'w', encoding='utf-8') as _logf: _logf.write(f"Simulation failed: {md_err}\\n" + _tb.format_exc())\n`;
          pythonCode += `    with open('${trajFile}', 'w', encoding='utf-8') as _trajf: _trajf.write("No trajectory generated.\\n")\n`;
        }
        
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox, traj: `'${trajFile}'` });
        break;
      }
      case "coordinateFrame":
      case "coordFrame": {
        const cfMode = getString(data, "mode", "cart_to_frac");
        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        if (cfMode === "cart_to_frac") {
          pythonCode += `ap.cartesian_to_fractional(${blockOutAtoms}, Box=${inBox}, add_to_atoms=True)\n`;
        } else if (cfMode === "frac_to_cart") {
          pythonCode += `ap.fractional_to_cartesian(${blockOutAtoms}, Box=${inBox}, add_to_atoms=True)\n`;
        } else if (cfMode === "triclinic_to_ortho") {
          pythonCode += `ap.triclinic_to_orthogonal(${blockOutAtoms}, Box=${inBox}, add_to_atoms=True)\n`;
        } else if (cfMode === "ortho_to_triclinic") {
          pythonCode += `ap.orthogonal_to_triclinic([[a['x'], a['y'], a['z']] for a in ${blockOutAtoms}], ap.Box_dim2Cell(${inBox}), atoms=${blockOutAtoms}, add_to_atoms=True)\n`;
        } else if (cfMode === "cell_vectors") {
          const vectorsFile = pyEscape(getString(data, "vectorsFile", "cell_vectors.json"));
          pythonCode += `_cell = ap.Box_dim2Cell(${inBox})\n`;
          pythonCode += `vectors_data = ap.get_cell_vectors(_cell)\n`;
          pythonCode += `with open('${vectorsFile}', 'w') as _vf:\n`;
          pythonCode += `    json.dump({'a': [float(v) for v in vectors_data[0]], 'b': [float(v) for v in vectors_data[1]], 'c': [float(v) for v in vectors_data[2]]}, _vf)\n`;
        }
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        pythonCode += carryTopo(blockOutAtoms, inAtoms);
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "condense": {
        const atomType = pyEscape(getString(data, "atomType", "O"));
        const density = getNumber(data, "density", 0.033);
        const gxlo = getNumber(data, "xlo", 0.0);
        const gylo = getNumber(data, "ylo", 0.0);
        const gzlo = getNumber(data, "zlo", 0.0);
        const gxhi = getNumber(data, "xhi", 50.0);
        const gyhi = getNumber(data, "yhi", 50.0);
        const gzhi = getNumber(data, "zhi", 50.0);

        pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.create_grid('${pyEscape(atomType)}', ${density}, [${gxlo}, ${gylo}, ${gzlo}, ${gxhi}, ${gyhi}, ${gzhi}])\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "analysis": {
        // AnalysisNode stores the selection under "mode"; "option" was a historical alias
        const option = getString(data, "mode", getString(data, "option", "rdf"));

        // Route plot data to a connected Data Plotter node (else fall back to own id).
        const plotTarget = edges.find((e) => e.source === id && nodes.find((nn) => nn.id === e.target)?.type === "plot")?.target ?? id;
        // Frames: ensemble (trajectory) when available, else the single structure.
        const framesSetup =
          inTraj !== undefined
            ? `try:\n    _frames = ap.import_traj(${inTraj})\nexcept Exception:\n    _frames = []\nif not _frames:\n    _frames = [(${inAtoms}, ${inBox})]\n`
            : `_frames = [(${inAtoms}, ${inBox})]\n`;

        if (option === "rdf") {
          const typeA = pyEscape(getString(data, "atomTypeA", "Na"));
          const typeB = pyEscape(getString(data, "atomTypeB", "Cl"));
          const rMax = getNumber(data, "rmax", 10.0);
          const dr = getNumber(data, "dr", 0.05);
          const outputBase = pyEscape(getString(data, "rdfOutputBase", "rdf_results"));
          const rdfPlot = ["gr", "cn", "both"].includes(getString(data, "rdfPlot", "gr")) ? getString(data, "rdfPlot", "gr") : "gr";

          pythonCode += `\n# RDF g(r) + running coordination number n(r) (ensemble-averaged over frames when available)\n`;
          pythonCode += framesSetup;
          pythonCode += `if len(_frames) > 1:\n`;
          pythonCode += `    rdf_data = ap.rdf_frames(_frames, typeA='${typeA}', typeB='${typeB}', rmax=${rMax}, dr=${dr}, return_cn=True)\n`;
          pythonCode += `else:\n`;
          pythonCode += `    rdf_data = ap.calculate_rdf(_frames[0][0], _frames[0][1], typeA='${typeA}', typeB='${typeB}', rmax=${rMax}, dr=${dr}, return_cn=True)\n`;
          pythonCode += `_rx = [float(x) for x in rdf_data[0]]\n_ry = [float(y) for y in rdf_data[1]]\n_rn = [float(y) for y in rdf_data[2]]\n`;
          pythonCode += `with open('${outputBase}.json', 'w') as _rf:\n`;
          pythonCode += `    json.dump({'x': _rx, 'y': _ry, 'cn': _rn}, _rf)\n`;
          pythonCode += `with open('${outputBase}.dat', 'w') as _rf:\n`;
          pythonCode += `    _rf.write("# atomipy RDF g(r) + running coordination number n(r), ${typeA}-${typeB}, over %d frame(s)\\n" % len(_frames))\n`;
          pythonCode += `    _rf.write("#%13s%14s%14s\\n" % ('r_A', 'g_r', 'CN_r'))\n`;
          pythonCode += `    for _a, _b, _c in zip(_rx, _ry, _rn):\n`;
          pythonCode += `        _rf.write("%14.6g%14.6g%14.6g\\n" % (_a, _b, _c))\n`;
          pythonCode += `print(f"RDF: {len(_rx)} bins over {len(_frames)} frame(s) [${typeA}-${typeB}]; CN within ${rMax} A = {(_rn[-1] if _rn else 0):.3f} -> ${outputBase}.dat/.json")\n`;
          if (mode !== "strict") {
            if (rdfPlot === "cn") {
              pythonCode += `print("__PLOT_${plotTarget}__:" + json.dumps({'series': [{'name': 'n(r) ${typeA}-${typeB}', 'points': [[a, c] for a, c in zip(_rx, _rn)]}], 'xLabel': 'r (Å)', 'yLabel': 'coordination n(r)'}))\n`;
            } else if (rdfPlot === "both") {
              pythonCode += `print("__PLOT_${plotTarget}__:" + json.dumps({'series': [{'name': 'g(r)', 'points': [[a, b] for a, b in zip(_rx, _ry)]}, {'name': 'n(r) (CN)', 'points': [[a, c] for a, c in zip(_rx, _rn)]}], 'xLabel': 'r (Å)', 'yLabel': 'g(r) / n(r)'}))\n`;
            } else {
              pythonCode += `print("__PLOT_${plotTarget}__:" + json.dumps({'series': [{'name': 'g(r) ${typeA}-${typeB}', 'points': [[a, b] for a, b in zip(_rx, _ry)]}], 'xLabel': 'r (Å)', 'yLabel': 'g(r)'}))\n`;
            }
          }

        } else if (option === "density") {
          const axis = ["x", "y", "z"].includes(getString(data, "densityAxis", "z")) ? getString(data, "densityAxis", "z") : "z";
          const nbins = Math.max(2, Math.round(getNumber(data, "densityBins", 100)));
          const dmode = ["number", "mass", "charge"].includes(getString(data, "densityMode", "number")) ? getString(data, "densityMode", "number") : "number";
          const outputBase = pyEscape(getString(data, "densityOutputBase", "density_profile"));
          const typesRaw = getString(data, "densityTypes", "").split(",").map((s) => s.trim()).filter(Boolean);
          const typesPy = typesRaw.length ? `[${typesRaw.map((t) => `'${pyEscape(t)}'`).join(", ")}]` : "None";
          const yUnit = dmode === "mass" ? "g/cm³" : dmode === "charge" ? "e/Å³" : "atoms/Å³";

          pythonCode += `\n# Density profile along ${axis} (ensemble-averaged over trajectory frames when available)\n`;
          pythonCode += framesSetup;
          pythonCode += `_dtypes = ${typesPy}\n`;
          pythonCode += `_series = []\n`;
          pythonCode += `if _dtypes:\n`;
          pythonCode += `    for _t in _dtypes:\n`;
          pythonCode += `        _c, _d = ap.density_frames(_frames, axis='${axis}', nbins=${nbins}, atom_types=[_t], mode='${dmode}')\n`;
          pythonCode += `        _series.append({'name': _t, 'points': [[float(x), float(y)] for x, y in zip(_c, _d)]})\n`;
          pythonCode += `else:\n`;
          pythonCode += `    _c, _d = ap.density_frames(_frames, axis='${axis}', nbins=${nbins}, mode='${dmode}')\n`;
          pythonCode += `    _series.append({'name': 'all', 'points': [[float(x), float(y)] for x, y in zip(_c, _d)]})\n`;
          pythonCode += `with open('${outputBase}.json', 'w') as _df:\n`;
          pythonCode += `    json.dump({'axis': '${axis}', 'mode': '${dmode}', 'series': _series}, _df)\n`;
          pythonCode += `with open('${outputBase}.dat', 'w') as _df:\n`;
          pythonCode += `    _df.write("# atomipy density along ${axis} (${dmode}, ${yUnit}) over %d frame(s)\\n" % len(_frames))\n`;
          pythonCode += `    _df.write("#" + "%13s" % '${axis}_A' + "".join("%14s" % _s['name'] for _s in _series) + "\\n")\n`;
          pythonCode += `    _ndp = len(_series[0]['points']) if _series else 0\n`;
          pythonCode += `    for _i in range(_ndp):\n`;
          pythonCode += `        _df.write(("%14.6g" % _series[0]['points'][_i][0]) + "".join("%14.6g" % _s['points'][_i][1] for _s in _series) + "\\n")\n`;
          pythonCode += `print(f"Density(${axis}, ${dmode}): {len(_series)} series x ${nbins} bins over {len(_frames)} frame(s) -> ${outputBase}.dat/.json")\n`;
          if (mode !== "strict") {
            pythonCode += `print("__PLOT_${plotTarget}__:" + json.dumps({'series': _series, 'xLabel': '${axis} (Å)', 'yLabel': '${yUnit}'}))\n`;
          }

        } else if (option === "msd") {
          const dims = ["xyz", "xy", "z", "x", "y"].includes(getString(data, "msdDims", "xyz")) ? getString(data, "msdDims", "xyz") : "xyz";
          const dt = getNumber(data, "msdDt", 1.0);
          const stride = Math.max(1, Math.round(getNumber(data, "msdOriginStride", 1)));
          const plotKind = getString(data, "msdPlot", "msd") === "dist" ? "dist" : "msd";
          const outputBase = pyEscape(getString(data, "msdOutputBase", "msd_results"));
          const typesRaw = getString(data, "msdTypes", "").split(",").map((s) => s.trim()).filter(Boolean);
          const typesPy = typesRaw.length ? `[${typesRaw.map((t) => `'${pyEscape(t)}'`).join(", ")}]` : "None";
          const dimLabel = dims === "z" ? "1D z" : dims === "xy" ? "2D xy" : "3D";

          pythonCode += `\n# MSD / diffusion (${dimLabel}; PBC-unwrapped, multi-origin restarts)\n`;
          pythonCode += framesSetup;
          pythonCode += `_msd = ap.msd(_frames, atom_types=${typesPy}, dims='${dims}', origin_stride=${stride}, dt=${dt})\n`;
          pythonCode += `_dd = ap.displacement_distribution(_frames, atom_types=${typesPy}, dims='${dims}', origin_stride=${stride})\n`;
          pythonCode += `if _msd is None:\n`;
          pythonCode += `    print("MSD: needs a trajectory with >= 3 frames and matching atom types")\n`;
          pythonCode += `else:\n`;
          pythonCode += `    print(f"MSD ${dimLabel}: {_msd['n_atoms']} atoms x {_msd['n_frames']} frames -> D = {_msd['D_A2_ps']:.4g} A^2/ps = {_msd['D_cm2_s']:.4g} cm^2/s = {_msd['D_1e9_m2_s']:.4g}e-9 m^2/s")\n`;
          pythonCode += `    with open('${outputBase}.json', 'w') as _mf:\n`;
          pythonCode += `        json.dump({'lags_ps': [float(x) for x in _msd['lags']], 'msd_A2': [float(y) for y in _msd['msd']], 'D_A2_ps': _msd['D_A2_ps'], 'D_cm2_s': _msd['D_cm2_s'], 'D_1e9_m2_s': _msd['D_1e9_m2_s'], 'dim': _msd['dim']}, _mf)\n`;
          pythonCode += `    with open('${outputBase}.dat', 'w') as _mf:\n`;
          pythonCode += `        _mf.write("# atomipy MSD (${dimLabel}); atoms=%d frames=%d\\n" % (_msd['n_atoms'], _msd['n_frames']))\n`;
          pythonCode += `        _mf.write("# D = %.6g A^2/ps = %.6g cm^2/s = %.6g e-9 m^2/s\\n" % (_msd['D_A2_ps'], _msd['D_cm2_s'], _msd['D_1e9_m2_s']))\n`;
          pythonCode += `        _mf.write("#%13s%14s\\n" % ('time_ps', 'MSD_A2'))\n`;
          pythonCode += `        for _t, _m in zip(_msd['lags'], _msd['msd']):\n`;
          pythonCode += `            _mf.write("%14.6g%14.6g\\n" % (_t, _m))\n`;
          pythonCode += `    if _dd is not None:\n`;
          pythonCode += `        with open('${outputBase}_dist.json', 'w') as _ddf:\n`;
          pythonCode += `            json.dump({'centers': [float(x) for x in _dd['centers']], 'pdf': [float(y) for y in _dd['pdf']], 'gauss': [float(y) for y in _dd['gauss']], 'sigma': _dd['sigma'], 'lag_frames': _dd['lag_frames']}, _ddf)\n`;
          pythonCode += `        with open('${outputBase}_dist.dat', 'w') as _ddf:\n`;
          pythonCode += `            _ddf.write("# atomipy displacement distribution (van Hove self-part); lag=%d frames sigma=%.6g A\\n" % (_dd['lag_frames'], _dd['sigma']))\n`;
          pythonCode += `            _ddf.write("#%13s%14s%14s\\n" % ('disp_A', 'P', 'Gaussian'))\n`;
          pythonCode += `            for _x, _p, _g in zip(_dd['centers'], _dd['pdf'], _dd['gauss']):\n`;
          pythonCode += `                _ddf.write("%14.6g%14.6g%14.6g\\n" % (_x, _p, _g))\n`;
          if (mode !== "strict") {
            if (plotKind === "dist") {
              pythonCode += `    if _dd is not None:\n`;
              pythonCode += `        print("__PLOT_${plotTarget}__:" + json.dumps({'series': [{'name': 'P(Δ)', 'points': [[float(x), float(y)] for x, y in zip(_dd['centers'], _dd['pdf'])]}, {'name': 'Gaussian', 'points': [[float(x), float(y)] for x, y in zip(_dd['centers'], _dd['gauss'])]}], 'xLabel': 'displacement (Å)', 'yLabel': 'P(Δ)'}))\n`;
            } else {
              pythonCode += `    print("__PLOT_${plotTarget}__:" + json.dumps({'series': [{'name': 'MSD (${dimLabel})', 'points': [[float(x), float(y)] for x, y in zip(_msd['lags'], _msd['msd'])]}], 'xLabel': 'time (ps)', 'yLabel': 'MSD (Å²)'}))\n`;
            }
          }

        } else if (option === "vacf") {
          const dt = getNumber(data, "vacfDt", 0.01);
          const stride = Math.max(1, Math.round(getNumber(data, "vacfOriginStride", 1)));
          const plotKind = getString(data, "vacfPlot", "spectrum") === "vacf" ? "vacf" : "spectrum";
          const outputBase = pyEscape(getString(data, "vacfOutputBase", "vacf_results"));
          const typesRaw = getString(data, "vacfTypes", "").split(",").map((s) => s.trim()).filter(Boolean);
          const typesPy = typesRaw.length ? `[${typesRaw.map((t) => `'${pyEscape(t)}'`).join(", ")}]` : "None";

          pythonCode += `\n# VACF / power spectrum / Green-Kubo D (velocities = finite difference of positions; NO trajectory velocities)\n`;
          pythonCode += framesSetup;
          pythonCode += `_vacf = ap.vacf(_frames, atom_types=${typesPy}, dt=${dt}, origin_stride=${stride})\n`;
          pythonCode += `if _vacf is None:\n`;
          pythonCode += `    print("VACF: needs a trajectory with >= 4 frames and matching atoms")\n`;
          pythonCode += `else:\n`;
          pythonCode += `    print("VACF: velocities estimated by FINITE DIFFERENCE of positions (no trajectory velocities); spectrum Nyquist limit = %.0f cm^-1 (save every few fs for vibrational modes)" % _vacf['nyquist_cm1'])\n`;
          pythonCode += `    print(f"Green-Kubo D = {_vacf['D_A2_ps']:.4g} A^2/ps = {_vacf['D_cm2_s']:.4g} cm^2/s = {_vacf['D_1e9_m2_s']:.4g}e-9 m^2/s")\n`;
          pythonCode += `    with open('${outputBase}.json', 'w') as _vf:\n`;
          pythonCode += `        json.dump({'lags_ps': [float(x) for x in _vacf['lags']], 'vacf': [float(x) for x in _vacf['vacf']], 'vacf_norm': [float(x) for x in _vacf['vacf_norm']], 'wavenumber_cm1': [float(x) for x in _vacf['wavenumber_cm1']], 'freq_thz': [float(x) for x in _vacf['freq_thz']], 'spectrum': [float(x) for x in _vacf['spectrum']], 'D_A2_ps': _vacf['D_A2_ps'], 'D_cm2_s': _vacf['D_cm2_s'], 'D_1e9_m2_s': _vacf['D_1e9_m2_s'], 'nyquist_cm1': _vacf['nyquist_cm1']}, _vf)\n`;
          pythonCode += `    with open('${outputBase}_vacf.dat', 'w') as _vf:\n`;
          pythonCode += `        _vf.write("# atomipy VACF (velocities = finite difference of positions; NO trajectory velocities)\\n")\n`;
          pythonCode += `        _vf.write("# Green-Kubo D = %.6g A^2/ps = %.6g cm^2/s = %.6g e-9 m^2/s\\n" % (_vacf['D_A2_ps'], _vacf['D_cm2_s'], _vacf['D_1e9_m2_s']))\n`;
          pythonCode += `        _vf.write("#%13s%14s%14s\\n" % ('time_ps', 'VACF', 'VACF_norm'))\n`;
          pythonCode += `        for _t, _c, _cn in zip(_vacf['lags'], _vacf['vacf'], _vacf['vacf_norm']):\n`;
          pythonCode += `            _vf.write("%14.6g%14.6g%14.6g\\n" % (_t, _c, _cn))\n`;
          pythonCode += `    with open('${outputBase}_spectrum.dat', 'w') as _vf:\n`;
          pythonCode += `        _vf.write("# atomipy VACF power spectrum (vibrational DOS); Nyquist = %.1f cm^-1\\n" % _vacf['nyquist_cm1'])\n`;
          pythonCode += `        _vf.write("# Velocities = finite difference of positions (no trajectory velocities); high freqs damped ~ sinc(w dt).\\n")\n`;
          pythonCode += `        _vf.write("#%13s%14s%14s\\n" % ('wavenum_cm1', 'freq_THz', 'intensity'))\n`;
          pythonCode += `        for _w, _f, _s in zip(_vacf['wavenumber_cm1'], _vacf['freq_thz'], _vacf['spectrum']):\n`;
          pythonCode += `            _vf.write("%14.6g%14.6g%14.6g\\n" % (_w, _f, _s))\n`;
          if (mode !== "strict") {
            if (plotKind === "vacf") {
              pythonCode += `    print("__PLOT_${plotTarget}__:" + json.dumps({'series': [{'name': 'VACF (norm)', 'points': [[float(t), float(c)] for t, c in zip(_vacf['lags'], _vacf['vacf_norm'])]}], 'xLabel': 'time (ps)', 'yLabel': 'VACF (normalized)'}))\n`;
            } else {
              pythonCode += `    print("__PLOT_${plotTarget}__:" + json.dumps({'series': [{'name': 'power spectrum', 'points': [[float(w), float(s)] for w, s in zip(_vacf['wavenumber_cm1'], _vacf['spectrum'])]}], 'xLabel': 'wavenumber (cm⁻¹)', 'yLabel': 'intensity (a.u.)'}))\n`;
            }
          }

        } else if (option === "hbond") {
          const rcut = getNumber(data, "hbondRcut", 3.5);
          const angle = getNumber(data, "hbondAngle", 30.0);
          const excl = getBoolean(data, "hbondExcludeSameMol", true) ? "True" : "False";
          const plotKind = getString(data, "hbondPlot", "dist") === "series" ? "series" : "dist";
          const outputBase = pyEscape(getString(data, "hbondOutputBase", "hbonds"));
          const listPy = (key: string) => {
            const raw = getString(data, key, "").split(",").map((s) => s.trim()).filter(Boolean);
            return raw.length ? `[${raw.map((t) => `'${pyEscape(t)}'`).join(", ")}]` : "None";
          };
          const donorsPy = listPy("hbondDonors");
          const accPy = listPy("hbondAcceptors");
          const donorResPy = listPy("hbondDonorResnames");
          const accResPy = listPy("hbondAcceptorResnames");

          pythonCode += `\n# Hydrogen-bond analysis (D...A < ${rcut} A, H-D...A <= ${angle} deg; gmx hbond convention)\n`;
          pythonCode += framesSetup;
          pythonCode += `_hb = ap.hbonds_frames(_frames, donor_types=${donorsPy}, acceptor_types=${accPy}, donor_resnames=${donorResPy}, acceptor_resnames=${accResPy}, r_cut=${rcut}, angle_cut=${angle}, exclude_same_molecule=${excl})\n`;
          pythonCode += `if _hb is None:\n`;
          pythonCode += `    print("H-bonds: no donors/acceptors found (O/N/F by element; check atom names)")\n`;
          pythonCode += `else:\n`;
          pythonCode += `    print(f"H-bonds: mean total = {_hb['mean_total']:.1f}/frame, mean per molecule = {_hb['mean_per_molecule']:.2f} over {_hb['n_frames']} frame(s) -> ${outputBase}.dat/.json")\n`;
          pythonCode += `    with open('${outputBase}.json', 'w') as _hf:\n`;
          pythonCode += `        json.dump(_hb, _hf)\n`;
          pythonCode += `    with open('${outputBase}.dat', 'w') as _hf:\n`;
          pythonCode += `        _hf.write("# atomipy H-bond per-molecule distribution; mean_total=%.3f mean_per_molecule=%.3f frames=%d\\n" % (_hb['mean_total'], _hb['mean_per_molecule'], _hb['n_frames']))\n`;
          pythonCode += `        _hf.write("#%13s%14s\\n" % ('n_hbonds', 'fraction'))\n`;
          pythonCode += `        for _k, _v in zip(_hb['dist_x'], _hb['dist_y']):\n`;
          pythonCode += `            _hf.write("%14d%14.6g\\n" % (_k, _v))\n`;
          pythonCode += `    with open('${outputBase}_timeseries.dat', 'w') as _hf:\n`;
          pythonCode += `        _hf.write("#%13s%14s\\n" % ('frame', 'n_hbonds'))\n`;
          pythonCode += `        for _i, _v in enumerate(_hb['time_series']):\n`;
          pythonCode += `            _hf.write("%14d%14d\\n" % (_i, _v))\n`;
          if (mode !== "strict") {
            if (plotKind === "series") {
              pythonCode += `    print("__PLOT_${plotTarget}__:" + json.dumps({'series': [{'name': 'H-bonds', 'points': [[float(_i), float(_v)] for _i, _v in enumerate(_hb['time_series'])]}], 'xLabel': 'frame', 'yLabel': '# H-bonds'}))\n`;
            } else {
              pythonCode += `    print("__PLOT_${plotTarget}__:" + json.dumps({'series': [{'name': 'P(n H-bonds)', 'points': [[float(_k), float(_v)] for _k, _v in zip(_hb['dist_x'], _hb['dist_y'])]}], 'xLabel': '# H-bonds per molecule', 'yLabel': 'fraction'}))\n`;
            }
          }

        } else if (option === "cn" || option === "coordinationNumber") {
          const typeA = pyEscape(getString(data, "atomTypeA", "Na"));
          const typeB = getString(data, "atomTypeB", "").trim();
          const rCut = getNumber(data, "cutoff", 3.5);
          const outputBase = pyEscape(getString(data, "cnOutputBase", "cn_results"));
          const typeBArg = typeB ? `, neighbor_types=['${pyEscape(typeB)}']` : "";

          pythonCode += `\n# Coordination Number Analysis\n`;
          pythonCode += `cn_data = ap.coordination_number(${inAtoms}, ${inBox}, cutoff=${rCut}, atom_types=['${typeA}']${typeBArg})\n`;
          pythonCode += `with open('${outputBase}.json', 'w') as _cf:\n`;
          pythonCode += `    json.dump({'coordination_numbers': cn_data}, _cf)\n`;
          pythonCode += `print(f"CN: mean={sum(cn_data)/len(cn_data):.2f}, min={min(cn_data)}, max={max(cn_data)}")\n`;

        } else if (option === "closest") {
          const typeA = pyEscape(getString(data, "atomTypeA", "Na"));
          const typeB = pyEscape(getString(data, "atomTypeB", "Cl"));
          const limit = getNumber(data, "limit", 10);
          const outputBase = pyEscape(getString(data, "closestOutputBase", "closest_results"));

          pythonCode += `\n# Closest atoms extraction\n`;
          pythonCode += `closest_data = ap.closest_atom(${inAtoms}, [${typeA}], ${inBox})\n`;
          pythonCode += `with open('${outputBase}.json', 'w') as _cf:\n`;
          pythonCode += `    json.dump(closest_data, _cf)\n`;

        } else if (option === "mindist") {
          const groupBy = getString(data, "mindistGroupBy", "molid");
          const nPairs = getNumber(data, "mindistNPairs", 10);
          const cutoff = getNumber(data, "mindistCutoff", 0);
          const outputBase = pyEscape(getString(data, "mindistOutputBase", "mindist_results"));
          const outMode = getString(data, "mindistOutputMode", "json");
          const cutoffArg = cutoff > 0 ? `, cutoff=${cutoff}` : "";

          pythonCode += `\n# Minimum inter-molecular distances\n`;
          pythonCode += `_md_results = ap.min_distances(list(${inAtoms}), ${inBox}, group_by='${groupBy}', n_pairs=${nPairs}${cutoffArg})\n`;
          pythonCode += `print(f"Min distances (group_by='${groupBy}', top ${nPairs}):")\n`;
          pythonCode += `print(f"  {'Group A':>10}  {'Group B':>10}  {'Type A':>6}  {'Type B':>6}  {'Dist (A)':>8}")\n`;
          pythonCode += `print("  " + "-"*52)\n`;
          pythonCode += `for _r in _md_results:\n`;
          pythonCode += `    print(f"  {str(_r['group_a']):>10}  {str(_r['group_b']):>10}  {_r['type_a']:>6}  {_r['type_b']:>6}  {_r['distance']:>8.2f}")\n`;
          if (outMode === "json" || outMode === "both") {
            pythonCode += `with open('${outputBase}.json', 'w') as _mf:\n`;
            pythonCode += `    json.dump(_md_results, _mf, indent=2)\n`;
          }
          if (outMode === "csv" || outMode === "both") {
            pythonCode += `with open('${outputBase}.csv', 'w') as _mc:\n`;
            pythonCode += `    _mc.write("group_a,group_b,atom_a,atom_b,type_a,type_b,distance\\n")\n`;
            pythonCode += `    for _r in _md_results:\n`;
            pythonCode += `        _mc.write(f"{_r['group_a']},{_r['group_b']},{_r['atom_a']},{_r['atom_b']},{_r['type_a']},{_r['type_b']},{_r['distance']}\\n")\n`;
          }

        } else if (option === "occupancy") {
          const ionType = pyEscape(getString(data, "ionType", "Na"));
          const rCut = getNumber(data, "rCut", 3.0);
          const outputBase = pyEscape(getString(data, "occupancyOutputBase", "occupancy_results"));

          pythonCode += `\n# Surface/Cavity occupancy analysis\n`;
          pythonCode += `occupancy_data = ap.occupancy(${inAtoms}, ${inBox}, ion_type='${ionType}', rcut=${rCut}, output_base='${outputBase}')\n`;
        }

        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }

      case "stats": {
        const statsLog = pyEscape(getString(data, "statsLogFile", "output.log"));
        pythonCode += `\n# Compute Composition Statistics\n`;
        pythonCode += `with open('${statsLog}', 'w') as _sf:\n`;
        pythonCode += `    _sf.write(f"Total atoms: {len(${inAtoms})}\\n")\n`;
        pythonCode += `    types = list(set(a['type'] for a in ${inAtoms}))\n`;
        pythonCode += `    counts = {t: sum(1 for a in ${inAtoms} if a['type'] == t) for t in types}\n`;
        pythonCode += `    for t, c in counts.items():\n`;
        pythonCode += `        _sf.write(f"Type {t}: {c}\\n")\n`;
        pythonCode += `    # Generate JSON structure count metadata for downstream plotting\n`;
        pythonCode += `    import json\n`;
        pythonCode += `    plot_payload = {'x': list(counts.keys()), 'y': list(counts.values())}\n`;
        
        if (mode === "full") {
          pythonCode += `    print("__PLOT_DATA__:${id}:" + json.dumps(plot_payload))\n`;
        }

        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "bvs": {
        const bvsLog = pyEscape(getString(data, "bvsLogFile", "bvs_summary.log"));
        const csvFile = pyEscape(getString(data, "csvFile", "bvs_results.csv"));

        pythonCode += `\n# Bond Valence Sum (BVS) Analysis\n`;
        pythonCode += `bvs_data = ap.analyze_bvs(${inAtoms}, ${inBox}, log_file='${bvsLog}', csv_file='${csvFile}')\n`;
        pythonCode += `if bvs_data and len(bvs_data) > 0:\n`;
        pythonCode += `    import json\n`;
        pythonCode += `    indices = [int(a.get('index', 1)) for a in bvs_data[:50]]\n`;
        pythonCode += `    vals = [float(a.get('bvs_val', 0.0)) for a in bvs_data[:50]]\n`;
        pythonCode += `    plot_payload = {'x': indices, 'y': vals}\n`;
        if (mode === "full") {
          pythonCode += `    print("__PLOT_DATA__:${id}:" + json.dumps(plot_payload))\n`;
        }

        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "bondAngle": {
        const rmaxH = getNumber(data, "rmaxH", 1.2);
        const rmaxM = getNumber(data, "rmaxM", 2.2);
        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "xrd": {
        const wavelength = getNumber(data, "wavelength", 1.5418);
        const thetaMin = getNumber(data, "thetaMin", 5.0);
        const thetaMax = getNumber(data, "thetaMax", 90.0);
        const hklMax = getNumber(data, "hklMax", 5);

        pythonCode += `\n# Execute Powder XRD Diffraction Simulation\n`;
        pythonCode += `xrd_pattern = ap.xrd(${inAtoms}, ${inBox}, wavelength=${wavelength}, theta_min=${thetaMin}, theta_max=${thetaMax}, hkl_max=${hklMax})\n`;
        pythonCode += `with open('xrd.dat', 'w') as _xrd:\n`;
        pythonCode += `    for twotheta, intensity in xrd_pattern:\n`;
        pythonCode += `        _xrd.write(f"{twotheta:.4f} {intensity:.4f}\\n")\n`;
        pythonCode += `import json\n`;
        pythonCode += `plot_payload = {'x': [float(p[0]) for p in xrd_pattern], 'y': [float(p[1]) for p in xrd_pattern]}\n`;
        if (mode === "full") {
          pythonCode += `print("__PLOT_DATA__:${id}:" + json.dumps(plot_payload))\n`;
        }

        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "chemistry": {
        const chemMode = getString(data, "mode", "substitute");
        if (chemMode === "substitute") {
          const numOct = getNumber(data, "numOct", 0);
          const o1 = pyEscape(getString(data, "o1", "Al"));
          const o2 = pyEscape(getString(data, "o2", "Mgo"));
          const mo2 = getNumber(data, "minO2Dist", 5.5);
          const numTet = getNumber(data, "numTet", 0);
          const t1 = pyEscape(getString(data, "t1", "Si"));
          const t2 = pyEscape(getString(data, "t2", "Alt"));
          const mt2 = getNumber(data, "minT2Dist", 5.5);
          const dim = getNumber(data, "dimension", 3);
          const loLim = getOptionalNumber(data, "loLimit") ?? -1e9;
          const hiLim = getOptionalNumber(data, "hiLimit") ?? 1e9;

          pythonCode += `${blockOutAtoms}, ${blockOutBox}, _ = ap.substitute(${inAtoms}, ${inBox}, num_oct_subst=${numOct}, o1_type='${o1}', o2_type='${o2}', min_o2o2_dist=${mo2}, num_tet_subst=${numTet}, t1_type='${t1}', t2_type='${t2}', min_t2t2_dist=${mt2}, lo_limit=${loLim}, hi_limit=${hiLim}, dimension=${dim})\n`;
        } else if (chemMode === "fuse") {
          const rmax = getNumber(data, "rmax", 0.5);
          const criteria = pyEscape(getString(data, "criteria", "average"));
          pythonCode += `${blockOutAtoms} = ap.fuse_atoms(${inAtoms}, ${inBox}, rmax=${rmax}, criteria='${criteria}')\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (chemMode === "addH") {
          const delta = getNumber(data, "deltaThreshold", -0.5);
          const maxAdd = getNumber(data, "maxAdditions", 10);
          const bondLen = getNumber(data, "bondLength", 0.96);
          pythonCode += `${blockOutAtoms} = ap.add_hydrogens_bvs(${inAtoms}, ${inBox}, delta_threshold=${delta}, max_additions=${maxAdd}, bond_length=${bondLen})\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else {
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "atomProps":
      case "atomProperties": {
        const applyElement = getBoolean(data, "applyElement", true);
        const applyMass = getBoolean(data, "applyMass", false);
        const applyFormalCharges = getBoolean(data, "applyFormalCharges", false);
        const computeCom = getBoolean(data, "computeCom", false);

        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        if (applyElement) {
          pythonCode += `${blockOutAtoms} = ap.element(${blockOutAtoms})\n`;
        }
        if (applyMass) {
          pythonCode += `${blockOutAtoms} = ap.set_atomic_masses(${blockOutAtoms})\n`;
        }
        if (applyFormalCharges) {
          pythonCode += `${blockOutAtoms} = ap.assign_formal_charges(${blockOutAtoms})\n`;
        }
        if (computeCom) {
          const comLogFile = pyEscape(getString(data, "comLogFile", "com_report.json"));
          pythonCode += `\n# Center of mass calculation\n`;
          pythonCode += `com_data = ap.com(${blockOutAtoms})\n`;
          pythonCode += `with open('${comLogFile}', 'w') as _cf:\n`;
          pythonCode += `    json.dump({'x': float(com_data[0]), 'y': float(com_data[1]), 'z': float(com_data[2])}, _cf)\n`;
        }

        pythonCode += `${blockOutBox} = ${inBox}\n`;
        pythonCode += carryTopo(blockOutAtoms, inAtoms);   // annotations preserve atoms → keep topology
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "trajectory": {
        const trajFile = inTraj !== undefined ? inTraj : `'trajectory.pdb'`;
        const frameIndex = getNumber(data, "frameIndex", 0);
        const extractMode = getBoolean(data, "extractMode", false);

        if (extractMode) {
          pythonCode += `\n# Extract single coordinate frame from simulation trajectory\n`;
          pythonCode += `try:\n`;
          pythonCode += `    print(f"Extracting frame {${frameIndex}} from trajectory {${trajFile}}...")\n`;
          pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = ap.import_auto(${trajFile})\n`;
          pythonCode += `    # Select individual snapshot coordinate set (each frame has len(atoms) items)\n`;
          pythonCode += `    num_atoms_per_frame = len(ap.import_auto(${inAtoms})[0]) if ${inAtoms} else 0\n`;
          pythonCode += `    if num_atoms_per_frame > 0 and len(${blockOutAtoms}) >= (num_atoms_per_frame * (${frameIndex} + 1)):\n`;
          pythonCode += `        ${blockOutAtoms} = ${blockOutAtoms}[num_atoms_per_frame * ${frameIndex} : num_atoms_per_frame * (${frameIndex} + 1)]\n`;
          pythonCode += `except Exception as extract_err:\n`;
          pythonCode += `    print(f"Frame extraction failed, fallback to standard coordinates: {extract_err}")\n`;
          pythonCode += `    ${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `    ${blockOutBox} = ${inBox}\n`;
        } else {
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "organic": {
        const smiles = pyEscape(getString(data, "smiles", ""));
        const ff = pyEscape(getString(data, "forcefield", "gaff-2.11"));
        const inputMode = getString(data, "inputMode", "smiles");
        const uploadPath = pyEscape(getString(data, "uploadedFilePath", ""));
        const libraryMol = pyEscape(getString(data, "libraryMolecule", ""));
        const isLibrary = (inputMode === "library" || !!libraryMol) && !!libraryMol;
        const libSdf = `${organicBasename(n)}.sdf`;

        if (isLibrary) {
          pythonCode += `# Organic molecule from bundled library: ${libraryMol}\n`;
          pythonCode += `_lib_${blockOutAtoms}, _ = ap.load_molecule('${libraryMol}')\n`;
          pythonCode += `ap.write_sdf(_lib_${blockOutAtoms}, '${libSdf}')\n`;
        }

        pythonCode += `\n# Parametrize Organic Molecule\n`;
        pythonCode += `try:\n`;
        if (isLibrary) {
          pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_file('${libSdf}', version='${ff}', basename='${organicBasename(n)}')\n`;
        } else if (inputMode === "file" && uploadPath) {
          pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_file('${uploadPath}', version='${ff}', basename='${organicBasename(n)}')\n`;
        } else {
          pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_gaff('${smiles}', version='${ff}', basename='${organicBasename(n)}')\n`;
        }
        pythonCode += `except Exception as e:\n`;
        pythonCode += `    print(f"Failed to parametrize organic molecule: {e}")\n`;
        pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = [], None\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "plot": {
        pythonCode += `# Plot Node (${id}) is active downstream\n`;
        break;
      }
      case "inspect": {
        // Snapshot of the variables visible here + files in the working dir at this point.
        if (mode !== "strict") {
          pythonCode += `\n# Inspector (${id}): report current variables + files\n`;
          pythonCode += `import os as _os, json as _json\n`;
          pythonCode += `_insp = {}\n`;
          pythonCode += `try:\n`;
          pythonCode += `    _ia = ${inAtoms}\n`;
          pythonCode += `    if _ia is not None and len(_ia):\n`;
          pythonCode += `        from collections import Counter as _Cnt\n`;
          pythonCode += `        _insp['atoms'] = {'count': len(_ia), 'types': dict(_Cnt(a.get('type') for a in _ia)), 'has_charge': any('charge' in a for a in _ia), 'has_element': any(a.get('element') for a in _ia)}\n`;
          pythonCode += `    else:\n`;
          pythonCode += `        _insp['atoms'] = None\n`;
          pythonCode += `except Exception as _e:\n`;
          pythonCode += `    _insp['atoms'] = f'error: {_e}'\n`;
          pythonCode += `try:\n`;
          pythonCode += `    _ib = ${inBox}\n`;
          pythonCode += `    _insp['box'] = [float(x) for x in _ib] if _ib is not None else None\n`;
          pythonCode += `except Exception:\n`;
          pythonCode += `    _insp['box'] = None\n`;
          pythonCode += `try:\n`;
          pythonCode += `    _insp['topology'] = {'has_itp': getattr(${inAtoms}, 'itp', None) is not None, 'top_path': getattr(${inAtoms}, '_top_path', None), 'defines': getattr(${inAtoms}, '_defines', None)}\n`;
          pythonCode += `except Exception:\n`;
          pythonCode += `    _insp['topology'] = None\n`;
          if (inTraj !== undefined) {
            pythonCode += `try:\n`;
            pythonCode += `    _tp = ${inTraj}\n`;
            pythonCode += `    _tr = {'path': _tp, 'exists': bool(isinstance(_tp, str) and _os.path.isfile(_tp))}\n`;
            pythonCode += `    if _tr['exists'] and str(_tp).lower().endswith('.pdb'):\n`;
            pythonCode += `        with open(_tp, 'r', encoding='utf-8', errors='replace') as _tf:\n`;
            pythonCode += `            _tr['frames'] = sum(1 for _l in _tf if _l.startswith('MODEL'))\n`;
            pythonCode += `    _insp['traj'] = _tr\n`;
            pythonCode += `except Exception:\n`;
            pythonCode += `    _insp['traj'] = None\n`;
          }
          pythonCode += `try:\n`;
          pythonCode += `    _insp['files'] = [{'name': _f, 'size': _os.path.getsize(_f)} for _f in sorted(_os.listdir('.')) if _os.path.isfile(_f)]\n`;
          pythonCode += `except Exception:\n`;
          pythonCode += `    _insp['files'] = []\n`;
          pythonCode += `print("__INSPECT_${id}__:" + _json.dumps(_insp))\n`;
        }
        // Pass-through so the Inspector can sit mid-graph.
        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        pythonCode += carryTopo(blockOutAtoms, inAtoms);
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox, traj: inTraj });
        break;
      }
      case "viewer": {
        // Generate PDB snapshot for the frontend viewer
        const writeConect = "True";
        pythonCode += `import io, json, os\n`;
        pythonCode += `if ${inAtoms} is not None:\n`;
        pythonCode += `    _temp_atoms = list(${inAtoms}) if ${inAtoms} else []\n`;
        pythonCode += `    if not _temp_atoms:\n`;
        pythonCode += `        _temp_atoms = [{'index': 1, 'x': 0.0, 'y': 0.0, 'z': 0.0, 'element': 'C', 'type': 'C', 'fftype': 'C', 'resname': 'DUM', 'molid': 1, 'charge': 0.0}]\n`;
        if (inTraj) {
          pythonCode += `    _traj_file = ${inTraj}\n`;
          pythonCode += `    _no_water_file = _traj_file.replace('.pdb', '_no_water.pdb')\n`;
          pythonCode += `    if os.path.exists(_no_water_file):\n`;
          pythonCode += `        # Only use the no-water trajectory if it actually has atoms — for a PURE\n`;
          pythonCode += `        # WATER system it is empty (everything is water), which would make the\n`;
          pythonCode += `        # viewer render a blank/atomless trajectory. Fall back to the full file.\n`;
          pythonCode += `        try:\n`;
          pythonCode += `            with open(_no_water_file, 'r', encoding='utf-8', errors='replace') as _nwf:\n`;
          pythonCode += `                _nw_has_atoms = any(_l.startswith(('ATOM', 'HETATM')) for _l in _nwf)\n`;
          pythonCode += `        except Exception:\n`;
          pythonCode += `            _nw_has_atoms = False\n`;
          pythonCode += `        if _nw_has_atoms:\n`;
          pythonCode += `            _traj_file = _no_water_file\n`;
          pythonCode += `    if os.path.exists(_traj_file):\n`;
          pythonCode += `        # errors='replace': trajectory PDBs (e.g. from gmx trjconv) can carry a\n`;
          pythonCode += `        # stray non-UTF8 byte in a title/remark; never let the viewer crash on it.\n`;
          pythonCode += `        with open(_traj_file, 'r', encoding='utf-8', errors='replace') as _f:\n`;
          pythonCode += `            _vis_pdb_content = _f.read()\n`;
          pythonCode += `        # Downsample PDB models if there are too many (max 10 models to prevent SSE crash)\n`;
          pythonCode += `        _models = []\n`;
          pythonCode += `        _curr_model = []\n`;
          pythonCode += `        _in_model = False\n`;
          pythonCode += `        _lines = _vis_pdb_content.splitlines()\n`;
          pythonCode += `        _has_models = any(l.startswith('MODEL') for l in _lines)\n`;
          pythonCode += `        if _has_models:\n`;
          pythonCode += `            for _l in _lines:\n`;
          pythonCode += `                if _l.startswith('MODEL'):\n`;
          pythonCode += `                    _in_model = True\n`;
          pythonCode += `                    _curr_model = [_l]\n`;
          pythonCode += `                elif _l.startswith('ENDMDL'):\n`;
          pythonCode += `                    _curr_model.append(_l)\n`;
          pythonCode += `                    _models.append(_curr_model)\n`;
          pythonCode += `                    _in_model = False\n`;
          pythonCode += `                elif _in_model:\n`;
          pythonCode += `                    _curr_model.append(_l)\n`;
          pythonCode += `            \n`;
          pythonCode += `            # Cap frames sent to the viewer: the trajectory is inlined in a single SSE\n`;
          pythonCode += `            # message, so too many frames stall the browser/stream on large systems.\n`;
          pythonCode += `            # This only downsamples the in-browser ANIMATION — the full trajectory is\n`;
          pythonCode += `            # written to disk and included in the downloadable bundle unchanged.\n`;
          pythonCode += `            _max_out_models = 100\n`;
          pythonCode += `            if len(_models) > _max_out_models:\n`;
          pythonCode += `                _keep_indices = sorted(set(int(i * (len(_models) - 1) / (_max_out_models - 1)) for i in range(_max_out_models)))\n`;
          pythonCode += `                _models = [_models[_idx] for _idx in _keep_indices]\n`;
          pythonCode += `            \n`;
          pythonCode += `            print(f"Preparing trajectory for the viewer ({len(_models)} frames)...", flush=True)\n`;
          pythonCode += `            _vis_pdb_str = '\\\\\\\\n'.join('\\\\\\\\n'.join(_m) for _m in _models)\n`;
          pythonCode += `        else:\n`;
          pythonCode += `            _vis_pdb_str = _vis_pdb_content.replace('\\n', '\\\\n')\n`;
          pythonCode += `    else:\n`;
          pythonCode += `        _vis_buf = io.StringIO()\n`;
          pythonCode += `        ap.write_pdb(_temp_atoms, ${inBox}, _vis_buf, write_conect=${writeConect})\n`;
          pythonCode += `        _vis_pdb_str = _vis_buf.getvalue().replace('\\n', '\\\\n')\n`;
        } else {
          pythonCode += `    _vis_buf = io.StringIO()\n`;
          pythonCode += `    ap.write_pdb(_temp_atoms, ${inBox}, _vis_buf, write_conect=${writeConect})\n`;
          pythonCode += `    _vis_pdb_str = _vis_buf.getvalue().replace('\\n', '\\\\n')\n`;
        }
        pythonCode += `    print(f"__VISUALIZE_${id}__:{_vis_pdb_str}")\n`;
        pythonCode += `    # Stream raw high-precision charges for labeling\n`;
        pythonCode += `    _vis_charges = [a.get('charge', 0) for a in _temp_atoms]\n`;
        pythonCode += `    print(f"__CHARGES_${id}__:{json.dumps(_vis_charges)}")\n`;
        stateVars.set(id, { atoms: inAtoms, box: inBox, traj: inTraj });
        break;
      }
      case "export": {
        const outName = pyEscape(getString(data, "outputName", "system"));
        const structFmt = pyEscape(getString(data, "structureFormat", "pdb"));
        const topFmt = pyEscape(getString(data, "topologyFormat", "none"));
        // Walk upstream depth-first, visiting each node's inputs in handle order
        // (in1 before in2 …) so the FIRST-connected branch of a Join/Add node takes
        // precedence — e.g. an inorganic structure wired to in1 wins over an organic
        // one on in2.
        const orderedParents = (nodeId: string) =>
          edges.filter(e => e.target === nodeId)
               .sort((a, b) => String(a.targetHandle ?? "").localeCompare(String(b.targetHandle ?? "")));
        const findUpstreamForcefield = (startId: string): string => {
          const visited = new Set<string>();
          const dfs = (nodeId: string): string | null => {
            if (visited.has(nodeId)) return null;
            visited.add(nodeId);
            for (const edge of orderedParents(nodeId)) {
              const p = nodeMap.get(edge.source);
              if (!p) continue;
              if (p.type === "forcefield") return getString(p.data, "forcefield", "minff");
              const found = dfs(p.id);
              if (found !== null) return found;
            }
            return null;
          };
          return dfs(startId) ?? "minff";
        };
        // Resolve the INORGANIC (MINFF/CLAYFF) forcefield node specifically. A mixed
        // mineral+organic graph also has an organic forcefield node, so a plain BFS
        // "first forcefield" could read the mineral Ka/variant off the organic node.
        const findUpstreamMineralFF = (startId: string): Record<string, unknown> | null => {
          const visited = new Set<string>();
          const dfs = (nodeId: string): Record<string, unknown> | null => {
            if (visited.has(nodeId)) return null;
            visited.add(nodeId);
            for (const edge of orderedParents(nodeId)) {
              const p = nodeMap.get(edge.source);
              if (!p) continue;
              if (p.type === "forcefield") {
                const ff = getString(p.data, "forcefield", "minff");
                if (ff === "minff" || ff === "clayff") return p.data as Record<string, unknown>;
              }
              const found = dfs(p.id);
              if (found !== null) return found;
            }
            return null;
          };
          return dfs(startId);
        };
        // Water model comes from the Solvate/Solvent node (independent of any
        // Forcefield node) so pure-water, organic and mineral systems all pick it
        // the same way. Falls back to a sensible default per FF family.
        const findUpstreamWaterModel = (startId: string, ffType: string): string => {
          const visited = new Set<string>();
          const queue = [startId];
          while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);
            const parentEdges = edges.filter(e => e.target === current);
            for (const edge of parentEdges) {
              const parentNode = nodeMap.get(edge.source);
              if (parentNode) {
                if (parentNode.type === "solvent") {
                  const v = getString(parentNode.data, "waterModel", "");
                  if (v) return v.toUpperCase();  // match FF block names (SPCE, OPC3, TIP4PEW…)
                }
                queue.push(parentNode.id);
              }
            }
          }
          return ffType === "clayff" ? "SPCE" : "OPC3";
        };
        // Ion-pair parameter set comes from the Ions node (independent of any
        // Forcefield node). Falls back to a sensible default per FF family.
        const findUpstreamIonSet = (startId: string, ffType: string): string => {
          const visited = new Set<string>();
          const queue = [startId];
          while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);
            const parentEdges = edges.filter(e => e.target === current);
            for (const edge of parentEdges) {
              const parentNode = nodeMap.get(edge.source);
              if (parentNode) {
                if (parentNode.type === "ions" || parentNode.type === "addIons" || parentNode.type === "grid") {
                  const v = getString(parentNode.data, "ionSet", "");
                  if (v) return v;
                }
                queue.push(parentNode.id);
              }
            }
          }
          return ffType === "clayff" ? "HFE_LM" : "IOD_LM";
        };
        const upstreamFF = findUpstreamForcefield(id);
        // Mineral FF + angle Ka come from the inorganic (MINFF/CLAYFF) node, not the
        // first forcefield found (a mixed graph also has an organic forcefield node).
        const mineralFFData = findUpstreamMineralFF(id);
        const mineralFF = mineralFFData ? getString(mineralFFData, "forcefield", "minff") : "minff";
        const minffVariant = mineralFFData ? getString(mineralFFData, "minffVariant", "500") : "500";
        const clayffAngles = mineralFFData ? getString(mineralFFData, "clayffAngles", "none") : "none";
        // CLAYFF defaults to no angles; MINFF "none" also omits angles (and still
        // needs a nonbonded block → GMINFF_k0).
        const writeAngles = mineralFF === "clayff" ? (clayffAngles !== "none") : (minffVariant !== "none");
        const minffDefineVariant = minffVariant === "none" ? "0" : minffVariant;
        // atomipy's angle model: scanned θ0 for metal O-M-O/M-O-M at KANGLE, standard
        // M-O-H, all angles dropped when "none". Ka from the inorganic FF node.
        const mineralKangle = writeAngles ? Number(mineralFF === "clayff" ? clayffAngles : minffVariant) : 0;
        const waterModel = findUpstreamWaterModel(id, upstreamFF);
        const ionSet = findUpstreamIonSet(id, upstreamFF);
        const ffVariant = mineralFF === "clayff" ? "CLAYFF_EXT" : `GMINFF_k${minffDefineVariant}`;
        const waterLower = waterModel.toLowerCase();
        const waterUpper = waterModel.toUpperCase();
        const ionCombine = `${waterModel}_${ionSet}`;
        // The Export node carries its own angle-terms choice (matching the
        // atomipy-topology-generator): it drives explicit_angles / KANGLE /
        // max_angle and the mineral nonbonded block for the exported files.
        // Defaults to the upstream forcefield's Ka when unset.
        const exportAngleTerms = getString(data, "angleTerms", writeAngles ? String(mineralKangle) : "none");
        const exportNoAngles = exportAngleTerms === "none";
        const exportKangle = exportNoAngles ? 0 : (Number(exportAngleTerms) || 0);
        const exportExplicit = exportNoAngles ? 0 : 1;
        const exportMaxAngle = exportNoAngles ? "0.0" : "None";
        const exportVariant = exportNoAngles ? "0" : exportAngleTerms;
        const exportFfVariant = mineralFF === "clayff" ? "CLAYFF_EXT" : `GMINFF_k${exportVariant}`;
        const exportAngleKaPy = exportNoAngles ? "None" : String(exportKangle);
        // LAMMPS Pair Coeffs blocks (gminff_all.json): mineral + ion + water.
        const lmpMineralBlock = mineralFF === "clayff" ? "CLAYFF_2004" : `GMINFF_k${exportVariant}`;

        pythonCode += `\n# Export Final System Coordinate and Topology Outputs\n`;

        // --- Structure file (all supported coordinate formats) ---
        if (structFmt === "pdb") {
          const conect = getBoolean(data, "writeConect", false) ? "True" : "False";
          const elem = getBoolean(data, "writeElement", true) ? "True" : "False";
          pythonCode += `ap.write_pdb(list(${inAtoms}), ${inBox}, '${outName}.pdb', write_conect=${conect}, write_element=${elem})\n`;
        } else if (structFmt === "gro") {
          pythonCode += `ap.write_gro(list(${inAtoms}), ${inBox}, '${outName}.gro')\n`;
        } else if (structFmt === "cif") {
          const cifTitle = pyEscape(getString(data, "cifTitle", "Generated by atomipy"));
          pythonCode += `ap.write_cif(list(${inAtoms}), ${inBox}, '${outName}.cif', title='${cifTitle}')\n`;
        } else if (structFmt === "xyz") {
          pythonCode += `ap.write_xyz(list(${inAtoms}), ${inBox}, '${outName}.xyz')\n`;
        } else if (structFmt === "pqr") {
          pythonCode += `ap.write_pqr(list(${inAtoms}), ${inBox}, '${outName}.pqr')\n`;
        } else if (structFmt === "poscar") {
          pythonCode += `ap.write_poscar(list(${inAtoms}), ${inBox}, '${outName}.poscar')\n`;
        } else if (structFmt === "sdf") {
          pythonCode += `ap.write_sdf(list(${inAtoms}), '${outName}.sdf')\n`;
        }

        // --- Topology file ---
        if (topFmt === "itp" || topFmt === "lmp" || topFmt === "psf") {
          pythonCode += `from atomipy.classify import classify_atom as _classify\n`;
        }

        if (topFmt === "itp") {
          // GROMACS: a full, self-contained .top via the proven write_merged_top
          // (mineral inline + #include water/ions + #include organic_GMX.itp when
          // present), PLUS a modular .itp for the inorganic part. The mineral itp
          // is built from mineral atoms ONLY (water/ions handled via includes) —
          // mirrors the Simulate reconstruct path.
          pythonCode += `_solvent_ion_res = {'SOL','WAT','HOH','TIP3','OPC','OPC3','SPC','SPCE','TIP4','TIP5','ION','NA','CL','K','LI','CS','RB','F','BR','I','CA','MG','ZN','NA+','CL-','K+','CA2+','MG2+','ZN2+'}\n`;
          pythonCode += `_exp_dummy = bool([a for a in ${inAtoms} if a.get('_dummy_type')])\n`;
          pythonCode += `_org_itps = []\n`;
          pythonCode += `if hasattr(${inAtoms}, 'itp') and ${inAtoms}.itp is not None:\n`;
          pythonCode += `    _exp_itp = ${inAtoms}.itp\n`;
          pythonCode += `    for _k, _v in _exp_itp.items():\n`;
          pythonCode += `        if _k.startswith('_source_itp') and _v:\n`;
          pythonCode += `            _bn = str(_v).replace('\\\\', '/').split('/')[-1]\n`;
          pythonCode += `            if _bn not in _org_itps: _org_itps.append(_bn)\n`;
          pythonCode += `elif _exp_dummy:\n`;
          pythonCode += `    _exp_itp = None\n`;
          pythonCode += `else:\n`;
          pythonCode += `    _mineral_atoms = [a for a in ${inAtoms} if str(a.get('resname','')).upper() not in _solvent_ion_res]\n`;
          pythonCode += `    if _mineral_atoms:\n`;
          pythonCode += `        _, _exp_itp, _ = ap.merge_top({'atoms': _mineral_atoms, 'itp': None, 'box': ${inBox}})\n`;
          pythonCode += `    else:\n`;
          pythonCode += `        _exp_itp = {'_original_itps': [], 'atomtypes': {}, '_component_labels': ['Solvent/Ions']}\n`;
          pythonCode += `if _exp_dummy:\n`;
          pythonCode += `    # Frozen Dummy FF: self-contained bond-free .top (matches the Simulate path).\n`;
          pythonCode += `    ap.write_dummy_system_top(list(${inAtoms}), ${inBox}, '${outName}.top', '${outName}.gro', water_model='${waterLower}', organic_itps=_org_itps or None)\n`;
          pythonCode += `    print("Export: frozen Dummy-FF topology written (qualitative; EM/NVT only).")\n`;
          pythonCode += `else:\n`;
          pythonCode += `    ap.write_merged_top(list(${inAtoms}), _exp_itp, ${inBox}, '${outName}.top', '${outName}.gro', minff_variant='${exportFfVariant}', water_model='${waterLower}', ion_model='${ionCombine}', organic_itps=_org_itps or None, angle_ka=${exportAngleKaPy}, mol_counts_override=getattr(${inAtoms}, '_mol_counts_override', None))\n`;
          pythonCode += `    _inorg = [a for a in list(${inAtoms}) if _classify(a) != 'organic']\n`;
          pythonCode += `    if _inorg:\n`;
          pythonCode += `        ap.write_itp(_inorg, ${inBox}, '${outName}.itp', explicit_angles=${exportExplicit}, KANGLE=${exportKangle}, max_angle=${exportMaxAngle})\n`;
        } else if (topFmt === "lmp") {
          // LAMMPS .data: inorganic-only (mineral + ions + water).
          pythonCode += `_inorg = [a for a in list(${inAtoms}) if _classify(a) != 'organic']\n`;
          pythonCode += `_n_org = len(list(${inAtoms})) - len(_inorg)\n`;
          pythonCode += `if _n_org: print(f"Export: LAMMPS .data is inorganic-only; {_n_org} organic atom(s) excluded (use the GROMACS .top for organics).")\n`;
          pythonCode += `_ffp = None\n`;
          pythonCode += `for _blocks in (['${lmpMineralBlock}', '${ionCombine}', '${waterUpper}'], ['${lmpMineralBlock}', '${waterUpper}'], ['${lmpMineralBlock}']):\n`;
          pythonCode += `    try:\n`;
          pythonCode += `        _ffp = ap.load_forcefield('GMINFF/gminff_all.json', blocks=_blocks); break\n`;
          pythonCode += `    except Exception:\n`;
          pythonCode += `        continue\n`;
          pythonCode += `if _ffp is None: print("Export: could not load LAMMPS Pair Coeffs; writing .data without them.")\n`;
          pythonCode += `ap.write_lmp(_inorg, Box=${inBox}, file_path='${outName}.data', forcefield=_ffp, KANGLE=${exportKangle}, max_angle=${exportMaxAngle})\n`;
        } else if (topFmt === "psf") {
          // NAMD/OpenMM .psf: inorganic-only (mineral + ions + water).
          pythonCode += `_inorg = [a for a in list(${inAtoms}) if _classify(a) != 'organic']\n`;
          pythonCode += `_n_org = len(list(${inAtoms})) - len(_inorg)\n`;
          pythonCode += `if _n_org: print(f"Export: NAMD .psf is inorganic-only; {_n_org} organic atom(s) excluded.")\n`;
          pythonCode += `ap.write_psf(_inorg, Box=${inBox}, file_path='${outName}.psf', max_angle=${exportMaxAngle})\n`;
        }

        // Optional: topology-graph JSON for the viewer (guarded — never breaks the export).
        if (topFmt !== "none") {
          pythonCode += `try:\n`;
          pythonCode += `    import atomipy.write_topology as _awtop\n`;
          pythonCode += `    from atomipy.topology import build_topology_from_atoms as _bt\n`;
          pythonCode += `    _hub = _bt([a for a in list(${inAtoms}) if _classify(a) != 'organic'], ${inBox}, KANGLE=${exportKangle}, max_angle=${exportMaxAngle})\n`;
          pythonCode += `    _awtop.write_json(_hub, '${outName}_topology.json')\n`;
          pythonCode += `except Exception as _e:\n`;
          pythonCode += `    print(f"Export: topology-graph JSON skipped ({_e}).")\n`;
        }
        break;
      }
      default:
        pythonCode += `# Warning: Unrecognized node type '${opType}'\n`;
        break;
    }

    if (mode === "full") {
      pythonCode += `print("__NODE_SUCCESS__:${opIdEscaped}")\n`;
    }
  });

  return pythonCode;
}
