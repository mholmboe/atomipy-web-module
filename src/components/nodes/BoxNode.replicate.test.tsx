import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { BoxNode } from "./BoxNode";

// Graph under test:  Import(struct, has CRYST1 pdb) -> Box1 -> Replicate(4x2x2) -> Box2
// Bug: Box2 (directly after Replicate) showed the *un-replicated* cell because the
// cached-PDB lookup ignored the Replicate factor. Box2 should show 4x/2x/2x the cell
// and 16x the atom count.

const rf = vi.hoisted(() => ({ updateNodeData: vi.fn(), setNodes: vi.fn(), deleteElements: vi.fn() }));

// One-cell PDB: a=5.31 b=9.21 c=10.13, alpha=90 beta=100.17 gamma=90, with 2 atoms.
const cryst1 =
  "CRYST1" +
  (5.31).toFixed(3).padStart(9) +
  (9.21).toFixed(3).padStart(9) +
  (10.13).toFixed(3).padStart(9) +
  (90).toFixed(2).padStart(7) +
  (100.17).toFixed(2).padStart(7) +
  (90).toFixed(2).padStart(7) +
  " P 1           1";
const atom = (serial: number, el: string, name: string) =>
  "ATOM  " + String(serial).padStart(5) + " " + name.padEnd(4) + " MOL     1    " +
  "   0.000   0.000   0.000  1.00  0.00          " + el.padStart(2);
const PDB = [cryst1, atom(1, "SI", "SI"), atom(2, "O", "O"), "END"].join("\n");

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
    getNode: (nodeId: string) => nodes.find((n) => n.id === nodeId),
  }),
}));

describe("BoxNode reacts to an upstream Replicate", () => {
  beforeEach(() => {
    rf.updateNodeData.mockReset();
    nodes = [
      { id: "imp", type: "structure", data: { source: "file", pdb: PDB } },
      { id: "box1", type: "box", data: { inputMode: "cell" } },
      { id: "rep", type: "replicate", data: { x: 4, y: 2, z: 2 } },
      { id: "box2", type: "box", data: { inputMode: "cell" } },
    ];
    edges = [
      { id: "e1", source: "imp", target: "box1" },
      { id: "e2", source: "box1", target: "rep" },
      { id: "e3", source: "rep", target: "box2" },
    ];
  });

  it("seeds Box2 with the REPLICATED cell (4x2x2), not the base cell", () => {
    render(<BoxNode id="box2" data={nodes[3].data} />);

    // The auto-seed effect should push the replicated dims to Box2.
    const call = rf.updateNodeData.mock.calls.find((c) => c[0] === "box2");
    expect(call, "Box2 should be auto-seeded from upstream").toBeTruthy();
    const pushed = call![1] as Record<string, number>;
    expect(pushed.a).toBeCloseTo(5.31 * 4, 2);   // 21.24
    expect(pushed.b).toBeCloseTo(9.21 * 2, 2);   // 18.42
    expect(pushed.c).toBeCloseTo(10.13 * 2, 2);  // 20.26
  });

  it("counts the REPLICATED atom total (2 atoms x 16 cells = 32) in the density readout", () => {
    // Give Box2 the replicated dims so the density block (which shows the count) renders.
    nodes[3].data = { inputMode: "cell", a: 21.24, b: 18.42, c: 20.26, alpha: 90, beta: 100.17, gamma: 90 };
    const { container } = render(<BoxNode id="box2" data={nodes[3].data} />);
    expect(container.textContent).toMatch(/32 atoms/);
  });

  it("does NOT replicate a Box placed BEFORE the Replicate node", () => {
    render(<BoxNode id="box1" data={nodes[1].data} />);
    const call = rf.updateNodeData.mock.calls.find((c) => c[0] === "box1");
    expect(call).toBeTruthy();
    const pushed = call![1] as Record<string, number>;
    expect(pushed.a).toBeCloseTo(5.31, 2);  // base cell, unreplicated
    expect(pushed.b).toBeCloseTo(9.21, 2);
    expect(pushed.c).toBeCloseTo(10.13, 2);
  });
});
