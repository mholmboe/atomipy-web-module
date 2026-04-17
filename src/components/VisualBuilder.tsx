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
  FlaskConical,
  Maximize,
  FileOutput,
  Box,
  GitMerge,
  BarChart3,
  Calculator,
  Waypoints,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

// Import Custom Nodes
import { StructureNode } from "./nodes/StructureNode";
import { ReplicateNode } from "./nodes/ReplicateNode";
import { ExportNode } from "./nodes/ExportNode";
import { AddIonsNode } from "./nodes/AddIonsNode";
import { SolvateNode } from "./nodes/SolvateNode";
import { PositionNode } from "./nodes/PositionNode";
import { WrapNode } from "./nodes/WrapNode";
import { BoxNode } from "./nodes/BoxNode";
import { MergeNode } from "./nodes/MergeNode";
import { AddNode } from "./nodes/AddNode";
import { RotateNode } from "./nodes/RotateNode";
import { ScaleNode } from "./nodes/ScaleNode";
import { SliceNode } from "./nodes/SliceNode";
import { InsertNode } from "./nodes/InsertNode";
import { SubstituteNode } from "./nodes/SubstituteNode";
import { FuseNode } from "./nodes/FuseNode";
import { ResnameNode } from "./nodes/ResnameNode";
import { MoleculeNode } from "./nodes/MoleculeNode";
import { ForcefieldNode } from "./nodes/ForcefieldNode";
import { BondAngleNode } from "./nodes/BondAngleNode";
import { BvsNode } from "./nodes/BvsNode";
import { XrdNode } from "./nodes/XrdNode";
import type { PresetOption } from "./nodes/types";

const nodeTypes = {
  structure: StructureNode,
  preset: StructureNode,
  upload: StructureNode,
  replicate: ReplicateNode,
  export: ExportNode,
  addIons: AddIonsNode,
  solvate: SolvateNode,
  position: PositionNode,
  wrap: WrapNode,
  box: BoxNode,
  merge: MergeNode,
  add: AddNode,
  rotate: RotateNode,
  scale: ScaleNode,
  slice: SliceNode,
  insert: InsertNode,
  substitute: SubstituteNode,
  fuse: FuseNode,
  resname: ResnameNode,
  molecule: MoleculeNode,
  forcefield: ForcefieldNode,
  bondAngle: BondAngleNode,
  bvs: BvsNode,
  xrd: XrdNode,
};

const initialNodes: Node[] = [
  {
    id: "node_1",
    type: "structure",
    position: { x: 50, y: 150 },
    data: { source: "preset", value: "Pyrophyllite_Lee_Guggenheim_1981.pdb" },
  },
  {
    id: "node_2",
    type: "replicate",
    position: { x: 400, y: 150 },
    data: { x: 6, y: 4, z: 1 },
  },
  {
    id: "node_3",
    type: "export",
    position: { x: 750, y: 150 },
    data: {
      outputName: "mineral_system",
      structureFormat: "xyz",
      topologyFormat: "none",
      angleTerms: "500",
    },
  },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "node_1", target: "node_2" },
  { id: "e2-3", source: "node_2", target: "node_3" },
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

