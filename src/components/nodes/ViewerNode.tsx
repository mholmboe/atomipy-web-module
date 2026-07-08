import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Handle, NodeResizer, Position, useReactFlow } from "@xyflow/react";
import { Eye, RotateCw, Settings2, Palette, Box as BoxIcon, X, Play, Pause, SkipBack, SkipForward, Camera } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseCryst1, millerPlanes, polygonTo3Dmol, jmolMillerCommands, atomMidLevel } from "@/lib/miller";

type MillerPlaneDef = {
  h: number;
  k: number;
  l: number;
  // Shared Miller-index options (same as the Edit node's Cut by Miller plane):
  levelAuto: boolean;   // auto = structure midpoint along the normal
  level: number;        // explicit fractional level when levelAuto is false
  offset: number;       // shift along the normal, Å
  // Viewer-only display options:
  family: boolean;      // draw the full family of parallel planes
  color: string;
  opacity: number;
};

const DEFAULT_MILLER_PLANE: MillerPlaneDef = {
  h: 1, k: 1, l: 1, levelAuto: true, level: 0.5, offset: 0, family: false, color: "#f59e0b", opacity: 0.5,
};
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NodeComponentProps } from "./types";
import { NodeHelpButton } from "./nodeHelp";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    $3Dmol?: {
      createViewer: (element: HTMLDivElement, options: { backgroundColor: string }) => ViewerApi;
    };
    Jmol?: {
      setDocument: (doc: false) => void;
      getApplet: (name: string, info: Record<string, unknown>) => any;
      script: (applet: any, script: string) => void;
      getAppletHtml: (applet: any) => string;
    };
    // NGL viewer (UMD global). Typed loosely — NGL's API surface is large and we
    // only use a small, guarded subset (Stage, loadFile, representations, trajectory).
    NGL?: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type ViewerRenderer = "3dmol" | "jsmol" | "ngl";
type ViewerProjection = "perspective" | "orthographic";

type ViewerAtom = {
  elem?: string;
  charge?: number;
  x: number;
  y: number;
  z: number;
};

type ViewerSelection = Record<string, unknown>;

type ViewerStyle = {
  stick?: { radius?: number; colorscheme?: string; hidden?: boolean };
  sphere?: { scale?: number; colorscheme?: string; hidden?: boolean };
  line?: { linewidth?: number; colorscheme?: string; hidden?: boolean };
  outline?: { color: string; width: number };
};

type ViewerModel = {
  selectedAtoms?: (selection: ViewerSelection) => ViewerAtom[];
};

type ViewerApi = {
  setBackgroundColor: (color: string) => void;
  clear: () => void;
  setProjection?: (projection: ViewerProjection) => void;
  addModel: (pdb: string, format: string, options?: { keepH?: boolean }) => ViewerModel;
  addModelsAsFrames?: (pdb: string, format: string, options?: { keepH?: boolean }) => ViewerModel | ViewerModel[];
  animate?: (options: { loop?: string; step?: number; interval?: number; reps?: number }) => void;
  pauseAnimate?: () => void;
  setFrame?: (frame: number) => void;
  setStyle: (selection: ViewerSelection, style: ViewerStyle) => void;
  addUnitCell: (model: ViewerModel, options: Record<string, unknown>) => void;
  addCustom?: (spec: Record<string, unknown>) => void;
  getView?: () => number[];
  setView?: (view: number[]) => void;
  addPropertyLabels?: (property: string, selection: ViewerSelection, options: Record<string, unknown>) => void;
  addLabel?: (text: string, options: Record<string, unknown>) => void;
  spin?: (...args: [false] | ["x" | "y" | "z", number?]) => void;
  zoomTo: () => void;
  render: () => void;
  resize: () => void;
  pngURI?: () => string;   // 3Dmol: current view as a PNG data URI
};

type ViewerNodeData = {
  renderer?: ViewerRenderer;
  rendererUserSet?: boolean;   // true once the user explicitly picks a renderer (suppresses the trajectory→NGL auto-default)
  pdb?: string;
  charges?: number[];
  // Full trajectory available in the result bundle (streamed into NGL on demand, no cap)
  trajFile?: { file: string; ext: string; nframes: number; shown: number };
  resultToken?: string;
  title?: string;
  width?: number;
  height?: number;
  computeBonds?: boolean;
  hidePeriodicBonds?: boolean;   // JSmol: drop cross-cell (wrap-around) bonds
  showUnitCell?: boolean;
  // Miller-plane overlay — one or more planes
  showMiller?: boolean;
  millerFourIndex?: boolean;   // hexagonal Miller-Bravais (h k i l) input
  millerList?: MillerPlaneDef[];
  // Legacy single-plane fields (migrated into millerList on first render)
  millerH?: number;
  millerK?: number;
  millerL?: number;
  millerOffset?: number;
  millerFamily?: boolean;
  millerColor?: string;
  millerOpacity?: number;
  background?: keyof typeof BACKGROUNDS;
  viewStyle?: "stick" | "sphere" | "both" | "line";
  showOutline?: boolean;
  showHydrogens?: boolean;
  showAtomLabels?: boolean;
  labelMode?: "none" | "element" | "charge";
  spin?: boolean;
  depthCue?: boolean;
  projection?: ViewerProjection;
  stickRadius?: number;
  sphereScale?: number;
  lineWidth?: number;
  // Selection filters: which residue names / atom-type (PDB atom) names to DISPLAY.
  // undefined/absent = show everything (default). An explicit list shows only those;
  // [] shows none. Names are taken from the PDB currently in the viewer.
  visibleResnames?: string[];
  visibleAtomNames?: string[];
};

const BACKGROUNDS = {
  light: "#f8fafc",
  white: "#ffffff",
  dark: "#0f172a",
  black: "#000000",
};

// JSmol background mapping (uses [r,g,b] syntax)
const JSMOL_BG: Record<string, string> = {
  light: "[248,250,252]",
  white: "[255,255,255]",
  dark: "[15,23,42]",
  black: "[0,0,0]",
};

// NGL bonds atoms by interatomic distance and will draw long "bonds" spanning the
// periodic box (between atoms sitting on opposite cell faces). Real covalent/ionic
// bonds are < ~3 Å, so compact the structure's bondStore in place, dropping anything
// longer. Guarded — NGL internals are version-specific; on mismatch it just skips.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prunePeriodicBondsNGL(structure: any, cutoff = 3.0) {
  try {
    const bs = structure?.bondStore;
    if (!bs || typeof bs.count !== "number") return;
    const ap1 = structure.getAtomProxy();
    const ap2 = structure.getAtomProxy();
    const c2 = cutoff * cutoff;
    let n = 0;
    for (let i = 0; i < bs.count; i++) {
      ap1.index = bs.atomIndex1[i];
      ap2.index = bs.atomIndex2[i];
      const dx = ap1.x - ap2.x, dy = ap1.y - ap2.y, dz = ap1.z - ap2.z;
      if (dx * dx + dy * dy + dz * dz <= c2) {
        bs.atomIndex1[n] = bs.atomIndex1[i];
        bs.atomIndex2[n] = bs.atomIndex2[i];
        if (bs.bondOrder) bs.bondOrder[n] = bs.bondOrder[i];
        n++;
      }
    }
    bs.count = n;
  } catch { /* NGL bondStore API changed — leave bonds as-is */ }
}

