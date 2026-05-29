import React, { useState, useRef } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { FileInput, Upload, File, Loader2, X, ChevronDown, ChevronUp } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import { toast } from "sonner";
import { formatPresetLabel } from "./types";
import type { NodeComponentProps, PresetOption } from "./types";
import { STRUCTURE_FILE_ACCEPT, isSupportedStructureFile, uploadStructureFile } from "@/lib/uploads";

const ORGANIC_FILE_ACCEPT = ".mol2,.sdf,.mol,.pdb";

type StructureNodeData = {
  source?: "preset" | "upload" | "organic";
  value?: string;
  presets?: PresetOption[];
  filename?: string;
  originalName?: string;
  path?: string;

  // Organic/SMILES properties
  smiles?: string;
  forcefield?: string;
  conformers?: number;
  inputMode?: "smiles" | "file";
  uploadedFilePath?: string;
  uploadedFileName?: string;
  previewJobId?: string;
  chargeMethod?: "am1bcc" | "gasteiger" | "none";
};

export function StructureNode({ id, data }: NodeComponentProps<StructureNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isParametrizing, setIsParametrizing] = useState(false);
  const [isUploadingOrganic, setIsUploadingOrganic] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const organicFileInputRef = useRef<HTMLInputElement>(null);

  const presets = data.presets || [];
  const smiles = data.smiles || "";
  const conformers = data.conformers || 1;
  const inputMode = data.inputMode || "smiles";

  const source = data.source || "upload";
  const [activeTab, setActiveTab] = useState<"inorganic" | "organic">(source === "organic" ? "organic" : "inorganic");

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

  const handleOrganicFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingOrganic(true);
    setPreviewError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/upload", { method: "POST", body: formData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).detail || "Upload failed");
      }
      const result = await resp.json();
      updateNodeData(id, {
        ...data,
        uploadedFilePath: result.path,
        uploadedFileName: result.originalName || file.name,
      });
      toast.success(`Uploaded ${file.name}`);
    } catch (err: any) {
      setPreviewError(err.message);
      toast.error(err.message);
    } finally {
      setIsUploadingOrganic(false);
      if (organicFileInputRef.current) organicFileInputRef.current.value = "";
    }
  };

  const clearOrganicFile = () => {
    updateNodeData(id, { ...data, uploadedFilePath: undefined, uploadedFileName: undefined });
  };

  const handleParametrize = async () => {
    const target = inputMode === "file" ? data.uploadedFilePath : smiles;
    if (!target) return;
    setIsParametrizing(true);
    setPreviewError(null);
    try {
      const response = await fetch("/api/organic/parametrize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles, forcefield: "gaff-2.11", inputMode, uploadedFilePath: data.uploadedFilePath }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Validation failed");
      updateNodeData(id, { ...data, previewJobId: result.job_id });
      toast.success("Structure validated successfully!");
    } catch (err: any) {
      setPreviewError(err.message);
      toast.error(err.message);
    } finally {
      setIsParametrizing(false);
    }
  };

  const canParametrize = inputMode === "smiles" ? smiles.length > 0 : !!data.uploadedFilePath;

  return (
    <div className="bg-card w-[260px] shadow-lg rounded-xl border border-primary/50 overflow-hidden font-sans select-none">
      <NodeHeader id={id} title="Import Structure" Icon={FileInput} colorClass="text-primary" className="bg-primary/10" />

      <div className="p-4 bg-background space-y-3">
        {/* Aligned Premium Inorganic vs Organic Tabs */}
        <div className="flex border-b border-border/50 mb-3">
          <button
            type="button"
            className={`flex-1 pb-1.5 text-xs font-semibold ${activeTab === 'inorganic' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => {
              setActiveTab('inorganic');
              updateNodeData(id, { ...data, source: "upload" });
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Inorganic
          </button>
          <button
            type="button"
            className={`flex-1 pb-1.5 text-xs font-semibold ${activeTab === 'organic' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => {
              setActiveTab('organic');
              updateNodeData(id, { ...data, source: "organic" });
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Organic
          </button>
        </div>

        {activeTab === "inorganic" ? (
          <div className="space-y-3">
            {/* Sub-pill toggle for Inorganic */}
            <div className="flex rounded-md overflow-hidden border border-border text-[10px] font-semibold">
              {(["upload", "preset"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`nodrag flex-1 py-1 transition-colors ${
                    source === mode
                      ? "bg-primary/20 text-primary"
                      : "bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                  onClick={() => updateNodeData(id, { ...data, source: mode })}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {mode === "upload" ? "Custom File" : "Preset Mineral"}
                </button>
              ))}
            </div>

            {source === "preset" && (
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                  Preset Mineral
                </label>
                <select
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary h-7"
                  value={data.value || ""}
                  onChange={(e) => updateNodeData(id, { ...data, source: "preset", value: e.target.value })}
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
            )}

            {source === "upload" && (
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
                  className={`nodrag flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-3 cursor-pointer transition-all duration-200 ${
                    isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50"
                  } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  ) : data.filename ? (
                    <div className="flex flex-col items-center text-center">
                      <File className="w-5 h-5 text-primary mb-1.5" />
                      <span className="text-[10px] font-medium truncate w-[160px]">
                        {data.originalName || data.filename}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center">
                      <Upload className="w-5 h-5 text-muted-foreground mb-1.5" />
                      <span className="text-[10px] text-muted-foreground font-medium">
                        Click or drag structure or topology file
                      </span>
                      <span className="text-[9px] text-muted-foreground/60 mt-0.5">
                        (.xyz, .pdb, .gro, .cif, .itp)
                      </span>
                    </div>
                  )}
                </label>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Sub-pill toggle for Organic */}
            <div className="flex rounded-md overflow-hidden border border-border text-[10px] font-semibold">
              {(["smiles", "file"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`nodrag flex-1 py-1 transition-colors ${
                    inputMode === mode
                      ? "bg-primary/20 text-primary"
                      : "bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                  onClick={() => updateNodeData(id, { ...data, inputMode: mode })}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {mode === "smiles" ? "SMILES String" : "Upload File"}
                </button>
              ))}
            </div>

            {/* SMILES input */}
            {inputMode === "smiles" && (
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-1">SMILES string</label>
                <input
                  type="text"
                  className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary h-8"
                  placeholder="e.g. CCO for ethanol"
                  value={smiles}
                  onChange={(e) => updateNodeData(id, { ...data, smiles: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}

            {/* Organic File upload */}
            {inputMode === "file" && (
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                  Structure file <span className="font-normal opacity-60">(.mol2, .sdf, .pdb)</span>
                </label>
                {data.uploadedFilePath ? (
                  <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-md px-2 py-1 text-xs">
                    <span className="truncate text-primary font-medium">{data.uploadedFileName}</span>
                    <button
                      type="button"
                      className="nodrag ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={clearOrganicFile}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label
                    className={`nodrag flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-2.5 cursor-pointer hover:border-primary/50 transition-colors text-xs text-muted-foreground ${isUploadingOrganic ? "opacity-50 pointer-events-none" : ""}`}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Upload className="w-4 h-4 mb-1 opacity-60 text-primary" />
                    {isUploadingOrganic ? "Uploading…" : "Click to upload"}
                    <input
                      ref={organicFileInputRef}
                      type="file"
                      accept={ORGANIC_FILE_ACCEPT}
                      className="hidden"
                      onChange={handleOrganicFileSelect}
                    />
                  </label>
                )}
              </div>
            )}

            {/* Preview & Validate */}
            <button
              type="button"
              className="nodrag w-full flex justify-center py-1.5 bg-primary/20 text-primary hover:bg-primary/30 rounded-md text-xs font-semibold transition-colors disabled:opacity-40"
              onClick={handleParametrize}
              disabled={!canParametrize || isParametrizing}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {isParametrizing ? "Validating…" : "Preview & Validate"}
            </button>

            {previewError && (
              <div className="text-[10px] text-destructive bg-destructive/10 p-2 rounded border border-destructive/20 leading-relaxed">
                {previewError}
              </div>
            )}

            {data.previewJobId && !previewError && !isParametrizing && (
              <div className="text-[10px] text-green-600 bg-green-500/10 p-2 rounded border border-green-500/20 flex items-center justify-between">
                <span>Validated</span>
                <span className="font-mono font-semibold">
                  {data.previewJobId.startsWith("preview_")
                    ? data.previewJobId.replace("preview_", "").replace("atoms", " atoms")
                    : `${data.previewJobId.slice(0, 6)}…`}
                </span>
              </div>
            )}

            {/* More options */}
            <button
              type="button"
              className="nodrag w-full flex items-center justify-between text-xs font-semibold text-muted-foreground border border-border rounded-md px-2 py-1 bg-background hover:bg-muted/50"
              onClick={() => setShowMore((prev) => !prev)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              More options
              {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showMore && (
              <div className="space-y-2 border border-border rounded-md p-2 bg-muted/30">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Conformers</label>
                  <input
                    type="number"
                    min="1"
                    className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary h-7"
                    value={conformers}
                    onChange={(e) => updateNodeData(id, { ...data, conformers: parseInt(e.target.value) || 1 })}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
                <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
                  Conformer coordinate generator. Parameterized downstream in Forcefield node.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
