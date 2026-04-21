import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    // Прибиваем workspace root к папке проекта, иначе Next 16 берёт лишний
    // package-lock.json в home-директории и ругается.
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
  // ydb-sdk тянет через require() метадата-клиента @yandex-cloud/nodejs-sdk —
  // Turbopack не умеет это статически разрешить, поэтому держим оба пакета
  // вне бандла и подгружаем из node_modules в рантайме.
  serverExternalPackages: ["ydb-sdk", "@yandex-cloud/nodejs-sdk"],
};

export default nextConfig;
