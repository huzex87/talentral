import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_GROUPS, auditDetails, auditGroup, auditPatterns, describeAudit } from '../src';

describe('audit log wording', () => {
  it('puts every known action in a group', () => {
    for (const action of Object.keys(AUDIT_ACTIONS)) expect(auditGroup(action), action).not.toBe('other');
    expect(auditGroup('applications.bulk_status')).toBe('application');
    expect(auditGroup('certificates.issued')).toBe('certificate');
    expect(auditGroup('account.two_step_enabled')).toBe('account');
    expect(auditGroup('mystery.thing')).toBe('other');
  });
  it('describes known and unknown actions', () => {
    expect(describeAudit('member.role_changed')).toBe('Changed a team member’s role');
    expect(describeAudit('new.kind_of_event')).toBe('new kind of event');
  });
  it('filters a group by both singular and plural prefixes', () => {
    expect(auditPatterns('application')).toEqual(['application.%', 'applications.%']);
    expect(auditPatterns('nope')).toEqual([]);
    expect(Object.keys(AUDIT_GROUPS)).toContain('discussion');
  });
  it('summarises simple details and skips nested ones', () => {
    expect(auditDetails({ from: 'submitted', to: 'shortlisted', rows: [1, 2], note: '' })).toBe('from: submitted · to: shortlisted');
    expect(auditDetails(null)).toBe('');
  });
});
