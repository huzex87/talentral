import { LegalPage } from '@/components/legal-page';

export const metadata = { title: 'Privacy notice', description: 'How Talentral and the hubs that use it collect, use and protect personal data.' };

export default function Privacy() {
  return (
    <LegalPage title="Privacy notice" updated="5 October 2026">
      <section>
        <p>Talentral is a skills-to-work platform. Innovation hubs use it to run their programmes: calls for applications, cohorts, courses, certificates and the move into work. This notice explains what personal data is processed, why, who sees it and the choices you have. It follows the Nigeria Data Protection Act 2023.</p>
      </section>
      <section>
        <h2>Who is responsible</h2>
        <ul>
          <li><b>The hub</b> that runs your programme (for example Kirkira Innovation Hub) decides how your application and learning records are used. It is the controller of that data.</li>
          <li><b>Talentral</b> runs the platform for hubs, and is the controller for your Talentral account, your Passport, talent matching and the security of the platform.</li>
          <li><b>Employers</b> who receive your details with your permission become responsible for their own copy.</li>
        </ul>
      </section>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><b>Contact and identity:</b> name, email address and phone number.</li>
          <li><b>Application answers:</b> what the hub asks, such as date of birth, gender, state, education and why you want to join, and any documents you upload. Some hubs ask whether you live with a disability; answering is optional.</li>
          <li><b>Learning records:</b> attendance, lesson progress, quiz answers, assignments, grades, feedback and discussion posts.</li>
          <li><b>Certificates:</b> your name, the programme, dates and results printed on the certificate.</li>
          <li><b>Passport:</b> if you create one, your skills, portfolio, availability and the choices you make about who may see it.</li>
          <li><b>Questions to the AI tutor:</b> what you ask and the answers, kept for 30 days.</li>
          <li><b>Security and usage:</b> sign-in records, the days you use the platform and an audit trail of staff actions.</li>
        </ul>
      </section>
      <section>
        <h2>Why we use it</h2>
        <ul>
          <li>To review your application and, if you are selected, run your programme: teaching, attendance, grading and certificates.</li>
          <li>To send class reminders, updates and decisions by email, SMS or WhatsApp if you choose it.</li>
          <li>To report to programme funders, only as totals that do not identify you.</li>
          <li>With your permission, to show your Passport to the Talentral talent team and verified employers, and to share it with an employer when you apply for a job.</li>
          <li>To keep the platform secure and to meet our legal obligations.</li>
        </ul>
        <p>People make the decisions about selection, grading and hiring. Readiness levels follow published rules, and matches to jobs always show their reasons.</p>
      </section>
      <section>
        <h2>Certificates and verification</h2>
        <p>Every certificate has a number and a QR code. Anyone with the number can check it on Talentral and see what the certificate shows: your name, the programme, the hub, dates and results. Employers' systems can check it in the same way. A hub can withdraw a certificate, and it is withdrawn if you ask us to delete your data.</p>
      </section>
      <section>
        <h2>AI</h2>
        <p>Hub teams can ask Claude, an AI model from Anthropic, to help draft text such as lesson notes or feedback; a person reviews every draft before it is saved, and AI never sets grades. Learners can ask the AI course tutor questions about their course: it answers only from the course lessons and never receives your name or contact details. Questions are kept for 30 days and only you can see them.</p>
      </section>
      <section>
        <h2>Who we share it with</h2>
        <p>We use service providers to run Talentral: hosting and databases, file storage, email delivery, SMS and WhatsApp messaging, video streaming and AI. They process data only on our instructions. Some are outside Nigeria; where that is the case we rely on the safeguards the Act allows. We never sell personal data, and employers never charge candidates any fee.</p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>Hubs keep application and learning records for as long as they need them for the programme and its reporting. Tutor questions and webhook delivery records are deleted after 30 days. If you ask us to delete your data, we delete your account and everything that identifies you, and keep only anonymous records that funders need.</p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>You can see, download, correct or delete your data at any time from <a href="/account/privacy">Your data</a> after signing in, or by writing to us. You can withdraw any permission you gave, such as Passport sharing or WhatsApp messages, and you can object to processing or complain to the Nigeria Data Protection Commission.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Email <a href="mailto:privacy@talentral.ng">privacy@talentral.ng</a>. We reply within 30 days, usually much sooner. For questions about a specific programme you can also contact the hub that runs it.</p>
      </section>
    </LegalPage>
  );
}
