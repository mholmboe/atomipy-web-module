import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Connection,
  Edge,
  Node,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import {
  Play,
  FileInput,
  Grid3x3,
  Target,
  Combine,
  PackagePlus,
  BadgePlus,
  RotateCw,
  Scaling,
  Scissors,
  Diff,
  Spline,
  Tag,
  Fingerprint,
  Save,
  Upload,
  Download,
  FolderOpen,
  Trash2,
  Droplet,
  Droplets,
  FlaskConical,
  Maximize,
  FileOutput,
  Box,
  Eye,
  GitMerge,
  BarChart3,
  Calculator,
  Waypoints,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Activity,
  Eraser,
  Orbit,
  LayoutGrid,
  Minimize,
  History,
  Move3D,
  SlidersHorizontal,
  Atom,
  BarChart,
  X,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Terminal } from "lucide-react";
import { toast } from "sonner";

// Import Custom Nodes
import { StructureNode } from "./nodes/StructureNode";
import { ReplicateNode } from "./nodes/ReplicateNode";
import { ExportNode } from "./nodes/ExportNode";
import { IonsNode } from "./nodes/IonsNode";
import { BoxNode } from "./nodes/BoxNode";
import { MergeNode } from "./nodes/MergeNode";
import { AddNode } from "./nodes/AddNode";
import { InsertNode } from "./nodes/InsertNode";
import { ForcefieldNode } from "./nodes/ForcefieldNode";
import { BondAngleNode } from "./nodes/BondAngleNode";
import { XrdNode } from "./nodes/XrdNode";
import { PlotNode } from "./nodes/PlotNode";
import { ViewerNode } from "./nodes/ViewerNode";
import { TrajectoryNode } from "./nodes/TrajectoryNode";
// New composite nodes
import { TransformNode } from "./nodes/TransformNode";
import { PBCNode } from "./nodes/PBCNode";
import { EditNode } from "./nodes/EditNode";
import { ChemistryNode } from "./nodes/ChemistryNode";
import { SolventNode } from "./nodes/SolventNode";
import { AnalysisNode } from "./nodes/AnalysisNode";
import { AtomPropertiesNode } from "./nodes/AtomPropertiesNode";
import { CoordinateFrameNode } from "./nodes/CoordinateFrameNode";
// Keep old nodes registered so saved workflows still load
import { SolvateNode } from "./nodes/SolvateNode";
import { PositionNode } from "./nodes/PositionNode";
import { WrapNode } from "./nodes/WrapNode";
import { AddHNode } from "./nodes/AddHNode";
import { RotateNode } from "./nodes/RotateNode";
import { ScaleNode } from "./nodes/ScaleNode";
import { SliceNode } from "./nodes/SliceNode";
import { SubstituteNode } from "./nodes/SubstituteNode";
import { FuseNode } from "./nodes/FuseNode";
import { ResnameNode } from "./nodes/ResnameNode";
import { MoleculeNode } from "./nodes/MoleculeNode";
import { BvsNode } from "./nodes/BvsNode";
import { ReorderNode } from "./nodes/ReorderNode";
import { RemoveNode } from "./nodes/RemoveNode";
import { StatsNode } from "./nodes/StatsNode";
import { BendNode } from "./nodes/BendNode";
import { CondenseNode } from "./nodes/CondenseNode";
import { WaterModelNode } from "./nodes/WaterModelNode";
import type { PresetOption } from "./nodes/types";
import DeletableEdge from "./edges/DeletableEdge";

const edgeTypes = {
  deletable: DeletableEdge,
};

const nodeTypes = {
  // Primary nodes (actively in toolbar)
  structure: StructureNode,
  ions: IonsNode,
  replicate: ReplicateNode,
  box: BoxNode,
  transform: TransformNode,
  pbc: PBCNode,
  add: AddNode,
  merge: MergeNode,
  insert: InsertNode,
  solvent: SolventNode,
  chemistry: ChemistryNode,
  edit: EditNode,
  forcefield: ForcefieldNode,
  bondAngle: BondAngleNode,
  analysis: AnalysisNode,
  atomProps: AtomPropertiesNode,
  coordFrame: CoordinateFrameNode,
  xrd: XrdNode,
  plot: PlotNode,
  viewer: ViewerNode,
  export: ExportNode,
  trajectory: TrajectoryNode,
  // Legacy nodes (kept so saved workflows still load)
  addIons: IonsNode,
  grid: IonsNode,
  preset: StructureNode,
  upload: StructureNode,
  solvate: SolvateNode,
  waterModel: WaterModelNode,
  position: PositionNode,
  wrap: WrapNode,
  addH: AddHNode,
  rotate: RotateNode,
  scale: ScaleNode,
  slice: SliceNode,
  substitute: SubstituteNode,
  fuse: FuseNode,
  resname: ResnameNode,
  molecule: MoleculeNode,
  bvs: BvsNode,
  reorder: ReorderNode,
  remove: RemoveNode,
  stats: StatsNode,
  bend: BendNode,
  condense: CondenseNode,
};

const initialNodes: Node[] = [
  {
    id: "node_1",
    type: "structure",
    position: { x: 100, y: 150 },
    data: { source: "upload" },
  },
  {
    id: "node_2",
    type: "export",
    position: { x: 500, y: 150 },
    data: {
      outputName: "system",
      structureFormat: "pdb",
      topologyFormat: "none",
    },
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "node_1", target: "node_2" },
];

type NodeDataMap = Record<string, unknown>;
type WorkflowGraph = { nodes: Node[]; edges: Edge[] };
type SavedWorkflow = {
  id: string;
  name: string;
  updatedAt: string;
  nodes: Node[];
  edges: Edge[];
};

const WORKFLOW_SAVED_STORAGE_KEY = "atomipy_saved_workflows";
const WORKFLOW_TEMPLATE_STORAGE_KEY = "atomipy_custom_templates";
const DEFAULT_WORKFLOW_SELECTION = "template:basic";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const deepClone = <T,>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const makeTimestampSuffix = () => new Date().toISOString().replace(/[:.]/g, "-");

const sanitizeFileName = (name: string) =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "workflow";

const parseWorkflowGraph = (value: unknown): WorkflowGraph | null => {
  if (!isRecord(value)) return null;
  const nodes = value.nodes;
  const edges = value.edges;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return null;
  return { nodes: nodes as Node[], edges: edges as Edge[] };
};

const parseSavedWorkflow = (value: unknown): SavedWorkflow | null => {
  if (!isRecord(value)) return null;
  const graph = parseWorkflowGraph(value);
  if (!graph) return null;
  const id = typeof value.id === "string" && value.id.trim() ? value.id : "";
  const name = typeof value.name === "string" && value.name.trim() ? value.name : "";
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.trim() ? value.updatedAt : new Date().toISOString();
  if (!id || !name) return null;
  return { id, name, updatedAt, nodes: graph.nodes, edges: graph.edges };
};

const parseWorkflowImport = (value: unknown): { name: string; graph: WorkflowGraph } | null => {
  if (!isRecord(value)) return null;

  if (isRecord(value.workflow)) {
    const nestedGraph = parseWorkflowGraph(value.workflow);
    if (nestedGraph) {
      const nestedName =
        (isRecord(value.workflow) &&
          typeof value.workflow.name === "string" &&
          value.workflow.name.trim()) ||
        (typeof value.name === "string" && value.name.trim()) ||
        "imported_workflow";
      return { name: nestedName, graph: nestedGraph };
    }
  }

  const rootGraph = parseWorkflowGraph(value);
  if (!rootGraph) return null;
  const rootName = (typeof value.name === "string" && value.name.trim()) || "imported_workflow";
  return { name: rootName, graph: rootGraph };
};

const validateWorkflow = (nodes: Node[], edges: Edge[]): string[] => {
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
    if (adjacency.has(e.source) && indegree.has(e.target)) {
      adjacency.get(e.source)!.push(e.target);
      indegree.set(e.target, (indegree.get(e.target) || 0) + 1);
    }
  });
  const queue: string[] = [];
  indegree.forEach((d, id) => {
    if (d === 0) queue.push(id);
  });
  let visited = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    visited += 1;
    adjacency.get(cur)?.forEach((next) => {
      indegree.set(next, (indegree.get(next) || 0) - 1);
      if ((indegree.get(next) || 0) === 0) queue.push(next);
    });
  }
  if (visited !== nodes.length) {
    errors.push("Workflow contains a cycle; remove circular connections.");
  }

  const singleInputOps = new Set([
    "replicate",
    "position",
    "rotate",
    "scale",
    "slice",
    "remove",
    "insert",
    "substitute",
    "fuse",
    "resname",
    "molecule",
    "addIons",
    "solvate",
    "wrap",
    "forcefield",
    "bondAngle",
    "bvs",
    "atomProps",
    "coordFrame",
    "export",
  ]);

  nodes.forEach((node) => {
    const data = (node.data ?? {}) as NodeDataMap;
    const incoming = incomingByTarget.get(node.id) || [];

    if (singleInputOps.has(node.type || "") && incoming.length === 0) {
      errors.push(`Node "${node.type}" has no input connection.`);
    }

    if (node.type === "merge") {
      const hasA = incoming.some((e) => e.targetHandle === "inA");
      const hasB = incoming.some((e) => e.targetHandle === "inB");
      if (!hasA || !hasB) {
        errors.push(`Node "${node.type}" requires both A and B inputs.`);
      }
    }

    if (node.type === "add") {
      const possibleHandles = ["inA", "inB", "in1", "in2", "in3", "in4", "in5", "in6"];
      const connectedHandles = incoming.filter(e => possibleHandles.includes(e.targetHandle || "")).length;
      if (connectedHandles < 2) {
        errors.push(`Node "add" (Join Branches) requires at least two inputs to join.`);
      }
    }

    if (node.type === "structure") {
      const source = getString(data, "source", "preset");
      if (source === "upload" && !getString(data, "filename", "").trim()) {
        errors.push(`Node "structure" (upload) is missing file upload.`);
      }
      if (source !== "upload" && !getString(data, "value", "").trim()) {
        errors.push(`Node "structure" (preset) has no selected preset.`);
      }
    }

    if (node.type === "insert") {
      const source = getString(data, "source", "preset");
      if (source === "upload" && !getString(data, "filename", "").trim()) {
        errors.push(`Node "insert" (upload) is missing template file.`);
      }
      if (source !== "upload" && !getString(data, "value", "").trim()) {
        errors.push(`Node "insert" (preset) has no template preset selected.`);
      }
    }

    if (node.type === "remove") {
      const hasAtomType = getString(data, "atomType", "").trim().length > 0;
      const hasIndices = getString(data, "indices", "").trim().length > 0;
      const hasMolids = getString(data, "molids", "").trim().length > 0;
      const hasX = getBoolean(data, "xEnabled", false);
      const hasY = getBoolean(data, "yEnabled", false);
      const hasZ = getBoolean(data, "zEnabled", false);
      if (!hasAtomType && !hasIndices && !hasMolids && !hasX && !hasY && !hasZ) {
        errors.push(`Node "remove" needs at least one selection criterion.`);
      }
    }
  });

  return errors;
};

const loadWorkflowEntriesFromStorage = (storageKey: string): SavedWorkflow[] => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => parseSavedWorkflow(entry))
      .filter((entry): entry is SavedWorkflow => entry !== null);
  } catch {
    return [];
  }
};

const basicTemplateNodes: Node[] = deepClone(initialNodes);
const basicTemplateEdges: Edge[] = deepClone(initialEdges);

const templateWorkflows: Array<{ id: string; name: string; graph: WorkflowGraph }> = [
  {
    id: "basic",
    name: "Basic Build (Import -> Rep -> Export)",
    graph: { nodes: basicTemplateNodes, edges: basicTemplateEdges },
  },
  {
    id: "solvate_ions_ff",
    name: "Solvate + Ions + Forcefield",
    graph: {
      nodes: [
        {
          id: "tmpl2_1",
          type: "structure",
          position: { x: 40, y: 170 },
          data: { source: "upload" },
        },
        {
          id: "tmpl2_2",
          type: "replicate",
          position: { x: 320, y: 170 },
          data: { x: 4, y: 3, z: 1 },
        },
        {
          id: "tmpl2_3",
          type: "box",
          position: { x: 580, y: 170 },
          data: {},
        },
        {
          id: "tmpl2_4",
          type: "addIons",
          position: { x: 840, y: 120 },
          data: { ionType: "Na", count: 12, minDistance: 3.0 },
        },
        {
          id: "tmpl2_5",
          type: "solvate",
          position: { x: 840, y: 280 },
          data: { waterModel: "spce", density: 1.0, minDistance: 2.2 },
        },
        {
          id: "tmpl2_6",
          type: "forcefield",
          position: { x: 1120, y: 200 },
          data: { forcefield: "minff" },
        },
        {
          id: "tmpl2_7",
          type: "export",
          position: { x: 1380, y: 200 },
          data: {
            outputName: "solvated_system",
            structureFormat: "gro",
            topologyFormat: "itp",
            angleTerms: "500",
          },
        },
      ],
      edges: [
        { id: "tmpl2_e1", source: "tmpl2_1", target: "tmpl2_2" },
        { id: "tmpl2_e2", source: "tmpl2_2", target: "tmpl2_3" },
        { id: "tmpl2_e3", source: "tmpl2_3", target: "tmpl2_4" },
        { id: "tmpl2_e4", source: "tmpl2_4", target: "tmpl2_5" },
        { id: "tmpl2_e5", source: "tmpl2_5", target: "tmpl2_6" },
        { id: "tmpl2_e6", source: "tmpl2_6", target: "tmpl2_7" },
      ],
    },
  },
  {
    id: "two_structure_join",
    name: "Two Structures -> Join",
    graph: {
      nodes: [
        {
          id: "tmpl3_1",
          type: "structure",
          position: { x: 40, y: 120 },
          data: { source: "upload" },
        },
        {
          id: "tmpl3_2",
          type: "structure",
          position: { x: 40, y: 320 },
          data: { source: "upload" },
        },
        {
          id: "tmpl3_3",
          type: "position",
          position: { x: 320, y: 320 },
          data: { mode: "absolute", x: 0, y: 0, z: 20 },
        },
        {
          id: "tmpl3_4",
          type: "add",
          position: { x: 620, y: 220 },
          data: {},
        },
        {
          id: "tmpl3_5",
          type: "export",
          position: { x: 920, y: 220 },
          data: {
            outputName: "joined_structures",
            structureFormat: "pdb",
            topologyFormat: "none",
            angleTerms: "500",
          },
        },
      ],
      edges: [
        { id: "tmpl3_e1", source: "tmpl3_1", target: "tmpl3_4", targetHandle: "inA" },
        { id: "tmpl3_e2", source: "tmpl3_2", target: "tmpl3_3" },
        { id: "tmpl3_e3", source: "tmpl3_3", target: "tmpl3_4", targetHandle: "inB" },
        { id: "tmpl3_e4", source: "tmpl3_4", target: "tmpl3_5" },
      ],
    },
  },
];

const getString = (data: NodeDataMap, key: string, fallback: string) => {
  const value = data[key];
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
};

