export const BUILD_INFO = {
  version: process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "développement",
  date: process.env.NEXT_PUBLIC_BUILD_DATE ?? "Non disponible",
  time: process.env.NEXT_PUBLIC_BUILD_TIME ?? "Non disponible",
  number: process.env.NEXT_PUBLIC_BUILD_NUMBER ?? "local",
  commit: process.env.NEXT_PUBLIC_COMMIT_SHA ?? "non-disponible",
  environment: process.env.NEXT_PUBLIC_DEPLOY_ENV === "Production" ? "Production" : "Développement"
} as const;

export type DataModule = "aviation" | "operations" | "drone" | "weather" | "astronomy";
export const DATA_UPDATE_EVENT = "xavpac:data-update";
export function reportDataUpdate(module: DataModule) {
  if (typeof window === "undefined") return;
  const value = new Date().toISOString();
  window.localStorage.setItem(`xavpac:update:${module}`, value);
  window.dispatchEvent(new CustomEvent(DATA_UPDATE_EVENT));
}
