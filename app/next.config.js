const { withSentryConfig } = require("@sentry/nextjs");

const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, ".."),
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});
