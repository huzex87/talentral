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
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};

export default config;
