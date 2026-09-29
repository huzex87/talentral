// Hausa versions of the labels learners see. Keys match the English maps they sit beside, so a
// screen picks one map by the learner's language. Text here needs review by a native speaker
// before wide release; hubs can report wording through their Talentral contact.
import type { LessonKind, QuestionKind } from './learning';
import type { Interest, JobType, Readiness, WorkAvailability, WorkMode } from './passport';

export type Language = 'en' | 'ha';

export const LESSON_KINDS_HA: Record<LessonKind, string> = {
  text: 'Karatu', video: 'Bidiyo', audio: 'Sauti', pdf: 'PDF', quiz: 'Jarrabawa', assignment: 'Aiki',
};

export const QUESTION_KINDS_HA: Record<QuestionKind, string> = { single: 'Amsa ɗaya', multiple: 'Amsoshi da yawa', true_false: 'Gaskiya ko ƙarya' };

export const WORK_MODES_HA: Record<WorkMode, string> = { remote: 'Daga nesa', hybrid: 'Gauraye', on_site: 'A wurin aiki' };

export const JOB_TYPES_HA: Record<JobType, string> = {
  full_time: 'Cikakken lokaci', part_time: 'Rabin lokaci', contract: 'Kwangila', internship: 'Koyon aiki', freelance: 'Aiki mai zaman kansa',
};

export const AVAILABILITY_HA: Record<WorkAvailability, string> = {
  immediately: 'A shirye yanzu',
  one_month: 'A shirye cikin wata ɗaya',
  three_months: 'A shirye cikin watanni uku',
  not_looking: 'Ba na neman aiki yanzu',
};

export const INTEREST_HA: Record<Interest, string> = { pending: 'Ana jiran amsarka', confirmed: 'Kana so', declined: 'Ba ka so' };

export const READINESS_HA: Record<Readiness, string> = {
  not_assessed: 'Ba a tantance ba tukuna',
  developing: 'Ana ci gaba',
  ready: 'A shirye',
  ready_verified: 'A shirye kuma an tabbatar',
};

export const READINESS_RULES_HA: Record<Readiness, string> = {
  not_assessed: 'Babu wani shiri a Talentral tukuna.',
  developing: 'Yana cikin wani shiri a Talentral kuma yana tara shaida ta hanyar halartar aji da ayyukan da aka duba.',
  ready: 'Yana da aƙalla takardar shaida ɗaya ta Talentral, wadda ya samu ta hanyar cika sharaɗin halartar aji da makin wucewa.',
  ready_verified: 'A shirye yake, kuma jami’in Talentral ya tabbatar da shaidarsa da ayyukansa.',
};

// Picks the label for a key from the English map or its Hausa partner.
export function label<K extends string>(en: Readonly<Record<K, string>>, ha: Readonly<Record<K, string>>, key: K, language: Language): string {
  return (language === 'ha' ? ha[key] : en[key]) ?? en[key];
}
