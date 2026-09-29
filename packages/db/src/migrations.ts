import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

// Forward-only migrations, applied in file-name order, each in its own transaction.
export async function applyMigrations(sql: postgres.Sql, log: (m: string) => void = () => {}): Promise<string[]> {
  await sql`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql<{ name: string }[]>`select name from public.schema_migrations`).map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const body = readFileSync(join(DIR, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public.schema_migrations (name) values (${file})`;
    });
    applied.push(file);
    log(`applied ${file}`);
  }
  return applied;
}
