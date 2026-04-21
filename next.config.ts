import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Прибиваем workspace root к папке проекта, иначе Next 16 берёт лишний
    // package-lock.json в home-директории и ругается.
    root: __dirname,
  },
};

export default nextConfig;
