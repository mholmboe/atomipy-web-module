import React from "react";
import { Bug } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border py-4 mt-8 bg-muted/30">
      <div className="container mx-auto px-6 text-center space-y-2">
        <div className="text-sm text-muted-foreground">
          Based on <a href="https://github.com/mholmboe/atomipy" className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer">atomipy</a> — The atom toolbox in Python.
          Supporting <a href="https://github.com/mholmboe/minff" className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer">MINFF</a> and CLAYFF.
        </div>
        <div className="text-xs text-muted-foreground/60">
          Built with{" "}
          <a href="https://openmm.org/" target="_blank" rel="noopener noreferrer" className="hover:underline">OpenMM</a>,{" "}
          <a href="https://www.gromacs.org/" target="_blank" rel="noopener noreferrer" className="hover:underline">GROMACS</a>,{" "}
          <a href="https://openforcefield.org/" target="_blank" rel="noopener noreferrer" className="hover:underline">OpenFF</a>/<a href="https://github.com/alanwilter/acpype" target="_blank" rel="noopener noreferrer" className="hover:underline">ACPYPE</a>,{" "}
          <a href="https://gemmi.readthedocs.io/" target="_blank" rel="noopener noreferrer" className="hover:underline">GEMMI</a>, and the{" "}
          <a href="https://3dmol.org/" target="_blank" rel="noopener noreferrer" className="hover:underline">3Dmol.js</a>,{" "}
          <a href="https://jmol.sourceforge.net/" target="_blank" rel="noopener noreferrer" className="hover:underline">Jmol/JSmol</a> &amp;{" "}
          <a href="https://nglviewer.org/" target="_blank" rel="noopener noreferrer" className="hover:underline">NGL</a> viewers. See the README for full credits.
        </div>
        <div className="text-xs text-muted-foreground/60">
          &copy; {new Date().getFullYear()} atomipy project. Open source and science-first.
          {" · "}
          <a
            href="https://github.com/mholmboe/atomipy-web-module/issues/new?template=bug_report.yml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground/60 hover:text-destructive transition-colors"
          >
            <Bug className="h-3 w-3" />
            Report a problem
          </a>
        </div>
        <div className="text-xs text-muted-foreground/60 max-w-3xl mx-auto leading-relaxed">
          <span className="font-semibold">Disclaimer:</span> atomipy, this app, and the bundled force-field
          implementations (MINFF, CLAYFF, GAFF/OpenFF, Dummy FF) are provided <span className="italic">as-is</span> for
          research/beta use, with no warranty and no guarantee of correctness. The author accepts no responsibility or
          liability for the accuracy of atomipy, the applications, or the force-field implementations, or for any use of
          their output. Always verify generated structures, topologies, parameters, and results yourself — use at your own risk.
        </div>
        <div className="text-xs text-muted-foreground/60">
          Privacy-friendly, cookieless analytics — we never store your structures, coordinates, or results.
        </div>
        <div className="pt-1">
          <a href="https://visitorbadge.io/status?path=atomipy-web-module" target="_blank" rel="noopener noreferrer">
            <img
              src="https://api.visitorbadge.io/api/visitors?path=atomipy-web-module&label=visitors&countColor=%23263759"
              alt="visitor badge"
              className="mx-auto h-5 opacity-80 hover:opacity-100 transition-opacity"
            />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