const WORKFLOW_SAVED_STORAGE_KEY = "atomipy_v2_saved_workflows";
const WORKFLOW_TEMPLATE_STORAGE_KEY = "atomipy_v2_custom_templates";
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
    "export",
  ]);

  nodes.forEach((node) => {
    const data = (node.data ?? {}) as NodeDataMap;
    const incoming = incomingByTarget.get(node.id) || [];

    if (singleInputOps.has(node.type || "") && incoming.length === 0) {
      errors.push(`Node "${node.type}" has no input connection.`);
    }

    if (node.type === "merge" || node.type === "add") {
      const hasA = incoming.some((e) => e.targetHandle === "inA");
      const hasB = incoming.some((e) => e.targetHandle === "inB");
      if (!hasA || !hasB) {
        errors.push(`Node "${node.type}" requires both A and B inputs.`);
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
          data: { source: "preset", value: "Pyrophyllite_Lee_Guggenheim_1981.pdb" },
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
          data: { source: "preset", value: "Pyrophyllite_Lee_Guggenheim_1981.pdb" },
        },
        {
          id: "tmpl3_2",
          type: "structure",
          position: { x: 40, y: 320 },
          data: { source: "preset", value: "Kaolinite_GII_0.0487.pdb" },
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

export default function VisualBuilder() {
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const workflowImportInputRef = useRef<HTMLInputElement>(null);
  const [presets, setPresets] = useState<PresetOption[]>([]);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
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

  useEffect(() => {
    setCustomTemplates(loadWorkflowEntriesFromStorage(WORKFLOW_TEMPLATE_STORAGE_KEY));
    setSavedWorkflows(loadWorkflowEntriesFromStorage(WORKFLOW_SAVED_STORAGE_KEY));
  }, []);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const addNode = (type: string) => {
    const baseData: Record<string, unknown> = { presets };

    if (type === "structure") {
      baseData.source = "preset";
    }

    if (type === "insert") {
      baseData.source = "preset";
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
      setNodes(deepClone(graph.nodes));
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
    toast("Compiling Script...");

    const validationErrors = validateWorkflow(nodes, edges);
    if (validationErrors.length > 0) {
      const preview = validationErrors.slice(0, 3).join(" | ");
      console.error("Workflow validation errors:", validationErrors);
      toast.error("Workflow validation failed", {
        description: validationErrors.length > 3 ? `${preview} | ...` : preview,
        duration: 7000,
      });
      return;
    }

    try {
      const code = generatePythonCode(nodes, edges);
      console.log("Generated Script:\n", code);

      const res = await fetch("/api/execute-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: code }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const errorData = (await res.json()) as { stderr?: string; error?: string };
        const msg = errorData.stderr || errorData.error || `Execution failed (status ${res.status}).`;
        console.error("Execution error:", msg);
        toast.error("Build Failed", {
          description: msg.length > 140 ? msg.substring(0, 140) + "..." : msg,
          duration: 7000,
        });
        return;
      }

      const blob = await res.blob();
      if (!contentType.includes("application/zip")) {
        toast.error(`Unexpected response format (status ${res.status}).`);
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "atomipy_results.zip";
      a.click();
      window.URL.revokeObjectURL(url);

      if (res.ok) {
        toast.success("Build successful! Downloading results...");
      } else {
        toast.error("Build failed. Downloading error bundle...", { duration: 7000 });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Build error: " + message);
    }
  };

  return (
    <section className="mx-auto w-full max-w-[1700px] py-8 px-4 h-[850px] flex flex-col space-y-4">
      <div className="flex justify-between items-center bg-card/50 backdrop-blur-md p-4 rounded-2xl border border-border shadow-2xl">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent lowercase">
            atomipy
          </h2>
          <p className="text-xs text-muted-foreground mt-1 text-balance">Compose your system as a workflow</p>
        </div>
        <div className="flex gap-2 items-start flex-1 justify-center ml-8">
          <div className="space-y-2">
            <div className="flex bg-muted p-1 rounded-lg flex-nowrap overflow-x-auto">
              <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("structure")} title="Import Structure">
                <FileInput className="w-4 h-4" /> Import
              </Button>
              <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("replicate")} title="Replicate">
                <Grid3x3 className="w-4 h-4" /> Rep
              </Button>
              <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("box")} title="Box Settings">
                <Box className="w-4 h-4" /> Box
              </Button>
              <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("position")} title="Position">
                <Target className="w-4 h-4" /> Pos
              </Button>
              <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("add")} title="Join branches">
                <Combine className="w-4 h-4" /> Join
              </Button>
              <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("merge")} title="Merge with overlap removal">
                <GitMerge className="w-4 h-4" /> Merge
              </Button>
              <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("wrap")} title="Wrap">
                <Maximize className="w-4 h-4" /> Wrap
              </Button>
              <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("insert")} title="Insert Molecule">
                <PackagePlus className="w-4 h-4" /> Insert
              </Button>
              <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("addIons")} title="Add Ions">
                <BadgePlus className="w-4 h-4" /> Ions
              </Button>
              <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("solvate")} title="Solvate">
                <Droplet className="w-4 h-4" /> Solv
              </Button>
              <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("forcefield")} title="Assign Forcefield">
                <FlaskConical className="w-4 h-4" /> FF
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

            {showMoreOptions && (
              <div className="flex bg-muted p-1 rounded-lg flex-wrap">
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("rotate")} title="Rotate">
                  <RotateCw className="w-4 h-4" /> Rot
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("scale")} title="Scale">
                  <Scaling className="w-4 h-4" /> Scale
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("slice")} title="Slice">
                  <Scissors className="w-4 h-4" /> Slice
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("substitute")} title="Substitute">
                  <Diff className="w-4 h-4" /> Subst
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("fuse")} title="Fuse atoms">
                  <Spline className="w-4 h-4" /> Fuse
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("resname")} title="Assign resname">
                  <Tag className="w-4 h-4" /> Res
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("molecule")} title="Set molecule id">
                  <Fingerprint className="w-4 h-4" /> Mol
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("bondAngle")} title="Bond and angle statistics">
                  <Waypoints className="w-4 h-4" /> B/A
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("xrd")} title="Run XRD Simulation">
                  <BarChart3 className="w-4 h-4" /> XRD
                </Button>
                <Button className="gap-1" variant="ghost" size="sm" onClick={() => addNode("bvs")} title="Bond valence sum analysis">
                  <Calculator className="w-4 h-4" /> BVS
                </Button>
              </div>
            )}

            {showMoreOptions && (
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
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
              <input
                ref={workflowImportInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportWorkflowFile}
              />
            </div>
          )}
          </div>
          <Button className="shadow-lg shadow-primary/20 shrink-0" onClick={handleCompileAndRun}>
            <Play className="w-4 h-4 mr-2" />
            Build
          </Button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl overflow-hidden border border-border bg-muted/20 relative" ref={reactFlowWrapper}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes.map((n) => ({ ...n, data: { ...n.data, presets } }))}
            edges={edges}
            onNodesChange={(changes) => setNodes((nds) => applyNodeChanges(changes, nds))}
            onEdgesChange={(changes) => setEdges((eds) => applyEdgeChanges(changes, eds))}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
          >
            <Controls />
            <Background gap={20} size={1} color="rgba(0,0,0,0.1)" />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </section>
  );
}

