import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  async rewrites() {
    // Route /uploads/* dynamically so runtime-uploaded files in public/uploads work in standalone mode
    return {
      beforeFiles: [
        {
          source: '/uploads/:filename',
          destination: '/api/uploads/:filename',
        },
      ],
    };
  },
};

export default nextConfig;
