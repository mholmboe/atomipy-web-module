import { Atom, Github, ExternalLink, Info } from "lucide-react";
import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <nav className="bg-nav text-nav-foreground border-b border-border/40 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto flex items-center justify-between px-6 py-3">
        <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <Atom className="h-6 w-6 text-primary" />
          <div>
            <span className="text-lg font-bold tracking-tight">atomipy</span>
            <span className="ml-2 text-lg font-bold tracking-tight text-nav-foreground/60">web module</span>
          </div>
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <a href="https://atomipy-topology-generator-1000562662604.europe-north2.run.app" className="flex items-center gap-1 text-nav-foreground/80 transition-colors hover:text-primary">
            <ExternalLink className="h-3.5 w-3.5" />
            atomipy topology generator
          </a>
          <Link to="/about" className="flex items-center gap-1 text-nav-foreground/80 transition-colors hover:text-primary">
            <Info className="h-3.5 w-3.5" />
            About
          </Link>
          <a href="https://github.com/mholmboe/atomipy" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-nav-foreground/80 transition-colors hover:text-primary">
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
