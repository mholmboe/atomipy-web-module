import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { XrdNode, type XrdNodeData } from "./XrdNode";

const reactFlowMocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  deleteElements: vi.fn(),
}));

vi.mock("@xyflow/react", () => {
  const MockHandle = ({ type }: { type?: string }) => <div data-testid={`handle-${type ?? "unknown"}`} />;
  return {
    Handle: MockHandle,
    Position: { Left: "left", Right: "right" },
    useReactFlow: () => ({
      updateNodeData: reactFlowMocks.updateNodeData,
      deleteElements: reactFlowMocks.deleteElements,
      getNode: () => ({ type: "xrd" }),
    }),
  };
});

const renderNode = (data: XrdNodeData = {}) => render(<XrdNode id="xrd-1" data={data} />);

describe("XrdNode", () => {
  beforeEach(() => {
    reactFlowMocks.updateNodeData.mockReset();
    reactFlowMocks.deleteElements.mockReset();
  });

  it("keeps Instrument visible and hides advanced controls until expanded", () => {
    renderNode();
    // Instrument is always shown.
    expect(screen.getByText("Instrument")).toBeInTheDocument();
    // Broadening / Miller controls live under the collapsible, hidden by default.
    expect(screen.queryByText(/Broadening/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Show \(hkl\) labels/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Advanced options/i }));

    expect(screen.getByText(/Broadening/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Show \(hkl\) labels/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Use Neutral Atoms/i)).toBeInTheDocument();
  });

  it("toggles the Miller-index labels flag", () => {
    renderNode();
    fireEvent.click(screen.getByRole("button", { name: /Advanced options/i }));
    fireEvent.click(screen.getByLabelText(/Show \(hkl\) labels/i));
    expect(reactFlowMocks.updateNodeData).toHaveBeenCalledWith(
      "xrd-1",
      expect.objectContaining({ showMiller: true }),
    );
  });

  it("clamps the supercell replication to a minimum of 1", () => {
    renderNode();
    fireEvent.click(screen.getByRole("button", { name: /Advanced options/i }));
    fireEvent.change(screen.getByLabelText("supercell nx"), { target: { value: "0" } });
    expect(reactFlowMocks.updateNodeData).toHaveBeenCalledWith(
      "xrd-1",
      expect.objectContaining({ superX: 1 }),
    );
  });

  it("renders Miller labels above peaks only when the flag is on", () => {
    // Spaced well apart so neither label is thinned out by the anti-overlap rule.
    const peaks = [
      { two_theta: 60.0, intensity: 1.0, hkl: [1, 0, 1], multiplicity: 6, superlattice: false },
      { two_theta: 20.0, intensity: 0.4, hkl: [1, 0, 0], multiplicity: 6, superlattice: false },
    ];
    const points: Array<[number, number]> = [
      [5, 0], [20.0, 0.4], [60.0, 1.0], [90, 0],
    ];

    const { rerender } = renderNode({ xrdPlot: { points, peaks } });
    // Labels off by default -> no (hkl) text drawn.
    expect(screen.queryByText("(101)")).not.toBeInTheDocument();

    rerender(<XrdNode id="xrd-1" data={{ showMiller: true, xrdPlot: { points, peaks } }} />);
    expect(screen.getByText("(101)")).toBeInTheDocument();
    expect(screen.getByText("(100)")).toBeInTheDocument();
  });

  it("labels a supercell peak with its scaled (reduced) index from the backend", () => {
    // The backend returns the scaled hkl in `hkl`; the node just renders it.
    const peaks = [
      { two_theta: 26.6, intensity: 1.0, hkl: [1, 0, 1], raw_hkl: [2, 0, 2], multiplicity: 6, superlattice: false },
    ];
    const points: Array<[number, number]> = [[5, 0], [26.6, 1.0], [90, 0]];
    renderNode({ showMiller: true, superX: 2, superY: 1, superZ: 2, xrdPlot: { points, peaks } });
    expect(screen.getByText("(101)")).toBeInTheDocument();
  });

  it("offers a peaks.csv download when peaks are present", () => {
    const peaks = [{ two_theta: 26.6, intensity: 1.0, hkl: [1, 0, 1], multiplicity: 6, superlattice: false }];
    const points: Array<[number, number]> = [[5, 0], [26.6, 1.0], [90, 0]];
    renderNode({ xrdPlot: { points, peaks } });
    expect(screen.getByRole("button", { name: /peaks\.csv/i })).toBeInTheDocument();
  });
});
