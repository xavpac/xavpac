import AVFoundation
import MapKit
import SwiftUI
import UIKit

struct ContentView: View {
    @StateObject private var service = AircraftService()
    @StateObject private var mediaService = DestinationMediaService()
    @State private var selectedID: String?
    @FocusState private var focusedAircraftID: String?

    private var selectedAircraft: Aircraft? {
        if let selectedID,
           let selected = service.aircraft.first(where: { $0.id == selectedID }) {
            return selected
        }
        return service.aircraft.first
    }

    private var selectedEnrichment: TVAircraftEnrichment? {
        service.enrichment(for: selectedAircraft)
    }

    private var destinationTaskKey: String {
        let modeS = selectedEnrichment?.modeS ?? "none"
        let destination = selectedEnrichment?.arrivalAirport?.code ?? "none"
        return "\(modeS)-\(destination)"
    }

    var body: some View {
        ZStack {
            AircraftMapView(
                aircraft: service.aircraft,
                center: service.center,
                trails: service.trails,
                selectedID: $selectedID
            )
            .ignoresSafeArea()

            LinearGradient(
                colors: [.black.opacity(0.56), .clear, .black.opacity(0.38)],
                startPoint: .top,
                endPoint: .bottom
            )
            .allowsHitTesting(false)
            .ignoresSafeArea()

            HStack(alignment: .top, spacing: 24) {
                VStack(alignment: .leading) {
                    statusCard
                    Spacer()
                    radarLegend
                }

                Spacer(minLength: 40)

                VStack(spacing: 16) {
                    featuredCard
                    destinationCard
                    nearbyCard
                }
                .frame(width: 560)
            }
            .padding(30)
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            service.start()
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            service.stop()
        }
        .onChange(of: focusedAircraftID) { _, newValue in
            guard let newValue else { return }
            selectedID = newValue
        }
        .onChange(of: service.aircraft.first?.id) { _, newValue in
            guard let newValue else { return }
            if selectedID == nil || !service.aircraft.contains(where: { $0.id == selectedID }) {
                selectedID = newValue
            }
        }
        .task(id: destinationTaskKey) {
            await mediaService.load(for: selectedEnrichment)
        }
        .task(id: mediaService.current?.id) {
            guard let media = mediaService.current else { return }
            let seconds: UInt64 = media.isVideo ? 11 : 8
            try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
            guard !Task.isCancelled else { return }
            await mediaService.advance()
        }
    }

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "airplane.circle.fill")
                    .font(.system(size: 38))
                    .foregroundStyle(.cyan)

                VStack(alignment: .leading, spacing: 2) {
                    Text("XavPac TV")
                        .font(.title2.bold())
                    Text("RADAR · TRAFIC EN DIRECT")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 18) {
                Label("\(service.aircraft.count) avions", systemImage: "airplane")
                Label(updateLabel, systemImage: "clock")
            }
            .font(.callout.bold())

            HStack(spacing: 7) {
                Circle()
                    .fill(service.errorMessage == nil ? Color.green : Color.orange)
                    .frame(width: 9, height: 9)
                Text(service.errorMessage ?? service.source)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(18)
        .frame(width: 380, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var radarLegend: some View {
        HStack(spacing: 14) {
            Label("10 km", systemImage: "circle")
            Text("25 km")
            Text("50 km")
            if let selectedAircraft {
                Divider()
                    .frame(height: 22)
                Text("\(selectedAircraft.distanceKilometers(from: service.center), specifier: "%.1f") km")
                    .fontWeight(.bold)
                    .foregroundStyle(.orange)
            }
        }
        .font(.caption.bold())
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background(.ultraThinMaterial, in: Capsule())
    }

    private var featuredCard: some View {
        VStack(spacing: 0) {
            if let aircraft = selectedAircraft {
                ZStack(alignment: .bottomLeading) {
                    aircraftPhoto(enrichment: selectedEnrichment)
                        .frame(height: 190)
                        .clipped()

                    LinearGradient(
                        colors: [.clear, .black.opacity(0.85)],
                        startPoint: .top,
                        endPoint: .bottom
                    )

                    HStack(alignment: .bottom, spacing: 14) {
                        operatorLogo(enrichment: selectedEnrichment)
                            .frame(width: 58, height: 58)

                        VStack(alignment: .leading, spacing: 3) {
                            Text("AVION LE PLUS PROCHE")
                                .font(.caption.bold())
                                .foregroundStyle(.green)
                            Text(aircraft.displayName)
                                .font(.title.bold())
                            Text(selectedEnrichment?.operatorName ?? aircraft.operatorName ?? aircraft.subtitle)
                                .font(.callout)
                                .foregroundStyle(.white.opacity(0.82))
                                .lineLimit(1)
                        }

                        Spacer()

                        Text("\(aircraft.distanceKilometers(from: service.center), specifier: "%.1f") km")
                            .font(.title2.bold().monospacedDigit())
                            .foregroundStyle(.green)
                    }
                    .padding(16)
                }

                VStack(spacing: 13) {
                    routeLine(enrichment: selectedEnrichment)

                    HStack(spacing: 10) {
                        metric(title: "Altitude", value: aircraft.altitudeLabel, icon: "mountain.2")
                        metric(title: "Vitesse", value: aircraft.speedLabel, icon: "gauge.with.dots.needle.67percent")
                        metric(title: "Cap", value: aircraft.headingLabel, icon: "location.north.fill")
                    }
                }
                .padding(16)
            } else {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Recherche du trafic…")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity, minHeight: 330)
            }
        }
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
    }

    private var destinationCard: some View {
        ZStack(alignment: .bottomLeading) {
            Group {
                if let media = mediaService.current {
                    if media.isVideo, let url = media.mediaURL {
                        LoopingVideoView(url: url)
                    } else if let url = media.mediaURL {
                        AsyncImage(url: url) { phase in
                            if let image = phase.image {
                                image.resizable().scaledToFill()
                            } else {
                                destinationFallback
                            }
                        }
                    } else {
                        destinationFallback
                    }
                } else {
                    destinationFallback
                }
            }
            .frame(height: 270)
            .clipped()

            LinearGradient(
                colors: [.clear, .black.opacity(0.82)],
                startPoint: .center,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Label("VILLE D’ARRIVÉE", systemImage: "play.rectangle.fill")
                        .font(.caption.bold())
                        .foregroundStyle(.cyan)
                    Spacer()
                    if mediaService.current?.isVideo == true {
                        Text("VIDÉO AUTO")
                            .font(.caption2.bold())
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(Color.green.opacity(0.78), in: Capsule())
                    }
                }

                Text(selectedEnrichment?.destinationLabel ?? "Destination")
                    .font(.title.bold())

                if let media = mediaService.current {
                    Text(attribution(media))
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.72))
                        .lineLimit(1)
                } else if mediaService.isLoading {
                    Text("Chargement automatique des images…")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Les médias changeront automatiquement avec la destination.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(16)
        }
        .background(Color.black.opacity(0.36))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.10), lineWidth: 1)
        }
    }

    private var nearbyCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Avions proches", systemImage: "airplane")
                    .font(.headline)
                Spacer()
                Text("\(service.aircraft.count)")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }

            ForEach(service.aircraft.prefix(4)) { aircraft in
                Button {
                    selectedID = aircraft.id
                } label: {
                    nearbyRow(aircraft)
                }
                .buttonStyle(.plain)
                .focused($focusedAircraftID, equals: aircraft.id)
            }
        }
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func nearbyRow(_ aircraft: Aircraft) -> some View {
        let enrichment = service.enrichment(for: aircraft)
        let focused = focusedAircraftID == aircraft.id
        let selected = selectedAircraft?.id == aircraft.id

        return HStack(spacing: 12) {
            operatorLogo(enrichment: enrichment)
                .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(aircraft.displayName)
                    .font(.headline)
                    .lineLimit(1)
                Text(enrichment?.routeLabel ?? aircraft.subtitle)
                    .font(.caption)
                    .foregroundStyle(selected ? .white.opacity(0.82) : .secondary)
                    .lineLimit(1)
            }

            Spacer()

            Text("\(aircraft.distanceKilometers(from: service.center), specifier: "%.1f") km")
                .font(.headline.monospacedDigit())
                .foregroundStyle(selected ? .white : .cyan)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(
            selected
                ? Color.cyan.opacity(0.52)
                : focused
                    ? Color.white.opacity(0.14)
                    : Color.black.opacity(0.10),
            in: RoundedRectangle(cornerRadius: 15, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .stroke(focused ? Color.white.opacity(0.70) : Color.clear, lineWidth: 2)
        }
        .scaleEffect(focused ? 1.02 : 1)
        .animation(.easeOut(duration: 0.15), value: focused)
    }

    @ViewBuilder
    private func aircraftPhoto(enrichment: TVAircraftEnrichment?) -> some View {
        if let url = enrichment?.photoURL {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    aircraftPlaceholder
                }
            }
        } else {
            aircraftPlaceholder
        }
    }

    private var aircraftPlaceholder: some View {
        ZStack {
            LinearGradient(
                colors: [Color.blue.opacity(0.48), Color.black.opacity(0.62)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: "airplane")
                .font(.system(size: 84, weight: .bold))
                .foregroundStyle(.white.opacity(0.72))
        }
    }

    @ViewBuilder
    private func operatorLogo(enrichment: TVAircraftEnrichment?) -> some View {
        if let url = enrichment?.logoURL {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image
                        .resizable()
                        .scaledToFit()
                        .padding(5)
                } else {
                    logoPlaceholder
                }
            }
            .background(Color.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        } else {
            logoPlaceholder
        }
    }

    private var logoPlaceholder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.12))
            Image(systemName: "airplane")
                .foregroundStyle(.cyan)
        }
    }

    private func routeLine(enrichment: TVAircraftEnrichment?) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(enrichment?.departureAirport?.code ?? "—")
                    .font(.title2.bold())
                Text(enrichment?.departureAirport?.city ?? "Départ")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()
            Image(systemName: "airplane")
                .foregroundStyle(.cyan)
            Image(systemName: "arrow.right")
                .foregroundStyle(.secondary)
            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(enrichment?.arrivalAirport?.code ?? "—")
                    .font(.title2.bold())
                Text(enrichment?.arrivalAirport?.city ?? "Arrivée")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }

    private func metric(title: String, value: String, icon: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(.cyan)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.callout.bold().monospacedDigit())
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private var destinationFallback: some View {
        ZStack {
            LinearGradient(
                colors: [Color.indigo.opacity(0.72), Color.cyan.opacity(0.24), Color.black],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: "building.2.crop.circle")
                .font(.system(size: 76))
                .foregroundStyle(.white.opacity(0.45))
        }
    }

    private func attribution(_ media: DestinationMedia) -> String {
        if let author = media.author, !author.isEmpty {
            return "Média \(media.sourceName) · \(author)"
        }
        return "Média \(media.sourceName)"
    }

    private var updateLabel: String {
        guard let date = service.updatedAt else { return "connexion…" }
        let seconds = max(0, Int(Date().timeIntervalSince(date)))
        return seconds < 60 ? "MAJ \(seconds) s" : "MAJ \(seconds / 60) min"
    }
}

