import { Atom, ExternalLink, ArrowRight, BookOpen, Layers, BarChart3, Zap } from "lucide-react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

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
              About <span className="text-primary italic">atomipy</span>
            </h1>
            <p className="text-xl text-muted-foreground text-balance">
              Constructing molecular systems with visual clarity and scientific precision.
            </p>
          </section>

          <div className="grid gap-12 pt-8">
            {/* What is it section */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-primary font-semibold uppercase tracking-wider text-sm">
                <Zap className="h-4 w-4" />
                <span>The Vision</span>
              </div>
              <h2 className="text-2xl font-bold">A Visual Workflow Engine</h2>
              <p className="text-muted-foreground leading-relaxed">
                The <span className="text-foreground font-medium">atomipy web module</span> is designed to bridge the gap between complex Python scripts and visual research design. Instead of writing code to build molecular slabs or solvate systems, you can chain visual nodes to create a transparent, reproducible pipeline.
              </p>
            </section>

            {/* Manual Section */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 text-primary font-semibold uppercase tracking-wider text-sm">
                <BookOpen className="h-4 w-4" />
                <span>Quick Manual</span>
              </div>
              <h2 className="text-2xl font-bold">How to Build Your System</h2>
              
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  {
                    title: "Add Nodes",
                    desc: "Use the top toolbar to add 'Structure', 'Box', 'Merge', or 'Solv' nodes to your canvas.",
                    icon: Layers
                  },
                  {
                    title: "Connect Logic",
                    desc: "Drag connections between handles to pass atoms and cell dimensions from one operation to the next.",
                    icon: ArrowRight
                  },
                  {
                    title: "Configure",
                    desc: "Set parameters like replication factors, ion counts, or XRD wavelength directly inside each node.",
                    icon: Zap
                  },
                  {
                    title: "Export Results",
                    desc: "Generate a full simulation package for GROMACS or LAMMPS, including a Python script for local use.",
                    icon: BarChart3
                  }
                ].map((item, i) => (
                  <div key={i} className="p-5 rounded-xl border bg-card hover:shadow-md transition-shadow space-y-3">
                    <item.icon className="h-6 w-6 text-primary" />
                    <h3 className="font-bold">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-snug">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* XRD Simulation Section */}
            <section className="bg-muted/50 p-8 rounded-2xl space-y-4 border border-border/50">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                Integrated XRD Simulation
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                One of the core features of <strong>atomipy</strong> is the ability to simulate Powder X-ray Diffraction (XRD) patterns on-the-fly. You can test your structures for preferred orientation, instrumental broadening, and wavelength effects without ever leaving the builder.
              </p>
            </section>

            {/* External Links Section */}
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
                    Back to Builder
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </section>
          </div>
        </div>
      </main>
      
      <footer className="py-12 border-t mt-12">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} atomipy project. Open source and science-first.
        </div>
      </footer>
    </div>
  );
};

export default About;
