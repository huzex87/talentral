import type { NextConfig } from 'next';

const root = process.env.ROOT_DOMAIN;

const config: NextConfig = {
  transpilePackages: ['@talentral/domain', '@talentral/db'],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Applications may carry up to three 5 MB documents; logos are at most 2 MB.
      bodySizeLimit: '16mb',
      // Hub pages live on subdomains of the root domain and post back to the same app.
      allowedOrigins: root ? [root, `*.${root}`] : undefined,
    },
  },
  async headers() {
    return [{
      // The offline worker must always be checked for a new version.
      source: '/sw.js',
      headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }],
    }, {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }];
  },
};

export default config;
