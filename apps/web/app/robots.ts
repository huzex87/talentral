import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

// Search engines may index public pages; signed-in areas, APIs and private links stay out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard', '/platform', '/learn', '/passport', '/account', '/auth', '/invite', '/employer/', '/shortlist', '/files', '/api', '/verify/', '/sign-out'] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
    host: env.appUrl,
  };
}
