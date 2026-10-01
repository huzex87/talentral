import { rmSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { applyMigrations } from '@talentral/db';
import { E2E_DATABASE_URL } from '../playwright.config';

export default async function setup() {
  const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
  await sql.unsafe('drop schema if exists public cascade; drop schema if exists app cascade; create schema public;');
  await applyMigrations(sql);
  await sql`insert into public.users (email, full_name, is_platform_admin) values ('ops@talentral.ng', 'Talentral Ops', true)`;
  await sql.end();
  rmSync(join(process.cwd(), '.mail'), { recursive: true, force: true });
  rmSync(join(process.cwd(), '.sms'), { recursive: true, force: true });
  rmSync(join(process.cwd(), '.whatsapp'), { recursive: true, force: true });
  rmSync(join(process.cwd(), '.stream'), { recursive: true, force: true });
}
