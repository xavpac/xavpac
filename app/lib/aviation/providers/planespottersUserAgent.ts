const DEFAULT_CONTACT_URL = "https://github.com/xavpac/xavpac";

export function planespottersUserAgent(
  version = process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "development",
  contactUrl = process.env.XAVPAC_CONTACT_URL ?? DEFAULT_CONTACT_URL
) {
  const safeVersion = version.trim().replace(/[^A-Za-z0-9._-]/g, "-") || "development";
  const safeContact = /^https?:\/\/\S+$/i.test(contactUrl.trim()) ? contactUrl.trim() : DEFAULT_CONTACT_URL;
  return `XavPac/${safeVersion} (+${safeContact})`;
}
