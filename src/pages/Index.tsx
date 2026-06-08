import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import VisualBuilder from "@/components/VisualBuilder";
import Footer from "@/components/Footer";
import ColdStartNotice from "@/components/ColdStartNotice";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <ColdStartNotice />
      <HeroSection />
      <VisualBuilder />
      <Footer />
    </div>
  );
};

export default Index;
