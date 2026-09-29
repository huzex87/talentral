import { redirect } from 'next/navigation';
import { TalentralLogo } from '@/components/logo';
import { Button, Card, Input } from '@/components/ui';

export const metadata = { title: 'Verify a certificate' };

async function lookup(form: FormData) {
  'use server';
  const serial = String(form.get('serial') ?? '').trim().toUpperCase().replace(/\s+/g, '');
  redirect(`/verify/${encodeURIComponent(serial)}`);
}

export default function Verify() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="brand-rule" />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center"><TalentralLogo height={30} /></div>
          <Card className="p-6 sm:p-8">
            <h1 className="text-2xl font-semibold">Verify a certificate</h1>
            <p className="mt-1.5 text-muted">Enter the certificate number printed under the QR code, for example TAL-KIR-26-7K4Q2M.</p>
            <form action={lookup} className="mt-6 space-y-4">
              <Input name="serial" required placeholder="TAL-KIR-26-7K4Q2M" className="h-12 text-center font-mono text-lg uppercase tracking-wider" aria-label="Certificate number" />
              <Button type="submit" className="w-full">Verify</Button>
            </form>
          </Card>
        </div>
      </div>
    </main>
  );
}
