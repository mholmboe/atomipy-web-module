import { createContext, useContext } from "react";

// Per-node run status + error message, provided by VisualBuilder and consumed by
// NodeHeader so every node can show a red error strip without per-node wiring.
export type NodeRunStatusValue = {
  status: Record<string, string>;   // nodeId -> "queued" | "running" | "done" | "error" | "skipped"
  errors: Record<string, string>;   // nodeId -> short error message (only when status === "error")
};

export const NodeRunStatusContext = createContext<NodeRunStatusValue>({ status: {}, errors: {} });

export const useNodeRunStatus = () => useContext(NodeRunStatusContext);
