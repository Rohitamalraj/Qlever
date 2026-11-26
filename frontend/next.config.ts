import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    // MetaMask SDK web bundle can reference this React Native module.
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@react-native-async-storage/async-storage": require("path").resolve(__dirname, "lib/stubs/async-storage-stub.js"),
    };
    return config;
  },
};

export default nextConfig;
