// Database access. Every request-scoped query goes through withUser(), which runs the callback in a
// transaction as the restricted app_user role with app.user_id set, so Row-Level Security applies.
// `system` bypasses RLS and is used only for authentication plumbing and platform bootstrapping.
import postgres from 'postgres';

export type Tx = postgres.TransactionSql;
export type Sql = postgres.Sql;

const globalForDb = globalThis as unknown as { __talentralSql?: Sql };

function connect(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idle_timeout: 20,
    // Supabase's transaction pooler (port 6543) does not support prepared statements.
    prepare: !url.includes(':6543'),
    onnotice: () => {},
  });
}

// One pool per process (Next.js dev reloads modules, so keep it on globalThis).
export function db(): Sql {
  if (!globalForDb.__talentralSql) globalForDb.__talentralSql = connect();
  return globalForDb.__talentralSql;
}

export async function withUser<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId ?? ''}, true)`;
    await tx`set local role app_user`;
    return fn(tx);
  }) as Promise<T>;
}

export function system(): Sql {
  return db();
}

export async function closeDb(): Promise<void> {
  await globalForDb.__talentralSql?.end({ timeout: 5 });
  globalForDb.__talentralSql = undefined;
}

export { applyMigrations } from './migrations';
export * from './types';
