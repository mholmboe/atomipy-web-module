import React, { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeResizer } from "@xyflow/react";
import { Eye, RotateCw, Maximize2, Settings2, Palette, Box as BoxIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  title?: string;
  showUnitCell?: boolean;
};

const BACKGROUNDS = {
  light: "#f8fafc",
  white: "#ffffff",
  dark: "#0f172a",
  black: "#000000",
};

export function ViewerNode({ id, data, selected }: NodeComponentProps<ViewerNodeData>) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<any>(null);
  const [activeBg, setActiveBg] = useState<keyof typeof BACKGROUNDS>("light");
  const [viewStyle, setViewStyle] = useState<"stick" | "sphere" | "both">("both");
  const [showOutline, setShowOutline] = useState(true);

  const pdb = data.pdb || "";
  const showUnitCell = data.showUnitCell ?? true;

  useEffect(() => {
    if (!viewerRef.current || !window.$3Dmol) return;

    // Initialize viewer if not already done
    if (!viewerInstance.current) {
      viewerInstance.current = window.$3Dmol.createViewer(viewerRef.current, {
        backgroundColor: BACKGROUNDS[activeBg],
      });
    }

    const viewer = viewerInstance.current;
    viewer.setBackgroundColor(BACKGROUNDS[activeBg]);
    viewer.clear();

    if (pdb) {
      const model = viewer.addModel(pdb, "pdb");
      
      const styleConfig: any = {};
      if (viewStyle === "stick" || viewStyle === "both") {
        styleConfig.stick = { radius: 0.15, colorscheme: "Jmol" };
      }
      if (viewStyle === "sphere" || viewStyle === "both") {
        styleConfig.sphere = { scale: 0.25, colorscheme: "Jmol" };
      }
      
      if (showOutline) {
        // Outline helps white atoms on white background
        viewer.setStyle({}, { ...styleConfig, outline: { color: "black", width: 0.05 } });
      } else {
        viewer.setStyle({}, styleConfig);
      }
      
      // Add Unit Cell if requested and available in PDB
      if (showUnitCell) {
        viewer.addUnitCell(model, {
          box: { color: "#6366f1", linewidth: 1.5 },
          label: { color: "#6366f1" }
        });
      }

      viewer.zoomTo();
      viewer.render();
    } else {
      viewer.render();
    }
  }, [pdb, showUnitCell, activeBg, viewStyle, showOutline]);

  // Handle Resize Events
  useEffect(() => {
    if (viewerInstance.current) {
      viewerInstance.current.resize();
      viewerInstance.current.render();
    }
  }, [selected]); // Extra resize check when selected or resized via NodeResizer handled by the div container

  const handleResetCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewerInstance.current) {
      viewerInstance.current.zoomTo();
      viewerInstance.current.render();
    }
  };

  return (
    <>
      <NodeResizer 
        minWidth={200} 
        minHeight={200} 
        isVisible={selected} 
        lineClassName="border-indigo-400" 
        handleClassName="h-3 w-3 bg-white border-2 border-indigo-500 rounded-sm"
      />
      
      <Card className="w-full h-full shadow-lg transition-all border-indigo-500/30 bg-card/95 backdrop-blur-sm overflow-hidden flex flex-col min-w-[250px] min-h-[250px]">
        <Handle type="target" position={Position.Left} className="w-3 h-3 bg-indigo-500/80" />
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
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Palette className="w-3.5 h-3.5" /> Background
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setActiveBg("white")}>White</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveBg("light")}>Light Slate (Default)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveBg("dark")}>Dark Slate</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveBg("black")}>Black</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2">
                  <BoxIcon className="w-3.5 h-3.5" /> Representation
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setViewStyle("both")}>Ball & Stick</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewStyle("stick")}>Sticks Only</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewStyle("sphere")}>Spheres Only</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowOutline(!showOutline)}>
                  {showOutline ? "❌ Disable Outlines" : "✨ Enable Outlines"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button 
              onClick={handleResetCamera}
              className="p-1 hover:bg-indigo-500/20 rounded-md transition-colors text-indigo-600"
              title="Reset Camera"
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
              <Maximize2 className="w-8 h-8 opacity-20 mb-2" />
              <p className="text-xs font-medium">Click 'Build' to view structure</p>
            </div>
          )}
        </CardContent>
        <Handle type="source" position={Position.Right} className="w-3 h-3 bg-indigo-500/80" />
      </Card>
    </>
  );
}
