const basePath = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "export",
  ...(basePath ? { basePath } : {}),
  allowedDevOrigins: ["*.replit.dev", "localhost", "127.0.0.1"],
};

export default nextConfig;
