import { CheckinForm } from './checkin-form';

export const metadata = { title: 'Check in', robots: { index: false } };

export default async function Checkin({ params }: { params: Promise<{ hub: string }> }) {
  const { hub } = await params;
  return <div className="mx-auto max-w-md px-4 py-10 sm:py-16"><CheckinForm hub={hub} /></div>;
}
