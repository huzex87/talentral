// Structural copy of the domain FormField, so the db package has no runtime dependency on domain.
export interface FormField {
  id: string; label: string; type: string; required: boolean; help?: string;
  options?: string[]; maxLength?: number; accept?: string[];
}

// Structural copy of the domain Criterion (screening rubric).
export interface Criterion { id: string; label: string; help?: string; max: number; weight: number }
