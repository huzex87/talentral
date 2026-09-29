import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { currentUser } from '@/lib/auth';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in' };

export default async function SignInPage() {
  if (await currentUser()) redirect('/dashboard');
  return (
    <AuthShell title="Sign in" subtitle="For hub teams, learners and Talentral staff. Learners: use the email you applied with. We will email you a secure link, so there is no password to remember.">
      <SignInForm />
    </AuthShell>
  );
}
