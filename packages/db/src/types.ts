// Row shapes returned by queries. Kept next to the migrations; update both together.
import type { Criterion, FormField } from './form-types';

export type Role = 'owner' | 'admin' | 'reviewer';

export interface User { id: string; email: string; full_name: string | null; is_platform_admin: boolean; language: 'en' | 'ha' }

export interface Tenant {
  id: string; slug: string; name: string; tagline: string | null; description: string | null;
  logo_path: string | null; brand_color: string | null; website: string | null; contact_email: string | null;
  contact_phone: string | null; state: string | null; address: string | null; socials: Record<string, string>;
  status: 'active' | 'suspended'; profile_completed_at: Date | null; created_at: Date; require_two_step: boolean;
  custom_domain: string | null; domain_token: string | null;
  domain_status: 'pending' | 'verified' | 'failed' | null; domain_checked_at: Date | null; domain_verified_at: Date | null; domain_error: string | null;
  email_from_name: string | null; email_reply_to: string | null; email_footer: string | null;
  cover_path: string | null;
}

export interface Programme {
  id: string; tenant_id: string; slug: string; title: string; summary: string | null; description: string | null;
  eligibility: string | null; tracks: string[]; form: FormField[]; rubric: Criterion[]; opens_at: Date | null; closes_at: Date | null;
  capacity: number | null; status: 'draft' | 'open' | 'closed'; reference_prefix: string; created_at: Date; updated_at: Date;
}

export interface Application {
  id: string; tenant_id: string; programme_id: string; reference: string; email: string; full_name: string;
  phone: string; track: string | null; answers: Record<string, unknown>; status: string;
  consent_at: Date; submitted_at: Date; updated_at: Date; source: 'applied' | 'imported'; imported_by: string | null;
}

export interface ApplicationScore {
  id: string; tenant_id: string; application_id: string; reviewer_id: string;
  scores: Record<string, number>; percent: string; comment: string | null; created_at: Date; updated_at: Date;
}
