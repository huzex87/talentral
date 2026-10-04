import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { INTEREST, JOB_TYPES, SHORTLIST_DAYS, WORK_MODES, matchTalent, payRange, type Interest, type WorkMode } from '@talentral/domain';
import { ReadinessBadge } from '@/components/talent-card';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { discoverableTalent } from '@/lib/talent-data';
import { removeCandidate, revokeShortlistLink, setRoleStatus } from '../../actions';
import { AddCandidateButton, CandidateForm, ShareLinkButton } from '../../forms';
import { TalentShell } from '../../shell';

export const metadata = { title: 'Role' };

type Role = { id: string; title: string; description: string | null; skills: string[]; work_mode: WorkMode; job_type: keyof typeof JOB_TYPES;
  state: string | null; pay_min: number | null; pay_max: number | null; openings: number; status: 'open' | 'filled' | 'closed';
  employer_id: string; employer: string; created_at: Date };
type Candidate = { id: string; user_id: string; name: string; headline: string | null; interest: Interest; interest_at: Date | null; stage: string;
  notes: string | null; placement_type: string | null; start_date: string | null; pay_band: string | null; visible: boolean; sharing: boolean };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withUser(user.id, async (tx) => {
    const [role] = await tx<Role[]>`select r.*, e.name as employer from public.job_roles r join public.employers e on e.id = r.employer_id where r.id = ${id}`;
    if (!role) return null;
    const candidates = await tx<Candidate[]>`
      select c.id, c.user_id, coalesce(u.full_name, u.email::text) as name, p.headline, c.interest, c.interest_at, c.stage, c.notes,
        c.placement_type, c.start_date::text, c.pay_band, coalesce(p.discoverable, false) as visible, coalesce(p.employer_sharing, false) as sharing
      from public.role_candidates c join public.users u on u.id = c.user_id left join public.passports p on p.user_id = c.user_id
      where c.role_id = ${id} order by c.stage = 'declined', c.interest = 'confirmed' desc, c.created_at`;
    const links = await tx<{ id: string; created_at: Date; expires_at: Date; revoked_at: Date | null; views: number; last_view: Date | null }[]>`
      select l.id, l.created_at, l.expires_at, l.revoked_at, count(v.id)::int as views, max(v.viewed_at) as last_view
      from public.shortlist_links l left join public.shortlist_views v on v.link_id = l.id
      where l.role_id = ${id} group by l.id order by l.created_at desc`;
    const talent = await discoverableTalent(tx);
    return { role, candidates, links, talent };
  });
  if (!data) notFound();
  const { role, candidates, links } = data;
  const onRole = new Set(candidates.map((c) => c.user_id));
  const suggestions = data.talent.filter((t) => !onRole.has(t.user_id))
    .map((t) => ({ t, m: matchTalent({ skills: role.skills, work_mode: role.work_mode, state: role.state }, t) }))
    .filter((s) => s.m.matched.length > 0)
    .sort((a, b) => b.m.score - a.m.score).slice(0, 8);
  const shareable = candidates.filter((c) => c.interest === 'confirmed' && c.stage !== 'declined' && c.sharing).length;
  const pay = payRange(role.pay_min, role.pay_max);
  const now = new Date();

  return (
    <TalentShell user={user} active="employers">
      <PageHeader label={<Link href={`/platform/talent/employers/${role.employer_id}`} className="hover:underline">← {role.employer}</Link>} title={role.title}
        description={`${WORK_MODES[role.work_mode]} · ${JOB_TYPES[role.job_type]}${role.state ? ` · ${role.state}` : ''} · ${role.openings} ${role.openings === 1 ? 'opening' : 'openings'}${pay ? ` · ${pay}` : ''}`}
        actions={<>
          <Badge tone={role.status === 'open' ? 'teal' : 'neutral'}>{role.status === 'open' ? 'Open' : role.status === 'filled' ? 'Filled' : 'Closed'}</Badge>
          {(['open', 'filled', 'closed'] as const).filter((s) => s !== role.status).map((s) => (
            <form key={s} action={setRoleStatus.bind(null, role.id, s)}><Button variant="ghost" size="sm">{s === 'open' ? 'Reopen' : s === 'filled' ? 'Mark filled' : 'Close'}</Button></form>
          ))}
        </>} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="text-lg font-semibold">Candidates</h2>
            <p className="mb-3 mt-1 text-sm text-muted">Each person confirms interest before the employer sees them. Record interviews, offers and placements as they happen.</p>
            {candidates.length === 0 ? <Card className="p-5 text-sm text-muted">Nobody put forward yet. Start with the suggested matches.</Card> : (
              <ul className="space-y-3" aria-label="Candidates">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <Card className="p-5">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/platform/talent/people/${c.user_id}`} className="font-semibold hover:text-blue">{c.name}</Link>
                          {c.headline && <p className="text-sm text-muted">{c.headline}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={c.interest === 'confirmed' ? 'teal' : c.interest === 'declined' ? 'neutral' : 'amber'}>{INTEREST[c.interest]}</Badge>
                          {c.interest === 'confirmed' && !c.sharing && <Badge tone="amber">Sharing off</Badge>}
                          {!c.visible && <Badge tone="neutral">Withdrew visibility</Badge>}
                        </div>
                      </div>
                      {c.interest === 'confirmed' ? <CandidateForm c={c} /> : (
                        <div className="flex items-center justify-between gap-3 text-sm text-muted">
                          <span>{c.interest === 'pending' ? 'We emailed them to confirm interest.' : 'They are not interested in this role.'}</span>
                          <form action={removeCandidate.bind(null, c.id)}><Button variant="ghost" size="sm">Remove</Button></form>
                        </div>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {role.status === 'open' && (
            <section>
              <h2 className="text-lg font-semibold">Suggested matches</h2>
              <p className="mb-3 mt-1 text-sm text-muted">Visible Passports ordered by fit, with the reasons. Suggestions help you look; you decide who to put forward.</p>
              {suggestions.length === 0 ? <Card className="p-5 text-sm text-muted">{candidates.length ? 'Everyone else visible who lists these skills is already on this role, or nobody else does yet.' : 'No visible Passport lists these skills yet. Try the talent search with a broader skill.'}</Card> : (
                <ul className="space-y-3" aria-label="Suggested matches">
                  {suggestions.map(({ t, m }) => (
                    <li key={t.user_id}>
                      <Card className="p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/platform/talent/people/${t.user_id}`} className="font-semibold hover:text-blue">{t.full_name ?? t.email}</Link>
                              <ReadinessBadge level={t.readiness} />
                            </div>
                            {t.headline && <p className="text-sm text-muted">{t.headline}</p>}
                            <ul className="mt-2 space-y-0.5 text-sm">
                              {m.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-teal-700">✓</span>{r}</li>)}
                              {m.concerns.map((r) => <li key={r} className="flex gap-2 text-muted"><span aria-hidden className="text-amber-800">!</span>{r}</li>)}
                            </ul>
                          </div>
                          <AddCandidateButton roleId={role.id} userId={t.user_id} name={t.full_name ?? t.email} />
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-5">
            <h2 className="text-lg font-semibold">Share with the employer</h2>
            <p className="mb-4 mt-1 text-sm text-muted">A private link showing only candidates who said yes and allow sharing, with the fields they consented to. It expires after {SHORTLIST_DAYS} days and logs every view.</p>
            <p className="mb-3 text-sm"><b>{shareable}</b> {shareable === 1 ? 'candidate' : 'candidates'} ready to share</p>
            <ShareLinkButton roleId={role.id} disabled={shareable === 0} />
            {links.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-line pt-4 text-sm" aria-label="Shared links">
                {links.map((l) => {
                  const live = !l.revoked_at && new Date(l.expires_at) > now;
                  return (
                    <li key={l.id} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">Created {formatDate(l.created_at)} {live ? <Badge tone="teal">Live</Badge> : <Badge tone="neutral">{l.revoked_at ? 'Revoked' : 'Expired'}</Badge>}</p>
                        <p className="text-xs text-muted">{l.views} {l.views === 1 ? 'view' : 'views'}{l.last_view ? `, last ${formatDate(l.last_view, true)}` : ''} · {live ? `expires ${formatDate(l.expires_at)}` : ''}</p>
                      </div>
                      {live && <form action={revokeShortlistLink.bind(null, role.id, l.id)}><Button variant="ghost" size="sm" className="text-danger">Revoke</Button></form>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Required skills</h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">{role.skills.map((s) => <li key={s}><Badge tone="blue">{s}</Badge></li>)}</ul>
            {role.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{role.description}</p>}
          </Card>
        </aside>
      </div>
    </TalentShell>
  );
}
