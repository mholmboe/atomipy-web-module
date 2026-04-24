import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STRUCTURE_FILE_ACCEPT,
  isSupportedStructureFile,
  uploadStructureFile,
} from "./uploads";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("structure upload helpers", () => {
  it("keeps frontend accepted extensions aligned with backend structure formats", () => {
    expect(isSupportedStructureFile("sample.pdb")).toBe(true);
    expect(isSupportedStructureFile("sample.GRO")).toBe(true);
    expect(isSupportedStructureFile("sample.mmcif")).toBe(true);
    expect(isSupportedStructureFile("sample.contcar")).toBe(true);
    expect(isSupportedStructureFile("sample.exe")).toBe(false);
    expect(STRUCTURE_FILE_ACCEPT).toContain(".pdb");
    expect(STRUCTURE_FILE_ACCEPT).toContain(".contcar");
  });

  it("uploads a valid structure file and normalizes the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          filename: "stored_123.pdb",
          originalName: "custom.pdb",
          path: "/uploads/stored_123.pdb",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadStructureFile(new File(["ATOM"], "custom.pdb"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
    expect(result).toEqual({
      filename: "stored_123.pdb",
      originalName: "custom.pdb",
      path: "/uploads/stored_123.pdb",
    });
  });

  it("surfaces backend upload errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Unsupported extension '.exe'" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(uploadStructureFile(new File(["bad"], "custom.pdb"))).rejects.toThrow(
      "Unsupported extension '.exe'",
    );
  });

  it("rejects unsupported files before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadStructureFile(new File(["bad"], "custom.exe"))).rejects.toThrow(
      "Unsupported file format.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
