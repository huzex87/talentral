import { LegalPage } from '@/components/legal-page';

export const metadata = { title: 'Terms of use', description: 'The rules for using Talentral as a learner, hub or employer.' };

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="5 October 2026">
      <section>
        <p>These terms apply to everyone who uses Talentral: applicants and learners, the teams of hubs that run programmes, and employers. By using Talentral you agree to them. Hubs and employers may also have a separate agreement with Talentral, which takes priority where it differs.</p>
      </section>
      <section>
        <h2>Your account</h2>
        <ul>
          <li>Sign in only as yourself. Keep access to your email and phone safe, because sign-in links and codes are sent there.</li>
          <li>Hub and employer team members should turn on two-step sign-in. A hub can require it for its whole team.</li>
          <li>Tell us straight away at <a href="mailto:privacy@talentral.ng">privacy@talentral.ng</a> if you think someone else has used your account.</li>
        </ul>
      </section>
      <section>
        <h2>For learners</h2>
        <ul>
          <li>Give true information in applications and hand in your own work. Hubs can withdraw certificates that were earned dishonestly.</li>
          <li>Be respectful in class discussions. Hubs can hide posts and close discussions.</li>
          <li>The AI course tutor can be wrong. Check important points with your facilitator.</li>
        </ul>
      </section>
      <section>
        <h2>For hubs</h2>
        <ul>
          <li>You are responsible for your programmes, course content, selection decisions and the certificates you issue.</li>
          <li>Use applicants' and learners' data only for your programmes and their reporting, as your agreement with Talentral describes.</li>
          <li>Only connect webhooks and custom domains you control.</li>
        </ul>
      </section>
      <section>
        <h2>For employers</h2>
        <ul>
          <li>Talentral verifies employers before they can post jobs or see candidates. Give accurate details about your organisation and jobs, including pay.</li>
          <li>Use candidates' information only to recruit for real roles. Never charge candidates any fee.</li>
          <li>Record hires truthfully, including the 90-day check.</li>
        </ul>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>Do not try to reach data that is not yours, test the platform's security without written permission, overload it, send spam, or upload anything unlawful or harmful. We may suspend accounts that do.</p>
      </section>
      <section>
        <h2>Availability and changes</h2>
        <p>We work to keep Talentral available and your data safe, but we cannot promise it will never be interrupted. We may change these terms; we will tell hubs and employers before important changes take effect.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Questions about these terms: <a href="mailto:privacy@talentral.ng">privacy@talentral.ng</a>.</p>
      </section>
    </LegalPage>
  );
}
