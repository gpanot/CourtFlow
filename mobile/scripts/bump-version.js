#!/usr/bin/env node

/**
 * Reads versionCode from android/app/build.gradle and writes
 * APP_VERSION_CODE + today's date into both app-version.ts files
 * (mobile + PWA) so the "Continue as" screen always shows the
 * correct build number without manual edits.
 *
 * Run: node mobile/scripts/bump-version.js
 * Wired automatically via the "prebuild" npm script.
 */

const fs = require("fs");
const path = require("path");

const MOBILE_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = path.resolve(MOBILE_DIR, "..");

const BUILD_GRADLE = path.join(MOBILE_DIR, "android", "app", "build.gradle");
const MOBILE_VERSION_FILE = path.join(MOBILE_DIR, "src", "lib", "app-version.ts");
const PWA_VERSION_FILE = path.join(ROOT_DIR, "src", "lib", "app-version.ts");

const gradle = fs.readFileSync(BUILD_GRADLE, "utf8");
const match = gradle.match(/versionCode\s+(\d+)/);
if (!match) {
  console.error("Could not find versionCode in", BUILD_GRADLE);
  process.exit(1);
}

const versionCode = Number(match[1]);
const today = new Date().toISOString().slice(0, 10);

const content = [
  `export const APP_VERSION_CODE = ${versionCode};`,
  `export const APP_BUILD_DATE = "${today}";`,
  "",
].join("\n");

fs.writeFileSync(MOBILE_VERSION_FILE, content, "utf8");
fs.writeFileSync(PWA_VERSION_FILE, content, "utf8");

console.log(`bump-version: v${versionCode} — ${today}`);
