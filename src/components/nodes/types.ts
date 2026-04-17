export type NodeComponentProps<TData extends Record<string, unknown>> = {
  id: string;
  data: TData;
};

export type PresetOption = {
  id: string;
  name: string;
  fileName: string;
  metrics?: {
    a?: number | null;
    b?: number | null;
    c?: number | null;
    alpha?: number | null;
    beta?: number | null;
    gamma?: number | null;
  };
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const formatPresetLabel = (preset: PresetOption): string => {
  const metrics = preset.metrics;
  if (!metrics) return preset.name;

  const { a, b, c, alpha, beta, gamma } = metrics;
  const hasLengths = isFiniteNumber(a) && isFiniteNumber(b) && isFiniteNumber(c);
  const hasAngles = isFiniteNumber(alpha) && isFiniteNumber(beta) && isFiniteNumber(gamma);

  if (hasLengths && hasAngles) {
    return `${preset.name} (${a.toFixed(3)};${b.toFixed(3)};${c.toFixed(3)};${alpha.toFixed(2)};${beta.toFixed(2)};${gamma.toFixed(2)})`;
  }

  if (hasLengths) {
    return `${preset.name} (${a.toFixed(3)};${b.toFixed(3)};${c.toFixed(3)})`;
  }

  return preset.name;
};
