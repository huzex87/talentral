// Cohort discussions: the thread list and a thread with its replies. Used by learners (/learn) and
// the hub team (/dashboard), who also see hidden posts and the moderation controls.
import Link from 'next/link';
import type { Post, Thread } from '@/lib/discussion-data';
import { cx } from './ui';
import { NewThreadForm, PostModeration, ReplyForm, ThreadModeration } from './discussion-forms';

type Lang = 'en' | 'ha';
const tr = (lang: Lang) => (en: string, ha: string) => (lang === 'ha' ? ha : en);

function when(d: Date, lang: Lang) {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  const t = tr(lang);
  if (mins < 1) return t('just now', 'yanzu');
  if (mins < 60) return t(`${mins} min ago`, `minti ${mins} da suka wuce`);
  const hours = Math.round(mins / 60);
  if (hours < 24) return t(`${hours} h ago`, `awa ${hours} da suka wuce`);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).format(new Date(d));
}

function Author({ name, team, lang }: { name: string; team: boolean; lang: Lang }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cx('flex size-7 items-center justify-center rounded-full text-xs font-bold', team ? 'bg-violet text-white' : 'bg-blue-50 text-blue')}>
        {name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')}
      </span>
      <b className="text-ink">{name}</b>
      {team && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet">{tr(lang)('Hub team', 'Ma’aikacin cibiya')}</span>}
    </span>
  );
}

export function ThreadList({ cohortId, threads, base, lang }: { cohortId: string; threads: Thread[]; base: string; lang: Lang }) {
  const t = tr(lang);
  return (
    <div className="space-y-6">
      <details className="group rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]" open={threads.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
          <span>✍️ {t('Ask a question or start a discussion', 'Yi tambaya ko fara tattaunawa')}</span>
          <span className="text-sm text-blue group-open:hidden">{t('Write', 'Rubuta')}</span>
        </summary>
        <div className="mt-4"><NewThreadForm cohortId={cohortId} base={base} lang={lang} /></div>
      </details>

      {threads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-muted">{t('No discussions yet. Be the first to ask.', 'Babu tattaunawa tukuna. Ka zama na farko da zai tambaya.')}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white" aria-label={t('Discussions', 'Tattaunawa')}>
          {threads.map((th) => (
            <li key={th.id} className={cx(th.hidden && 'bg-canvas/70')}>
              <Link href={`${base}/${th.id}`} className="flex items-start gap-3 px-5 py-4 transition hover:bg-canvas/60">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {th.pinned && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-800">📌 {t('Pinned', 'An liƙa')}</span>}
                    {th.locked && <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold uppercase text-muted">🔒 {t('Closed', 'An rufe')}</span>}
                    {th.hidden && <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-bold uppercase text-danger">{t('Hidden', 'An ɓoye')}</span>}
                    <span className="font-semibold">{th.title}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-sm text-muted">{th.body}</span>
                  <span className="mt-1 block text-xs text-muted">{th.author}{th.author_is_team ? ` · ${t('Hub team', 'Ma’aikacin cibiya')}` : ''} · {when(th.last_activity_at, lang)}</span>
                </span>
                <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-xs font-bold text-muted" aria-label={t(`${th.replies} replies`, `amsoshi ${th.replies}`)}>💬 {th.replies}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ThreadView({ thread, posts, back, lang, moderator }: { thread: Thread; posts: Post[]; back: string; lang: Lang; moderator: boolean }) {
  const t = tr(lang);
  return (
    <div className="space-y-5">
      <Link href={back} className="text-sm font-semibold text-violet hover:underline">← {t('All discussions', 'Duk tattaunawa')}</Link>
      <article className={cx('rounded-[var(--radius-card)] border bg-white p-5 shadow-[var(--shadow-card)] sm:p-6', thread.hidden ? 'border-danger/30' : 'border-line')}>
        <div className="flex flex-wrap items-center gap-2">
          {thread.pinned && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-800">📌 {t('Pinned', 'An liƙa')}</span>}
          {thread.locked && <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold uppercase text-muted">🔒 {t('Closed', 'An rufe')}</span>}
          {thread.hidden && <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-bold uppercase text-danger">{t('Hidden from learners', 'An ɓoye daga ɗalibai')}</span>}
        </div>
        <h1 className="mt-2 text-2xl font-semibold leading-tight">{thread.title}</h1>
        <p className="mt-2 text-sm text-muted"><Author name={thread.author} team={thread.author_is_team} lang={lang} /> · {when(thread.created_at, lang)}</p>
        <p className="mt-4 whitespace-pre-line leading-relaxed">{thread.body}</p>
        {moderator && <div className="mt-5 border-t border-line pt-4"><ThreadModeration thread={thread} /></div>}
      </article>

      <section aria-label={t('Replies', 'Amsoshi')} className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t(`${posts.length} ${posts.length === 1 ? 'reply' : 'replies'}`, `Amsoshi ${posts.length}`)}</h2>
        {posts.map((p) => (
          <div key={p.id} className={cx('rounded-2xl border p-4', p.hidden ? 'border-danger/25 bg-danger-50/40' : p.author_is_team ? 'border-violet/20 bg-violet-50/40' : 'border-line bg-white')}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted"><Author name={p.author} team={p.author_is_team} lang={lang} /> · {when(p.created_at, lang)}</span>
              {moderator && <PostModeration id={p.id} hidden={p.hidden} />}
            </div>
            {p.hidden && <p className="mt-2 text-xs font-semibold text-danger">{t('Hidden from learners', 'An ɓoye daga ɗalibai')}</p>}
            <p className="mt-2 whitespace-pre-line leading-relaxed">{p.body}</p>
          </div>
        ))}
      </section>

      {thread.locked && !moderator
        ? <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">🔒 {t('The hub closed this discussion to new replies.', 'Cibiyar ta rufe wannan tattaunawar ga sababbin amsoshi.')}</p>
        : <ReplyForm threadId={thread.id} lang={lang} />}
    </div>
  );
}
