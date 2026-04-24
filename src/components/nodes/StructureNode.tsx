import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { FileInput, Upload, File, Loader2, X } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import { toast } from "sonner";
import { formatPresetLabel } from "./types";
import type { NodeComponentProps, PresetOption } from "./types";
import { STRUCTURE_FILE_ACCEPT, isSupportedStructureFile, uploadStructureFile } from "@/lib/uploads";

type StructureNodeData = {
  source?: "preset" | "upload";
  value?: string;
  presets?: PresetOption[];
  filename?: string;
  originalName?: string;
  path?: string;
};

export function StructureNode({ id, data }: NodeComponentProps<StructureNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const presets = data.presets || [];

  const uploadFile = async (file: File) => {
    if (!isSupportedStructureFile(file.name)) {
      toast.error("Unsupported file format.");
      return;
    }

    setUploading(true);

    try {
      const result = await uploadStructureFile(file);
      updateNodeData(id, {
        source: "upload",
        filename: result.filename,
        originalName: result.originalName,
        path: result.path,
      });
      toast.success(`Uploaded ${file.name}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!uploading) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (uploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (isSupportedStructureFile(file.name)) {
        uploadFile(file);
      } else {
        toast.error("Unsupported file format.");
      }
    }
  };

  const source =
    data.source === "preset" || data.source === "upload"
      ? data.source
      : data.filename
        ? "upload"
        : "upload";

  const handleSetSource = (next: "preset" | "upload") => {
    updateNodeData(id, { source: next });
  };

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-primary/50 overflow-hidden font-sans">
      <NodeHeader id={id} title="Import Structure" Icon={FileInput} colorClass="text-primary" className="bg-primary/10" />

      <div className="p-4 space-y-3 bg-secondary/20">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`nodrag rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
              source === "upload"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => handleSetSource("upload")}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Custom File
          </button>
          <button
            type="button"
            className={`nodrag rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
              source === "preset"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => handleSetSource("preset")}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Preset Structure
          </button>
        </div>

        {source === "preset" ? (
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1 uppercase tracking-wider">
              Preset Structure
            </label>
            <select
              className="nodrag w-full text-sm bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary h-8"
              value={data.value || ""}
              onChange={(e) => updateNodeData(id, { source: "preset", value: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <option value="">-- Choose --</option>
              {presets.map((p) => (
                <option key={p.id} value={p.fileName}>
                  {formatPresetLabel(p)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="relative">
            <input
              type="file"
              className="hidden"
              id={`file-upload-${id}`}
              accept={STRUCTURE_FILE_ACCEPT}
              onChange={handleFileChange}
              disabled={uploading}
            />
            <label
              htmlFor={`file-upload-${id}`}
              className={`nodrag flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50"
              } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
              onPointerDown={(e) => e.stopPropagation()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {uploading ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              ) : data.filename ? (
                <div className="flex flex-col items-center text-center">
                  <File className="w-6 h-6 text-primary mb-2" />
                  <span className="text-[10px] font-medium truncate w-[180px]">
                    {data.originalName || data.filename}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center">
                  <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                  <span className="text-[10px] text-muted-foreground">
                    Click to upload a structure file
                  </span>
                </div>
              )}
            </label>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
