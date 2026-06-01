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
          const upFilename = pyEscape(getString(data, "filename", "uploaded.pdb"));
          pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'uploads/${upFilename}')\n`;
        } else if (source === "preset") {
          const file = pyEscape(getString(data, "value", "unknown.pdb"));
          pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'UC_conf/${file}')\n`;
        } else {
          // source === "organic" (SMILES or organic file)
          const smiles = pyEscape(getString(data, "smiles", ""));
          const inputMode = getString(data, "inputMode", "smiles");
          const uploadPath = pyEscape(getString(data, "uploadedFilePath", ""));

          // Defer parametrization only if the organic node is directly connected to a forcefield node.
          // If there are intermediate nodes (like System Box, Spatial Ops, etc.), we must parameterize immediately
          // so those nodes receive valid coordinates instead of raw SMILES strings.
          const hasDirectForcefield = edges.some(
            (e) => e.source === id && nodeMap.get(e.target)?.type === "forcefield"
          );
          const hasDownstreamFF = hasDirectForcefield;

          if (hasDownstreamFF) {
            pythonCode += `# Organic structure definition (parameterized downstream in Forcefield node)\n`;
            if (inputMode === "file" && uploadPath) {
              pythonCode += `${blockOutAtoms} = "${uploadPath}"\n`;
            } else {
              pythonCode += `${blockOutAtoms} = "${smiles}"\n`;
            }
            pythonCode += `${blockOutBox} = None\n`;
          } else {
            pythonCode += `\n# Parametrize Organic Molecule (Fallback / Standalone)\n`;
            pythonCode += `try:\n`;
            if (inputMode === "file" && uploadPath) {
              pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_file('${uploadPath}', version='gaff-2.11')\n`;
            } else {
              pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_gaff('${smiles}', version='gaff-2.11')\n`;
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
        const upFilename = pyEscape(getString(data, "filename", "uploaded.pdb"));
        pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'uploads/${upFilename}')\n`;
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
            pythonCode += `        # Reorder molids sequentially across list branches\n`;
            pythonCode += `        curr_molid = 1\n`;
            pythonCode += `        for branch_atoms in _list_branches:\n`;
            pythonCode += `            if not branch_atoms: continue\n`;
            pythonCode += `            m_ids = sorted(list(set(a.get('molid', 1) for a in branch_atoms)))\n`;
            pythonCode += `            m_map = {old: curr_molid + i for i, old in enumerate(m_ids)}\n`;
            pythonCode += `            for a in branch_atoms: a['molid'] = m_map.get(a.get('molid', 1), curr_molid)\n`;
            pythonCode += `            curr_molid += len(m_ids)\n`;
          }
          pythonCode += `        _inorganic_combined = ap.update(*_list_branches, force=True)\n`;
          if (customMolid !== undefined || customResname) {
            const molidArg = customMolid !== undefined ? `, molid=${customMolid}` : "";
            const resArg = customResname ? `, resname='${customResname}'` : "";
            pythonCode += `        _inorganic_combined = ap.molecule(_inorganic_combined${molidArg}${resArg})\n`;
          }
          pythonCode += `    else:\n`;
          pythonCode += `        _inorganic_combined = []\n`;
          pythonCode += `    \n`;
          pythonCode += `    _temp_mixed = _inorganic_combined\n`;
          pythonCode += `    for _ob in _organic_branches:\n`;
          pythonCode += `        _temp_mixed = ap.mix_systems(_temp_mixed, _ob, box=${gatheredStates[0].box})\n`;
          pythonCode += `    ${blockOutAtoms} = _temp_mixed\n`;
          pythonCode += `    ${blockOutBox} = ${gatheredStates[0].box}\n`;
          pythonCode += `else:\n`;
          if (reorder) {
            pythonCode += `    # Reorder molids sequentially across joined branches\n`;
            pythonCode += `    curr_molid = 1\n`;
            pythonCode += `    for branch_atoms in [${atomArgs}]:\n`;
            pythonCode += `        if not branch_atoms: continue\n`;
            pythonCode += `        m_ids = sorted(list(set(a.get('molid', 1) for a in branch_atoms)))\n`;
            pythonCode += `        m_map = {old: curr_molid + i for i, old in enumerate(m_ids)}\n`;
            pythonCode += `        for a in branch_atoms: a['molid'] = m_map.get(a.get('molid', 1), curr_molid)\n`;
            pythonCode += `        curr_molid += len(m_ids)\n`;
            pythonCode += `    ${blockOutAtoms} = ap.update(${atomArgs}, force=True) # Refresh combined list\n`;
          } else {
            pythonCode += `    ${blockOutAtoms} = ap.update(${atomArgs}, force=True)\n`;
          }
          if (customMolid !== undefined || customResname) {
            const molidArg = customMolid !== undefined ? `, molid=${customMolid}` : "";
            const resArg = customResname ? `, resname='${customResname}'` : "";
            pythonCode += `    ${blockOutAtoms} = ap.molecule(${blockOutAtoms}${molidArg}${resArg})\n`;
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

        if (inputMode === "box_dim") {
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
        const keepMolid = getBoolean(data, "keepMolid", true) ? "True" : "False";
        const keepResname = getBoolean(data, "keepResname", true) ? "True" : "False";
        const renumberIndex = getBoolean(data, "renumberIndex", true) ? "True" : "False";
        pythonCode += `${blockOutAtoms}, ${blockOutBox}, _ = ap.replicate_system(${inAtoms}, ${inBox}, replicate=[${nx}, ${ny}, ${nz}], keep_molid=${keepMolid}, keep_resname=${keepResname}, renumber_index=${renumberIndex})\n`;
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
        break;
      }
      case "bend": {
        const radius = getNumber(data, "radius", 50);
        pythonCode += `${blockOutAtoms} = ap.bend(${inAtoms}, ${radius})\n`;
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
          const upFilename = pyEscape(getString(data, "filename", "uploaded.pdb"));
          pythonCode += `${templateAtoms}, _ = ap.import_auto(f'uploads/${upFilename}')\n`;
        } else {
          const file = pyEscape(getString(data, "value", "unknown.pdb"));
          pythonCode += `${templateAtoms}, _ = ap.import_auto(f'UC_conf/${file}')\n`;
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
        pythonCode += `${blockOutAtoms} = ap.solvate(limits=${inBox}, Box=${inBox}, density=${dens}, min_distance=${spacing}, solute_atoms=${inAtoms}, solvent_type='${model}', include_solute=True)\n`;
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
        } else {
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "PBC":
      case "pbc": {
        const wrapMode = getString(data, "wrapMode", "atoms");
        if (wrapMode === "molecule" || wrapMode === "molecules") {
          pythonCode += `${blockOutAtoms} = ap.wrap(${inAtoms}, ${inBox})\n`;
        } else {
          pythonCode += `${blockOutAtoms} = ap.wrap(${inAtoms}, ${inBox})\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "wrap": {
        pythonCode += `${blockOutAtoms} = ap.wrap(${inAtoms}, ${inBox})\n`;
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
          pythonCode += `            ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_file(${inAtoms}, version='${versionArg}', charge_method='${chargeArg}')\n`;
          pythonCode += `        else:\n`;
          pythonCode += `            ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_gaff(${inAtoms}, version='${versionArg}', charge_method='${chargeArg}')\n`;
          pythonCode += `    except Exception as e:\n`;
          pythonCode += `        print(f"Failed to parametrize organic molecule: {e}")\n`;
          pythonCode += `        ${blockOutAtoms}, ${blockOutBox} = [], None\n`;
          pythonCode += `else:\n`;
          pythonCode += `    # Legacy compat: pass-through pre-parameterized structure\n`;
          pythonCode += `    ${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `    ${blockOutBox} = ${inBox}\n`;
        } else {
          pythonCode += `if ${inBox} is None:\n`;
          pythonCode += `    raise ValueError("Forcefield node (${ff.toUpperCase()}) requires a mineral structure with a simulation box. Connect a mineral source node, not an organic molecule node.")\n`;
          if (ff === "minff") {
            pythonCode += `${blockOutAtoms} = ap.minff(${inAtoms}, ${inBox})\n`;
          } else {
            pythonCode += `${blockOutAtoms} = ap.clayff(${inAtoms}, ${inBox})\n`;
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
        const miniSteps = getNumber(data, "miniSteps", 500);
        const mdSteps = getNumber(data, "mdSteps", 5000);
        const cutoffNm = getNumber(data, "cutoff", 12.0) / 10.0;
        const constraintsStr = getString(data, "constraints", "HBonds");
        const wrapTrajectory = getBoolean(data, "wrapTrajectory", true);
        const findUpstreamForcefield = (startId: string): string => {
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
                if (parentNode.type === "forcefield") {
                  return getString(parentNode.data, "forcefield", "minff");
                }
                queue.push(parentNode.id);
              }
            }
          }
          return "minff"; // fallback default
        };
        const findUpstreamMinffVariant = (startId: string): string => {
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
                if (parentNode.type === "forcefield") {
                  return getString(parentNode.data, "minffVariant", "500");
                }
                queue.push(parentNode.id);
              }
            }
          }
          return "500"; // fallback default
        };
        // CLAYFF angle terms (default "none" = no angles written).
        const findUpstreamClayffAngles = (startId: string): string => {
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
                if (parentNode.type === "forcefield") {
                  return getString(parentNode.data, "clayffAngles", "none");
                }
                queue.push(parentNode.id);
              }
            }
          }
          return "none";
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
        const minffVariant = findUpstreamMinffVariant(id);
        const clayffAngles = findUpstreamClayffAngles(id);
        // Angle terms: CLAYFF defaults to none; MINFF "none" also omits angles.
        // MINFF "none" still needs a nonbonded block → use GMINFF_k0 (Unbonded).
        const writeAngles = upstreamFF === "clayff" ? (clayffAngles === "standard") : (minffVariant !== "none");
        const minffDefineVariant = minffVariant === "none" ? "0" : minffVariant;
        const waterModel = findUpstreamWaterModel(id, upstreamFF);
        const ionSet = findUpstreamIonSet(id, upstreamFF);
        const logFile = pyEscape(getString(data, "logFile", "output.log"));
        const trajFile = `traj_${index}.pdb`;
        const excludeWater = getBoolean(data, "excludeWater", true);
        const pdbFreq = getNumber(data, "pdbFreq", getNumber(data, "dcdFreq", 1000));
        const logFreq = getNumber(data, "logFreq", 1000);

        // Organic-only / pure-solvent systems must NOT pull in a mineral FF block.
        // Water atomtypes come from a direct water-model #include and ions from the
        // ion-set define, both independent of GMINFF_k…/CLAYFF — so dropping the
        // mineral define is safe and avoids loading unused mineral atomtypes.
        const isOrganicFF = ["openff_sage", "openff_parsley", "gaff"].includes(upstreamFF);
        const defines = upstreamFF === "clayff"
          ? ["CLAYFF_EXT", `${waterModel}_${ionSet}`, waterModel]
          : isOrganicFF
            ? [`${waterModel}_${ionSet}`, waterModel]
            : [`GMINFF_k${minffDefineVariant}`, `${waterModel}_${ionSet}`, waterModel];
        const definesExpr = `[${defines.map(d => `'${d}'`).join(", ")}]`;

        const constraintsExpr = constraintsStr === "None" ? "None"
          : constraintsStr === "AllBonds" ? "app.AllBonds" : "app.HBonds";
        const isMinimize = simType === "minimize";
        const isNPT = simType === "npt";
        const pressure = getNumber(data, "pressure", 1.0);

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
        pythonCode += `    # Priority 1: topology already built by an upstream simulation — reuse it\n`;
        pythonCode += `    _chain_top = getattr(${inAtoms}, '_top_path', None)\n`;
        pythonCode += `    if _chain_top and _os.path.exists(_chain_top):\n`;
        pythonCode += `        _top_path = _chain_top\n`;
        pythonCode += `        _defines  = getattr(${inAtoms}, '_defines', ${definesExpr})\n`;
        pythonCode += `        _gro_path = "chained_sim.gro"\n`;
        pythonCode += `        ap.write_gro(list(${inAtoms}), ${inBox}, _gro_path)\n`;
        pythonCode += `        _minff_dir = _os.path.join(_os.path.dirname(ap.__file__), 'ffparams')\n`;
        pythonCode += `        topology, system, positions = ap.load_minff_into_openmm(_top_path, _gro_path, _defines, include_dir=_minff_dir, rigid_water=True)\n`;
        pythonCode += `        _sim_atoms = list(${inAtoms})\n`;
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
        pythonCode += `            _top_path = "sim_input.top"\n`;
        pythonCode += `            _gro_path = "sim_input.gro"\n`;
        pythonCode += `            _defines = ${definesExpr}\n`;
        pythonCode += `            _ff_variant = "GMINFF_k500"\n`;
        pythonCode += `            _water_model = "spce"\n`;
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
        pythonCode += `            \n`;
        pythonCode += `            ap.write_merged_top(list(${inAtoms}), _itp, ${inBox}, _top_path, _gro_path,\n`;
        pythonCode += `                                 minff_variant=_ff_variant, water_model=_water_model,\n`;
        pythonCode += `                                 ion_model=_ion_model, organic_itps=_org_itps or None, write_angles=${writeAngles ? "True" : "False"})\n`;
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
        pythonCode += `            _top_path = "min_system.top"\n`;
        pythonCode += `            _gro_path = "min_system.gro"\n`;
        pythonCode += `            _sim_atoms = list(${inAtoms})\n`;
        pythonCode += `            ap.write_top(_sim_atoms, Box=${inBox}, file_path=_top_path, explicit_angles=${writeAngles ? 1 : 0})\n`;
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

        pythonCode += `    integrator = mm.LangevinMiddleIntegrator(${temp}*unit.kelvin, 1/unit.picosecond, ${(timestepFs / 1000).toFixed(4)}*unit.picoseconds)\n`;

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
        pythonCode += `        simulation.reporters.append(app.StateDataReporter(CleanHeaderStream(open('${logFile}', 'w', encoding='utf-8')), max(1, ${logFreq}), step=True, potentialEnergy=True, temperature=True))\n`;
        pythonCode += `        simulation.reporters.append(app.StateDataReporter(CleanHeaderStream(_sys.stdout), max(1, ${logFreq}), step=True, potentialEnergy=True, temperature=True))\n`;
        pythonCode += `        simulation.step(${mdSteps})\n`;
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
        pythonCode += `        _sim_atoms.save("result_${index}.pdb", overwrite=True)\n`;
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
        pythonCode += `        ap.write_pdb(list(_sim_atoms), _new_box, "result_${index}.pdb")\n`;

        pythonCode += `except Exception as md_err:\n`;
        pythonCode += `    import traceback as _tb\n`;
        pythonCode += `    print(f"Simulation failed: {md_err}")\n`;
        pythonCode += `    print(_tb.format_exc())\n`;
        pythonCode += `    ${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `    ${blockOutBox} = ${inBox}\n`;
        if (!isMinimize) {
          pythonCode += `    with open('${logFile}', 'w') as _logf: _logf.write(f"Simulation failed: {md_err}\\n" + _tb.format_exc())\n`;
          pythonCode += `    with open('${trajFile}', 'w') as _trajf: _trajf.write("No trajectory generated.\\n")\n`;
        }
        
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox, traj: `'${trajFile}'` });
        break;
      }
      case "coordinateFrame":
      case "coordFrame": {
        const originType = pyEscape(getString(data, "originType", "index"));
        const originVal = pyEscape(getString(data, "originValue", "1"));
        const alignType = pyEscape(getString(data, "alignType", "index"));
        const alignVal = pyEscape(getString(data, "alignValue", "2"));
        const axis = pyEscape(getString(data, "axis", "z"));

        pythonCode += `${blockOutAtoms} = ap.coordinate_frame(${inAtoms}, Box=${inBox}, origin_type='${originType}', origin_value='${originVal}', align_type='${alignType}', align_value='${alignVal}', axis='${axis}')\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
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

        if (option === "rdf") {
          const typeA = pyEscape(getString(data, "atomTypeA", "Na"));
          const typeB = pyEscape(getString(data, "atomTypeB", "Cl"));
          const rMax = getNumber(data, "rmax", 10.0);
          const dr = getNumber(data, "dr", 0.05);
          const outputBase = pyEscape(getString(data, "rdfOutputBase", "rdf_results"));

          pythonCode += `\n# Run RDF Analysis\n`;
          pythonCode += `rdf_data = ap.calculate_rdf(${inAtoms}, ${inBox}, typeA='${typeA}', typeB='${typeB}', rmax=${rMax}, dr=${dr})\n`;
          pythonCode += `with open('${outputBase}.json', 'w') as _rf:\n`;
          pythonCode += `    json.dump({'x': [float(x) for x in rdf_data[0]], 'y': [float(y) for y in rdf_data[1]]}, _rf)\n`;
          pythonCode += `print(f"RDF: {len(rdf_data[0])} bins, rmax=${rMax} A")\n`;

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
        const option = getString(data, "option", "com");

        if (option === "com") {
          const comLogFile = pyEscape(getString(data, "comLogFile", "com_report.json"));
          pythonCode += `\n# Center of mass calculation\n`;
          pythonCode += `com_data = ap.com(${inAtoms})\n`;
          pythonCode += `with open('${comLogFile}', 'w') as _cf:\n`;
          pythonCode += `    json.dump({'x': float(com_data[0]), 'y': float(com_data[1]), 'z': float(com_data[2])}, _cf)\n`;
        } else if (option === "vectors") {
          const vectorsFile = pyEscape(getString(data, "vectorsFile", "cell_vectors.json"));
          pythonCode += `\n# Cell vectors calculation\n`;
          pythonCode += `_cell = ap.Box_dim2Cell(${inBox})\n`;
          pythonCode += `vectors_data = ap.get_cell_vectors(_cell)\n`;
          pythonCode += `with open('${vectorsFile}', 'w') as _vf:\n`;
          pythonCode += `    json.dump({'a': [float(v) for v in vectors_data[0]], 'b': [float(v) for v in vectors_data[1]], 'c': [float(v) for v in vectors_data[2]]}, _vf)\n`;
        }

        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
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

        pythonCode += `\n# Parametrize Organic Molecule\n`;
        pythonCode += `try:\n`;
        if (inputMode === "file" && uploadPath) {
          pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_file('${uploadPath}', version='${ff}')\n`;
        } else {
          pythonCode += `    ${blockOutAtoms}, ${blockOutBox} = ap.parametrize_organic_gaff('${smiles}', version='${ff}')\n`;
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
          pythonCode += `        _traj_file = _no_water_file\n`;
          pythonCode += `    if os.path.exists(_traj_file):\n`;
          pythonCode += `        with open(_traj_file, 'r', encoding='utf-8') as _f:\n`;
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
          pythonCode += `            _max_out_models = 1000\n`;
          pythonCode += `            if len(_models) > _max_out_models:\n`;
          pythonCode += `                _keep_indices = [int(i * (len(_models) - 1) / (_max_out_models - 1)) for i in range(_max_out_models)]\n`;
          pythonCode += `                _keep_indices = sorted(list(set(_keep_indices)))\n`;
          pythonCode += `                _models = [_models[_idx] for _idx in _keep_indices]\n`;
          pythonCode += `            \n`;
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
        const findUpstreamForcefield = (startId: string): string => {
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
                if (parentNode.type === "forcefield") {
                  return getString(parentNode.data, "forcefield", "minff");
                }
                queue.push(parentNode.id);
              }
            }
          }
          return "minff"; // fallback default
        };
        const findUpstreamMinffVariant = (startId: string): string => {
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
                if (parentNode.type === "forcefield") {
                  return getString(parentNode.data, "minffVariant", "500");
                }
                queue.push(parentNode.id);
              }
            }
          }
          return "500"; // fallback default
        };
        // CLAYFF angle terms (default "none" = no angles written).
        const findUpstreamClayffAngles = (startId: string): string => {
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
                if (parentNode.type === "forcefield") {
                  return getString(parentNode.data, "clayffAngles", "none");
                }
                queue.push(parentNode.id);
              }
            }
          }
          return "none";
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
        const minffVariant = findUpstreamMinffVariant(id);
        const clayffAngles = findUpstreamClayffAngles(id);
        // Angle terms: CLAYFF defaults to none; MINFF "none" also omits angles.
        // MINFF "none" still needs a nonbonded block → use GMINFF_k0 (Unbonded).
        const writeAngles = upstreamFF === "clayff" ? (clayffAngles === "standard") : (minffVariant !== "none");
        const minffDefineVariant = minffVariant === "none" ? "0" : minffVariant;
        const waterModel = findUpstreamWaterModel(id, upstreamFF);
        const ionSet = findUpstreamIonSet(id, upstreamFF);
        const ffVariant = upstreamFF === "clayff" ? "CLAYFF_EXT" : `GMINFF_k${minffDefineVariant}`;
        const waterLower = waterModel.toLowerCase();
        const ionCombine = `${waterModel}_${ionSet}`;

        pythonCode += `\n# Export Final System Coordinate and Topology Outputs\n`;
        pythonCode += `if hasattr(${inAtoms}, 'itp') and ${inAtoms}.itp is not None:\n`;
        pythonCode += `    # Export Mixed/Organic System\n`;
        pythonCode += `    _exp_atoms = list(${inAtoms})\n`;
        pythonCode += `    _exp_box = ${inBox}\n`;
        if (structFmt === "pdb") {
          pythonCode += `    ap.write_pdb(_exp_atoms, _exp_box, '${outName}.pdb')\n`;
        } else if (structFmt === "gro") {
          pythonCode += `    ap.write_gro(_exp_atoms, _exp_box, '${outName}.gro')\n`;
        } else if (structFmt === "cif") {
          pythonCode += `    ap.write_cif(_exp_atoms, _exp_box, '${outName}.cif')\n`;
        }
        if (topFmt === "gromacs") {
          pythonCode += `    _org_itps = []\n`;
          pythonCode += `    if ${inAtoms}.itp.get('_source_itp'):\n`;
          pythonCode += `        _org_itps.append(os.path.basename(${inAtoms}.itp['_source_itp']))\n`;
          pythonCode += `    for _k, _v in ${inAtoms}.itp.items():\n`;
          pythonCode += `        if _k.startswith('_source_itp') and _v and _v not in _org_itps:\n`;
          pythonCode += `            _org_itps.append(os.path.basename(_v))\n`;
          pythonCode += `    ap.write_merged_top(_exp_atoms, ${inAtoms}.itp, _exp_box, '${outName}.top', '${outName}.gro', minff_variant='${ffVariant}', water_model='${waterLower}', ion_model='${ionCombine}', organic_itps=_org_itps or None, write_angles=${writeAngles ? "True" : "False"})\n`;
        }
        pythonCode += `else:\n`;
        
        if (structFmt === "pdb") {
          pythonCode += `    ap.write_pdb(${inAtoms}, ${inBox}, '${outName}.pdb')\n`;
        } else if (structFmt === "gro") {
          pythonCode += `    ap.write_gro(${inAtoms}, ${inBox}, '${outName}.gro')\n`;
        } else if (structFmt === "cif") {
          pythonCode += `    ap.write_cif(${inAtoms}, ${inBox}, '${outName}.cif')\n`;
        }

        if (topFmt === "gromacs") {
          pythonCode += `    ap.write_itp(${inAtoms}, ${inBox}, '${outName}.itp')\n`;
        } else if (topFmt === "namd") {
          pythonCode += `    ap.write_psf(${inAtoms}, ${inBox}, '${outName}.psf')\n`;
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
