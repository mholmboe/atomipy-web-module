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
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type ViewerRenderer = "3dmol" | "jsmol";
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
  pdb?: string;
  charges?: number[];
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
  projection?: ViewerProjection;
  stickRadius?: number;
  sphereScale?: number;
  lineWidth?: number;
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
  // Track which renderer was active last render to detect switches
  const prevRendererRef = useRef<ViewerRenderer | null>(null);
  // Track which PDB was last loaded and by which renderer, to avoid
  // auto-loading stale PDB data when the user merely switches renderers.
  const pdbLoadedRef = useRef<{ renderer: ViewerRenderer; pdb: string } | null>(null);

  const renderer = data.renderer ?? "3dmol";
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
  const projection = data.projection ?? "perspective";
  const stickRadius = data.stickRadius ?? 0.15;
  const sphereScale = data.sphereScale ?? 0.25;
  const lineWidth = data.lineWidth ?? 1.2;
  // Default a bit wider so the Miller-plane controls fit on one row; min width
  // also raised so a resized-small node keeps them readable.
  // When the Miller panel is open it needs more width for its one-row controls,
  // so floor the width at 600 regardless of any smaller saved size.
  const nodeWidth = Math.max(showMiller ? 600 : 440, Number.isFinite(data.width) ? Number(data.width) : 700);
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
    }
  }, [renderer]);

  const setViewerOption = (patch: Partial<ViewerNodeData>) => {
    updateNodeData(id, { ...data, ...patch });
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
    // Note: Do not include currentFrame here, or else it will re-render the whole model 10 times a second!
  ]);

  // ─── Custom Trajectory Animation Loop ─────────────────────────────────────
  useEffect(() => {
    if (!isMulti || (renderer !== "3dmol" && renderer !== "jsmol")) return;

    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentFrame((prev) => {
          const next = (prev + 1) % numFrames;
          gotoFrame(next);
          return next;
        });
      }, 100); // ~10 fps playback
    }
    return () => clearInterval(interval);
  }, [isPlaying, isMulti, numFrames, renderer, gotoFrame]);

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

    // Multi-model PDB: Jmol loads each MODEL as a frame. Stop native animation
    // so our React frame browser drives it, and restore the current frame.
    if (isMulti) {
      lines.push("animation off");
      lines.push(`frame ${currentFrameRef.current + 1}`);
    }

    return lines.join("; ");
  }, [background, computeBonds, hidePeriodicBonds, viewStyle, showHydrogens, showUnitCell, showAtomLabels, labelIsCharge, spin, projection, isMulti, showMiller, millerSig]);

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
    }
  }, [selected, renderer]);

  const handleResetCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (renderer === "3dmol" && viewerInstance.current) {
      viewerInstance.current.zoomTo();
      viewerInstance.current.render();
    } else if (renderer === "jsmol" && jsmolAppletRef.current && window.Jmol) {
      window.Jmol.script(jsmolAppletRef.current, "reset; zoom 0");
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
        minWidth={360}
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
        className="w-full h-full shadow-2xl transition-all border-indigo-500/50 bg-card/95 backdrop-blur-md overflow-hidden flex flex-col"
      >
        <CardHeader className="py-2.5 px-4 bg-indigo-500/10 border-b flex flex-col gap-2 shrink-0">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-indigo-700 dark:text-indigo-300 pointer-events-none">
              <Eye className="w-4 h-4" />
              {data.title || "Structure Viewer"}
            </CardTitle>
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
                  <DropdownMenuSeparator />
                  {renderer === "3dmol" && (
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

          {/* Renderer toggle — matches BoxNode Cell/Box_dim pattern */}
          <div className="flex rounded-md overflow-hidden border border-border text-[10px] font-bold">
            <button
              onClick={() => setViewerOption({ renderer: "3dmol" })}
              className={`flex-1 py-1 transition-all ${
                renderer === "3dmol"
                  ? "bg-indigo-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-indigo-500/20"
              }`}
            >
              3Dmol
            </button>
            <button
              onClick={() => setViewerOption({ renderer: "jsmol" })}
              className={`flex-1 py-1 transition-all ${
                renderer === "jsmol"
                  ? "bg-indigo-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-indigo-500/20"
              }`}
            >
              JSmol
            </button>
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
          {!pdb && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-muted/10 pointer-events-none">
              <Eye className="w-8 h-8 opacity-20 mb-2" />
              <p className="text-xs font-medium">Click 'Build' to view structure</p>
            </div>
          )}

          {/* Trajectory Controls Overlay */}
          {isMulti && (renderer === "3dmol" || renderer === "jsmol") && (
            <div 
              className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border rounded-lg shadow-lg flex items-center gap-2 p-1.5 nodrag pointer-events-auto select-none"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => {
                  const next = (currentFrame - 1 + numFrames) % numFrames;
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
                  const next = (currentFrame + 1) % numFrames;
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
                  max={numFrames - 1} 
                  value={currentFrame}
                  onChange={handleFrameChange}
                  className="w-24 accent-indigo-500 cursor-pointer h-1.5 bg-muted rounded-lg appearance-none"
                />
                <span className="text-[10px] font-mono text-muted-foreground w-8">{numFrames}</span>
              </div>


            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
