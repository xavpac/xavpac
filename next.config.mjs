import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageInfo = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const instant = new Date();
const parts = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(instant).map((part) => [part.type, part.value]));
let gitSha = "non-disponible";
try { gitSha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch {}

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_XAVPAC_VERSION: packageInfo.version,
    NEXT_PUBLIC_BUILD_DATE: `${parts.day}/${parts.month}/${parts.year}`,
    NEXT_PUBLIC_BUILD_TIME: `${parts.hour}:${parts.minute}`,
    NEXT_PUBLIC_BUILD_NUMBER: `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`,
    NEXT_PUBLIC_COMMIT_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || gitSha).slice(0, 7),
    NEXT_PUBLIC_DEPLOY_ENV: process.env.VERCEL_ENV === "production" ? "Production" : "Développement"
  }
};

export default nextConfig;
