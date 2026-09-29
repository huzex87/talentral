import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Returns the newest email sent to an address (MAIL_DRIVER=file), waiting briefly for it.
export async function lastMail(to: string, subject: RegExp): Promise<{ subject: string; text: string; html: string; replyTo?: string }> {
  const dir = join(process.cwd(), '.mail');
  for (let i = 0; i < 40; i++) {
    try {
      const files = readdirSync(dir).filter((f) => f.includes(to.replace(/[^a-z0-9@._-]/gi, '_'))).sort().reverse();
      for (const f of files) {
        const mail = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        if (subject.test(mail.subject)) return mail;
      }
    } catch { /* not created yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email to ${to} matching ${subject}`);
}

export function linkIn(text: string): string {
  const m = text.match(/https?:\/\/\S+/);
  if (!m) throw new Error('No link in email');
  return m[0];
}
