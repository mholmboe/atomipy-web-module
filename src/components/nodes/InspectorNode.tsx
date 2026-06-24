import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Search, FileText, Variable } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type InspectFile = { name: string; size: number };
type InspectData = {
  atoms?: { count: number; types: Record<string, number>; has_charge: boolean; has_element: boolean } | null | string;
  box?: number[] | null;
  traj?: { path: string; exists: boolean; frames?: number } | null;
  topology?: { has_itp: boolean; top_path: string | null; defines: string[] | null } | null;
  files?: InspectFile[];
};

type InspectorNodeData = { inspect?: InspectData };

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function InspectorNode({ id, data }: NodeComponentProps<InspectorNodeData>) {
  useReactFlow();
  const insp = data?.inspect;
  const atoms = insp?.atoms;
  const box = insp?.box;
  const files = insp?.files ?? [];

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-2 text-[10px] leading-snug">
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className="font-mono text-right break-all">{v}</span>
    </div>
  );

  return (
    <div className="bg-card w-[320px] shadow-lg rounded-xl border border-cyan-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />
      <NodeHeader id={id} title="Inspector" Icon={Search} colorClass="text-cyan-500" className="bg-cyan-500/10" />

      <div className="p-4 space-y-3 bg-background">
        {!insp ? (
          <div className="text-[11px] text-muted-foreground/60 text-center py-6 leading-snug">
            <Search className="w-7 h-7 mx-auto mb-2 opacity-40" />
            Connect upstream and run the workflow to inspect the variables and files present at this point.
          </div>
        ) : (
          <>
            {/* Variables */}
            <div>
              <div className="flex items-center gap-1 text-[10px] font-bold text-cyan-600 uppercase tracking-wider mb-1">
                <Variable className="w-3 h-3" /> Variables
              </div>
              <div className="space-y-0.5 border border-border rounded-md p-2 bg-muted/20">
                {typeof atoms === "string" ? (
                  <Row k="atoms" v={atoms} />
                ) : atoms ? (
                  <>
                    <Row k="atoms" v={atoms.count} />
                    <Row k="charges" v={atoms.has_charge ? "yes" : "no"} />
                    <Row k="elements" v={atoms.has_element ? "yes" : "no"} />
                    <Row
                      k="types"
                      v={Object.entries(atoms.types)
                        .sort((a, b) => b[1] - a[1])
                        .map(([t, c]) => `${t}:${c}`)
                        .join("  ")}
                    />
                  </>
                ) : (
                  <Row k="atoms" v="None" />
                )}
                <Row k="box" v={box ? box.slice(0, 3).map((x) => x.toFixed(2)).join(" × ") + " Å" : "None"} />
                {insp.traj && (
                  <Row
                    k="trajectory"
                    v={`${insp.traj.path}${insp.traj.exists ? "" : " (missing)"}${insp.traj.frames != null ? ` · ${insp.traj.frames} frames` : ""}`}
                  />
                )}
                {insp.topology && (
                  <>
                    <Row k="topology (.itp)" v={insp.topology.has_itp ? "present" : "—"} />
                    {insp.topology.top_path && <Row k=".top" v={insp.topology.top_path} />}
                    {insp.topology.defines && insp.topology.defines.length > 0 && (
                      <Row k="defines" v={insp.topology.defines.join(" ")} />
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Files */}
            <div>
              <div className="flex items-center gap-1 text-[10px] font-bold text-cyan-600 uppercase tracking-wider mb-1">
                <FileText className="w-3 h-3" /> Files in working dir ({files.length})
              </div>
              <div className="border border-border rounded-md bg-muted/20 max-h-44 overflow-y-auto nodrag">
                {files.length === 0 ? (
                  <div className="text-[10px] text-muted-foreground/60 p-2">No files yet.</div>
                ) : (
                  files.map((f) => (
                    <div key={f.name} className="flex justify-between gap-2 text-[10px] px-2 py-0.5 hover:bg-muted/40 font-mono">
                      <span className="truncate" title={f.name}>{f.name}</span>
                      <span className="text-muted-foreground shrink-0">{fmtSize(f.size)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground/50 leading-snug">
              Snapshot at this point in the run (files written by upstream nodes; downstream files appear later). All files are in Download Results.
            </p>
          </>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
