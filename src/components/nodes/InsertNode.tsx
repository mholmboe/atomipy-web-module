import React, { useState, useEffect } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { PackagePlus, Upload, File, Loader2, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import type { NodeComponentProps, PresetOption } from "./types";
import { NodeHeader } from "./NodeHeader";
import { STRUCTURE_FILE_ACCEPT, isSupportedStructureFile, uploadStructureFile } from "@/lib/uploads";
import { useInorganicLibrary, prettyCategory } from "@/lib/inorganicLibrary";

type InsertNodeData = {
  source?: "preset" | "upload" | "library";
  value?: string;
  presets?: PresetOption[];
  // Inorganic library selection: librarySource 'preset' -> UC_conf/<value>,
  // 'crystal' -> ap.load_crystal(<value>). value holds the file path.
  librarySource?: "preset" | "crystal";
  materialName?: string;
  filename?: string;
  originalName?: string;
  path?: string;
  numMolecules?: number;
  minDistance?: number;
  rotateMode?: "random" | "manual";
  x?: number;
  y?: number;
  z?: number;
  typeConstraint1?: string;
  typeConstraint2?: string;
  zDiff?: number;
  xlo?: number;
  ylo?: number;
  zlo?: number;
  xhi?: number;
  yhi?: number;
  zhi?: number;
};

export function InsertNode({ id, data }: NodeComponentProps<InsertNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [uploading, setUploading] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const inorgLibrary = useInorganicLibrary();
  const [inorgCategory, setInorgCategory] = useState<string>(() => {
    const v = (data.source === "library" || data.source === "preset") ? (data.value || "") : "";
    if (!v) return "";
    return v.includes("/") ? v.split("/")[0] : "MINFF presets";
  });
  const inorgMatsForCat = inorgLibrary.find((c) => c.name === inorgCategory)?.materials ?? [];

  // Legacy 'preset' nodes → unified Library (librarySource 'preset', same value).
  useEffect(() => {
    if (data.source === "preset") {
      updateNodeData(id, { ...data, source: "library", librarySource: "preset" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const source =
    data.source === "library" || data.source === "preset" ? "library" : "upload";

  const rotateMode = data.rotateMode || "random";

  const handleSetSource = (next: "upload" | "library") => {
    updateNodeData(id, { ...data, source: next });
  };

  const handleChange = (field: keyof InsertNodeData, value: string | number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  const handleOptionalNumber = (field: keyof InsertNodeData, value: string) => {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) {
      updateNodeData(id, { ...data, [field]: parsed });
    } else {
      updateNodeData(id, { ...data, [field]: undefined });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isSupportedStructureFile(file.name)) {
      toast.error("Unsupported file format.");
      return;
    }

    setUploading(true);

    try {
      const result = await uploadStructureFile(file);
      updateNodeData(id, {
        ...data,
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

  return (
    <div className="bg-card w-[300px] shadow-lg rounded-xl border border-sky-500/50 overflow-hidden font-sans">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />

      <NodeHeader id={id} title="Insert Molecules" Icon={PackagePlus} colorClass="text-indigo-500" className="bg-indigo-500/10" />

      <div className="p-4 space-y-3 bg-background">
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
            <Upload className="inline w-3 h-3 mr-1" /> Upload
          </button>
          <button
            type="button"
            className={`nodrag rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
              source === "library"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => handleSetSource("library")}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Copy className="inline w-3 h-3 mr-1" /> Library
          </button>
        </div>

        {source === "library" ? (
          <div className="space-y-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Category</label>
              <select
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                value={inorgCategory}
                onChange={(e) => { setInorgCategory(e.target.value); updateNodeData(id, { ...data, value: "", materialName: "" }); }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="">-- Choose category --</option>
                {inorgLibrary.map((c) => (
                  <option key={c.name} value={c.name}>{prettyCategory(c.name)} ({c.materials.length})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Structure</label>
              <select
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1 disabled:opacity-50"
                value={data.value || ""}
                disabled={!inorgCategory}
                onChange={(e) => {
                  const m = inorgMatsForCat.find((x) => x.file === e.target.value);
                  updateNodeData(id, { ...data, source: "library", value: e.target.value, librarySource: m?.source, materialName: m?.name });
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <option value="">{inorgCategory ? "-- Choose structure --" : "Select a category first"}</option>
                {inorgMatsForCat.map((m) => (
                  <option key={m.file} value={m.file}>{m.name}{m.formula && !m.name.includes(m.formula) ? ` · ${m.formula}` : ""}</option>
                ))}
              </select>
            </div>
            {inorgLibrary.length === 0 && <p className="text-[9px] text-muted-foreground/70">Loading library…</p>}
          </div>
        ) : (
          <div className="relative">
            <input
              type="file"
              className="hidden"
              id={`insert-upload-${id}`}
              accept={STRUCTURE_FILE_ACCEPT}
              onChange={handleFileChange}
              disabled={uploading}
            />
            <label
              htmlFor={`insert-upload-${id}`}
              className={`nodrag flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              ) : data.filename ? (
                <div className="flex flex-col items-center text-center">
                  <File className="w-5 h-5 text-primary mb-1" />
                  <span className="text-[10px] font-medium truncate w-[180px]">{data.originalName || data.filename}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center">
                  <Upload className="w-5 h-5 text-muted-foreground mb-1" />
                  <span className="text-[10px] text-muted-foreground font-medium">Click to upload structure or topology</span>
                  <span className="text-[10px] text-muted-foreground/60 mt-0.5">(.xyz, .pdb, .gro, .cif, .itp)</span>
                </div>
              )}
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Count</label>
            <input
              type="number"
              min="1"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
              value={data.numMolecules || 1}
              onChange={(e) => handleChange("numMolecules", parseInt(e.target.value) || 1)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Min Dist (Å)</label>
            <input
              type="number"
              step="0.1"
              className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
              value={data.minDistance || 2.0}
              onChange={(e) => handleChange("minDistance", parseFloat(e.target.value) || 2.0)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Rotation</label>
          <select
            className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
            value={rotateMode}
            onChange={(e) => handleChange("rotateMode", e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <option value="random">Random</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        {rotateMode === "manual" && (
          <div className="grid grid-cols-3 gap-2">
            <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" value={data.x || 0} onChange={(e) => handleChange("x", parseFloat(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} placeholder="X" />
            <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" value={data.y || 0} onChange={(e) => handleChange("y", parseFloat(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} placeholder="Y" />
            <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" value={data.z || 0} onChange={(e) => handleChange("z", parseFloat(e.target.value) || 0)} onPointerDown={(e) => e.stopPropagation()} placeholder="Z" />
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
          <div className="space-y-3 border border-border rounded-md p-2 bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                placeholder="Constraint type 1"
                value={data.typeConstraint1 || ""}
                onChange={(e) => handleChange("typeConstraint1", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="text"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-2 py-1"
                placeholder="Constraint type 2"
                value={data.typeConstraint2 || ""}
                onChange={(e) => handleChange("typeConstraint2", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Min z-diff for constrained pair (Å)</label>
              <input
                type="number"
                step="0.1"
                className="nodrag w-full text-xs bg-muted border border-border rounded-md px-1 py-1"
                value={data.zDiff ?? ""}
                placeholder="optional"
                onChange={(e) => handleOptionalNumber("zDiff", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </div>

            <div className="text-[11px] text-muted-foreground">Optional insert limits (defaults to full box).</div>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" placeholder="xlo" value={data.xlo ?? ""} onChange={(e) => handleOptionalNumber("xlo", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
              <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" placeholder="ylo" value={data.ylo ?? ""} onChange={(e) => handleOptionalNumber("ylo", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
              <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" placeholder="zlo" value={data.zlo ?? ""} onChange={(e) => handleOptionalNumber("zlo", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" placeholder="xhi" value={data.xhi ?? ""} onChange={(e) => handleOptionalNumber("xhi", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
              <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" placeholder="yhi" value={data.yhi ?? ""} onChange={(e) => handleOptionalNumber("yhi", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
              <input type="number" step="0.1" className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1" placeholder="zhi" value={data.zhi ?? ""} onChange={(e) => handleOptionalNumber("zhi", e.target.value)} onPointerDown={(e) => e.stopPropagation()} />
            </div>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
