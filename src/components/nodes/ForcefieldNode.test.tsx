import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ForcefieldNode } from "./ForcefieldNode";

const reactFlowMocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  deleteElements: vi.fn(),
}));

vi.mock("@xyflow/react", () => {
  const MockHandle = ({ type }: { type?: string }) => <div data-testid={`handle-${type ?? "unknown"}`} />;

  return {
    Handle: MockHandle,
    Position: {
      Left: "left",
      Right: "right",
    },
    useReactFlow: () => ({
      updateNodeData: reactFlowMocks.updateNodeData,
      deleteElements: reactFlowMocks.deleteElements,
    }),
  };
});

type ForcefieldTestData = {
  forcefield?: "minff" | "clayff";
  log?: boolean;
  logFile?: string;
  resetMolid?: boolean;
  status?: string;
  rmaxLong?: number;
  rmaxH?: number;
};

const renderNode = (data: ForcefieldTestData = {}) => render(<ForcefieldNode id="force-1" data={data} />);

describe("ForcefieldNode", () => {
  beforeEach(() => {
    reactFlowMocks.updateNodeData.mockReset();
    reactFlowMocks.deleteElements.mockReset();
  });

  it("shows defaults and reveals advanced options on demand", () => {
    renderNode();

    expect(screen.getByRole("combobox")).toHaveValue("minff");
    expect(screen.queryByLabelText(/Write typing log/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /More options/i }));

    expect(screen.getByLabelText(/Reset MolID/i)).toBeChecked();
    expect(screen.getByLabelText(/Write typing log/i)).not.toBeChecked();
  });

  it("updates derived log filename when changing forcefield from default log name", () => {
    renderNode({ forcefield: "minff", log: true, logFile: "minff.log" });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "clayff" } });

    expect(reactFlowMocks.updateNodeData).toHaveBeenCalledWith("force-1", {
      forcefield: "clayff",
      log: true,
      logFile: "clayff.log",
    });
  });

  it("preserves custom log filename when changing forcefield", () => {
    renderNode({ forcefield: "minff", log: true, logFile: "custom-forcefield.log" });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "clayff" } });

    expect(reactFlowMocks.updateNodeData).toHaveBeenCalledWith("force-1", {
      forcefield: "clayff",
      log: true,
      logFile: "custom-forcefield.log",
    });
  });

  it("enables log output with scheme-based default filename when missing", () => {
    renderNode({ forcefield: "clayff" });

    fireEvent.click(screen.getByRole("button", { name: /More options/i }));
    fireEvent.click(screen.getByLabelText(/Write typing log/i));

    expect(reactFlowMocks.updateNodeData).toHaveBeenCalledWith("force-1", {
      forcefield: "clayff",
      log: true,
      logFile: "clayff.log",
    });
  });

  it("shows fallback log filename in UI when logging is enabled without explicit filename", () => {
    renderNode({ forcefield: "clayff", log: true });

    fireEvent.click(screen.getByRole("button", { name: /More options/i }));

    expect(screen.getByPlaceholderText("e.g. forcefield.log")).toHaveValue("clayff.log");
  });

  it("deletes node through node header action", () => {
    renderNode();

    fireEvent.click(screen.getByTitle("Delete Node"));

    expect(reactFlowMocks.deleteElements).toHaveBeenCalledWith({ nodes: [{ id: "force-1" }] });
  });
});
