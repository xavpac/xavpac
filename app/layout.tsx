import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata = {
  title: `XavPac ${process.env.NEXT_PUBLIC_XAVPAC_VERSION ?? "développement"} — Tableau de bord aéronautique`,
  description: "Aviation FlightWall en temps réel — XavPac"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
