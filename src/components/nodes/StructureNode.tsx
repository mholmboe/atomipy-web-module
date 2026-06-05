import React, { useState, useRef, useEffect } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { FileInput, Upload, File, Loader2, X, ChevronDown, ChevronUp } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import { toast } from "sonner";
import { formatPresetLabel } from "./types";
import type { NodeComponentProps, PresetOption } from "./types";
import { STRUCTURE_FILE_ACCEPT, isSupportedStructureFile, uploadStructureFile } from "@/lib/uploads";

const ORGANIC_FILE_ACCEPT = ".mol2,.sdf,.mol,.pdb";

// ---- Bundled organic molecule library (GET /api/molecules) ----------------
// Static data; fetch once and share the result across all StructureNode
// instances via a module-level cache so node data isn't bloated with ~428 rows.
type LibMolecule = { name: string; file: string; formula?: string; natoms?: number; category?: string };
type LibCategory = { name: string; molecules: LibMolecule[] };
let _molLibCache: LibCategory[] | null = null;
let _molLibPromise: Promise<LibCategory[]> | null = null;

function useMoleculeLibrary(): LibCategory[] {
  const [cats, setCats] = useState<LibCategory[]>(_molLibCache ?? []);
  useEffect(() => {
    if (_molLibCache) { setCats(_molLibCache); return; }
    if (!_molLibPromise) {
      _molLibPromise = fetch("/api/molecules")
        .then((r) => r.json())
        .then((d) => { _molLibCache = Array.isArray(d?.categories) ? d.categories : []; return _molLibCache!; })
        .catch(() => { _molLibCache = []; return _molLibCache!; });
    }
    _molLibPromise.then(setCats);
  }, []);
  return cats;
}

const prettyCategory = (name: string) =>
  name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ---- Bundled inorganic material library (GET /api/inorganic-library) --------
// 'MINFF presets' (curated UC_conf, force-field-ready) on top, then the Avogadro
// crystal categories (oxides, halides, sulfides, elements, ...). Fetched once.
type InorgMaterial = { name: string; file: string; source: "preset" | "crystal"; formula?: string; mineral?: string; elements?: string[] };
type InorgCategory = { name: string; source: string; materials: InorgMaterial[] };
let _inorgLibCache: InorgCategory[] | null = null;
let _inorgLibPromise: Promise<InorgCategory[]> | null = null;

function useInorganicLibrary(): InorgCategory[] {
  const [cats, setCats] = useState<InorgCategory[]>(_inorgLibCache ?? []);
  useEffect(() => {
    if (_inorgLibCache) { setCats(_inorgLibCache); return; }
    if (!_inorgLibPromise) {
      _inorgLibPromise = fetch("/api/inorganic-library")
        .then((r) => r.json())
        .then((d) => { _inorgLibCache = Array.isArray(d?.categories) ? d.categories : []; return _inorgLibCache!; })
        .catch(() => { _inorgLibCache = []; return _inorgLibCache!; });
    }
    _inorgLibPromise.then(setCats);
  }, []);
  return cats;
}

