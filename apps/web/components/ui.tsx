// Shared UI primitives on the Talentral tokens: light surfaces, 12 px controls, 16 px cards.
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'hub';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue text-white hover:bg-blue-600 shadow-sm',
  hub: 'bg-[var(--hub)] text-white hover:brightness-95 shadow-sm',
  secondary: 'bg-white text-blue border border-blue/60 hover:bg-blue-50',
  ghost: 'bg-transparent text-ink hover:bg-canvas',
  danger: 'bg-white text-danger border border-danger/40 hover:bg-danger-50',
};

export function buttonClass(variant: Variant = 'primary', size: 'md' | 'sm' = 'md') {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed',
    size === 'md' ? 'h-11 px-5 text-[15px]' : 'h-9 px-3.5 text-sm',
    VARIANTS[variant],
  );
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ComponentProps<'button'> & { variant?: Variant; size?: 'md' | 'sm' }) {
  return <button className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function LinkButton({ variant = 'primary', size = 'md', className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: 'md' | 'sm' }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...props} />;
}

const control = 'w-full rounded-[var(--radius-control)] border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-muted/70 transition focus:border-blue focus:ring-3 focus:ring-blue/20 outline-none aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx(control, 'h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cx(control, 'py-2.5 min-h-28', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return <select className={cx(control, 'h-11 pr-8', className)} {...props}>{children}</select>;
}

export function Field({ label, htmlFor, hint, error, required, children }: {
  label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: string | null; required?: boolean; children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}{required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {hint && <p className="text-[13px] leading-snug text-muted">{hint}</p>}
      {children}
      {error && <p className="text-[13px] font-medium text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]', className)} {...props} />;
}

type Tone = 'neutral' | 'blue' | 'violet' | 'teal' | 'amber' | 'danger';
const TONES: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted border-line',
  blue: 'bg-blue-50 text-blue-600 border-blue/15',
  violet: 'bg-violet-50 text-violet border-violet/15',
  teal: 'bg-teal-50 text-teal-700 border-teal-700/15',
  amber: 'bg-amber-50 text-amber-800 border-amber-800/15',
  danger: 'bg-danger-50 text-danger border-danger/15',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', TONES[tone])}>{children}</span>;
}

export function Alert({ tone = 'blue', title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx('rounded-[var(--radius-control)] border px-4 py-3 text-sm leading-relaxed', TONES[tone])} role={tone === 'danger' ? 'alert' : 'status'}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
    </div>
  );
}

export function PageHeader({ label, title, description, actions }: { label?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {label && <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">{label}</p>}
        <h1 className="mt-1 text-[28px] font-semibold leading-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="px-6 py-12 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  );
}

export { cx };
