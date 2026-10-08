import { describe, expect, it } from 'vitest';
import { isPrivateHost, nextWebhookAttempt, tutorKeywords, tutorPassages, webhookUrlProblem, WEBHOOK_MAX_ATTEMPTS } from '../src/integrations';

describe('webhooks', () => {
  it('accepts public https addresses and explains the rest', () => {
    expect(webhookUrlProblem('https://crm.kirkira.ng/talentral')).toBeNull();
    expect(webhookUrlProblem('crm.kirkira.ng')).toMatch(/full address/);
    expect(webhookUrlProblem('http://crm.kirkira.ng/hook')).toMatch(/https/);
    expect(webhookUrlProblem('https://user:pw@crm.kirkira.ng/hook')).toMatch(/passwords/);
    expect(webhookUrlProblem('https://192.168.1.4/hook')).toMatch(/public address/);
    expect(webhookUrlProblem('https://localhost:8080/hook')).toMatch(/public address/);
    // Tests may post to a local receiver.
    expect(webhookUrlProblem('http://127.0.0.1:4010/hook', true)).toBeNull();
  });

  it('knows private, local and link-local hosts', () => {
    for (const h of ['127.0.0.1', '10.2.3.4', '172.20.0.1', '192.168.0.10', '169.254.169.254', '100.64.0.1', '[::1]', 'fd00::1', 'fe80::1', 'printer', 'db.internal'])
      expect(isPrivateHost(h), h).toBe(true);
    for (const h of ['8.8.8.8', '172.32.0.1', 'hooks.example.com', '2606:4700::1111']) expect(isPrivateHost(h), h).toBe(false);
  });

  it('backs off between attempts, then gives up', () => {
    const now = new Date('2026-10-04T10:00:00Z');
    expect(nextWebhookAttempt(1, now)?.toISOString()).toBe('2026-10-04T10:01:00.000Z');
    expect(nextWebhookAttempt(3, now)?.toISOString()).toBe('2026-10-04T10:30:00.000Z');
    expect(nextWebhookAttempt(WEBHOOK_MAX_ATTEMPTS, now)).toBeNull();
  });
});

describe('AI tutor', () => {
  it('keeps the words worth searching for, in English and Hausa', () => {
    expect(tutorKeywords('What is the difference between a div and a span tag?')).toEqual(['difference', 'span', 'div', 'tag']);
    expect(tutorKeywords('Menene amfanin CSS a cikin shafi?')).toEqual(['amfanin', 'shafi', 'css']);
    expect(tutorKeywords('???')).toEqual([]);
  });

  it('picks the paragraphs that answer the question, within a budget', () => {
    const lessons = [
      { id: 'a', title: 'Tags', body: 'Welcome to week one.\n\nA tag wraps content. The div tag groups blocks.\n\nNext week: CSS.' },
      { id: 'b', title: 'Inline', body: 'Unrelated intro.\n\nThe span tag is inline.' },
    ];
    const p = tutorPassages(lessons, ['span', 'div', 'tag']);
    expect(p.map((x) => x.lessonId)).toEqual(['a', 'b']);
    expect(p[0]!.text).toContain('div tag groups blocks');
    expect(p[1]!.text).toBe('The span tag is inline.');
    expect(tutorPassages(lessons, ['span'], 1500).reduce((n, x) => n + x.text.length, 0)).toBeLessThanOrEqual(1500);
  });
});

describe('case studies', () => {
  it('reads headline figures typed as Label: value', async () => {
    const { parseStoryMetrics, storyMetricsText } = await import('../src/integrations');
    const ok = parseStoryMetrics('Learners completed: 84%\n\nWomen selected: 52%\nPlaced in work within 90 days: 31');
    expect(ok).toEqual({ metrics: [{ label: 'Learners completed', value: '84%' }, { label: 'Women selected', value: '52%' }, { label: 'Placed in work within 90 days', value: '31' }], error: null });
    expect(storyMetricsText(ok.metrics)).toBe('Learners completed: 84%\nWomen selected: 52%\nPlaced in work within 90 days: 31');
    expect(parseStoryMetrics('Just a number').error).toMatch(/Label: value/);
    expect(parseStoryMetrics('a: 1\nb: 2\nc: 3\nd: 4\ne: 5').error).toMatch(/four/);
    expect(parseStoryMetrics('Start time: 10:30am').metrics).toEqual([{ label: 'Start time', value: '10:30am' }]);
  });
});
