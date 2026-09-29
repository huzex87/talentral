import postgres from 'postgres';
import { applyMigrations } from './migrations';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, onnotice: () => {} });
const applied = await applyMigrations(sql, console.log);
console.log(applied.length ? `${applied.length} migration(s) applied` : 'database is up to date');
await sql.end();
