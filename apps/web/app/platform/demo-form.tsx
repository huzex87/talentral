'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { Presentation } from 'lucide-react';
import { Alert, Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { createDemo, deleteDemo, type DemoState } from './actions';

// Creates or deletes the demo academy used in partner meetings.
export function DemoAcademy({ exists, slug }: { exists: boolean; slug: string }) {
  const [created, create] = useActionState<DemoState, FormData>(createDemo, {});
  const [deleted, remove] = useActionState<DemoState, FormData>(deleteDemo, {});
  const result = exists ? created.ok ? created : deleted : deleted.ok ? deleted : created;
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex max-w-xl gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue/10 text-blue" aria-hidden><Presentation className="size-5" strokeWidth={1.75} /></span>
        <div>
          <h2 className="text-lg font-semibold">Demo academy for partner meetings</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            A labelled sample academy (iDICE CoE Katsina, Demo) with three calls, a finished cohort with certificates and job placements, and a running cohort with a course, classes and grades. All people are invented and never receive messages. You become its owner.
          </p>
          {exists && <p className="mt-2 text-sm"><Link href={`/dashboard/${slug}`} className="font-medium text-blue hover:underline">Open the demo dashboard →</Link></p>}
        </div>
      </div>
      <div className="w-full lg:w-[360px]">
        {exists ? (
          <form action={remove}>
            <SubmitButton variant="danger" className="w-full" pendingLabel="Deleting…">Delete demo academy</SubmitButton>
          </form>
        ) : (
          <form action={create} className="space-y-3">
            <Field label="Demo learner email (optional)" htmlFor="demo-learner" hint="Enrolled in the running cohort, so you can sign in and show the learner side.">
              <Input id="demo-learner" name="learner" type="email" placeholder="you+learner@gmail.com" />
            </Field>
            <SubmitButton className="w-full" pendingLabel="Creating… (about 20 seconds)">Create demo academy</SubmitButton>
          </form>
        )}
        {result.message && <div className="mt-3"><Alert tone={result.ok ? 'teal' : 'amber'}>{result.message}</Alert></div>}
      </div>
    </div>
  );
}
