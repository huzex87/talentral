'use client';
import { useActionState, useState } from 'react';
import { NUDGE_DEFAULTS } from '@talentral/domain';
import { Alert, Button, Select, cx } from '@/components/ui';
import { saveNudgeRule, type FormState } from '../actions';

const AFTER = [2, 3, 4, 5, 7, 10, 14, 21, 30];
const ESCALATE = [1, 2, 3, 5, 7, 14];

// The cohort's nudge rule: a switch, then two plain-language choices.
export function NudgeSettings({ slug, cohortId, afterDays, escalateDays, sms }: { slug: string; cohortId: string; afterDays: number | null; escalateDays: number; sms: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveNudgeRule.bind(null, slug, cohortId), {});
  const [on, setOn] = useState(afterDays !== null);
  return (
    <form action={action} className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id="nudge-label" className="font-semibold">Nudge inactive learners automatically</p>
          <p className="mt-0.5 text-sm text-muted">
            A friendly message by email{sms ? ' and text (WhatsApp for learners who chose it, SMS for the rest)' : ''}, in the language each learner reads Talentral in. If they are still inactive, the hub’s owners and admins get one email listing who to follow up. Nothing is sent between 21:00 and 07:00.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby="nudge-label" onClick={() => setOn(!on)}
          className={cx('relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40', on ? 'bg-teal-700' : 'bg-line')}>
          <span className={cx('inline-block size-5 rounded-full bg-white shadow transition', on ? 'translate-x-6' : 'translate-x-1')} />
        </button>
        <input type="hidden" name="enabled" value={on ? 'on' : 'off'} />
      </div>

      <div className={cx('grid gap-3 rounded-xl border border-line bg-canvas/50 p-4 text-sm sm:grid-cols-2', !on && 'opacity-50')} aria-disabled={!on}>
        <label className="flex flex-wrap items-center gap-2">
          <span>Nudge a learner after</span>
          <Select name="after_days" defaultValue={afterDays ?? NUDGE_DEFAULTS.afterDays} disabled={!on} aria-label="Days without activity before a nudge" className="h-9 w-20 text-sm">
            {AFTER.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <span>days without activity</span>
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <span>Tell the team</span>
          <Select name="escalate_days" defaultValue={escalateDays} disabled={!on} aria-label="Days after the nudge before the team is told" className="h-9 w-20 text-sm">
            {ESCALATE.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <span>days later if still inactive</span>
        </label>
        {/* Disabled selects are not submitted; keep the saved values when the rule is off. */}
        {!on && <><input type="hidden" name="after_days" value={afterDays ?? NUDGE_DEFAULTS.afterDays} /><input type="hidden" name="escalate_days" value={escalateDays} /></>}
      </div>
      <p className="text-xs text-muted">Activity means opening a lesson, answering a quiz, handing in or reviewing work, attending or joining a class, or posting in the discussion.</p>

      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Save nudges'}</Button>
    </form>
  );
}
