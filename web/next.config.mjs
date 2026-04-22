/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Only bake NEXT_PUBLIC_ vars at build time. API_URL and ADMIN_API_KEY are
  // injected by Docker at runtime and must NOT be frozen here.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
    NEXT_PUBLIC_ROOT_OID: process.env.ROOT_OID ?? "2.16.840.1.113762",
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
