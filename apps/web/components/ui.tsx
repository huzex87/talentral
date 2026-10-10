// Shared UI primitives on the Talentral tokens: neutral surfaces, one accent, 8 px controls and
// 12 px cards. Every screen builds from these, so the product reads as one system.
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Inbox, Info, type LucideIcon } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'hub' | 'inverse';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.10)] hover:bg-blue-600',
  hub: 'bg-[var(--hub)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.10)] hover:brightness-95',
  secondary: 'bg-white text-ink border border-line-strong shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-hover hover:border-mist',
  ghost: 'bg-transparent text-ink-2 hover:bg-hover hover:text-ink',
  // For dark surfaces.
  inverse: 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.2)] hover:bg-white/90',
  danger: 'bg-white text-danger border border-danger/25 shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-danger-50 hover:border-danger/40',
};

export function buttonClass(variant: Variant = 'primary', size: 'md' | 'sm' = 'md') {
  return cx(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
    size === 'md' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-[13px]',
    VARIANTS[variant],
  );
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ComponentProps<'button'> & { variant?: Variant; size?: 'md' | 'sm' }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function LinkButton({ variant = 'primary', size = 'md', className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: 'md' | 'sm' }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...props} />;
}

// 16 px text on phones stops iOS zooming into fields; 14 px from small screens up.
const control = 'w-full rounded-[var(--radius-control)] border border-line-strong bg-white px-3 text-base text-ink shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-mist focus:border-blue focus:shadow-[0_0_0_4px_rgba(46,91,255,0.12)] disabled:bg-canvas disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_4px_rgba(192,20,47,0.12)] sm:text-sm';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx(control, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cx(control, 'min-h-28 py-2.5 leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return <select className={cx(control, 'h-10 cursor-pointer', className)} {...props}>{children}</select>;
}

export function Field({ label, htmlFor, hint, error, required, children }: {
  label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string | null; required?: boolean; children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}{required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </label>
      {hint && <p className="text-[13px] leading-snug text-muted">{hint}</p>}
      {children}
      {error && <p className="flex items-start gap-1.5 text-[13px] font-medium text-danger" role="alert"><AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />{error}</p>}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]', className)} {...props} />;
}

type Tone = 'neutral' | 'blue' | 'violet' | 'teal' | 'amber' | 'danger';
const TONES: Record<Tone, string> = {
  neutral: 'bg-hover text-ink-2 border-line',
  blue: 'bg-blue-50 text-blue-600 border-blue/15',
  violet: 'bg-violet-50 text-violet border-violet/15',
  teal: 'bg-teal-50 text-teal-700 border-teal-700/15',
  amber: 'bg-amber-50 text-amber-800 border-amber-800/15',
  danger: 'bg-danger-50 text-danger border-danger/15',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex w-fit items-center gap-1 rounded-md border px-1.5 py-px text-xs font-medium whitespace-nowrap [&_svg]:size-3', TONES[tone])}>{children}</span>;
}

const ALERT_ICONS: Record<Tone, LucideIcon> = { neutral: Info, blue: Info, violet: Info, teal: CheckCircle2, amber: AlertTriangle, danger: AlertCircle };

export function Alert({ tone = 'blue', title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  const Icon = ALERT_ICONS[tone];
  return (
    <div className={cx('flex gap-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm leading-relaxed', TONES[tone])} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}

// label is context above the title (the hub, the section): quiet, never a coloured eyebrow.
export function PageHeader({ label, title, description, actions }: { label?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {label && <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-blue-600">{label}</p>}
        <h1 className="text-[26px] font-semibold leading-tight text-ink sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// Empty screens get a small illustration (cards on a soft blue field, the screen's icon on top),
// a title, a line on what fills this space, and the action that fills it.
export function EmptyState({ title, children, action, icon: Icon = Inbox }: { title: ReactNode; children?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-white/70 px-6 py-10 text-center sm:py-12">
      <EmptyArt icon={Icon} />
      <h3 className="mt-5 font-display text-lg font-semibold">{title}</h3>
      {children && <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function EmptyArt({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={cx('relative mx-auto h-[104px] w-[168px]', className)} aria-hidden>
      <svg viewBox="0 0 168 104" className="absolute inset-0 size-full" fill="none">
        <ellipse cx="84" cy="58" rx="80" ry="44" fill="#EEF2FF" />
        <circle cx="20" cy="22" r="4" fill="#14B8A6" opacity="0.55" />
        <rect x="146" y="14" width="8" height="8" rx="2" transform="rotate(18 150 18)" fill="#6D3FD9" opacity="0.35" />
        <path d="M150 74l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#2E5BFF" opacity="0.45" />
        <g transform="rotate(-7 70 54)">
          <rect x="34" y="24" width="72" height="56" rx="9" fill="#fff" stroke="#DFE3EA" />
          <rect x="44" y="36" width="30" height="5" rx="2.5" fill="#E3E8F2" />
          <rect x="44" y="47" width="48" height="4" rx="2" fill="#EEF1F6" />
          <rect x="44" y="56" width="40" height="4" rx="2" fill="#EEF1F6" />
        </g>
        <rect x="62" y="20" width="76" height="60" rx="10" fill="#fff" stroke="#CAD0DB" />
        <circle cx="78" cy="36" r="7" fill="#D9E2FF" />
        <rect x="90" y="31" width="36" height="5" rx="2.5" fill="#DCE2EE" />
        <rect x="90" y="40" width="24" height="4" rx="2" fill="#EEF1F6" />
        <rect x="72" y="54" width="56" height="4" rx="2" fill="#EEF1F6" />
        <rect x="72" y="63" width="44" height="4" rx="2" fill="#EEF1F6" />
      </svg>
      <span className="absolute bottom-0 right-5 grid size-11 place-items-center rounded-full bg-blue text-white shadow-[0_6px_16px_-4px_rgba(46,91,255,0.55)] ring-4 ring-white">
        <Icon className="size-5" strokeWidth={1.9} />
      </span>
    </div>
  );
}

// A single figure with its label: label first for screen readers, figure biggest for the eye.
export function Stat({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <Card className={cx('p-5', className)}>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-[30px] font-semibold leading-none tabular-nums text-ink">{value}</p>
      {hint && <div className="mt-2 text-[13px] text-muted">{hint}</div>}
    </Card>
  );
}

// Section heading inside a page: title, optional supporting line and actions on the right.
export function SectionHeader({ title, description, actions, id }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export { cx };
