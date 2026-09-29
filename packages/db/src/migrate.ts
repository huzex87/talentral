import postgres from 'postgres';
import { applyMigrations } from './migrations';

// Schema changes prefer a session connection (Supabase session pooler, port 5432) when one is given.
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, prepare: !url.includes(':6543'), onnotice: () => {} });
const applied = await applyMigrations(sql, console.log);
console.log(applied.length ? `${applied.length} migration(s) applied` : 'database is up to date');

// Production only: ask the database's scheduler (Supabase pg_cron + pg_net) to call the reminder
// job every five minutes. Vercel Cron also calls it daily as a fallback. Never fails the build:
// without the extensions, reminders still go out once a day.
if (process.env.VERCEL_ENV === 'production' && process.env.CRON_SECRET && process.env.APP_URL) {
  try {
    await sql.unsafe('create extension if not exists pg_cron');
    await sql.unsafe('create extension if not exists pg_net');
    const target = `${process.env.APP_URL.replace(/\/$/, '')}/api/cron/reminders`;
    const quote = (v: string) => `'${v.replace(/'/g, "''")}'`;
    const command = `select net.http_get(url := ${quote(target)}, headers := jsonb_build_object('Authorization', ${quote(`Bearer ${process.env.CRON_SECRET}`)}))`;
    await sql`select cron.schedule('talentral-reminders', '*/5 * * * *', ${command})`;
    console.log('reminder schedule set: every 5 minutes');
  } catch (e) {
    console.warn('could not set the reminder schedule (reminders fall back to daily):', (e as Error).message);
  }
}
await sql.end();
