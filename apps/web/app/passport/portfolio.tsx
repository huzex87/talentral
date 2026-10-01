'use client';
import { useActionState, useState, useTransition } from 'react';
import { EVIDENCE_LABELS, EVIDENCE_LABELS_HA, portfolioKind } from '@talentral/domain';
import { EvidenceLabel, type PortfolioView } from '@/components/talent-card';
import { Alert, Button, Field, Input, Select, Textarea, cx } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { deletePortfolioItem, savePortfolioItem, type PassportState } from './actions';

type Lang = 'en' | 'ha';
export interface GradedWork { submission_id: string; lesson_title: string; course_title: string; hub_name: string; score: number | string | null }

function ItemForm({ item, graded, lang, onSaved, onCancel }: { item?: PortfolioView; graded: GradedWork[]; lang: Lang; onSaved: () => void; onCancel?: () => void }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const [state, action] = useActionState<PassportState, FormData>(async (prev, form) => {
    const r = await savePortfolioItem(item?.id ?? null, prev, form);
    if (r.ok) onSaved();
    return r;
  }, {});
  const e = state.errors ?? {};
  const p = item ? `pf-${item.id.slice(0, 8)}` : 'pf-new';
  return (
    <form key={!item && state.ok ? state.message : p} action={action} className="grid gap-4 sm:grid-cols-2">
      {state.message && <div className="sm:col-span-2"><Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert></div>}
      <div className="sm:col-span-2"><Field label={t('Project title', 'Sunan aikin')} htmlFor={`${p}-title`} required error={e.title}>
        <Input id={`${p}-title`} name="title" maxLength={120} defaultValue={item?.title} placeholder={t('Online shop for a Katsina tailor', 'Shagon intanet na wani tela a Katsina')} />
      </Field></div>
      <div className="sm:col-span-2"><Field label={t('What you did', 'Abin da ka yi')} htmlFor={`${p}-desc`} error={e.description} hint={t('The problem, what you built and the result.', 'Matsalar, abin da ka gina da sakamakon.')}>
        <Textarea id={`${p}-desc`} name="description" rows={3} maxLength={1000} defaultValue={item?.description ?? ''} />
      </Field></div>
      <Field label={t('Link (optional)', 'Hanya (ba dole ba)')} htmlFor={`${p}-url`} error={e.url} hint={t('The live site, GitHub, Behance or a Google Drive folder.', 'Shafin, GitHub, Behance ko fayil ɗin Google Drive.')}>
        <Input id={`${p}-url`} name="url" type="url" inputMode="url" defaultValue={item?.url ?? ''} placeholder="https://" />
      </Field>
      <Field label={t('Skills it shows', 'Ƙwarewar da yake nunawa')} htmlFor={`${p}-skills`} error={e.skills} hint={t('Up to 10, separated by commas.', 'Har zuwa 10, a raba da waƙafi.')}>
        <Input id={`${p}-skills`} name="skills" defaultValue={item?.skills.join(', ') ?? ''} placeholder="React, HTML and CSS" />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t('Graded work on Talentral (optional)', 'Aikin da aka duba a Talentral (ba dole ba)')} htmlFor={`${p}-sub`} error={e.submission_id}
          hint={graded.length ? t('Link the assignment this project came from. It then shows as platform-evidenced, with its grade.', 'Haɗa aikin da wannan ya fito daga ciki. Zai bayyana a matsayin shaidar Talentral.')
            : t('When your hub grades your assignments, you can link them here as proof.', 'Idan cibiyarka ta duba ayyukanka, za ka iya haɗa su a nan.')}>
          <Select id={`${p}-sub`} name="submission_id" defaultValue={item?.submission_id ?? ''} disabled={!graded.length}>
            <option value="">{t('Not linked', 'Ba a haɗa ba')}</option>
            {graded.map((g) => <option key={g.submission_id} value={g.submission_id}>{g.lesson_title} · {g.course_title}{g.score !== null ? ` · ${Number(g.score)}%` : ''}</option>)}
          </Select>
        </Field>
      </div>
      {item?.verified_at && <p className="text-xs text-amber-800 sm:col-span-2">{t('Changing this item removes its Verified mark until a talent officer checks it again.', 'Canza wannan zai cire alamar tabbatarwa har sai an sake dubawa.')}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton pendingLabel={t('Saving…', 'Ana ajiyewa…')}>{item ? t('Save', 'Ajiye') : t('Add to portfolio', 'Ƙara')}</SubmitButton>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t('Cancel', 'Soke')}</Button>}
      </div>
    </form>
  );
}

// The learner's projects and work samples, each labelled with how it is backed up.
export function Portfolio({ items, graded, lang }: { items: PortfolioView[]; graded: GradedWork[]; lang: Lang }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {notice && <Alert tone="teal">{notice}</Alert>}
      {items.length === 0 && !adding && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{t('No projects yet. Add your best work: a site you built, a design, a campaign. One strong, linked project beats a long list of skills.', 'Babu ayyuka tukuna. Ƙara mafi kyawun aikinka.')}</p>}
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((i) => {
            const kind = portfolioKind(i);
            return (
              <li key={i.id} className={cx('rounded-xl border p-4', kind === 'verified' ? 'border-teal-700/25' : kind === 'platform' ? 'border-blue/20' : 'border-line')}>
                {editing === i.id ? <ItemForm item={i} graded={graded} lang={lang} onSaved={() => { setEditing(null); setNotice(t('Saved.', 'An ajiye.')); }} onCancel={() => setEditing(null)} /> : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{i.url ? <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-blue hover:underline">{i.title} ↗</a> : i.title}</p>
                        {i.lesson_title && <p className="text-xs text-muted">{t('Graded work', 'Aikin da aka duba')}: {i.lesson_title}{i.score !== null ? ` · ${Number(i.score)}%` : ''}</p>}
                      </div>
                      <span title={lang === 'ha' ? EVIDENCE_LABELS_HA[kind] : EVIDENCE_LABELS[kind]}><EvidenceLabel kind={kind} lang={lang} /></span>
                    </div>
                    {i.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{i.description}</p>}
                    {i.skills.length > 0 && <ul className="mt-2 flex flex-wrap gap-1">{i.skills.map((s) => <li key={s} className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold">{s}</li>)}</ul>}
                    <div className="mt-3 flex gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => { setNotice(null); setEditing(i.id); }} aria-label={t(`Edit ${i.title}`, `Gyara ${i.title}`)}>{t('Edit', 'Gyara')}</Button>
                      <Button type="button" size="sm" variant="ghost" className="text-danger" disabled={pending} aria-label={t(`Remove ${i.title}`, `Cire ${i.title}`)}
                        onClick={() => { if (confirm(t('Remove this item from your portfolio?', 'Cire wannan daga tarin ayyukanka?'))) start(() => deletePortfolioItem(i.id)); }}>{t('Remove', 'Cire')}</Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <div className="rounded-xl border border-dashed border-blue/30 bg-blue-50/30 p-4"><ItemForm graded={graded} lang={lang} onSaved={() => { setAdding(false); setNotice(t('Added to your portfolio.', 'An ƙara a cikin tarin ayyukanka.')); }} onCancel={() => setAdding(false)} /></div>
      ) : items.length < 12 && <Button type="button" variant="secondary" onClick={() => { setNotice(null); setAdding(true); }}>+ {t('Add a project', 'Ƙara aiki')}</Button>}
    </div>
  );
}
