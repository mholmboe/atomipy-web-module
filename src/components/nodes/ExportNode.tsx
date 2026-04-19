import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { FileOutput, Download, Save, ChevronDown, ChevronUp } from "lucide-react";
import type { NodeComponentProps } from "./types";

type ExportNodeData = {
  outputName?: string;
  structureFormat?: "xyz" | "gro" | "pdb" | "cif";
  topologyFormat?: "none" | "itp" | "lmp" | "psf";
  angleTerms?: "none" | "0" | "250" | "500" | "1500";
  writeConect?: boolean;
  cifTitle?: string;
  topologyRmaxH?: number;
  topologyRmaxM?: number;
  detectBimodal?: boolean;
  bimodalThreshold?: number;
  moleculeName?: string;
  segid?: string;
  nrexcl?: number;
};

export function ExportNode({ id, data }: NodeComponentProps<ExportNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [showMore, setShowMore] = useState(false);
  const structureFormat = data.structureFormat || "xyz";
  const topologyFormat = data.topologyFormat || "none";

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-destructive/50 overflow-hidden font-sans select-none relative">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <div className="bg-destructive/10 p-3 border-b border-border flex items-center gap-2">
        <Download className="w-4 h-4 text-destructive" />
        <h3 className="text-sm font-semibold text-foreground m-0">Export System</h3>
      </div>
      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Output Name</label>
          <input
            type="text"
            className="nodrag w-full text-sm bg-muted border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-destructive"
            value={data.outputName || "system"}
            onChange={(e) => updateNodeData(id, { ...data, outputName: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1 mt-2">Structure File</label>
          <select
            className="nodrag w-full text-sm bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-destructive h-8"
            value={structureFormat}
            onChange={(e) => updateNodeData(id, { ...data, structureFormat: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="xyz">XYZ (.xyz)</option>
            <option value="gro">GROMACS structure (.gro)</option>
            <option value="pdb">PDB (.pdb)</option>
            <option value="cif">CIF (.cif)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1 mt-2">Topology File (Optional)</label>
          <select
            className="nodrag w-full text-sm bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-destructive h-8"
            value={topologyFormat}
            onChange={(e) => updateNodeData(id, { ...data, topologyFormat: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="none">None</option>
            <option value="itp">GROMACS topology (.itp)</option>
            <option value="lmp">LAMMPS data (.data)</option>
            <option value="psf">NAMD/OPENMM topology (.psf)</option>
          </select>
        </div>

        {topologyFormat !== "none" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1 mt-2">Angle Terms</label>
            <select
              className="nodrag w-full text-sm bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-destructive h-8"
              value={data.angleTerms || "500"}
              onChange={(e) => updateNodeData(id, { ...data, angleTerms: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="none">none (skip angles)</option>
              <option value="0">0</option>
              <option value="250">250</option>
              <option value="500">500</option>
              <option value="1500">1500</option>
            </select>
          </div>
        )}

        <button
          type="button"
          className="nodrag w-full flex items-center justify-between text-xs font-semibold text-muted-foreground border border-border rounded-md px-2 py-1.5 bg-background hover:bg-muted/50"
          onClick={() => setShowMore((prev) => !prev)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          More options
          {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showMore && (
          <div className="space-y-2 border border-border rounded-md p-2 bg-muted/30">
            {structureFormat === "pdb" && (
              <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
                Write CONECT records
                <input
                  type="checkbox"
                  className="nodrag"
                  checked={data.writeConect || false}
                  onChange={(e) => updateNodeData(id, { ...data, writeConect: e.target.checked })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </label>
            )}

            {structureFormat === "cif" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">CIF title</label>
                <input
                  type="text"
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                  placeholder="Generated by atomipy"
                  value={data.cifTitle || ""}
                  onChange={(e) => updateNodeData(id, { ...data, cifTitle: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}

            {topologyFormat !== "none" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">rmaxH (Å)</label>
                    <input
                      type="number"
                      step="0.05"
                      className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                      value={data.topologyRmaxH || 1.2}
                      onChange={(e) => updateNodeData(id, { ...data, topologyRmaxH: parseFloat(e.target.value) || 1.2 })}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">rmaxM (Å)</label>
                    <input
                      type="number"
                      step="0.05"
                      className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                      value={data.topologyRmaxM || 2.45}
                      onChange={(e) => updateNodeData(id, { ...data, topologyRmaxM: parseFloat(e.target.value) || 2.45 })}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>

                <label className="nodrag flex items-center justify-between text-xs text-muted-foreground">
                  Detect bimodal angles
                  <input
                    type="checkbox"
                    className="nodrag"
                    checked={data.detectBimodal || false}
                    onChange={(e) => updateNodeData(id, { ...data, detectBimodal: e.target.checked })}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </label>

                {(data.detectBimodal || false) && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Bimodal threshold (deg)</label>
                    <input
                      type="number"
                      step="1"
                      className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                      value={data.bimodalThreshold || 30}
                      onChange={(e) => updateNodeData(id, { ...data, bimodalThreshold: parseFloat(e.target.value) || 30 })}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </div>
                )}

                {topologyFormat === "itp" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">Molecule name</label>
                      <input
                        type="text"
                        className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                        placeholder="optional"
                        value={data.moleculeName || ""}
                        onChange={(e) => updateNodeData(id, { ...data, moleculeName: e.target.value })}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">nrexcl</label>
                      <input
                        type="number"
                        min="0"
                        className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                        value={data.nrexcl || 1}
                        onChange={(e) => updateNodeData(id, { ...data, nrexcl: parseInt(e.target.value) || 1 })}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                )}

                {topologyFormat === "psf" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Segment ID (segid)</label>
                    <input
                      type="text"
                      className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                      placeholder="optional"
                      value={data.segid || ""}
                      onChange={(e) => updateNodeData(id, { ...data, segid: e.target.value })}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
              </>
            )}

            <div className="border-t border-border pt-2 mt-2">
              <label className="nodrag flex items-center justify-between text-xs text-muted-foreground font-semibold">
                Minimalistic Python script
                <input
                  type="checkbox"
                  className="nodrag"
                  checked={data.minimalisticScript || false}
                  onChange={(e) => updateNodeData(id, { ...data, minimalisticScript: e.target.checked })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </label>
              <p className="text-[10px] text-muted-foreground leading-tight mt-1">
                Excludes web instrumentation and progress markers.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
