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
] as const;

export const STRUCTURE_FILE_ACCEPT = ALLOWED_STRUCTURE_EXTENSIONS.map((ext) => `.${ext}`).join(",");

// Trajectory formats accepted by ap.import_traj: multi-frame pdb/gro, GROMACS xtc/trr,
// and dcd (the last via the optional mdtraj backend).
export const ALLOWED_TRAJECTORY_EXTENSIONS = ["pdb", "gro", "xtc", "trr", "dcd"] as const;
export const TRAJECTORY_FILE_ACCEPT = ALLOWED_TRAJECTORY_EXTENSIONS.map((ext) => `.${ext}`).join(",");

const structureExtension = (filename: string) => filename.split(".").pop()?.toLowerCase() || "";

export const isSupportedStructureFile = (filename: string): boolean =>
  ALLOWED_STRUCTURE_EXTENSIONS.includes(structureExtension(filename) as (typeof ALLOWED_STRUCTURE_EXTENSIONS)[number]);

export const isSupportedTrajectoryFile = (filename: string): boolean =>
  ALLOWED_TRAJECTORY_EXTENSIONS.includes(structureExtension(filename) as (typeof ALLOWED_TRAJECTORY_EXTENSIONS)[number]);

// xtc/trr/dcd carry no atom names, so they need a companion topology (a structure file).
export const trajectoryNeedsTopology = (filename: string): boolean =>
  ["xtc", "trr", "dcd"].includes(structureExtension(filename));

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

const postUpload = async (file: File): Promise<StructureUploadResult> => {
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

export const uploadStructureFile = async (file: File): Promise<StructureUploadResult> => {
  if (!isSupportedStructureFile(file.name)) {
    throw new Error("Unsupported file format.");
  }
  return postUpload(file);
};

export const uploadTrajectoryFile = async (file: File): Promise<StructureUploadResult> => {
  if (!isSupportedTrajectoryFile(file.name)) {
    throw new Error("Unsupported trajectory format (use pdb/gro/xtc/trr/dcd).");
  }
  return postUpload(file);
};
