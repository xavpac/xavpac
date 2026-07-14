import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata = {
  title: "XavPac",
  description: "Aviation, opérations, drone et astronomie"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
