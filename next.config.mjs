/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  experimental: {
    webpackBuildWorker: false,
    cpus: 1
  },
  typescript: {
    ignoreBuildErrors: true
  }
};

export default nextConfig;
