import React, { useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import { Eye, RotateCw, Maximize2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function ViewerNode({ id, data }: NodeComponentProps<ViewerNodeData>) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerInstance = useRef<any>(null);
  const pdb = data.pdb || "";
  const showUnitCell = data.showUnitCell ?? true;

  useEffect(() => {
    if (!viewerRef.current || !window.$3Dmol) return;

    // Initialize viewer if not already done
    if (!viewerInstance.current) {
      viewerInstance.current = window.$3Dmol.createViewer(viewerRef.current, {
        backgroundColor: "rgba(0,0,0,0)",
      });
    }

    const viewer = viewerInstance.current;
    viewer.clear();

    if (pdb) {
      const model = viewer.addModel(pdb, "pdb");
      
      // Style atoms
      viewer.setStyle({}, { 
        stick: { radius: 0.15, colorscheme: "Jmol" },
        sphere: { scale: 0.25, colorscheme: "Jmol" }
      });
      
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
      // Show empty state or placeholder?
      viewer.render();
    }
  }, [pdb, showUnitCell]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (viewerInstance.current) {
        viewerInstance.current.resize();
        viewerInstance.current.render();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleResetCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewerInstance.current) {
      viewerInstance.current.zoomTo();
      viewerInstance.current.render();
    }
  };

  return (
    <Card className="w-[300px] shadow-lg transition-all border-indigo-500/30 bg-card/95 backdrop-blur-sm overflow-hidden">
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-indigo-500/80" />
      <CardHeader className="py-2.5 px-4 bg-indigo-500/10 border-b flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
          <Eye className="w-4 h-4" />
          {data.title || "Structure Viewer"}
        </CardTitle>
        <div className="flex gap-1">
          <button 
            onClick={handleResetCamera}
            className="p-1 hover:bg-indigo-500/20 rounded-md transition-colors text-indigo-600"
            title="Reset Camera"
          >
            <RotateCw className="w-3 h-3" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0 relative bg-slate-950/5 aspect-square nodrag">
        <div 
          ref={viewerRef} 
          className="w-full h-full cursor-move"
          style={{ width: "300px", height: "300px" }}
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
  );
}
