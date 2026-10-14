import AVFoundation
import MapKit
import SwiftUI
import UIKit

struct ContentView: View {
    @StateObject private var service = AircraftService()
    @StateObject private var mediaService = DestinationMediaService()
    @StateObject private var soundscape = AmbientSoundscape()

    private let navy = Color(red: 0.025, green: 0.12, blue: 0.23)
    private let ink = Color(red: 0.035, green: 0.12, blue: 0.22)

    private var closestAircraft: Aircraft? {
        service.aircraft.first
    }

    private var closestEnrichment: TVAircraftEnrichment? {
        service.enrichment(for: closestAircraft)
    }

    private var destinationTaskKey: String {
        let modeS = closestEnrichment?.modeS ?? closestAircraft?.id ?? "none"
        let destination = closestEnrichment?.arrivalAirport?.code ?? "none"
        return "\(modeS)-\(destination)"
    }

    var body: some View {
        ZStack {
            AircraftMapView(
                aircraft: service.aircraft,
                center: service.center,
                trails: service.trails,
                selectedID: closestAircraft?.id
            )
            .ignoresSafeArea()

            LinearGradient(
                colors: [
                    Color.white.opacity(0.03),
                    Color.clear,
                    Color.white.opacity(0.16)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
            .allowsHitTesting(false)
            .ignoresSafeArea()

            HStack(alignment: .top, spacing: 22) {
                VStack(alignment: .leading) {
                    statusCard
                    Spacer()
                }

                Spacer(minLength: 30)

                VStack(spacing: 14) {
                    featuredCard

                    if closestEnrichment?.arrivalAirport != nil {
                        destinationCard
                    } else {
                        noDestinationCard
                    }

                    nearbyCard
                }
                .frame(width: 610)
            }
            .padding(24)
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            service.start()
            soundscape.start()
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            service.stop()
            soundscape.stop()
        }
        .task(id: destinationTaskKey) {
            await mediaService.load(for: closestEnrichment)
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
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: "airplane.circle.fill")
                    .font(.system(size: 38, weight: .bold))
                    .foregroundStyle(.cyan)

                VStack(alignment: .leading, spacing: 1) {
                    Text("XavPac TV")
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                    Text("TRAFIC AÉRIEN EN DIRECT")
                        .font(.caption.bold())
                        .foregroundStyle(.white.opacity(0.75))
                }
            }

            HStack(spacing: 20) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(service.aircraft.count)")
                        .font(.system(size: 34, weight: .heavy, design: .rounded))
                        .foregroundStyle(.cyan)
                    Text("avions à proximité")
                        .font(.callout.bold())
                        .foregroundStyle(.white)
                }

                Divider()
                    .overlay(Color.white.opacity(0.25))
                    .frame(height: 45)

                VStack(alignment: .leading, spacing: 4) {
                    Text(updateLabel)
                        .font(.headline.bold().monospacedDigit())
                        .foregroundStyle(.white)
                    HStack(spacing: 7) {
                        Circle()
                            .fill(service.errorMessage == nil ? Color.green : Color.orange)
                            .frame(width: 9, height: 9)
                        Text(service.errorMessage == nil ? "EN DIRECT" : "DERNIÈRES DONNÉES")
                            .font(.caption2.bold())
                            .foregroundStyle(.white.opacity(0.74))
                    }
                }
            }

