import MapKit
import SwiftUI

struct ContentView: View {
    @StateObject private var service = AircraftService()
    @State private var selectedID: String?
    @FocusState private var focusedAircraftID: String?

    private var selectedAircraft: Aircraft? {
        guard let selectedID else { return nil }
        return service.aircraft.first(where: { $0.id == selectedID })
    }

    var body: some View {
        ZStack {
            AircraftMapView(
                aircraft: service.aircraft,
                center: service.center,
                selectedID: $selectedID
            )
            .ignoresSafeArea()

            LinearGradient(
                colors: [.black.opacity(0.58), .clear, .black.opacity(0.22)],
                startPoint: .top,
                endPoint: .bottom
            )
            .allowsHitTesting(false)
            .ignoresSafeArea()

            VStack {
                HStack(alignment: .top) {
                    statusCard
                    Spacer()
                    trafficPanel
                }
                Spacer()
            }
            .padding(34)
        }
        .onAppear {
            service.start()
        }
        .onDisappear {
            service.stop()
        }
        .onChange(of: focusedAircraftID) { newValue in
            guard let newValue else { return }
            selectedID = newValue
        }
    }

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: "airplane.circle.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(.cyan)

                VStack(alignment: .leading, spacing: 2) {
                    Text("XavPac TV")
                        .font(.title2.bold())
                    Text("TRAFIC AÉRIEN EN DIRECT")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 16) {
                Label("\(service.aircraft.count) avions", systemImage: "airplane")
                Label(updateLabel, systemImage: "clock")
            }
            .font(.callout.bold())

            if let message = service.errorMessage {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.orange)
            } else {
                Text(service.source)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(18)
        .frame(width: 390, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var trafficPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let selectedAircraft {
                selectedCard(selectedAircraft)
            } else {
                Text("Avions proches")
                    .font(.title3.bold())
                Text("Utilise la télécommande pour choisir un appareil.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Divider()

            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(service.aircraft.prefix(12)) { aircraft in
                        Button {
                            selectedID = aircraft.id
                        } label: {
                            aircraftRow(aircraft)
                        }
                        .buttonStyle(.plain)
                        .focused($focusedAircraftID, equals: aircraft.id)
                    }
                }
            }
        }
        .padding(18)
        .frame(width: 470, height: 900, alignment: .topLeading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    }

    private func selectedCard(_ aircraft: Aircraft) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(aircraft.displayName)
                        .font(.title.bold())
                    Text(aircraft.subtitle.isEmpty ? "Appareil identifié par ADS-B" : aircraft.subtitle)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: "airplane")
                    .font(.system(size: 34, weight: .bold))
                    .rotationEffect(.degrees((aircraft.trueTrack ?? 0) - 90))
                    .foregroundStyle(.cyan)
            }

            HStack(spacing: 12) {
                metric(aircraft.altitudeLabel)
                metric(aircraft.speedLabel)
                metric(aircraft.headingLabel)
            }

            Text("\(aircraft.distanceKilometers(from: service.center), specifier: "%.1f") km du centre XavPac")
                .font(.caption.bold())
                .foregroundStyle(.cyan)
        }
    }

    private func aircraftRow(_ aircraft: Aircraft) -> some View {
        let focused = focusedAircraftID == aircraft.id
        let selected = selectedID == aircraft.id

        return HStack(spacing: 14) {
            Image(systemName: "airplane")
                .font(.system(size: 24, weight: .bold))
                .rotationEffect(.degrees((aircraft.trueTrack ?? 0) - 90))
                .foregroundStyle(selected ? .white : .cyan)
                .frame(width: 34)

            VStack(alignment: .leading, spacing: 3) {
                Text(aircraft.displayName)
                    .font(.headline)
                    .lineLimit(1)
                Text(aircraft.subtitle.isEmpty ? aircraft.altitudeLabel : aircraft.subtitle)
                    .font(.caption)
                    .foregroundStyle(selected ? .white.opacity(0.82) : .secondary)
                    .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text("\(aircraft.distanceKilometers(from: service.center), specifier: "%.1f") km")
                    .font(.headline.monospacedDigit())
                Text(aircraft.altitudeLabel)
                    .font(.caption)
                    .foregroundStyle(selected ? .white.opacity(0.82) : .secondary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            selected
                ? Color.cyan.opacity(0.75)
                : focused
                    ? Color.white.opacity(0.18)
                    : Color.black.opacity(0.16),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(focused ? Color.white.opacity(0.72) : Color.clear, lineWidth: 2)
        }
        .scaleEffect(focused ? 1.035 : 1)
        .animation(.easeOut(duration: 0.16), value: focused)
    }

    private func metric(_ text: String) -> some View {
        Text(text)
            .font(.caption.bold())
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color.white.opacity(0.10), in: Capsule())
    }

    private var updateLabel: String {
        guard let date = service.updatedAt else { return "connexion…" }
        let seconds = max(0, Int(Date().timeIntervalSince(date)))
        return seconds < 60 ? "MAJ \(seconds) s" : "MAJ \(seconds / 60) min"
    }
}
