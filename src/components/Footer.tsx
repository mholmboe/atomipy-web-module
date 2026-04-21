import React from "react";

const Footer = () => {
  return (
    <footer className="border-t border-border py-12 mt-12 bg-muted/30">
      <div className="container mx-auto px-6 text-center space-y-4">
        <div className="text-sm text-muted-foreground">
          Based on <a href="https://github.com/mholmboe/atomipy" className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer">atomipy</a> — The atom toolbox in Python
        </div>
        <div className="text-xs text-muted-foreground/60">
          &copy; {new Date().getFullYear()} atomipy project. Open source and science-first.
        </div>
        <div className="pt-2">
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
