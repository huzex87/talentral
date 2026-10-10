import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export const checksum = (body: string) => createHash('sha256').update(body).digest('hex');

// Forward-only migrations, applied in file-name order, each in its own transaction. Each applied
// file's checksum is recorded, and a file that changes after it was applied stops the run: a
// preview build may already have applied an earlier draft to the shared database, so changes
// belong in a new migration (see 0029_repair_0027.sql for what happens otherwise).
export async function applyMigrations(sql: postgres.Sql, log: (m: string) => void = () => {}): Promise<string[]> {
  await sql`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public.schema_migrations add column if not exists checksum text`;
  const done = new Map((await sql<{ name: string; checksum: string | null }[]>`select name, checksum from public.schema_migrations`).map((r) => [r.name, r.checksum]));
  const applied: string[] = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const body = readFileSync(join(DIR, file), 'utf8');
    const sum = checksum(body);
    if (done.has(file)) {
      const recorded = done.get(file);
      // Rows from before checksums were kept take the file as it is now.
      if (recorded === null) await sql`update public.schema_migrations set checksum = ${sum} where name = ${file} and checksum is null`;
      else if (recorded !== sum) throw new Error(`${file} has changed since it was applied. Applied migrations are never edited: put the change in a new migration file.`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public.schema_migrations (name, checksum) values (${file}, ${sum})`;
    });
    applied.push(file);
    log(`applied ${file}`);
  }
  return applied;
}
