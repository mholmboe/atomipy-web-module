import { useEffect, useState } from "react";

// Shared bundled inorganic material library (GET /api/inorganic-library).
// First category is 'MINFF presets' (curated UC_conf, force-field-ready), then
// the Avogadro crystal categories (oxides, halides, sulfides, zeolites, …).
// Fetched once and cached at module scope so every node instance reuses it.

export type InorgMaterial = {
  name: string;
  file: string;
  source: "preset" | "crystal";
  formula?: string;
  mineral?: string;
  elements?: string[];
};
export type InorgCategory = { name: string; source: string; materials: InorgMaterial[] };

let _inorgLibCache: InorgCategory[] | null = null;
let _inorgLibPromise: Promise<InorgCategory[]> | null = null;

export function useInorganicLibrary(): InorgCategory[] {
  const [cats, setCats] = useState<InorgCategory[]>(_inorgLibCache ?? []);
  useEffect(() => {
    if (_inorgLibCache) { setCats(_inorgLibCache); return; }
    if (!_inorgLibPromise) {
      _inorgLibPromise = fetch("/api/inorganic-library")
        .then((r) => r.json())
        .then((d) => { _inorgLibCache = Array.isArray(d?.categories) ? d.categories : []; return _inorgLibCache!; })
        .catch(() => { _inorgLibCache = []; return _inorgLibCache!; });
    }
    _inorgLibPromise.then(setCats);
  }, []);
  return cats;
}

// "amino_acids" → "Amino Acids"; "MINFF presets" stays as-is.
export const prettyCategory = (name: string) =>
  name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
