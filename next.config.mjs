/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // We run typecheck separately; keep builds unblocked but we aim for zero errors.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