            Text(service.errorMessage ?? service.source)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.68))
                .lineLimit(1)
        }
        .padding(20)
        .frame(width: 400, alignment: .leading)
        .background(navy.opacity(0.96), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.cyan.opacity(0.28), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.16), radius: 12, y: 5)
    }

    private var featuredCard: some View {
        VStack(spacing: 0) {
            if let aircraft = closestAircraft {
                ZStack(alignment: .bottomLeading) {
                    aircraftPhoto(enrichment: closestEnrichment)
                        .frame(height: 155)
                        .clipped()

                    LinearGradient(
                        colors: [.clear, navy.opacity(0.98)],
                        startPoint: .top,
                        endPoint: .bottom
                    )

                    VStack(spacing: 12) {
                        HStack(alignment: .bottom, spacing: 12) {
                            operatorLogo(enrichment: closestEnrichment)
                                .frame(width: 54, height: 54)

                            VStack(alignment: .leading, spacing: 1) {
                                Text("AVION LE PLUS PROCHE")
                                    .font(.caption2.bold())
                                    .foregroundStyle(.green)
                                Text(aircraft.displayName)
                                    .font(.title2.bold())
                                    .foregroundStyle(.white)
                                Text(aircraftIdentity(aircraft, enrichment: closestEnrichment))
                                    .font(.caption)
                                    .foregroundStyle(.white.opacity(0.78))
                                    .lineLimit(1)
                            }

                            Spacer()

                            VStack(alignment: .trailing, spacing: 0) {
                                Text(distanceText(aircraft))
                                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                                    .foregroundStyle(.cyan)
                                    .monospacedDigit()
                                Text("du centre radar")
                                    .font(.caption2)
                                    .foregroundStyle(.white.opacity(0.68))
                            }
                        }
                    }
                    .padding(16)
                }

                VStack(spacing: 13) {
                    if hasCompleteRoute(closestEnrichment) {
                        routeLine(enrichment: closestEnrichment)
                    } else {
                        unavailableRouteLine(aircraft: aircraft, enrichment: closestEnrichment)
                    }

                    HStack(spacing: 10) {
                        metric(title: "ALTITUDE", value: aircraft.altitudeLabel, icon: "mountain.2")
                        metric(title: "VITESSE", value: aircraft.speedLabel, icon: "gauge.with.dots.needle.67percent")
                        metric(title: "CAP", value: aircraft.headingLabel, icon: "location.north.fill")
                    }
                }
                .padding(15)
                .background(navy)
            } else {
                VStack(spacing: 12) {
                    ProgressView()
                        .tint(.cyan)
                    Text("Recherche du trafic…")
                        .font(.headline)
                        .foregroundStyle(.white)
                }
                .frame(maxWidth: .infinity, minHeight: 315)
                .background(navy)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.17), radius: 12, y: 5)
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
                                image
                                    .resizable()
                                    .scaledToFill()
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
            .frame(height: 245)
            .clipped()

            LinearGradient(
                colors: [.clear, .black.opacity(0.78)],
                startPoint: .center,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Label("VILLE D’ARRIVÉE", systemImage: mediaService.current?.isVideo == true ? "play.rectangle.fill" : "photo.fill")
                        .font(.caption.bold())
                        .foregroundStyle(.white.opacity(0.92))

                    Spacer()

                    if mediaService.current?.isVideo == true {
                        Text("VIDÉO")
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .background(Color.cyan.opacity(0.78), in: Capsule())
                    }
                }

                Text(closestEnrichment?.arrivalAirport?.city ?? "Destination")
                    .font(.system(size: 36, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                if let airport = closestEnrichment?.arrivalAirport {
                    Text("\(airport.name ?? airport.city) · \(airport.code)")
                        .font(.callout.bold())
                        .foregroundStyle(.white.opacity(0.84))
                        .lineLimit(1)
                }

                if let media = mediaService.current {
                    Text(attribution(media))
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.65))
                        .lineLimit(1)
                } else if mediaService.isLoading {
                    Text("Chargement automatique du média…")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.70))
                }
            }
            .padding(16)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.88), lineWidth: 3)
        }
        .shadow(color: .black.opacity(0.14), radius: 10, y: 4)
    }

    private var noDestinationCard: some View {
        HStack(spacing: 16) {
            Image(systemName: "airplane.departure")
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(.cyan)
                .frame(width: 58, height: 58)
                .background(navy, in: RoundedRectangle(cornerRadius: 15, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text("Trajet non disponible")
                    .font(.title3.bold())
                    .foregroundStyle(ink)
                Text("La position, l’altitude, la vitesse et le cap restent affichés en direct.")
                    .font(.callout)
                    .foregroundStyle(ink.opacity(0.70))
                    .lineLimit(2)
            }

            Spacer()
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 110)
        .background(Color.white.opacity(0.96), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 9, y: 4)
    }

    private var nearbyCard: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label("Avions proches", systemImage: "airplane")
                    .font(.title3.bold())
                    .foregroundStyle(ink)
                Spacer()
                Text("5 plus proches")
                    .font(.caption.bold())
                    .foregroundStyle(ink.opacity(0.60))
            }

            ForEach(Array(service.aircraft.prefix(5).enumerated()), id: \.element.id) { index, aircraft in
                nearbyRow(aircraft, index: index)
            }
        }
        .padding(15)
        .background(Color.white.opacity(0.97), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.blue.opacity(0.12), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.13), radius: 10, y: 4)
    }

    private func nearbyRow(_ aircraft: Aircraft, index: Int) -> some View {
        let enrichment = service.enrichment(for: aircraft)
        let isClosest = index == 0

        return HStack(spacing: 11) {
            Image(systemName: "airplane")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(isClosest ? Color.cyan : Color.blue.opacity(0.72))
                .frame(width: 34, height: 34)
                .background(
                    isClosest ? Color.cyan.opacity(0.15) : Color.blue.opacity(0.07),
                    in: RoundedRectangle(cornerRadius: 9, style: .continuous)
                )

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 7) {
                    Text(aircraft.displayName)
                        .font(.headline.bold())
                        .foregroundStyle(ink)
                        .lineLimit(1)

                    if let operatorName = enrichment?.operatorName ?? aircraft.operatorName,
                       !operatorName.isEmpty {
                        Text(operatorName)
                            .font(.caption2.bold())
                            .foregroundStyle(ink.opacity(0.55))
                            .lineLimit(1)
                    }
                }

                Text(nearbySubtitle(aircraft, enrichment: enrichment))
                    .font(.caption)
                    .foregroundStyle(ink.opacity(0.66))
                    .lineLimit(1)
            }

            Spacer()

            Text(distanceText(aircraft))
                .font(.title3.bold().monospacedDigit())
                .foregroundStyle(isClosest ? Color(red: 0.00, green: 0.55, blue: 0.63) : ink)
                .lineLimit(1)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(
            isClosest ? Color.cyan.opacity(0.13) : Color.clear,
            in: RoundedRectangle(cornerRadius: 13, style: .continuous)
        )
    }

    @ViewBuilder
    private func aircraftPhoto(enrichment: TVAircraftEnrichment?) -> some View {
        if let url = enrichment?.photoURL {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image
                        .resizable()
                        .scaledToFill()
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
                colors: [Color.blue.opacity(0.72), navy],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: "airplane")
                .font(.system(size: 80, weight: .bold))
                .foregroundStyle(.white.opacity(0.74))
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
            .background(Color.white, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        } else {
            logoPlaceholder
        }
    }

    private var logoPlaceholder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.96))
            Image(systemName: "airplane")
                .foregroundStyle(.cyan)
        }
    }

    private func routeLine(enrichment: TVAircraftEnrichment?) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(enrichment?.departureAirport?.code ?? "")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                Text(enrichment?.departureAirport?.city ?? "")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.70))
                    .lineLimit(1)
            }

            Spacer()

            HStack(spacing: 8) {
                Rectangle()
                    .fill(Color.cyan.opacity(0.50))
                    .frame(height: 2)
                Image(systemName: "airplane")
                    .font(.headline.bold())
                    .foregroundStyle(.cyan)
                Rectangle()
                    .fill(Color.cyan.opacity(0.50))
                    .frame(height: 2)
            }
            .frame(maxWidth: 160)

            Spacer()

            VStack(alignment: .trailing, spacing: 1) {
                Text(enrichment?.arrivalAirport?.code ?? "")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                Text(enrichment?.arrivalAirport?.city ?? "")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.70))
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 5)
    }

    private func unavailableRouteLine(
        aircraft: Aircraft,
        enrichment: TVAircraftEnrichment?
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "questionmark.circle.fill")
                .font(.title3)
                .foregroundStyle(.cyan)

            VStack(alignment: .leading, spacing: 2) {
                Text("Trajet non disponible")
                    .font(.headline.bold())
                    .foregroundStyle(.white)
                Text(aircraftIdentity(aircraft, enrichment: enrichment))
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.68))
                    .lineLimit(1)
            }

            Spacer()
        }
    }

    private func metric(title: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .foregroundStyle(.cyan)
                Text(title)
                    .font(.caption2.bold())
                    .foregroundStyle(.white.opacity(0.63))
            }

            Text(value)
                .font(.headline.bold().monospacedDigit())
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .padding(11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private var destinationFallback: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.18, green: 0.63, blue: 0.88),
                    Color(red: 0.98, green: 0.63, blue: 0.38)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Image(systemName: "building.2.fill")
                .font(.system(size: 74, weight: .bold))
                .foregroundStyle(.white.opacity(0.34))
        }
    }

    private func hasCompleteRoute(_ enrichment: TVAircraftEnrichment?) -> Bool {
        enrichment?.departureAirport != nil && enrichment?.arrivalAirport != nil
    }

    private func distanceText(_ aircraft: Aircraft) -> String {
        "\(aircraft.distanceKilometers(from: service.center), specifier: "%.1f") km"
    }

    private func aircraftIdentity(
        _ aircraft: Aircraft,
        enrichment: TVAircraftEnrichment?
    ) -> String {
        let values = [
            enrichment?.registration ?? aircraft.registration,
            enrichment?.aircraftModel ?? enrichment?.aircraftType ?? aircraft.aircraftType,
            enrichment?.operatorName ?? aircraft.operatorName
        ]

        let clean = values.compactMap { value -> String? in
            guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return nil
            }
            return value
        }

        return clean.isEmpty ? "Données ADS-B en direct" : clean.prefix(3).joined(separator: " · ")
    }

    private func nearbySubtitle(
        _ aircraft: Aircraft,
        enrichment: TVAircraftEnrichment?
    ) -> String {
        if let route = enrichment?.routeLabel,
           !route.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return route
        }

        let identity = aircraftIdentity(aircraft, enrichment: enrichment)
        return identity.isEmpty ? "Trajet non disponible" : identity
    }

    private func attribution(_ media: DestinationMedia) -> String {
        if let author = media.author, !author.isEmpty {
            return "\(media.sourceName) · \(author)"
        }
        return media.sourceName
    }

    private var updateLabel: String {
        guard let date = service.updatedAt else { return "Connexion…" }
        let seconds = max(0, Int(Date().timeIntervalSince(date)))
        return seconds < 60 ? "MAJ \(seconds) s" : "MAJ \(seconds / 60) min"
    }
}

