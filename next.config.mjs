/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracing: false,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  experimental: {
    cpus: 1
  }
};

export default nextConfig;
