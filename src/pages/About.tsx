import { Atom, ExternalLink, ArrowRight, BookOpen, Layers, BarChart3, Zap } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const quickSteps = [
  {
    title: "1. Add Input Nodes",
    desc: "Start with one or more Structure nodes (upload or preset).",
  },
  {
    title: "2. Connect Workflow Logic",
    desc: "Wire nodes left-to-right so atoms and box data flow through each operation.",
  },
  {
    title: "3. Configure Parameters",
    desc: "Set replication factors, ion count, forcefield choices, analysis settings, and export options.",
  },
  {
    title: "4. Validate + Run",
    desc: "Click Run to execute the generated Python script on the backend.",
  },
  {
    title: "5. Download Result Bundle",
    desc: "The app returns a zip with generated structures, scripts, logs, and workflow JSON.",
  },
];

const outputBundleEntries = [
  "`build_script.py` (runtime script used for that run)",
  "`build_script_full.py` (full export with instrumentation and node-level safety wrappers)",
  "`build_script_strict_minimal.py` (boiled-down atomipy commands only)",
  "`build_script_notebook.ipynb` (Jupyter notebook derived from strict-minimal flow)",
  "`workflow.json` (re-importable node graph)",
  "`build_summary.json` and `execution_stdout.txt`",
  "Generated structure/topology/analysis files based on your selected nodes",
];

const coordinateFormats = [
  ".xyz",
  ".gro",
  ".pdb",
  ".cif",
  ".pqr",
  ".poscar",
  ".sdf",
];

const topologyFormats = [
  ".itp (GROMACS)",
  ".data (LAMMPS)",
  ".psf (NAMD/OpenMM)",
];

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-6 py-12 max-w-4xl">
        <div className="space-y-12">
          {/* Hero Section */}
          <section className="text-center space-y-4">
            <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-4">
              <Atom className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
              About  <span className="text-primary italic"> atomipy</span>
            </h1>
            <p className="text-xl text-muted-foreground text-balance">
              Constructing molecular systems with visual clarity and scientific precision.
            </p>
          </section>

          <div className="grid gap-12 pt-8">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-primary font-semibold uppercase tracking-wider text-sm">
                <Zap className="h-4 w-4" />
                <span>What It Does</span>
              </div>
              <h2 className="text-2xl font-bold">A Visual Workflow Engine for atomipy</h2>
              <p className="text-muted-foreground leading-relaxed">
                The <span className="text-foreground font-medium">atomipy web module</span> turns system construction into a transparent node graph. Instead of hand-writing long scripts, you define structure import, transformations, chemistry, forcefield assignment, analysis, and export through connected operations.
              </p>
            </section>

            <section className="space-y-6">
              <div className="flex items-center gap-2 text-primary font-semibold uppercase tracking-wider text-sm">
                <BookOpen className="h-4 w-4" />
                <span>How To Use</span>
              </div>
              <h2 className="text-2xl font-bold">Build Workflow (Typical Path)</h2>

              <div className="grid sm:grid-cols-2 gap-4">
                {quickSteps.map((item) => (
                  <div key={item.title} className="p-5 rounded-xl border bg-card hover:shadow-md transition-shadow space-y-3">
                    <Layers className="h-6 w-6 text-primary" />
                    <h3 className="font-bold">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-snug">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-primary/5 p-8 rounded-2xl space-y-4 border border-primary/20">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Layers className="h-6 w-6 text-primary" />
                Node Types and Capabilities
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                The app supports structure input, replication/box edits, transforms (translate/rotate/scale/bend), solvent/ion insertion, substitutions, forcefield typing, bonded-term analysis, BVS, XRD, trajectory I/O, and final structure/topology export. You can combine these in arbitrary acyclic graphs.
              </p>
            </section>

            <section className="bg-muted/50 p-8 rounded-2xl space-y-5 border border-border/50">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                Output Bundle Contents
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Each run returns a zip bundle containing generated outputs and reproducibility artifacts.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {outputBundleEntries.map((item) => (
                  <div key={item} className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-muted/50 p-8 rounded-2xl space-y-5 border border-border/50">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <ArrowRight className="h-6 w-6 text-primary" />
                Supported Export File Formats
              </h2>

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="font-semibold">Structure Formats</h3>
                  <div className="flex flex-wrap gap-2">
                    {coordinateFormats.map((fmt) => (
                      <span key={fmt} className="text-xs px-2 py-1 rounded-md border bg-background text-muted-foreground">
                        {fmt}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="font-semibold">Topology Formats</h3>
                  <div className="flex flex-wrap gap-2">
                    {topologyFormats.map((fmt) => (
                      <span key={fmt} className="text-xs px-2 py-1 rounded-md border bg-background text-muted-foreground">
                        {fmt}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-primary/5 p-8 rounded-2xl space-y-5 border border-primary/20">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-primary" />
                Python and Jupyter Script Types
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-background p-4 space-y-2">
                  <h3 className="font-semibold">Full Script</h3>
                  <p className="text-sm text-muted-foreground">
                    <code>build_script_full.py</code> includes node instrumentation, logging hooks, and per-node safety wrappers for traceability.
                  </p>
                </div>
                <div className="rounded-xl border bg-background p-4 space-y-2">
                  <h3 className="font-semibold">Strict Minimal Script</h3>
                  <p className="text-sm text-muted-foreground">
                    <code>build_script_strict_minimal.py</code> is boiled down to essential <code>atomipy</code> commands with minimal surrounding logic.
                  </p>
                </div>
                <div className="rounded-xl border bg-background p-4 space-y-2">
                  <h3 className="font-semibold">Notebook Script</h3>
                  <p className="text-sm text-muted-foreground">
                    <code>build_script_notebook.ipynb</code> is based on the strict-minimal flow and adds per-node markdown documentation plus detected <code>ap.*</code> function usage.
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                The runtime script used during execution is saved as <code>build_script.py</code> in the bundle.
              </p>
            </section>

            <section className="bg-muted/50 p-8 rounded-2xl space-y-4 border border-border/50">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Zap className="h-6 w-6 text-primary" />
                Scientific Features
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                The module integrates CLAYFF/MINFF atomtyping workflows, XRD simulation, bonded-term generation, and BVS-based validation for mineral and interface systems.
              </p>
            </section>

            <section className="text-center py-12 border-t space-y-6">
              <h2 className="text-2xl font-bold">Go Deeper</h2>
              <p className="text-muted-foreground">
                Looking for the original topology generator and forcefield tools?
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button asChild variant="default" className="w-full sm:w-auto">
                  <a href="https://www.atomipy.io/about" target="_blank" rel="noopener noreferrer" className="gap-2">
                    <ExternalLink className="h-4 w-4" />
                    atomipy topology generator
                  </a>
                </Button>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link to="/" className="gap-2">
                    Back to atomipy web module
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default About;
