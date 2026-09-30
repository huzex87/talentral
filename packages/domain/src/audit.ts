// The audit log in plain words: what each recorded action means, and the groups used to filter it.

export const AUDIT_ACTIONS: Record<string, string> = {
  'application.submitted': 'Submitted an application',
  'application.status': 'Changed an application’s status',
  'applications.bulk_status': 'Changed the status of several applications',
  'applications.exported': 'Exported applications',
  'applications.imported': 'Imported participants',
  'applications.notified': 'Emailed applicants about a decision',
  'certificate.revoked': 'Revoked a certificate',
  'certificates.issued': 'Issued certificates',
  'cohort.admitted': 'Admitted applicants to a cohort',
  'cohort.course_set': 'Set the course for a cohort',
  'cohort.created': 'Created a cohort',
  'cohort.enrolment_status': 'Changed a learner’s enrolment',
  'cohort.nudges_updated': 'Changed the nudges for inactive learners',
  'cohort.funder_summary_updated': 'Updated a funder report summary',
  'course.created': 'Created a course',
  'course.published': 'Published a course',
  'course.draft': 'Took a course back to draft',
  'submission.graded': 'Graded a learner’s work',
  'submission.resubmit': 'Asked a learner to try again',
  'peer_review.hidden': 'Hid a peer review',
  'peer_review.restored': 'Restored a peer review',
  'file.downloaded': 'Downloaded an applicant’s file',
  'hub.profile_updated': 'Updated the hub profile',
  'hub.status': 'Changed the hub’s status',
  'hub.two_step_required': 'Required two-step sign-in for the team',
  'hub.two_step_optional': 'Made two-step sign-in optional for the team',
  'impact.exported': 'Exported impact data',
  'member.invited': 'Invited a team member',
  'member.joined': 'Joined the team',
  'member.removed': 'Removed a team member',
  'member.role_changed': 'Changed a team member’s role',
  'message.sent': 'Sent a bulk message',
  'programme.created': 'Created a programme',
  'programme.form_updated': 'Changed an application form',
  'programme.partner_added': 'Added a programme partner',
  'programme.partner_removed': 'Removed a programme partner',
  'programme.rubric_updated': 'Changed a screening rubric',
  'programme.status': 'Opened or closed a programme',
  'programme.updated': 'Updated programme details',
  'session.attendance_confirmed': 'Confirmed a class register',
  'skill.added': 'Added a skill',
  'discussion.hidden': 'Hid a discussion',
  'discussion.restored': 'Restored a discussion',
  'discussion.reply_hidden': 'Hid a discussion reply',
  'discussion.reply_restored': 'Restored a discussion reply',
  'account.two_step_enabled': 'Turned on two-step sign-in',
  'account.two_step_disabled': 'Turned off two-step sign-in',
  'account.recovery_codes_replaced': 'Made new recovery codes',
  'account.recovery_code_used': 'Signed in with a recovery code',
  'account.data_exported': 'Downloaded their own data',
  'privacy.request_erasure': 'Asked for their data to be deleted',
  'privacy.request_correction': 'Asked for their data to be corrected',
  'privacy.request_completed': 'Completed a data request',
  'privacy.request_declined': 'Declined a data request',
  'privacy.erasure_completed': 'Deleted a person’s data at their request',
  'support.started': 'Talentral support opened the hub',
  'support.ended': 'Talentral support closed the hub',
  'security.incident_recorded': 'Recorded a security incident',
  'security.incident_notified': 'Marked a security incident as reported to the NDPC',
  'security.incident_resolved': 'Marked a security incident as resolved',
};

export const AUDIT_GROUPS: Record<string, string> = {
  application: 'Applications',
  programme: 'Programmes',
  cohort: 'Cohorts and learners',
  certificate: 'Certificates',
  member: 'Team',
  hub: 'Hub settings',
  discussion: 'Discussions',
  message: 'Messages',
  file: 'File downloads',
  session: 'Classes',
  course: 'Courses',
  submission: 'Grading',
  peer_review: 'Peer reviews',
  skill: 'Skills',
  impact: 'Impact exports',
  account: 'Account security',
  privacy: 'Privacy requests',
  support: 'Talentral support access',
  security: 'Security incidents',
};

// "applications.bulk_status" and "application.status" both belong to "application".
export function auditGroup(action: string): string {
  const head = action.split('.')[0] ?? action;
  const g = head.endsWith('s') && !(head in AUDIT_GROUPS) ? head.slice(0, -1) : head;
  return g in AUDIT_GROUPS ? g : 'other';
}

export function describeAudit(action: string): string {
  return AUDIT_ACTIONS[action] ?? action.replace(/[._]/g, ' ');
}

// The action prefixes that make up a group, for filtering in SQL with "like any".
export function auditPatterns(group: string): string[] {
  if (!(group in AUDIT_GROUPS)) return [];
  return [`${group}.%`, `${group}s.%`];
}

// A short, readable summary of the details stored with an event.
export function auditDetails(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata) return '';
  return Object.entries(metadata)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
    .slice(0, 4)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
    .join(' · ');
}
