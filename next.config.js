const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./src/i18n.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Supabase Storage for article cover images & illustrations
      { protocol: "https", hostname: "*.supabase.co" },
      // Pollinations AI for generated illustrations
      { protocol: "https", hostname: "image.pollinations.ai" },
      // Unsplash for stock cover images (keep if used; remove if not)
      { protocol: "https", hostname: "images.unsplash.com" },
      // News source images (add actual domains as needed, e.g. img.bjd.com.cn)
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
          },
        ],
      },
      // Long-lived cache for hashed static assets (previously in vercel.json,
      // moved here so headers live in one place). Only the `/_next/static/*`
      // path — user-uploaded SVGs in /public should NOT be immutable.
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
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
