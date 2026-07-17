import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata = {
  title: "XavPac 6.3 — Tableau de bord aéronautique",
  description: "Aviation FlightWall en temps réel — XavPac"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
