// What a hub team member should know about now: new applications, work waiting to be graded,
// learners who have gone quiet, today's classes, accepted applicants without a cohort and calls
// about to close. Built from the hub's own records each time (nothing extra is stored), and used
// by the notification bell in the dashboard and by the weekly summary email.
import type { Tx } from '@talentral/db';

export type InboxKind = 'applications' | 'grading' | 'inactive' | 'class' | 'admit' | 'closing';
export interface InboxItem { key: string; kind: InboxKind; title: string; detail: string; href: string; at: Date }

const TZ = { timeZone: 'Africa/Lagos' } as const;
const clock = (d: Date) => new Intl.DateTimeFormat('en-GB', { ...TZ, hour: '2-digit', minute: '2-digit' }).format(d);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-NG')} ${n === 1 ? one : many}`;

export async function loadInbox(tx: Tx, tenantId: string, slug: string, manage: boolean): Promise<InboxItem[]> {
  const base = `/dashboard/${slug}`;
  const [apps, grading, inactive, classes, admit, closing] = await Promise.all([
    tx<{ programme_id: string; title: string; n: number; latest: Date }[]>`
      select p.id as programme_id, p.title, count(*)::int as n, max(a.submitted_at) as latest
      from public.applications a join public.programmes p on p.id = a.programme_id
      where a.tenant_id = ${tenantId} and a.status = 'submitted' and a.submitted_at > now() - interval '7 days'
      group by p.id, p.title order by latest desc`,
    tx<{ n: number; oldest: Date | null; latest: Date | null }[]>`
      select count(*)::int as n, min(submitted_at) as oldest, max(submitted_at) as latest
      from public.submissions where tenant_id = ${tenantId} and status = 'submitted'`,
    tx<{ cohort_id: string; name: string; n: number; latest: Date }[]>`
      select c.id as cohort_id, c.name, count(distinct n.enrolment_id)::int as n, max(n.created_at) as latest
      from public.nudges n join public.cohorts c on c.id = n.cohort_id
      where n.tenant_id = ${tenantId} and n.step = 'team' and n.created_at > now() - interval '7 days'
      group by c.id, c.name order by latest desc`,
    tx<{ id: string; title: string; starts_at: Date; cohort_id: string; cohort: string }[]>`
      select s.id, s.title, s.starts_at, c.id as cohort_id, c.name as cohort
      from public.class_sessions s join public.cohorts c on c.id = s.cohort_id
      where s.tenant_id = ${tenantId} and s.ends_at > now() and s.starts_at < now() + interval '24 hours' order by s.starts_at limit 4`,
    manage ? tx<{ n: number; latest: Date | null }[]>`
      select count(*)::int as n, max(a.updated_at) as latest from public.applications a
      where a.tenant_id = ${tenantId} and a.status = 'accepted' and not exists (select 1 from public.enrolments e where e.application_id = a.id)` : Promise.resolve([]),
    manage ? tx<{ id: string; title: string; closes_at: Date }[]>`
      select id, title, closes_at from public.programmes
      where tenant_id = ${tenantId} and status = 'open' and closes_at > now() and closes_at < now() + interval '3 days' order by closes_at` : Promise.resolve([]),
  ]);

  const items: InboxItem[] = [];
  for (const a of apps) items.push({
    key: `apps-${a.programme_id}`, kind: 'applications', at: new Date(a.latest),
    title: `${plural(a.n, 'new application')} to score`, detail: a.title,
    href: `${base}/applications?programme=${a.programme_id}&status=submitted`,
  });
  const g = grading[0];
  if (g && g.n > 0) {
    const days = g.oldest ? Math.floor((Date.now() - new Date(g.oldest).getTime()) / 86_400_000) : 0;
    items.push({ key: 'grading', kind: 'grading', at: new Date(g.latest!), title: `${plural(g.n, 'piece')} of work to grade`,
      detail: days >= 1 ? `The oldest has waited ${plural(days, 'day')}` : 'Handed in today', href: `${base}/grading` });
  }
  for (const c of inactive) items.push({
    key: `inactive-${c.cohort_id}`, kind: 'inactive', at: new Date(c.latest),
    title: `${plural(c.n, 'learner')} gone quiet`, detail: `${c.name} · no activity after a reminder`, href: `${base}/cohorts/${c.cohort_id}`,
  });
  for (const s of classes) items.push({
    key: `class-${s.id}`, kind: 'class', at: new Date(s.starts_at),
    title: s.title, detail: `${new Date(s.starts_at).getTime() < Date.now() ? 'On now' : `Starts ${clock(new Date(s.starts_at))}`} · ${s.cohort}`,
    href: `${base}/cohorts/${s.cohort_id}/sessions/${s.id}`,
  });
  const ad = admit[0];
  if (ad && ad.n > 0) items.push({ key: 'admit', kind: 'admit', at: new Date(ad.latest!),
    title: `${plural(ad.n, 'accepted applicant')} without a cohort`, detail: 'Add them to a cohort so they can start', href: `${base}/cohorts` });
  for (const p of closing) items.push({
    key: `closing-${p.id}`, kind: 'closing', at: new Date(Date.now() - 1),
    title: `Applications close ${new Intl.DateTimeFormat('en-GB', { ...TZ, weekday: 'long' }).format(new Date(p.closes_at))}`, detail: p.title,
    href: `${base}/programmes/${p.id}`,
  });
  return items.sort((x, y) => y.at.getTime() - x.at.getTime());
}

// The cookie that remembers when someone last opened the bell for this hub.
export const seenCookie = (tenantId: string) => `seen_${tenantId.replace(/-/g, '').slice(0, 16)}`;