// Draw the unit cell as a custom NGL Shape (12 cylinder edges) so we fully control
// colour and thickness — NGL's built-in 'unitcell' representation is hard to recolour
// and thin reliably (it renders thick, default-coloured edges + diagonals).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addNglUnitcellBox(stage: any, NGL: any, pdb: string, hexColor: string, radius: number) {
  const cell = parseCryst1(pdb);
  if (!cell || !NGL?.Shape) return null;
  const { a, b, c } = cell;
  const d2r = Math.PI / 180;
  const al = cell.alpha * d2r, be = cell.beta * d2r, ga = cell.gamma * d2r;
  // Standard crystallographic cell → Cartesian lattice vectors.
  const A = [a, 0, 0];
  const B = [b * Math.cos(ga), b * Math.sin(ga), 0];
  const cx = c * Math.cos(be);
  const cy = Math.abs(Math.sin(ga)) > 1e-6 ? c * (Math.cos(al) - Math.cos(be) * Math.cos(ga)) / Math.sin(ga) : 0;
  const C = [cx, cy, Math.sqrt(Math.max(0, c * c - cx * cx - cy * cy))];
  const sum = (...vs: number[][]) => vs.reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0]);
  const O = [0, 0, 0];
  const corners = { O, A, B, C, AB: sum(A, B), AC: sum(A, C), BC: sum(B, C), ABC: sum(A, B, C) };
  const edges: number[][][] = [
    [O, A], [O, B], [O, C],
    [A, corners.AB], [A, corners.AC],
    [B, corners.AB], [B, corners.BC],
    [C, corners.AC], [C, corners.BC],
    [corners.AB, corners.ABC], [corners.AC, corners.ABC], [corners.BC, corners.ABC],
  ];
  const rgb = [
    parseInt(hexColor.slice(1, 3), 16) / 255,
    parseInt(hexColor.slice(3, 5), 16) / 255,
    parseInt(hexColor.slice(5, 7), 16) / 255,
  ];
  try {
    const shape = new NGL.Shape("unitcell-box");
    edges.forEach(([p, q]) => shape.addCylinder(p, q, rgb, radius));
    const sc = stage.addComponentFromObject(shape);
    sc.addRepresentation("buffer");
    return sc;
  } catch { return null; }
}

// Extract the unique residue names (PDB cols 18-20) and atom-type names (PDB atom name,
// cols 13-16) present in a PDB string — used to build the show/hide selection menus.
function parsePdbSelectors(pdb: string): { resnames: string[]; atomNames: string[] } {
  const resnames = new Set<string>();
  const atomNames = new Set<string>();
  if (pdb) {
    for (const line of pdb.split("\n")) {
      if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) continue;
      const name = line.substring(12, 16).trim();
      const res = line.substring(17, 20).trim();
      if (name) atomNames.add(name);
      if (res) resnames.add(res);
    }
  }
  return {
    resnames: [...resnames].sort(),
    atomNames: [...atomNames].sort(),
  };
}