@MainActor
private final class AmbientSoundscape: ObservableObject {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var buffer: AVAudioPCMBuffer?
    private var configured = false

    func start() {
        guard !player.isPlaying else { return }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)

            if !configured {
                engine.attach(player)
                guard let format = AVAudioFormat(
                    standardFormatWithSampleRate: 44_100,
                    channels: 2
                ) else { return }

                engine.connect(player, to: engine.mainMixerNode, format: format)
                buffer = makeAmbientBuffer(format: format, duration: 12)
                configured = true
            }

            if !engine.isRunning {
                try engine.start()
            }

            if let buffer {
                player.scheduleBuffer(buffer, at: nil, options: .loops)
                player.volume = 0.055
                player.play()
            }
        } catch {
            // La musique reste optionnelle : le radar continue même si l'audio n'est pas disponible.
        }
    }

    func stop() {
        player.stop()
        engine.pause()
        try? AVAudioSession.sharedInstance().setActive(false)
    }

    private func makeAmbientBuffer(
        format: AVAudioFormat,
        duration: Double
    ) -> AVAudioPCMBuffer? {
        let sampleRate = format.sampleRate
        let frameCount = AVAudioFrameCount(sampleRate * duration)

        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: frameCount
        ) else { return nil }

        buffer.frameLength = frameCount
        guard let channels = buffer.floatChannelData else { return nil }

        let twoPi = Double.pi * 2
        let frequencies = [128.0, 192.0, 256.0]

        for frame in 0..<Int(frameCount) {
            let time = Double(frame) / sampleRate
            let breathe = 0.72 + 0.28 * sin(twoPi * time / duration)
            let shimmer = 0.5 + 0.5 * sin(twoPi * time / 6.0)

            let tone =
                sin(twoPi * frequencies[0] * time) * 0.42
                + sin(twoPi * frequencies[1] * time) * 0.22
                + sin(twoPi * frequencies[2] * time) * (0.10 + shimmer * 0.05)

            let sample = Float(tone * breathe * 0.16)
            channels[0][frame] = sample
            channels[1][frame] = sample * 0.94
        }

        return buffer
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
