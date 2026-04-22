import React, { useEffect, useRef } from "react";
import { Handle, NodeResizer, Position, useReactFlow } from "@xyflow/react";
import { Eye, RotateCw, Settings2, Palette, Box as BoxIcon } from "lucide-react";
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

declare global {
  interface Window {
    $3Dmol: any;
  }
}

type ViewerNodeData = {
  pdb?: string;
  charges?: number[];
  title?: string;
  width?: number;
  height?: number;
  showUnitCell?: boolean;
  background?: keyof typeof BACKGROUNDS;
  viewStyle?: "stick" | "sphere" | "both" | "line";
  showOutline?: boolean;
  showHydrogens?: boolean;
  showAtomLabels?: boolean;
  labelMode?: "none" | "element" | "charge";
  spin?: boolean;
  projection?: "perspective" | "orthographic";
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

export function ViewerNode({ id, data, selected }: NodeComponentProps<ViewerNodeData>) {
  const { updateNodeData } = useReactFlow();
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<any>(null);

  const pdb = data.pdb || "";
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
  const chargeValues = Array.isArray(data.charges) ? data.charges : [];

  const setViewerOption = (patch: Partial<ViewerNodeData>) => {
    updateNodeData(id, { ...data, ...patch });
  };

  useEffect(() => {
    if (!viewerRef.current || !window.$3Dmol) return;

    // Initialize viewer if not already done
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
      const model = viewer.addModel(pdb, "pdb", { keepH: true });
      
      const styleConfig: any = {};
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
          modelAtoms.forEach((atom: any, index: number) => {
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

  useEffect(() => {
    if (viewerInstance.current) {
      viewerInstance.current.resize();
      viewerInstance.current.render();
    }
  }, [selected]);

  const handleResetCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewerInstance.current) {
      viewerInstance.current.zoomTo();
      viewerInstance.current.render();
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
        <CardHeader className="py-2.5 px-4 bg-indigo-500/10 border-b flex flex-row items-center justify-between shrink-0">
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
              </DropdownMenuContent>
            </DropdownMenu>

            <button 
              onClick={handleResetCamera}
              className="p-1 hover:bg-indigo-500/20 rounded-md transition-colors text-indigo-600"
              title="Reset View"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0 relative flex-grow bg-slate-950/5 nodrag min-h-0">
          <div 
            ref={viewerRef} 
            className="w-full h-full cursor-move"
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
