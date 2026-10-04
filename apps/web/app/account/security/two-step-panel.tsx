'use client';
import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { disableTwoStep, finishSetup, newCodes, startSetup, type ChangeState, type SetupState } from './actions';

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-amber-800/20 bg-amber-50 p-4">
      <p className="font-semibold text-amber-800">Save these recovery codes now</p>
      <p className="mt-1 text-sm text-amber-800">If you lose your phone, each code signs you in once. They will not be shown again. Write them down or keep them in a password manager.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-[15px]" aria-label="Recovery codes">
        {codes.map((c) => <li key={c} className="rounded-lg bg-white px-3 py-2 text-center tracking-wider">{c}</li>)}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true); }}>{copied ? '✓ Copied' : 'Copy codes'}</Button>
        <Button size="sm" variant="ghost" onClick={() => window.print()}>Print</Button>
      </div>
    </div>
  );
}

export function SetupTwoStep({ continueTo }: { continueTo: string | null }) {
  const [setup, setSetup] = useState<SetupState>({ step: 'start' });
  const [state, action] = useActionState<SetupState, FormData>(finishSetup, setup);
  const [pending, start] = useTransition();
  const current = state.step === 'done' ? state : setup.step === 'scan' ? { ...setup, error: state.error } : setup;
  const router = useRouter();

  if (current.step === 'done') {
    return (
      <div className="space-y-4">
        <Alert tone="teal" title="Two-step sign-in is on">From now on, Talentral asks for a code from your app each time you sign in.</Alert>
        <RecoveryCodes codes={current.codes!} />
        {continueTo
          ? <Link href={continueTo} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 text-sm bg-blue text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.10)] hover:bg-blue-600">Continue to your hub →</Link>
          : <Button onClick={() => router.refresh()}>I have saved my codes</Button>}
      </div>
    );
  }
  if (current.step === 'start') {
    return <Button disabled={pending} onClick={() => start(async () => setSetup(await startSetup()))}>{pending ? 'Preparing…' : 'Set up two-step sign-in'}</Button>;
  }
  return (
    <div className="space-y-5">
      <ol className="space-y-4 text-sm">
        <li><b>1.</b> Install an authenticator app, such as Google Authenticator or Microsoft Authenticator, from your app store.</li>
        <li>
          <b>2.</b> In the app, add an account and scan this code.
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div role="img" aria-label="Two-step setup QR code" className="size-44 rounded-xl border border-line bg-white p-2 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: current.qr! }} />
            <div className="min-w-0 text-xs text-muted">
              <p>Can’t scan? Enter this key instead:</p>
              <p className="mt-1 break-all rounded-lg bg-canvas px-2 py-1.5 font-mono text-sm text-ink" data-testid="totp-secret">{current.secret!.match(/.{1,4}/g)!.join(' ')}</p>
            </div>
          </div>
        </li>
        <li><b>3.</b> Enter the 6-digit code the app shows for Talentral.</li>
      </ol>
      <form action={action} className="space-y-4">
        <Field label="Code from the app" htmlFor="setup-code" error={current.error}>
          <Input id="setup-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className="max-w-48 font-mono text-lg tracking-[0.3em]" />
        </Field>
        <SubmitButton pendingLabel="Checking…">Turn on two-step sign-in</SubmitButton>
      </form>
    </div>
  );
}

export function ChangeTwoStep({ recoveryLeft, requiredBy }: { recoveryLeft: number; requiredBy: string[] }) {
  const [codesState, codesAction] = useActionState<ChangeState, FormData>(newCodes, {});
  const [offState, offAction] = useActionState<ChangeState, FormData>(disableTwoStep, {});
  return (
    <div className="space-y-5">
      <p className="text-sm"><b>{recoveryLeft}</b> <span className="text-muted">unused recovery code{recoveryLeft === 1 ? '' : 's'}.</span>{recoveryLeft <= 3 && <span className="font-semibold text-amber-800"> Make new ones soon.</span>}</p>
      {codesState.codes ? <RecoveryCodes codes={codesState.codes} /> : (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-semibold">Make new recovery codes</summary>
          <form action={codesAction} className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Code from your app" htmlFor="codes-code" error={codesState.error}><Input id="codes-code" name="code" autoComplete="one-time-code" required className="max-w-48" /></Field>
            <SubmitButton size="sm" variant="secondary" pendingLabel="Checking…">Make new codes</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-muted">Your old recovery codes stop working.</p>
        </details>
      )}
      {requiredBy.length > 0 ? (
        <p className="text-xs text-muted">{requiredBy.join(', ')} requires two-step sign-in for its team, so it stays on.</p>
      ) : offState.ok ? <Alert tone="neutral">Two-step sign-in is off.</Alert> : (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer font-semibold text-danger">Turn off two-step sign-in</summary>
          <form action={offAction} className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Code from your app or a recovery code" htmlFor="off-code" error={offState.error}><Input id="off-code" name="code" autoComplete="one-time-code" required className="max-w-56" /></Field>
            <SubmitButton size="sm" variant="danger" pendingLabel="Checking…">Turn off</SubmitButton>
          </form>
        </details>
      )}
    </div>
  );
}
