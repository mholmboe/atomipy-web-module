import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { BoxNode } from "./BoxNode";

// Fix B: a crystal carries no static preset metrics (its cell lives in the CIF),
// so the Structure node fetches the cell on selection and stores it as
// `cellMetrics`. The Box must then DISPLAY that cell — scaled by an intervening
// Replicate — instead of falling back to "auto".

const rf = vi.hoisted(() => ({ updateNodeData: vi.fn(), setNodes: vi.fn(), deleteElements: vi.fn() }));

let nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
let edges: Array<{ id: string; source: string; target: string; targetHandle?: string }>;

vi.mock("@xyflow/react", () => ({
  Handle: ({ type }: { type?: string }) => <div data-testid={`handle-${type ?? "x"}`} />,
  Position: { Left: "left", Right: "right" },
  useEdges: () => edges,
  useNodes: () => nodes,
  useReactFlow: () => ({
    updateNodeData: rf.updateNodeData,
    setNodes: rf.setNodes,
    deleteElements: rf.deleteElements,
    getNode: (id: string) => nodes.find((n) => n.id === id),
  }),
}));

describe("BoxNode seeds from a crystal's fetched cellMetrics", () => {
  beforeEach(() => {
    rf.updateNodeData.mockReset();
  });

  it("displays the replicated cell for structure -> replicate -> box", () => {
    // alpha-quartz 2x2x4: 4.91239,4.91239,5.40385 / 90,90,120.
    nodes = [
      { id: "struct", type: "structure", data: { source: "library", librarySource: "crystal", value: "oxides/SiO2-Quartz-alpha.cif", cellMetrics: { a: 4.91239, b: 4.91239, c: 5.40385, alpha: 90, beta: 90, gamma: 120 } } },
      { id: "rep", type: "replicate", data: { x: 2, y: 2, z: 4 } },
      { id: "box", type: "box", data: { inputMode: "cell" } },
    ];
    edges = [
      { id: "e1", source: "struct", target: "rep", targetHandle: "inA" },
      { id: "e2", source: "rep", target: "box", targetHandle: "inA" },
    ];

    render(<BoxNode id="box" data={nodes[2].data} />);

    const call = rf.updateNodeData.mock.calls.find((c) => c[0] === "box");
    expect(call).toBeTruthy();
    const pushed = call![1] as Record<string, number>;
    expect(pushed.a).toBeCloseTo(4.91239 * 2, 3);
    expect(pushed.b).toBeCloseTo(4.91239 * 2, 3);
    expect(pushed.c).toBeCloseTo(5.40385 * 4, 3);
    expect(pushed.gamma).toBeCloseTo(120, 3);
  });

  it("leaves the box auto when the crystal has no cellMetrics yet", () => {
    nodes = [
      { id: "struct", type: "structure", data: { source: "library", librarySource: "crystal", value: "oxides/SiO2-Quartz-alpha.cif" } },
      { id: "box", type: "box", data: { inputMode: "cell" } },
    ];
    edges = [{ id: "e1", source: "struct", target: "box", targetHandle: "inA" }];

    render(<BoxNode id="box" data={nodes[1].data} />);

    // No metrics upstream and no run-time PDB -> nothing to seed, box stays empty.
    const call = rf.updateNodeData.mock.calls.find((c) => c[0] === "box");
    expect(call).toBeFalsy();
  });
});
