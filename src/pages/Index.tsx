import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import VisualBuilder from "@/components/VisualBuilder";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <VisualBuilder />
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Based on <a href="https://github.com/mholmboe/atomipy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">atomipy</a> — Mineral-based MD simulation tools
      </footer>
    </div>
  );
};

export default Index;
