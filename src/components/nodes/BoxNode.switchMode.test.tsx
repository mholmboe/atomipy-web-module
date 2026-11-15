import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BoxNode } from "./BoxNode";

// Regression: toggling the Cell / Box Dim tabs on an EMPTY box must not
// fabricate a 50³ box. A crystal structure has no static cell to seed from, so
// its downstream Box starts empty (pass-through); a bare tab toggle used to
// write a=b=c=50 via `?? 50` fallbacks, which then overrode the real upstream
// cell (wrong XRD) and could not be re-seeded.

const rf = vi.hoisted(() => ({ updateNodeData: vi.fn(), setNodes: vi.fn(), deleteElements: vi.fn() }));

let nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
let edges: Array<{ id: string; source: string; target: string }>;

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

const CELL_KEYS = ["a", "b", "c"] as const;
const DIM_KEYS = ["lx", "ly", "lz"] as const;

describe("BoxNode mode toggle does not fabricate a box", () => {
  beforeEach(() => {
    rf.updateNodeData.mockReset();
    nodes = [{ id: "box", type: "box", data: { inputMode: "cell" } }];
    edges = [];
  });

  it("switching Cell -> Box Dim on an empty box leaves lx/ly/lz unset", () => {
    render(<BoxNode id="box" data={nodes[0].data} />);
    fireEvent.click(screen.getByText("Box Dim"));
    const call = rf.updateNodeData.mock.calls.find((c) => c[0] === "box");
    expect(call).toBeTruthy();
    const pushed = call![1] as Record<string, unknown>;
    expect(pushed.inputMode).toBe("box_dim");
    for (const k of DIM_KEYS) expect(pushed[k]).toBeUndefined();
  });

  it("switching Box Dim -> Cell on an empty box leaves a/b/c unset", () => {
    nodes[0].data = { inputMode: "box_dim" };
    render(<BoxNode id="box" data={nodes[0].data} />);
    fireEvent.click(screen.getByText("Cell (abc/αβγ)"));
    const call = rf.updateNodeData.mock.calls.find((c) => c[0] === "box");
    expect(call).toBeTruthy();
    const pushed = call![1] as Record<string, unknown>;
    expect(pushed.inputMode).toBe("cell");
    for (const k of CELL_KEYS) expect(pushed[k]).toBeUndefined();
  });

  it("still CONVERTS real values when they are present", () => {
    nodes[0].data = { inputMode: "cell", a: 10, b: 12, c: 14, alpha: 90, beta: 90, gamma: 90 };
    render(<BoxNode id="box" data={nodes[0].data} />);
    fireEvent.click(screen.getByText("Box Dim"));
    const call = rf.updateNodeData.mock.calls.find((c) => c[0] === "box");
    const pushed = call![1] as Record<string, number>;
    expect(pushed.lx).toBeCloseTo(10, 4);
    expect(pushed.ly).toBeCloseTo(12, 4);
    expect(pushed.lz).toBeCloseTo(14, 4);
  });
});
