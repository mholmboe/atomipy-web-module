import React, { useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Upload, File, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { NodeComponentProps } from "./types";

type UploadNodeData = {
  filename?: string;
  originalName?: string;
  path?: string;
};

type UploadApiResponse = {
  filename?: string;
  originalName?: string;
  path?: string;
};

export function UploadNode({ id, data }: NodeComponentProps<UploadNodeData>) {
  const { updateNodeData } = useReactFlow();
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
      });

      if (!res.ok) {
          throw new Error("Upload failed");
      }

      const result: UploadApiResponse = await res.json();
      updateNodeData(id, { 
        filename: result.filename, 
        originalName: result.originalName || file.name,
        path: result.path 
      });
      toast.success(`Uploaded ${file.name}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-card w-[240px] shadow-lg rounded-xl border border-amber-500/50 overflow-hidden font-sans select-none">
      <div className="bg-amber-500/10 p-3 border-b border-border flex items-center gap-2">
        <Upload className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Custom Structure</h3>
      </div>
      
      <div className="p-4 space-y-3 bg-background">
        <div className="relative">
          <input 
            type="file" 
            className="hidden" 
            id={`file-upload-${id}`}
            accept=".pdb,.gro,.cif,.xyz"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <label 
            htmlFor={`file-upload-${id}`}
            className={`nodrag flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-amber-500/50 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
            ) : data.filename ? (
              <div className="flex flex-col items-center text-center">
                <File className="w-6 h-6 text-amber-500 mb-2" />
                <span className="text-[10px] font-medium truncate w-[160px]">{data.originalName || data.filename}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                <span className="text-[10px] text-muted-foreground">Click to upload .pdb, .gro, .cif, or .xyz</span>
              </div>
            )}
          </label>
        </div>
      </div>
      
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
