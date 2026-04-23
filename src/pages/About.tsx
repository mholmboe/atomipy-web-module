import {
  Atom, ExternalLink, ArrowRight, BookOpen, Layers, BarChart3, Zap, Bug,
  FileInput, Grid3x3, Box, Move3D, Combine, PackagePlus, BadgePlus, Droplet,
  FlaskConical, Eye, FileOutput, GitMerge, Minimize, SlidersHorizontal,
  Waypoints, History, ChevronRight, AlertCircle, MessageSquare,
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
        desc: "Load a molecular structure from a built-in preset library (.cif) or upload your own file (.pdb, .gro, .xyz, .cif, .sdf, .poscar).",
        features: ["Preset library (clay minerals, water models, molecules)", "Custom file upload", "Outputs atoms + box"],
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
        desc: "Explicitly set or override the simulation box. Supports both Cell (a, b, c, α, β, γ) and Box_dim (lx, ly, lz, xy, xz, yz) parameterizations with live bidirectional conversion.",
        features: ["Cell ↔ Box_dim live conversion", "Auto-seeded from upstream structure", "Inherits through all passthrough nodes"],
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
        features: ["Insert from preset or upload", "Configurable insertion count", "Minimum distance filter"],
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
        name: "Assign Forcefield",
        type: "forcefield",
        desc: "Assign atom types, partial charges, and bonded parameters using MINFF or CLAYFF forcefield schemes.",
        features: ["MINFF / CLAYFF atom typing", "Charge assignment", "Configurable k_angle for bonded terms", "Writes .itp, .data, or .psf topology"],
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
        desc: "Interactive 3D preview of the current atom structure in the browser using 3Dmol.js.",
        features: ["Live 3D rendering", "Color by element or residue", "Ball-and-stick / Van der Waals styles", "Passthrough: does not alter atoms or box"],
      },
      {
        name: "Export",
        type: "export",
        desc: "Write the final structure and optional topology files to the output bundle.",
        features: [
          "Structure: .pdb, .gro, .xyz, .cif, .poscar, .sdf, .pqr",
          "Topology: .itp (GROMACS), .data (LAMMPS), .psf (NAMD)",
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
  { step: "1", title: "Add Input Nodes", desc: "Start with one or more Import Structure nodes (upload or preset)." },
  { step: "2", title: "Build the Workflow", desc: "Wire nodes left-to-right — atoms and box data flow through each operation." },
  { step: "3", title: "Configure Parameters", desc: "Set replication factors, ion count, forcefield, export format, etc." },
  { step: "4", title: "Validate & Run", desc: "Click Run to execute the generated Python script on the backend server." },
  { step: "5", title: "Download Bundle", desc: "The app returns a zip with structure files, scripts, logs, and your workflow JSON." },
];

// ─── Colour helpers ──────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { ring: string; dot: string }> = {
  blue:    { ring: "ring-blue-500/40",    dot: "bg-blue-400" },
  purple:  { ring: "ring-purple-500/40",  dot: "bg-purple-400" },
  emerald: { ring: "ring-emerald-500/40", dot: "bg-emerald-400" },
  amber:   { ring: "ring-amber-500/40",   dot: "bg-amber-400" },
  cyan:    { ring: "ring-cyan-500/40",    dot: "bg-cyan-400" },
  orange:  { ring: "ring-orange-500/40",  dot: "bg-orange-400" },
  pink:    { ring: "ring-pink-500/40",    dot: "bg-pink-400" },
  teal:    { ring: "ring-teal-500/40",    dot: "bg-teal-400" },
};

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
                  {[".pdb", ".gro", ".xyz", ".cif", ".sdf", ".poscar", ".pqr"].map((fmt) => (
                    <span key={fmt} className="text-xs px-2 py-1 rounded-md border bg-background text-muted-foreground font-mono">{fmt}</span>
                  ))}
                </div>
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
                  {[".itp (GROMACS)", ".data (LAMMPS)", ".psf (NAMD/OpenMM)"].map((fmt) => (
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

          {/* ── Links ── */}
          <section className="text-center py-8 border-t space-y-6">
            <h2 className="text-2xl font-bold">Related Resources</h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild variant="default" className="w-full sm:w-auto gap-2">
                <a href="https://atomipy-topology-generator-1000562662604.europe-north2.run.app" target="_blank" rel="noopener noreferrer">
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
