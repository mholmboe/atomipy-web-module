import { useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type NodeHelp = {
  title: string;
  summary: string;
  features?: string[];
  /** Short prose on the algorithm / theory behind the node. */
  theory?: string[];
  /** Equations rendered in a monospace block (label optional). */
  equations?: { label?: string; expr: string }[];
  quirks?: string[];
  before?: string[];
  after?: string[];
  tips?: string[];
};

/**
 * Per-node help content, keyed by the node's React Flow `type`. NodeHeader
 * auto-derives the key from the node type, so a node shows the help (?) icon
 * as soon as it has an entry here. Style: compact, complete, no references to
 * external tools; include a "How it works" (theory + equations) where there's
 * real math.
 */
export const NODE_HELP: Record<string, NodeHelp> = {
  box: {
    title: "Set System Box",
    summary:
      "Defines or overrides the periodic simulation box (unit cell) carried by the system. Downstream steps that need periodicity — solvation, ion placement, PBC wrapping, force fields and MD — read this box.",
    features: [
      "Three modes: Cell (a, b, c, α, β, γ), Box_dim (lx, ly, lz, xy, xz, yz), and Fit to mol (size the box to the structure plus a margin).",
      "Live two-way conversion between Cell and Box_dim.",
      "Auto-seeds from the upstream structure's box and follows changes to it.",
      "Fit to mol adds a margin on every side, with optional Cubic (a = b = c) and Center molecule.",
      "Passes the box through downstream passthrough nodes.",
    ],
    theory: [
      "Cell and Box_dim are two forms of the same periodic box, interconverted using the lower-triangular box convention (a along x).",
      "Fit to mol: each edge = atomic extent + 2 × padding; Cubic uses the largest edge for all three; Center shifts atoms so the box centre and molecule centre coincide.",
    ],
    equations: [
      { label: "Cell → Box_dim", expr: "lx = a" },
      { expr: "xy = b·cos γ" },
      { expr: "ly = √(b² − xy²)" },
      { expr: "xz = c·cos β" },
      { expr: "yz = (b·c·cos α − xy·xz) / ly" },
      { expr: "lz = √(c² − xz² − yz²)" },
      { label: "Box_dim → Cell", expr: "a = lx" },
      { expr: "b = √(ly² + xy²)" },
      { expr: "c = √(lz² + xz² + yz²)" },
      { expr: "α = arccos[(xy·xz + ly·yz) / (b·c)]" },
      { expr: "β = arccos(xz / c)" },
      { expr: "γ = arccos(xy / b)" },
    ],
    quirks: [
      "Fit-to-mol padding is per side — the box grows by 2 × padding per axis.",
      "Center molecule (default on) recenters atoms in the new box; turn it off to keep coordinates.",
      "Cubic uses the largest extent + padding for all three edges.",
      "Non-90° angles give a triclinic (tilted) box; very skewed boxes (which must satisfy e.g. lx ≥ 2|xy|) can be rejected by the simulation engine.",
      "Set a box before solvation, PBC or simulation — those steps need one.",
      "Auto-seeding: library presets fill the cell fields from their known metrics; for crystals/uploads the fields stay empty (shown as “auto”) and inherit the structure's real box at build time — an empty field is NOT 50, it just isn't overridden.",
    ],
    before: [
      "Import Structure — provides the initial atoms (and often an initial box).",
      "Replicate — build the supercell first, then size or override the box.",
      "Spatial Ops (position / rotate / scale) — fix geometry before locking the box.",
    ],
    after: [
      "Solvent — needs a defined box to fill with water.",
      "Ions — places ions within the box.",
      "PBC Tools — wrap / unwrap / condense use the box.",
      "Forcefield / Simulate — MD requires a periodic box.",
      "Export — writes the box into the output coordinates.",
    ],
    tips: [
      "A lone organic molecule often arrives with a large default box — use Fit to mol to shrink it before solvating.",
      "Use Box_dim to reproduce a box exactly; use Cell for crystallographic parameters.",
    ],
  },

  structure: {
    title: "Import Structure",
    summary:
      "Loads the starting structure for the workflow — almost always the FIRST node. Two tabs: Inorganic (custom file, built-in library, or Build lattice) and Organic (SMILES, file, or molecule library).",
    features: [
      "Inorganic tab: upload a Custom File, pick from the Library (MINFF presets plus a ~517-entry crystal library), or Build lattice from scratch.",
      "Build lattice — Preset: choose a Bravais lattice (sc, bcc, fcc, hcp, diamond, rock salt, fluorite, perovskite), set the lattice parameter a (and c for hcp), and name the element(s) for each species.",
      "Build lattice — Custom cell: enter the unit cell (a b c α β γ) and a fractional basis table (element, x, y, z); atoms are placed as literal P1 (no symmetry expansion yet). A supercell (nx·ny·nz) can be generated in either mode.",
      "Organic tab: build from a SMILES string, upload a file, or pick from a ~428-molecule library.",
      "Importable structure formats: .pdb, .gro, .xyz, .cif, .mmcif, .poscar, .contcar, .pqr, .cjson.",
      "Organic uploads (.mol, .mol2, .sdf) are routed to the GAFF/OpenFF parametrization path.",
      "Preview & Validate: the inorganic scan reports element count and flags elements with no built-in force-field type.",
    ],
    quirks: [
      "The inorganic scan checks force-field compatibility; flagged elements suggest setting the Forcefield node to the Dummy FF (a frozen, qualitative EM/NVT model).",
      "MINFF-preset library entries are force-field-ready; other crystal categories often need the Dummy FF.",
      "Build lattice presets define stoichiometry by species slot (e.g. rock salt cation:anion = 1:1, fluorite 1:2, perovskite A:B:X = 1:1:3); the Custom cell places exactly the basis you type.",
      "The Organic tab only generates/validates coordinates here — force-field assignment happens on the Forcefield node.",
    ],
    after: [
      "Set System Box — define or override periodicity if the file lacks a cell.",
      "Forcefield — assign atom types and charges (required before MD / topology export).",
      "Build, edit, analysis or viewer nodes, once a structure is loaded.",
    ],
    tips: [
      "Run Preview & Validate first — it catches missing cells and unsupported elements early.",
      "PDB/XYZ imports need a cell for any periodic operation; add a Set System Box node if it is missing.",
    ],
  },

  organic: {
    title: "Import Structure — Organic",
    summary:
      "The Organic tab of the Import Structure node. Defines a single molecule from a SMILES string, an uploaded file, or the bundled library, and generates 3D coordinates to feed downstream.",
    features: [
      "Three input modes: SMILES (e.g. CCO for ethanol), File (.mol, .mol2, .sdf, .pdb), or Library (~428 molecules).",
      "Conformer count is configurable under More options (coordinate generation only).",
      "Preview & Validate parametrizes a draft to confirm the molecule is well-formed before you build.",
    ],
    quirks: [
      "Coordinates and validation happen here; the actual GAFF / OpenFF Sage parameters are assigned on the downstream Forcefield node.",
      "Uploaded .mol/.mol2/.sdf files use the same GAFF/OpenFF path as SMILES input.",
      "A failed parametrization leaves an empty atom list — check the SMILES/file before continuing.",
    ],
    after: [
      "Forcefield — assign GAFF / OpenFF Sage parameters.",
      "Insert / Solvent / Box — place the molecule into a larger system.",
    ],
    tips: [
      "Use a canonical SMILES; ambiguous or invalid strings fail validation.",
      "For solute-in-box setups, combine with an inorganic or solvent system via Insert/Merge after parametrization.",
    ],
  },

  replicate: {
    title: "Replicate",
    summary:
      "Tiles the system into a supercell by integer factors along X, Y and Z, scaling the box vectors to match and controlling whether copies stay one continuous molecule or become separate molecules per axis.",
    features: [
      "Integer replication factors nx, ny, nz (minimum 1).",
      "Per-axis 'copies form one molecule' toggles: ticked = one continuous molecule along that axis (e.g. a clay sheet in X/Y); unticked = separate molecules (e.g. stacked layers in Z).",
      "Keep original resname and Renumber atom index options.",
      "Organic (GAFF/.itp) inputs are always replicated as separate molecules, carrying their topology to every copy.",
    ],
    theory: [
      "Each axis is replicated in turn; 'same molecule' axes are processed first and 'separate' axes last, so new molecule IDs form contiguous blocks (a valid molecule sequence for export).",
      "Copies are placed at integer offsets along the cell vectors, and the box edges grow by the per-axis factor.",
    ],
    equations: [
      { label: "Image positions", expr: "r_{ijk} = r + i·a + j·b + k·c" },
      { label: "Index ranges", expr: "i ∈ [0, nx),  j ∈ [0, ny),  k ∈ [0, nz)" },
      { label: "Box scaling", expr: "a → nx·a,  b → ny·b,  c → nz·c" },
    ],
    quirks: [
      "Factors are integers ≥ 1; a value of 1 leaves that axis untiled.",
      "Organic inputs ignore the 'same molecule' toggles — always separate per copy so each keeps its force field.",
      "A clay supercell is typically one molecule in X and Y (continuous sheet) but separate in Z (stacked layers).",
      "Leave Renumber atom index on for clean, contiguous indices in exported topologies.",
    ],
    before: [
      "Import Structure — provides the unit cell to tile.",
      "Box — a correct unit-cell box is required so copies line up; edges scale by the factors.",
    ],
    after: [
      "Spatial Ops — center or reposition the supercell.",
      "Solvent / Ions — fill the enlarged box.",
      "Forcefield / Simulate — parametrize and run on the supercell.",
    ],
    tips: [
      "Build the smallest correct unit cell first, then replicate — far cheaper than editing a large cell.",
      "If a tiled framework should act as one rigid sheet, keep its in-plane axes ticked as one molecule.",
    ],
  },

  transform: {
    title: "Spatial Ops",
    summary:
      "Applies a geometric operation to the atoms: translate/position, center, rotate, scale, or bend. Operations can be limited to a single residue name.",
    features: [
      "Five operations: Translate / Position, Center, Rotate, Scale, Bend.",
      "Translate: Absolute (place the centre of mass at X/Y/Z) or Relative (shift every atom by a vector, with an optional 'Only Resname' filter).",
      "Rotate: random orientation, or manual Euler angles about X, Y, Z.",
      "Scale: per-axis factors that rescale coordinates and the box together, with an optional resname filter.",
      "Bend: warps the structure onto a cylinder of a chosen radius (Å).",
      "Center: re-centers atoms in the box (or about their own extent) over selectable dimensions.",
      "Organic (.itp) topology metadata is preserved through every operation.",
    ],
    theory: [
      "Translate adds a vector (Relative) or moves the centre of mass to a target (Absolute); Rotate composes axis rotations; Scale multiplies each coordinate and the matching box edge; Bend maps the straight structure onto a curve of the given radius (larger radius = gentler curvature).",
    ],
    equations: [
      { label: "Relative translate", expr: "r' = r + t" },
      { label: "Absolute (COM)", expr: "r' = r + (p − r_com)" },
      { label: "Rotate", expr: "r' = R(θ)·(r − c) + c" },
      { label: "Scale", expr: "r'_k = s_k·(r_k − c_k) + c_k,   L_k → s_k·L_k" },
    ],
    quirks: [
      "Absolute translate always moves the whole system's centre of mass; the 'Only Resname' filter applies in Relative mode.",
      "Scale changes the box as well as the atoms, so densities change accordingly.",
      "Rotate and Center behave correctly only with a defined box.",
      "Bend takes only a curvature radius (no axis selector).",
    ],
    before: [
      "Import Structure — provides the atoms to move.",
      "Box — Center, Rotate and Scale need a defined box.",
      "Replicate — transform a supercell after tiling.",
    ],
    after: [
      "Solvent / Ions — position or center the solute before filling the box.",
      "Forcefield / Simulate — geometry is finalized before parametrization and MD.",
      "Export — save the transformed structure.",
    ],
    tips: [
      "Use Center to drop an off-origin molecule into the middle of its box before solvation.",
      "Scale is for box/coordinate rescaling (density adjustments), not resizing a single molecule in place.",
    ],
  },

  pbc: {
    title: "PBC Tools",
    summary:
      "Periodic-boundary housekeeping for the coordinates: wrap atoms back into the box, unwrap molecules split across a boundary, or condense the box to the atomic extent.",
    features: [
      "Wrap — bring all atoms inside the primary simulation box.",
      "Unwrap — reconnect molecules split across a boundary, with an optional target molid filter (blank = all).",
      "Condense — tighten the box to the atomic extent, removing excess vacuum.",
    ],
    theory: [
      "Wrap maps each coordinate into the primary cell by subtracting whole box lengths, so atoms past a face reappear on the opposite side. Distance tests use the minimum-image convention.",
    ],
    equations: [
      { label: "Wrap (per axis)", expr: "r ← r − L·floor(r / L)" },
      { label: "Minimum image", expr: "dr ← dr − L·round(dr / L)" },
    ],
    quirks: [
      "Wrapping preserves the atom set and box, so attached topology metadata passes through unchanged.",
      "Unwrap is most useful when a molecule looks shattered across opposite faces and you need it whole.",
      "Requires a defined periodic box.",
    ],
    before: [
      "Import Structure — coordinates that may straddle the box.",
      "Box — wrapping/unwrapping require a defined box.",
      "Replicate / Spatial Ops — clean up images after tiling or moving.",
    ],
    after: [
      "Solvent / Ions — start from a properly wrapped configuration.",
      "Export — coordinates that sit cleanly inside the box.",
      "Analysis — distance/RDF expect minimum-image-consistent coordinates.",
    ],
    tips: [
      "Wrap before export when atoms poke outside the box faces.",
      "Use Unwrap before measuring or rendering a molecule that crosses a boundary.",
    ],
  },

  coordFrame: {
    title: "Coordinate Frame",
    summary:
      "Converts between coordinate representations — Cartesian ↔ fractional and triclinic ↔ orthogonal — or reports the cell's lattice vectors. A representation/analysis node; the structure passes through.",
    features: [
      "Cartesian → Fractional and Fractional → Cartesian, using the box.",
      "Triclinic → Orthogonal and Orthogonal → Triclinic (optional box update on triclinic → orthogonal).",
      "Get Cell Vectors — writes the a / b / c lattice vectors to a JSON file.",
    ],
    theory: [
      "Fractional coordinates express positions relative to the cell edges. The cell (box) matrix H — whose columns are the lattice vectors a, b, c — maps between the two representations; triclinic ↔ orthogonal applies the same box transformation (and its inverse) to view a skewed cell in an orthogonal frame.",
    ],
    equations: [
      { label: "Cartesian from fractional", expr: "r = H·s" },
      { label: "Fractional from Cartesian", expr: "s = H⁻¹·r" },
      { expr: "(H = cell matrix, columns a, b, c)" },
    ],
    quirks: [
      "Fractional → Cartesian needs fractional coordinates present — run Cartesian → Fractional first.",
      "Conversions update coordinates in place; the box passes through unchanged (except the optional box update on Triclinic → Orthogonal).",
      "Get Cell Vectors only writes a report file; it doesn't change the structure.",
    ],
    before: [
      "Import Structure — provides the atoms.",
      "Box — a defined cell is required for every conversion.",
    ],
    after: [
      "Export — save the converted coordinates.",
      "Analysis — work in the chosen representation.",
    ],
    tips: [
      "Use Get Cell Vectors to read off the a / b / c vectors of a triclinic cell.",
    ],
  },

  add: {
    title: "Join Branches",
    summary:
      "Concatenates 1–6 upstream atom sets into one system (in handle order in1…in6), reassigning molecule IDs. Organic branches are merged so each component stays named and counted correctly downstream.",
    features: [
      "Up to six target handles; atoms are appended in handle order (in1 first).",
      "Reorder molecules (default on): renumbers molids sequentially across joined branches.",
      "Optional Set Molid (force all into one molecule) and Set Resname (override the joined residue name).",
      "Topology-aware: organic branches (with an attached .itp) are merged separately from mineral/solvent/ion branches and keep their force field.",
    ],
    quirks: [
      "Overlapping atoms are NOT removed here — use Merge (Overlap Filter) to drop clashes.",
      "With Reorder off, duplicate molids from different inputs can survive.",
      "Components should already share a common box to coexist sensibly.",
    ],
    before: [
      "Build or import each component (Import Structure, Solvent, Ions, or an Organic node).",
    ],
    after: [
      "Solvent / Ions (if not already present), then Forcefield → Simulate → Export.",
    ],
    tips: [
      "Connect the component that should own molid 1 to the lowest handle (in1).",
      "Use Set Resname to give a freshly joined assembly a single clean label.",
    ],
  },

  merge: {
    title: "Merge (Overlap Filter)",
    summary:
      "Combines A and B but first deletes atoms of B that lie too close to A, then joins the survivors onto A. Use it to drop solvent or guest atoms that overlap a surface or framework. Requires both inputs; result uses A's box.",
    features: [
      "Type Mode: molid removes whole overlapping molecules of B; index removes only the overlapping atoms.",
      "Default Dist (Å): minimum allowed A–B separation (default 2.0); closer B atoms are removed.",
      "Lower Dist (Å) for named atom labels (e.g. HW1;HW2) — lets hydrogens approach more closely.",
    ],
    theory: [
      "Each atom b in B is kept only if its nearest neighbour in A is at least the cutoff away; with per-label cutoffs the threshold depends on b's label.",
    ],
    equations: [
      { label: "keep b ∈ B iff", expr: "min over a∈A of |a − b| ≥ d_cut(b)" },
      { label: "per-label cutoff", expr: "d_cut(b) = d_small if label(b) ∈ labels, else d_default" },
    ],
    quirks: [
      "Geometry-only filter for minerals/solvent. If either input carries an organic topology, Merge refuses — use Join Branches instead.",
      "Only B is trimmed; A passes through untouched. The result adopts A's box.",
      "The lower cutoff applies only when both a value and at least one label are given.",
    ],
    before: [
      "Build A (e.g. a mineral surface) and B (e.g. a solvent slab) sharing the same box.",
    ],
    after: [
      "Join more components, or proceed to Solvent / Ions → Forcefield → Simulate → Export.",
    ],
    tips: [
      "Use molid mode for molecular solvents so you never leave a half-deleted water.",
      "Lower the per-label cutoff for H to avoid over-deleting waters near a surface.",
    ],
  },

  insert: {
    title: "Insert Molecules",
    summary:
      "Places copies of a template molecule at random positions in the box, rejecting any placement that overlaps existing atoms. Pick the template from the Library or upload it, set the count, and the copies are added to the system.",
    features: [
      "Template source: Library (presets / crystals) or Upload (.xyz, .pdb, .gro, .cif, .itp).",
      "Count, and Min Dist (Å) — minimum separation from existing atoms (default 2.0).",
      "Rotation: random per copy, or a fixed manual X/Y/Z rotation.",
      "Optional type constraints (two atom types + minimum z-difference) and an insert sub-region (xlo…zhi).",
    ],
    theory: [
      "Insertion is rejection sampling: a trial position and rotation are drawn, then accepted only if every template atom stays at least the minimum distance from all existing atoms; otherwise it retries.",
    ],
    equations: [
      { label: "accept trial iff", expr: "min over (t,e) of |t − e| ≥ min_distance" },
      { expr: "(t = template atoms, e = existing atoms)" },
    ],
    quirks: [
      "A high Count or large Min Dist in a small box can exhaust attempts and place fewer copies than requested.",
      "A box must exist upstream; without one a default 50 Å cube is assumed for the limits.",
      "Type constraints / z-difference apply only when both constraint fields are filled.",
    ],
    before: [
      "Import Structure (or build a system) and define a Box with room to insert into.",
    ],
    after: [
      "Solvent / Ions, or Join/Merge with other components, then Forcefield → Simulate → Export.",
    ],
    tips: [
      "Start with Min Dist near 2.0 Å; increase it if inserted molecules end up crowded.",
      "Use insert limits to confine guests to a pore, interlayer, or slab region.",
    ],
  },

  edit: {
    title: "Edit Atoms",
    summary:
      "Structural editing of one input: slice to a region, remove atoms by type/index/molid and/or coordinate test, set a molecule ID, assign a residue name, reorder atoms, center coordinates, or cut by a Miller plane. Geometry only — no force-field changes.",
    features: [
      "Remove: by atom type(s), index list, molid, and optional per-axis tests (x/y/z with <, ≤, >, ≥, ==, ≠); combine with AND/OR. Atoms are reindexed after removal.",
      "Slice: keep atoms inside xlo…zhi (hi defaults to box); optionally drop molecules only partially inside.",
      "Set Molecule ID (with optional resname); Assign Resname (default MIN).",
      "Reorder: by index list, residue name, or atom type; Center: to box center or origin.",
      "Cut — three shapes: Planes, Sphere, or Cylinder. Planes: keep only atoms satisfying ALL Miller planes (intersection); each plane has h/k/l, kept side (inner ≤ / outer ≥), auto or explicit level, and an offset (Å) along the normal; add several to carve a convex region — e.g. 6 side planes 60° apart make a hexagonal column. Hexagonal crystals: tick “4-index (hkil)” for Miller–Bravais indices (i auto = −(h+k)).",
      "Cut → Sphere: keep atoms inside (spherical nanoparticle) or outside (drill a cavity) a sphere of the given radius. Cut → Cylinder: keep inside/outside a cylinder along x/y/z (nanowire or pore), with an optional length to cap the rod. Both default the centre to the cell centre (or set explicit cx/cy/cz). All shapes share the keep-whole-molecules option.",
      "Make surface slab: build an oriented supercell with the (hkl) face in the xy-plane (surface ⟂ z), stacked over N layers and capped with an optional vacuum gap — for exposing crystal surfaces. Hexagonal crystals can use 4-index (hkil). “Reduce box for GROMACS” fixes the box tilts for GROMACS (leave off for OpenMM/LAMMPS/analysis).",
    ],
    theory: [
      "Each Miller cut is done in fractional coordinates, where the (hkl) plane is the linear threshold f = h·xf + k·yf + l·zf = s: 'inner' keeps f ≤ s, 'outer' keeps f ≥ s. 'auto' puts s at the midpoint of the structure; offset shifts s by offset / d_hkl.",
      "Multiple planes are combined as a logical AND (intersection of half-spaces), which carves any convex shape (slab, prism, hexagonal column). Use the per-plane offset to position each face away from the centre. Preview the planes in the Viewer node first.",
      "Sphere/cylinder cuts use the Cartesian distance to the centre (sphere) or to the axis line (cylinder); 'whole molecules' decides per molecule by its centroid so molecules aren't sliced.",
      "Make surface slab finds two lattice vectors lying in the (hkl) plane plus a stacking vector (a unimodular basis change of the same lattice), re-expresses the cell so the surface is the xy-plane, then stacks/vacuums. The natural oriented cell can exceed GROMACS tilt limits (|b_x| ≤ a_x/2, etc.); “Reduce box for GROMACS” shifts lattice vectors to satisfy them (atoms wrapped back in).",
    ],
    equations: [
      { label: "Keep (inner)", expr: "h·xf + k·yf + l·zf ≤ s" },
      { label: "auto level", expr: "s = ½(f_min + f_max)" },
      { label: "offset", expr: "Δs = offset / d_hkl" },
    ],
    quirks: [
      "Remove with no valid criteria passes the system through unchanged.",
      "Slice 'Remove partial molecules' (default on) discards molecules straddling the boundary, keeping molecules intact.",
      "Center to box requires a box; otherwise it falls back to a plain center.",
      "Miller-plane cuts need a unit cell (box); sphere/cylinder cuts work without one (centre falls back to the structure centroid). Any cut invalidates bond/neighbour lists, so re-detect them downstream (e.g. at Forcefield/Export).",
      "Make surface slab needs a unit cell and changes the box (it outputs the oriented/vacuum cell). With vacuum > 0 the z-axis becomes non-periodic (a free-standing slab).",
    ],
    before: [
      "Import Structure, or build/assemble the system (Join / Merge / Insert).",
    ],
    after: [
      "Continue assembling, add Solvent / Ions, then Forcefield → Simulate → Export.",
    ],
    tips: [
      "Use a coordinate test (e.g. z > value) to strip a surface layer or trim a slab.",
      "Reorder before Export when a downstream format needs grouped residues.",
    ],
  },

  chemistry: {
    title: "Chemistry Ops",
    summary:
      "High-level chemical edits: isomorphic substitution (swap a fraction of cations to control e.g. Al/Mg or Si/Al ratios), fuse overlapping atoms, or add hydrogens guided by bond-valence sums (BVS).",
    features: [
      "Isomorphic Substitution: replace counts of cation O1→O2 (octahedral) and T1→T2 (tetrahedral), enforcing minimum O2–O2 / T2–T2 spacing (default 5.5 Å); optional lo/hi limit along an axis.",
      "Fuse Atoms: merge atoms within Rmax (Å); a criterion (average / occupancy / order) sets the survivor.",
      "Add Hydrogens: protonate under-coordinated sites whose BVS deviation is below a threshold (default −0.5), up to Max Additions.",
    ],
    theory: [
      "Substitution honours minimum-separation constraints so swapped cations spread out (Loewenstein-style avoidance) for a realistic charge distribution.",
      "A strongly negative bond-valence deviation (observed valence below expected) flags an under-bonded site that should accept a hydrogen.",
    ],
    equations: [
      { label: "substitution spacing", expr: "|c_i − c_j| ≥ min_dist for all swapped pairs" },
      { label: "bond valence", expr: "V = Σ_j exp((R₀ − R_ij) / b),  b ≈ 0.37 Å" },
      { label: "protonate iff", expr: "ΔV = V − V_expected ≤ threshold" },
    ],
    quirks: [
      "Substitution updates and returns the box.",
      "Minimum spacings set too large for the requested counts can prevent placing all substitutions.",
      "Add Hydrogens is capped by Max Additions even if more sites qualify; Fuse is destructive.",
    ],
    before: [
      "Import Structure or build the framework, and define a Box.",
    ],
    after: [
      "Atom Properties / charges as needed, then Forcefield → Simulate → Export.",
    ],
    tips: [
      "Pick substitution counts from the target layer charge or cation ratio.",
      "Run Add Hydrogens after slicing or fusing, which can leave dangling under-coordinated atoms.",
    ],
  },

  atomProps: {
    title: "Atom Properties",
    summary:
      "Per-atom annotations without changing geometry: infer element/type labels from names, assign masses, attach charges, and compute the center of mass. Atoms pass through unchanged in position.",
    features: [
      "Set element/type labels from atom names.",
      "Assign atomic masses from element; attach formal charges.",
      "Compute center of mass (mass-weighted), written to a JSON report.",
    ],
    theory: [
      "Center of mass is the mass-weighted mean position over all atoms.",
    ],
    equations: [
      { label: "Center of mass", expr: "R = (Σ_i m_i·r_i) / (Σ_i m_i)" },
    ],
    quirks: [
      "Geometry is never modified — coordinates and box pass straight through.",
      "Center of mass writes to a report file rather than altering atoms.",
      "The Forcefield node assigns its own types/charges downstream, which take precedence for MD.",
    ],
    before: [
      "Import Structure, or assemble/edit the system upstream.",
    ],
    after: [
      "Forcefield → Simulate → Export.",
    ],
    tips: [
      "Run element/mass assignment after importing a file that lacks proper element columns.",
    ],
  },

  forcefield: {
    title: "Forcefield",
    summary:
      "Assigns force-field atom types, partial charges, and Lennard-Jones parameters. Inorganic: MINFF / CLAYFF (coordination-based typing) or the Dummy FF (frozen framework for unsupported materials). Organic: OpenFF Sage/Parsley or GAFF.",
    features: [
      "Inorganic: MINFF, CLAYFF, or Dummy FF; Organic: OpenFF Sage, OpenFF Parsley, GAFF.",
      "MINFF angle stiffness Ka: none (no angles), 0, 250, 500 (default), 1500 kJ/mol/rad²; CLAYFF angles default to none.",
      "Dummy FF charge model: Pauling effective (H = +0.4, anions balance) or half-oxidation.",
      "Dummy FF LJ source: per-element (UFF / Heinz from vdW data) or MINFF-borrowed.",
      "Organic charge method: AM1-BCC (recommended), Gasteiger (fast), or none.",
      "Optional molecule name so distinct minerals don't merge as one; global typing cutoffs (rmax long / rmax H).",
    ],
    theory: [
      "MINFF/CLAYFF read each atom's local coordination (neighbours within rmax cutoffs) to pick a type; each type carries a fixed partial charge and (σ, ε). Pairs combine by Lorentz–Berthelot mixing; nonbonded is 12-6 Lennard-Jones plus Coulomb.",
      "Dummy FF freezes the mineral framework (mass 0), so no bonded terms are needed — only nonbonded. Water/ions/organics keep their normal parameters. Qualitative only; EM/NVT, never NPT.",
      "Dummy 'pauling' mode: cations get a Pauling effective charge, H is fixed at +0.4, and anion (O, F) charges follow the coordination-resolved formula so a neutral lattice stays neutral. 'element' LJ converts UFF vdW data.",
    ],
    equations: [
      { label: "LJ pair potential", expr: "V(r) = 4ε[(σ/r)¹² − (σ/r)⁶]" },
      { label: "Lorentz–Berthelot", expr: "σ_ij = (σ_i + σ_j)/2,  ε_ij = √(ε_i·ε_j)" },
      { label: "Pauling charge (cations)", expr: "q_eff = q_formal·[1 − exp(−¼(χ_O − χ_M)²)]" },
      { label: "Dummy anion charge", expr: "q_O = −2.0 + Σ_j (q_formal,j − q_partial,j)/CN_j" },
      { label: "UFF → LJ", expr: "σ = x_i / 2^(1/6),  ε = D_i" },
    ],
    quirks: [
      "Requires a mineral structure WITH a box — an organic-only structure (or no box) raises an error.",
      "Dummy FF freezes the framework, so it is EM/NVT only; a downstream NPT Simulate refuses to run.",
      "Water model comes from the Solvent node and ion parameters from the Ions node — not set here.",
      "MINFF 'No angles' still emits the nonbonded block, so the mineral keeps LJ/Coulomb without angle restraints.",
    ],
    before: [
      "Import a mineral or organic structure.",
      "Box / geometry.",
      "Solvent and Ions (water model + ion set are read downstream).",
    ],
    after: [
      "Simulate (EM, then NVT/NPT).",
      "Export topology / coordinates.",
    ],
    tips: [
      "Use OPC3 water with MINFF and SPC/E with CLAYFF.",
      "Name each mineral (e.g. PYRO, KAOL) when combining minerals so they don't collapse into one moleculetype.",
      "Reach for the Dummy FF only for frameworks MINFF/CLAYFF can't type (e.g. MnO, NiO) — results are qualitative.",
    ],
  },

  bondAngle: {
    title: "Bonds / Angles",
    summary:
      "Detects bonded terms by distance cutoffs and reports bond lengths, angles, and (optionally) dihedrals. Analysis-only — useful for inspecting coordination and connectivity.",
    features: [
      "Toggle Bonds, Angles, Dihedrals independently.",
      "Cutoffs: rmaxH (default 1.2 Å) for H bonds, rmaxM (default 2.45 Å) for heavy/metal bonds.",
      "Options: same-element bonds, same-molecule-only (default on), optional neighbour-element filter.",
      "Distance method: Auto, Direct, Sparse, or Fast Cell List; writes a terms log.",
    ],
    theory: [
      "A pair is bonded if its distance is below the relevant cutoff (rmaxH if H is involved, else rmaxM). Angles are i–j–k paths through a shared centre j; dihedrals are i–j–k–l across two adjacent planes.",
    ],
    equations: [
      { label: "Bond length", expr: "r_ij = |r_i − r_j|" },
      { label: "Angle", expr: "θ_ijk = arccos[(r_ji·r_jk) / (|r_ji|·|r_jk|)]" },
      { label: "Dihedral", expr: "φ_ijkl = angle between planes (i,j,k) and (j,k,l)" },
    ],
    quirks: [
      "Analysis-only — passes atoms/box through unchanged; does not assign bonded parameters.",
      "Same-molecule-only restricts bonds to shared molids; turn it off for purely geometric framework coordination.",
      "A separate data handle exposes the computed terms for a Plot node.",
    ],
    before: [
      "Import Structure.",
      "Box / geometry (PBC for minimum-image distances).",
    ],
    after: [
      "Plot (via the data handle), or export the terms log.",
    ],
    tips: [
      "Tune rmaxM to match real M–O bond lengths if coordination numbers look wrong.",
      "Use the neighbour-element filter (e.g. O) to inspect only metal–oxygen coordination.",
    ],
  },

  solvent: {
    title: "Solvent",
    summary:
      "Fills the box with explicit water at a target density and sets the water model used by Simulate and Export. Works for pure-water, organic, and mineral systems.",
    features: [
      "Water models: OPC3 (rec. for MINFF), SPC/E & SPC (rec. for CLAYFF), TIP3P, OPC & TIP4P-Ew.",
      "Target density (g/cm³, default 1.0) and minimum solute/solvent distance (default 2.25 Å).",
      "Fill modes: Auto (max possible), Fixed count, or Shell thickness around the solute.",
      "Optional per-axis solvation limits; toggle whether the solute is included in the distance check.",
    ],
    theory: [
      "The water count for a volume at a target density is N = round(ρ·V·N_A / M). Candidate positions are inserted and rejected if closer than the minimum distance, so the achieved count can be slightly below the estimate.",
    ],
    equations: [
      { label: "Water count", expr: "N = round(ρ·V·N_A / M),  M ≈ 18.015 g/mol" },
    ],
    quirks: [
      "The water model selected here — not a Forcefield node — drives the water force field emitted by Simulate and Export.",
      "Density is entered in g/cm³; shell thickness snaps to a supported value.",
    ],
    before: [
      "Import Structure.",
      "Box — defines the volume to fill.",
    ],
    after: [
      "Ions (neutralize / set concentration), then Forcefield → Simulate → Export.",
    ],
    tips: [
      "Match the model to the mineral FF: OPC3 with MINFF, SPC/E with CLAYFF.",
      "Increase min-distance if waters land too close to a rough surface and the first EM step blows up.",
    ],
  },

  ions: {
    title: "Ions",
    summary:
      "Adds counter-ions or salt. Random mode places an exact count with a minimum-distance check; Grid mode seeds ions to a target concentration. Also selects the ion parameter set used downstream.",
    features: [
      "Ion types: Na⁺, K⁺, Li⁺, Ca²⁺, Mg²⁺, Cl⁻.",
      "Random: explicit count + min distance (default 3.0 Å), placement random/surface/bulk, optional axis bias.",
      "Grid: target concentration in mol/L.",
      "Ion parameter sets: HFE (LM), IOD (LM, default), Crystal-Metric (LM), JC (Joung-Cheatham).",
    ],
    theory: [
      "Grid mode converts a molar concentration to a count over the box volume. Charge neutralization adds counter-ions until the net charge is zero. Random placement rejects ions within the minimum distance of the (wrapped) solute or another ion.",
    ],
    equations: [
      { label: "Count from concentration", expr: "N = round(c·N_A·V)   (c in mol/L, V in L)" },
      { label: "Neutralizing counter-ions", expr: "N_counter = round(|Q_net| / |z_ion|)" },
    ],
    quirks: [
      "The ion parameter set chosen here is used unless a Forcefield node overrides it.",
      "Random mode wraps the solute first so ions aren't placed on a periodic image.",
      "Direction bias applies only when both a direction and a value are set.",
    ],
    before: [
      "Import Structure, Box / geometry.",
      "Solvent — usually solvate first, then add ions to the water.",
    ],
    after: [
      "Forcefield → Simulate → Export.",
    ],
    tips: [
      "For a charged mineral surface, add counter-ions to neutralize before any NVT/NPT run.",
      "Use surface or bulk placement to study adsorption vs. bulk-solution ions.",
    ],
  },

  simulate: {
    title: "Simulate (OpenMM / GROMACS)",
    summary:
      "Runs the system with one of two engines: OpenMM (default) or local GROMACS. Energy Minimization, NVT (constant volume), or NPT (constant pressure). Builds the topology from the upstream Forcefield/Solvent/Ions choices, uses PME electrostatics with a cutoff, and writes a trajectory + log.",
    features: [
      "Engine toggle: OpenMM (auto GPU/CPU, runs anywhere OpenMM is installed) or GROMACS — runs grompp + mdrun wherever gmx is available (a local install, or a free Colab GPU via the launcher's optional Step 1c cell). Both consume the SAME atomipy topology (minerals + ions + water + organics).",
      "Three modes: Energy Minimization, NVT (Langevin), NPT (Langevin + barostat). Each Simulate node runs ONE stage (no implicit EM before MD) for both engines; chain Simulate nodes to sequence EM/NVT/NPT in any order — each continues from the previous one's relaxed structure.",
      "Minimization steps; or MD steps, temperature (K), timestep (fs, ≤4), Langevin friction (1/ps), and pressure (bar) for NPT.",
      "Constraints None / HBonds / AllBonds; LJ cutoff + switch distance; PME for long-range electrostatics. (Friction/constraints/switch are OpenMM-only; the GROMACS path uses MINFF .mdp conventions.)",
      "Optional positional restraints (POSRES) on non-water/non-ion atoms; PDB trajectory + log frequencies.",
    ],
    theory: [
      "EM iteratively descends the potential-energy surface and records a relaxation trajectory plus the maximum per-atom force norm as the convergence indicator.",
      "NVT integrates Langevin dynamics at temperature T and timestep Δt (a thermostat coupling each atom to a heat bath). NPT adds a Monte-Carlo barostat at pressure P. Long-range electrostatics use Particle-Mesh Ewald; LJ is switched to zero between the switch distance and the cutoff.",
    ],
    equations: [
      { label: "Langevin dynamics", expr: "m·(dv/dt) = F − γ·m·v + √(2·γ·m·k_B·T)·R(t)" },
      { label: "Max-force convergence", expr: "F_max = max_i √(F_ix² + F_iy² + F_iz²)" },
    ],
    quirks: [
      "A Forcefield node MUST be upstream — Simulate finds the mineral FF + Ka, the water model (Solvent), and the ion set (Ions) by walking the graph.",
      "The public online instance is CPU/EM-only; NVT and NPT need a GPU (Colab or local) and the node shows a banner when MD is blocked.",
      "Chain EM before NVT/NPT to relax bad contacts and avoid NaNs.",
      "Frozen Dummy FF systems run EM/NVT only — NPT raises an error.",
      "Water is kept rigid.",
    ],
    before: [
      "Import → box/geometry, Solvent + Ions, Forcefield (required).",
    ],
    after: [
      "Chain EM → NVT → NPT as needed; Export / view the trajectory.",
    ],
    tips: [
      "Keep the timestep ≤2 fs with HBonds constraints (≤1 fs with None) to stay stable.",
      "Use POSRES during NVT equilibration to let water relax around a fixed solute.",
      "OpenMM: download the generated script to run NVT/NPT on a Colab GPU when blocked here.",
      "GROMACS: run the launcher notebook's Step 1c cell to enable the GROMACS engine on a free Colab GPU (then clear the node's GROMACS-path field).",
    ],
  },

  topology: {
    title: "Topology",
    summary:
      "Passthrough node to override the GROMACS [ molecules ] section — the ordered list of moleculetype names and counts — and to merge per-component topologies into one consistent system. Blank fields = auto-detect.",
    features: [
      "Editable [ molecules ] table (name + count, up to 8 rows).",
      "Shows the sequence detected from the last run with a component-type badge (mineral / organic / ion / water).",
      "'Use detected' copies the detected sequence into the editable fields.",
    ],
    theory: [
      "A combined system needs one [ molecules ] block listing each moleculetype and its count in the same order as the coordinates. Merging aligns the components onto one combination rule (Lorentz–Berthelot) and emits the needed #include / #define lines.",
    ],
    quirks: [
      "Blank rows mean auto-detect — no override is applied.",
      "Counts are per-moleculetype (row = name × n molecules) and must cover every atom exactly, in order.",
      "The detected sequence is runtime-only (ghost placeholders after a run).",
    ],
    before: [
      "Forcefield (assigns moleculetypes), Solvent + Ions (add water/ion components).",
    ],
    after: [
      "Simulate, Export.",
    ],
    tips: [
      "Run once, then click 'Use detected' and tweak counts rather than typing the whole table.",
      "Use it to fix a mis-detected order before export.",
    ],
  },

  analysis: {
    title: "Analysis Ops",
    summary:
      "Structural and trajectory analysis. Static/ensemble: RDF g(r) + running coordination n(r), density profiles, coordination number, closest-atom / min distances, site occupancy, BVS, stats. Trajectory: MSD/diffusion, VACF/power spectrum, hydrogen bonds. Every mode runs on a single structure OR ensemble-averages over a connected trajectory, and exports ASCII .dat + JSON and a plot-data stream.",
    features: [
      "Static/ensemble: RDF g(r) (+ running coordination n(r)), Density Profile (x/y/z), Coordination Number, Find Closest Atom, Min Distances, Site Occupancy, BVS, Structure Stats.",
      "Trajectory: MSD / Diffusion (3D/2D/1D, PBC-unwrapped, multi-origin restarts), VACF / Power spectrum (Green-Kubo D + vibrational DOS), Hydrogen Bonds (gmx-hbond geometry, per-molecule distribution).",
      "RDF/density/MSD/VACF/H-bond auto-average over all frames when a trajectory is connected; otherwise they use the single structure.",
      "Exports aligned ASCII .dat (numpy.loadtxt-ready) and JSON; a 'data' handle streams the chosen curve to a Data Plotter.",
    ],
    theory: [
      "RDF g(r): histogram of A–B pair distances normalized to a uniform gas at density ρ; → 1 at large r, peaks mark shells. Running n(r) = ∫ g·4πr²ρ dr is the average #B within r of an A (read it at the first g(r) minimum for the shell coordination).",
      "Density profile bins atoms along an axis (number/mass/charge), averaged over frames — e.g. interfacial water layering.",
      "MSD: Einstein relation, D = slope/(2·dim); coordinates are nojump-unwrapped and averaged over multiple time origins. Also gives the van Hove self-part (Gaussian for normal diffusion).",
      "VACF: D = ⅓∫⟨v(0)·v(t)⟩dt (Green-Kubo); its Fourier transform is the vibrational power spectrum (DOS). Velocities are estimated by FINITE DIFFERENCE of positions (no trajectory velocities) — see quirks.",
      "H-bonds: geometric D-H···A with D···A < r_cut and H–D···A angle ≤ angle_cut (GROMACS gmx hbond convention).",
    ],
    equations: [
      { label: "RDF", expr: "g(r) = hist(r) / (N_A·ρ·V_shell(r))" },
      { label: "coordination n(r)", expr: "n(r) = Σ_{r'≤r} hist(r') / N_A = ∫ g·4πr²ρ dr" },
      { label: "diffusion (MSD)", expr: "D = ⟨|r(t)−r(0)|²⟩ / (2·dim·t)" },
      { label: "diffusion (Green-Kubo)", expr: "D = (1/3) ∫₀^∞ ⟨v(0)·v(t)⟩ dt" },
      { label: "spectrum Nyquist", expr: "f_max = 1/(2·Δt_frame)" },
    ],
    quirks: [
      "Selections match the atom 'type' field (force-field/trajectory name, e.g. OW — not the element); H-bonds also accept residue-name filters (SOL water, MIN mineral).",
      "Trajectory modes use the TRAJECTORY atom names (water = OW/HW1/HW2), which differ from the minff types (Ow/Hw) in a static structure.",
      "VACF uses no real velocities — finite-difference of positions caps the spectrum at the Nyquist frequency 1/(2·Δt) and damps high frequencies (~sinc). Save every few fs for vibrational spectra; the Green-Kubo D (low-freq) is robust.",
      "MSD/VACF need the correct Time/frame (ps) = MD timestep × output frequency; getting it wrong rescales D.",
      "RDF/CN/density need a box for minimum-image distances; set R-max below half the shortest box edge.",
    ],
    before: [
      "Import Structure (+ Forcefield for type-based selections); for trajectory modes, connect a Simulate or Trajectory node so frames are available.",
    ],
    after: [
      "Data Plotter — chart the selected curve (g(r)/n(r), density, MSD, VACF/spectrum, H-bond distribution). Usually a leaf branch; the structure passes through. All curves are also in the Download Results bundle (.dat/.json).",
    ],
    tips: [
      "Read coordination at the first g(r) minimum. Cross-check the Green-Kubo D against the Einstein/MSD D. For water↔surface H-bonds set donor resname SOL → acceptor resname MIN.",
    ],
  },

  bvs: {
    title: "BVS Analysis",
    summary:
      "Bond-valence-sum analysis: sums empirical bond valences per atom, compares to expected oxidation states, and reports the Global Instability Index (GII). Validates oxidation states and finds under-/over-bonded sites.",
    features: [
      "Per-atom BVS, expected oxidation state, and deviation Δ from the formal valence.",
      "Top-N worst (most strained) atoms written to a log; optional per-bond CSV.",
      "Reports GII and GII-excluding-H; a 'data' handle streams to Plot.",
    ],
    theory: [
      "Each bond of length R_ij contributes a valence from the empirical bond-valence relation using tabulated R₀ and b ≈ 0.37 Å. An atom's BVS V_i should equal the magnitude of its formal oxidation state; the GII is the RMS deviation across all atoms (small GII = chemically consistent).",
    ],
    equations: [
      { label: "bond valence", expr: "s_ij = exp[(R₀ − R_ij) / b],  b ≈ 0.37 Å" },
      { label: "atom valence", expr: "V_i = Σ_j s_ij" },
      { label: "deviation", expr: "Δ_i = V_i − |V_i,formal|" },
      { label: "GII", expr: "GII = √( Σ_i Δ_i² / N )" },
    ],
    quirks: [
      "Needs a box/cell to detect bonds.",
      "H–O bonds use a symmetric reference (R₀ ≈ 0.957 Å) for stable O–H valences.",
      "Oxidation states are auto-refined unless an explicit per-element state is given.",
    ],
    before: [
      "Import Structure with a valid cell; Add Hydrogens if you want BVS on the protonated structure.",
    ],
    after: [
      "Plot per-atom BVS / Δ; Chemistry → Add H for under-bonded oxygens.",
    ],
    tips: [
      "Large negative Δ on oxygens flags sites that likely need a hydrogen.",
      "Compare GII with and without H to separate framework strain from protonation.",
    ],
  },

  xrd: {
    title: "XRD Simulation",
    summary:
      "Simulates a powder X-ray diffraction pattern (2θ vs intensity) from the crystal structure using atomic structure factors. Configurable wavelength, 2θ range/step, peak broadening, preferred orientation, temperature factor, and peak shape.",
    features: [
      "Instrument: wavelength λ (default Cu Kα ≈ 1.5419 Å), 2θ min/max, and step.",
      "Reflection-class FWHM broadening for 00l, hk0, and hkl peaks.",
      "Preferred-orientation correction along a chosen (h k l); isotropic B-factor; pseudo-Voigt peak shape; neutral-atoms toggle.",
      "Writes xrd.dat (2θ, intensity) and streams an inline profile + plot data.",
    ],
    theory: [
      "Allowed reflections come from Bragg's law for the cell, scanned over the 2θ range. Atomic scattering factors are evaluated from tabulated coefficients vs sinθ/λ. The structure factor sums them over all atoms (with occupancy and a Debye–Waller factor); intensity is |F|² scaled by a Lorentz-polarization factor (and optional preferred orientation). Each reflection is drawn as a pseudo-Voigt peak whose width depends on its class.",
    ],
    equations: [
      { label: "Bragg", expr: "λ = 2·d·sinθ" },
      { label: "scattering factor", expr: "f_j(s) = Σ_k a_k·exp(−b_k·s²) + c,   s = sinθ/λ" },
      { label: "structure factor", expr: "F_hkl = Σ_j f_j·occ_j·exp(−B_j·s²)·exp[2πi(h·x_j + k·y_j + l·z_j)]" },
      { label: "intensity", expr: "I_hkl ∝ |F_hkl|²·LP(θ)" },
      { label: "Lorentz-polarization", expr: "LP = (1 + cos²2θ) / (2·sinθ·sin2θ)" },
    ],
    quirks: [
      "Requires a crystalline cell with fractional coordinates; amorphous input gives no meaningful peaks.",
      "Intensity is normalized so the strongest peak = 1 (the .dat file scales to 100).",
      "Preferred orientation enhances/suppresses peaks near the chosen (h k l); set strength to 0 to disable.",
    ],
    before: [
      "Import Structure (crystal) with a valid unit cell; any substitution/edit you want reflected.",
    ],
    after: [
      "Plot 2θ vs intensity (the inline profile also shows on the node). Usually a leaf branch.",
    ],
    tips: [
      "Match λ to your source (Cu Kα ≈ 1.5419 Å) so 2θ positions line up with experiment.",
      "Increase 00l FWHM to mimic turbostratic/layered broadening; raise the B-factor to damp high-angle peaks.",
    ],
  },

  plot: {
    title: "Data Plotter",
    summary:
      "Charts series data produced upstream (RDF g(r)/n(r), density, MSD, VACF/power spectrum, H-bond distribution, thermodynamics, XRD…) as an interactive line plot. Supports multiple series (legend) and editable axis labels.",
    features: [
      "Plots single- or multi-series (x, y) data — e.g. density per atom type, or VACF distribution + Gaussian overlay.",
      "Fed by an upstream node's plot-data handle (the analysis/simulate node's selected curve).",
      "Editable X/Y axis labels; interactive hover tooltips; legend for multi-series.",
    ],
    quirks: [
      "Shows a placeholder until an upstream node runs and supplies data.",
      "One node → one plot; multi-quantity sources (thermo, RDF g(r) vs n(r)) have a selector for which curve to send.",
    ],
    before: [
      "A producing node: Analysis (RDF/n(r), density, MSD, VACF/spectrum, H-bonds), Simulate (thermodynamics), XRD, BVS, or Stats.",
    ],
    after: [
      "Terminal node — for inspecting results, not modifying the structure.",
    ],
    tips: [
      "Connect the source node's 'data' handle for live plotting without a file path.",
    ],
  },

  inspect: {
    title: "Inspector",
    summary:
      "Debug/peek node: reports the variables visible at this point in the workflow (atom count + type histogram, box, trajectory, topology metadata) and the files written so far in the working directory. Passes the structure through unchanged.",
    features: [
      "Variables: atom count, per-type counts, whether charges/elements are set, box dimensions, trajectory path + frame count, topology (.itp/.top/defines).",
      "Files: live listing of the working directory at this node's execution point, with sizes.",
      "Pass-through — drop it anywhere mid-graph without altering the structure.",
    ],
    quirks: [
      "Snapshot reflects upstream nodes that have already run; files written by downstream nodes appear only if you place an Inspector after them.",
      "The working directory is shared across the run, so the file list is cumulative up to this point.",
    ],
    before: [
      "Any upstream node whose state/output you want to inspect.",
    ],
    after: [
      "Continue the graph (pass-through) or leave it as a leaf. All listed files are in the Download Results bundle.",
    ],
    tips: [
      "Place one after Solvent/Forcefield/Simulate to confirm atom counts, the .top/.itp, and that the trajectory/energy files were written.",
    ],
  },

  viewer: {
    title: "Structure Viewer",
    summary:
      "Interactive in-browser 3D view of the current structure or trajectory. Switch between the 3Dmol and JSmol renderers, restyle atoms/bonds, animate multi-frame trajectories, and export a PNG. Usually a terminal node.",
    features: [
      "Two renderers: 3Dmol and JSmol (with JSmol scripting/measurements).",
      "Representations: ball & stick, sticks, spheres, lines; toggle unit cell, hydrogens, outline, spin, and element/charge labels.",
      "Perspective or orthographic projection; resizable node.",
      "Multi-frame trajectory playback with play/pause and a frame slider; PNG export at 1×/2×/4×.",
      "Miller-plane overlay — enable “Miller plane (hkl)” in the gear menu, then add one or more planes. Each uses the SAME Miller options as the Edit node’s cut — h, k, l, auto level (structure midpoint) or an explicit fractional level, and an offset (Å, with slider) along the normal — plus viewer-only display options (full family, colour, opacity). So a plane set up the same way appears exactly where the Edit cut would fall. Hexagonal crystals (e.g. quartz): tick “4-index (hkil)” (next to “+ add plane”) to enter Miller–Bravais indices — i is shown automatically as −(h+k). (To actually remove atoms, use the Edit node’s “Cut by Miller plane”; the Viewer just draws the plane.)",
    ],
    theory: [
      "A Miller (hkl) plane is the set of points satisfying h·x + k·y + l·z = n in fractional coordinates (n = integer plane level). The overlay clips that plane to the cell; the full family is every integer n that crosses the cell, spaced by the interplanar distance d_hkl.",
      "“offset” shifts the plane(s) along their normal by a distance in Å (a fractional-level shift of offset / d_hkl), so an offset equal to d_hkl moves to the next plane.",
    ],
    equations: [
      { label: "Plane (fractional)", expr: "h·x + k·y + l·z = n" },
      { label: "Interplanar spacing", expr: "1/d² = [h k l] · G⁻¹ · [h k l]ᵀ   (G = cell metric)" },
      { label: "Offset → level shift", expr: "Δn = offset / d_hkl" },
    ],
    quirks: [
      "Renders only after a Build step provides coordinates; otherwise shows a placeholder.",
      "The Miller overlay needs a unit cell (CRYST1 in the structure) — set a Box upstream if the plane doesn't appear.",
      "Hide periodic bonds is JSmol-only (deletes cross-cell bonds longer than 3 Å).",
      "Charge labels need a Forcefield node upstream.",
    ],
    before: [
      "Import Structure plus build/edit steps; Forcefield for charge labels; Trajectory for playback.",
    ],
    after: [
      "Terminal node — view/export only; the structure can still pass through to other branches.",
    ],
    tips: [
      "Use JSmol for measurements and periodic-bond cleanup; 3Dmol for fast styling and PNG export.",
    ],
  },

  trajectory: {
    title: "Trajectory",
    summary:
      "Imports or writes multi-frame trajectories, or extracts/passes through a single frame. Bridges MD output and the single-structure nodes downstream.",
    features: [
      "Import Trajectory or Write Trajectory (append) modes; formats PDB, GRO, XYZ.",
      "Extract single frame by index; otherwise the current coordinates pass through.",
    ],
    quirks: [
      "Without Extract single frame, the node is a pass-through.",
      "Frame extraction is 0-based and falls back to the current coordinates if out of range.",
    ],
    before: [
      "A simulation/MD step or an imported trajectory file.",
    ],
    after: [
      "Viewer (animate frames); Analysis / Export on the extracted frame.",
    ],
    tips: [
      "Extract a representative frame before per-structure analysis or export.",
    ],
  },

  export: {
    title: "Export",
    summary:
      "Writes the final coordinates and (optionally) a topology, with provenance headers. Usually the LAST node.",
    features: [
      "Structure formats: .xyz, .gro, .pdb, .cif, .poscar, .sdf, .pqr.",
      "Topology formats: GROMACS (.top + .itp), LAMMPS data (.data), or NAMD/OpenMM (.psf).",
      "Configurable output name; extras: PDB CONECT/element records, CIF title, bond-detection cutoffs, molecule name/nrexcl/segid.",
      "All exporters write a provenance header.",
    ],
    quirks: [
      "GROMACS topology writes the full system (mineral + ions + water + organics); LAMMPS/NAMD write only the inorganic MINFF/CLAYFF system.",
      "Topology export needs a force field assigned upstream.",
      "Bond detection for topologies uses rmaxH / rmaxM cutoffs; tune them if bonds are missed or spurious.",
    ],
    before: [
      "Import Structure → Forcefield (required for any topology) → build/edit steps.",
    ],
    after: [
      "Terminal node — produces the downloadable files.",
    ],
    tips: [
      "Pick the format that matches your engine (.gro/.itp for GROMACS, .data for LAMMPS).",
      "Enable CONECT records when you need explicit bonds preserved in a PDB.",
    ],
  },

  stats: {
    title: "Structure Stats",
    summary:
      "Computes and writes structural statistics — atom/element counts, masses, composition, and charge — to a log file. A lightweight pass-through summary node.",
    features: [
      "Auto-calculates composition, masses, and a charge/coordination summary.",
      "Writes to a named log file (default output.log); exposes a 'data' handle for plotting.",
    ],
    quirks: [
      "Pass-through: the structure and box continue downstream unchanged.",
      "Charge and full composition are most meaningful after a force field is assigned.",
    ],
    before: [
      "Import Structure; Forcefield for charge/type-aware stats.",
    ],
    after: [
      "Plot composition/summary values; often a leaf branch.",
    ],
    tips: [
      "Drop in a Stats node after major build steps to log how composition changes.",
    ],
  },
};

function Section({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function TheorySection({ help }: { help: NodeHelp }) {
  const hasTheory = help.theory && help.theory.length > 0;
  const hasEq = help.equations && help.equations.length > 0;
  if (!hasTheory && !hasEq) return null;
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold text-foreground">How it works</h4>
      {hasTheory && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {help.theory!.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
      {hasEq && (
        <div className="space-y-1 rounded-md bg-muted/60 p-2.5 font-mono text-xs text-foreground">
          {help.equations!.map((e, i) => (
            <div key={i}>
              {e.label && <span className="text-muted-foreground">{e.label}:&nbsp;</span>}
              <span>{e.expr}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Help (?) icon for a node header. Renders nothing if no help content exists
 * for the given key, so it's safe to use on every node.
 */
export function NodeHelpButton({ helpKey }: { helpKey?: string }) {
  const [open, setOpen] = useState(false);
  const help = helpKey ? NODE_HELP[helpKey] : undefined;
  if (!help) return null;

  return (
    <>
      <button
        type="button"
        className="nodrag p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors text-muted-foreground hover:text-primary"
        title={`About the ${help.title} node`}
        aria-label="Node help"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{help.title}</DialogTitle>
            <DialogDescription>{help.summary}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Section title="Features" items={help.features} />
            <TheorySection help={help} />
            <Section title="Quirks & gotchas" items={help.quirks} />
            <Section title="Typically comes after" items={help.before} />
            <Section title="Typically feeds into" items={help.after} />
            <Section title="Tips" items={help.tips} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
