// Structural copy of the domain FormField, so the db package has no runtime dependency on domain.
export interface FormField {
  id: string; label: string; type: string; required: boolean; help?: string;
  options?: string[]; maxLength?: number; accept?: string[];
}
