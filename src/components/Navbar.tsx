import { Atom, Github, ExternalLink } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="bg-nav text-nav-foreground">
      <div className="container mx-auto flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2.5">
          <Atom className="h-6 w-6 text-primary" />
          <div>
            <span className="text-lg font-bold tracking-tight">atomipy</span>
            <span className="ml-2 text-xs text-nav-foreground/60">web module</span>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <a href="https://www.atomipy.io" className="flex items-center gap-1 text-nav-foreground/80 transition-colors hover:text-primary">
            <ExternalLink className="h-3.5 w-3.5" />
            Atom Typer
          </a>
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
