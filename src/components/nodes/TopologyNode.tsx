import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { ListOrdered } from "lucide-react";
import { NodeHeader } from "./NodeHeader";
import type { NodeComponentProps } from "./types";

type MolRow = { name?: string; count?: string };
type DetectedRow = { name: string; count: number; type: string };
type TopologyNodeData = {
  molecules?: MolRow[];
  detectedMolecules?: DetectedRow[]; // runtime-only: populated from the last run
};

const ROWS = 8;

// Component-class badge styling for the read-only "detected type" chip.
const TYPE_BADGE: Record<string, string> = {
  mineral: "bg-amber-500/15 text-amber-600",
  organic: "bg-emerald-500/15 text-emerald-600",
  ion: "bg-violet-500/15 text-violet-600",
  water: "bg-sky-500/15 text-sky-600",
  other: "bg-slate-500/15 text-slate-500",
};

/**
 * Topology node — passthrough that lets the user override the GROMACS
 * [ molecules ] section. After a run it shows the detected sequence (name,
 * count, type) as ghost placeholders; "Use detected" copies it into the
 * editable fields. Blank fields = auto-detect (no override).
 */
export function TopologyNode({ id, data }: NodeComponentProps<TopologyNodeData>) {
  const { updateNodeData } = useReactFlow();
  const rows: MolRow[] = data?.molecules ?? [];
  const detected: DetectedRow[] = data?.detectedMolecules ?? [];

  const setRow = (i: number, field: "name" | "count", value: string) => {
    const next: MolRow[] = Array.from({ length: ROWS }, (_, k) => ({ ...(rows[k] ?? {}) }));
    next[i] = { ...next[i], [field]: value };
    updateNodeData(id, { ...data, molecules: next });
  };

  const useDetected = () => {
    updateNodeData(id, {
      ...data,
      molecules: detected.slice(0, ROWS).map((d) => ({ name: d.name, count: String(d.count) })),
    });
  };

  return (
    <div className="bg-card w-[270px] shadow-lg rounded-xl border border-sky-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-sky-400" />
      <NodeHeader id={id} title="Topology" Icon={ListOrdered} colorClass="text-sky-500" className="bg-sky-500/10" />

      <div className="p-3 space-y-2 bg-background">
        <div className="text-[10px] text-muted-foreground leading-tight">
          Override the GROMACS <span className="font-mono">[ molecules ]</span> section. Blank = auto-detect.
          The topology wins over structure-file residue names; counts (× atoms each) must account for every
          atom, in order.
        </div>

        {detected.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Detected from last run:</span>
            <button
              type="button"
              className="nodrag text-[10px] font-semibold text-sky-600 hover:underline"
              onClick={useDetected}
              onPointerDown={(e) => e.stopPropagation()}
            >
              Use detected
            </button>
          </div>
        )}

        <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-1.5 text-[10px] font-semibold text-muted-foreground px-0.5">
          <span>Molecule</span>
          <span className="text-center">n</span>
          <span className="text-center">type</span>
        </div>

        {Array.from({ length: ROWS }).map((_, i) => {
          const d = detected[i];
          return (
            <div key={i} className="grid grid-cols-[1.3fr_1fr_1fr] gap-1.5 items-center">
              <input
                type="text"
                placeholder={d?.name ?? "(auto)"}
                className="nodrag w-full text-[11px] bg-muted border border-border rounded-md px-2 py-0.5"
                value={rows[i]?.name ?? ""}
                onChange={(e) => setRow(i, "name", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <input
                type="number"
                min="1"
                placeholder={d ? String(d.count) : ""}
                className="nodrag w-full text-center text-[11px] bg-muted border border-border rounded-md px-1 py-0.5"
                value={rows[i]?.count ?? ""}
                onChange={(e) => setRow(i, "count", e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
              />
              <span
                className={`text-center text-[9px] rounded px-1 py-0.5 truncate ${
                  d ? TYPE_BADGE[d.type] ?? TYPE_BADGE.other : "text-transparent"
                }`}
                title={d?.type ?? ""}
              >
                {d?.type ?? "—"}
              </span>
            </div>
          );
        })}
      </div>

      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
