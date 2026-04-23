import React from "react";
import { Bug } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border py-4 mt-8 bg-muted/30">
      <div className="container mx-auto px-6 text-center space-y-2">
        <div className="text-sm text-muted-foreground">
          Based on <a href="https://github.com/mholmboe/atomipy" className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer">atomipy</a> — The atom toolbox in Python
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
