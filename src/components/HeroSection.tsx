import { motion } from "framer-motion";

const HeroSection = () => {
  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-nav via-nav/95 to-background pb-6 pt-8">
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(192, 82%, 45%)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="container relative mx-auto px-6 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-4xl font-bold tracking-tight text-nav-foreground md:text-5xl"
        >
          Molecular multicomponent and topology generator
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mx-auto mt-4 max-w-5xl text-base text-nav-foreground/85 md:text-lg"
        >
          Build or analyze multicomponent molecular systems by adding molecules or replicate unit cells in to slabs, move them around, set the box, add ions, and solvate — then export structure and topology files.
        </motion.p>
      </div>
    </div>
  );
};

export default HeroSection;
