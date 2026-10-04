import { withUser } from '@talentral/db';
import { Button, Card, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { removeSkill } from './actions';
import { SkillForm } from './skill-form';

export const metadata = { title: 'Skills' };

type Skill = { id: string; name: string; track: string; description: string | null; hub: boolean; maps_to_name: string | null; used: number };

export default async function Skills({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const skills = await withUser(user.id, (tx) => tx<Skill[]>`
    select s.id, s.name, s.track, s.description, s.tenant_id is not null as hub, m.name as maps_to_name,
      (select count(*)::int from public.assessment_skills k where k.skill_id = s.id and k.tenant_id = ${hub.id}) as used
    from public.skills s left join public.skills m on m.id = s.maps_to
    order by s.track, s.tenant_id is null, s.name`);
  const tracks = [...new Set(skills.map((s) => s.track))];
  const platform = skills.filter((s) => !s.hub);

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader label="Skills list" title="Skills by track"
        description="A shared list keeps evidence comparable across hubs. Tag assessments with these skills: learners who reach the pass mark get them as platform-evidenced skills on their Passport, which employers can trust." />
      <div className="grid gap-4 md:grid-cols-2">
        {tracks.map((t) => {
          const list = skills.filter((s) => s.track === t);
          return (
            <Card key={t} className="p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">{t}</h2>
                <span className="text-xs font-semibold text-muted">{list.length} skills</span>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {list.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold">
                        {s.name}
                        {s.hub && <span className="ml-2 rounded-md bg-violet-50 px-1.5 py-px text-[11px] font-medium text-violet">{hub.name}</span>}
                      </p>
                      {s.description && <p className="text-sm text-muted">{s.description}</p>}
                      {s.maps_to_name && <p className="text-xs text-muted">Counts as <b className="text-ink">{s.maps_to_name}</b></p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {s.used > 0 && <span className="text-xs text-muted">{s.used} {s.used === 1 ? 'assessment' : 'assessments'}</span>}
                      {s.hub && s.used === 0 && <form action={removeSkill.bind(null, slug, s.id)}><Button variant="ghost" size="sm" aria-label={`Remove ${s.name}`}>Remove</Button></form>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Add a skill for {hub.name}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">For skills your programmes teach that the shared list does not cover yet.</p>
        <SkillForm slug={slug} tracks={tracks} platform={platform} />
      </Card>
    </div>
  );
}
