import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Handle, NodeResizer, Position, useReactFlow } from "@xyflow/react";
import { Eye, RotateCw, Settings2, Palette, Box as BoxIcon, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  setStyle: (selection: ViewerSelection, style: ViewerStyle) => void;
  addUnitCell: (model: ViewerModel, options: Record<string, unknown>) => void;
  addPropertyLabels?: (property: string, selection: ViewerSelection, options: Record<string, unknown>) => void;
  addLabel?: (text: string, options: Record<string, unknown>) => void;
  spin?: (...args: [false] | ["x" | "y" | "z", number?]) => void;
  zoomTo: () => void;
  render: () => void;
  resize: () => void;
};

type ViewerNodeData = {
  renderer?: ViewerRenderer;
  pdb?: string;
  charges?: number[];
  title?: string;
  width?: number;
  height?: number;
  computeBonds?: boolean;
  showUnitCell?: boolean;
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
  const background = data.background ?? "light";
  const viewStyle = data.viewStyle ?? "both";
  const showOutline = data.showOutline ?? true;
  const showUnitCell = data.showUnitCell ?? true;
  const showHydrogens = data.showHydrogens ?? true;
  const labelMode = data.labelMode ?? ((data.showAtomLabels ?? false) ? "element" : "none");
  const showAtomLabels = labelMode !== "none";
  const labelIsCharge = labelMode === "charge";
  const spin = data.spin ?? false;
  const projection = data.projection ?? "perspective";
  const stickRadius = data.stickRadius ?? 0.15;
  const sphereScale = data.sphereScale ?? 0.25;
  const lineWidth = data.lineWidth ?? 1.2;
  const nodeWidth = Math.max(360, Number.isFinite(data.width) ? Number(data.width) : 500);
  const nodeHeight = Math.max(320, Number.isFinite(data.height) ? Number(data.height) : 500);
  const chargeValues = useMemo(() => (Array.isArray(data.charges) ? data.charges : []), [data.charges]);

  const setViewerOption = (patch: Partial<ViewerNodeData>) => {
    updateNodeData(id, { ...data, ...patch });
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
      // Skip if this PDB was already loaded for a different renderer
      // (user just toggled; they need to rebuild to load in the new renderer)
      const loaded = pdbLoadedRef.current;
      if (loaded && loaded.pdb === pdb && loaded.renderer !== "3dmol") {
        // PDB was loaded by JSmol, not us — show empty viewer
        viewer.render();
        viewer.resize();
        return;
      }
      pdbLoadedRef.current = { renderer: "3dmol", pdb };
      const model = viewer.addModel(pdb, "pdb", { keepH: true });
      
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
      
      if (showUnitCell) {
        viewer.addUnitCell(model, {
          box: { color: "#6366f1", linewidth: 1.5 },
          label: { color: "#6366f1" }
        });
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
  ]);

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

    // Load PDB inline — escape quotes and preserve newlines
    if (pdbString) {
      const escaped = pdbString.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      lines.push(`load inline "${escaped}"`);
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

    return lines.join("; ");
  }, [background, computeBonds, viewStyle, showHydrogens, showUnitCell, showAtomLabels, labelIsCharge, spin, projection]);

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
            const loaded = pdbLoadedRef.current;
            const shouldSkip = loaded && loaded.pdb === pdb && loaded.renderer !== "jsmol";
            if (!shouldSkip && pdb) {
              pdbLoadedRef.current = { renderer: "jsmol", pdb };
            }
            window.Jmol.script(jsmolAppletRef.current, buildJmolScript(shouldSkip ? "" : pdb));
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
      // Skip if this PDB was already loaded for a different renderer
      const loaded = pdbLoadedRef.current;
      if (loaded && loaded.pdb === pdb && loaded.renderer !== "jsmol") {
        // PDB was loaded by 3Dmol, not us — don't auto-load
        return;
      }
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
      <Handle type="target" position={Position.Left} className="w-3.5 h-3.5 bg-secondary border-2 border-background z-50" />
      <Handle type="source" position={Position.Right} className="w-3.5 h-3.5 bg-indigo-500 border-2 border-background z-50" />
      
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
                    Compute Bonds
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    className={compactItemClass}
                    checked={showUnitCell}
                    onCheckedChange={(checked) => setViewerOption({ showUnitCell: Boolean(checked) })}
                  >
                    Unit Cell
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

              <button 
                onClick={handleResetCamera}
                className="p-1 hover:bg-indigo-500/20 rounded-md transition-colors text-indigo-600"
                title="Reset View"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
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
        </CardContent>
      </Card>
    </div>
  );
}
