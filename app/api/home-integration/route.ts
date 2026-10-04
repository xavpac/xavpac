import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    product: "XavPac",
    generatedAt: new Date().toISOString(),
    readiness: {
      pwa: "ready",
      iosStandalone: "ready",
      ipadStandalone: "ready",
      homeAssistantEmbed: "ready",
      homeKitNativeBridge: "pending-local-bridge"
    },
    entrypoints: {
      spotter: "/spotter",
      drone: "/drone",
      embeddedHome: "/spotter?embed=home",
      aircraftView: "/spotter?mode=avion"
    },
    integration: {
      homeAssistant: {
        method: "iframe",
        note: "Le mode embed=home compacte la coque XavPac pour un tableau de bord mural ou Home Assistant."
      },
      homeKit: {
        method: "local-bridge-required",
        note: "HomeKit natif nécessite un pont local Home Assistant/Homebridge ou une intégration dédiée. L’interface web et les points d’entrée XavPac sont prêts."
      }
    }
  });
}
