// Creates platform admins from PLATFORM_ADMIN_EMAILS. With --demo, also creates a demo hub and
// an open programme so the application flow can be tried locally. Safe to run repeatedly.
import postgres from 'postgres';

// Schema changes prefer a session connection (Supabase session pooler, port 5432) when one is given.
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, prepare: !url.includes(':6543'), onnotice: () => {} });

const admins = (process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
for (const email of admins) {
  await sql`insert into public.users (email, is_platform_admin) values (${email}, true)
            on conflict (email) do update set is_platform_admin = true`;
  console.log(`platform admin: ${email}`);
}

if (process.argv.includes('--demo')) {
  const [hub] = await sql<{ id: string }[]>`
    insert into public.tenants (slug, name, tagline, description, brand_color, contact_email, state, profile_completed_at)
    values ('demo-hub', 'Demo Innovation Hub', 'A sample hub for trying Talentral',
            'This hub exists for local development and demos.', '#0F766E', 'hello@example.com', 'Katsina', now())
    on conflict (slug) do update set name = excluded.name
    returning id`;
  await sql`
    insert into public.programmes (tenant_id, slug, title, summary, description, eligibility, tracks, form, status, reference_prefix)
    values (${hub!.id}, 'digital-skills-2026', 'Digital Skills Cohort 2026',
            'Twelve weeks of practical digital skills training.',
            'Learn in-demand digital skills with mentors and live projects.',
            'Aged 18 to 35 and living in Northern Nigeria.',
            ${sql.json(['Digital Marketing', 'Software Development', 'Data Analysis'])},
            ${sql.json([
              { id: 'gender', label: 'Gender', type: 'select', required: true, options: ['Female', 'Male', 'Prefer not to say'] },
              { id: 'motivation', label: 'Why do you want to join?', type: 'long_text', required: true, maxLength: 1500 },
            ])},
            'open', 'DEM')
    on conflict (tenant_id, slug) do nothing`;
  console.log('demo hub: /demo-hub');
}
await sql.end();
