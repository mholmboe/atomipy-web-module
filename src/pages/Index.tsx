import HeroSection from "@/components/HeroSection";
import VisualBuilder from "@/components/VisualBuilder";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <VisualBuilder />
      <Footer />
    </div>
  );
};

export default Index;
