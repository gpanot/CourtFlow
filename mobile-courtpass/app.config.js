/**
 * Load env before Expo bundles EXPO_PUBLIC_*.
 * Only `mobile-courtpass/.env` is loaded here — never the monorepo root `.env`
 * (that file is for the Next.js server) and never `mobile/.env` (that file is
 * for the CourtPay staff/tablet app).
 * For device testing against a local API, override values in `mobile-courtpass/.env`.
 */
const path = require("path");

try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch (_) {}

module.exports = require("./app.json");
