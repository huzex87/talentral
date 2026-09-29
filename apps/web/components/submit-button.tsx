'use client';
import { useFormStatus } from 'react-dom';
import { Button } from './ui';
import type { ComponentProps } from 'react';

// A submit button that disables itself and shows progress while its form is sending.
export function SubmitButton({ children, pendingLabel, ...props }: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {pending ? pendingLabel ?? 'Working…' : children}
    </Button>
  );
}