type StructureNodeData = {
  source?: "preset" | "upload" | "organic" | "library";
  value?: string;
  presets?: PresetOption[];
  filename?: string;
  originalName?: string;
  path?: string;
  // Inorganic library selection: librarySource 'preset' -> UC_conf/<value>,
  // 'crystal' -> ap.load_crystal(<value>). value holds the file path.
  librarySource?: "preset" | "crystal";
  materialName?: string;

  // Organic/SMILES properties
  smiles?: string;
  forcefield?: string;
  conformers?: number;
  inputMode?: "smiles" | "file" | "library";
  uploadedFilePath?: string;
  uploadedFileName?: string;
  previewJobId?: string;
  chargeMethod?: "am1bcc" | "gasteiger" | "none";
  // Bundled organic library selection (category-relative cjson path, e.g.
  // "amino_acids/L-alanine.cjson"). Set inputMode "library" to use it. No
  // visual picker yet — populated via raw node data or /api/molecules.
  libraryMolecule?: string;
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
  const [isScanning, setIsScanning] = useState(false);
  const [inorgScan, setInorgScan] = useState<{ minffCompatible: boolean; unsupported: string[]; elements: string[]; nAtoms: number } | null>(null);

  const presets = data.presets || [];
  const smiles = data.smiles || "";
  const conformers = data.conformers || 1;
  const inputMode = data.inputMode || "smiles";

  const moleculeLibrary = useMoleculeLibrary();
  const [libCategory, setLibCategory] = useState<string>(() => (data.libraryMolecule || "").split("/")[0] || "");
  const libMolsForCat = moleculeLibrary.find((c) => c.name === libCategory)?.molecules ?? [];

  const inorgLibrary = useInorganicLibrary();
  const [inorgCategory, setInorgCategory] = useState<string>(() => (data.source === "library" && data.value ? (data.value.includes("/") ? data.value.split("/")[0] : "MINFF presets") : ""));
  const inorgMatsForCat = inorgLibrary.find((c) => c.name === inorgCategory)?.materials ?? [];

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

  const handleInorganicScan = async () => {
    setIsScanning(true);
    setInorgScan(null);
    try {
      // A library material is either a UC_conf preset or a bundled crystal.
      const scanSource = source === "library" ? (data.librarySource === "crystal" ? "crystal" : "preset") : source;
      const response = await fetch("/api/inorganic/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: scanSource,
          fileName: source === "library" ? data.value : (source === "preset" ? data.value : data.filename),
          uploadedFilePath: data.uploadedFilePath || data.path || data.filename,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Scan failed");
      setInorgScan(result);
      if (result.minffCompatible) {
        toast.success(`Force-field compatible -- ${result.elements.join(", ")}`);
      } else {
        toast.warning(`Not force-field compatible: ${result.unsupported.join(", ")} -- use the Dummy FF.`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsScanning(false);
    }
  };
  const canScan = ((source === "preset" || source === "library") && !!data.value) || (source === "upload" && !!data.filename);

  const handleParametrize = async () => {
    const target = inputMode === "library" ? data.libraryMolecule
      : inputMode === "file" ? data.uploadedFilePath : smiles;
    if (!target) return;
    setIsParametrizing(true);
    setPreviewError(null);
    try {
      const response = await fetch("/api/organic/parametrize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smiles, forcefield: "gaff-2.11", inputMode,
          uploadedFilePath: data.uploadedFilePath,
          libraryMolecule: data.libraryMolecule,
        }),
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

  const canParametrize = inputMode === "smiles" ? smiles.length > 0
    : inputMode === "library" ? !!data.libraryMolecule
    : !!data.uploadedFilePath;

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
              {(["upload", "preset", "library"] as const).map((mode) => (
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
                  {mode === "upload" ? "Custom File" : mode === "preset" ? "Preset" : "Library"}
                </button>
              ))}
            </div>

            {/* Inorganic material library: MINFF presets + crystal categories */}
            {source === "library" && (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Category</label>
                  <select
                    className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 h-7"
                    value={inorgCategory}
                    onChange={(e) => { setInorgCategory(e.target.value); updateNodeData(id, { ...data, value: "", materialName: "", previewJobId: undefined }); }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <option value="">-- Choose category --</option>
                    {inorgLibrary.map((c) => (
                      <option key={c.name} value={c.name}>{prettyCategory(c.name)} ({c.materials.length})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Material</label>
                  <select
                    className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 h-7 disabled:opacity-50"
                    value={data.value || ""}
                    disabled={!inorgCategory}
                    onChange={(e) => {
                      const m = inorgMatsForCat.find((x) => x.file === e.target.value);
                      updateNodeData(id, { ...data, source: "library", value: e.target.value, librarySource: m?.source, materialName: m?.name, previewJobId: undefined });
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <option value="">{inorgCategory ? "-- Choose material --" : "Select a category first"}</option>
                    {inorgMatsForCat.map((m) => (
                      <option key={m.file} value={m.file}>{m.name}{m.formula && !m.name.includes(m.formula) ? ` · ${m.formula}` : ""}</option>
                    ))}
                  </select>
                </div>
                {inorgLibrary.length === 0 && <p className="text-[9px] text-muted-foreground/70">Loading library…</p>}
                <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
                  MINFF presets are force-field-ready; other categories often need the Dummy FF — use Preview &amp; Validate.
                </p>
              </div>
            )}

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

            {/* Preview & Validate -- scan elements for force-field compatibility */}
            <button
              type="button"
              className="nodrag w-full flex justify-center py-1.5 bg-primary/20 text-primary hover:bg-primary/30 rounded-md text-xs font-semibold transition-colors disabled:opacity-40"
              onClick={handleInorganicScan}
              disabled={!canScan || isScanning}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {isScanning ? "Scanning…" : "Preview & Validate"}
            </button>

            {inorgScan && (
              inorgScan.minffCompatible ? (
                <div className="text-[10px] text-green-600 bg-green-500/10 p-2 rounded border border-green-500/20 leading-relaxed">
                  ✓ Force-field compatible — {inorgScan.nAtoms} atoms ({inorgScan.elements.join(", ")}).
                  Use the MINFF or CLAYFF forcefield.
                </div>
              ) : (
                <div className="text-[10px] text-amber-700 bg-amber-500/10 p-2 rounded border border-amber-500/30 leading-relaxed">
                  ⚠️ <b>Not force-field compatible:</b> {inorgScan.unsupported.join(", ")} ha{inorgScan.unsupported.length > 1 ? "ve" : "s"} no
                  built-in force-field type. Set the <b>Forcefield</b> node to <b>“Dummy FF”</b> to run a frozen
                  qualitative model (EM/NVT). Elements: {inorgScan.elements.join(", ")}.
                </div>
              )
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Sub-pill toggle for Organic */}
            <div className="flex rounded-md overflow-hidden border border-border text-[10px] font-semibold">
              {(["smiles", "file", "library"] as const).map((mode) => (
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
                  {mode === "smiles" ? "SMILES" : mode === "file" ? "File" : "Library"}
                </button>
              ))}
            </div>

            {/* Bundled organic molecule library picker */}
            {inputMode === "library" && (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Category</label>
                  <select
                    className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary h-7"
                    value={libCategory}
                    onChange={(e) => { setLibCategory(e.target.value); updateNodeData(id, { ...data, libraryMolecule: "", previewJobId: undefined }); }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <option value="">-- Choose category --</option>
                    {moleculeLibrary.map((c) => (
                      <option key={c.name} value={c.name}>{prettyCategory(c.name)} ({c.molecules.length})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Molecule</label>
                  <select
                    className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary h-7 disabled:opacity-50"
                    value={data.libraryMolecule || ""}
                    disabled={!libCategory}
                    onChange={(e) => updateNodeData(id, { ...data, libraryMolecule: e.target.value, previewJobId: undefined })}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <option value="">{libCategory ? "-- Choose molecule --" : "Select a category first"}</option>
                    {libMolsForCat.map((m) => (
                      <option key={m.file} value={m.file}>{m.name}{m.formula ? ` · ${m.formula}` : ""}</option>
                    ))}
                  </select>
                </div>
                {moleculeLibrary.length === 0 && (
                  <p className="text-[9px] text-muted-foreground/70">Loading library…</p>
                )}
              </div>
            )}

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
