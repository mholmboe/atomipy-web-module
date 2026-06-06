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
  ListOrdered,
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
  Hexagon,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Terminal, AlertTriangle, Square, OctagonX, Copy, Ban } from "lucide-react";
import { toast } from "sonner";
import { isValidConnection } from "./graph/connectionValidation";
import { useGraphHistory } from "./graph/useGraphHistory";
import { generatePythonCode, checkWorkflowPrerequisites } from "./graph/graphExecution";

// Import Custom Nodes
import { StructureNode } from "./nodes/StructureNode";
import { ReplicateNode } from "./nodes/ReplicateNode";
import { ExportNode } from "./nodes/ExportNode";
import { TopologyNode } from "./nodes/TopologyNode";
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
import { SimulateNode } from "./nodes/SimulateNode";
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
  topology: TopologyNode,
  trajectory: TrajectoryNode,
  simulate: SimulateNode,
  organic: StructureNode,
  // Legacy nodes (kept so saved workflows still load)
  addIons: IonsNode,
  grid: IonsNode,
  preset: StructureNode,
  upload: StructureNode,
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
    "wrap",
    "forcefield",
    "bondAngle",
    "bvs",
    "atomProps",
    "coordFrame",
    "export",
    "simulate",
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
      if (connectedHandles < 1) {
        errors.push(`Node "add" (Join Branches) requires at least one input.`);
      }
    }

    if (node.type === "structure") {
      const source = getString(data, "source", "preset");
      if (source === "upload" && !getString(data, "filename", "").trim()) {
        errors.push(`Node "structure" (upload) is missing file upload.`);
      }
      if (source === "preset" && !getString(data, "value", "").trim()) {
        errors.push(`Node "structure" (preset) has no selected preset.`);
      }
      if (source === "organic") {
        const inputMode = getString(data, "inputMode", "smiles");
        if (inputMode === "smiles" && !getString(data, "smiles", "").trim()) {
          errors.push(`Node "structure" (organic) is missing SMILES string.`);
        }
        if (inputMode === "file" && !getString(data, "uploadedFilePath", "").trim()) {
          errors.push(`Node "structure" (organic) is missing structure file upload.`);
        }
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
          type: "solvent",
          position: { x: 840, y: 280 },
          data: { waterModel: "opc3", density: 1.0, minDistance: 2.25 },
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
  structure: "Imports a starting structure: inorganic (upload or the Library = presets + crystals) or organic (SMILES, file, or molecule library).",
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
  transform: "Spatial Ops node for translate/rotate/scale/bend transformations.",
  pbc: "Applies periodic-boundary operations (wrap/unwrap/condense).",
  edit: "Runs structural editing operations on current atoms.",
  chemistry: "Runs chemistry operations like substitution/fusion/H-addition.",
  solvent: "Runs solvent/water-model operations.",
  viewer: "Exports an in-memory visualization representation (3Dmol or JSmol).",
  forcefield: "Assigns forcefield atom types and parameters.",
  bondAngle: "Calculates bonded terms (bonds/angles/dihedrals).",
  bvs: "Runs bond-valence analysis and summaries.",
  xrd: "Calculates and exports simulated XRD profiles.",
  export: "Writes final coordinate/topology files.",
  simulate: "Runs OpenMM energy minimization or MD (NVT/NPT) on the full system (CPU online; GPU on Colab/local).",
  organic: "Defines an organic molecule (SMILES, file, or library); GAFF/OpenFF parametrization is applied by the Forcefield node.",
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

const cleanNodesForStorage = (nds: Node[]): Node[] => {
  return nds.map((node) => {
    if (!node) return node;
    // Drop transient UI flags. Persisting `selected` is what made a restored
    // session silently run only the "selected subgraph" (excluding downstream
    // nodes such as Simulate) — the main Run button truncates to selection.
    const { selected, dragging, ...restNode } = node;
    if (!restNode.data) return restNode;
    const { pdb, plotData, charges, detectedMolecules, ...restData } = restNode.data;
    return {
      ...restNode,
      data: restData,
    };
  });
};

export default function VisualBuilder() {
  const [rfInstance, setRfInstance] = useState<any>(null);
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);

  const { undo, redo, pushState, resetHistory, canUndo, canRedo } = useGraphHistory(initialNodes, initialEdges);

  const initialViewport = React.useMemo(() => {
    return { x: 0, y: 0, zoom: 1 };
  }, []);

  // Keyboard listener for Cmd/Ctrl + Z (Undo) and Cmd/Ctrl + Y (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl) {
        if (e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo(setNodes, setEdges);
        } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
          e.preventDefault();
          redo(setNodes, setEdges);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, setNodes, setEdges]);

  // Auto-save nodes/edges to localStorage on updates, and push to undo/redo history (debounced)
  useEffect(() => {
    if (nodes.length > 0) {
      try {
        const cleanedNodes = cleanNodesForStorage(nodes);
        localStorage.setItem("atomipy_active_workflow", JSON.stringify({ nodes: cleanedNodes, edges }));
      } catch (err) {
        console.warn("Failed to auto-save workflow to localStorage:", err);
      }

      const timer = setTimeout(() => {
        pushState(nodes, edges);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [nodes, edges, pushState]);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const workflowImportInputRef = useRef<HTMLInputElement>(null);
  const [presets, setPresets] = useState<PresetOption[]>([]);
  const [disableSimulation, setDisableSimulation] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [edgeType, setEdgeType] = useState<"bezier" | "step">("bezier");
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [verboseLog, setVerboseLog] = useState(false);
  const [isWarningsMinimized, setIsWarningsMinimized] = useState(true);

  // Build Progress States
  const [isBuilding, setIsBuilding] = useState(false);
  const [currentBuildId, setCurrentBuildId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [showStatusWindow, setShowStatusWindow] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildStatus, setBuildStatus] = useState("");
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [trackedNodeOrder, setTrackedNodeOrder] = useState<string[]>([]);
  const [nodeRunStatus, setNodeRunStatus] = useState<Record<string, RunNodeStatus>>({});
  const currentRunningNodeRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [isStatusWindowMinimized, setIsStatusWindowMinimized] = useState(() => {
    return localStorage.getItem("atomipy_status_window_minimized") === "true";
  });

  useEffect(() => {
    localStorage.setItem("atomipy_status_window_minimized", String(isStatusWindowMinimized));
  }, [isStatusWindowMinimized]);

  // Resizable Node Status window. Size is applied imperatively (not via a React
  // style prop) so the frequent re-renders during a build never fight the user's
  // drag; it's restored from / persisted to localStorage.
  const statusWindowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showStatusWindow) return;
    const el = statusWindowRef.current;
    if (!el) return;
    let w = 460, h = 520;
    try {
      const s = JSON.parse(localStorage.getItem("atomipy_status_window_size") || "null");
      if (s && s.w) { w = s.w; h = s.h; }
    } catch { /* ignore */ }
    el.style.width = `${w}px`;
    el.style.height = isStatusWindowMinimized ? "" : `${h}px`;   // header-only auto-height when minimized
    if (isStatusWindowMinimized) return;
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        localStorage.setItem("atomipy_status_window_size",
          JSON.stringify({ w: el.offsetWidth, h: el.offsetHeight }));
      }, 250);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [showStatusWindow, isStatusWindowMinimized]);

  // Right-click context menu & inspectors
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [nodeLogsMap, setNodeLogsMap] = useState<Record<string, string[]>>({});
  const [activeInspector, setActiveInspector] = useState<{
    type: "code" | "logs";
    nodeId: string;
    title: string;
    content: string;
  } | null>(null);

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
      .then((data: { presets?: PresetOption[]; disableSimulation?: boolean; simulationMode?: string }) => {
        setPresets(Array.isArray(data.presets) ? data.presets : []);
        const disabled = !!data.disableSimulation;
        setDisableSimulation(disabled);
        (window as any).disableSimulation = disabled;
        // 'full' | 'em_only' | 'disabled' — em_only allows EM but blocks NVT/NPT MD.
        (window as any).simulationMode = data.simulationMode || (disabled ? "disabled" : "full");
      })
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

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      if (!reactFlowWrapper.current) return;
      const rect = reactFlowWrapper.current.getBoundingClientRect();
      setMenu({
        id: node.id,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    },
    [setMenu]
  );

  const onPaneClick = useCallback(() => setMenu(null), [setMenu]);

  const handleDuplicateNode = useCallback((nodeId: string) => {
    const sourceNode = nodes.find((n) => n.id === nodeId);
    if (sourceNode) {
      const newId = `node_${Date.now()}`;
      const newNode = {
        ...deepClone(sourceNode),
        id: newId,
        position: {
          x: sourceNode.position.x + 50,
          y: sourceNode.position.y + 50,
        },
        selected: false,
      };
      setNodes((nds) => [...nds, newNode]);
      toast.success("Node duplicated successfully!");
    }
    setMenu(null);
  }, [nodes, setNodes]);

  // Duplicate the whole shift-selected set: copies the nodes AND the edges
  // between them (preserving relative layout), offset and re-selected so the
  // copy can be dragged away immediately.
  const handleDuplicateSelection = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    const stamp = Date.now();
    const idMap: Record<string, string> = {};
    selected.forEach((n, i) => { idMap[n.id] = `node_${stamp}_${i}`; });
    const selSet = new Set(selected.map((n) => n.id));

    const newNodes = selected.map((n, i) => ({
      ...deepClone(n),
      id: idMap[n.id],
      position: { x: n.position.x + 60, y: n.position.y + 60 },
      selected: true,
    }));
    // Only edges fully inside the selection are duplicated (internal wiring).
    const newEdges = edges
      .filter((e) => selSet.has(e.source) && selSet.has(e.target))
      .map((e, i) => ({
        ...deepClone(e),
        id: `e_${stamp}_${i}`,
        source: idMap[e.source],
        target: idMap[e.target],
        selected: false,
      }));

    setNodes((nds) => [...nds.map((n) => (n.selected ? { ...n, selected: false } : n)), ...newNodes]);
    setEdges((eds) => [...eds, ...newEdges]);
    toast.success(`Duplicated ${newNodes.length} node${newNodes.length > 1 ? "s" : ""}` +
      (newEdges.length ? ` + ${newEdges.length} connection${newEdges.length > 1 ? "s" : ""}` : ""));
    setMenu(null);
  }, [nodes, edges, setNodes, setEdges]);

  const handleToggleBypassNode = useCallback((nodeId: string) => {
    let wasDisabled = false;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          const currentDisabled = n.data?.disabled === true;
          wasDisabled = !currentDisabled;
          return {
            ...n,
            data: {
              ...n.data,
              disabled: !currentDisabled,
            },
          };
        }
        return n;
      })
    );
    toast.success(wasDisabled ? "Node bypassed/disabled!" : "Node enabled!");
    setMenu(null);
  }, [setNodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    toast.success("Node deleted successfully!");
    setMenu(null);
  }, [setNodes, setEdges]);

  const handleInspectPythonCode = useCallback((nodeId: string) => {
    // Generate script specifically up to this node
    const visited = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const curId = queue.shift()!;
      if (visited.has(curId)) continue;
      visited.add(curId);
      const parents = edges
        .filter((e) => e.target === curId)
        .map((e) => e.source);
      queue.push(...parents);
    }
    const activeNodes = nodes.filter((n) => visited.has(n.id));
    const activeEdges = edges.filter((e) => visited.has(e.source) && visited.has(e.target));
    const script = generatePythonCode(activeNodes, activeEdges, "minimal");
    
    const node = nodes.find(n => n.id === nodeId);
    const nodeLabel = node ? `${node.type} (${node.id})` : nodeId;
    setActiveInspector({
      type: "code",
      nodeId,
      title: `Generated Python Script: ${nodeLabel}`,
      content: script,
    });
    setMenu(null);
  }, [nodes, edges]);

  const handleInspectNodeLogs = useCallback((nodeId: string) => {
    const logs = nodeLogsMap[nodeId] || [];
    const node = nodes.find(n => n.id === nodeId);
    const nodeLabel = node ? `${node.type} (${node.id})` : nodeId;
    
    let content = "";
    const runStatus = nodeRunStatus[nodeId];
    
    if (logs.length > 0) {
      content = logs.join("\n");
    } else if (node && runStatus === "done") {
      const singleNodeScript = generatePythonCode([node], [], "minimal");
      content = `[Status]: Node executed successfully (in-memory operation).\n[Console Output]: None (This node does not print standard output).\n\n[Executed Python Code Snippet]:\n${singleNodeScript}`;
    } else {
      content = "No logs available for this node. Ensure you have run the workflow first.";
    }

    setActiveInspector({
      type: "logs",
      nodeId,
      title: `Execution Logs: ${nodeLabel}`,
      content,
    });
    setMenu(null);
  }, [nodes, nodeLogsMap, nodeRunStatus]);

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
      baseData.minffVariant = "500";
      // Water model now lives on the Solvent node; ion parameters on the Ions node.
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
      baseData.structureFormat = "pdb";
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
      baseData.useBox = true;
      baseData.centerDim = "xyz";
      baseData.centerResname = "";
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
      baseData.waterModel = "opc3";
      baseData.density = 1.0;
      baseData.minDistance = 2.25;
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
      baseData.renderer = "3dmol";
      baseData.title = "Structure Viewer";
      baseData.width = 500;
      baseData.height = 500;
      baseData.computeBonds = true;
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
    if (type === "condense") {
      // no specific defaults needed
    }
    if (type === "simulate") {
      baseData.simType = "minimize";
      baseData.miniSteps = 500;
      baseData.mdSteps = 5000;
      baseData.temperature = 298.15;
      baseData.timestep = 1.0;
      baseData.cutoff = 12.0;
      baseData.constraints = "None";
      baseData.pressure = 1.0;
      baseData.frictionCoeff = 1.0;
      baseData.switchDistance = 10.0;
      baseData.writeDcd = false;
      baseData.dcdFreq = 1000;
      baseData.wrapTrajectory = true;
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

    const newNodeId = `${type}_${new Date().getTime()}`;

    let targetX = 100;
    let targetY = 100;
    if (rfInstance && reactFlowWrapper.current) {
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      if (typeof rfInstance.screenToFlowPosition === "function") {
        const flowPos = rfInstance.screenToFlowPosition({ x: centerX, y: centerY });
        // Shift left by approx. one node width (300px) and up by approx. one node height (350px)
        targetX = Math.round(flowPos.x) - 300;
        targetY = Math.round(flowPos.y) - 350;
      }
    }

    setNodes((nds) => {
      let finalX = targetX;
      let finalY = targetY;
      // Offset slightly if an existing node is within 20px to avoid perfectly overlapping them
      while (nds.some((n) => Math.abs(n.position.x - finalX) < 20 && Math.abs(n.position.y - finalY) < 20)) {
        finalX += 30;
        finalY += 30;
      }

      // Deselect all existing nodes, and make the new node selected so it is focused and layered on top
      const deselectedNds = nds.map((n) => (n.selected ? { ...n, selected: false } : n));

      const newNode: Node = {
        id: newNodeId,
        type,
        position: { x: finalX, y: finalY },
        data: baseData,
        selected: true,
      };
      return deselectedNds.concat(newNode);
    });
  };

  const applyWorkflowGraph = useCallback(
    (graph: WorkflowGraph) => {
      // Clean nodes to remove bulky data like presets before setting state.
      // Also drop transient UI flags (selected/dragging) so a loaded workflow
      // never auto-truncates the run to a stale "selected subgraph".
      const cleanedNodes = deepClone(graph.nodes).map((rawNode) => {
        const { selected, dragging, ...node } = rawNode;
        if (node.data && typeof node.data === "object") {
          const { presets: _p, ...cleanData } = node.data as Record<string, unknown>;
          if (["structure", "insert", "molecule", "preset", "upload"].includes(node.type || "")) {
            return { ...node, data: { ...cleanData, presets } };
          }
          return { ...node, data: cleanData };
        }
        return node;
      });
      setNodes(cleanedNodes);
      setEdges(deepClone(graph.edges));
      if (rfInstance) {
        setTimeout(() => {
          rfInstance.fitView({ padding: 0.4, maxZoom: 0.8 });
        }, 50);
      }
    },
    [presets, setEdges, setNodes, rfInstance],
  );

  const storeCustomTemplates = useCallback((templates: SavedWorkflow[]) => {
    const cleaned = templates.map(t => ({
      ...t,
      nodes: cleanNodesForStorage(t.nodes),
      edges: t.edges,
    }));
    setCustomTemplates(cleaned);
    try {
      localStorage.setItem(WORKFLOW_TEMPLATE_STORAGE_KEY, JSON.stringify(cleaned));
    } catch {
      console.error("Failed to persist templates in local storage.");
    }
  }, []);

  const storeSavedWorkflows = useCallback((workflows: SavedWorkflow[]) => {
    const cleaned = workflows.map(w => ({
      ...w,
      nodes: cleanNodesForStorage(w.nodes),
      edges: w.edges,
    }));
    setSavedWorkflows(cleaned);
    try {
      localStorage.setItem(WORKFLOW_SAVED_STORAGE_KEY, JSON.stringify(cleaned));
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

  const handleAutoLayout = useCallback(() => {
    // 1. Calculate incoming edge count for each node
    const incoming: Record<string, string[]> = {};
    const outgoing: Record<string, string[]> = {};
    nodes.forEach((n) => {
      incoming[n.id] = [];
      outgoing[n.id] = [];
    });
    edges.forEach((e) => {
      if (incoming[e.target]) incoming[e.target].push(e.source);
      if (outgoing[e.source]) outgoing[e.source].push(e.target);
    });

    // Isolated nodes (no edges at all) are laid out in a horizontal ROW instead
    // of being stacked vertically in the depth-0 column.
    const isolatedIds = new Set(
      nodes.filter((n) => incoming[n.id].length === 0 && outgoing[n.id].length === 0).map((n) => n.id),
    );

    // 2. Find starting nodes (nodes with 0 incoming edges)
    let queue = nodes.filter((n) => incoming[n.id].length === 0).map((n) => n.id);
    const depths: Record<string, number> = {};

    // Initialize starting nodes at depth 0
    queue.forEach((id) => {
      depths[id] = 0;
    });

    // BFS or DFS to assign depths (columns)
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const currentDepth = depths[current] || 0;
      const neighbors = outgoing[current] || [];
      neighbors.forEach((neigh) => {
        depths[neigh] = Math.max(depths[neigh] || 0, currentDepth + 1);
        queue.push(neigh);
      });
    }

    // Assign any remaining unvisited nodes (loops/islands) to depth 0
    nodes.forEach((n) => {
      if (depths[n.id] === undefined) {
        depths[n.id] = 0;
      }
    });

    // Group nodes by depth (isolated nodes handled separately as a row)
    const columns: Record<number, string[]> = {};
    Object.entries(depths).forEach(([id, depth]) => {
      if (isolatedIds.has(id)) return;
      if (!columns[depth]) columns[depth] = [];
      columns[depth].push(id);
    });

    // Helper to resolve dynamic or default node widths aligned with their CSS classes
    const getNodeWidth = (n: any) => {
      if (n.width) return n.width;
      if (n.style?.width) {
        const w = parseInt(String(n.style.width));
        if (!isNaN(w)) return w;
      }

      const defaultWidths: Record<string, number> = {
        viewer: 480,
        structure: 300,
        preset: 300,
        upload: 300,
        edit: 300,
        chemistry: 300,
        solvent: 300,
        insert: 300,
        export: 300,
        substitute: 300,
        analysis: 300,
        coordFrame: 300,
        reorder: 300,
        merge: 280,
        presetNode: 280,
        atomProps: 280,
        xrd: 280,
        slice: 280,
        box: 270,
        bondAngle: 270,
        simulate: 260,
        ions: 260,
        addIons: 260,
        grid: 260,
        stats: 260,
        transform: 260,
        bvs: 260,
        trajectory: 260,
        forcefield: 250,
        scale: 250,
        fuse: 240,
        resname: 240,
        molecule: 240,
        position: 240,
        addH: 240,
        rotate: 240,
        pbc: 240,
        remove: 330,
        replicate: 220,
        add: 220,
        condense: 220,
        wrap: 200,
      };

      return defaultWidths[n.type] ?? 260; // 260px standard fallback
    };

    // Calculate the width needed for each column/depth
    const columnWidths: Record<number, number> = {};
    Object.entries(columns).forEach(([depthStr, nodeIds]) => {
      const depth = parseInt(depthStr);
      let maxWidth = 260;
      nodeIds.forEach((id) => {
        const node = nodes.find((n) => n.id === id);
        if (node) {
          maxWidth = Math.max(maxWidth, getNodeWidth(node));
        }
      });
      columnWidths[depth] = maxWidth;
    });

    // Positions mapping
    const startX = 100;
    const startY = 100;
    const spacingXGap = 50; // horizontal gap between columns (fixed space)
    const spacingY = 480;

    // Calculate x-coordinate for each depth by summing up previous column widths and gaps
    const depthXPositions: Record<number, number> = {};
    let currentX = startX;
    const sortedDepths = Object.keys(columns).map(Number).sort((a, b) => a - b);
    sortedDepths.forEach((depth) => {
      depthXPositions[depth] = currentX;
      currentX += columnWidths[depth] + spacingXGap;
    });

    // Position connected nodes by depth/column, tracking the lowest Y so the
    // isolated row can sit below the graph.
    const positions: Record<string, { x: number; y: number }> = {};
    let maxConnectedY = startY + 150;
    nodes.forEach((node) => {
      if (isolatedIds.has(node.id)) return;
      const depth = depths[node.id];
      const col = columns[depth] || [node.id];
      const idx = col.indexOf(node.id);
      const totalInCol = col.length;
      const yOffset = (idx - (totalInCol - 1) / 2) * spacingY;
      const y = startY + yOffset + 150;
      positions[node.id] = { x: depthXPositions[depth] ?? startX, y };
      if (y > maxConnectedY) maxConnectedY = y;
    });

    // Lay isolated (edge-less) nodes out in a single horizontal row.
    const hasConnected = Object.keys(columns).length > 0;
    const isoY = hasConnected ? maxConnectedY + spacingY : startY + 150;
    let isoX = startX;
    nodes.forEach((node) => {
      if (!isolatedIds.has(node.id)) return;
      positions[node.id] = { x: isoX, y: isoY };
      isoX += getNodeWidth(node) + spacingXGap;
    });

    const nextNodes = nodes.map((node) => ({
      ...node,
      position: positions[node.id] ?? node.position,
    }));

    setNodes(nextNodes);
  }, [nodes, edges, setNodes]);

  // Helper to strip massive runtime data from nodes before saving/exporting
  const stripVolatileNodeData = (node: Node) => {
    if (node.data) {
      delete node.data.pdb;
      delete node.data.output;
      delete node.data.topologyText;
    }
    return node;
  };

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
      nodes: deepClone(nodes).map(stripVolatileNodeData),
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
      nodes: deepClone(nodes).map(stripVolatileNodeData),
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
      nodes: deepClone(nodes).map(stripVolatileNodeData),
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

  const handleCompileAndRun = async (targetNodeId?: string) => {
    if (nodes.length === 0) {
      toast.error("Workflow Empty", {
        description: "Please add some nodes to your system before building.",
      });
      return;
    }

    let activeNodes = nodes;
    let activeEdges = edges;
    const selectedNodes = nodes.filter((n) => n.selected);

    if (targetNodeId) {
      const visited = new Set<string>();
      const queue = [targetNodeId];
      while (queue.length > 0) {
        const curId = queue.shift()!;
        if (visited.has(curId)) continue;
        visited.add(curId);
        const parents = edges
          .filter((e) => e.target === curId)
          .map((e) => e.source);
        queue.push(...parents);
      }
      activeNodes = nodes.filter((n) => visited.has(n.id));
      activeEdges = edges.filter((e) => visited.has(e.source) && visited.has(e.target));
      const targetType = nodes.find((n) => n.id === targetNodeId)?.type || "node";
      toast.info(`Running workflow up to ${targetType}...`);
    } else if (selectedNodes.length > 0) {
      // Shift-select a set of nodes, then hit Run to execute STRICTLY those nodes
      // (no upstream auto-included). Selection is shown with a primary ring, so
      // this is always a deliberate, visible choice.
      const selIds = new Set(selectedNodes.map((n) => n.id));
      // Guard: a selected node whose input comes from an UNselected node can't run
      // — that input variable would be undefined. Block with a helpful message
      // instead of producing a crashing script.
      const missingInputEdges = edges.filter((e) => selIds.has(e.target) && !selIds.has(e.source));
      if (missingInputEdges.length > 0) {
        const missingTypes = [
          ...new Set(missingInputEdges.map((e) => nodes.find((n) => n.id === e.source)?.type).filter(Boolean)),
        ];
        toast.error("Selected nodes are missing their inputs", {
          description:
            `These selected node(s) depend on unselected upstream node(s): ${missingTypes.join(", ")}. ` +
            `Shift-click to add them to the selection, or right-click a node → "Run up to this node".`,
          duration: 8000,
        });
        return;
      }
      activeNodes = selectedNodes;
      activeEdges = edges.filter((e) => selIds.has(e.source) && selIds.has(e.target));
      toast.info(`Running ${activeNodes.length} selected node(s) only...`);
    }

    const validationErrors = validateWorkflow(activeNodes, activeEdges);
    if (validationErrors.length > 0) {
      console.error("Workflow validation errors:", validationErrors);
      toast.error("Workflow validation failed", {
        description: validationErrors[0],
      });
      return;
    }

    const runToastId = toast.loading(targetNodeId ? "Running targeted subgraph..." : (selectedNodes.length > 0 ? "Running selected subgraph..." : "Running your system... this may take a minute."));
    const isOutputProducing = activeNodes.some((n) =>
      ["export", "xrd", "bvs", "bondAngle", "stats"].includes(n.type || "")
    );
    const nodeById = new Map(activeNodes.map((node) => [node.id, node]));
    const topoOrder = topologicalSortNodeIds(activeNodes, activeEdges);
    const trackedOrder = topoOrder.filter((nodeId) => shouldTrackNodeStatus(nodeById.get(nodeId)?.type || ""));
    setTrackedNodeOrder(trackedOrder);
    setNodeRunStatus(
      Object.fromEntries(trackedOrder.map((nodeId) => [nodeId, "queued"])) as Record<string, RunNodeStatus>,
    );
    setBuildProgress(0);
    setBuildStatus("Build queued...");
    setBuildLogs([]);
    setNodeLogsMap({});
    setDownloadToken(null);
    setIsBuilding(true);
    setShowStatusWindow(true);
    currentRunningNodeRef.current = null;

    try {
      // Default to minimalistic execution for cleaner generated scripts
      const useMinimalExecution = true;
      const fullScript = generatePythonCode(activeNodes, activeEdges, "full");
      const runtimeScript = useMinimalExecution ? generatePythonCode(activeNodes, activeEdges, "minimal") : fullScript;
      const strictScriptWithMarkers = generatePythonCode(activeNodes, activeEdges, "strict");
      const strictScript = stripOperationMarkers(strictScriptWithMarkers);
      const notebookScript = generateNotebookFromStrictScript(activeNodes, strictScriptWithMarkers);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

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
          verbose_log: verboseLog,
        }),
        signal: abortController.signal,
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
              setCurrentBuildId(null);
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
            } else if (data.type === "build_id") {
              setCurrentBuildId(data.buildId as string);
            } else if (data.type === "status") {
              const statusMessage = typeof data.message === "string" ? data.message.trim() : "";
              if (statusMessage) setBuildStatus(statusMessage);
            } else if (data.type === "log") {
              const logLine = typeof data.message === "string" ? data.message.trim() : "";
              // Topology editor: detected [ molecules ] sequence for a node
              // (__MOLSEQ__<nodeId>=<json>) — store on the node, hide from logs.
              const msMatch = logLine.match(/^__MOLSEQ__([^=]+)=(.*)$/);
              if (msMatch) {
                const msNodeId = msMatch[1];
                try {
                  const detected = JSON.parse(msMatch[2]);
                  if (Array.isArray(detected)) {
                    setNodes((nds) =>
                      nds.map((n) =>
                        n.id === msNodeId ? { ...n, data: { ...n.data, detectedMolecules: detected } } : n,
                      ),
                    );
                  }
                } catch {
                  /* ignore malformed marker */
                }
              } else if (logLine &&
                !logLine.includes("__PLOT_") &&
                !logLine.includes("__VISUALIZE_") &&
                !logLine.includes("__NODE_START_") &&
                !logLine.includes("__CHARGES_")) {
                setBuildLogs((prev) => [...prev.slice(-48), logLine]);
                const runningId = currentRunningNodeRef.current;
                if (runningId) {
                  setNodeLogsMap((prev) => ({
                    ...prev,
                    [runningId]: [...(prev[runningId] || []), logLine],
                  }));
                }
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
                } else {
                  // Fallback for untracked node types to capture logs scoped to that node
                  currentRunningNodeRef.current = nodeId;
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
            } else if (data.type === "box") {
              const { nodeId, data: boxData } = data;
              setNodes((nds) =>
                nds.map((node) => {
                  if (node.id === nodeId) {
                    const a = boxData.a ?? 50, b = boxData.b ?? 50, c = boxData.c ?? 50;
                    const alpha = boxData.alpha ?? 90, beta = boxData.beta ?? 90, gamma = boxData.gamma ?? 90;

                    const toRad = (deg: number) => (deg * Math.PI) / 180;
                    const isOrtho = Math.abs((alpha || 90) - 90) < 1e-6 && Math.abs((beta || 90) - 90) < 1e-6 && Math.abs((gamma || 90) - 90) < 1e-6;
                    let bd;
                    if (isOrtho) {
                      bd = { lx: a, ly: b, lz: c, xy: 0, xz: 0, yz: 0 };
                    } else {
                      const ar = toRad(alpha || 90), br = toRad(beta || 90), gr = toRad(gamma || 90);
                      const lx = a;
                      const xy = b * Math.cos(gr);
                      const ly = Math.sqrt(Math.max(0, b * b - xy * xy));
                      const xz = c * Math.cos(br);
                      const yz = ly !== 0 ? (b * c * Math.cos(ar) - xy * xz) / ly : 0;
                      const lz = Math.sqrt(Math.max(0, c * c - xz * xz - yz * yz));
                      bd = { lx, ly, lz, xy, xz, yz };
                    }

                    const fmtVal = (v: number) => parseFloat(v.toFixed(4));
                    const formattedBd = {
                      lx: fmtVal(bd.lx), ly: fmtVal(bd.ly), lz: fmtVal(bd.lz),
                      xy: fmtVal(bd.xy), xz: fmtVal(bd.xz), yz: fmtVal(bd.yz)
                    };

                    return {
                      ...node,
                      data: {
                        ...node.data,
                        ...boxData,
                        ...formattedBd,
                        lastInferredFrom: undefined
                      },
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
      setCurrentBuildId(null);
    } catch (error: unknown) {
      // If the build was aborted intentionally, don't show an error toast
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setIsBuilding(false);
      setCurrentBuildId(null);
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

  const handleStopBuild = async () => {
    // 1. Abort the SSE stream immediately so the UI resets
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    // 2. Signal the backend to kill the worker thread
    const bid = currentBuildId;
    if (bid) {
      try {
        await fetch(`/api/stop-build/${bid}`, { method: "POST" });
      } catch {
        // Ignore — server may already have cleaned up
      }
    }

    // 3. Reset UI state
    setIsBuilding(false);
    setCurrentBuildId(null);
    setBuildStatus("Build stopped by user.");
    setNodeRunStatus((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((nodeId) => {
        if (next[nodeId] === "running" || next[nodeId] === "queued") {
          next[nodeId] = "skipped";
        }
      });
      return next;
    });
    toast.warning("Build stopped.");
  };

  return (
    <section className="mx-auto w-full py-2 px-4 h-[1100px] flex flex-col space-y-1">
      <div className="flex justify-between items-center bg-card/50 backdrop-blur-md py-1 px-1.5 rounded-2xl border border-border shadow-2xl w-full">
        <div className="grid grid-cols-[1fr_theme(spacing.28)_theme(spacing.48)] gap-x-4 gap-y-1 items-center w-full">
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg flex-nowrap overflow-x-auto w-full min-w-0">
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("structure")} title="Import Structure">
              <FileInput className="w-4 h-4 text-slate-500" /> Import
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("replicate")} title="Replicate">
              <Grid3x3 className="w-4 h-4 text-slate-500" /> Rep
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("box")} title="Box Settings">
              <Box className="w-4 h-4 text-slate-500" /> Box
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("transform")} title="Spatial Ops (Translate/Rotate/Scale/Bend)">
              <Move3D className="w-4 h-4 text-slate-500" /> Spatial
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("add")} title="Join branches">
              <Combine className="w-4 h-4 text-slate-500" /> Join
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("insert")} title="Insert Molecule">
              <PackagePlus className="w-4 h-4 text-slate-500" /> Insert
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("ions")} title="Add Ions (Random or Grid)">
              <BadgePlus className="w-4 h-4 text-slate-500" /> Ions
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("solvent")} title="Add Solvent / Water Models">
              <Droplet className="w-4 h-4 text-slate-500" /> Solvent
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("forcefield")} title="Assign Forcefield">
              <FlaskConical className="w-4 h-4 text-slate-500" /> Forcefield
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("viewer")} title="3D Preview Structure">
              <Eye className="w-4 h-4 text-slate-500" /> View
            </Button>
            <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("export")} title="Export">
              <FileOutput className="w-4 h-4 text-slate-500" /> Export
            </Button>

            <div className="h-4 w-[1px] bg-slate-200 mx-1" />

            <Button
              className="gap-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"
              variant="ghost"
              size="sm"
              onClick={() => undo(setNodes, setEdges)}
              disabled={!canUndo}
              title="Undo last change (Cmd+Z / Ctrl+Z)"
            >
              <History className="w-4 h-4 rotate-180" /> Undo
            </Button>
            <Button
              className="gap-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"
              variant="ghost"
              size="sm"
              onClick={() => redo(setNodes, setEdges)}
              disabled={!canRedo}
              title="Redo last undone change (Cmd+Y / Ctrl+Y)"
            >
              <History className="w-4 h-4" /> Redo
            </Button>

            <div className="h-4 w-[1px] bg-slate-200 mx-1" />

            <Button
              variant="ghost"
              size="sm"
              className={showMoreOptions ? "text-primary" : "text-muted-foreground"}
              onClick={() => setShowMoreOptions(!showMoreOptions)}
              title="Toggle Advanced Operations Toolbar"
            >
              <SlidersHorizontal className="w-4 h-4 mr-1" />
              More
            </Button>
          </div>
          <div className="w-full flex justify-center">
            {isBuilding ? (
              <Button
                id="stop-build-btn"
                className="shadow-lg shadow-destructive/30 w-full h-11 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={handleStopBuild}
                title="Stop the running build"
              >
                <OctagonX className="w-4 h-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button className="shadow-lg shadow-primary/20 w-full h-11" onClick={() => handleCompileAndRun()}>
                <Play className="w-4 h-4 mr-2" />
                {(() => {
                  const nSel = nodes.filter((n) => n.selected).length;
                  return nSel > 0 ? "Selected" : "Run";
                })()}
              </Button>
            )}
          </div>
          <div /> {/* Grid spacer */}


          {/* Row 3 content (if expanded) */}
          {showMoreOptions && (
            <>
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg flex-wrap w-full min-w-0">
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("merge")} title="Merge with overlap removal">
                  <GitMerge className="w-4 h-4 text-slate-500" /> Merge
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("pbc")} title="PBC Tools (Wrap/Unwrap/Condense)">
                  <Minimize className="w-4 h-4 text-slate-500" /> PBC
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("edit")} title="Edit Atoms (Slice/Remove/Resname/Reorder)">
                  <SlidersHorizontal className="w-4 h-4 text-slate-500" /> Edit
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("atomProps")} title="Atom Properties (Element/Charge/Mass/COM)">
                  <Atom className="w-4 h-4 text-slate-500" /> Props
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("coordFrame")} title="Transform (Coordinate Frame Tools)">
                  <Move3D className="w-4 h-4 text-slate-500" /> Transform
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("chemistry")} title="Chemistry (Substitute/Fuse/AddH)">
                  <FlaskConical className="w-4 h-4 text-slate-500" /> Chem
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("analysis")} title="Analysis (RDF/CN/Closest/Occupancy/BVS/Stats)">
                  <BarChart3 className="w-4 h-4 text-slate-500" /> Analysis
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("bondAngle")} title="Bond and angle statistics">
                  <Waypoints className="w-4 h-4 text-slate-500" /> B/A
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("xrd")} title="Run XRD Simulation">
                  <BarChart3 className="w-4 h-4 text-slate-500" /> XRD
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("plot")} title="Data Plot">
                  <BarChart className="w-4 h-4 text-slate-500" /> Plot
                </Button>
                <Button
                  className={`gap-1 ${disableSimulation ? "opacity-75 hover:opacity-100" : ""}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => addNode("simulate")}
                  title={disableSimulation ? "OpenMM Simulation (Server-side execution disabled; placement enables local/Colab Python code download)" : "OpenMM Simulation (Minimize/NVT/NPT)"}
                >
                  <Activity className={`w-4 h-4 ${disableSimulation ? "text-amber-500" : "text-slate-500"}`} />
                  Simulate {disableSimulation && "(Colab)"}
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("trajectory")} title="Trajectory">
                  <History className="w-4 h-4 text-slate-500" /> Traj
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("topology")} title="Override the [ molecules ] topology section">
                  <ListOrdered className="w-4 h-4 text-slate-500" /> Topology
                </Button>
              </div>
              <div className="w-full flex justify-center">
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

          {/* Row 4 content (if expanded) */}
          {showMoreOptions && (
            <>
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg w-full min-w-0 overflow-x-auto">
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

                {(selectedSavedWorkflow || selectedCustomTemplate) && (
                  <Button className="gap-1" variant="ghost" size="sm" onClick={handleDeleteSelectedEntry} title="Delete selected workflow/template">
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                )}

                {/* TOGGLES CONTAINER */}
                <div className="ml-auto flex items-center gap-2">
                  {/* SMOOTH STEP Toggle */}
                  <div className="flex items-center gap-1 bg-slate-200/50 rounded-md p-1 border border-slate-300 shadow-inner nodrag">
                    <Button
                      variant={edgeType === "bezier" ? "default" : "ghost"}
                      size="xs"
                      className={`h-7 text-[10px] w-[58px] justify-center uppercase font-black transition-all ${edgeType === "bezier" ? "shadow-sm" : "text-slate-500"
                        }`}
                      onClick={() => setEdgeType("bezier")}
                    >
                      Smooth
                    </Button>
                    <Button
                      variant={edgeType === "step" ? "default" : "ghost"}
                      size="xs"
                      className={`h-7 text-[10px] w-[58px] justify-center uppercase font-black transition-all ${edgeType === "step" ? "shadow-sm" : "text-slate-500"
                        }`}
                      onClick={() => setEdgeType("step")}
                    >
                      Step
                    </Button>
                  </div>

                  {/* SNAP GRID LAYOUT Toggle */}
                  <div className="flex items-center gap-1 bg-slate-200/50 rounded-md p-1 border border-slate-300 shadow-inner nodrag">
                    <Button
                      variant={snapToGrid ? "default" : "ghost"}
                      size="xs"
                      className={`h-7 text-[10px] w-[68px] justify-center uppercase font-black transition-all ${snapToGrid ? "shadow-sm" : "text-slate-500"
                        }`}
                      onClick={() => setSnapToGrid(!snapToGrid)}
                      title="Toggle grid snapping"
                    >
                      Snap Grid
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-7 text-[10px] w-[68px] justify-center uppercase font-black text-slate-500 hover:text-slate-800 transition-all hover:bg-slate-300/40 rounded-sm"
                      onClick={handleAutoLayout}
                      title="Arrange nodes neatly"
                    >
                      Layout
                    </Button>
                  </div>

                  {/* VERBOSE Toggle */}
                  <div className="flex items-center gap-1 bg-slate-200/50 rounded-md p-1 border border-slate-300 shadow-inner nodrag">
                    <Button
                      variant={verboseLog ? "default" : "ghost"}
                      size="xs"
                      className={`h-7 text-[10px] w-[64px] justify-center uppercase font-black transition-all ${verboseLog ? "shadow-sm" : "text-slate-500"}`}
                      onClick={() => setVerboseLog(!verboseLog)}
                      title="Include protocol lines (visualize/charges/box) in execution.log"
                    >
                      Verbose
                    </Button>
                  </div>
                </div>

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
        {/* Floating Warnings Alert Banner */}
        {(() => {
          const prerequisiteWarnings = checkWorkflowPrerequisites(nodes, edges);
          if (prerequisiteWarnings.length === 0) return null;
          
          if (isWarningsMinimized) {
            return (
              <button
                onClick={() => setIsWarningsMinimized(false)}
                className="absolute top-3 left-3 z-20 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full py-1.5 px-4 text-[10px] uppercase tracking-wider shadow-lg flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all duration-200 nodrag"
                title="Expand workflow warnings"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {prerequisiteWarnings.length} Warnings (Expand)
              </button>
            );
          }

          return (
            <div className="absolute top-3 left-3 z-20 w-[640px] max-w-[calc(100%-300px)] bg-amber-500/10 border border-amber-500/30 text-amber-600 rounded-xl p-4 text-xs space-y-2 backdrop-blur-md shadow-xl transition-all duration-300 nodrag">
              <div className="flex items-center justify-between font-bold uppercase tracking-wider text-[11px] border-b border-amber-500/20 pb-1.5 mb-1">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Workflow Configuration Warnings
                </div>
                <button
                  onClick={() => setIsWarningsMinimized(true)}
                  className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 rounded text-amber-700 hover:text-amber-800 transition-all font-sans font-bold normal-case text-[10px]"
                >
                  Collapse
                </button>
              </div>
              <div className="space-y-1 max-h-[160px] overflow-y-auto">
                {prerequisiteWarnings.map((warn, i) => (
                  <p key={i} className="pl-2 leading-relaxed font-medium">• {warn}</p>
                ))}
              </div>
            </div>
          );
        })()}

        {showStatusWindow && (
          <div
            ref={statusWindowRef}
            className="absolute right-3 top-3 z-20 w-[460px] rounded-xl border border-border bg-card/95 p-2.5 shadow-xl backdrop-blur-sm flex flex-col"
            // resize: both gives X+Y drag; direction:rtl puts the grab handle in
            // the BOTTOM-LEFT so the panel grows into the canvas (its right edge
            // stays pinned). Inner wrapper resets to ltr. Width/height are set
            // imperatively (see effect), so they're omitted here.
            style={{
              minWidth: 300, minHeight: 140, maxWidth: "92vw", maxHeight: "88vh",
              resize: isStatusWindowMinimized ? "none" : "both",
              overflow: "hidden", direction: "rtl",
            }}
          >
          <div style={{ direction: "ltr" }} className="flex flex-col min-h-0 flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Node Status</p>
                {isBuilding && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted-foreground">{Math.round(buildProgress)}%</p>
                <button
                  onClick={() => setIsStatusWindowMinimized(!isStatusWindowMinimized)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted"
                  title={isStatusWindowMinimized ? "Expand Status Window" : "Minimize Status Window"}
                >
                  {isStatusWindowMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setShowStatusWindow(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted"
                  title="Close Status Window"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <Progress value={buildProgress} className="h-1 mb-2" />
            <p className="text-xs text-muted-foreground mb-2">{buildStatus || "Waiting for backend updates..."}</p>

            {downloadToken && (
              <div className="mb-3">
                <p className="flex items-start gap-1.5 mb-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-600">
                  <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                  <span>Download now — results are not stored on the server and cannot be retrieved later.</span>
                </p>
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

            {!isStatusWindowMinimized && (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 scrollbar-thin" ref={scrollRef}>
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
              </div>
            )}
          </div>
          </div>
        )}
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes.map((n) => {
              const statusStyle = getNodeStatusStyle(nodeRunStatus[n.id]);
              const baseStyle = n.style || {};
              const opacity = n.data?.disabled === true ? 0.4 : 1.0;
              const filter = n.data?.disabled === true ? "grayscale(45%)" : "none";
              return {
                ...n,
                style: {
                  ...baseStyle,
                  ...statusStyle,
                  opacity,
                  filter,
                },
              };
            })}
            edges={edges}
            onNodesChange={(changes) => setNodes((nds) => applyNodeChanges(changes, nds))}
            onEdgesChange={(changes) => setEdges((eds) => applyEdgeChanges(changes, eds))}
            onConnect={onConnect}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={onPaneClick}
            onMoveStart={onPaneClick}
            isValidConnection={isValidConnection}
            onInit={(instance) => {
              setRfInstance(instance);
              if (!localStorage.getItem("atomipy_active_workflow_viewport") && !localStorage.getItem("atomipy_active_workflow")) {
                setTimeout(() => instance.fitView({ padding: 0.4, maxZoom: 0.8 }), 50);
              }
            }}
            onMoveEnd={(event, viewport) => {
              localStorage.setItem("atomipy_active_workflow_viewport", JSON.stringify(viewport));
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: "deletable" }}
            snapToGrid={snapToGrid}
            snapGrid={[30, 30]}
            defaultViewport={initialViewport}
            minZoom={0.1}
            maxZoom={2.5}
          >
            <Controls />
            <Background gap={20} size={1} color="rgba(0,0,0,0.1)" />
          </ReactFlow>
        </ReactFlowProvider>

        {/* Floating Context Menu */}
        {menu && (
          <div
            className="absolute z-50 min-w-[210px] backdrop-blur-md bg-white/95 border border-slate-200/80 text-slate-700 shadow-xl shadow-slate-200/40 rounded-xl p-1.5 flex flex-col space-y-0.5 pointer-events-auto"
            style={{ top: menu.y, left: menu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
              Node Actions
            </div>
            
            <button
              onClick={() => {
                handleCompileAndRun(menu.id);
                setMenu(null);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all duration-150 text-left w-full font-medium"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run up to this node</span>
            </button>

            <button
              onClick={() => handleDuplicateNode(menu.id)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-slate-100 text-slate-600 rounded-lg transition-all duration-150 text-left w-full"
            >
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Duplicate Node</span>
            </button>

            {nodes.filter((n) => n.selected).length > 1 && (
              <button
                onClick={handleDuplicateSelection}
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-slate-100 text-slate-600 rounded-lg transition-all duration-150 text-left w-full"
              >
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Duplicate selection ({nodes.filter((n) => n.selected).length})</span>
              </button>
            )}

            <button
              onClick={() => handleToggleBypassNode(menu.id)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-slate-100 text-slate-600 rounded-lg transition-all duration-150 text-left w-full"
            >
              <Ban className={`w-3.5 h-3.5 ${nodes.find(n => n.id === menu.id)?.data?.disabled === true ? "text-amber-500" : "text-slate-400"}`} />
              <span>
                {nodes.find((n) => n.id === menu.id)?.data?.disabled === true
                  ? "Enable Node"
                  : "Bypass / Disable"}
              </span>
            </button>

            <div className="border-t border-slate-100 my-1" />

            <button
              onClick={() => handleInspectPythonCode(menu.id)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-slate-100 text-slate-600 rounded-lg transition-all duration-150 text-left w-full"
            >
              <Terminal className="w-3.5 h-3.5 text-blue-500" />
              <span>View Python Script</span>
            </button>

            <button
              onClick={() => handleInspectNodeLogs(menu.id)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-slate-100 text-slate-600 rounded-lg transition-all duration-150 text-left w-full"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-500" />
              <span>View Node Logs</span>
            </button>

            <div className="border-t border-slate-100 my-1" />

            <button
              onClick={() => handleDeleteNode(menu.id)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-rose-500 hover:bg-rose-50 rounded-lg transition-all duration-150 text-left w-full font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Node</span>
            </button>
          </div>
        )}

        {/* Dynamic Code & Logs Inspector Modal */}
        {activeInspector && (
          <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  {activeInspector.type === "code" ? (
                    <Terminal className="w-4 h-4 text-blue-500" />
                  ) : (
                    <Eye className="w-4 h-4 text-indigo-500" />
                  )}
                  {activeInspector.title}
                </h3>
                <button
                  onClick={() => setActiveInspector(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-5 font-mono text-xs leading-relaxed text-slate-700 bg-slate-50/20 max-h-[500px]">
                {activeInspector.type === "code" ? (
                  <pre className="whitespace-pre overflow-x-auto text-emerald-700 pb-4">{activeInspector.content}</pre>
                ) : (
                  <div className="space-y-1">
                    {activeInspector.content.split("\n").map((line, idx) => (
                      <p key={idx} className="break-words text-slate-600">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-slate-100 flex justify-end bg-slate-50/50">
                <Button
                  onClick={() => setActiveInspector(null)}
                  size="sm"
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
