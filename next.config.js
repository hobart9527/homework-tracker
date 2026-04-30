const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./src/i18n.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push(
        "playwright-extra",
        "puppeteer-extra-plugin-stealth",
        "clone-deep",
        "merge-deep"
      );
    }
    return config;
  },
};

module.exports = withNextIntl(nextConfig);