private final class PlayerLayerHostView: UIView {
    override static var layerClass: AnyClass {
        AVPlayerLayer.self
    }

    var playerLayer: AVPlayerLayer {
        layer as! AVPlayerLayer
    }
}

private struct LoopingVideoView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> PlayerLayerHostView {
        let view = PlayerLayerHostView()
        view.backgroundColor = .black
        view.playerLayer.videoGravity = .resizeAspectFill
        view.playerLayer.player = context.coordinator.player
        context.coordinator.play(url)
        return view
    }

    func updateUIView(_ view: PlayerLayerHostView, context: Context) {
        view.playerLayer.player = context.coordinator.player
        context.coordinator.play(url)
    }

    static func dismantleUIView(_ view: PlayerLayerHostView, coordinator: Coordinator) {
        coordinator.player.pause()
        coordinator.player.removeAllItems()
        coordinator.looper = nil
        view.playerLayer.player = nil
    }

    final class Coordinator {
        let player = AVQueuePlayer()
        var looper: AVPlayerLooper?
        private var currentURL: URL?

        init() {
            player.isMuted = true
            player.actionAtItemEnd = .none
        }

        func play(_ url: URL) {
            guard currentURL != url else {
                if player.timeControlStatus != .playing {
                    player.play()
                }
                return
            }

            currentURL = url
            player.pause()
            player.removeAllItems()
            let item = AVPlayerItem(url: url)
            looper = AVPlayerLooper(player: player, templateItem: item)
            player.play()
        }
    }
}
