/**
 * Load env before Expo bundles EXPO_PUBLIC_*.
 * Only `mobile/.env` is loaded here — never the monorepo root `.env` (that file is for
 * the Next.js server and often contains LAN URLs that must not be baked into APK/IPA).
 * For device testing against a local API, copy URLs into `mobile/.env`.
 */
const path = require("path");

try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch (_) {}

module.exports = require("./app.json");
