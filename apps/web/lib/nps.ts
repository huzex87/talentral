import 'server-only';
import type { Tx } from '@talentral/db';
import type { NpsAudience, NpsSurvey } from '@talentral/domain';

// Every NPS survey the signed-in person could be asked; npsDue / pickSurvey decide which to show.
export async function mySurveys(tx: Tx): Promise<NpsSurvey[]> {
  const rows = await tx<{ tenant_id: string; hub_name: string; cohort_id: string | null; audience: NpsAudience; started_at: Date; last_answered: Date | null; last_dismissed: Date | null }[]>`
    select * from app.nps_state()`;
  return rows.map((r) => ({ tenantId: r.tenant_id, hubName: r.hub_name, cohortId: r.cohort_id, audience: r.audience, startedAt: r.started_at, lastAnswered: r.last_answered, lastDismissed: r.last_dismissed }));
}
