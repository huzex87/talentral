import { withUser } from '@talentral/db';
import { Badge, Card, PageHeader } from '@/components/ui';
import { requireEmployer } from '@/lib/employer';
import { formatDate } from '@/lib/format';
import { AddMemberForm, MemberActions } from '../forms';
import { EmployerShell } from '../shell';

export const metadata = { title: 'Employer team' };

type Member = { user_id: string; email: string; full_name: string | null; role: 'owner' | 'member'; created_at: Date; last_sign_in_at: Date | null };

export default async function EmployerTeam() {
  const { user, employer } = await requireEmployer();
  const team = await withUser(user.id, (tx) => tx<Member[]>`select * from app.employer_team(${employer.id})`);
  const owner = employer.my_role === 'owner';
  return (
    <EmployerShell user={user} employer={employer} active="team">
      <PageHeader label="Employer account" title="Team" description={`People who hire for ${employer.name} on Talentral. Everyone signs in with their own email; there are no shared passwords.`} />
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line" aria-label="Team members">
          {team.map((m) => (
            <li key={m.user_id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">{m.full_name ?? m.email}
                  <Badge tone={m.role === 'owner' ? 'violet' : 'neutral'}>{m.role === 'owner' ? 'Owner' : 'Member'}</Badge>
                  {m.user_id === user.id && <span className="text-xs font-normal text-muted">(you)</span>}</p>
                <p className="truncate text-sm text-muted">{m.email} · added {formatDate(m.created_at)} · {m.last_sign_in_at ? `last signed in ${formatDate(m.last_sign_in_at)}` : 'has not signed in yet'}</p>
              </div>
              <MemberActions id={m.user_id} name={m.full_name ?? m.email} role={m.role} self={m.user_id === user.id} owner={owner} />
            </li>
          ))}
        </ul>
      </Card>
      {owner ? (
        <Card className="mt-6 p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">Add a colleague</h2>
          <p className="mb-4 text-sm text-muted">They get an email and sign in with that address. Up to 20 people.</p>
          <AddMemberForm />
        </Card>
      ) : <p className="mt-4 text-sm text-muted">Only owners can add or remove people. Ask an owner if someone needs access.</p>}
    </EmployerShell>
  );
}