export function ViewerNode({ id, data, selected }: NodeComponentProps<ViewerNodeData>) {
  const { updateNodeData, deleteElements } = useReactFlow();

  // --- 3Dmol refs ---
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<ViewerApi | null>(null);

  // --- JSmol refs ---
  const jsmolContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsmolAppletRef = useRef<any>(null);
  const jsmolReadyRef = useRef(false);
  const jsmolIdRef = useRef(`jsmol_${id.replace(/[^a-zA-Z0-9]/g, "_")}`);

  // --- NGL refs (GPU impostor renderer; fast for large MD trajectories) ---
  const nglContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nglStageRef = useRef<any>(null);   // NGL.Stage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nglCompRef = useRef<any>(null);    // loaded structure component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nglTrajRef = useRef<any>(null);    // trajectory object (multi-model PDB)

  // Track which renderer was active last render to detect switches
  const prevRendererRef = useRef<ViewerRenderer | null>(null);
  // Track which PDB was last loaded and by which renderer, to avoid
  // auto-loading stale PDB data when the user merely switches renderers.
  const pdbLoadedRef = useRef<{ renderer: ViewerRenderer; pdb: string } | null>(null);

  // JSmol is kept for single structures but not offered for trajectories (benchmarks:
  // ~20x slower load, ~10-40x slower playback than NGL). Effective renderer resolved after
  // numFrames is known (see below); a saved jsmol viewer on a trajectory auto-uses NGL.
  const pdb = data.pdb || "";
  const computeBonds = data.computeBonds ?? true;
  const hidePeriodicBonds = data.hidePeriodicBonds ?? false;
  const background = data.background ?? "light";
  const viewStyle = data.viewStyle ?? "both";
  const showOutline = data.showOutline ?? true;
  const showUnitCell = data.showUnitCell ?? true;
  const showMiller = data.showMiller ?? false;
  const millerFourIndex = data.millerFourIndex ?? false;
  // Normalize to a list of planes; migrate legacy single-plane fields if present.
  const millerList = useMemo<MillerPlaneDef[]>(() => {
    if (Array.isArray(data.millerList) && data.millerList.length > 0) {
      // Fill in any fields missing from older saved planes.
      return data.millerList.map((p) => ({ ...DEFAULT_MILLER_PLANE, ...p }));
    }
    return [{
      ...DEFAULT_MILLER_PLANE,
      h: Number.isFinite(data.millerH) ? Number(data.millerH) : 1,
      k: Number.isFinite(data.millerK) ? Number(data.millerK) : 1,
      l: Number.isFinite(data.millerL) ? Number(data.millerL) : 1,
      offset: Number.isFinite(data.millerOffset) ? Number(data.millerOffset) : 0,
      family: data.millerFamily ?? false,
      color: data.millerColor ?? "#f59e0b",
      opacity: Number.isFinite(data.millerOpacity) ? Number(data.millerOpacity) : 0.5,
    }];
  }, [data.millerList, data.millerH, data.millerK, data.millerL, data.millerOffset, data.millerFamily, data.millerColor, data.millerOpacity]);
  const millerSig = useMemo(() => JSON.stringify(millerList), [millerList]);
  const showHydrogens = data.showHydrogens ?? true;
  const labelMode = data.labelMode ?? ((data.showAtomLabels ?? false) ? "element" : "none");
  const showAtomLabels = labelMode !== "none";
  const labelIsCharge = labelMode === "charge";
  const spin = data.spin ?? false;
  // Depth cue (distance fog/shading). Default OFF so NGL renders flat like 3Dmol/JSmol.
  const depthCue = data.depthCue ?? false;
  const projection = data.projection ?? "perspective";
  const stickRadius = data.stickRadius ?? 0.15;
  const sphereScale = data.sphereScale ?? 0.25;
  const lineWidth = data.lineWidth ?? 1.2;

  // ── Selection filters: show/hide by residue name or atom-type name ──────────
  const { resnames: allResnames, atomNames: allAtomNames } = useMemo(
    () => parsePdbSelectors(pdb),
    [pdb]
  );
  // Effective visible set: an absent data field means "all". Intersect with what's
  // actually in the current PDB so a stale saved list never references gone names.
  const effResnames = (data.visibleResnames ?? allResnames).filter((r) => allResnames.includes(r));
  const effAtomNames = (data.visibleAtomNames ?? allAtomNames).filter((a) => allAtomNames.includes(a));
  const resnFilterActive = effResnames.length < allResnames.length;
  const atomFilterActive = effAtomNames.length < allAtomNames.length;
  // Complement (what each renderer suppresses).
  const hiddenResnames = allResnames.filter((r) => !effResnames.includes(r));
  const hiddenAtomNames = allAtomNames.filter((a) => !effAtomNames.includes(a));
  // Re-run the render effects whenever the selection changes.
  const selectionSig = `R:${effResnames.join(" ")}|A:${effAtomNames.join(" ")}`;
  // Default a bit wider so the Miller-plane controls fit on one row; min width
  // also raised so a resized-small node keeps them readable.
  // Min/default 640 (the width the Miller panel's one-row controls need);
  // larger saved sizes are respected and remembered. Unconditional (not tied to
  // the Miller toggle) so the size stays consistent.
  const nodeWidth = Math.max(640, Number.isFinite(data.width) ? Number(data.width) : 640);
  const nodeHeight = Math.max(320, Number.isFinite(data.height) ? Number(data.height) : 560);
  const chargeValues = useMemo(() => (Array.isArray(data.charges) ? data.charges : []), [data.charges]);

  // Trajectory animation state
  const [currentFrame, setCurrentFrame] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(true);
  const numFrames = useMemo(() => {
    if (!pdb) return 1;
    // Count ENDMDL tags. If none, it's a single frame.
    const count = pdb.split("ENDMDL").length - 1;
    return Math.max(1, count);
  }, [pdb]);
  const isMulti = numFrames > 1;

  // Renderer resolution for trajectories (i.e. viewers downstream of a Simulate node,
  // which always produce multi-frame output):
  //  - JSmol is slow for trajectories -> always fall back to NGL.
  //  - Otherwise default a trajectory to NGL unless the user explicitly picked a renderer
  //    (rendererUserSet). Single-frame viewers (e.g. crystals with Miller planes, which
  //    only render in 3Dmol/JSmol) keep their saved/creation default.
  const renderer: ViewerRenderer =
    (data.renderer === "jsmol" && isMulti) ? "ngl"
    : (isMulti && !data.rendererUserSet) ? "ngl"
    : (data.renderer ?? "ngl");

  // When the FULL trajectory is streamed into NGL from the bundle, the real frame count is
  // trajFile.nframes (> the inlined/capped numFrames). effectiveFrames drives the slider/play.
  const [fullFrameCount, setFullFrameCount] = React.useState<number | null>(null);
  const [fullTrajBusy, setFullTrajBusy] = React.useState(false);
  const effectiveFrames = fullFrameCount ?? numFrames;
  useEffect(() => { setFullFrameCount(null); }, [pdb]);   // reset on a new build/trajectory

  // Keep a ref of the current frame so the JSmol load effect can restore it
  // without re-running once per frame during playback.
  const currentFrameRef = useRef(0);
  useEffect(() => { currentFrameRef.current = currentFrame; }, [currentFrame]);

  // Dispatch a frame change to whichever renderer is active.
  //  - 3Dmol: direct, synchronous setFrame()
  //  - JSmol: async applet script (Jmol frame/model numbers are 1-based)
  const gotoFrame = useCallback((n: number) => {
    if (renderer === "3dmol") {
      if (viewerInstance.current?.setFrame) {
        viewerInstance.current.setFrame(n);
        viewerInstance.current.render();
      }
    } else if (renderer === "jsmol") {
      if (jsmolAppletRef.current && window.Jmol) {
        window.Jmol.script(jsmolAppletRef.current, `frame ${n + 1}`);
      }
    } else if (renderer === "ngl") {
      try { nglTrajRef.current?.setFrame?.(n); } catch { /* trajectory not ready */ }
    }
  }, [renderer]);

  // Size the NGL canvas to the container's LAYOUT box (clientWidth/Height), which is
  // unaffected by React Flow's zoom transform. NGL's own handleResize() measures the
  // transform-scaled rect, so when the graph is zoomed out it sizes the canvas too small.
  const fitNgl = useCallback(() => {
    const stage = nglStageRef.current;
    const el = nglContainerRef.current;
    if (!stage || !el) return;
    const w = el.clientWidth, h = el.clientHeight;
    try {
      if (w > 0 && h > 0 && stage.viewer?.setSize) stage.viewer.setSize(w, h);
      else stage.handleResize?.();
    } catch { /* ignore */ }
  }, []);

  const setViewerOption = (patch: Partial<ViewerNodeData>) => {
    updateNodeData(id, { ...data, ...patch });
  };

  // Toggle one residue/atom-type name in the visible set. Seeds from "all present"
  // on first toggle; collapses back to undefined (= all) when everything is re-checked.
  const toggleName = (field: "visibleResnames" | "visibleAtomNames", all: string[], name: string) => {
    const cur = (data[field] ?? all).filter((n) => all.includes(n));
    const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name];
    const value = next.length === all.length ? undefined : next;
    setViewerOption({ [field]: value } as Partial<ViewerNodeData>);
  };
  const setAllNames = (field: "visibleResnames" | "visibleAtomNames", all: string[], show: boolean) => {
    setViewerOption({ [field]: show ? undefined : [] } as Partial<ViewerNodeData>);
  };

  const updateMillerPlane = (idx: number, patch: Partial<MillerPlaneDef>) => {
    setViewerOption({ millerList: millerList.map((p, i) => (i === idx ? { ...p, ...patch } : p)) });
  };
  const addMillerPlane = () => setViewerOption({ millerList: [...millerList, { ...DEFAULT_MILLER_PLANE }] });
  const removeMillerPlane = (idx: number) => {
    const next = millerList.filter((_, i) => i !== idx);
    setViewerOption({ millerList: next, showMiller: next.length > 0 });
  };

  // ─── Handle renderer switching — destroy the INACTIVE renderer ──────────
  useEffect(() => {
    const prev = prevRendererRef.current;
    prevRendererRef.current = renderer;
    if (prev === null) return; // First render, nothing to clean up
    if (prev === renderer) return; // No switch happened

    // Switching AWAY from 3Dmol → destroy so it can be cleanly recreated later
    if (prev === "3dmol" && viewerInstance.current) {
      try {
        viewerInstance.current.clear();
      } catch { /* ignore */ }
      viewerInstance.current = null;
      if (viewerRef.current) {
        viewerRef.current.innerHTML = "";
      }
    }

    // Switching AWAY from JSmol → destroy applet to free resources
    if (prev === "jsmol") {
      if (jsmolAppletRef.current && window.Jmol) {
        try {
          window.Jmol.script(jsmolAppletRef.current, "exit");
        } catch { /* ignore */ }
      }
      jsmolAppletRef.current = null;
      jsmolReadyRef.current = false;
      if (jsmolContainerRef.current) {
        jsmolContainerRef.current.innerHTML = "";
      }
    }

    // Switching AWAY from NGL → dispose the WebGL stage to free the GL context
    if (prev === "ngl" && nglStageRef.current) {
      try { nglStageRef.current.dispose(); } catch { /* ignore */ }
      nglStageRef.current = null;
      nglCompRef.current = null;
      nglTrajRef.current = null;
      if (nglContainerRef.current) {
        nglContainerRef.current.innerHTML = "";
      }
    }
  }, [renderer]);

  // ─── 3Dmol rendering effect ───────────────────────────────────────────────
  useEffect(() => {
    if (renderer !== "3dmol") return;
    if (!viewerRef.current || !window.$3Dmol) return;

    // Always recreate the viewer if the instance was destroyed (e.g. after switching back)
    if (!viewerInstance.current) {
      viewerInstance.current = window.$3Dmol.createViewer(viewerRef.current, {
        backgroundColor: BACKGROUNDS[background],
      });
    }

    const viewer = viewerInstance.current;
    viewer.setBackgroundColor(BACKGROUNDS[background]);
    viewer.clear();
    if (viewer.setProjection) {
      viewer.setProjection(projection);
    }


    if (pdb) {
      let processedPdb = pdb;
      if (isMulti && renderer === "3dmol") {
        // PDB files often only have one CRYST1 at the top. 3Dmol needs it per MODEL.
        const crystMatch = pdb.match(/^CRYST1.*$/m);
        if (crystMatch) {
          const crystStr = crystMatch[0];
          // Inject CRYST1 after each MODEL if not already there
          processedPdb = pdb.replace(/^(MODEL\s+\d+)\r?\n(?!CRYST1)/gm, `$1\n${crystStr}\n`);
        }
      }
      pdbLoadedRef.current = { renderer: "3dmol", pdb: processedPdb };

      let model;
      let models: any[] = [];
      if (isMulti && viewer.addModelsAsFrames) {
        const rawModels = viewer.addModelsAsFrames(processedPdb, "pdb", { keepH: true });
        models = Array.isArray(rawModels) ? rawModels : [rawModels];
        model = models[0];
        
        // Stop native animation since we will control it manually with our own interval
        if (viewer.pauseAnimate) viewer.pauseAnimate();
        if (viewer.setFrame) viewer.setFrame(currentFrame);
      } else {
        model = viewer.addModel(processedPdb, "pdb", { keepH: true });
        models = [model];
      }
      
      const styleConfig: ViewerStyle = {};
      if (viewStyle === "stick" || viewStyle === "both") {
        styleConfig.stick = { radius: stickRadius, colorscheme: "Jmol" };
      }
      if (viewStyle === "sphere" || viewStyle === "both") {
        styleConfig.sphere = { scale: sphereScale, colorscheme: "Jmol" };
      }
      if (viewStyle === "line") {
        styleConfig.line = { linewidth: lineWidth, colorscheme: "Jmol" };
      }
      
      const outlineColor = background === "dark" || background === "black" ? "white" : "black";
      const globalOptions = showOutline ? { outline: { color: outlineColor, width: 0.05 } } : {};
      viewer.setStyle({}, { ...styleConfig, ...globalOptions });

      if (!showHydrogens) {
        viewer.setStyle(
          { elem: "H" },
          { stick: { hidden: true }, sphere: { hidden: true }, line: { hidden: true } }
        );
      }

      // Selection filter: hide the residues / atom-type names the user unchecked.
      // (setStyle replaces style for the matched atoms; a hidden style removes them.)
      const HIDDEN_STYLE = { stick: { hidden: true }, sphere: { hidden: true }, line: { hidden: true } };
      if (resnFilterActive && hiddenResnames.length) {
        viewer.setStyle({ resn: hiddenResnames }, HIDDEN_STYLE);
      }
      if (atomFilterActive && hiddenAtomNames.length) {
        viewer.setStyle({ atom: hiddenAtomNames }, HIDDEN_STYLE);
      }

      let shouldShowUnitCell = showUnitCell;

      if (shouldShowUnitCell) {
        models.forEach((m) => {
          if (m) {
            try {
              viewer.addUnitCell(m, {
                box: { color: "#6366f1", linewidth: 1.5 },
                label: { color: "#6366f1" }
              });
            } catch {
              // Model has no crystal data (e.g. MD trajectory frame without CRYST1) — skip silently
            }
          }
        });
      }

      // Miller-plane overlay(s) (translucent custom mesh, one per plane)
      if (showMiller && viewer.addCustom) {
        const cell = parseCryst1(pdb);
        if (cell) {
          millerList.forEach((pl) => {
            if (!pl.h && !pl.k && !pl.l) return;
            try {
              const lvl = pl.levelAuto ? (atomMidLevel(pdb, cell, pl.h, pl.k, pl.l) ?? "auto") : pl.level;
              const polys = millerPlanes(pl.h, pl.k, pl.l, cell, {
                singlePlane: !pl.family,
                planeLevel: lvl,
                offset: pl.offset,
              });
              polys.forEach((poly) => {
                const mesh = polygonTo3Dmol(poly);
                viewer.addCustom!({ ...mesh, color: pl.color, opacity: pl.opacity });
              });
            } catch {
              // bad geometry / no intersection — skip silently
            }
          });
        }
      }

      if (showAtomLabels && viewer.addPropertyLabels) {
        const labelOptions = {
          fontSize: 10,
          fontColor: background === "dark" || background === "black" ? "#e2e8f0" : "#0f172a",
          backgroundOpacity: 0.45,
          inFront: true,
        };
        if (labelIsCharge && viewer.addLabel && model?.selectedAtoms) {
          const modelAtoms = model.selectedAtoms({});
          modelAtoms.forEach((atom, index: number) => {
            if (!showHydrogens && atom?.elem === "H") return;
            const rawCharge = chargeValues[index] ?? atom?.charge;
            if (typeof rawCharge !== "number" || !Number.isFinite(rawCharge)) return;
            viewer.addLabel(rawCharge.toFixed(3), {
              ...labelOptions,
              position: { x: atom.x, y: atom.y, z: atom.z },
            });
          });
        } else {
          viewer.addPropertyLabels("elem", showHydrogens ? {} : { not: { elem: "H" } }, labelOptions);
        }
      }

      if (spin && viewer.spin) {
        viewer.spin("y", 0.8);
      } else if (viewer.spin) {
        viewer.spin(false);
      }

      viewer.zoomTo();
      viewer.render();
      
      setTimeout(() => {
        if (viewerInstance.current) {
          viewerInstance.current.resize();
          viewerInstance.current.render();
        }
      }, 50);
      setTimeout(() => {
        if (viewerInstance.current) {
          viewerInstance.current.resize();
          viewerInstance.current.render();
        }
      }, 250);
    } else {
      if (viewer.spin) viewer.spin(false);
      viewer.render();
      viewer.resize();
    }
  }, [
    renderer,
    pdb,
    showUnitCell,
    background,
    viewStyle,
    showOutline,
    showHydrogens,
    showAtomLabels,
    labelIsCharge,
    chargeValues,
    spin,
    projection,
    stickRadius,
    sphereScale,
    lineWidth,
    isMulti,
    showMiller,
    millerSig,
    selectionSig,
    // Note: Do not include currentFrame here, or else it will re-render the whole model 10 times a second!
  ]);

  // ─── NGL rendering effect (load structure + trajectory) ───────────────────
  // NGL draws atoms/bonds as GPU impostors (billboards), not triangulated meshes,
  // so it stays smooth for large MD trajectories where 3Dmol bogs down. A
  // multi-MODEL PDB is loaded with asTrajectory so frames play via the trajectory.
  useEffect(() => {
    if (renderer !== "ngl") return;
    if (!nglContainerRef.current || !window.NGL) return;

    if (!nglStageRef.current) {
      nglStageRef.current = new window.NGL.Stage(nglContainerRef.current, {
        backgroundColor: BACKGROUNDS[background],
      });
      // Fit the canvas to the container once layout is flushed (the node may have
      // just become visible, so clientWidth/Height can be stale at creation).
      requestAnimationFrame(() => fitNgl());
    }
    const stage = nglStageRef.current;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resetComponents = () => {
      try { stage.removeAllComponents(); } catch { /* ignore */ }
      nglCompRef.current = null;
      nglTrajRef.current = null;
    };

    if (!pdb) {
      resetComponents();
      return;
    }

    let cancelled = false;
    resetComponents();

    const reprType = viewStyle === "sphere" ? "spacefill"
      : viewStyle === "stick" ? "licorice"
      : viewStyle === "line" ? "line"
      : "ball+stick";
    // Build the NGL selection string: hydrogens + residue/atom-type filters, AND-combined.
    const _seleParts: string[] = [];
    if (!showHydrogens) _seleParts.push("not _H");
    if (resnFilterActive) _seleParts.push(effResnames.length ? `(resname ${effResnames.join(" ")})` : "none");
    if (atomFilterActive) _seleParts.push(effAtomNames.length ? `(atomname ${effAtomNames.join(" ")})` : "none");
    const sele = _seleParts.length ? _seleParts.join(" and ") : undefined;

    const blob = new Blob([pdb], { type: "text/plain" });
    stage.loadFile(blob, { ext: "pdb", asTrajectory: isMulti })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((comp: any) => {
        if (cancelled || !comp) { return; }
        nglCompRef.current = comp;
        // Drop box-spanning bonds NGL draws across the periodic boundary.
        prunePeriodicBondsNGL(comp.structure, 3.0);

        // Main representation, honoring the stick/sphere size controls.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reprParams: any = {};
        if (sele) reprParams.sele = sele;
        if (reprType === "ball+stick" || reprType === "licorice") reprParams.radius = stickRadius;
        if (reprType === "spacefill") reprParams.scale = sphereScale;
        comp.addRepresentation(reprType, reprParams);

        if (showUnitCell) {
          // Custom shape box (thin indigo) instead of NGL's 'unitcell' rep, which we
          // can't reliably recolour/thin (it showed thick orange edges + diagonals).
          addNglUnitcellBox(stage, window.NGL, pdb, "#6366f1", 0.05);
        }

        // Atom labels (element or charge), matching the 3Dmol/JSmol Labels option.
        if (showAtomLabels) {
          try {
            const labelText: Record<number, string> = {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            comp.structure.eachAtom((ap: any) => {
              if (!showHydrogens && ap.element === "H") return;
              if (labelIsCharge) {
                const q = chargeValues[ap.index];
                if (typeof q === "number" && Number.isFinite(q)) labelText[ap.index] = q.toFixed(3);
              } else {
                labelText[ap.index] = ap.element || ap.atomname || "";
              }
            });
            const dark = background === "dark" || background === "black";
            comp.addRepresentation("label", {
              sele,
              labelType: "text",
              labelText,
              color: dark ? "#e2e8f0" : "#0f172a",
              showBackground: true,
              backgroundColor: dark ? "#0f172a" : "#f8fafc",
              backgroundOpacity: 0.45,
              scale: 1.2,
            });
          } catch { /* label rep unavailable */ }
        }

        if (isMulti) {
          try {
            const trajComp = comp.addTrajectory(undefined, {});
            nglTrajRef.current = trajComp?.trajectory ?? null;
            if (nglTrajRef.current?.setFrame) nglTrajRef.current.setFrame(currentFrameRef.current);
          } catch { /* trajectory unavailable */ }
        }
        comp.autoView();
        // Layout may not be flushed yet (node just shown/resized) — fit now and shortly after.
        fitNgl();
        setTimeout(fitNgl, 60);
        setTimeout(fitNgl, 250);
      })
      .catch(() => { /* parse failed — leave the stage empty */ });

    return () => { cancelled = true; };
  }, [renderer, pdb, viewStyle, showHydrogens, showUnitCell, isMulti, stickRadius, sphereScale, showAtomLabels, labelIsCharge, chargeValues, selectionSig, fitNgl]);

  // Stream the FULL trajectory file straight from the result bundle into NGL — NGL parses
  // frames itself (holding only coordinates), so it shows EVERY frame without the inline
  // memory cap. Replaces the current NGL content; the slider/play then span all frames.
  const loadFullTrajectory = useCallback(async () => {
    const tf = data.trajFile;
    const token = data.resultToken;
    const stage = nglStageRef.current;
    if (!tf?.file || !token || renderer !== "ngl" || !stage || !window.NGL) return;
    setFullTrajBusy(true);
    const url = `/api/result-file/${encodeURIComponent(token)}/${encodeURIComponent(tf.file)}`;
    try {
      try { stage.removeAllComponents(); } catch { /* ignore */ }
      nglCompRef.current = null;
      nglTrajRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const comp: any = await stage.loadFile(url, { ext: tf.ext || "pdb", asTrajectory: true });
      if (!comp) throw new Error("load failed");
      nglCompRef.current = comp;
      try { prunePeriodicBondsNGL(comp.structure, 3.0); } catch { /* ignore */ }
      const reprType = viewStyle === "sphere" ? "spacefill"
        : viewStyle === "stick" ? "licorice"
        : viewStyle === "line" ? "line" : "ball+stick";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reprParams: any = {};
      if (!showHydrogens) reprParams.sele = "not _H";
      if (reprType === "spacefill") reprParams.scale = sphereScale;
      else if (reprType === "ball+stick" || reprType === "licorice") reprParams.radius = stickRadius;
      comp.addRepresentation(reprType, reprParams);
      const trajComp = comp.addTrajectory(undefined, {});
      nglTrajRef.current = trajComp?.trajectory ?? null;
      comp.autoView();
      fitNgl(); setTimeout(fitNgl, 100);
      setCurrentFrame(0);
      setFullFrameCount(tf.nframes);   // slider/play now span every frame
    } catch {
      /* stream/parse failed — keep the capped preview */
    } finally {
      setFullTrajBusy(false);
    }
  }, [data.trajFile, data.resultToken, renderer, viewStyle, showHydrogens, sphereScale, stickRadius, fitNgl]);

  // ─── Keep the NGL canvas sized to the node (resize, panel/layout changes) ──
  useEffect(() => {
    if (renderer !== "ngl") return;
    const el = nglContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fitNgl());
    ro.observe(el);
    return () => ro.disconnect();
  }, [renderer, fitNgl]);

  // Re-fit NGL after it activates / the node resizes. NGL's first handleResize can run
  // before the flex layout settles its WIDTH, leaving the canvas narrower than the node;
  // a short kick loop re-fits a few times until the real size is in. (ResizeObserver
  // above handles later interactive resizes.)
  useEffect(() => {
    if (renderer !== "ngl") return;
    let kicks = 0;
    const iv = setInterval(() => {
      fitNgl();
      if (++kicks >= 10) clearInterval(iv);
    }, 120);
    return () => clearInterval(iv);
  }, [renderer, pdb, nodeWidth, nodeHeight, fitNgl]);

  // ─── NGL light params (no reload): background, projection, spin, depth cue ──
  useEffect(() => {
    if (renderer !== "ngl" || !nglStageRef.current) return;
    const stage = nglStageRef.current;
    try {
      stage.setParameters({
        backgroundColor: BACKGROUNDS[background],
        cameraType: projection === "orthographic" ? "orthographic" : "perspective",
        // Distance fog = NGL's depth shading. Off (fogNear=fogFar=100 -> no fade) keeps it
        // flat like 3Dmol/JSmol; on restores NGL's default depth cue.
        fogNear: depthCue ? 50 : 100,
        fogFar: 100,
      });
    } catch { /* ignore */ }
    try { stage.setSpin(spin ? [0, 1, 0] : null, 0.01); } catch { /* ignore */ }
  }, [renderer, background, projection, spin, depthCue]);

  // ─── Custom Trajectory Animation Loop ─────────────────────────────────────
  useEffect(() => {
    if (!isMulti || (renderer !== "3dmol" && renderer !== "jsmol" && renderer !== "ngl")) return;

    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentFrame((prev) => {
          const next = (prev + 1) % effectiveFrames;
          gotoFrame(next);
          return next;
        });
      }, 100); // ~10 fps playback
    }
    return () => clearInterval(interval);
  }, [isPlaying, isMulti, effectiveFrames, renderer, gotoFrame]);

  const handleFrameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const frame = parseInt(e.target.value) || 0;
    setCurrentFrame(frame);
    gotoFrame(frame);
  };

  // ─── JSmol rendering effect ───────────────────────────────────────────────

  // Build the Jmol script that applies all current settings
  const buildJmolScript = useCallback((pdbString: string) => {
    const lines: string[] = [];
    
    // Background
    lines.push(`background ${JSMOL_BG[background] || JSMOL_BG.light}`);

    // Auto-bond control — disable if user toggled bonds off
    if (!computeBonds) {
      lines.push("set autobond off");
    } else {
      lines.push("set autobond on");
    }

    // Load PDB inline — escape quotes and newlines for Jmol script string
    if (pdbString) {
      const escaped = pdbString.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
      lines.push(`load inline "${escaped}"`);
    }

    // Drop periodic (cross-cell, wrap-around) bonds that JSmol draws for a
    // structure with a unit cell: delete every bond longer than 3 Å, keeping
    // real covalent/ionic bonds. (3Dmol doesn't draw these, so it's JSmol-only.)
    if (computeBonds && hidePeriodicBonds) {
      lines.push("connect 3.0 1000 delete");
    }

    // Representation
    if (viewStyle === "both") {
      lines.push("wireframe 0.15");
      lines.push("spacefill 25%");
    } else if (viewStyle === "stick") {
      lines.push("wireframe 0.15");
      lines.push("spacefill off");
    } else if (viewStyle === "sphere") {
      lines.push("wireframe off");
      lines.push("spacefill on");
    } else if (viewStyle === "line") {
      lines.push("wireframe on");
      lines.push("spacefill off");
    }

    // Hydrogens
    if (!showHydrogens) {
      lines.push("select hydrogen; hide selected; select all");
    } else {
      lines.push("display all");
    }
    // NOTE: residue / atom-type selection filtering is wired for 3Dmol and NGL only;
    // the Residues/Atom-types menus are hidden for JSmol. If JSmol filtering is wanted,
    // build a combined `select (...); hide selected` here from the visible-name sets.

    // Unit cell
    if (showUnitCell) {
      lines.push("unitcell on");
    } else {
      lines.push("unitcell off");
    }

    // Miller-plane overlay(s)
    lines.push("draw miller* delete");
    if (showMiller) {
      const cell = parseCryst1(pdbString);
      if (cell) {
        millerList.forEach((pl, idx) => {
          if (!pl.h && !pl.k && !pl.l) return;
          const lvl = pl.levelAuto ? (atomMidLevel(pdbString, cell, pl.h, pl.k, pl.l) ?? "auto") : pl.level;
          const polys = millerPlanes(pl.h, pl.k, pl.l, cell, { singlePlane: !pl.family, planeLevel: lvl, offset: pl.offset });
          jmolMillerCommands(polys, pl.color, pl.opacity, `miller${idx}_`).forEach((c) => lines.push(c));
        });
      }
    }

    // Labels
    if (showAtomLabels) {
      if (labelIsCharge) {
        lines.push("label %[partialCharge]");
      } else {
        lines.push("label %e");
      }
      lines.push("set labeloffset 0 0");
      lines.push("font label 10");
    } else {
      lines.push("label off");
    }

    // Spin
    if (spin) {
      lines.push("spin y 10");
    } else {
      lines.push("spin off");
    }

    // Projection
    if (projection === "orthographic") {
      lines.push("set perspectiveDepth false");
    } else {
      lines.push("set perspectiveDepth true");
    }

    // Depth cue (distance shading) — match the NGL/3Dmol "Depth cue" toggle.
    lines.push(depthCue ? "set zShade on" : "set zShade off");

    // Multi-model PDB: Jmol loads each MODEL as a frame. Stop native animation
    // so our React frame browser drives it, and restore the current frame.
    if (isMulti) {
      lines.push("animation off");
      lines.push(`frame ${currentFrameRef.current + 1}`);
    }

    return lines.join("; ");
  }, [background, computeBonds, hidePeriodicBonds, viewStyle, showHydrogens, showUnitCell, showAtomLabels, labelIsCharge, spin, projection, depthCue, isMulti, showMiller, millerSig]);

  useEffect(() => {
    if (renderer !== "jsmol") return;
    if (!window.Jmol || !jsmolContainerRef.current) return;

    // Initialize JSmol applet if not already done
    if (!jsmolReadyRef.current && !jsmolAppletRef.current) {
      try {
        window.Jmol.setDocument(false);
      } catch { /* already set */ }

      const info: Record<string, unknown> = {
        width: "100%",
        height: "100%",
        use: "HTML5",
        j2sPath: "https://chemapps.stolaf.edu/jmol/jsmol/j2s",
        color: BACKGROUNDS[background],
        disableJ2SLoadMonitor: true,
        disableInitialConsole: true,
        addSelectionOptions: false,
        readyFunction: () => {
          jsmolReadyRef.current = true;
          // Apply initial script once ready — but only if PDB belongs to this renderer
          if (jsmolAppletRef.current && window.Jmol) {
            if (pdb) {
              pdbLoadedRef.current = { renderer: "jsmol", pdb };
            }
            window.Jmol.script(jsmolAppletRef.current, buildJmolScript(pdb));
          }
        },
      };

      const appletId = jsmolIdRef.current;
      const applet = window.Jmol.getApplet(appletId, info);
      jsmolAppletRef.current = applet;

      // Insert the JSmol HTML into our container
      const html = window.Jmol.getAppletHtml(applet);
      if (jsmolContainerRef.current) {
        jsmolContainerRef.current.innerHTML = html;
      }
    } else if (jsmolReadyRef.current && jsmolAppletRef.current && window.Jmol) {
      // Applet already exists and is ready — just run the updated script
      pdbLoadedRef.current = { renderer: "jsmol", pdb };
      window.Jmol.script(jsmolAppletRef.current, buildJmolScript(pdb));
    }
  }, [
    renderer,
    pdb,
    background,
    viewStyle,
    showHydrogens,
    showUnitCell,
    showAtomLabels,
    labelIsCharge,
    spin,
    projection,
    buildJmolScript,
  ]);

  // ─── Resize / select effects ──────────────────────────────────────────────
  useEffect(() => {
    if (renderer === "3dmol" && viewerInstance.current) {
      viewerInstance.current.resize();
      viewerInstance.current.render();
    } else if (renderer === "ngl") {
      fitNgl();
    }
  }, [selected, renderer, fitNgl]);

  const handleResetCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (renderer === "3dmol" && viewerInstance.current) {
      const v = viewerInstance.current;
      // Reset rotation to identity (zoomTo only re-fits zoom/center, not rotation),
      // then re-center and re-fit so it's a full "reset view".
      try {
        if (v.getView && v.setView) {
          const view = v.getView();
          if (Array.isArray(view) && view.length >= 8) {
            v.setView([view[0], view[1], view[2], view[3], 0, 0, 0, 1]);
          }
        }
      } catch { /* getView/setView unavailable — fall back to zoomTo only */ }
      if (v.spin) v.spin(false);
      v.zoomTo();
      v.render();
    } else if (renderer === "jsmol" && jsmolAppletRef.current && window.Jmol) {
      window.Jmol.script(jsmolAppletRef.current, "reset; zoom 0");
    } else if (renderer === "ngl" && nglStageRef.current) {
      try { (nglCompRef.current?.autoView ? nglCompRef.current : nglStageRef.current).autoView(); } catch { /* ignore */ }
    }
  };

  // Save the current view as a PNG. 3Dmol → pngURI() (optionally re-rendered at
  // `scale`× by briefly resizing the canvas — synchronous, so no visible flash);
  // JSmol → `write IMAGE w h PNG` at scale× the container size.
  const handleSaveImage = useCallback((scale = 1) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const base = (data.title || "atomipy_view").replace(/[^A-Za-z0-9_-]/g, "_") || "atomipy_view";
    const fname = `${base}_${stamp}.png`;

    if (renderer === "jsmol") {
      const applet = jsmolAppletRef.current;
      if (!applet || !window.Jmol) return;
      const el = jsmolContainerRef.current;
      const w = Math.max(1, Math.round((el?.clientWidth || 640) * scale));
      const h = Math.max(1, Math.round((el?.clientHeight || 480) * scale));
      window.Jmol.script(applet, `write IMAGE ${w} ${h} PNG "${fname}"`);
      return;
    }

    if (renderer === "ngl") {
      const stage = nglStageRef.current;
      if (!stage?.makeImage) return;
      stage.makeImage({ factor: scale, antialias: true, trim: false, transparent: false })
        .then((blob: Blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fname;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        })
        .catch((err: unknown) => console.error("NGL save image failed", err));
      return;
    }

    const v = viewerInstance.current;
    const el = viewerRef.current;
    if (!v || !v.pngURI) return;
    const prevW = el?.style.width ?? "";
    const prevH = el?.style.height ?? "";
    const upscaled = scale !== 1 && !!el;
    try {
      if (upscaled && el) {
        el.style.width = `${el.clientWidth * scale}px`;
        el.style.height = `${el.clientHeight * scale}px`;
        v.resize(); v.render();
      }
      const uri = v.pngURI();
      const a = document.createElement("a");
      a.href = uri;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("Save image failed", err);
    } finally {
      if (upscaled && el) {
        el.style.width = prevW;
        el.style.height = prevH;
        v.resize(); v.render();
      }
    }
  }, [renderer, data.title]);

  const compactItemClass = "text-xs py-1";
  const compactLabelClass = "text-[11px] py-1 text-muted-foreground uppercase tracking-wide";

  return (
    <div className="relative" style={{ width: nodeWidth, height: nodeHeight }}>
      <NodeResizer
        isVisible={Boolean(selected)}
        minWidth={640}
        minHeight={320}
        lineClassName="border-indigo-400/70"
        handleClassName="w-2.5 h-2.5 bg-indigo-500 border border-white rounded-sm"
        onResizeEnd={(_, params) =>
          setViewerOption({ width: Math.round(params.width), height: Math.round(params.height) })
        }
      />
      <Handle type="target" position={Position.Left} id="in" className="w-3.5 h-3.5 bg-secondary border-2 border-background z-50" />
      <Handle type="source" position={Position.Right} id="out" className="w-3.5 h-3.5 bg-indigo-500 border-2 border-background z-50" />
      
      <Card
        className="w-full h-full shadow-2xl transition-all border-primary/50 bg-card/95 backdrop-blur-md overflow-hidden flex flex-col"
      >
        <CardHeader className="py-2.5 px-4 bg-indigo-500/10 border-b flex flex-col gap-2 shrink-0">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-indigo-700 dark:text-indigo-300 pointer-events-none">
              <Eye className="w-4 h-4" />
              {data.title || "Structure Viewer"}
            </CardTitle>
            {/* Compact renderer toggle, centered between the title and the actions */}
            <div className="flex rounded-md overflow-hidden border border-border text-[9px] font-bold shrink-0">
              <button
                onClick={() => setViewerOption({ renderer: "ngl", rendererUserSet: true })}
                title="NGL — GPU-accelerated, fastest for large trajectories (default)"
                className={`px-2 py-0.5 transition-all ${renderer === "ngl" ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground hover:bg-indigo-500/20"}`}
              >
                NGL
              </button>
              <button
                onClick={() => setViewerOption({ renderer: "3dmol", rendererUserSet: true })}
                title="3Dmol — WebGL; Miller planes, element/charge labels, PNG export"
                className={`px-2 py-0.5 transition-all ${renderer === "3dmol" ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground hover:bg-indigo-500/20"}`}
              >
                3Dmol
              </button>
              {!isMulti && (
                <button
                  onClick={() => setViewerOption({ renderer: "jsmol", rendererUserSet: true })}
                  title="JSmol — scripting & measurements; best for single structures (slow for trajectories)"
                  className={`px-2 py-0.5 transition-all ${renderer === "jsmol" ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground hover:bg-indigo-500/20"}`}
                >
                  JSmol
                </button>
              )}
            </div>
            <div className="flex gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1 hover:bg-indigo-500/20 rounded-md transition-colors text-indigo-600">
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 max-h-[320px] overflow-y-auto">
                  <DropdownMenuLabel className={`flex items-center gap-2 ${compactLabelClass}`}>
                    <Palette className="w-3.5 h-3.5" /> Background
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={background}
                    onValueChange={(value) => setViewerOption({ background: value as keyof typeof BACKGROUNDS })}
                  >
                    <DropdownMenuRadioItem className={compactItemClass} value="white">White</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem className={compactItemClass} value="light">Light Slate</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem className={compactItemClass} value="dark">Dark Slate</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem className={compactItemClass} value="black">Black</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className={`flex items-center gap-2 ${compactLabelClass}`}>
                    <BoxIcon className="w-3.5 h-3.5" /> Representation
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={viewStyle}
                    onValueChange={(value) => setViewerOption({ viewStyle: value as ViewerNodeData["viewStyle"] })}
                  >
                    <DropdownMenuRadioItem className={compactItemClass} value="both">Ball & Stick</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem className={compactItemClass} value="stick">Sticks</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem className={compactItemClass} value="sphere">Spheres</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem className={compactItemClass} value="line">Lines</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className={compactLabelClass}>Projection</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={projection}
                    onValueChange={(value) => setViewerOption({ projection: value as ViewerNodeData["projection"] })}
                  >
                    <DropdownMenuRadioItem className={compactItemClass} value="perspective">Perspective</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem className={compactItemClass} value="orthographic">Orthographic</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    className={compactItemClass}
                    checked={computeBonds}
                    onCheckedChange={(checked) => setViewerOption({ computeBonds: Boolean(checked) })}
                  >
                    Compute Bonds (Requires Build)
                  </DropdownMenuCheckboxItem>
                  {renderer === "jsmol" && (
                    <DropdownMenuCheckboxItem
                      className={compactItemClass}
                      checked={hidePeriodicBonds}
                      onCheckedChange={(checked) => setViewerOption({ hidePeriodicBonds: Boolean(checked) })}
                    >
                      Hide periodic bonds (JSmol)
                    </DropdownMenuCheckboxItem>
                  )}
                  <DropdownMenuCheckboxItem
                    className={compactItemClass}
                    checked={showUnitCell}
                    onCheckedChange={(checked) => setViewerOption({ showUnitCell: Boolean(checked) })}
                  >
                    Unit Cell
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    className={compactItemClass}
                    checked={showMiller}
                    onCheckedChange={(checked) => setViewerOption({ showMiller: Boolean(checked) })}
                  >
                    Miller plane (hkl)
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    className={compactItemClass}
                    checked={showHydrogens}
                    onCheckedChange={(checked) => setViewerOption({ showHydrogens: Boolean(checked) })}
                  >
                    Hydrogens
                  </DropdownMenuCheckboxItem>
                  {/* Show/hide by residue name or atom-type name (3Dmol & NGL). */}
                  {(renderer === "3dmol" || renderer === "ngl") && allResnames.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className={compactItemClass}>
                          Residues{resnFilterActive ? ` (${effResnames.length}/${allResnames.length})` : ""}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto">
                          <DropdownMenuItem className={compactItemClass} onSelect={(e) => { e.preventDefault(); setAllNames("visibleResnames", allResnames, true); }}>Show all</DropdownMenuItem>
                          <DropdownMenuItem className={compactItemClass} onSelect={(e) => { e.preventDefault(); setAllNames("visibleResnames", allResnames, false); }}>Hide all</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {allResnames.map((r) => (
                            <DropdownMenuCheckboxItem
                              key={r}
                              className={compactItemClass}
                              checked={effResnames.includes(r)}
                              onSelect={(e) => e.preventDefault()}
                              onCheckedChange={() => toggleName("visibleResnames", allResnames, r)}
                            >
                              {r}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      {allAtomNames.length > 0 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className={compactItemClass}>
                            Atom types{atomFilterActive ? ` (${effAtomNames.length}/${allAtomNames.length})` : ""}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto">
                            <DropdownMenuItem className={compactItemClass} onSelect={(e) => { e.preventDefault(); setAllNames("visibleAtomNames", allAtomNames, true); }}>Show all</DropdownMenuItem>
                            <DropdownMenuItem className={compactItemClass} onSelect={(e) => { e.preventDefault(); setAllNames("visibleAtomNames", allAtomNames, false); }}>Hide all</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {allAtomNames.map((a) => (
                              <DropdownMenuCheckboxItem
                                key={a}
                                className={compactItemClass}
                                checked={effAtomNames.includes(a)}
                                onSelect={(e) => e.preventDefault()}
                                onCheckedChange={() => toggleName("visibleAtomNames", allAtomNames, a)}
                              >
                                {a}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                    </>
                  )}
                  <DropdownMenuLabel className={compactLabelClass}>Labels</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={labelMode}
                    onValueChange={(value) => setViewerOption({ labelMode: value as ViewerNodeData["labelMode"] })}
                  >
                    <DropdownMenuRadioItem className={compactItemClass} value="none">None</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem className={compactItemClass} value="element">Element</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem className={compactItemClass} value="charge">Charge</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuCheckboxItem
                    className={compactItemClass}
                    checked={showOutline}
                    onCheckedChange={(checked) => setViewerOption({ showOutline: Boolean(checked) })}
                  >
                    Outline
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    className={compactItemClass}
                    checked={spin}
                    onCheckedChange={(checked) => setViewerOption({ spin: Boolean(checked) })}
                  >
                    Spin
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    className={compactItemClass}
                    checked={depthCue}
                    onCheckedChange={(checked) => setViewerOption({ depthCue: Boolean(checked) })}
                  >
                    Depth cue (3D shading)
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {(renderer === "3dmol" || renderer === "ngl") && (
                    <>
                      <DropdownMenuLabel className={compactLabelClass}>Style Presets</DropdownMenuLabel>
                      <DropdownMenuItem className={compactItemClass} onClick={() => setViewerOption({ stickRadius: 0.1, sphereScale: 0.2, lineWidth: 0.9 })}>
                        Thin
                      </DropdownMenuItem>
                      <DropdownMenuItem className={compactItemClass} onClick={() => setViewerOption({ stickRadius: 0.15, sphereScale: 0.25, lineWidth: 1.2 })}>
                        Default
                      </DropdownMenuItem>
                      <DropdownMenuItem className={compactItemClass} onClick={() => setViewerOption({ stickRadius: 0.22, sphereScale: 0.34, lineWidth: 1.7 })}>
                        Bold
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-1 hover:bg-indigo-500/20 rounded-md transition-colors text-indigo-600"
                    title="Save view as PNG image"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[150px]">
                  <DropdownMenuLabel className={compactLabelClass}>Save PNG image</DropdownMenuLabel>
                  <DropdownMenuItem className={compactItemClass} onClick={() => handleSaveImage(1)}>
                    Current resolution (1×)
                  </DropdownMenuItem>
                  <DropdownMenuItem className={compactItemClass} onClick={() => handleSaveImage(2)}>
                    High (2×)
                  </DropdownMenuItem>
                  <DropdownMenuItem className={compactItemClass} onClick={() => handleSaveImage(4)}>
                    Ultra (4×)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                onClick={handleResetCamera}
                className="p-1 hover:bg-indigo-500/20 rounded-md transition-colors text-indigo-600"
                title="Reset View"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <NodeHelpButton helpKey="viewer" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteElements({ nodes: [{ id }] });
                }}
                className="p-1 hover:bg-red-500/20 rounded-md transition-colors text-muted-foreground hover:text-destructive"
                title="Delete Node"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Miller-plane controls (shown when enabled via the gear menu) */}
          {showMiller && (
            <div
              className="flex flex-col gap-1 nodrag"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {millerList.map((pl, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300">{millerFourIndex ? "(hkil)" : "(hkl)"}</span>
                  <input type="number" title="h" value={pl.h}
                    onChange={(e) => updateMillerPlane(idx, { h: parseInt(e.target.value) || 0 })}
                    className="nodrag w-9 px-1 py-0.5 rounded border border-border bg-muted text-foreground" />
                  <input type="number" title="k" value={pl.k}
                    onChange={(e) => updateMillerPlane(idx, { k: parseInt(e.target.value) || 0 })}
                    className="nodrag w-9 px-1 py-0.5 rounded border border-border bg-muted text-foreground" />
                  {millerFourIndex && (
                    <input type="number" title="i = −(h+k) (auto)" value={-(pl.h + pl.k)} readOnly tabIndex={-1}
                      className="nodrag w-9 px-1 py-0.5 rounded border border-border bg-muted/50 text-muted-foreground cursor-not-allowed" />
                  )}
                  <input type="number" title="l" value={pl.l}
                    onChange={(e) => updateMillerPlane(idx, { l: parseInt(e.target.value) || 0 })}
                    className="nodrag w-9 px-1 py-0.5 rounded border border-border bg-muted text-foreground" />
                  <label className="flex items-center gap-1" title="Auto level = structure midpoint">
                    <input type="checkbox" checked={pl.levelAuto}
                      onChange={(e) => updateMillerPlane(idx, { levelAuto: e.target.checked })} />
                    auto
                  </label>
                  {!pl.levelAuto && (
                    <input type="number" step={0.1} title="level (fractional)" value={pl.level}
                      onChange={(e) => updateMillerPlane(idx, { level: parseFloat(e.target.value) || 0 })}
                      className="nodrag w-11 px-1 py-0.5 rounded border border-border bg-muted text-foreground" />
                  )}
                  <label className="flex items-center gap-1" title="Offset along the plane normal (Å)">off
                    <input type="number" step={0.5} value={pl.offset}
                      onChange={(e) => updateMillerPlane(idx, { offset: parseFloat(e.target.value) || 0 })}
                      className="nodrag w-10 px-1 py-0.5 rounded border border-border bg-muted text-foreground" />
                    <input type="range" min={-10} max={10} step={0.1} value={pl.offset}
                      onChange={(e) => updateMillerPlane(idx, { offset: parseFloat(e.target.value) })}
                      className="nodrag w-12" title="Offset slider (Å)" />
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={pl.family}
                      onChange={(e) => updateMillerPlane(idx, { family: e.target.checked })} />
                    family
                  </label>
                  <input type="color" title="Plane color" value={pl.color}
                    onChange={(e) => updateMillerPlane(idx, { color: e.target.value })}
                    className="nodrag h-5 w-6 rounded border border-border bg-transparent p-0" />
                  <input type="range" min={0.1} max={1} step={0.05} value={pl.opacity}
                    onChange={(e) => updateMillerPlane(idx, { opacity: parseFloat(e.target.value) })}
                    title="Opacity (α)" className="nodrag w-10" />
                  <button type="button" title="Remove this plane"
                    onClick={() => removeMillerPlane(idx)}
                    className="nodrag p-0.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <button type="button" onClick={addMillerPlane}
                  className="nodrag self-start text-[10px] px-2 py-0.5 rounded border border-border bg-muted hover:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                  + add plane
                </button>
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Hexagonal Miller–Bravais: i is auto-set to −(h+k)">
                  <input type="checkbox" checked={millerFourIndex}
                    onChange={(e) => setViewerOption({ millerFourIndex: e.target.checked })} />
                  4-index (hkil)
                </label>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0 relative flex-grow bg-slate-950/5 nodrag min-h-0 overflow-hidden">
          {/* 3Dmol container */}
          <div 
            ref={viewerRef} 
            className={`w-full h-full cursor-move ${renderer !== "3dmol" ? "hidden" : ""}`}
          />
          {/* JSmol container — relative + overflow:hidden keeps JSmol canvas inside bounds */}
          <div
            ref={jsmolContainerRef}
            className={`w-full h-full cursor-move ${renderer !== "jsmol" ? "hidden" : ""}`}
            style={{ position: "relative", overflow: "hidden" }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
          {/* NGL container (WebGL canvas). Absolutely filling the (relative) CardContent
              guarantees it matches the node exactly — `h-full` can under-resolve, leaving
              NGL at a small default square. `absolute` is itself a positioned ancestor for
              NGL's own absolute viewport. No stopPropagation (parent has `nodrag`), so the
              canvas handles rotate / zoom (scroll) / pan. */}
          <div
            ref={nglContainerRef}
            className={`absolute inset-0 cursor-move ${renderer !== "ngl" ? "hidden" : ""}`}
            style={{ overflow: "hidden" }}
          />
          {!pdb && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-muted/10 pointer-events-none px-6">
              <Eye className="w-8 h-8 opacity-20 mb-3" />
              <p className="text-sm font-semibold mb-4">Run the workflow to view the structure here</p>
              <div className="text-[11px] leading-relaxed max-w-md w-full space-y-1.5">
                <p className="text-center font-semibold uppercase tracking-wide text-[10px] text-muted-foreground/80 mb-1">
                  Pick a renderer (toggle, top of node)
                </p>
                <p>
                  <span className="font-bold text-indigo-600">NGL</span> — GPU impostor rendering, smooth playback.
                  Best for <strong>large systems & MD trajectories</strong> <em>(default)</em>.
                </p>
                <p>
                  <span className="font-bold text-indigo-600">3Dmol</span> — fast styling, element/charge labels, Miller planes & PNG export.
                  Best for <strong>single structures</strong> and figures.
                </p>
                <p>
                  <span className="font-bold text-indigo-600">JSmol</span> — scripting & measurements.
                  For <strong>single structures</strong> (not offered for trajectories — slow).
                </p>
              </div>
            </div>
          )}

          {/* Trajectory Controls Overlay */}
          {isMulti && (renderer === "3dmol" || renderer === "jsmol" || renderer === "ngl") && (
            <div 
              className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border rounded-lg shadow-lg flex items-center gap-2 p-1.5 nodrag pointer-events-auto select-none"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => {
                  const next = (currentFrame - 1 + effectiveFrames) % effectiveFrames;
                  setCurrentFrame(next);
                  gotoFrame(next);
                }}
                className="p-1 hover:bg-muted rounded-md text-muted-foreground transition-colors"
                title="Previous Frame"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md transition-colors"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              
              <button 
                onClick={() => {
                  const next = (currentFrame + 1) % effectiveFrames;
                  setCurrentFrame(next);
                  gotoFrame(next);
                }}
                className="p-1 hover:bg-muted rounded-md text-muted-foreground transition-colors"
                title="Next Frame"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 px-2 border-l border-border ml-1">
                <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{currentFrame + 1}</span>
                <input
                  type="range"
                  min={0}
                  max={effectiveFrames - 1}
                  value={currentFrame}
                  onChange={handleFrameChange}
                  className="w-24 accent-indigo-500 cursor-pointer h-1.5 bg-muted rounded-lg appearance-none"
                />
                <span className="text-[10px] font-mono text-muted-foreground w-8">{effectiveFrames}</span>
              </div>

              {/* NGL only: stream every frame from the bundle (the preview above is capped). */}
              {renderer === "ngl" && data.trajFile && data.resultToken && fullFrameCount === null &&
                data.trajFile.shown < data.trajFile.nframes && (
                <button
                  type="button"
                  onClick={loadFullTrajectory}
                  disabled={fullTrajBusy}
                  title={`Stream the full ${data.trajFile.nframes}-frame trajectory from the result bundle`}
                  className="nodrag ml-1 px-2 py-0.5 text-[10px] font-semibold rounded-md bg-indigo-500/15 text-indigo-600 hover:bg-indigo-500/25 disabled:opacity-50"
                >
                  {fullTrajBusy ? "Loading…" : `Load all ${data.trajFile.nframes} frames`}
                </button>
              )}

            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