const getNumber = (data: NodeDataMap, key: string, fallback: number) => {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const getOptionalNumber = (data: NodeDataMap, key: string) => {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const getBoolean = (data: NodeDataMap, key: string, fallback: boolean) => {
  const value = data[key];
  return typeof value === "boolean" ? value : fallback;
};

const pyEscape = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

type PythonScriptMode = "full" | "minimal" | "strict";
type ScriptSection = { nodeType: string; nodeId: string; code: string };
type RunNodeStatus = "queued" | "running" | "done" | "error" | "skipped";

const NODE_PURPOSE_DOCS: Record<string, string> = {
  structure: "Imports a starting structure from upload or preset files.",
  preset: "Imports a preset structure file.",
  upload: "Imports an uploaded structure file.",
  merge: "Merges two structures while applying a distance filter.",
  add: "Combines two atom sets into one unified structure.",
  box: "Defines or updates simulation box dimensions/cell parameters.",
  replicate: "Replicates the structure along x/y/z to build supercells.",
  position: "Repositions or translates atoms in Cartesian space.",
  rotate: "Rotates atoms using fixed or random Euler angles.",
  scale: "Scales coordinates and box dimensions.",
  reorder: "Reorders atoms by index/type selection rules.",
  slice: "Keeps atoms in a selected region and removes the rest.",
  remove: "Removes atoms by type/index/molecule/coordinate criteria.",
  insert: "Inserts template molecules into a selected region.",
  substitute: "Performs isomorphic substitution in mineral frameworks.",
  fuse: "Fuses nearby atoms based on distance criteria.",
  resname: "Assigns residue names used for topology/export workflows.",
  molecule: "Assigns molecule IDs and optional residue names.",
  addIons: "Adds ions inside the box with placement constraints.",
  solvate: "Adds solvent molecules using density and distance settings.",
  wrap: "Wraps atoms back into periodic boundaries.",
  addH: "Adds hydrogens using bond valence heuristics.",
  stats: "Computes and writes structural statistics.",
  bend: "Applies bending transformation to coordinates.",
  condense: "Condenses periodic images into a compact representation.",
  grid: "Generates a grid of atoms in a defined region.",
  analysis: "Runs analysis operations like RDF/CN/BVS/closest/occupancy/stats.",
  atomProps: "Applies element/charge/mass annotations and optional COM reporting.",
  coordFrame: "Transform node for coordinate-frame conversions and cell-vector reporting tools.",
  trajectory: "Imports or writes trajectory frames.",
  waterModel: "Converts/adjusts water model representations.",
  transform: "Spatial Ops node for translate/rotate/scale/bend transformations.",
  pbc: "Applies periodic-boundary operations (wrap/unwrap/condense).",
  edit: "Runs structural editing operations on current atoms.",
  chemistry: "Runs chemistry operations like substitution/fusion/H-addition.",
  solvent: "Runs solvent/water-model operations.",
  viewer: "Exports an in-memory visualization representation.",
  forcefield: "Assigns forcefield atom types and parameters.",
  bondAngle: "Calculates bonded terms (bonds/angles/dihedrals).",
  bvs: "Runs bond-valence analysis and summaries.",
  xrd: "Calculates and exports simulated XRD profiles.",
  export: "Writes final coordinate/topology files.",
};

const compactBlankLines = (text: string): string => text.replace(/\n{3,}/g, "\n\n");

const NODE_STATUS_EXCLUDED_TYPES = new Set(["preset", "upload", "viewer"]);

const shouldTrackNodeStatus = (nodeType: string | null | undefined): boolean => {
  if (!nodeType) return false;
  return !NODE_STATUS_EXCLUDED_TYPES.has(nodeType);
};

const topologicalSortNodeIds = (nodes: Node[], edges: Edge[]): string[] => {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  nodes.forEach((node) => {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  edges.forEach((edge) => {
    if (!adj.has(edge.source) || !inDegree.has(edge.target)) return;
    adj.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  });

  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    adj.get(current)?.forEach((neighbor) => {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
      if ((inDegree.get(neighbor) || 0) === 0) queue.push(neighbor);
    });
  }

  return sorted.length === nodes.length ? sorted : nodes.map((node) => node.id);
};

const getNodeStatusStyle = (status: RunNodeStatus | undefined): React.CSSProperties => {
  if (status === "running") {
    return { boxShadow: "0 0 0 2px rgba(14, 165, 233, 0.95)", borderRadius: 12 };
  }
  if (status === "done") {
    return { boxShadow: "0 0 0 2px rgba(34, 197, 94, 0.95)", borderRadius: 12 };
  }
  if (status === "error") {
    return { boxShadow: "0 0 0 2px rgba(239, 68, 68, 0.95)", borderRadius: 12 };
  }
  if (status === "queued") {
    return { boxShadow: "0 0 0 1px rgba(148, 163, 184, 0.75)", borderRadius: 12 };
  }
  if (status === "skipped") {
    return { opacity: 0.82 };
  }
  return {};
};

const STATUS_DOT_CLASS: Record<RunNodeStatus, string> = {
  queued: "bg-slate-400",
  running: "bg-sky-500 animate-pulse",
  done: "bg-emerald-500",
  error: "bg-red-500",
  skipped: "bg-slate-300",
};

const statusToLabel = (status: RunNodeStatus | undefined): string => {
  if (!status) return "idle";
  return status;
};

const nodeTypeLabel = (type: string | undefined): string => {
  if (!type) return "Node";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

const toStrictMinimalScript = (pythonCode: string): string => {
  const lines = pythonCode.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let inDocstring = false;
  let skipIndent: number | null = null;

  const isControlLine = (trimmed: string) =>
    trimmed.endsWith(":") &&
    (trimmed.startsWith("if ") ||
      trimmed.startsWith("elif ") ||
      trimmed === "else:" ||
      trimmed === "try:" ||
      trimmed.startsWith("except ") ||
      trimmed === "finally:" ||
      trimmed.startsWith("with ") ||
      trimmed.startsWith("for ") ||
      trimmed.startsWith("while "));

  const indentLevel = (line: string) => line.length - line.trimStart().length;

  for (const line of lines) {
    const trimmed = line.trim();
    const indent = indentLevel(line);

    if (inDocstring) {
      if (trimmed.includes('"""')) {
        inDocstring = false;
      }
      continue;
    }

    if (skipIndent !== null) {
      if (trimmed === "") {
        continue;
      }
      if (indent > skipIndent) {
        continue;
      }
      skipIndent = null;
    }

    if (trimmed.includes('"""')) {
      const quoteCount = (trimmed.match(/"""/g) || []).length;
      if (quoteCount % 2 === 1) {
        inDocstring = true;
      }
      continue;
    }

    if (trimmed.startsWith("# --- Operation:")) {
      output.push(line);
      continue;
    }

    if (trimmed === "") {
      output.push("");
      continue;
    }

    if (trimmed.startsWith("import ") && trimmed !== "import atomipy as ap") {
      continue;
    }
    if (trimmed.startsWith("def __report_error__")) {
      skipIndent = indent;
      continue;
    }
    if (trimmed.startsWith("open('build_errors.log'")) {
      continue;
    }
    if (trimmed.startsWith("print(")) {
      continue;
    }
    if (trimmed.startsWith("#")) {
      continue;
    }
    if (isControlLine(trimmed)) {
      skipIndent = indent;
      continue;
    }

    output.push(line);
  }

  return `${compactBlankLines(output.join("\n")).trimEnd()}\n`;
};

const stripOperationMarkers = (pythonCode: string): string => {
  const filtered = pythonCode
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.trim().startsWith("# --- Operation:"))
    .join("\n");
  return `${compactBlankLines(filtered).trimEnd()}\n`;
};

const extractAtomipyCalls = (code: string): string[] => {
  const matches = code.match(/ap\.[A-Za-z_][A-Za-z0-9_.]*/g) || [];
  return Array.from(new Set(matches));
};

const parseScriptSections = (pythonCode: string): { preamble: string; sections: ScriptSection[] } => {
  const markerRegex = /^# --- Operation: (.+) \((.+)\) ---$/;
  const lines = pythonCode.replace(/\r\n/g, "\n").split("\n");
  const sections: ScriptSection[] = [];
  const preambleLines: string[] = [];
  let current: { nodeType: string; nodeId: string; lines: string[] } | null = null;

  lines.forEach((line) => {
    const match = line.trim().match(markerRegex);
    if (match) {
      if (current) {
        sections.push({
          nodeType: current.nodeType,
          nodeId: current.nodeId,
          code: current.lines.join("\n").trimEnd(),
        });
      }
      current = { nodeType: match[1], nodeId: match[2], lines: [] };
      return;
    }

    if (current) {
      current.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  });

  if (current) {
    sections.push({
      nodeType: current.nodeType,
      nodeId: current.nodeId,
      code: current.lines.join("\n").trimEnd(),
    });
  }

  return { preamble: preambleLines.join("\n").trimEnd(), sections };
};

const notebookSource = (text: string): string[] => {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  return lines.map((line, idx) => (idx < lines.length - 1 ? `${line}\n` : line));
};

const markdownCell = (text: string) => ({
  cell_type: "markdown",
  metadata: {},
  source: notebookSource(text),
});

const codeCell = (text: string) => ({
  cell_type: "code",
  execution_count: null,
  metadata: {},
  outputs: [],
  source: notebookSource(text),
});

const generateNotebookFromStrictScript = (nodes: Node[], strictScriptWithMarkers: string): string => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const { preamble, sections } = parseScriptSections(strictScriptWithMarkers);
  const cells: Array<Record<string, unknown>> = [];

  cells.push(
    markdownCell(
      [
        "# atomipy Workflow Notebook",
        "",
        "Generated by atomipy web module from the strict-minimal script path.",
        "Each step includes a short explanation and the detected `atomipy` API calls.",
      ].join("\n"),
    ),
  );

  if (preamble.trim()) {
    cells.push(codeCell(`${preamble}\n`));
  }

  sections.forEach((section, idx) => {
    const node = nodeById.get(section.nodeId);
    const nodeType = (node?.type || section.nodeType || "unknown").trim();
    const purpose = NODE_PURPOSE_DOCS[nodeType] || `Runs the \`${nodeType}\` workflow step.`;
    const calls = extractAtomipyCalls(section.code);
    const callsLine =
      calls.length > 0
        ? calls.map((call) => `\`${call}\``).join(", ")
        : "`No direct atomipy call detected in this step.`";

    const md = [
      `## Step ${idx + 1}: \`${nodeType}\``,
      `Node id: \`${section.nodeId}\``,
      "",
      purpose,
      "",
      `atomipy functions: ${callsLine}`,
    ].join("\n");

    cells.push(markdownCell(md));
    if (section.code.trim()) {
      cells.push(codeCell(`${section.code.trimEnd()}\n`));
    } else {
      cells.push(codeCell("# No executable statements generated for this step.\n"));
    }
  });

  return JSON.stringify(
    {
      cells,
      metadata: {
        kernelspec: {
          display_name: "Python 3",
          language: "python",
          name: "python3",
        },
        language_info: {
          codemirror_mode: { name: "ipython", version: 3 },
          file_extension: ".py",
          mimetype: "text/x-python",
          name: "python",
          nbconvert_exporter: "python",
          pygments_lexer: "ipython3",
          version: "3.11",
        },
      },
      nbformat: 4,
      nbformat_minor: 5,
    },
    null,
    2,
  );
};

export default function VisualBuilder() {
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const workflowImportInputRef = useRef<HTMLInputElement>(null);
  const [presets, setPresets] = useState<PresetOption[]>([]);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [edgeType, setEdgeType] = useState<"bezier" | "step">("bezier");

  // Build Progress States
  const [isBuilding, setIsBuilding] = useState(false);
  const [showStatusWindow, setShowStatusWindow] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildStatus, setBuildStatus] = useState("");
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [trackedNodeOrder, setTrackedNodeOrder] = useState<string[]>([]);
  const [nodeRunStatus, setNodeRunStatus] = useState<Record<string, RunNodeStatus>>({});
  const currentRunningNodeRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [buildLogs]);

  const [customTemplates, setCustomTemplates] = useState<SavedWorkflow[]>([]);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
  const [selectedWorkflowKey, setSelectedWorkflowKey] = useState(DEFAULT_WORKFLOW_SELECTION);
  const selectedCustomTemplate = selectedWorkflowKey.startsWith("custom:")
    ? customTemplates.find((template) => `custom:${template.id}` === selectedWorkflowKey) || null
    : null;
  const selectedSavedWorkflow = selectedWorkflowKey.startsWith("saved:")
    ? savedWorkflows.find((workflow) => `saved:${workflow.id}` === selectedWorkflowKey) || null
    : null;

  useEffect(() => {
    fetch("/api/presets")
      .then((res) => res.json())
      .then((data: { presets?: PresetOption[] }) =>
        setPresets(Array.isArray(data.presets) ? data.presets : []),
      )
      .catch((err) => console.error("Failed to load presets", err));
  }, []);

  // Update effect to inject presets into relevant nodes whenever library is fetched
  useEffect(() => {
    if (presets.length > 0) {
      setNodes((nds) =>
        nds.map((node) => {
          if (["structure", "insert", "molecule", "preset", "upload"].includes(node.type || "")) {
            return {
              ...node,
              data: {
                ...node.data,
                presets,
              },
            };
          }
          return node;
        }),
      );
    }
  }, [presets, setNodes]);

  useEffect(() => {
    setCustomTemplates(loadWorkflowEntriesFromStorage(WORKFLOW_TEMPLATE_STORAGE_KEY));
    setSavedWorkflows(loadWorkflowEntriesFromStorage(WORKFLOW_SAVED_STORAGE_KEY));
  }, []);

  // Update all existing edges when edgeType changes
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        data: { ...edge.data, type: edgeType },
      }))
    );
  }, [edgeType, setEdges]);

  const onConnect = useCallback(
    (params: Connection | Edge) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "deletable",
            data: { type: edgeType },
          },
          eds,
        ),
      ),
    [setEdges, edgeType],
  );

  const addNode = (type: string) => {
    const baseData: Record<string, unknown> = {
      presets: presets,
    };

    if (type === "structure") {
      baseData.source = "upload";
    }

    if (type === "insert") {
      baseData.source = "upload";
      baseData.numMolecules = 1;
      baseData.minDistance = 2.0;
      baseData.rotateMode = "random";
    }

    if (type === "merge") {
      baseData.typeMode = "molid";
      baseData.minDistance = 2.0;
      baseData.atomLabels = "";
    }

    if (type === "forcefield") {
      baseData.forcefield = "minff";
      baseData.rmaxLong = 2.45;
      baseData.rmaxH = 1.2;
      baseData.log = false;
    }

    if (type === "addIons") {
      baseData.placement = "random";
      baseData.direction = "";
    }

    if (type === "replicate") {
      baseData.keepMolid = true;
      baseData.keepResname = true;
      baseData.renumberIndex = true;
    }

    if (type === "position") {
      baseData.mode = "absolute";
      baseData.resname = "";
    }

    if (type === "solvate") {
      baseData.maxSolventMode = "max";
      baseData.shellThickness = 10;
      baseData.includeSolute = false;
    }

    if (type === "bondAngle") {
      baseData.rmaxH = 1.2;
      baseData.rmaxM = 2.45;
      baseData.sameElementBonds = false;
      baseData.sameMoleculeOnly = true;
      baseData.neighborElement = "";
      baseData.dmMethod = "auto";
      baseData.calcBonds = true;
      baseData.calcAngles = true;
      baseData.calcDihedrals = false;
      baseData.logFile = "bonded_terms.log";
    }

    if (type === "bvs") {
      baseData.topN = 10;
      baseData.logFile = "bvs_summary.log";
      baseData.writeCsv = true;
      baseData.csvFile = "bvs_results.csv";
    }

    if (type === "remove") {
      baseData.atomType = "";
      baseData.indices = "";
      baseData.molids = "";
      baseData.logic = "and";
      baseData.xEnabled = false;
      baseData.yEnabled = false;
      baseData.zEnabled = false;
      baseData.xOp = "<";
      baseData.yOp = "<";
      baseData.zOp = "<";
      baseData.xValue = 0;
      baseData.yValue = 0;
      baseData.zValue = 0;
    }

    if (type === "export") {
      baseData.outputName = "system";
      baseData.structureFormat = "xyz";
      baseData.topologyFormat = "none";
      baseData.angleTerms = "500";
      baseData.writeConect = false;
      baseData.cifTitle = "";
      baseData.topologyRmaxH = 1.2;
      baseData.topologyRmaxM = 2.45;
      baseData.detectBimodal = false;
      baseData.bimodalThreshold = 30;
      baseData.nrexcl = 1;
      baseData.writeN2T = false;
      baseData.n2tFilename = "";
    }
    if (type === "transform") {
      baseData.mode = "translate";
      baseData.translateMode = "absolute";
      baseData.tx = 0; baseData.ty = 0; baseData.tz = 0;
      baseData.rotateMode = "random";
      baseData.rx = 0; baseData.ry = 0; baseData.rz = 0;
      baseData.sx = 1.0; baseData.sy = 1.0; baseData.sz = 1.0;
      baseData.radius = 50;
    }
    if (type === "pbc") {
      baseData.mode = "wrap";
      baseData.unwrapMolid = "";
    }
    if (type === "atomProps") {
      baseData.applyElement = true;
      baseData.applyFormalCharges = false;
      baseData.applyMass = false;
      baseData.computeCom = false;
      baseData.comLogFile = "com_report.json";
    }
    if (type === "coordFrame") {
      baseData.mode = "cart_to_frac";
      baseData.updateBox = true;
      baseData.vectorsFile = "cell_vectors.json";
    }
    if (type === "edit") {
      baseData.mode = "remove";
      baseData.xlo = 0; baseData.ylo = 0; baseData.zlo = 0;
      baseData.removePartial = true;
      baseData.logic = "and";
      baseData.defaultResname = "MIN";
      baseData.byMode = "index";
    }
    if (type === "chemistry") {
      baseData.mode = "substitute";
      baseData.numOct = 0; baseData.numTet = 0;
      baseData.o1Type = "Al"; baseData.o2Type = "Mgo";
      baseData.t1Type = "Si"; baseData.t2Type = "Alt";
      baseData.minO2Dist = 5.5; baseData.minT2Dist = 5.5;
      baseData.dimension = 3;
      baseData.fuseRmax = 0.5; baseData.fuseCriteria = "average";
      baseData.deltaThreshold = -0.5; baseData.maxAdditions = 10;
    }
    if (type === "solvent") {
      baseData.mode = "solvate";
      baseData.waterModel = "spce";
      baseData.density = 1.0;
      baseData.minDistance = 2.25;
      baseData.conversion = "spc2tip4p";
      baseData.omDist = 0.15;
    }
    if (type === "analysis") {
      baseData.mode = "rdf";
      baseData.atomTypeA = "Na";
      baseData.atomTypeB = "Cl";
      baseData.cutoff = 3.5;
      baseData.rmax = 12.0;
      baseData.dr = 0.1;
      baseData.closestReferenceMode = "index";
      baseData.closestRefIndex = 1;
      baseData.closestRefX = 0;
      baseData.closestRefY = 0;
      baseData.closestRefZ = 0;
      baseData.closestOutputMode = "json";
      baseData.closestOutputBase = "closest_results";
      baseData.occupancyRmax = 1.0;
      baseData.occupancyOutputMode = "json";
      baseData.occupancyOutputBase = "occupancy_results";
      baseData.rdfOutputMode = "json";
      baseData.rdfOutputBase = "rdf_results";
      baseData.cnOutputMode = "json";
      baseData.cnOutputBase = "cn_results";
      baseData.topN = 10; baseData.bvsLogFile = "bvs_summary.log";
      baseData.writeCsv = true; baseData.csvFile = "bvs_results.csv";
      baseData.statsLogFile = "output.log";
    }
    if (type === "viewer") {
      baseData.title = "Structure Viewer";
      baseData.width = 500;
      baseData.height = 500;
      baseData.background = "light";
      baseData.viewStyle = "both";
      baseData.showOutline = true;
      baseData.showHydrogens = true;
      baseData.showUnitCell = true;
      baseData.labelMode = "none";
      baseData.spin = false;
      baseData.projection = "perspective";
      baseData.stickRadius = 0.15;
      baseData.sphereScale = 0.25;
      baseData.lineWidth = 1.2;
    }
    if (type === "bend") {
      baseData.radius = 50;
    }
    if (type === "grid") {
      baseData.atomType = "Na";
      baseData.density = 0.1;
      baseData.xlo = 0; baseData.ylo = 0; baseData.zlo = 0;
      baseData.xhi = 10; baseData.yhi = 10; baseData.zhi = 10;
    }
    if (type === "trajectory") {
      baseData.mode = "export";
      baseData.filename = "trajectory.pdb";
      baseData.format = "pdb";
    }
    if (type === "waterModel") {
      baseData.conversion = "spc2tip4p";
      baseData.omDist = 0.15;
    }
    if (type === "condense") {
      // no specific defaults needed
    }

    if (type === "xrd") {
      baseData.wavelength = 1.54187;
      baseData.angleStep = 0.02;
      baseData.twoThetaMin = 2.0;
      baseData.twoThetaMax = 90.0;
      baseData.fwhm00l = 1.0;
      baseData.fwhmhk0 = 0.5;
      baseData.fwhmhkl = 0.5;
      baseData.bAll = 0.0;
      baseData.lorentzianFactor = 1.0;
      baseData.neutralAtoms = false;
      baseData.pref = 0;
      baseData.prefH = 0;
      baseData.prefK = 0;
      baseData.prefL = 1;
    }
    if (type === "plot") {
      baseData.title = "Data Plot";
      baseData.xlabel = "X";
      baseData.ylabel = "Y";
    }

    const newNode: Node = {
      id: `${type}_${new Date().getTime()}`,
      type,
      position: { x: 100, y: 100 },
      data: baseData,
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const applyWorkflowGraph = useCallback(
    (graph: WorkflowGraph) => {
      // Clean nodes to remove bulky data like presets before setting state
      const cleanedNodes = deepClone(graph.nodes).map((node) => {
        if (node.data && typeof node.data === "object") {
          const { presets: _p, ...cleanData } = node.data as Record<string, unknown>;
          return { ...node, data: cleanData };
        }
        return node;
      });
      setNodes(cleanedNodes);
      setEdges(deepClone(graph.edges));
    },
    [setEdges, setNodes],
  );

  const storeCustomTemplates = useCallback((templates: SavedWorkflow[]) => {
    setCustomTemplates(templates);
    try {
      localStorage.setItem(WORKFLOW_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
    } catch {
      console.error("Failed to persist templates in local storage.");
    }
  }, []);

  const storeSavedWorkflows = useCallback((workflows: SavedWorkflow[]) => {
    setSavedWorkflows(workflows);
    try {
      localStorage.setItem(WORKFLOW_SAVED_STORAGE_KEY, JSON.stringify(workflows));
    } catch {
      console.error("Failed to persist workflows in local storage.");
    }
  }, []);

  const handleLoadSelectedWorkflow = useCallback(() => {
    if (selectedWorkflowKey.startsWith("template:")) {
      const templateId = selectedWorkflowKey.replace("template:", "");
      const template = templateWorkflows.find((item) => item.id === templateId);
      if (!template) {
        toast.error("Template workflow not found.");
        return;
      }
      applyWorkflowGraph(template.graph);
      toast.success(`Loaded workflow template: ${template.name}`);
      return;
    }

    if (selectedWorkflowKey.startsWith("saved:")) {
      if (selectedWorkflowKey === "saved:none") {
        toast.error("No saved workflows available.");
        return;
      }
      const savedId = selectedWorkflowKey.replace("saved:", "");
      const saved = savedWorkflows.find((item) => item.id === savedId);
      if (!saved) {
        toast.error("Saved workflow not found.");
        return;
      }
      applyWorkflowGraph({ nodes: saved.nodes, edges: saved.edges });
      toast.success(`Loaded saved workflow: ${saved.name}`);
      return;
    }

    if (selectedWorkflowKey.startsWith("custom:")) {
      if (selectedWorkflowKey === "custom:none") {
        toast.error("No custom templates available.");
        return;
      }
      const customId = selectedWorkflowKey.replace("custom:", "");
      const custom = customTemplates.find((item) => item.id === customId);
      if (!custom) {
        toast.error("Custom template not found.");
        return;
      }
      applyWorkflowGraph({ nodes: custom.nodes, edges: custom.edges });
      toast.success(`Loaded custom template: ${custom.name}`);
    }
  }, [applyWorkflowGraph, customTemplates, savedWorkflows, selectedWorkflowKey]);

  const handleSaveCurrentWorkflow = useCallback(() => {
    const suggestedName = `workflow_${makeTimestampSuffix()}`;
    const rawName = window.prompt("Save workflow as:", suggestedName);
    if (rawName === null) return;
    const name = rawName.trim();
    if (!name) {
      toast.error("Workflow name cannot be empty.");
      return;
    }

    const now = new Date().toISOString();
    const existing = savedWorkflows.find((workflow) => workflow.name.toLowerCase() === name.toLowerCase());
    const entry: SavedWorkflow = {
      id: existing ? existing.id : `${Date.now()}`,
      name,
      updatedAt: now,
      nodes: deepClone(nodes),
      edges: deepClone(edges),
    };

    const next = existing
      ? savedWorkflows.map((workflow) => (workflow.id === existing.id ? entry : workflow))
      : [entry, ...savedWorkflows];

    storeSavedWorkflows(next);
    setSelectedWorkflowKey(`saved:${entry.id}`);
    toast.success(`Workflow saved: ${name}`);
  }, [edges, nodes, savedWorkflows, storeSavedWorkflows]);

  const handleSaveAsTemplate = useCallback(() => {
    const suggestedName = `template_${makeTimestampSuffix()}`;
    const rawName = window.prompt("Save template as:", suggestedName);
    if (rawName === null) return;
    const name = rawName.trim();
    if (!name) {
      toast.error("Template name cannot be empty.");
      return;
    }

    const now = new Date().toISOString();
    const existing = customTemplates.find((template) => template.name.toLowerCase() === name.toLowerCase());
    const entry: SavedWorkflow = {
      id: existing ? existing.id : `${Date.now()}`,
      name,
      updatedAt: now,
      nodes: deepClone(nodes),
      edges: deepClone(edges),
    };

    const next = existing
      ? customTemplates.map((template) => (template.id === existing.id ? entry : template))
      : [entry, ...customTemplates];

    storeCustomTemplates(next);
    setSelectedWorkflowKey(`custom:${entry.id}`);
    toast.success(`Template saved: ${name}`);
  }, [customTemplates, edges, nodes, storeCustomTemplates]);

  const handleDeleteSelectedEntry = useCallback(() => {
    if (selectedWorkflowKey.startsWith("saved:")) {
      const savedId = selectedWorkflowKey.replace("saved:", "");
      const target = savedWorkflows.find((workflow) => workflow.id === savedId);
      if (!target) {
        toast.error("Saved workflow not found.");
        return;
      }

      const confirmed = window.confirm(`Delete saved workflow "${target.name}"?`);
      if (!confirmed) return;

      const next = savedWorkflows.filter((workflow) => workflow.id !== savedId);
      storeSavedWorkflows(next);
      setSelectedWorkflowKey(DEFAULT_WORKFLOW_SELECTION);
      toast.success(`Deleted workflow: ${target.name}`);
      return;
    }

    if (!selectedWorkflowKey.startsWith("custom:")) {
      toast.error("Select a saved workflow or custom template to delete.");
      return;
    }
    const customId = selectedWorkflowKey.replace("custom:", "");
    const target = customTemplates.find((template) => template.id === customId);
    if (!target) {
      toast.error("Custom template not found.");
      return;
    }

    const confirmed = window.confirm(`Delete custom template "${target.name}"?`);
    if (!confirmed) return;

    const next = customTemplates.filter((template) => template.id !== customId);
    storeCustomTemplates(next);
    setSelectedWorkflowKey(DEFAULT_WORKFLOW_SELECTION);
    toast.success(`Deleted template: ${target.name}`);
  }, [customTemplates, savedWorkflows, selectedWorkflowKey, storeCustomTemplates, storeSavedWorkflows]);

  const handleResetWorkflow = useCallback(() => {
    if (window.confirm("Are you sure you want to entirely empty and remove all nodes? This cannot be undone.")) {
      setNodes([]);
      setEdges([]);
      setTrackedNodeOrder([]);
      setNodeRunStatus({});
      setBuildLogs([]);
      setBuildProgress(0);
      setBuildStatus("");
      setShowStatusWindow(false);
      setSelectedWorkflowKey(DEFAULT_WORKFLOW_SELECTION);
    }
  }, [setNodes, setEdges]);

  const handleExportCurrentWorkflow = useCallback(() => {
    const defaultName = `workflow_${makeTimestampSuffix()}`;
    const rawName = window.prompt("Export workflow filename:", defaultName);
    if (rawName === null) return;
    const exportName = rawName.trim() || defaultName;

    const payload = {
      kind: "atomipy-workflow",
      schemaVersion: 1,
      app: "atomipy-web-module",
      exportedAt: new Date().toISOString(),
      name: exportName,
      nodes: deepClone(nodes),
      edges: deepClone(edges),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeFileName(exportName)}.workflow.json`;
    link.click();
    window.URL.revokeObjectURL(url);
    toast.success(`Workflow exported: ${link.download}`);
  }, [edges, nodes]);

  const handleImportWorkflowClick = useCallback(() => {
    workflowImportInputRef.current?.click();
  }, []);

  const handleImportWorkflowFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const imported = parseWorkflowImport(parsed);
        if (!imported) {
          toast.error("Invalid workflow file.");
          return;
        }

        applyWorkflowGraph(imported.graph);
        toast.success(`Workflow imported: ${imported.name}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        toast.error(`Failed to import workflow: ${message}`);
      } finally {
        event.target.value = "";
      }
    },
    [applyWorkflowGraph],
  );

  const handleCompileAndRun = async () => {
    if (nodes.length === 0) {
      toast.error("Workflow Empty", {
        description: "Please add some nodes to your system before building.",
      });
      return;
    }

    const validationErrors = validateWorkflow(nodes, edges);
    if (validationErrors.length > 0) {
      console.error("Workflow validation errors:", validationErrors);
      toast.error("Workflow validation failed", {
        description: validationErrors[0],
      });
      return;
    }

    const runToastId = toast.loading("Running your system... this may take a minute.");
    const isOutputProducing = nodes.some((n) =>
      ["export", "xrd", "bvs", "bondAngle", "stats"].includes(n.type || "")
    );
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const topoOrder = topologicalSortNodeIds(nodes, edges);
    const trackedOrder = topoOrder.filter((nodeId) => shouldTrackNodeStatus(nodeById.get(nodeId)?.type || ""));
    setTrackedNodeOrder(trackedOrder);
    setNodeRunStatus(
      Object.fromEntries(trackedOrder.map((nodeId) => [nodeId, "queued"])) as Record<string, RunNodeStatus>,
    );
    setBuildProgress(0);
    setBuildStatus("Build queued...");
    setBuildLogs([]);
    setDownloadToken(null);
    setIsBuilding(true);
    setShowStatusWindow(true);
    currentRunningNodeRef.current = null;

    try {
      // Default to minimalistic execution for cleaner generated scripts
      const useMinimalExecution = true;
      const fullScript = generatePythonCode(nodes, edges, "full");
      const runtimeScript = useMinimalExecution ? generatePythonCode(nodes, edges, "minimal") : fullScript;
      const strictScriptWithMarkers = generatePythonCode(nodes, edges, "strict");
      const strictScript = stripOperationMarkers(strictScriptWithMarkers);
      const notebookScript = generateNotebookFromStrictScript(nodes, strictScriptWithMarkers);
      const response = await fetch("/api/build-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: runtimeScript,
          workflow: { nodes, edges },
          artifacts: {
            "build_script_full.py": fullScript,
            "build_script_strict_minimal.py": strictScript,
            "build_script_notebook.ipynb": notebookScript,
          },
        }),
      });

      if (!response.ok) throw new Error(`Run request failed: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Could not start stream reader.");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          if (!rawLine.trim() || !rawLine.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(rawLine.slice(6));
            if (data.type === "complete") {
              setIsBuilding(false);
              setBuildStatus(data.success ? "Build completed." : "Build failed.");
              setBuildProgress((prev) => (data.success ? 100 : prev));
              setNodeRunStatus((prev) => {
                const next = { ...prev };
                const runningId = currentRunningNodeRef.current;
                if (runningId && next[runningId] === "running") {
                  next[runningId] = data.success ? "done" : "error";
                }
                Object.keys(next).forEach((nodeId) => {
                  if (next[nodeId] === "queued") {
                    // If build was successful, mark remaining as done (likely finished very fast)
                    next[nodeId] = data.success ? "done" : "skipped";
                  }
                });
                return next;
              });
              currentRunningNodeRef.current = null;
              setDownloadToken(data.token);
              if (data.success) {
                toast.success("Run successful! Download is ready.", { id: runToastId });
              } else {
                toast.error("Run failed. Download contains error details.", { id: runToastId });
              }
              return;
            } else if (data.type === "status") {
              const statusMessage = typeof data.message === "string" ? data.message.trim() : "";
              if (statusMessage) setBuildStatus(statusMessage);
            } else if (data.type === "log") {
              const logLine = typeof data.message === "string" ? data.message.trim() : "";
              if (logLine && 
                  !logLine.includes("__PLOT_") && 
                  !logLine.includes("__VISUALIZE_") && 
                  !logLine.includes("__NODE_START_") &&
                  !logLine.includes("__CHARGES_")) {
                setBuildLogs((prev) => [...prev.slice(-48), logLine]);
              }
            } else if (data.type === "progress") {
              const nodeId = typeof data.nodeId === "string" ? data.nodeId : "";
              if (nodeId) {
                const nodeType = nodeById.get(nodeId)?.type || "node";
                setBuildStatus(`Running ${nodeTypeLabel(nodeType)} (${nodeId})`);

                if (trackedOrder.includes(nodeId)) {
                  setNodeRunStatus((prev) => {
                    const next = { ...prev };
                    const previousRunning = currentRunningNodeRef.current;
                    if (previousRunning && previousRunning !== nodeId && next[previousRunning] === "running") {
                      next[previousRunning] = "done";
                    }
                    next[nodeId] = "running";
                    return next;
                  });
                  currentRunningNodeRef.current = nodeId;

                  const trackedIndex = trackedOrder.indexOf(nodeId);
                  if (trackedIndex >= 0 && trackedOrder.length > 0) {
                    const progressPct = Math.max(
                      5,
                      Math.min(95, Math.round(((trackedIndex + 1) / trackedOrder.length) * 100)),
                    );
                    setBuildProgress(progressPct);
                  }
                }
              }
            } else if (data.type === "visualize") {
              const { nodeId, data: pdbData } = data;
              setNodes((nds) =>
                nds.map((node) => {
                  if (node.id === nodeId) {
                    return {
                      ...node,
                      data: { ...node.data, pdb: pdbData },
                    };
                  }
                  return node;
                })
              );
            } else if (data.type === "plot") {
              const { nodeId, data: plotData } = data;
              setNodes((nds) =>
                nds.map((node) => {
                  if (node.id === nodeId) {
                    return {
                      ...node,
                      data: {
                        ...node.data,
                        plotData,
                      },
                    };
                  }
                  return node;
                })
              );
            } else if (data.type === "charges") {
              const { nodeId, data: chargeData } = data;
              setNodes((nds) =>
                nds.map((node) => {
                  if (node.id === nodeId) {
                    return {
                      ...node,
                      data: { ...node.data, charges: chargeData },
                    };
                  }
                  return node;
                })
              );
            }
          } catch (err) {
            console.error("Error parsing stream chunk:", err);
          }
        }
      }

      setIsBuilding(false);
    } catch (error: unknown) {
      setIsBuilding(false);
      setBuildStatus("Build request failed.");
      setNodeRunStatus((prev) => {
        const next = { ...prev };
        const runningId = currentRunningNodeRef.current;
        if (runningId && next[runningId] === "running") {
          next[runningId] = "error";
        }
        Object.keys(next).forEach((nodeId) => {
          if (next[nodeId] === "queued") next[nodeId] = "skipped";
        });
        return next;
      });
      currentRunningNodeRef.current = null;
      toast.error("Workflow error: " + (error instanceof Error ? error.message : String(error)), { id: runToastId });
    }
  };

  return (
    <section className="mx-auto w-full max-w-[1700px] py-2 px-4 h-[1100px] flex flex-col space-y-1">
      <div className="flex justify-between items-start bg-card/50 backdrop-blur-md p-1.5 rounded-2xl border border-border shadow-2xl">
        <div className="grid grid-cols-[max-content_theme(spacing.28)_1fr] gap-x-2 gap-y-1 items-center w-full">
          {/* Row 1: Main Ribbon + Run + Help Text */}
          <div className="flex bg-muted p-1 rounded-lg flex-nowrap overflow-x-auto w-max">
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("structure")} title="Import Structure">
              <FileInput className="w-4 h-4" /> Import
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("replicate")} title="Replicate">
              <Grid3x3 className="w-4 h-4" /> Rep
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("box")} title="Box Settings">
              <Box className="w-4 h-4" /> Box
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("transform")} title="Spatial Ops (Translate/Rotate/Scale/Bend)">
              <Move3D className="w-4 h-4" /> Spatial
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("add")} title="Join branches">
              <Combine className="w-4 h-4" /> Join
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("insert")} title="Insert Molecule">
              <PackagePlus className="w-4 h-4" /> Insert
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("ions")} title="Add Ions (Random or Grid)">
              <BadgePlus className="w-4 h-4" /> Ions
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("solvent")} title="Solvent (Solvate / Convert Water Model)">
              <Droplet className="w-4 h-4" /> Solvent
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("forcefield")} title="Assign Forcefield">
              <FlaskConical className="w-4 h-4" /> Forcefield
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("analysis")} title="Analysis (RDF/CN/Closest/Occupancy/BVS/Stats)">
              <BarChart3 className="w-4 h-4" /> Analysis
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("viewer")} title="3D Preview Structure">
              <Eye className="w-4 h-4" /> View
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("export")} title="Export">
              <FileOutput className="w-4 h-4" /> Export
            </Button>

            <Button
              className="gap-1"
              variant="ghost"
              size="sm"
              onClick={() => setShowMoreOptions((prev) => !prev)}
              title="More options"
            >
              {showMoreOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              More
            </Button>
          </div>
          <div className="w-28 shrink-0">
            <Button className="shadow-lg shadow-primary/20 w-full h-11" onClick={handleCompileAndRun}>
              <Play className="w-4 h-4 mr-2" />
              Run
            </Button>
          </div>
          <div className="flex justify-end pr-6">
            <p className="text-sm font-medium text-muted-foreground text-balance text-right max-w-[300px]">
              Add and connect nodes into a workflow to build your molecular system
            </p>
          </div>

          {/* Row 2 content (if expanded) */}
          {showMoreOptions && (
            <>
              <div className="flex bg-muted p-1 rounded-lg flex-wrap w-full min-w-0">
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("merge")} title="Merge with overlap removal">
                  <GitMerge className="w-4 h-4" /> Merge
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("pbc")} title="PBC Tools (Wrap/Unwrap/Condense)">
                  <Minimize className="w-4 h-4" /> PBC
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("edit")} title="Edit Atoms (Slice/Remove/Resname/Reorder)">
                  <SlidersHorizontal className="w-4 h-4" /> Edit
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("atomProps")} title="Atom Properties (Element/Charge/Mass/COM)">
                  <Atom className="w-4 h-4" /> Props
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("coordFrame")} title="Transform (Coordinate Frame Tools)">
                  <Move3D className="w-4 h-4" /> Transform
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("chemistry")} title="Chemistry (Substitute/Fuse/AddH)">
                  <FlaskConical className="w-4 h-4" /> Chem
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("bondAngle")} title="Bond and angle statistics">
                  <Waypoints className="w-4 h-4" /> B/A
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("xrd")} title="Run XRD Simulation">
                  <BarChart3 className="w-4 h-4" /> XRD
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("plot")} title="Data Plot">
                  <BarChart className="w-4 h-4 text-indigo-500" /> Plot
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("trajectory")} title="Trajectory">
                  <History className="w-4 h-4" /> Traj
                </Button>
              </div>
              <div className="w-28 shrink-0">
                <Button
                  variant="destructive"
                  className="shadow-lg shadow-destructive/20 w-full h-11 text-xs font-bold uppercase tracking-wider"
                  onClick={handleResetWorkflow}
                  title="Clear all nodes and reset workflow"
                >
                  <Eraser className="w-3.5 h-3.5 mr-2" />
                  Reset
                </Button>
              </div>
              <div /> {/* Grid spacer */}
            </>
          )}

          {/* Row 3 content (if expanded) */}
          {showMoreOptions && (
            <>
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg w-full min-w-0">
                <select
                  className="nodrag min-w-[270px] text-xs bg-background border border-border rounded-md px-2 py-1.5 h-8"
                  value={selectedWorkflowKey}
                  onChange={(e) => setSelectedWorkflowKey(e.target.value)}
                >
                  <optgroup label="Built-in Templates">
                    {templateWorkflows.map((workflow) => (
                      <option key={workflow.id} value={`template:${workflow.id}`}>
                        {workflow.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="My Templates">
                    {customTemplates.length === 0 ? (
                      <option value="custom:none" disabled>
                        No custom templates
                      </option>
                    ) : (
                      customTemplates.map((template) => (
                        <option key={template.id} value={`custom:${template.id}`}>
                          {template.name}
                        </option>
                      ))
                    )}
                  </optgroup>
                  <optgroup label="Saved">
                    {savedWorkflows.length === 0 ? (
                      <option value="saved:none" disabled>
                        No saved workflows
                      </option>
                    ) : (
                      savedWorkflows.map((workflow) => (
                        <option key={workflow.id} value={`saved:${workflow.id}`}>
                          {workflow.name}
                        </option>
                      ))
                    )}
                  </optgroup>
                </select>
                <Button className="gap-1" variant="ghost" size="sm" onClick={handleLoadSelectedWorkflow} title="Load workflow">
                  <FolderOpen className="w-4 h-4" /> Load
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={handleSaveCurrentWorkflow} title="Save current workflow">
                  <Save className="w-4 h-4" /> Save
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={handleSaveAsTemplate} title="Save current workflow as template">
                  <Save className="w-4 h-4" /> Save Tpl
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={handleExportCurrentWorkflow} title="Download workflow JSON file">
                  <Download className="w-4 h-4" /> Download
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={handleImportWorkflowClick} title="Upload workflow JSON file">
                  <Upload className="w-4 h-4" /> Upload
                </Button>
                
                <div className="h-6 w-[1px] bg-border mx-1" /> {/* Separator */}
                
                <div className="flex items-center gap-1 bg-slate-200/50 rounded-md p-1 border border-slate-300 shadow-inner">
                  <Button 
                    variant={edgeType === "bezier" ? "default" : "ghost"} 
                    size="xs" 
                    className={`h-7 text-[10px] px-3 uppercase font-black transition-all ${
                      edgeType === "bezier" ? "shadow-sm" : "text-slate-500"
                    }`}
                    onClick={() => setEdgeType("bezier")}
                  >
                    Smooth
                  </Button>
                  <Button 
                    variant={edgeType === "step" ? "default" : "ghost"} 
                    size="xs" 
                    className={`h-7 text-[10px] px-3 uppercase font-black transition-all ${
                      edgeType === "step" ? "shadow-sm" : "text-slate-500"
                    }`}
                    onClick={() => setEdgeType("step")}
                  >
                    Step
                  </Button>
                </div>

                {(selectedSavedWorkflow || selectedCustomTemplate) && (
                  <Button className="gap-1" variant="ghost" size="sm" onClick={handleDeleteSelectedEntry} title="Delete selected workflow/template">
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                )}
                <input
                  ref={workflowImportInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportWorkflowFile}
                />
              </div>
              <div /> {/* Grid spacer */}
              <div /> {/* Grid spacer */}
            </>
          )}
        </div>
      </div>

      <div className="flex-1 rounded-2xl overflow-hidden border border-border bg-muted/20 relative" ref={reactFlowWrapper}>
        {showStatusWindow && (
          <div className="absolute right-3 top-3 z-20 w-[360px] rounded-xl border border-border bg-card/95 p-2.5 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Node Status</p>
                {isBuilding && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">{Math.round(buildProgress)}%</p>
                <button
                  onClick={() => setShowStatusWindow(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Close Status Window"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <Progress value={buildProgress} className="h-1 mb-2" />
            <p className="text-xs text-muted-foreground mb-2">{buildStatus || "Waiting for backend updates..."}</p>
            <div className="max-h-[480px] overflow-y-auto space-y-1 pr-1 scrollbar-thin" ref={scrollRef}>
              {trackedNodeOrder.length === 0 && (
                <p className="text-xs text-muted-foreground">No tracked compute nodes in current workflow.</p>
              )}
              {trackedNodeOrder.map((nodeId) => {
                const node = nodes.find((item) => item.id === nodeId);
                const status = nodeRunStatus[nodeId];
                return (
                  <div key={nodeId} className="flex items-center justify-between rounded-md border border-border/70 bg-background/70 px-2 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT_CLASS[status || "queued"]}`} />
                      <span className="truncate text-xs font-medium">
                        {nodeTypeLabel(node?.type)} <span className="text-muted-foreground">({nodeId})</span>
                      </span>
                    </div>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{statusToLabel(status)}</span>
                  </div>
                );
              })}
              {buildLogs.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Execution Logs</p>
                  <div className="bg-muted/30 rounded-lg p-2 font-mono text-[10px] space-y-1">
                    {buildLogs.map((line, idx) => (
                      <p key={`${line}-${idx}`} className="text-muted-foreground break-words leading-relaxed">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {downloadToken && (
                <div className="mt-3 pt-3 border-t border-border">
                  <a
                    href={`/api/download-result/${downloadToken}`}
                    download
                    className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-all hover:shadow-lg active:scale-[0.98]"
                  >
                    <Download className="w-4 h-4" />
                    Download Results
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes.map((n) => ({
              ...n,
              data: { ...n.data, presets },
              style: {
                ...(n.style || {}),
                ...getNodeStatusStyle(nodeRunStatus[n.id]),
              },
            }))}
            edges={edges}
            onNodesChange={(changes) => setNodes((nds) => applyNodeChanges(changes, nds))}
            onEdgesChange={(changes) => setEdges((eds) => applyEdgeChanges(changes, eds))}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: "deletable" }}
            fitView
            fitViewOptions={{ padding: 0.4, maxZoom: 0.8 }}
          >
            <Controls />
            <Background gap={20} size={1} color="rgba(0,0,0,0.1)" />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </section>
  );
}

function generatePythonCode(nodes: Node[], edges: Edge[], mode: PythonScriptMode = "full") {
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

  const stateVars = new Map<string, { atoms: string; box: string }>();

  sorted.forEach((id, index) => {
    const n = nodeMap.get(id)!;
    const data = (n.data ?? {}) as NodeDataMap;
    const blockOutAtoms = `${n.type}_atoms_${index}`;
    const blockOutBox = `${n.type}_box_${index}`;

    const incomingEdges = edges.filter((e) => e.target === id);
    let inAtoms = "None";
    let inBox = "None";

    const isMultiInputNode = n.type === "merge" || n.type === "add";

    if (!isMultiInputNode && incomingEdges.length > 0) {
      const validParents = incomingEdges
        .filter((e) => stateVars.has(e.source))
        .map((e) => stateVars.get(e.source)!);

      if (validParents.length === 1) {
        inAtoms = validParents[0].atoms;
        inBox = validParents[0].box;
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
    const nodeBlockStart = pythonCode.length;

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
        // Collect all incoming edges and sort them by handle ID to ensure predictable join order
        // 1. Check explicit handles in order: inA, inB, then in1, in2, in3, in4, in5, in6
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

        // 2. Also catch any edges that might have no targetHandle or unknown handle (safety)
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
          // Box_dim mode: lx, ly, lz, xy, xz, yz
          const lx = getOptionalNumber(data, "lx");
          const ly = getOptionalNumber(data, "ly");
          const lz = getOptionalNumber(data, "lz");
          const xy = getOptionalNumber(data, "xy");
          const xz = getOptionalNumber(data, "xz");
          const yz = getOptionalNumber(data, "yz");

          // Fallback to upstream components at runtime if fields are empty
          const lxExpr = lx !== null ? `${lx}` : (inBox !== "None" ? `(float(${inBox}[0]) if len(${inBox}) >= 1 else 50.0)` : "50.0");
          const lyExpr = ly !== null ? `${ly}` : (inBox !== "None" ? `(float(${inBox}[1]) if len(${inBox}) >= 2 else 50.0)` : "50.0");
          const lzExpr = lz !== null ? `${lz}` : (inBox !== "None" ? `(float(${inBox}[2]) if len(${inBox}) >= 3 else 50.0)` : "50.0");
          const xyExpr = xy !== null ? `${xy}` : (inBox !== "None" ? `(float(${inBox}[5]) if len(${inBox}) >= 9 else (float(${inBox}[3]) if len(${inBox}) == 6 else 0.0))` : "0.0");
          const xzExpr = xz !== null ? `${xz}` : (inBox !== "None" ? `(float(${inBox}[7]) if len(${inBox}) >= 9 else (float(${inBox}[4]) if len(${inBox}) == 6 else 0.0))` : "0.0");
          const yzExpr = yz !== null ? `${yz}` : (inBox !== "None" ? `(float(${inBox}[8]) if len(${inBox}) >= 9 else (float(${inBox}[5]) if len(${inBox}) == 6 else 0.0))` : "0.0");

          // Emit Box_dim directly
          // If tilts are zero, use compact [lx,ly,lz]
          const definitelyOrtho = (xy === 0 && xz === 0 && yz === 0);
          if (definitelyOrtho) {
            pythonCode += `${blockOutBox} = [${lxExpr}, ${lyExpr}, ${lzExpr}]\n`;
          } else {
            // Use 9-component representation for maximum compatibility with atomipy.cell_utils
            pythonCode += `${blockOutBox} = [${lxExpr}, ${lyExpr}, ${lzExpr}, 0.0, 0.0, ${xyExpr}, 0.0, ${xzExpr}, ${yzExpr}]\n`;
          }
        } else {
          // Cell mode: a, b, c, alpha, beta, gamma
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
          // Random mode (ap.ionize)
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
        const sdist = getNumber(data, "minDistance", 2.2);
        const maxSolventMode = getString(data, "maxSolventMode", "max");
        const maxSolventCount = Math.max(1, Math.round(getNumber(data, "maxSolventCount", 1)));
        const shellThickness = getNumber(data, "shellThickness", 10);
        const includeSolute = getBoolean(data, "includeSolute", false);
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
          : `${inBox}`;
        let maxSolventExpr = "'max'";
        if (maxSolventMode === "count") {
          maxSolventExpr = `${maxSolventCount}`;
        } else if (maxSolventMode === "shell") {
          const shellStr = Number.isInteger(shellThickness) ? `${shellThickness.toFixed(0)}` : `${shellThickness}`;
          maxSolventExpr = `'shell${shellStr}'`;
        }
        const wrappedInAtoms = `wrapped_${index}`;
        const solventVar = `solvent_${index}`;
        const includeSolutePy = includeSolute ? "True" : "False";
        pythonCode += `${wrappedInAtoms} = ap.wrap(${inAtoms}, ${inBox})\n`;
        pythonCode += `${solventVar} = ap.solvate(limits=${limitsExpr}, density=${dens}, min_distance=${sdist}, max_solvent=${maxSolventExpr}, solute_atoms=${wrappedInAtoms}, Box=${inBox}, solvent_type='${model}', include_solute=${includeSolutePy})\n`;
        if (includeSolute) {
          pythonCode += `${blockOutAtoms} = ${solventVar}\n`;
        } else {
          pythonCode += `${blockOutAtoms} = ap.update(${inAtoms}, ${solventVar})\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "wrap": {
        pythonCode += `${blockOutAtoms} = ap.wrap(${inAtoms}, ${inBox})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "addH": {
        const delta = getNumber(data, "deltaThreshold", -0.5);
        const maxAdd = getNumber(data, "maxAdditions", 10);
        pythonCode += `${blockOutAtoms} = ap.add_hydrogens_bvs(${inAtoms}, ${inBox}, delta_threshold=${delta}, max_additions=${maxAdd})\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "stats": {
        const logFile = pyEscape(getString(data, "logFile", "output.log"));
        pythonCode += `ap.get_structure_stats(${inAtoms}, Box=${inBox}, log_file='${logFile}')\n`;
        // Pass atoms and box through unchanged
        stateVars.set(id, { atoms: inAtoms, box: inBox });
        break;
      }
      case "bend": {
        const radius = getNumber(data, "radius", 50);
        pythonCode += `${blockOutAtoms} = ap.bend(${inAtoms}, ${radius})\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "condense": {
        pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.condense(${inAtoms}, ${inBox})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "grid": {
        const atomType = getString(data, "atomType", "Na");
        const density = getNumber(data, "density", 0.1);
        const gxlo = getNumber(data, "xlo", 0);
        const gylo = getNumber(data, "ylo", 0);
        const gzlo = getNumber(data, "zlo", 0);
        const gxhi = getNumber(data, "xhi", 10);
        const gyhi = getNumber(data, "yhi", 10);
        const gzhi = getNumber(data, "zhi", 10);
        pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.create_grid('${pyEscape(atomType)}', ${density}, [${gxlo}, ${gylo}, ${gzlo}, ${gxhi}, ${gyhi}, ${gzhi}])\n`;
        pythonCode += `if ${inAtoms} is not None and len(${inAtoms}) > 0:\n`;
        pythonCode += `    ${blockOutAtoms} = ap.update(${inAtoms}, ${blockOutAtoms})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "analysis": {
        const amode = getString(data, "mode", "rdf");
        if (amode === "unwrap") {
          pythonCode += `# Structure Analysis no longer exposes unwrap. Use a PBC node set to Unwrap Coordinates.\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (amode === "rdf") {
          const typeA = pyEscape(getString(data, "atomTypeA", "Na"));
          const typeB = pyEscape(getString(data, "atomTypeB", "Cl"));
          const rmax = getNumber(data, "rmax", 12.0);
          const dr = getNumber(data, "dr", 0.1);
          const outputMode = getString(data, "rdfOutputMode", "json");
          const outputBase = pyEscape(getString(data, "rdfOutputBase", "rdf_results"));
          const writeJson = outputMode === "json" || outputMode === "both";
          const writeCsv = outputMode === "csv" || outputMode === "both";
          pythonCode += `r_rdf, g_r = ap.calculate_rdf(${inAtoms}, ${inBox}, typeA='${typeA}', typeB='${typeB}', rmax=${rmax}, dr=${dr})\n`;
          
          const plotTargetIds = edges
            .filter((e) => e.source === id && e.sourceHandle === "data")
            .map((e) => e.target);
          const allPlotIds = [id, ...plotTargetIds];
          allPlotIds.forEach(pid => {
            pythonCode += `ap_plot('${pid}', r_rdf, g_r, title="RDF: ${typeA}-${typeB}", xlabel="r (A)", ylabel="g(r)")\n`;
          });

          if (writeJson) {
            pythonCode += `with open('${outputBase}.json', 'w') as _rdf_json:\n`;
            pythonCode += `    json.dump({"bins": r_rdf.tolist(), "rdf": g_r.tolist()}, _rdf_json)\n`;
          }
          if (writeCsv) {
            pythonCode += `with open('${outputBase}.csv', 'w') as _rdf_csv:\n`;
            pythonCode += `    _rdf_csv.write('r,rdf\\n')\n`;
            pythonCode += `    for _ri, _gi in zip(r_rdf.tolist(), g_r.tolist()):\n`;
            pythonCode += `        _rdf_csv.write(f"{float(_ri):.8f},{float(_gi):.8f}\\n")\n`;
          }
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (amode === "cn") {
          const typeA = pyEscape(getString(data, "atomTypeA", "Na"));
          const typeB = getString(data, "atomTypeB", "").trim();
          const cutoff = getNumber(data, "cutoff", 3.5);
          const outputMode = getString(data, "cnOutputMode", "json");
          const outputBase = pyEscape(getString(data, "cnOutputBase", "cn_results"));
          const writeJson = outputMode === "json" || outputMode === "both";
          const writeCsv = outputMode === "csv" || outputMode === "both";
          const typeBArg = typeB ? `, typeB='${pyEscape(typeB)}'` : "";
          pythonCode += `cn_data = ap.coordination_number(${inAtoms}, ${inBox}, typeA='${typeA}', cutoff=${cutoff}${typeBArg})\n`;
          if (writeJson) {
            pythonCode += `with open('${outputBase}.json', 'w') as _cn_json:\n`;
            pythonCode += `    json.dump({"coordination_number": cn_data}, _cn_json)\n`;
          }
          if (writeCsv) {
            pythonCode += `with open('${outputBase}.csv', 'w') as _cn_csv:\n`;
            pythonCode += `    _cn_csv.write('index,coordination_number\\n')\n`;
            pythonCode += `    for _idx, _cnv in enumerate(cn_data, start=1):\n`;
            pythonCode += `        _cn_csv.write(f"{_idx},{int(_cnv)}\\n")\n`;
          }
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (amode === "closest") {
          const refMode = getString(data, "closestReferenceMode", "index");
          const outputMode = getString(data, "closestOutputMode", "json");
          const outputBase = pyEscape(getString(data, "closestOutputBase", "closest_results"));
          const writeJson = outputMode === "json" || outputMode === "both";
          const writeCsv = outputMode === "csv" || outputMode === "both";
          if (refMode === "coords") {
            const refX = getNumber(data, "closestRefX", 0);
            const refY = getNumber(data, "closestRefY", 0);
            const refZ = getNumber(data, "closestRefZ", 0);
            pythonCode += `closest_data = ap.closest_atom(${inAtoms}, [${refX}, ${refY}, ${refZ}], Box=${inBox})\n`;
          } else {
            const refIdx = Math.max(1, Math.round(getNumber(data, "closestRefIndex", 1)));
            pythonCode += `_closest_ref_idx = max(0, min(len(${inAtoms}) - 1, ${refIdx} - 1)) if ${inAtoms} else 0\n`;
            pythonCode += `_closest_ref = ${inAtoms}[_closest_ref_idx] if ${inAtoms} else {'x': 0.0, 'y': 0.0, 'z': 0.0}\n`;
            pythonCode += `closest_data = ap.closest_atom(${inAtoms}, _closest_ref, Box=${inBox})\n`;
          }
          if (writeJson) {
            pythonCode += `with open('${outputBase}.json', 'w') as _closest_json:\n`;
            pythonCode += `    json.dump({"closest_atom": closest_data}, _closest_json)\n`;
          }
          if (writeCsv) {
            pythonCode += `with open('${outputBase}.csv', 'w') as _closest_csv:\n`;
            pythonCode += `    _closest_csv.write('index,type,element,x,y,z,charge\\n')\n`;
            pythonCode += `    if closest_data:\n`;
            pythonCode += `        _closest_csv.write(f"{closest_data.get('index', '')},{closest_data.get('type', '')},{closest_data.get('element', '')},{closest_data.get('x', '')},{closest_data.get('y', '')},{closest_data.get('z', '')},{closest_data.get('charge', '')}\\n")\n`;
          }
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (amode === "occupancy") {
          const occupancyRmax = getNumber(data, "occupancyRmax", 1.0);
          const outputMode = getString(data, "occupancyOutputMode", "json");
          const outputBase = pyEscape(getString(data, "occupancyOutputBase", "occupancy_results"));
          const writeJson = outputMode === "json" || outputMode === "both";
          const writeCsv = outputMode === "csv" || outputMode === "both";
          pythonCode += `if hasattr(ap, 'occupancy_atom'):\n`;
          pythonCode += `    ${blockOutAtoms}, occupancy_values = ap.occupancy_atom(${inAtoms}, ${inBox}, rmax=${occupancyRmax})\n`;
          pythonCode += `else:\n`;
          pythonCode += `    _dist, _, _, _ = ap.dist_matrix(${inAtoms}, ${inBox})\n`;
          pythonCode += `    occupancy_values = []\n`;
          pythonCode += `    for _i in range(len(${inAtoms})):\n`;
          pythonCode += `        _neighbors = [_d for _d in _dist[:, _i] if _d < ${occupancyRmax}]\n`;
          pythonCode += `        _occ = (1.0 / len(_neighbors)) if len(_neighbors) > 0 else 0.0\n`;
          pythonCode += `        ${inAtoms}[_i]['occupancy'] = _occ\n`;
          pythonCode += `        occupancy_values.append(_occ)\n`;
          pythonCode += `    ${blockOutAtoms} = ${inAtoms}\n`;
          if (writeJson) {
            pythonCode += `with open('${outputBase}.json', 'w') as _occ_json:\n`;
            pythonCode += `    _occ_out = occupancy_values.tolist() if hasattr(occupancy_values, 'tolist') else list(occupancy_values)\n`;
            pythonCode += `    json.dump({"occupancy": _occ_out}, _occ_json)\n`;
          }
          if (writeCsv) {
            pythonCode += `with open('${outputBase}.csv', 'w') as _occ_csv:\n`;
            pythonCode += `    _occ_csv.write('index,occupancy\\n')\n`;
            pythonCode += `    _occ_out = occupancy_values.tolist() if hasattr(occupancy_values, 'tolist') else list(occupancy_values)\n`;
            pythonCode += `    for _idx, _occ in enumerate(_occ_out, start=1):\n`;
            pythonCode += `        _occ_csv.write(f"{_idx},{float(_occ):.8f}\\n")\n`;
          }
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (amode === "bvs") {
          const topN = Math.max(1, Math.round(getNumber(data, "topN", 10)));
          const bvsLog = pyEscape(getString(data, "bvsLogFile", "bvs_summary.log"));
          const writeCsv = getBoolean(data, "writeCsv", true);
          const csvFile = pyEscape(getString(data, "csvFile", "bvs_results.csv"));
          const csvPathExpr = writeCsv ? `'${csvFile}'` : "None";
          const reportVar = `analysis_bvs_report_${index}`;
          pythonCode += `${reportVar} = ap.analyze_bvs(${inAtoms}, ${inBox}, csv_path=${csvPathExpr}, top_n=${topN})\n`;
          pythonCode += `with open('${bvsLog}', 'w') as _bvs_log:\n`;
          pythonCode += `    _bvs_log.write('BVS Analysis Summary\\n')\n`;
          pythonCode += `    _bvs_log.write(f"GII: {${reportVar}.get('gii', 0.0):.6f}\\n")\n`;
          pythonCode += `    _bvs_log.write(f"GII (no H): {${reportVar}.get('gii_no_h', 0.0):.6f}\\n")\n`;
          pythonCode += `    _bvs_log.write(f"Formal charge: {${reportVar}.get('formal_charge', 0)}\\n")\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (amode === "stats") {
          const statsLog = pyEscape(getString(data, "statsLogFile", "output.log"));
          pythonCode += `ap.get_structure_stats(${inAtoms}, Box=${inBox}, log_file='${statsLog}')\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "trajectory": {
        const tmode = getString(data, "mode", "export");
        const tfilename = pyEscape(getString(data, "filename", "trajectory.pdb"));
        const tformat = pyEscape(getString(data, "format", "pdb"));
        if (tmode === "import") {
          pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_traj('${tfilename}', format='${tformat}', start=0, stop=1)[0]\n`;
        } else {
          pythonCode += `ap.write_traj(${inAtoms}, ${inBox}, '${tfilename}', format='${tformat}', append=True)\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "waterModel": {
        const conv = getString(data, "conversion", "spc2tip4p");
        if (conv === "spc2tip4p") {
          const omDist = getNumber(data, "omDist", 0.15);
          pythonCode += `${blockOutAtoms} = ap.spc2tip4p(${inAtoms}, Box=${inBox}, om_dist=${omDist})\n`;
        } else {
          pythonCode += `${blockOutAtoms} = ap.tip3p2tip4p(${inAtoms}, Box=${inBox})\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: inBox });
        break;
      }
      case "transform": {
        const tmode = getString(data, "mode", "translate");
        if (tmode === "translate") {
          const transMode = getString(data, "translateMode", "absolute");
          const tx = getNumber(data, "tx", 0);
          const ty = getNumber(data, "ty", 0);
          const tz = getNumber(data, "tz", 0);
          const transResname = getString(data, "translateResname", "").trim();
          const resnameArg = transResname ? `, resname='${pyEscape(transResname)}'` : "";
          if (transMode === "absolute") {
            pythonCode += `${blockOutAtoms} = ap.center(${inAtoms}, [${tx}, ${ty}, ${tz}])\n`;
          } else {
            pythonCode += `${blockOutAtoms} = ap.translate(${inAtoms}, [${tx}, ${ty}, ${tz}]${resnameArg})\n`;
          }
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (tmode === "rotate") {
          const rotMode = getString(data, "rotateMode", "random");
          if (rotMode === "random") {
            pythonCode += `${blockOutAtoms} = ap.rotate(${inAtoms}, ${inBox})\n`;
          } else {
            const rx = getNumber(data, "rx", 0);
            const ry = getNumber(data, "ry", 0);
            const rz = getNumber(data, "rz", 0);
            pythonCode += `${blockOutAtoms} = ap.rotate(${inAtoms}, ${inBox}, angles=[${rx}, ${ry}, ${rz}])\n`;
          }
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (tmode === "scale") {
          const sx = getNumber(data, "sx", 1.0);
          const sy = getNumber(data, "sy", 1.0);
          const sz = getNumber(data, "sz", 1.0);
          const scaleRes = getString(data, "scaleResname", "").trim();
          const scaleResArg = scaleRes ? `, resname='${pyEscape(scaleRes)}'` : "";
          pythonCode += `${blockOutAtoms} = ap.scale(${inAtoms}, ${sx}, ${sy}, ${sz}${scaleResArg})\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (tmode === "bend") {
          const radius = getNumber(data, "radius", 50);
          pythonCode += `${blockOutAtoms} = ap.bend(${inAtoms}, ${radius})\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "pbc": {
        const pbcMode = getString(data, "mode", "wrap");
        if (pbcMode === "condense") {
          pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.condense(${inAtoms}, ${inBox})\n`;
        } else if (pbcMode === "unwrap") {
          const unwrapMolidRaw = getString(data, "unwrapMolid", "").trim();
          const unwrapMolidTokens = unwrapMolidRaw
            .split(/[;,]+/)
            .map((token) => token.trim())
            .filter((token) => /^-?\\d+$/.test(token))
            .map((token) => parseInt(token, 10));
          if (unwrapMolidTokens.length === 1) {
            pythonCode += `${blockOutAtoms} = ap.unwrap_coordinates(${inAtoms}, ${inBox}, molid=${unwrapMolidTokens[0]})\n`;
          } else if (unwrapMolidTokens.length > 1) {
            pythonCode += `${blockOutAtoms} = ap.unwrap_coordinates(${inAtoms}, ${inBox}, molid=[${unwrapMolidTokens.join(", ")}])\n`;
          } else {
            pythonCode += `${blockOutAtoms} = ap.unwrap_coordinates(${inAtoms}, ${inBox})\n`;
          }
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else {
          pythonCode += `${blockOutAtoms} = ap.wrap(${inAtoms}, ${inBox})\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "atomProps": {
        const applyElement = getBoolean(data, "applyElement", true);
        const applyFormalCharges = getBoolean(data, "applyFormalCharges", false);
        const applyMass = getBoolean(data, "applyMass", false);
        const computeCom = getBoolean(data, "computeCom", false);
        const comLogFile = pyEscape(getString(data, "comLogFile", "com_report.json"));
        const comVar = `com_${index}`;

        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        if (applyElement) {
          pythonCode += `${blockOutAtoms} = ap.element(${blockOutAtoms})\n`;
        }
        if (applyFormalCharges) {
          pythonCode += `${blockOutAtoms} = ap.assign_formal_charges(${blockOutAtoms})\n`;
        }
        if (applyMass) {
          pythonCode += `${blockOutAtoms} = ap.set_atomic_masses(${blockOutAtoms})\n`;
        }
        if (computeCom) {
          pythonCode += `${comVar} = ap.com(${blockOutAtoms}, add_to_atoms=True)\n`;
          pythonCode += `with open('${comLogFile}', 'w') as _com_file:\n`;
          pythonCode += `    json.dump({"com": [float(${comVar}[0]), float(${comVar}[1]), float(${comVar}[2])]}, _com_file)\n`;
        }
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "coordFrame": {
        const coordMode = getString(data, "mode", "cart_to_frac");
        const updateBox = getBoolean(data, "updateBox", true);
        const vectorsFile = pyEscape(getString(data, "vectorsFile", "cell_vectors.json"));
        const boxCellVar = `cell_${index}`;
        const orthoBoxVar = `ortho_box_${index}`;
        const orthoCoordsVar = `ortho_coords_${index}`;
        const cellVectorsVar = `cell_vectors_${index}`;

        if (inBox === "None") {
          pythonCode += `# Coordinate frame operation skipped: missing input box\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
          stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
          break;
        }

        if (coordMode === "cart_to_frac") {
          pythonCode += `_, ${blockOutAtoms} = ap.cartesian_to_fractional(atoms=${inAtoms}, Box=${inBox}, add_to_atoms=True)\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (coordMode === "frac_to_cart") {
          pythonCode += `_, ${blockOutAtoms} = ap.fractional_to_cartesian(atoms=${inAtoms}, Box=${inBox}, add_to_atoms=True)\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (coordMode === "triclinic_to_ortho") {
          pythonCode += `_, ${blockOutAtoms}, ${orthoBoxVar} = ap.triclinic_to_orthogonal(atoms=${inAtoms}, Box=${inBox}, add_to_atoms=True)\n`;
          if (updateBox) {
            pythonCode += `${blockOutBox} = ${orthoBoxVar}.tolist() if hasattr(${orthoBoxVar}, 'tolist') else list(${orthoBoxVar})\n`;
          } else {
            pythonCode += `${blockOutBox} = ${inBox}\n`;
          }
        } else if (coordMode === "ortho_to_triclinic") {
          pythonCode += `${boxCellVar} = ap.Box_dim2Cell(${inBox})\n`;
          pythonCode += `${orthoCoordsVar} = [[a.get('x_ortho', a.get('x', 0.0)), a.get('y_ortho', a.get('y', 0.0)), a.get('z_ortho', a.get('z', 0.0))] for a in ${inAtoms}]\n`;
          pythonCode += `_, ${blockOutAtoms} = ap.orthogonal_to_triclinic(${orthoCoordsVar}, ${boxCellVar}, atoms=${inAtoms}, add_to_atoms=True)\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else {
          pythonCode += `${boxCellVar} = ap.Box_dim2Cell(${inBox})\n`;
          pythonCode += `${cellVectorsVar} = ap.get_cell_vectors(${boxCellVar})\n`;
          pythonCode += `with open('${vectorsFile}', 'w') as _vectors_file:\n`;
          pythonCode += `    json.dump({"cell_vectors": ${cellVectorsVar}.tolist() if hasattr(${cellVectorsVar}, 'tolist') else ${cellVectorsVar}}, _vectors_file)\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "edit": {
        const editMode = getString(data, "mode", "remove");
        if (editMode === "slice") {
          const exlo = getNumber(data, "xlo", 0); const eylo = getNumber(data, "ylo", 0); const ezlo = getNumber(data, "zlo", 0);
          const exhi = data.xhi != null ? getNumber(data, "xhi", 0) : null;
          const eyhi = data.yhi != null ? getNumber(data, "yhi", 0) : null;
          const ezhi = data.zhi != null ? getNumber(data, "zhi", 0) : null;
          const rmPartial = getBoolean(data, "removePartial", true) ? "True" : "False";
          const xhiExpr = exhi !== null ? String(exhi) : "None";
          const yhiExpr = eyhi !== null ? String(eyhi) : "None";
          const zhiExpr = ezhi !== null ? String(ezhi) : "None";
          pythonCode += `${blockOutAtoms} = ap.slice(${inAtoms}, ${inBox}, xlo=${exlo}, ylo=${eylo}, zlo=${ezlo}, xhi=${xhiExpr}, yhi=${yhiExpr}, zhi=${zhiExpr}, remove_partial_molecules=${rmPartial})\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (editMode === "remove") {
          const atomType = getString(data, "atomType", "").trim();
          const indices = getString(data, "indices", "").trim();
          const molids = getString(data, "molids", "").trim();
          const logic = getString(data, "logic", "and");
          const atomTypeArg = atomType ? `, atomtype='${pyEscape(atomType)}'` : "";
          const indicesArg = indices ? `, indices=[${indices}]` : "";
          const molidsArg = molids ? `, molids=[${molids}]` : "";
          const axes: string[] = [];
          (["x", "y", "z"] as const).forEach((axis) => {
            if (data[`${axis}Enabled`]) {
              const op = data[`${axis}Op`] || "<";
              const val = data[`${axis}Value`] ?? 0;
              axes.push(`${axis}_op='${op}', ${axis}_val=${val}`);
            }
          });
          const axesArg = axes.length > 0 ? `, ${axes.join(", ")}` : "";
          pythonCode += `${blockOutAtoms} = ap.remove(${inAtoms}${atomTypeArg}${indicesArg}${molidsArg}, logic='${logic}'${axesArg})\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (editMode === "molecule") {
          const molid = Math.max(1, Math.round(getNumber(data, "molid", 1)));
          const molRes = getString(data, "moleculeResname", "").trim();
          const molResArg = molRes ? `, resname='${pyEscape(molRes)}'` : "";
          pythonCode += `${blockOutAtoms} = ap.molecule(${inAtoms}, molid=${molid}${molResArg})\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (editMode === "resname") {
          const defResname = pyEscape(getString(data, "defaultResname", "MIN"));
          pythonCode += `${blockOutAtoms} = ap.assign_resname(${inAtoms}, default_resname='${defResname}')\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (editMode === "reorder") {
          const byMode = getString(data, "byMode", "index");
          const neworder = getString(data, "neworder", "");
          const orderList = neworder.split(",").map((v) => v.trim()).filter(Boolean);
          const orderExpr = byMode === "index"
            ? `[${orderList.map((v) => parseInt(v) || 0).join(", ")}]`
            : `['${orderList.map(pyEscape).join("', '")}']`;
          pythonCode += `${blockOutAtoms} = ap.reorder(${inAtoms}, ${orderExpr}, by='${byMode}')\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "chemistry": {
        const chemMode = getString(data, "mode", "substitute");
        if (chemMode === "substitute") {
          const numOct = Math.round(getNumber(data, "numOct", 0));
          const numTet = Math.round(getNumber(data, "numTet", 0));
          const o1 = pyEscape(getString(data, "o1Type", "Al"));
          const o2 = pyEscape(getString(data, "o2Type", "Mgo"));
          const t1 = pyEscape(getString(data, "t1Type", "Si"));
          const t2 = pyEscape(getString(data, "t2Type", "Alt"));
          const mo2 = getNumber(data, "minO2Dist", 5.5);
          const mt2 = getNumber(data, "minT2Dist", 5.5);
          const loLim = data.loLimit != null ? String(getNumber(data, "loLimit", 0)) : "None";
          const hiLim = data.hiLimit != null ? String(getNumber(data, "hiLimit", 1)) : "None";
          const dim = Math.round(getNumber(data, "dimension", 3));
          pythonCode += `${blockOutAtoms}, ${blockOutBox}, _ = ap.substitute(${inAtoms}, ${inBox}, num_oct_subst=${numOct}, o1_type='${o1}', o2_type='${o2}', min_o2o2_dist=${mo2}, num_tet_subst=${numTet}, t1_type='${t1}', t2_type='${t2}', min_t2t2_dist=${mt2}, lo_limit=${loLim}, hi_limit=${hiLim}, dimension=${dim})\n`;
        } else if (chemMode === "fuse") {
          const fuseR = getNumber(data, "fuseRmax", 0.5);
          const fuseCrit = pyEscape(getString(data, "fuseCriteria", "average"));
          pythonCode += `${blockOutAtoms} = ap.fuse_atoms(${inAtoms}, ${inBox}, rmax=${fuseR}, criteria='${fuseCrit}')\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else if (chemMode === "addH") {
          const delta = getNumber(data, "deltaThreshold", -0.5);
          const maxAdd = getNumber(data, "maxAdditions", 10);
          const bondLen = getNumber(data, "bondLength", 0.96);
          pythonCode += `${blockOutAtoms} = ap.add_hydrogens_bvs(${inAtoms}, ${inBox}, delta_threshold=${delta}, max_additions=${maxAdd}, bond_length=${bondLen})\n`;
          const adjustH = getBoolean(data, "adjustH", false);
          if (adjustH) {
            const hDist = getNumber(data, "hDistance", 0.96);
            pythonCode += `${blockOutAtoms} = ap.adjust_H_atom(${blockOutAtoms}, ${inBox}, distance=${hDist})\n`;
          }
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "solvent": {
        const solMode = getString(data, "mode", "solvate");
        if (solMode === "solvate") {
          // Re-use the existing solvate code generation logic
          const model = pyEscape(getString(data, "waterModel", "spce"));
          const dens = getNumber(data, "density", 1.0);
          const sdist = getNumber(data, "minDistance", 2.25);
          const maxSolventMode = getString(data, "maxSolventMode", "max");
          const includeSolute = getBoolean(data, "includeSolute", true);
          const includeSolutePy = includeSolute ? "True" : "False";
          let maxSolventExpr = "'max'";
          if (maxSolventMode === "count") {
            maxSolventExpr = String(Math.round(getNumber(data, "maxSolventCount", 100)));
          } else if (maxSolventMode === "shell") {
            maxSolventExpr = `{'shell': ${getNumber(data, "shellThickness", 5.0)}}`;
          }
          const sxlo = data.xlo != null ? getNumber(data, "xlo", 0) : null;
          const sylo = data.ylo != null ? getNumber(data, "ylo", 0) : null;
          const szlo = data.zlo != null ? getNumber(data, "zlo", 0) : null;
          const sxhi = data.xhi != null ? getNumber(data, "xhi", 0) : null;
          const syhi = data.yhi != null ? getNumber(data, "yhi", 0) : null;
          const szhi = data.zhi != null ? getNumber(data, "zhi", 0) : null;
          const limitsExpr = (sxlo !== null || sxhi !== null)
            ? `[${sxlo ?? 0}, ${sylo ?? 0}, ${szlo ?? 0}, ${sxhi ?? `${inBox}[0]`}, ${syhi ?? `${inBox}[1]`}, ${szhi ?? `${inBox}[2]`}]`
            : inBox;
          const wrappedInAtomsSolv = `wrapped_${blockOutAtoms}`;
          const solventVarS = `solvent_${index}`;
          pythonCode += `${wrappedInAtomsSolv} = ap.wrap(${inAtoms}, ${inBox})\n`;
          pythonCode += `${solventVarS} = ap.solvate(limits=${limitsExpr}, density=${dens}, min_distance=${sdist}, max_solvent=${maxSolventExpr}, solute_atoms=${wrappedInAtomsSolv}, Box=${inBox}, solvent_type='${model}', include_solute=${includeSolutePy})\n`;
          if (includeSolute) {
            pythonCode += `${blockOutAtoms} = ${solventVarS}\n`;
          } else {
            pythonCode += `${blockOutAtoms} = ap.update(${inAtoms}, ${solventVarS})\n`;
          }
          const repairW = getBoolean(data, "repairGeometry", false);
          if (repairW) {
            pythonCode += `${blockOutAtoms} = ap.adjust_Hw_atom(${blockOutAtoms}, ${inBox})\n`;
          }
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else {
          // waterModel conversion
          const conv = getString(data, "conversion", "spc2tip4p");
          if (conv === "spc2tip4p") {
            const omDist = getNumber(data, "omDist", 0.15);
            pythonCode += `${blockOutAtoms} = ap.spc2tip4p(${inAtoms}, Box=${inBox}, om_dist=${omDist})\n`;
          } else {
            pythonCode += `${blockOutAtoms} = ap.tip3p2tip4p(${inAtoms}, Box=${inBox})\n`;
          }
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }


      case "viewer": {
        // Generate PDB snapshot for the frontend viewer
        pythonCode += `import io, json\n`;
        pythonCode += `if ${inAtoms} is not None:\n`;
        pythonCode += `    _vis_buf = io.StringIO()\n`;
        pythonCode += `    # Write with CONECT records to show bonds (and H's)\n`;
        pythonCode += `    ap.write_pdb(${inAtoms}, ${inBox}, _vis_buf, write_conect=True)\n`;
        pythonCode += `    _vis_pdb_str = _vis_buf.getvalue().replace('\\n', '\\\\n')\n`;
        pythonCode += `    print(f"__VISUALIZE_${id}__:{_vis_pdb_str}")\n`;
        pythonCode += `    # Stream raw high-precision charges for labeling\n`;
        pythonCode += `    _vis_charges = [a.get('charge', 0) for a in ${inAtoms}]\n`;
        pythonCode += `    print(f"__CHARGES_${id}__:{json.dumps(_vis_charges)}")\n`;
        // Pass atoms and box through unchanged
        stateVars.set(id, { atoms: inAtoms, box: inBox });
        break;
      }
      case "forcefield": {
        const ffType = getString(data, "forcefield", "minff").toLowerCase();
        const rmaxLong = getNumber(data, "rmaxLong", 2.45);
        const rmaxH = getNumber(data, "rmaxH", 1.2);
        const log = getBoolean(data, "log", false);
        const logFile = getString(data, "logFile", "").trim();
        const resetMolid = (data.resetMolid ?? true) ? "True" : "False";

        if (ffType === "minff") {
          pythonCode += `if ${resetMolid}:\n`;
          if (!isMinimal) {
            pythonCode += `    try:\n`;
          }
          const indent = isMinimal ? "    " : "        ";
          pythonCode += `${indent}_sol, _nosol = ap.find_H2O(${inAtoms}, ${inBox})\n`;
          pythonCode += `${indent}_nosol = ap.assign_resname(_nosol)\n`;
          pythonCode += `${indent}_min = [a for a in _nosol if a.get('resname') == 'MIN']\n`;
          pythonCode += `${indent}_other = [a for a in _nosol if a.get('resname') not in ('ION', 'MIN')]\n`;
          pythonCode += `${indent}_ions = [a for a in _nosol if a.get('resname') == 'ION']\n`;
          pythonCode += `${indent}if _min: _min = ap.molecule(_min, molid=1, resname='MIN')\n`;
          pythonCode += `${indent}${inAtoms} = ap.update(_other, _min, _ions, _sol)\n`;
          if (!isMinimal) {
            pythonCode += `    except Exception as e: print(f"Warning: MolID reset failed ({e})")\n`;
          }
        }

        const logArg = log ? `, log=True${logFile ? `, log_file='${pyEscape(logFile)}'` : ""}` : "";
        pythonCode += `${blockOutAtoms} = ap.forcefield.${ffType}(${inAtoms}, Box=${inBox}, rmaxlong=${rmaxLong}, rmaxH=${rmaxH}${logArg})\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "bondAngle": {
        const rmaxH = getNumber(data, "rmaxH", 1.2);
        const rmaxM = getNumber(data, "rmaxM", 2.45);
        const sameElementBonds = getBoolean(data, "sameElementBonds", false) ? "True" : "False";
        const sameMoleculeOnly = getBoolean(data, "sameMoleculeOnly", true) ? "True" : "False";
        const neighborElement = getString(data, "neighborElement", "").trim();
        const dmMethodRaw = getString(data, "dmMethod", "auto").trim().toLowerCase();
        const dmMethodArg =
          dmMethodRaw && dmMethodRaw !== "auto" && ["direct", "sparse", "fast_cl"].includes(dmMethodRaw)
            ? `, dm_method='${dmMethodRaw}'`
            : "";
        const neighborElementArg = neighborElement ? `, neighbor_element='${pyEscape(neighborElement)}'` : "";
        const calcBonds = getBoolean(data, "calcBonds", true);
        const calcAngles = getBoolean(data, "calcAngles", true);
        const calcDihedrals = getBoolean(data, "calcDihedrals", false);
        const logFile = pyEscape(getString(data, "logFile", "bonded_terms.log"));
        const calcAny = calcBonds || calcAngles || calcDihedrals;
        const analyzedAtoms = `bonded_${index}`;
        const bondIndexVar = `bond_index_${index}`;
        const angleIndexVar = `angle_index_${index}`;
        const dihedralIndexVar = `dihedral_index_${index}`;
        const pairListVar = `pairlist_${index}`;

        if (inAtoms !== "None" && inBox !== "None") {
          if (calcAny) {
            if (calcDihedrals) {
              pythonCode += `${analyzedAtoms}, ${bondIndexVar}, ${angleIndexVar}, ${dihedralIndexVar}, ${pairListVar} = ap.bond_angle_dihedral(${inAtoms}, ${inBox}, rmaxH=${rmaxH}, rmaxM=${rmaxM}, same_element_bonds=${sameElementBonds}, same_molecule_only=${sameMoleculeOnly}${neighborElementArg})\n`;
            } else {
              pythonCode += `${analyzedAtoms}, ${bondIndexVar}, ${angleIndexVar} = ap.bond_angle(${inAtoms}, ${inBox}, rmaxH=${rmaxH}, rmaxM=${rmaxM}, same_element_bonds=${sameElementBonds}, same_molecule_only=${sameMoleculeOnly}${neighborElementArg}${dmMethodArg})\n`;
              pythonCode += `${dihedralIndexVar} = []\n`;
              pythonCode += `${pairListVar} = []\n`;
            }

            const plotTargetIds = edges
              .filter((e) => e.source === id && e.sourceHandle === "data")
              .map((e) => e.target);
            
            if (plotTargetIds.length > 0) {
              pythonCode += `import numpy as np\n`;
              pythonCode += `if len(${bondIndexVar}) > 0:\n`;
              pythonCode += `    _b_dists = [float(_b[2]) for _b in ${bondIndexVar}]\n`;
              pythonCode += `    _b_hist, _b_bins = np.histogram(_b_dists, bins=min(50, len(_b_dists)))\n`;
              pythonCode += `    _b_bin_centers = (_b_bins[:-1] + _b_bins[1:]) / 2\n`;
              plotTargetIds.forEach(pid => {
                pythonCode += `    ap_plot('${pid}', _b_bin_centers, _b_hist, title="Bond Length Distribution", xlabel="Distance (A)", ylabel="Count")\n`;
              });
              pythonCode += `elif len(${angleIndexVar}) > 0:\n`;
              pythonCode += `    _a_vals = [float(_a[3]) for _a in ${angleIndexVar}]\n`;
              pythonCode += `    _a_hist, _a_bins = np.histogram(_a_vals, bins=min(50, len(_a_vals)))\n`;
              pythonCode += `    _a_bin_centers = (_a_bins[:-1] + _a_bins[1:]) / 2\n`;
              plotTargetIds.forEach(pid => {
                pythonCode += `    ap_plot('${pid}', _a_bin_centers, _a_hist, title="Angle Distribution", xlabel="Angle (deg)", ylabel="Count")\n`;
              });
            }

            pythonCode += `with open('${logFile}', 'w') as _term_log:\n`;
            pythonCode += `    _term_log.write('Bonded Terms Report\\n')\n`;
            pythonCode += `    _term_log.write('Atom indices below correspond to atom[\\'index\\'] values when available.\\n\\n')\n`;

            if (calcBonds) {
              pythonCode += `    _term_log.write('[BONDS]\\n')\n`;
              pythonCode += `    _term_log.write('atom_i atom_j distance_A\\n')\n`;
              pythonCode += `    _term_log.write('count=%d\\n' % len(${bondIndexVar}))\n`;
              pythonCode += `    for _b in ${bondIndexVar}:\n`;
              pythonCode += `        _i = int(_b[0]); _j = int(_b[1])\n`;
              pythonCode += `        _ai = int(${analyzedAtoms}[_i].get('index', _i + 1))\n`;
              pythonCode += `        _aj = int(${analyzedAtoms}[_j].get('index', _j + 1))\n`;
              pythonCode += `        _term_log.write('%8d %8d %12.6f\\n' % (_ai, _aj, float(_b[2])))\n`;
              pythonCode += `    _term_log.write('\\n')\n`;
            } else {
              pythonCode += `    _term_log.write('[BONDS]\\n')\n`;
              pythonCode += `    _term_log.write('skipped\\n\\n')\n`;
            }

            if (calcAngles) {
              pythonCode += `    _term_log.write('[ANGLES]\\n')\n`;
              pythonCode += `    _term_log.write('atom_i atom_j atom_k angle_deg\\n')\n`;
              pythonCode += `    _term_log.write('count=%d\\n' % len(${angleIndexVar}))\n`;
              pythonCode += `    for _a in ${angleIndexVar}:\n`;
              pythonCode += `        _i = int(_a[0]); _j = int(_a[1]); _k = int(_a[2])\n`;
              pythonCode += `        _ai = int(${analyzedAtoms}[_i].get('index', _i + 1))\n`;
              pythonCode += `        _aj = int(${analyzedAtoms}[_j].get('index', _j + 1))\n`;
              pythonCode += `        _ak = int(${analyzedAtoms}[_k].get('index', _k + 1))\n`;
              pythonCode += `        _term_log.write('%8d %8d %8d %12.6f\\n' % (_ai, _aj, _ak, float(_a[3])))\n`;
              pythonCode += `    _term_log.write('\\n')\n`;
            } else {
              pythonCode += `    _term_log.write('[ANGLES]\\n')\n`;
              pythonCode += `    _term_log.write('skipped\\n\\n')\n`;
            }

            if (calcDihedrals) {
              pythonCode += `    _term_log.write('[DIHEDRALS]\\n')\n`;
              pythonCode += `    _term_log.write('atom_i atom_j atom_k atom_l dihedral_deg\\n')\n`;
              pythonCode += `    _term_log.write('count=%d\\n' % len(${dihedralIndexVar}))\n`;
              pythonCode += `    for _d in ${dihedralIndexVar}:\n`;
              pythonCode += `        _i = int(_d[0]); _j = int(_d[1]); _k = int(_d[2]); _l = int(_d[3])\n`;
              pythonCode += `        _ai = int(${analyzedAtoms}[_i].get('index', _i + 1))\n`;
              pythonCode += `        _aj = int(${analyzedAtoms}[_j].get('index', _j + 1))\n`;
              pythonCode += `        _ak = int(${analyzedAtoms}[_k].get('index', _k + 1))\n`;
              pythonCode += `        _al = int(${analyzedAtoms}[_l].get('index', _l + 1))\n`;
              pythonCode += `        _term_log.write('%8d %8d %8d %8d %12.6f\\n' % (_ai, _aj, _ak, _al, float(_d[4])))\n`;
              pythonCode += `    _term_log.write('\\n')\n`;
              pythonCode += `    _term_log.write('[PAIRLIST_1-4]\\n')\n`;
              pythonCode += `    _term_log.write('atom_i atom_j\\n')\n`;
              pythonCode += `    _term_log.write('count=%d\\n' % len(${pairListVar}))\n`;
              pythonCode += `    for _p in ${pairListVar}:\n`;
              pythonCode += `        _i = int(_p[0]); _j = int(_p[1])\n`;
              pythonCode += `        _ai = int(${analyzedAtoms}[_i].get('index', _i + 1))\n`;
              pythonCode += `        _aj = int(${analyzedAtoms}[_j].get('index', _j + 1))\n`;
              pythonCode += `        _term_log.write('%8d %8d\\n' % (_ai, _aj))\n`;
            } else {
              pythonCode += `    _term_log.write('[DIHEDRALS]\\n')\n`;
              pythonCode += `    _term_log.write('skipped\\n')\n`;
            }
          } else {
            pythonCode += `${analyzedAtoms} = ${inAtoms}\n`;
            pythonCode += `with open('${logFile}', 'w') as _term_log:\n`;
            pythonCode += `    _term_log.write('Bonded Terms Report\\n')\n`;
            pythonCode += `    _term_log.write('No terms selected.\\n')\n`;
          }

          pythonCode += `${blockOutAtoms} = ${analyzedAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else {
          pythonCode += `# Bond/Angle analysis skipped: missing input atoms/box\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "bvs": {
        const topN = Math.max(1, Math.round(getNumber(data, "topN", 10)));
        const logFile = pyEscape(getString(data, "logFile", "bvs_summary.log"));
        const writeCsv = getBoolean(data, "writeCsv", true);
        const csvFile = pyEscape(getString(data, "csvFile", "bvs_results.csv"));
        const csvPathExpr = writeCsv ? `'${csvFile}'` : "None";
        const reportVar = `bvs_report_${index}`;

        if (inAtoms !== "None" && inBox !== "None") {
          pythonCode += `${reportVar} = ap.analyze_bvs(${inAtoms}, ${inBox}, csv_path=${csvPathExpr}, top_n=${topN})\n`;
          pythonCode += `with open('${logFile}', 'w') as _bvs_log:\n`;
          pythonCode += `    _bvs_log.write('BVS Analysis Summary\\n')\n`;
          pythonCode += `    _bvs_log.write(f"GII: {${reportVar}.get('gii', 0.0):.6f}\\n")\n`;
          pythonCode += `    _bvs_log.write(f"GII (no H): {${reportVar}.get('gii_no_h', 0.0):.6f}\\n")\n`;
          pythonCode += `    _bvs_log.write(f"Formal charge: {${reportVar}.get('formal_charge', 0)}\\n")\n`;
          pythonCode += `    _bvs_log.write('\\nPer-element average BVS:\\n')\n`;
          pythonCode += `    for _el, _avg in sorted(${reportVar}.get('summary', {}).get('per_element_avg', {}).items()):\n`;
          pythonCode += `        _bvs_log.write(f"  {_el}: {_avg:.6f}\\n")\n`;
          pythonCode += `    _bvs_log.write('\\nTop worst atoms:\\n')\n`;
          pythonCode += `    for _atom in ${reportVar}.get('top_worst', []):\n`;
          pythonCode += `        _bvs_log.write(f"  idx={_atom.get('index')} el={_atom.get('element')} bvs={_atom.get('bvs', 0.0):.6f} expected={_atom.get('expected_ox')} delta={_atom.get('delta', 0.0):+.6f}\\n")\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        } else {
          pythonCode += `# BVS analysis skipped: missing input atoms/box\n`;
          pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
          pythonCode += `${blockOutBox} = ${inBox}\n`;
        }
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "xrd": {
        const wavelength = getNumber(data, "wavelength", 1.54187);
        const twoThetaMin = getNumber(data, "twoThetaMin", 2.0);
        const twoThetaMax = getNumber(data, "twoThetaMax", 90.0);
        const angleStep = getNumber(data, "angleStep", 0.02);
        const f00l = getNumber(data, "fwhm00l", 1.0);
        const fhk0 = getNumber(data, "fwhmhk0", 0.5);
        const fhkl = getNumber(data, "fwhmhkl", 0.5);
        const bAll = getNumber(data, "bAll", 0.0);
        const lorentzian = getNumber(data, "lorentzianFactor", 1.0);
        const neutral = getBoolean(data, "neutralAtoms", false) ? "True" : "False";
        const pref = getNumber(data, "pref", 0);
        const prefH = getNumber(data, "prefH", 0);
        const prefK = getNumber(data, "prefK", 0);
        const prefL = getNumber(data, "prefL", 1);

        if (inAtoms !== "None" && inBox !== "None") {
          const xrdResVar = `xrd_res_${index}`;
          pythonCode += `${xrdResVar} = ap.xrd(${inAtoms}, ${inBox}, wavelength=${wavelength}, two_theta_range=(${twoThetaMin}, ${twoThetaMax}), angle_step=${angleStep}, fwhm_00l=${f00l}, fwhm_hk0=${fhk0}, fwhm_hkl=${fhkl}, b_all=${bAll}, lorentzian_factor=${lorentzian}, neutral_atoms=${neutral}, pref=${pref}, preferred_orientation=(${prefH}, ${prefK}, ${prefL}), save_output=True, plot=True)\n`;
          pythonCode += `if isinstance(${xrdResVar}, tuple) and len(${xrdResVar}) >= 2:\n`;
          
          const plotTargetIds = edges
            .filter((e) => e.source === id && e.sourceHandle === "data")
            .map((e) => e.target);
          const allPlotIds = [id, ...plotTargetIds];
          allPlotIds.forEach(pid => {
            pythonCode += `    ap_plot('${pid}', ${xrdResVar}[0], ${xrdResVar}[1], title="XRD Pattern", xlabel="2-theta (deg)", ylabel="Intensity")\n`;
          });
        } else {
          pythonCode += `# XRD skipped: missing input atoms/box\n`;
        }
        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "plot": {
        const plotFileName = pyEscape(getString(data, "fileName", "xrd.dat"));
        const plotNodeId = pyEscape(id);
        const plotPayloadVar = `plot_payload_${index}`;
        
        pythonCode += `import os\n`;
        pythonCode += `${plotPayloadVar} = {"sourceFile": "${plotFileName}", "points": []}\n`;
        pythonCode += `if os.path.exists("${plotFileName}"):\n`;
        pythonCode += `    with open("${plotFileName}", "r", encoding="utf-8") as _plot_f:\n`;
        pythonCode += `        for _line in _plot_f:\n`;
        pythonCode += `            _line = _line.strip()\n`;
        pythonCode += `            if _line and not _line.startswith(('#', 'index', 'x', 'y')):\n`;
        pythonCode += `                _parts = _line.split(',') if ',' in _line else _line.split()\n`;
        pythonCode += `                try:\n`;
        pythonCode += `                    if len(_parts) >= 2:\n`;
        pythonCode += `                        ${plotPayloadVar}["points"].append([float(_parts[0]), float(_parts[1])])\n`;
        pythonCode += `                except ValueError:\n`;
        pythonCode += `                    pass\n`;
        pythonCode += `    _stride = max(1, len(${plotPayloadVar}["points"]) // 1000)\n`;
        pythonCode += `    ${plotPayloadVar}["points"] = ${plotPayloadVar}["points"][::_stride]\n`;
        pythonCode += `print("__PLOT_${plotNodeId}__:" + json.dumps(${plotPayloadVar}))\n`;
        
        pythonCode += `${blockOutAtoms} = ${inAtoms}\n`;
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "export": {
        const structureFormat = getString(data, "structureFormat", "xyz");
        const topologyFormat = getString(data, "topologyFormat", "none");
        const angleTermsRaw = getString(data, "angleTerms", "500");
        const outName = pyEscape(getString(data, "outputName", "system"));
        const writeConect = getBoolean(data, "writeConect", false) ? "True" : "False";
        const writeElement = (data.writeElement ?? true) ? "True" : "False";
        const cifTitle = pyEscape(getString(data, "cifTitle", "Generated by atomipy"));
        const topologyRmaxH = getNumber(data, "topologyRmaxH", 1.2);
        const topologyRmaxM = getNumber(data, "topologyRmaxM", 2.45);
        const detectBimodal = getBoolean(data, "detectBimodal", false) ? "True" : "False";
        const bimodalThreshold = getNumber(data, "bimodalThreshold", 30.0);
        const moleculeName = getString(data, "moleculeName", "").trim();
        const segid = getString(data, "segid", "").trim();
        const nrexcl = Math.max(0, Math.round(getNumber(data, "nrexcl", 1)));
        const writeN2T = getBoolean(data, "writeN2T", false);
        const n2tFilenameRaw = getString(data, "n2tFilename", "").trim();
        const validAngleTerms = new Set(["none", "0", "250", "500", "1500"]);
        const angleTerms = validAngleTerms.has(angleTermsRaw) ? angleTermsRaw : "500";
        const includeAngles = angleTerms !== "none";
        const kangle = includeAngles ? parseInt(angleTerms, 10) : 0;
        const explicitAngles = includeAngles ? 1 : 0;
        const maxAngleExpr = includeAngles ? "None" : "0.0";
        const n2tFilename = pyEscape(n2tFilenameRaw || `${outName}.n2t`);

        pythonCode += `# Final Export\n`;

        if (structureFormat === "gro") {
          pythonCode += `ap.write_gro(${inAtoms}, ${inBox}, '${outName}.gro')\n`;
        } else if (structureFormat === "pdb") {
          pythonCode += `ap.write_pdb(${inAtoms}, ${inBox}, '${outName}.pdb', write_conect=${writeConect}, write_element=${writeElement})\n`;
        } else if (structureFormat === "cif") {
          pythonCode += `ap.write_cif(${inAtoms}, ${inBox}, '${outName}.cif', title='${cifTitle}')\n`;
        } else if (structureFormat === "pqr") {
          pythonCode += `ap.write_pqr(${inAtoms}, ${inBox}, '${outName}.pqr')\n`;
        } else if (structureFormat === "poscar") {
          pythonCode += `ap.write_poscar(${inAtoms}, ${inBox}, '${outName}.poscar')\n`;
        } else if (structureFormat === "sdf") {
          pythonCode += `ap.write_sdf(${inAtoms}, '${outName}.sdf')\n`;
        } else {
          pythonCode += `ap.write_xyz(${inAtoms}, ${inBox}, '${outName}.xyz')\n`;
        }

        if (topologyFormat === "itp") {
          const moleculeNameArg = moleculeName ? `, molecule_name='${pyEscape(moleculeName)}'` : "";
          pythonCode += `ap.write_itp(${inAtoms}, ${inBox}, '${outName}.itp', nrexcl=${nrexcl}, rmaxH=${topologyRmaxH}, rmaxM=${topologyRmaxM}, explicit_angles=${explicitAngles}, KANGLE=${kangle}, detect_bimodal=${detectBimodal}, bimodal_threshold=${bimodalThreshold}, max_angle=${maxAngleExpr}${moleculeNameArg})\n`;
        } else if (topologyFormat === "lmp") {
          pythonCode += `ap.write_lmp(${inAtoms}, ${inBox}, '${outName}.data', rmaxH=${topologyRmaxH}, rmaxM=${topologyRmaxM}, detect_bimodal=${detectBimodal}, bimodal_threshold=${bimodalThreshold}, KANGLE=${kangle}, max_angle=${maxAngleExpr})\n`;
        } else if (topologyFormat === "psf") {
          const segidArg = segid ? `, segid='${pyEscape(segid)}'` : "";
          pythonCode += `ap.write_psf(${inAtoms}, ${inBox}, '${outName}.psf', rmaxH=${topologyRmaxH}, rmaxM=${topologyRmaxM}, detect_bimodal=${detectBimodal}, bimodal_threshold=${bimodalThreshold}, max_angle=${maxAngleExpr}${segidArg})\n`;
        }
        if (writeN2T) {
          pythonCode += `ap.write_n2t(${inAtoms}, Box=${inBox}, n2t_file='${n2tFilename}')\n`;
        }
        break;
      }
      default:
        pythonCode += `# Unsupported node type: ${n.type}\n`;
        break;
    }

    const nodeBlock = pythonCode.slice(nodeBlockStart);
    pythonCode = pythonCode.slice(0, nodeBlockStart);
    const trimmedNodeBlock = nodeBlock.endsWith("\n") ? nodeBlock.slice(0, -1) : nodeBlock;

    if (mode !== "full") {
      if (trimmedNodeBlock.trim().length > 0) {
        pythonCode += `${trimmedNodeBlock}\n`;
      } else {
        pythonCode += `# Empty operation\n`;
      }
    } else {
      const indentedNodeBlock = trimmedNodeBlock
        .split("\n")
        .map((line) => (line ? `    ${line}` : ""))
        .join("\n");

      pythonCode += `try:\n`;
      if (indentedNodeBlock.trim().length > 0) {
        pythonCode += `${indentedNodeBlock}\n`;
      } else {
        pythonCode += `    pass\n`;
      }
      pythonCode += `except Exception as _node_exc: __report_error__('${opTypeEscaped}', '${opIdEscaped}', _node_exc)\n`;
    }
  });

  if (isStrictMinimal) {
    return toStrictMinimalScript(pythonCode);
  }

  return pythonCode;
}
