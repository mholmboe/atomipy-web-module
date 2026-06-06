import {
  ExternalLink, ArrowRight, BookOpen, Layers, BarChart3, Zap, Bug,
  FileInput, Box, Combine, Droplet, FlaskConical, FileOutput,
  ChevronRight, AlertCircle, MessageSquare, Play,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

// ─── Node reference data ────────────────────────────────────────────────────

const nodeCategories = [
  {
    id: "input",
    label: "Input & Structure",
    color: "blue",
    colorClass: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    badgeClass: "bg-blue-500/20 text-blue-300",
    Icon: FileInput,
    nodes: [
      {
        name: "Import Structure",
        type: "structure",
        desc: "Load a structure on the Inorganic tab (Custom File, or the Library = MINFF presets + a 517-crystal Avogadro library) or the Organic tab (SMILES, an uploaded file, or the bundled 428-molecule library). Upload formats: .pdb, .gro, .xyz, .cif/.mmcif, .pqr, .poscar, .cjson (organic molecules: .mol, .mol2, .sdf via the GAFF/Sage parametrizer).",
        features: ["Inorganic: Custom File + Library (MINFF presets + crystals)", "Organic: SMILES / File / Library (428 molecules)", "Preview & Validate (inorganic scan flags non-MINFF elements → Dummy FF)", "Outputs atoms + box"],
      },
      {
        name: "Organic Molecule (Import → Organic tab)",
        type: "organic",
        desc: "Define an organic molecule on the Import Structure node's Organic tab — by SMILES, an uploaded file (.mol2, .sdf, .mol, .pdb), or the bundled 428-molecule library. Force-field parametrization (GAFF/OpenFF) happens on the Forcefield node downstream.",
        features: [
          "Input: SMILES / uploaded file / bundled library (amino acids, sugars, …)",
          "GAFF 2.11 / GAFF 1 via ACPYPE (bundles antechamber — no separate AmberTools install)",
          "OpenFF Sage / Parsley via pure-Python OpenFF Interchange",
          "Outputs native atomipy dictionaries + ITP data for downstream MD or mixing with minerals",
        ],
      },
    ],
  },
  {
    id: "geometry",
    label: "Geometry & Box",
    color: "purple",
    colorClass: "bg-purple-500/10 border-purple-500/30 text-purple-400",
    badgeClass: "bg-purple-500/20 text-purple-300",
    Icon: Box,
    nodes: [
      {
        name: "Replicate",
        type: "replicate",
        desc: "Tile a unit cell or slab in X, Y and/or Z directions using ap.replicate().",
        features: ["Integer replication factors (X / Y / Z)", "Auto-updates box dimensions downstream", "Inheritable by Box node"],
      },
      {
        name: "Set System Box",
        type: "box",
        desc: "Set or override the simulation box. Modes: Cell (a, b, c, α, β, γ), Box_dim (lx, ly, lz, xy, xz, yz) with live conversion, or Fit to mol — size the box to the structure + a margin per side (like gmx editconf -d), with optional cubic and center-molecule options.",
        features: ["Cell ↔ Box_dim live conversion", "Fit to mol (extent + padding, cubic, center)", "Auto-seeded from upstream structure", "Inherits through all passthrough nodes"],
      },
      {
        name: "Spatial Ops",
        type: "transform",
        desc: "Translate, rotate, scale or bend the system. Operations are relative or absolute, and can target specific residue names.",
        features: ["Translate / Position (relative or absolute)", "Rotate (degrees around X/Y/Z axis)", "Scale (fractional or absolute)", "Bend (deform slab geometry)", "Optional residue filter"],
      },
    ],
  },
  {
    id: "joining",
    label: "Joining & Merging",
    color: "emerald",
    colorClass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    badgeClass: "bg-emerald-500/20 text-emerald-300",
    Icon: Combine,
    nodes: [
      {
        name: "Join Branches",
        type: "add",
        desc: "Combine up to 6 independent structure branches into one system using ap.update(). Atoms are simply concatenated and mol IDs are reassigned.",
        features: ["Up to 6 simultaneous inputs (in1–in6)", "Preserves atom ordering by handle", "Auto mol-ID reordering"],
      },
      {
        name: "Merge (Overlap Filter)",
        type: "merge",
        desc: "Join two branches (A and B) while removing overlapping atoms from B that are too close to atoms in A.",
        features: ["Configurable minimum distance threshold", "Separate threshold for specific atom labels", "Type mode: molid or index", "Requires both A and B inputs"],
      },
    ],
  },
  {
    id: "chemistry",
    label: "Chemistry & Editing",
    color: "amber",
    colorClass: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    badgeClass: "bg-amber-500/20 text-amber-300",
    Icon: FlaskConical,
    nodes: [
      {
        name: "Chemistry Ops",
        type: "chemistry",
        desc: "High-level chemical transformations: isomorphic substitution, hydrogen addition (BVS), and atom fusion.",
        features: ["Isomorphic Substitution (Al/Mg/Si ratio control)", "Add Hydrogens via BVS", "Fuse atoms (merge by proximity)"],
      },
      {
        name: "Edit Atoms",
        type: "edit",
        desc: "Fine-grained atom editing: slicing the structure by coordinates, removing atoms, renaming residues, and reordering.",
        features: ["Slice by X/Y/Z range", "Remove by atom type, index, or mol ID", "Rename residue (resname)", "Reorder atoms"],
      },
      {
        name: "Atom Properties",
        type: "atomProps",
        desc: "Compute or assign intrinsic atom properties: elements, charges, masses, and center of mass.",
        features: ["Assign elements from atom names", "Compute charges", "Assign masses", "Centre of mass calculation"],
      },
      {
        name: "Coordinate Frame",
        type: "coordFrame",
        desc: "Advanced coordinate frame operations for manipulating the reference frame of the system.",
        features: ["Align principal axes", "Reframe to box origin"],
      },
      {
        name: "PBC Tools",
        type: "pbc",
        desc: "Periodic boundary condition utilities: wrap atoms back into the box, unwrap bonds, or condense the structure.",
        features: ["Wrap (fold atoms into box)", "Unwrap (extend across PBC)", "Condense (compress to unit cell)"],
      },
      {
        name: "Insert Molecule",
        type: "insert",
        desc: "Insert a small molecule (solvent, ligand) at random positions within the box, avoiding overlaps.",
        features: ["Insert from the Library (presets + crystals) or upload", "Configurable insertion count", "Minimum distance filter"],
      },
    ],
  },
  {
    id: "solvation",
    label: "Solvation & Ions",
    color: "cyan",
    colorClass: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
    badgeClass: "bg-cyan-500/20 text-cyan-300",
    Icon: Droplet,
    nodes: [
      {
        name: "Solvent",
        type: "solvent",
        desc: "Solvate the system with a water model or convert between water models. Supports TIP3P, SPC/E, TIP4P and others.",
        features: ["Solvate: fill box with water", "Convert water model (e.g. SPC → TIP4P)", "Configurable density / number of molecules", "Supports multiple water models"],
      },
      {
        name: "Ions",
        type: "ions",
        desc: "Add counterions or salt to the system, either randomly or on a grid.",
        features: ["Random or grid placement", "Choose cation and anion types", "Set concentration or explicit count", "Charge neutralization mode"],
      },
    ],
  },
  {
    id: "forcefield",
    label: "Forcefield",
    color: "orange",
    colorClass: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    badgeClass: "bg-orange-500/20 text-orange-300",
    Icon: FlaskConical,
    nodes: [
      {
        name: "Assign Forcefield (Inorganic)",
        type: "forcefield",
        desc: "Assign force-field parameters. Inorganic tab: MINFF or CLAYFF (with Ka angle variants), or the Dummy FF for materials MINFF can't type — a frozen, qualitative model (EM/NVT only). Organic tab: OpenFF Sage / Parsley or GAFF (AM1-BCC / Gasteiger / none charges).",
        features: ["Inorganic: MINFF / CLAYFF (Ka variants) + Dummy FF (frozen, non-MINFF)", "Organic: OpenFF Sage / Parsley / GAFF + charge method", "Per-atom charges & bonded terms (or frozen for Dummy)", "Optional molecule name; outputs atoms + topology for MD/export"],
      },
    ],
  },
  {
    id: "analysis",
    label: "Analysis",
    color: "pink",
    colorClass: "bg-pink-500/10 border-pink-500/30 text-pink-400",
    badgeClass: "bg-pink-500/20 text-pink-300",
    Icon: BarChart3,
    nodes: [
      {
        name: "Analysis",
        type: "analysis",
        desc: "Run various structural analyses on the current system.",
        features: ["Radial Distribution Function (RDF)", "Coordination Number (CN)", "Closest atom distances", "Occupancy / density profiles", "Structure statistics"],
      },
      {
        name: "Bond & Angle Stats",
        type: "bondAngle",
        desc: "Compute and report bonded geometry statistics: bond lengths, angles, and torsions.",
        features: ["Bond length histograms", "Angle distributions", "Configurable cutoffs"],
      },
      {
        name: "BVS",
        type: "bvs",
        desc: "Bond Valence Sum analysis to validate oxidation states and identify under/over-coordinated atoms.",
        features: ["Per-atom BVS calculation", "Tabulated output", "Used to guide H placement"],
      },
      {
        name: "XRD Simulation",
        type: "xrd",
        desc: "Simulate X-ray diffraction patterns from the atomic structure.",
        features: ["Configurable wavelength (Cu Kα default)", "2θ range control", "Exports pattern as CSV"],
      },
    ],
  },
  {
    id: "simulation",
    label: "Simulation",
    color: "violet",
    colorClass: "bg-violet-500/10 border-violet-500/30 text-violet-400",
    badgeClass: "bg-violet-500/20 text-violet-300",
    Icon: Play,
    nodes: [
      {
        name: "Simulate",
        type: "simulate",
        desc: "Run an OpenMM molecular-dynamics simulation directly from the workflow. Works for mineral, organic, and mixed systems.",
        features: [
          "Mineral/inorganic: loads via ap.load_minff_into_openmm() (CLAYFF/MINFF)",
          "Organic / mixed: loads natively generated top/gro via OpenMM's GromacsTopFile",
          "Energy minimisation followed by NVT or NPT MD",
          "Langevin integrator, configurable temperature and step count",
          "PDB trajectory + state-data log written to the output bundle",
          "Falls back to input coordinates gracefully if OpenMM is unavailable",
        ],
      },
    ],
  },
  {
    id: "output",
    label: "Output & Visualization",
    color: "teal",
    colorClass: "bg-teal-500/10 border-teal-500/30 text-teal-400",
    badgeClass: "bg-teal-500/20 text-teal-300",
    Icon: FileOutput,
    nodes: [
      {
        name: "Structure Viewer",
        type: "viewer",
        desc: "Interactive 3D preview using 3Dmol.js (WebGL) or JSmol (Canvas) — toggle renderers in the node header. Save the view as a PNG (1×/2×/4×); JSmol adds measurements (right-click) and a 'Hide periodic bonds' option.",
        features: ["3Dmol: fast WebGL (Ball-and-Stick / Spheres / Lines)", "JSmol: scripting, symmetry, measurements, hide periodic bonds", "Save image as PNG (1×/2×/4×)", "Passthrough: does not alter atoms or box"],
      },
      {
        name: "Export",
        type: "export",
        desc: "Write the final structure and optional topology files to the output bundle.",
        features: [
          "Structure: .pdb, .gro, .xyz, .cif, .poscar, .sdf, .pqr",
          "Topology: .top/.itp (GROMACS), .data (LAMMPS), .psf (NAMD/OpenMM)",
          "Configurable output filename",
          "Multiple export nodes allowed per workflow",
        ],
      },
      {
        name: "Trajectory",
        type: "trajectory",
        desc: "Load and replay trajectory frames for post-simulation analysis.",
        features: ["Frame selection", "Per-frame analysis hookup"],
      },
    ],
  },
];

const outputBundleEntries = [
  { name: "build_script.py", desc: "Runtime script used for that run" },
  { name: "build_script_full.py", desc: "Full instrumented script with per-node safety wrappers" },
  { name: "build_script_strict_minimal.py", desc: "Boiled-down atomipy commands only" },
  { name: "build_script_notebook.ipynb", desc: "Jupyter notebook with per-node markdown cells" },
  { name: "workflow.json", desc: "Re-importable node graph" },
  { name: "build_summary.json", desc: "Execution metadata and summary" },
  { name: "execution_stdout.txt", desc: "Full console output from the run" },
  { name: "Structure & topology files", desc: "Based on your selected Export node settings" },
];

const quickSteps = [
  { step: "1", title: "Add Input Nodes", desc: "Start with one or more Import Structure nodes (upload or the Library)." },
  { step: "2", title: "Build the Workflow", desc: "Wire nodes left-to-right — atoms and box data flow through each operation." },
  { step: "3", title: "Configure Parameters", desc: "Set replication factors, ion count, forcefield, export format, etc." },
  { step: "4", title: "Validate & Run", desc: "Click Run to execute the generated Python script on the backend server." },
  { step: "5", title: "Download Bundle", desc: "The app returns a zip with structure files, scripts, logs, and your workflow JSON." },
];

// ─── Colour helpers ──────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { ring: string; dot: string }> = {
  blue:    { ring: "ring-blue-500/40",    dot: "bg-blue-400" },
  purple:  { ring: "ring-purple-500/40",  dot: "bg-purple-400" },
  violet:  { ring: "ring-violet-500/40",  dot: "bg-violet-400" },
  emerald: { ring: "ring-emerald-500/40", dot: "bg-emerald-400" },
  amber:   { ring: "ring-amber-500/40",   dot: "bg-amber-400" },
  cyan:    { ring: "ring-cyan-500/40",    dot: "bg-cyan-400" },
  orange:  { ring: "ring-orange-500/40",  dot: "bg-orange-400" },
  pink:    { ring: "ring-pink-500/40",    dot: "bg-pink-400" },
  teal:    { ring: "ring-teal-500/40",    dot: "bg-teal-400" },
};

