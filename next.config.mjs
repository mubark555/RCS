/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ws يُحمَّل من node_modules مباشرة في الخادم (تجميعه يكسر إطارات WebSocket)
  experimental: { serverComponentsExternalPackages: ["ws"] },
};

export default nextConfig;
