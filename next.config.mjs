/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El buscador y la ficha leen de Postgres en cada petición.
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};
export default nextConfig;
