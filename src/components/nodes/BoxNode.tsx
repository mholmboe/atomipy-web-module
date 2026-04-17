import React, { useEffect } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Box } from "lucide-react";
import type { NodeComponentProps, PresetOption } from "./types";

type BoxNodeData = {
  a?: number;
  b?: number;
  c?: number;
  alpha?: number;
  beta?: number;
  gamma?: number;
};

export function BoxNode({ id, data }: NodeComponentProps<BoxNodeData>) {
  const { updateNodeData, getEdges, getNode } = useReactFlow();

  useEffect(() => {
    const missing = (value: number | undefined) => !(typeof value === "number" && Number.isFinite(value));
    const hasValue = (value: number | undefined) => typeof value === "number" && Number.isFinite(value);

    type BoxSeed = Partial<BoxNodeData>;

    const findSeedFromPresetData = (sourceData: {
      source?: string;
      value?: string;
      presets?: PresetOption[];
      x?: number;
      y?: number;
      z?: number;
    }): BoxSeed | null => {
      const presets = sourceData.presets;
      const value = sourceData.value;
      const sourceKind = sourceData.source;
      const canUsePreset = sourceKind === "preset" || sourceKind === undefined;
      if (!canUsePreset || !value || !Array.isArray(presets)) {
        return null;
      }

      const selectedPreset = presets.find((preset) => preset.fileName === value);
      const metrics = selectedPreset?.metrics;
      if (!metrics) {
        return null;
      }

      return {
        a: metrics.a ?? undefined,
        b: metrics.b ?? undefined,
        c: metrics.c ?? undefined,
        alpha: metrics.alpha ?? undefined,
        beta: metrics.beta ?? undefined,
        gamma: metrics.gamma ?? undefined,
      };
    };

    const mergeSeed = (base: BoxSeed | null, extra: BoxSeed): BoxSeed => {
      return {
        a: hasValue(extra.a) ? extra.a : base?.a,
        b: hasValue(extra.b) ? extra.b : base?.b,
        c: hasValue(extra.c) ? extra.c : base?.c,
        alpha: hasValue(extra.alpha) ? extra.alpha : base?.alpha,
        beta: hasValue(extra.beta) ? extra.beta : base?.beta,
        gamma: hasValue(extra.gamma) ? extra.gamma : base?.gamma,
      };
    };

    const getPrimaryInputSource = (targetNodeId: string) => {
      const incoming = getEdges().filter((edge) => edge.target === targetNodeId);
      if (incoming.length === 0) return null;
      const inA = incoming.find((edge) => edge.targetHandle === "inA");
      return (inA ?? incoming[0]).source;
    };

    const inferSeedFromNode = (nodeId: string, visited = new Set<string>()): BoxSeed | null => {
      if (visited.has(nodeId)) return null;
      visited.add(nodeId);

      const node = getNode(nodeId);
      if (!node) return null;

      const nodeData = (node.data ?? {}) as Record<string, unknown>;

      if (node.type === "structure" || node.type === "preset") {
        return findSeedFromPresetData(nodeData as { source?: string; value?: string; presets?: PresetOption[] });
      }

      if (node.type === "box") {
        const own = nodeData as BoxNodeData;
        const upstream = getPrimaryInputSource(node.id);
        const upstreamSeed = upstream ? inferSeedFromNode(upstream, visited) : null;
        return mergeSeed(upstreamSeed, own);
      }

      if (node.type === "replicate") {
        const upstream = getPrimaryInputSource(node.id);
        const parentSeed = upstream ? inferSeedFromNode(upstream, visited) : null;
        if (!parentSeed) return null;
        const rx = hasValue(nodeData.x as number) ? Math.max(1, Number(nodeData.x)) : 1;
        const ry = hasValue(nodeData.y as number) ? Math.max(1, Number(nodeData.y)) : 1;
        const rz = hasValue(nodeData.z as number) ? Math.max(1, Number(nodeData.z)) : 1;
        return {
          a: hasValue(parentSeed.a) ? parentSeed.a! * rx : undefined,
          b: hasValue(parentSeed.b) ? parentSeed.b! * ry : undefined,
          c: hasValue(parentSeed.c) ? parentSeed.c! * rz : undefined,
          alpha: parentSeed.alpha,
          beta: parentSeed.beta,
          gamma: parentSeed.gamma,
        };
      }

      if (node.type === "scale") {
        const upstream = getPrimaryInputSource(node.id);
        const parentSeed = upstream ? inferSeedFromNode(upstream, visited) : null;
        if (!parentSeed) return null;
        const sx = hasValue(nodeData.sx as number) ? Number(nodeData.sx) : 1;
        const sy = hasValue(nodeData.sy as number) ? Number(nodeData.sy) : 1;
        const sz = hasValue(nodeData.sz as number) ? Number(nodeData.sz) : 1;
        return {
          a: hasValue(parentSeed.a) ? parentSeed.a! * sx : undefined,
          b: hasValue(parentSeed.b) ? parentSeed.b! * sy : undefined,
          c: hasValue(parentSeed.c) ? parentSeed.c! * sz : undefined,
          alpha: parentSeed.alpha,
          beta: parentSeed.beta,
          gamma: parentSeed.gamma,
        };
      }

      // For transform/metadata nodes that do not change box dimensions, pass through upstream seed.
      const passthroughTypes = new Set([
        "position",
        "rotate",
        "wrap",
        "addIons",
        "solvate",
        "bondAngle",
        "bvs",
        "slice",
        "insert",
        "substitute",
        "fuse",
        "resname",
        "molecule",
        "merge",
        "add",
      ]);
      if (passthroughTypes.has(node.type ?? "")) {
        const upstream = getPrimaryInputSource(node.id);
        return upstream ? inferSeedFromNode(upstream, visited) : null;
      }

      return null;
    };

    const hasMissingField =
      missing(data.a) ||
      missing(data.b) ||
      missing(data.c) ||
      missing(data.alpha) ||
      missing(data.beta) ||
      missing(data.gamma);

    if (!hasMissingField) {
      return;
    }

    const incomingEdge = getEdges().find((edge) => edge.target === id);
    if (!incomingEdge) {
      return;
    }

    const sourceNodeId = incomingEdge.source;
    const seed = inferSeedFromNode(sourceNodeId);
    if (!seed) {
      return;
    }

    const nextData: BoxNodeData = {
      a: missing(data.a) ? seed.a : data.a,
      b: missing(data.b) ? seed.b : data.b,
      c: missing(data.c) ? seed.c : data.c,
      alpha: missing(data.alpha) ? seed.alpha : data.alpha,
      beta: missing(data.beta) ? seed.beta : data.beta,
      gamma: missing(data.gamma) ? seed.gamma : data.gamma,
    };

    const hasChanged =
      nextData.a !== data.a ||
      nextData.b !== data.b ||
      nextData.c !== data.c ||
      nextData.alpha !== data.alpha ||
      nextData.beta !== data.beta ||
      nextData.gamma !== data.gamma;

    if (hasChanged) {
      updateNodeData(id, { ...data, ...nextData });
    }
  }, [data, getEdges, getNode, id, updateNodeData]);

  const handleChange = (field: keyof BoxNodeData, value: number) => {
    updateNodeData(id, { ...data, [field]: value });
  };

  return (
    <div className="bg-card w-[260px] shadow-lg rounded-xl border border-indigo-500/50 overflow-hidden font-sans select-none">
      <Handle type="target" position={Position.Left} id="in" className="w-3 h-3 bg-secondary" />
      
      <div className="bg-indigo-500/10 p-3 border-b border-border flex items-center gap-2">
        <Box className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-foreground m-0">Set System Box</h3>
      </div>
      
      <div className="p-4 space-y-3 bg-background">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-center h-4">a</label>
            <input 
              type="number" step="0.1"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              placeholder="50.0"
              value={data.a || ""}
              onChange={(e) => handleChange("a", parseFloat(e.target.value))}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-center h-4">b</label>
            <input 
              type="number" step="0.1"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              placeholder="50.0"
              value={data.b || ""}
              onChange={(e) => handleChange("b", parseFloat(e.target.value))}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-center h-4">c</label>
            <input 
              type="number" step="0.1"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              placeholder="50.0"
              value={data.c || ""}
              onChange={(e) => handleChange("c", parseFloat(e.target.value))}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] font-bold text-muted-foreground flex items-center justify-center h-4">α</label>
            <input 
              type="number" step="0.1"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              placeholder="90"
              value={data.alpha || ""}
              onChange={(e) => handleChange("alpha", parseFloat(e.target.value))}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground flex items-center justify-center h-4">β</label>
            <input 
              type="number" step="0.1"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              placeholder="90"
              value={data.beta || ""}
              onChange={(e) => handleChange("beta", parseFloat(e.target.value))}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground flex items-center justify-center h-4">γ</label>
            <input 
              type="number" step="0.1"
              className="nodrag w-full text-center text-xs bg-muted border border-border rounded-md py-1"
              placeholder="90"
              value={data.gamma || ""}
              onChange={(e) => handleChange("gamma", parseFloat(e.target.value))}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <div className="text-[10px] text-muted-foreground italic text-center mt-2">
          Note: If fields are empty, uses upstream structure/replicate box when available; otherwise falls back to 50,50,50 / 90,90,90.
        </div>
      </div>
      
      <Handle type="source" position={Position.Right} id="out" className="w-3 h-3 bg-primary" />
    </div>
  );
}
