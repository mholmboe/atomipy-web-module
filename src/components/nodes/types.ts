export type NodeComponentProps<TData extends Record<string, unknown>> = {
  id: string;
  data: TData;
  selected?: boolean;
  dragging?: boolean;
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
  return preset.name;
};
