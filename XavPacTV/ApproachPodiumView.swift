import CoreLocation
import SwiftUI

// Écran tvOS sans focus : ces cartes sont un affichage passif, jamais des boutons.
struct ApproachPodiumCard: View {
    let aircraft: Aircraft
    let enrichment: TVAircraftEnrichment?
    let profile: TVTrafficProfile
    let home: CLLocationCoordinate2D
    let rank: Int
    let isHero: Bool

    private let champagne = Color(red: 1.0, green: 0.79, blue: 0.26)
    private let sky = Color(red: 0.13, green: 0.78, blue: 0.98)
    private let midnight = Color(red: 0.01, green: 0.06, blue: 0.16)

    private var accent: Color {
        isHero ? champagne : (rank == 2 ? sky : Color(red: 0.93, green: 0.62, blue: 0.38))
    }

    private var company: String {
        let value = enrichment?.operatorName ?? aircraft.operatorName ?? profile.label
        return value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? profile.label : value
    }

    private var model: String {
        enrichment?.aircraftModel ?? enrichment?.aircraftType
        ?? aircraft.description ?? aircraft.aircraftType ?? profile.label
    }

    private var origin: String {
        enrichment?.departureAirport?.city ?? enrichment?.departureAirport?.code ?? "En vol"
    }

    private var destination: String {
        enrichment?.arrivalAirport?.city ?? enrichment?.arrivalAirport?.code ?? "Destination inconnue"
    }

    private var codes: String {
        guard let from = enrichment?.departureAirport?.code,
              let to = enrichment?.arrivalAirport?.code else {
            return aircraft.displayName
        }
        return "\(from)  →  \(to)"
    }

    private var distance: String {
        String(format: "%.1f", aircraft.distanceKilometers(from: home))
            .replacingOccurrences(of: ".", with: ",")
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                aircraftBackdrop
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .clipped()

                LinearGradient(
                    stops: [
                        .init(color: midnight.opacity(0.09), location: 0),
                        .init(color: midnight.opacity(0.13), location: 0.36),
                        .init(color: midnight.opacity(0.80), location: 0.61),
                        .init(color: midnight.opacity(0.98), location: 1)
                    ],
                    startPoint: .top, endPoint: .bottom
                )

                VStack(alignment: .leading, spacing: isHero ? 10 : 7) {
                    HStack(spacing: 12) {
                        HStack(spacing: 8) {
                            Image(systemName: rank == 1 ? "crown.fill" : "medal.fill")
                                .font(.system(size: isHero ? 27 : 20, weight: .black))
                            Text(rank == 1 ? "1er  •  LE PLUS PROCHE" : "\(rank)e  •  À PROXIMITÉ")
                                .font(.system(size: isHero ? 23 : 17, weight: .black))
                                .lineLimit(1)
                                .minimumScaleFactor(0.65)
                        }
                        .foregroundStyle(isHero ? midnight : .white)
                        .padding(.horizontal, isHero ? 18 : 12)
                        .padding(.vertical, isHero ? 10 : 8)
                        .background(isHero ? champagne : accent.opacity(0.83),
                                    in: Capsule())

                        Spacer(minLength: 0)

                        if profile.isPriorityTraffic {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: isHero ? 27 : 22, weight: .black))
                                .foregroundStyle(.yellow)
                        }
                    }
                    Spacer(minLength: 4)

                    Text(company)
                        .font(.system(size: isHero ? 39 : 27, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.60)

                    Text(model)
                        .font(.system(size: isHero ? 25 : 19, weight: .bold))
                        .foregroundStyle(.white.opacity(0.83))
                        .lineLimit(1)
                        .minimumScaleFactor(0.67)

                    HStack(alignment: .lastTextBaseline, spacing: 6) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(codes)
                                .font(.system(size: isHero ? 31 : 23, weight: .black, design: .rounded))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                                .minimumScaleFactor(0.53)
                            Text("\(origin)  →  \(destination)")
                                .font(.system(size: isHero ? 19 : 16, weight: .bold))
                                .foregroundStyle(.white.opacity(0.74))
                                .lineLimit(1)
                                .minimumScaleFactor(0.58)
                        }

                        Spacer(minLength: 5)

                        VStack(alignment: .trailing, spacing: 0) {
                            Text(distance)
                                .font(.system(size: isHero ? 61 : 42,
                                              weight: .black, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(isHero ? champagne : .white)
                                .lineLimit(1)
                                .minimumScaleFactor(0.62)
                            Text("KM DE HOME")
                                .font(.system(size: isHero ? 17 : 13, weight: .black))
                                .foregroundStyle(isHero ? champagne : sky)
                                .lineLimit(1)
                        }
                    }
                    .padding(.top, 3)
                }
                .padding(isHero ? 24 : 17)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .background(midnight)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(
                    isHero ? champagne : accent.opacity(0.75),
                    lineWidth: isHero ? 5 : 2.5
                )
        }
        .shadow(color: accent.opacity(isHero ? 0.72 : 0.27),
                radius: isHero ? 26 : 13, y: isHero ? 0 : 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Rang \(rank), \(company), \(codes), à \(distance) kilomètres de HOME"
        )
    }

    @ViewBuilder
    private var aircraftBackdrop: some View {
        if let url = enrichment?.photoURL, enrichment?.photo.kind != "generic" {
            AsyncImage(url: url) { phase in
                if let photo = phase.image {
                    photo.resizable().scaledToFill()
                } else {
                    gradientPlaceholder
                }
            }
        } else {
            gradientPlaceholder
        }
    }

    private var gradientPlaceholder: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(
                    colors: [Color(red: 0.08, green: 0.46, blue: 0.84),
                             Color(red: 0.36, green: 0.73, blue: 0.94),
                             Color(red: 0.96, green: 0.74, blue: 0.54)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
                Image(systemName: profile.isRotorcraft ? "helicopter" : "airplane")
                    .font(.system(size: isHero ? 160 : 96, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.7))
                    .rotationEffect(.degrees(-11))
                    .shadow(color: sky.opacity(0.5), radius: 28)
                    .frame(width: geometry.size.width, height: geometry.size.height * 0.7)
                    .offset(y: -18)
            }
        }
    }
}

struct PodiumWaitingCard: View {
    let rank: Int
    let isHero: Bool

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: isHero ? "crown" : "airplane")
                .font(.system(size: isHero ? 64 : 45, weight: .light))
            Text(rank == 1 ? "RADAR EN ÉCOUTE" : "EN ATTENTE")
                .font(.system(size: isHero ? 27 : 21, weight: .black))
            Text("Prochain passage")
                .font(.system(size: isHero ? 21 : 17, weight: .medium))
        }
        .foregroundStyle(Color(red: 0.17, green: 0.48, blue: 0.68))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            LinearGradient(
                colors: [Color.white, Color(red: 0.86, green: 0.95, blue: 1.0)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ), in: RoundedRectangle(cornerRadius: 24)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 24)
                .stroke(isHero ? Color.yellow.opacity(0.70) : Color.cyan.opacity(0.22),
                        lineWidth: isHero ? 4 : 2)
        }
    }
}
