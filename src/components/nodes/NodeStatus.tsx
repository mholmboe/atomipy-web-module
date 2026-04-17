import React from "react";
import { CheckCircle2, CircleDashed, AlertCircle, Loader2 } from "lucide-react";

export type NodeStatusType = "idle" | "running" | "success" | "error";

interface NodeStatusProps {
  status?: NodeStatusType;
}

export function NodeStatus({ status }: NodeStatusProps) {
  if (!status || status === "idle") return null;

  return (
    <div className="absolute -top-3 -right-3 z-50">
      <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 bg-background shadow-lg transition-all duration-300 scale-110`}>
        {status === "running" && (
          <div className="relative flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <div className="absolute inset-0 w-5 h-5 bg-blue-500 rounded-full animate-ping opacity-20" />
          </div>
        )}
        {status === "success" && (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" />
        )}
        {status === "error" && (
          <AlertCircle className="w-5 h-5 text-red-500 fill-red-50" />
        )}
      </div>
    </div>
  );
}
