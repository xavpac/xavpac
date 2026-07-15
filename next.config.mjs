/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    cpus: 1
  }
};

export default nextConfig;
