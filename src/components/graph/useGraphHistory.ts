import { useState, useCallback, useRef } from "react";
import type { Node, Edge } from "@xyflow/react";

interface HistoryState {
  nodes: Node[];
  edges: Edge[];
}

export function useGraphHistory(initialNodes: Node[], initialEdges: Edge[]) {
  const [history, setHistory] = useState<HistoryState[]>([
    { nodes: initialNodes, edges: initialEdges },
  ]);
  const [index, setIndex] = useState(0);
  const isActionFromHistory = useRef(false);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  const pushState = useCallback((nodes: Node[], edges: Edge[]) => {
    if (isActionFromHistory.current) {
      isActionFromHistory.current = false;
      return;
    }

    setHistory((prev) => {
      // Deep copy to prevent mutations by reference
      const nextNodes = JSON.parse(JSON.stringify(nodes));
      const nextEdges = JSON.parse(JSON.stringify(edges));
      
      const newHistory = prev.slice(0, index + 1);
      
      // Prevent duplicate states
      const current = newHistory[newHistory.length - 1];
      if (
        current &&
        JSON.stringify(current.nodes) === JSON.stringify(nextNodes) &&
        JSON.stringify(current.edges) === JSON.stringify(nextEdges)
      ) {
        return prev;
      }

      newHistory.push({ nodes: nextNodes, edges: nextEdges });
      
      // Limit history to 50 states
      if (newHistory.length > 50) {
        newHistory.shift();
        setIndex(newHistory.length - 1);
      } else {
        setIndex(newHistory.length - 1);
      }
      return newHistory;
    });
  }, [index]);

  const undo = useCallback((setNodes: any, setEdges: any) => {
    if (!canUndo) return;
    isActionFromHistory.current = true;
    const prevIndex = index - 1;
    const prevState = history[prevIndex];
    setNodes(JSON.parse(JSON.stringify(prevState.nodes)));
    setEdges(JSON.parse(JSON.stringify(prevState.edges)));
    setIndex(prevIndex);
  }, [canUndo, index, history]);

  const redo = useCallback((setNodes: any, setEdges: any) => {
    if (!canRedo) return;
    isActionFromHistory.current = true;
    const nextIndex = index + 1;
    const nextState = history[nextIndex];
    setNodes(JSON.parse(JSON.stringify(nextState.nodes)));
    setEdges(JSON.parse(JSON.stringify(nextState.edges)));
    setIndex(nextIndex);
  }, [canRedo, index, history]);

  const resetHistory = useCallback((nodes: Node[], edges: Edge[]) => {
    setHistory([{ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }]);
    setIndex(0);
  }, []);

  return {
    undo,
    redo,
    pushState,
    resetHistory,
    canUndo,
    canRedo,
  };
}
