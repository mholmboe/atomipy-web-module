import type { Connection } from "@xyflow/react";

export function isValidConnection(connection: Connection): boolean {
  const sourceHandle = connection.sourceHandle;
  const targetHandle = connection.targetHandle;
  if (!sourceHandle || !targetHandle) return false;
  
  // Prevent self-connections
  if (connection.source === connection.target) return false;

  // Rule 1: 'data' (data-out) handle can ONLY connect to 'data-in' or 'in' of plot node
  if (sourceHandle === "data") {
    return targetHandle === "data-in" || targetHandle === "in";
  }
  
  // Rule 2: 'trajectory-out' or 'traj-out' can ONLY connect to 'trajectory-in' or 'traj-in'
  if (sourceHandle === "trajectory-out" || sourceHandle === "traj-out" || sourceHandle === "traj") {
    return targetHandle === "trajectory-in" || targetHandle === "traj-in" || targetHandle === "in";
  }

  // Rule 3: structure-out handles (like out) cannot connect to data-in or trajectory-in
  if (sourceHandle === "out" || sourceHandle === "structure-out") {
    return targetHandle !== "data-in" && targetHandle !== "trajectory-in" && targetHandle !== "traj-in";
  }

  return true;
}