// ─── Acknowledgements / third-party software & data ──────────────────────────

const acknowledgements: { group: string; items: { name: string; note?: string; href?: string }[] }[] = [
  {
    group: "Simulation engines & cheminformatics",
    items: [
      { name: "OpenMM", note: "molecular-dynamics engine (EM / NVT / NPT)", href: "https://openmm.org" },
      { name: "OpenFF Toolkit, Interchange & Sage force fields", note: "organic parametrization", href: "https://openforcefield.org" },
      { name: "ACPYPE + AmberTools (antechamber)", note: "GAFF / GAFF2 atom typing & charges", href: "https://github.com/alanwilter/acpype" },
      { name: "RDKit", note: "SMILES → 3D, cheminformatics", href: "https://www.rdkit.org" },
      { name: "Open Babel", note: "molecular format conversion", href: "https://openbabel.org" },
      { name: "GEMMI", note: "CIF reading & crystallographic symmetry expansion", href: "https://gemmi.readthedocs.io" },
      { name: "NumPy · Numba · tqdm", note: "numerics & acceleration" },
    ],
  },
  {
    group: "Force fields, water models & parameters",
    items: [
      { name: "MINFF", note: "mineral force field", href: "https://github.com/mholmboe/minff" },
      { name: "CLAYFF", note: "Cygan, Liang & Kalinichev (2004)" },
      { name: "SPC/E · OPC3 · TIP3P/4P/5P", note: "water models" },
      { name: "UFF — Rappé et al. (1992)", note: "Dummy-FF van der Waals parameters" },
      { name: "Heinz et al. (2008)", note: "Dummy-FF metallic (fcc) LJ parameters" },
    ],
  },
  {
    group: "Bundled structure & molecule libraries",
    items: [
      { name: "Avogadro2 molecules library", note: "organic molecules — BSD-3-Clause, © 2016 Geoffrey Hutchison, University of Pittsburgh", href: "https://github.com/OpenChemistry/molecules" },
      { name: "Avogadro2 crystals library", note: "inorganic crystals — public domain", href: "https://github.com/OpenChemistry/crystals" },
      { name: "IZA Structure Commission", note: "zeolite frameworks (public domain)", href: "http://www.iza-structure.org/databases/" },
      { name: "Crystallography Open Database (COD)", note: "crystal structures", href: "https://www.crystallography.net/cod/" },
    ],
  },
  {
    group: "Web interface",
    items: [
      { name: "React + Vite", note: "app framework & build" },
      { name: "React Flow (@xyflow/react)", note: "node-graph builder", href: "https://reactflow.dev" },
      { name: "3Dmol.js & JSmol / Jmol", note: "interactive molecular viewer", href: "https://3dmol.csb.pitt.edu" },
      { name: "Tailwind CSS · Radix UI (shadcn/ui) · lucide · sonner", note: "UI components & icons" },
      { name: "FastAPI · Uvicorn · Celery · Redis", note: "backend API & job queue" },
    ],
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-6 py-10 max-w-5xl">
        <div className="space-y-14">

          {/* ── Hero ── */}
          <section className="text-center space-y-4">
            <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-2">
              <BookOpen className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
              Help &amp; <span className="text-primary italic">Documentation</span>
            </h1>
            <p className="text-xl text-muted-foreground text-balance max-w-2xl mx-auto">
              A complete reference for every node, workflow pattern, and output format in the atomipy web module.
            </p>
          </section>

          {/* ── Quick start ── */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 text-primary font-semibold uppercase tracking-wider text-sm">
              <Zap className="h-4 w-4" />
              <span>Quick Start</span>
            </div>
            <h2 className="text-2xl font-bold">Build a Workflow (Typical Path)</h2>
            <div className="grid sm:grid-cols-5 gap-3">
              {quickSteps.map((item) => (
                <div key={item.step} className="flex flex-col p-4 rounded-xl border bg-card hover:shadow-md transition-shadow space-y-2 text-center items-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-sm leading-tight">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-snug">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Multi-component systems ── */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold uppercase tracking-wider text-sm">
              <Combine className="h-4 w-4" />
              <span>Multi-Component Systems</span>
            </div>
            <h2 className="text-2xl font-bold">Mixing Multiple Minerals &amp; Organics</h2>
            <p className="text-muted-foreground">
              Combine several different minerals (e.g. pyrophyllite + kaolinite) and/or several different
              organics (e.g. methanol + ethanol) in one system. The rule:{" "}
              <strong className="text-foreground">each distinct component is its own branch, joined with an Add node.</strong>
            </p>
            <pre className="rounded-xl border bg-card p-4 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre">{`Mineral A → Forcefield (MINFF/CLAYFF) ┐
Mineral B → Forcefield (MINFF/CLAYFF) ┤
Organic A → Forcefield (GAFF/OpenFF)  ┼─► Add ─► Ions / Solvent ─► Simulate / Export
Organic B → Forcefield (GAFF/OpenFF)  ┘`}</pre>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">One Forcefield node per component.</strong> One OpenFF/ACPYPE
                call per organic branch — two organics means two branches (you can't parametrize two molecules on
                one branch).
              </li>
              <li>
                <strong className="text-foreground">Names are automatic &amp; unique:</strong> minerals become{" "}
                <code className="text-foreground bg-muted px-1 rounded">MIN</code>,{" "}
                <code className="text-foreground bg-muted px-1 rounded">MIN_1</code>, …; a single organic stays{" "}
                <code className="text-foreground bg-muted px-1 rounded">organic</code>, multiple become{" "}
                <code className="text-foreground bg-muted px-1 rounded">organic_1</code>,{" "}
                <code className="text-foreground bg-muted px-1 rounded">organic_2</code>, ….
              </li>
              <li>
                <strong className="text-foreground">Optional naming:</strong> each Forcefield node has a
                "Molecule name" field (e.g. <code className="text-foreground bg-muted px-1 rounded">PYRO</code>,{" "}
                <code className="text-foreground bg-muted px-1 rounded">EtOH</code>) that sets the moleculetype/residue name.
              </li>
              <li>
                <strong className="text-foreground">Counts:</strong> replicated copies are set on the Replicate node;
                an exact water count on the Solvent node (More options → Max Molecules → Fixed count). The Topology
                node lets you review/override the final{" "}
                <code className="text-foreground bg-muted px-1 rounded">[ molecules ]</code> section.
              </li>
            </ul>
          </section>

          {/* ── Node reference ── */}
          <section className="space-y-8">
            <div className="flex items-center gap-2 text-primary font-semibold uppercase tracking-wider text-sm">
              <Layers className="h-4 w-4" />
              <span>Node Reference</span>
            </div>
            <h2 className="text-2xl font-bold">All Available Nodes by Category</h2>
            <p className="text-muted-foreground">
              Each node in the visual builder corresponds to one or more Python functions in the{" "}
              <code className="text-foreground bg-muted px-1 rounded text-sm">atomipy</code> library. Nodes are
              connected left-to-right; atoms and box dimensions propagate through the graph.
            </p>

            <div className="space-y-6">
              {nodeCategories.map((cat) => {
                const colors = COLOR_MAP[cat.color] ?? COLOR_MAP["teal"];
                return (
                  <div
                    key={cat.id}
                    className={`rounded-2xl border p-6 space-y-4 ring-1 ${colors.ring} ${cat.colorClass}`}
                  >
                    {/* Category header */}
                    <div className="flex items-center gap-3">
                      <cat.Icon className="h-5 w-5" />
                      <h3 className="text-lg font-bold">{cat.label}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.badgeClass}`}>
                        {cat.nodes.length} node{cat.nodes.length > 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Node cards */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {cat.nodes.map((node) => (
                        <div
                          key={node.type}
                          className="bg-background/70 rounded-xl border border-border/40 p-4 space-y-3 hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                            <span className="font-semibold text-sm text-foreground">{node.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{node.desc}</p>
                          <ul className="space-y-1">
                            {node.features.map((f) => (
                              <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/50" />
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Output bundle ── */}
          <section className="bg-muted/50 p-8 rounded-2xl space-y-5 border border-border/50">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Output Bundle Contents
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Each run produces a downloadable zip file containing generated outputs and full reproducibility artifacts.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {outputBundleEntries.map((item) => (
                <div key={item.name} className="rounded-lg border bg-background p-3 space-y-0.5">
                  <div className="text-sm font-mono text-foreground">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Results & data retention ── */}
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 space-y-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-amber-500" />
              <h2 className="text-2xl font-bold">Results &amp; data retention</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Results can only be downloaded right after they are generated. Nothing is stored on the server — there is no database or persistent storage — so results cannot be retrieved later, and no one else can access them. Always download and keep your own local copy.
            </p>
          </section>

          {/* ── File formats ── */}
          <section className="bg-muted/50 p-8 rounded-2xl space-y-5 border border-border/50">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <ArrowRight className="h-6 w-6 text-primary" />
              Supported File Formats
            </h2>
            <div className="grid sm:grid-cols-2 gap-8">
              <div className="space-y-3">
                <h3 className="font-semibold">Input Formats</h3>
                <div className="flex flex-wrap gap-2">
                  {[".pdb", ".gro", ".xyz", ".cif", ".mmcif", ".pqr", ".poscar", ".cjson"].map((fmt) => (
                    <span key={fmt} className="text-xs px-2 py-1 rounded-md border bg-background text-muted-foreground font-mono">{fmt}</span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Organic molecule uploads (GAFF/Sage parametrizer): <span className="font-mono">.mol</span>, <span className="font-mono">.mol2</span>, <span className="font-mono">.sdf</span>.
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold">Structure Output</h3>
                <div className="flex flex-wrap gap-2">
                  {[".pdb", ".gro", ".xyz", ".cif", ".poscar", ".sdf", ".pqr"].map((fmt) => (
                    <span key={fmt} className="text-xs px-2 py-1 rounded-md border bg-background text-muted-foreground font-mono">{fmt}</span>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold">Topology Output</h3>
                <div className="flex flex-wrap gap-2">
                  {[".top/.itp (GROMACS)", ".data (LAMMPS)", ".psf (NAMD/OpenMM)"].map((fmt) => (
                    <span key={fmt} className="text-xs px-2 py-1 rounded-md border bg-background text-muted-foreground">{fmt}</span>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold">Analysis Output</h3>
                <div className="flex flex-wrap gap-2">
                  {[".csv (XRD pattern)", ".txt (stats, logs)", ".json (summary)"].map((fmt) => (
                    <span key={fmt} className="text-xs px-2 py-1 rounded-md border bg-background text-muted-foreground">{fmt}</span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Bug report / support ── */}
          <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 space-y-5">
            <div className="flex items-center gap-3">
              <Bug className="h-6 w-6 text-destructive" />
              <h2 className="text-2xl font-bold">Report a Problem</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Encountered a bug, an unexpected error, or a node that behaves incorrectly? Please open a GitHub Issue — it takes under a minute and helps us improve the app for everyone.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild variant="destructive" className="w-full sm:w-auto gap-2">
                <a
                  href="https://github.com/mholmboe/atomipy-web-module/issues/new?template=bug_report.yml"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Bug className="h-4 w-4" />
                  Report a Bug
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
                <a
                  href="https://github.com/mholmboe/atomipy-web-module/issues/new?template=feature_request.yml"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageSquare className="h-4 w-4" />
                  Request a Feature
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
                <a
                  href="https://github.com/mholmboe/atomipy-web-module/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <AlertCircle className="h-4 w-4" />
                  View All Issues
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              You can also include your workflow JSON (File → Save / Download in the builder) and the error log from the Run output panel to help us reproduce the issue quickly.
            </p>
          </section>

          {/* ── Acknowledgements / dependencies ── */}
          <section className="bg-muted/50 p-8 rounded-2xl space-y-5 border border-border/50">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              Acknowledgements &amp; Dependencies
            </h2>
            <p className="text-muted-foreground leading-relaxed text-sm">
              atomipy and this web module are built on outstanding open-source scientific
              software and publicly available data. We gratefully acknowledge the projects
              below — their respective licenses apply to the components they provide.
            </p>
            <div className="grid sm:grid-cols-2 gap-8">
              {acknowledgements.map((g) => (
                <div key={g.group} className="space-y-3">
                  <h3 className="font-semibold">{g.group}</h3>
                  <ul className="space-y-1.5">
                    {g.items.map((it) => (
                      <li key={it.name} className="text-sm text-muted-foreground leading-snug">
                        {it.href ? (
                          <a
                            href={it.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-foreground hover:text-primary underline-offset-2 hover:underline"
                          >
                            {it.name}
                          </a>
                        ) : (
                          <span className="font-medium text-foreground">{it.name}</span>
                        )}
                        {it.note ? <> — {it.note}</> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* ── Links ── */}
          <section className="text-center py-8 border-t space-y-6">
            <h2 className="text-2xl font-bold">Related Resources</h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild variant="default" className="w-full sm:w-auto gap-2">
                <a href="https://topology.atomipy.io" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  atomipy topology generator
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
                <a href="https://github.com/mholmboe/atomipy" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  atomipy Python library
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto gap-2">
                <Link to="/">
                  Back to builder
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  );
};

export default About;
