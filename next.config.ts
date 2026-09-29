import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';

const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' https://fastly.jsdelivr.net https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https://fastly.jsdelivr.net https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"])
].join('; ');

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), browsing-topics=()',
  },
  {
    key: 'Content-Security-Policy',
    value: cspHeader,
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  ...(isDev && {
    allowedDevOrigins: [
      '192.168.1.117',
      '192.168.56.1'
    ],
    experimental: {
      serverActions: {
        allowedOrigins: ['192.168.1.117:3000', '192.168.56.1:3000', 'localhost:3000']
      }
    }
  })
};

export default nextConfig;
