import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
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
