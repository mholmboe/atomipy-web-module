import type { Node, Edge } from "@xyflow/react";

export type PythonScriptMode = "full" | "minimal" | "strict";
export type RunNodeStatus = "queued" | "running" | "success" | "failure";

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
      if (!upstreams.has("forcefield")) {
        warnings.push(`Warning (Simulation Node ${node.id}): A forcefield node must be connected upstream to run standard simulation parameters without crashes.`);
      }
    }
    if (node.type === "solvate" || node.type === "solvent") {
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
    const n = nodeMap.get(id)!;
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
    pythonCode += `\n# --- Operation: ${opType} (${id}) ---\n`;
    if (mode === "full") {
      pythonCode += `print("__NODE_START__:${opIdEscaped}:${index}")\n`;
    }

    switch (n.type) {
      case "structure": {
        const source = getString(data, "source", "preset");
        if (source === "upload") {
          const upFilename = pyEscape(getString(data, "filename", "uploaded.pdb"));
          pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'uploads/${upFilename}')\n`;
        } else {
          const file = pyEscape(getString(data, "value", "unknown.pdb"));
          pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'UC_conf/${file}')\n`;
        }
        pythonCode += `if ${blockOutBox} is None or (not isinstance(${blockOutBox}, str) and hasattr(${blockOutBox}, '__len__') and len(${blockOutBox}) == 0):\n`;
        pythonCode += `    ${blockOutBox} = [50.0, 50.0, 50.0, 90.0, 90.0, 90.0]\n`;
        pythonCode += `if hasattr(${blockOutBox}, '__len__') and len(${blockOutBox}) in [3, 6]:\n`;
        pythonCode += `    ${blockOutBox} = ap.Cell2Box_dim(${blockOutBox})\n`;
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

          if (atomLabelExpr) {
            pythonCode += `${filteredVar} = ap.merge(${stateA.atoms}, ${stateB.atoms}, ${stateA.box}, type_mode='${typeMode}', atom_label=${atomLabelExpr}, min_distance=${minDistanceExpr})\n`;
          } else {
            pythonCode += `${filteredVar} = ap.merge(${stateA.atoms}, ${stateB.atoms}, ${stateA.box}, type_mode='${typeMode}', min_distance=${minDistanceExpr})\n`;
          }
          pythonCode += `${blockOutAtoms} = ap.update(${stateA.atoms}, ${filteredVar})\n`;
          pythonCode += `${blockOutBox} = ${stateA.box}\n`;
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
          pythonCode += `${blockOutAtoms} = ap.update(${atomArgs}, force=True)\n`;
          pythonCode += `${blockOutBox} = ${gatheredStates[0].box}\n`;

          const reorder = getBoolean(data, "reorderMolids", true);
          const customMolid = getNumber(data, "molid", undefined);
          const customResname = getString(data, "resname", "");

          if (reorder) {
            pythonCode += `# Reorder molids sequentially across joined branches\n`;
            pythonCode += `curr_molid = 1\n`;
            pythonCode += `for branch_atoms in [${atomArgs}]:\n`;
            pythonCode += `    if not branch_atoms: continue\n`;
            pythonCode += `    m_ids = sorted(list(set(a.get('molid', 1) for a in branch_atoms)))\n`;
            pythonCode += `    m_map = {old: curr_molid + i for i, old in enumerate(m_ids)}\n`;
            pythonCode += `    for a in branch_atoms: a['molid'] = m_map.get(a.get('molid', 1), curr_molid)\n`;
            pythonCode += `    curr_molid += len(m_ids)\n`;
            pythonCode += `${blockOutAtoms} = ap.update(${atomArgs}, force=True) # Refresh combined list\n`;
          }

          if (customMolid !== undefined || customResname) {
            const molidArg = customMolid !== undefined ? `, molid=${customMolid}` : "";
            const resArg = customResname ? `, resname='${customResname}'` : "";
            pythonCode += `${blockOutAtoms} = ap.molecule(${blockOutAtoms}${molidArg}${resArg})\n`;
          }

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

        const xhiExpr = xhi !== null ? `${xhi}` : `${inBox}[0]`;
        const yhiExpr = yhi !== null ? `${yhi}` : `${inBox}[1]`;
        const zhiExpr = zhi !== null ? `${zhi}` : `${inBox}[2]`;
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
          pythonCode += `${blockOutBox} = ${inBox}\n`;
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
          pythonCode += `${ionsVar} = ap.ionize('${ion}', resname='ION', limits=${limitsExpr}, num_ions=${count}, Box=${inBox}, min_distance=${dist}, solute_atoms=${wrappedInAtoms}, placement='${placement}'${directionArg})\n`;
          pythonCode += `${blockOutAtoms} = ap.update(${inAtoms}, ${ionsVar})\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "solvate": {
        const model = pyEscape(getString(data, "waterModel", "spce"));
        const dens = getNumber(data, "density", 1.0) * 1000.0;
        const spacing = getNumber(data, "minDistance", 2.0);
        pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.solvate_system(${inAtoms}, ${inBox}, watermodel='${model}', density=${dens}, rmin=${spacing})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "solvent": {
        const model = pyEscape(getString(data, "waterModel", "spce"));
        const dens = getNumber(data, "density", 1.0) * 1000.0;
        const spacing = getNumber(data, "minDistance", 2.0);
        pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.solvate_system(${inAtoms}, ${inBox}, watermodel='${model}', density=${dens}, rmin=${spacing})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "waterModel": {
        const model = pyEscape(getString(data, "value", "spce"));
        const numH2O = getNumber(data, "numH2O", 1);
        pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.solvate_system([], [30.0, 30.0, 30.0], watermodel='${model}', rmin=2.0)\n`;
        pythonCode += `if len(${blockOutAtoms}) > ${numH2O} * 3:\n`;
        pythonCode += `    ${blockOutAtoms} = ${blockOutAtoms}[:${numH2O} * 3]\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "edit": {
        const selectedResname = getString(data, "resname", "").trim();
        const option = getString(data, "option", "resname");
        const value = getString(data, "value", "").trim();

        if (option === "resname") {
          const resnameArg = selectedResname ? `, resname='${pyEscape(selectedResname)}'` : "";
          pythonCode += `${blockOutAtoms} = ap.assign_resname(${inAtoms}, default_resname='${pyEscape(value)}'${resnameArg})\n`;
        } else if (option === "molid") {
          const customMolid = parseInt(value, 10);
          const molidVal = isNaN(customMolid) ? 1 : customMolid;
          const resnameArg = selectedResname ? `, resname='${pyEscape(selectedResname)}'` : "";
          pythonCode += `${blockOutAtoms} = ap.molecule(${inAtoms}, molid=${molidVal}${resnameArg})\n`;
        } else if (option === "renumber") {
          pythonCode += `${blockOutAtoms} = ap.reindex(${inAtoms})\n`;
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
        const ff = pyEscape(getString(data, "ff", "CLAYFF"));
        const waterFF = pyEscape(getString(data, "waterFF", "SPC"));
        pythonCode += `${blockOutAtoms} = ap.assign_forcefield(${inAtoms}, ${inBox}, ff='${ff}', watermodel='${waterFF}')\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "simulate": {
        const ensemble = pyEscape(getString(data, "ensemble", "NVT"));
        const temp = getNumber(data, "temperature", 298.15);
        const steps = getNumber(data, "steps", 5000);
        const logFile = pyEscape(getString(data, "logFile", "output.log"));
        const trajFile = `traj_${index}.pdb`;

        pythonCode += `\n# Set up and execute OpenMM Molecular Dynamics Simulation\n`;
        pythonCode += `try:\n`;
        pythonCode += `    import openmm as mm\n`;
        pythonCode += `    import openmm.app as app\n`;
        pythonCode += `    from openmm import unit\n`;
        pythonCode += `    import sys\n`;
        pythonCode += `    \n`;
        pythonCode += `    print("Running energy minimization...")\n`;
        pythonCode += `    topology, system, positions = ap.load_minff_into_openmm(${inAtoms}, ${inBox})\n`;
        pythonCode += `    integrator = mm.LangevinMiddleIntegrator(${temp}*unit.kelvin, 1/unit.picosecond, 0.002*unit.picoseconds)\n`;
        pythonCode += `    simulation = app.Simulation(topology, system, integrator)\n`;
        pythonCode += `    simulation.context.setPositions(positions)\n`;
        pythonCode += `    simulation.minimizeEnergy()\n`;
        pythonCode += `    \n`;
        pythonCode += `    print(f"Executing MD Simulation ({ensemble}, {steps} steps)...")\n`;
        pythonCode += `    simulation.reporters.append(app.PDBReporter('${trajFile}', int(${steps} // 10 or 500)))\n`;
        pythonCode += `    simulation.reporters.append(app.StateDataReporter('${logFile}', int(${steps} // 10 or 500), step=True, potentialEnergy=True, temperature=True))\n`;
        pythonCode += `    simulation.step(${steps})\n`;
        pythonCode += `    \n`;
        pythonCode += `    # Extract final frame coordinates\n`;
        pythonCode += `    state = simulation.context.getState(getPositions=True)\n`;
        pythonCode += `    final_positions = state.getPositions(asNumpy=True).value_in_unit(unit.angstrom)\n`;
        pythonCode += `    ${blockOutAtoms} = ap.update_positions(${inAtoms}, final_positions)\n`;
        pythonCode += `    ${blockOutBox} = ${inBox}\n`;
        pythonCode += `except Exception as md_err:\n`;
        pythonCode += `    print(f"MD Simulation crashed or OpenMM not installed, using starting coordinates: {md_err}")\n`;
        pythonCode += `    ${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `    ${blockOutBox} = ${inBox}\n`;
        pythonCode += `    with open('${logFile}', 'w') as _logf: _logf.write("OpenMM not configured or MD failed. Starting positions used.")\n`;
        pythonCode += `    with open('${trajFile}', 'w') as _trajf: _trajf.write("No trajectory generated.")\n`;
        
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
        const option = getString(data, "option", "rdf");

        if (option === "rdf") {
          const typeA = pyEscape(getString(data, "atomTypeA", "Na"));
          const typeB = pyEscape(getString(data, "atomTypeB", "Cl"));
          const rMax = getNumber(data, "rMax", 10.0);
          const dr = getNumber(data, "dr", 0.05);
          const outputBase = pyEscape(getString(data, "rdfOutputBase", "rdf_results"));

          pythonCode += `\n# Run RDF Analysis\n`;
          pythonCode += `rdf_data = ap.rdf(${inAtoms}, ${inBox}, typeA='${typeA}', typeB='${typeB}', rmax=${rMax}, dr=${dr}, output_base='${outputBase}')\n`;
          pythonCode += `with open('rdf_results.json', 'w') as _rf:\n`;
          pythonCode += `    json.dump({'x': [float(x) for x in rdf_data[:, 0]], 'y': [float(y) for y in rdf_data[:, 1]]}, _rf)\n`;
          
          if (mode === "full") {
            pythonCode += `print("__PLOT_DATA__:${id}:" + json.dumps({'x': [float(x) for x in rdf_data[:, 0]], 'y': [float(y) for y in rdf_data[:, 1]]}))\n`;
          }
        } else if (option === "cn" || option === "coordinationNumber") {
          const typeA = pyEscape(getString(data, "atomTypeA", "Na"));
          const typeB = getString(data, "atomTypeB", "").trim();
          const rCut = getNumber(data, "rCut", 3.5);
          const outputBase = pyEscape(getString(data, "cnOutputBase", "cn_results"));
          const typeBArg = typeB ? `, typeB='${pyEscape(typeB)}'` : "";

          pythonCode += `\n# Coordination Number Analysis\n`;
          pythonCode += `cn_data = ap.coordination_number(${inAtoms}, ${inBox}, typeA='${typeA}'${typeBArg}, rcut=${rCut}, output_base='${outputBase}')\n`;
        } else if (option === "closest") {
          const typeA = pyEscape(getString(data, "atomTypeA", "Na"));
          const typeB = pyEscape(getString(data, "atomTypeB", "Cl"));
          const limit = getNumber(data, "limit", 10);
          const outputBase = pyEscape(getString(data, "closestOutputBase", "closest_results"));

          pythonCode += `\n# Closest atoms extraction\n`;
          pythonCode += `closest_data = ap.closest_atoms(${inAtoms}, ${inBox}, typeA='${typeA}', typeB='${typeB}', limit=${limit}, output_base='${outputBase}')\n`;
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
          const waterFF = pyEscape(getString(data, "waterFF", "SPC"));
          pythonCode += `${blockOutAtoms} = ap.assign_forcefield(${inAtoms}, ${inBox}, ff='CLAYFF', watermodel='${waterFF}')\n`;
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
          pythonCode += `com_data = ap.center_of_mass(${inAtoms}, ${inBox})\n`;
          pythonCode += `with open('${comLogFile}', 'w') as _cf:\n`;
          pythonCode += `    json.dump({'x': float(com_data[0]), 'y': float(com_data[1]), 'z': float(com_data[2])}, _cf)\n`;
        } else if (option === "vectors") {
          const vectorsFile = pyEscape(getString(data, "vectorsFile", "cell_vectors.json"));
          pythonCode += `\n# Cell vectors calculation\n`;
          pythonCode += `vectors_data = ap.cell_vectors(${inBox})\n`;
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
      case "plot": {
        pythonCode += `# Plot Node (${id}) is active downstream\n`;
        break;
      }
      case "viewer": {
        pythonCode += `# Viewer Node (${id}) is active downstream\n`;
        break;
      }
      case "export": {
        const outName = pyEscape(getString(data, "outputName", "system"));
        const structFmt = pyEscape(getString(data, "structureFormat", "pdb"));
        const topFmt = pyEscape(getString(data, "topologyFormat", "none"));

        pythonCode += `\n# Export Final System Coordinate and Topology Outputs\n`;
        if (structFmt === "pdb") {
          pythonCode += `ap.write_conf(${inAtoms}, ${inBox}, '${outName}.pdb')\n`;
        } else if (structFmt === "gro") {
          pythonCode += `ap.write_conf(${inAtoms}, ${inBox}, '${outName}.gro')\n`;
        } else if (structFmt === "cif") {
          pythonCode += `ap.write_conf(${inAtoms}, ${inBox}, '${outName}.cif')\n`;
        }

        if (topFmt === "gromacs") {
          pythonCode += `ap.write_itp(${inAtoms}, ${inBox}, '${outName}.itp')\n`;
        } else if (topFmt === "namd") {
          pythonCode += `ap.write_psf(${inAtoms}, ${inBox}, '${outName}.psf')\n`;
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