function generatePythonCode(nodes: Node[], edges: Edge[]) {
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
  let pythonCode = `import atomipy as ap\nimport os\nimport traceback\n\n`;
  pythonCode += `\"\"\"\natomipy Workflow Script\nGenerated by atomipy web module\n\nTo run this script locally:\n1. Install atomipy: pip install git+https://github.com/mholmboe/atomipy.git\n2. Note: Built-in structures ('UC_conf/') are accessible when running in the web bundle.\n   For local use, you may need to provide absolute paths to your PDB/CIF files.\n\"\"\"\n\n`;
  pythonCode += `def __report_error__(node_type, node_id, exc):\n`;
  pythonCode += `    \"\"\"Helper to log errors for the web interface while remaining readable.\"\"\"\n`;
  pythonCode += `    with open('build_errors.log', 'a', encoding='utf-8') as _err:\n`;
  pythonCode += `        _err.write(f'Node {node_type} ({node_id}) failed: {exc}\\n')\n`;
  pythonCode += `        _err.write(traceback.format_exc() + '\\n')\n`;
  pythonCode += `    raise\n\n`;
  pythonCode += `open('build_errors.log', 'w', encoding='utf-8').close()\n`;

  const stateVars = new Map<string, { atoms: string; box: string }>();

  sorted.forEach((id, index) => {
    const n = nodeMap.get(id)!;
    const data = (n.data ?? {}) as NodeDataMap;
    const blockOutAtoms = `${n.type}_atoms_${index}`;
    const blockOutBox = `${n.type}_box_${index}`;

    const incomingEdges = edges.filter((e) => e.target === id);
    let inAtoms = "None";
    let inBox = "None";

    if (incomingEdges.length === 1 && stateVars.has(incomingEdges[0].source)) {
      const parentState = stateVars.get(incomingEdges[0].source)!;
      inAtoms = parentState.atoms;
      inBox = parentState.box;
    }

    const opType = n.type || "unknown";
    const opTypeEscaped = pyEscape(opType);
    const opIdEscaped = pyEscape(id);
    pythonCode += `\n# --- Operation: ${opType} (${id}) ---\n`;
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
        pythonCode += `${blockOutBox} = ap.Cell2Box_dim(${blockOutBox})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "preset": {
        const file = pyEscape(getString(data, "value", "unknown.pdb"));
        pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'UC_conf/${file}')\n`;
        pythonCode += `${blockOutBox} = ap.Cell2Box_dim(${blockOutBox})\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "upload": {
        const upFilename = pyEscape(getString(data, "filename", "uploaded.pdb"));
        pythonCode += `${blockOutAtoms}, ${blockOutBox} = ap.import_auto(f'uploads/${upFilename}')\n`;
        pythonCode += `${blockOutBox} = ap.Cell2Box_dim(${blockOutBox})\n`;
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
        const edgeA = incomingEdges.find((e) => e.targetHandle === "inA");
        const edgeB = incomingEdges.find((e) => e.targetHandle === "inB");
        const stateA = edgeA ? stateVars.get(edgeA.source) : null;
        const stateB = edgeB ? stateVars.get(edgeB.source) : null;

        if (stateA && stateB) {
          pythonCode += `${blockOutAtoms} = ap.update(${stateA.atoms}, ${stateB.atoms})\n`;
          pythonCode += `${blockOutBox} = ${stateA.box}\n`;
          stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        } else {
          pythonCode += `# Error: Join node missing input A or B\n`;
        }
        break;
      }
      case "box": {
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

        const aExpr = a !== null ? `${a}` : inBox !== "None" ? `${inCell}[0]` : "50.0";
        const bExpr = b !== null ? `${b}` : inBox !== "None" ? `${inCell}[1]` : "50.0";
        const cExpr = c !== null ? `${c}` : inBox !== "None" ? `${inCell}[2]` : "50.0";
        const alphaExpr = alpha !== null ? `${alpha}` : inBox !== "None" ? `${inCell}[3]` : "90.0";
        const betaExpr = beta !== null ? `${beta}` : inBox !== "None" ? `${inCell}[4]` : "90.0";
        const gammaExpr = gamma !== null ? `${gamma}` : inBox !== "None" ? `${inCell}[5]` : "90.0";

        pythonCode += `${blockOutBox} = ap.Cell2Box_dim([${aExpr}, ${bExpr}, ${cExpr}, ${alphaExpr}, ${betaExpr}, ${gammaExpr}])\n`;
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
        pythonCode += `${insertedVar} = ap.insert(${templateAtoms}, ${limitsExpr}, rotate=${rotateArg}, min_distance=${minDistance}, num_molecules=${numMolecules}, solute_atoms=${wrappedInAtoms}${constraintsArg}${zDiffArg})\n`;
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
      case "addIons": {
        const ion = pyEscape(getString(data, "ionType", "Na"));
        const count = getNumber(data, "count", 0);
        const dist = getNumber(data, "minDistance", 3.0);
        const placement = pyEscape(getString(data, "placement", "random"));
        const direction = getString(data, "direction", "").toLowerCase();
        const directionValue = getOptionalNumber(data, "directionValue");
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
        const directionArg =
          (direction === "x" || direction === "y" || direction === "z") && directionValue !== null
            ? `, direction='${direction}', direction_value=${directionValue}`
            : "";
        const wrappedInAtoms = `wrapped_${index}`;
        const ionsVar = `ions_${index}`;
        pythonCode += `${wrappedInAtoms} = ap.wrap(${inAtoms}, ${inBox})\n`;
        pythonCode += `${ionsVar} = ap.ionize('${ion}', resname='ION', limits=${limitsExpr}, num_ions=${count}, min_distance=${dist}, solute_atoms=${wrappedInAtoms}, placement='${placement}'${directionArg})\n`;
        pythonCode += `${blockOutAtoms} = ap.update(${inAtoms}, ${ionsVar})\n`;
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
        pythonCode += `${solventVar} = ap.solvate(limits=${limitsExpr}, density=${dens}, min_distance=${sdist}, max_solvent=${maxSolventExpr}, solute_atoms=${wrappedInAtoms}, solvent_type='${model}', include_solute=${includeSolutePy})\n`;
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
      case "forcefield": {
        const ff = getString(data, "forcefield", "minff").toLowerCase();
        const rmaxLong = getNumber(data, "rmaxLong", 2.45);
        const rmaxH = getNumber(data, "rmaxH", 1.2);
        const log = getBoolean(data, "log", false);
        const logFile = getString(data, "logFile", "").trim();
        const logArg = log ? `, log=True${logFile ? `, log_file='${pyEscape(logFile)}'` : ""}` : "";
        if (ff === "clayff") {
          pythonCode += `${blockOutAtoms} = ap.clayff(${inAtoms}, ${inBox}, rmaxlong=${rmaxLong}, rmaxH=${rmaxH}${logArg})\n`;
        } else {
          pythonCode += `${blockOutAtoms} = ap.minff(${inAtoms}, ${inBox}, rmaxlong=${rmaxLong}, rmaxH=${rmaxH}${logArg})\n`;
        }
        pythonCode += `${blockOutBox} = ${inBox}\n`;
        stateVars.set(id, { atoms: blockOutAtoms, box: blockOutBox });
        break;
      }
      case "bondAngle": {
        const rmaxH = getNumber(data, "rmaxH", 1.2);
        const rmaxM = getNumber(data, "rmaxM", 2.45);
        const sameElementBonds = getBoolean(data, "sameElementBonds", false) ? "True" : "False";
        const sameMoleculeOnly = getBoolean(data, "sameMoleculeOnly", true) ? "True" : "False";
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
              pythonCode += `${analyzedAtoms}, ${bondIndexVar}, ${angleIndexVar}, ${dihedralIndexVar}, ${pairListVar} = ap.bond_angle_dihedral(${inAtoms}, ${inBox}, rmaxH=${rmaxH}, rmaxM=${rmaxM}, same_element_bonds=${sameElementBonds}, same_molecule_only=${sameMoleculeOnly})\n`;
            } else {
              pythonCode += `${analyzedAtoms}, ${bondIndexVar}, ${angleIndexVar} = ap.bond_angle(${inAtoms}, ${inBox}, rmaxH=${rmaxH}, rmaxM=${rmaxM}, same_element_bonds=${sameElementBonds}, same_molecule_only=${sameMoleculeOnly})\n`;
              pythonCode += `${dihedralIndexVar} = []\n`;
              pythonCode += `${pairListVar} = []\n`;
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
          pythonCode += `ap.xrd(${inAtoms}, ${inBox}, wavelength=${wavelength}, two_theta_range=(${twoThetaMin}, ${twoThetaMax}), angle_step=${angleStep}, fwhm_00l=${f00l}, fwhm_hk0=${fhk0}, fwhm_hkl=${fhkl}, b_all=${bAll}, lorentzian_factor=${lorentzian}, neutral_atoms=${neutral}, pref=${pref}, preferred_orientation=(${prefH}, ${prefK}, ${prefL}), save_output=True, plot=True)\n`;
        } else {
          pythonCode += `# XRD skipped: missing input atoms/box\n`;
        }
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
        const cifTitle = pyEscape(getString(data, "cifTitle", "Generated by atomipy"));
        const topologyRmaxH = getNumber(data, "topologyRmaxH", 1.2);
        const topologyRmaxM = getNumber(data, "topologyRmaxM", 2.45);
        const detectBimodal = getBoolean(data, "detectBimodal", false) ? "True" : "False";
        const bimodalThreshold = getNumber(data, "bimodalThreshold", 30.0);
        const moleculeName = getString(data, "moleculeName", "").trim();
        const segid = getString(data, "segid", "").trim();
        const nrexcl = Math.max(0, Math.round(getNumber(data, "nrexcl", 1)));
        const validAngleTerms = new Set(["none", "0", "250", "500", "1500"]);
        const angleTerms = validAngleTerms.has(angleTermsRaw) ? angleTermsRaw : "500";
        const includeAngles = angleTerms !== "none";
        const kangle = includeAngles ? parseInt(angleTerms, 10) : 0;
        const explicitAngles = includeAngles ? 1 : 0;
        const maxAngleExpr = includeAngles ? "None" : "0.0";

        pythonCode += `# Final Export\n`;

        if (structureFormat === "gro") {
          pythonCode += `ap.write_gro(${inAtoms}, ${inBox}, '${outName}.gro')\n`;
        } else if (structureFormat === "pdb") {
          pythonCode += `ap.write_pdb(${inAtoms}, ${inBox}, '${outName}.pdb', write_conect=${writeConect})\n`;
        } else if (structureFormat === "cif") {
          pythonCode += `ap.write_cif(${inAtoms}, ${inBox}, '${outName}.cif', title='${cifTitle}')\n`;
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
        break;
      }
      default:
        pythonCode += `# Unsupported node type: ${n.type}\n`;
        break;
    }

    const nodeBlock = pythonCode.slice(nodeBlockStart);
    pythonCode = pythonCode.slice(0, nodeBlockStart);
    const trimmedNodeBlock = nodeBlock.endsWith("\n") ? nodeBlock.slice(0, -1) : nodeBlock;
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
  });

  return pythonCode;
}
