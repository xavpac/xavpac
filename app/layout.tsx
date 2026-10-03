import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./styles/v2-tokens.css";
import "./styles/v2-shell.css";
import "./styles/fire-risk.css";
import "./styles/v3-foundation.css";
import "./styles/v3-modules.css";
import "./styles/v4-aurora.css";
import { LiveGeolocationProvider } from "./hooks/useLiveGeolocation";

export const metadata = {
  title: `XavPac ${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "développement"} — Tableau de bord aéronautique`,
  description: "Aviation, drone, météo et maison connectée — XavPac",
  applicationName: "XavPac",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "XavPac",
    statusBarStyle: "default"
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#dfeff8"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body><LiveGeolocationProvider>{children}</LiveGeolocationProvider></body>
    </html>
  );
}
