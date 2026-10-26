import React, { useMemo, useState } from "react";
import { Panel } from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import { computeReadiness, type ReadinessItem, type ReadinessFix } from "../graph/graphExecution";

/**
 * Pre-run readiness panel: a live checklist of why the current workflow would
 * (or wouldn't) run, shown before the user hits Run. Reuses the same validators
 * the Run gate uses, plus a few proactive checks. Clicking an item focuses the
 * node it concerns. Non-blocking and collapsible.
 */
export function ReadinessPanel({
  nodes,
  edges,
  onFocusNode,
  onApplyFix,
  enabled,
  onToggleEnabled,
}: {
  nodes: Node[];
  edges: Edge[];
  onFocusNode: (nodeId: string) => void;
  onApplyFix: (fix: ReadinessFix) => void;
  enabled: boolean;
  onToggleEnabled: () => void;
}) {
  // Hooks first (Rules of Hooks) — computeReadiness is cheap even when hidden.
  const items = useMemo(() => (enabled ? computeReadiness(nodes, edges) : []), [enabled, nodes, edges]);
  const [open, setOpen] = useState(true);

  // When turned off, show a small pill to turn it back on (so it's discoverable).
  if (!enabled) {
    return (
      <Panel position="top-left" style={{ margin: 8 }}>
        <button
          type="button"
          onClick={onToggleEnabled}
          className="flex items-center gap-1.5 rounded-full border border-border bg-background/80 backdrop-blur-sm px-3 py-1 text-[10px] font-medium text-muted-foreground shadow hover:text-foreground hover:bg-muted transition nodrag"
          title="Turn the pre-run readiness checks back on"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
          Readiness checks off — enable
        </button>
      </Panel>
    );
  }

  if (nodes.length === 0) return null; // nothing to check on an empty canvas

  const errors = items.filter((i) => i.severity === "error");
  const warnings = items.filter((i) => i.severity === "warning");
  const infos = items.filter((i) => i.severity === "info");
  const ready = errors.length === 0 && warnings.length === 0;

  const status = errors.length
    ? { dot: "#ef4444", text: `${errors.length} blocking${warnings.length ? ` · ${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : ""}`, ring: "#ef4444" }
    : warnings.length
    ? { dot: "#f59e0b", text: `${warnings.length} warning${warnings.length > 1 ? "s" : ""}`, ring: "#f59e0b" }
    : { dot: "#22c55e", text: "Ready to run", ring: "#22c55e" };

  const iconFor = (s: ReadinessItem["severity"]) =>
    s === "error" ? "⛔" : s === "warning" ? "⚠️" : "ℹ️";

  return (
    <Panel position="top-left" style={{ margin: 8 }}>
      <div
        style={{ borderColor: status.ring }}
        className="w-[300px] max-w-[80vw] rounded-lg border-2 bg-background/95 backdrop-blur-sm shadow-lg text-foreground"
      >
        {/* Header: collapse-toggle on the left, disable (×) on the right */}
        <div className="w-full flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 flex-1 text-left min-w-0"
            title={open ? "Collapse readiness panel" : "Expand readiness panel"}
          >
            <span
              style={{ backgroundColor: status.dot }}
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
            />
            <span className="text-xs font-semibold flex-1 truncate">
              {ready ? "Workflow ready" : "Workflow readiness"}
            </span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{status.text}</span>
            <span className="text-[10px] text-muted-foreground ml-1">{open ? "▾" : "▸"}</span>
          </button>
          <button
            type="button"
            onClick={onToggleEnabled}
            className="text-muted-foreground hover:text-foreground text-sm leading-none px-1 shrink-0"
            title="Turn off the readiness checks"
          >
            ×
          </button>
        </div>

        {/* Body */}
        {open && (
          <div className="border-t border-border max-h-[45vh] overflow-y-auto">
            {ready ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
                ✓ All prerequisites met. No blocking issues or warnings detected — press{" "}
                <span className="font-semibold text-foreground">Run</span> to build.
              </p>
            ) : (
              <ul className="py-1">
                {[...errors, ...warnings, ...infos].map((item) => (
                  <li key={item.id} className="flex gap-2 px-3 py-1.5 items-start hover:bg-muted/60">
                    <span className="text-[11px] leading-4 shrink-0">{iconFor(item.severity)}</span>
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        disabled={!item.nodeId}
                        onClick={() => item.nodeId && onFocusNode(item.nodeId)}
                        className={`text-[11px] leading-snug text-left ${
                          item.nodeId ? "cursor-pointer hover:underline" : "cursor-default"
                        }`}
                        title={item.nodeId ? `Go to node ${item.nodeId}` : undefined}
                      >
                        {item.message}
                        {item.nodeId && (
                          <span className="text-[9px] text-muted-foreground"> — go to node →</span>
                        )}
                      </button>
                      {item.fix && (
                        <div className="mt-1">
                          <button
                            type="button"
                            onClick={() => onApplyFix(item.fix!)}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition"
                            title={`One-click fix: ${item.fix.label}`}
                          >
                            ⚡ {item.fix.label}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-border px-3 py-1.5">
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                Blocking issues stop Run; warnings let it proceed but may affect results. Click an
                item to jump to its node.
              </p>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
