import type { NextConfig } from 'next';

const root = process.env.ROOT_DOMAIN;

// Content Security Policy. The enforced part blocks framing by other sites, plugins and <base>
// hijacking, which nothing in the product needs. The full policy runs report-only, sending
// violations to /api/csp-report, so it can be tightened and enforced once production traffic shows
// it breaks nothing (hub custom domains, storage and video providers vary by deployment).
const CSP = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'";
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://iframe.mediadelivery.net",
  "worker-src 'self'",
  "form-action 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  'report-uri /api/csp-report',
].join('; ');

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
        { key: 'Content-Security-Policy', value: CSP },
        { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
      ],
    }];
  },
};

export default config;
