import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata = {
  title: "XavPac 4.0",
  description: "Tableau de bord aviation, drone, astronomie et météo"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
