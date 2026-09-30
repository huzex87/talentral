import { StatusPage } from '@/components/status-page';
import { LinkButton } from '@/components/ui';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <StatusPage code="404" title="We could not find that page"
      actions={<>
        <LinkButton href="/">Go to the home page</LinkButton>
        <LinkButton variant="secondary" href="/sign-in">Sign in</LinkButton>
      </>}>
      <p>The link may be old, typed wrongly, or for a page you do not have access to.</p>
      <p lang="ha">Ba mu sami wannan shafin ba. Duba adireshin ko ka shiga da asusunka.</p>
    </StatusPage>
  );
}
