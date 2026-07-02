import React, { useRef, useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { History, Upload, X, Loader2 } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";
import {
  STRUCTURE_FILE_ACCEPT,
  TRAJECTORY_FILE_ACCEPT,
  trajectoryNeedsTopology,
  uploadStructureFile,
  uploadTrajectoryFile,
} from "@/lib/uploads";

type TrajectoryNodeData = {
  mode?: "import" | "export";
  filename?: string;
  format?: "pdb" | "gro" | "xyz";
  extractMode?: boolean;
  frameIndex?: number;
  // Uploaded trajectory (import mode)
  trajPath?: string;
  trajName?: string;
  // Companion topology (needed for xtc/trr/dcd, which carry no atom names)
  topPath?: string;
  topName?: string;
};

export function TrajectoryNode({ id, data }: NodeComponentProps<TrajectoryNodeData>) {
  const { updateNodeData } = useReactFlow();
  const mode = data.mode || "export";
  const extractMode = !!data.extractMode;

  const trajInputRef = useRef<HTMLInputElement>(null);
  const topInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"traj" | "top" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: keyof TrajectoryNodeData, value: string | number | boolean | undefined) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  const needsTop = !!data.trajName && trajectoryNeedsTopology(data.trajName);

  const onTrajFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("traj"); setError(null);
    try {
      const res = await uploadTrajectoryFile(file);
      updateNodeData(id, { ...data, trajPath: res.path, trajName: res.originalName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (trajInputRef.current) trajInputRef.current.value = "";
    }
  };

  const onTopFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("top"); setError(null);
    try {
      const res = await uploadStructureFile(file);
      updateNodeData(id, { ...data, topPath: res.path, topName: res.originalName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (topInputRef.current) topInputRef.current.value = "";
    }
  };

  return (
    <div className="bg-card w-[260px] shadow-lg rounded-xl border border-slate-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Trajectory Processing" Icon={History} colorClass="text-purple-500" className="bg-purple-500/10" />

      <div className="p-4 space-y-3 bg-background">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Mode</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={mode}
            onChange={(e) => handleChange("mode", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="import">Import Trajectory</option>
            <option value="export">Write Trajectory (Append)</option>
          </select>
        </div>

        {mode === "import" ? (
          <div className="space-y-2">
            {/* Trajectory file upload */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Trajectory file</label>
              {data.trajName ? (
                <div className="flex items-center justify-between gap-2 text-xs bg-muted border border-border rounded-md px-2 py-1.5">
                  <span className="truncate" title={data.trajName}>{data.trajName}</span>
                  <button
                    type="button"
                    onClick={() => updateNodeData(id, { ...data, trajPath: undefined, trajName: undefined })}
                    className="nodrag text-muted-foreground hover:text-destructive shrink-0"
                    title="Remove"
                  ><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => trajInputRef.current?.click()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="nodrag w-full flex items-center justify-center gap-1 text-xs bg-muted hover:bg-muted/70 border border-dashed border-border rounded-md px-2 py-2 text-muted-foreground"
                >
                  {busy === "traj" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload .pdb/.gro/.xtc/.trr/.dcd
                </button>
              )}
              <input ref={trajInputRef} type="file" accept={TRAJECTORY_FILE_ACCEPT} className="hidden" onChange={onTrajFile} />
            </div>

            {/* Companion topology (only for name-less binary formats) */}
            {needsTop && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Topology (required for {data.trajName?.split(".").pop()?.toLowerCase()})
                </label>
                {data.topName ? (
                  <div className="flex items-center justify-between gap-2 text-xs bg-muted border border-border rounded-md px-2 py-1.5">
                    <span className="truncate" title={data.topName}>{data.topName}</span>
                    <button
                      type="button"
                      onClick={() => updateNodeData(id, { ...data, topPath: undefined, topName: undefined })}
                      className="nodrag text-muted-foreground hover:text-destructive shrink-0"
                      title="Remove"
                    ><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => topInputRef.current?.click()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="nodrag w-full flex items-center justify-center gap-1 text-xs bg-muted hover:bg-muted/70 border border-dashed border-border rounded-md px-2 py-2 text-muted-foreground"
                  >
                    {busy === "top" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Upload .gro/.pdb structure
                  </button>
                )}
                <input ref={topInputRef} type="file" accept={STRUCTURE_FILE_ACCEPT} className="hidden" onChange={onTopFile} />
                <p className="text-[10px] text-muted-foreground/70 leading-snug mt-1">
                  Binary trajectories store only coordinates — the topology supplies atom names/types.
                </p>
              </div>
            )}
            {error && <p className="text-[10px] text-destructive leading-snug">{error}</p>}
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Filename</label>
              <input
                type="text"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-500"
                value={data.filename || "trajectory.pdb"}
                onChange={(e) => handleChange("filename", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Format</label>
              <select
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                value={data.format || "pdb"}
                onChange={(e) => handleChange("format", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="pdb">PDB</option>
                <option value="gro">GRO</option>
                <option value="xyz">XYZ</option>
              </select>
            </div>
          </>
        )}

        <div className="pt-2 border-t border-border space-y-2">
          <label className="nodrag flex items-center gap-2 text-xs font-semibold text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={extractMode}
              onChange={(e) => handleChange("extractMode", e.target.checked)}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded border-border text-purple-500 focus:ring-0 cursor-pointer"
            />
            Extract single frame
          </label>

          {extractMode && (
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Frame Index</label>
              <input
                type="number"
                min="0"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={data.frameIndex ?? 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  handleChange("frameIndex", isNaN(val) ? 0 : val);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
