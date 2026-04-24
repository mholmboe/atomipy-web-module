export type StructureUploadResult = {
  filename: string;
  originalName: string;
  path?: string;
};

export const ALLOWED_STRUCTURE_EXTENSIONS = [
  "pdb",
  "gro",
  "xyz",
  "cif",
  "mmcif",
  "mcif",
  "pqr",
  "poscar",
  "contcar",
  "sdf",
] as const;

export const STRUCTURE_FILE_ACCEPT = ALLOWED_STRUCTURE_EXTENSIONS.map((ext) => `.${ext}`).join(",");

const structureExtension = (filename: string) => filename.split(".").pop()?.toLowerCase() || "";

export const isSupportedStructureFile = (filename: string): boolean =>
  ALLOWED_STRUCTURE_EXTENSIONS.includes(structureExtension(filename) as (typeof ALLOWED_STRUCTURE_EXTENSIONS)[number]);

const readUploadError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // Fall back to status text below.
  }

  return response.statusText || `Upload failed with status ${response.status}`;
};

export const uploadStructureFile = async (file: File): Promise<StructureUploadResult> => {
  if (!isSupportedStructureFile(file.name)) {
    throw new Error("Unsupported file format.");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readUploadError(response));
  }

  const result = (await response.json()) as Partial<StructureUploadResult>;
  if (!result.filename) {
    throw new Error("Upload response did not include a stored filename.");
  }

  return {
    filename: result.filename,
    originalName: result.originalName || file.name,
    path: result.path,
  };
};
