import AVFoundation
import MapKit
import SwiftUI
import UIKit

struct ContentView: View {
    @StateObject private var service = AircraftService()
    @StateObject private var mediaService = DestinationMediaService()
    @StateObject private var soundscape = AmbientSoundscape()

    private let navy = Color(red: 0.018, green: 0.075, blue: 0.16)
    private let deepBlue = Color(red: 0.02, green: 0.16, blue: 0.31)
    private let ink = Color(red: 0.025, green: 0.09, blue: 0.18)

    private var featuredAircraft: Aircraft? {
        service.featuredAircraft
    }

    private var featuredEnrichment: TVAircraftEnrichment? {
        service.enrichment(for: featuredAircraft)
    }

    private var featuredProfile: TVTrafficProfile? {
        guard let featuredAircraft else { return nil }
        return service.trafficProfile(for: featuredAircraft)
    }

    // Conserver les moyens nationaux en alerte pendant les escales vidéo.
    private var priorityAircraft: Aircraft? {
        service.priorityAircraftWithin40.first
    }

    private var priorityProfile: TVTrafficProfile? {
        guard let priorityAircraft else { return nil }
        return service.trafficProfile(for: priorityAircraft)
    }

    private var trafficProfiles: [String: TVTrafficProfile] {
        Dictionary(uniqueKeysWithValues: service.aircraft.map { aircraft in
            (aircraft.id, service.trafficProfile(for: aircraft))
        })
    }

    private var isPriorityActive: Bool {
        guard let aircraft = featuredAircraft,
              let profile = featuredProfile else { return false }
        return profile.isPriorityTraffic
            && aircraft.distanceKilometers(from: service.center) <= 40
    }

    private var isOverheadPass: Bool {
        guard let aircraft = featuredAircraft else { return false }
        return aircraft.distanceKilometers(from: service.center) <= 12
    }

    private var destinationTaskKey: String {
        let modeS = featuredEnrichment?.modeS ?? featuredAircraft?.id ?? "none"
        let destination = featuredEnrichment?.arrivalAirport?.code ?? "none"
        return "\(modeS)-\(destination)-\(isOverheadPass)"
    }

    private var priorityAlertKey: String {
        priorityAircraft?.id ?? "none"
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.90, green: 0.96, blue: 0.99),
                    Color(red: 0.80, green: 0.90, blue: 0.96)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 14) {
                headerBar

                HStack(spacing: 16) {
                    mapPanel

                    VStack(spacing: 12) {
                        featuredCard

                        if featuredEnrichment?.arrivalAirport != nil {
                            destinationCard
                        } else {
                            noDestinationCard
                        }

                        nearbyCard
                    }
                    .frame(width: 600)
                }
            }
            .padding(12)
            .background(
                LinearGradient(
                    colors: [Color.white.opacity(0.98), Color(red: 0.91, green: 0.97, blue: 1.0)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: 32, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 32, style: .continuous)
                    .stroke(
                        LinearGradient(
                            colors: [
                                Color.cyan.opacity(0.90),
                                Color.blue.opacity(0.50),
                                Color.cyan.opacity(0.70)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 2.4
                    )
            }
            .shadow(color: Color.cyan.opacity(0.18), radius: 20)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
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
            await mediaService.load(for: featuredEnrichment)
            if isOverheadPass {
                mediaService.preferVideo()
            }
        }
        .task(id: mediaService.current?.id) {
            guard let media = mediaService.current else { return }
            let seconds: UInt64 = media.isVideo ? 12 : 9
            try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
            guard !Task.isCancelled else { return }
            await mediaService.advance()
        }
        .task(id: priorityAlertKey) {
            guard priorityAlertKey != "none" else { return }
            soundscape.playPriorityAlert()
        }
    }

    private var headerBar: some View {
        HStack(spacing: 18) {
            ZStack {
                RoundedRectangle(cornerRadius: 17, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [.cyan.opacity(0.95), .blue.opacity(0.90)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                Image(systemName: "airplane")
                    .font(.system(size: 34, weight: .heavy))
                    .foregroundStyle(.white)
            }
            .frame(width: 66, height: 66)
            .shadow(color: .cyan.opacity(0.42), radius: 12)

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 5) {
                    Text("XavPac")
                        .font(.system(size: 35, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                    Text("TV")
                        .font(.system(size: 35, weight: .heavy, design: .rounded))
                        .foregroundStyle(.cyan)
                }
                Text("LE CIEL EN SPECTACLE · EN DIRECT")
                    .font(.caption.bold())
                    .foregroundStyle(.white.opacity(0.72))
            }

            Spacer()

            headerStat(
                icon: "airplane",
                value: "\(service.aircraft.count)",
                label: "aéronefs",
                color: .cyan
            )

            headerStat(
                icon: "exclamationmark.triangle.fill",
                value: "\(service.priorityAircraftWithin40.count)",
                label: "alertes",
                color: service.priorityAircraftWithin40.isEmpty ? .green : .red
            )

            HStack(spacing: 11) {
                Image(systemName: "music.note")
                    .font(.title3.bold())
                    .foregroundStyle(.cyan)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Ambiance aérienne")
                        .font(.headline.bold())
                        .foregroundStyle(.white)
                    Text("Piste sonore active")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.65))
                }
            }
            .padding(.horizontal, 16)
            .frame(height: 56)
            .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .padding(.horizontal, 18)
        .frame(height: 86)
        .background(
            LinearGradient(
                colors: [navy, deepBlue],
                startPoint: .leading,
                endPoint: .trailing
            ),
            in: RoundedRectangle(cornerRadius: 23, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 23, style: .continuous)
                .stroke(Color.cyan.opacity(0.34), lineWidth: 1.4)
        }
        .shadow(color: .black.opacity(0.18), radius: 12, y: 5)
    }

    private func headerStat(
        icon: String,
        value: String,
        label: String,
        color: Color
    ) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.title3.bold())
                .foregroundStyle(color)
            Text(value)
                .font(.title2.bold().monospacedDigit())
                .foregroundStyle(.white)
            Text(label)
                .font(.caption.bold())
                .foregroundStyle(.white.opacity(0.62))
        }
        .padding(.horizontal, 15)
        .frame(height: 56)
        .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var mapPanel: some View {
        ZStack(alignment: .topLeading) {
            AircraftMapView(
                aircraft: service.aircraft,
                center: service.center,
                trails: service.trails,
                selectedID: featuredAircraft?.id,
                profiles: trafficProfiles
            )

            GeometryReader { proxy in
                let size = min(proxy.size.width, proxy.size.height) * 0.43
                RadarSweepOverlay()
                    .frame(width: size, height: size)
                    .position(
                        x: proxy.size.width / 2,
                        y: proxy.size.height / 2
                    )
            }
            .allowsHitTesting(false)

            HStack {
                compactStatus
                Spacer()

                if let aircraft = priorityAircraft,
                   let profile = priorityProfile {
                    PriorityAlertBanner(
                        title: profile.kind == .civilSecurity ? "SÉCURITÉ CIVILE" : "ARMÉE",
                        subtitle: "\(profile.label) · \(distanceText(aircraft))",
                        symbolName: profile.symbolName
                    )
                }
            }
            .padding(16)
        }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(Color.white.opacity(0.95), lineWidth: 3)
        }
        .shadow(color: .black.opacity(0.16), radius: 14, y: 6)
    }

    private var compactStatus: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(service.errorMessage == nil ? Color.green : Color.orange)
                .frame(width: 10, height: 10)
            Text(service.errorMessage == nil ? "DIRECT" : "DERNIÈRES DONNÉES")
                .font(.caption.bold())
            Text("·")
                .foregroundStyle(.white.opacity(0.45))
            Text(updateLabel)
                .font(.caption.bold().monospacedDigit())
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 13)
        .padding(.vertical, 9)
        .background(navy.opacity(0.88), in: Capsule())
        .overlay {
            Capsule().stroke(Color.cyan.opacity(0.28), lineWidth: 1)
        }
    }

    private var featuredCard: some View {
        Group {
            if let aircraft = featuredAircraft {
                VStack(spacing: 0) {
                    ZStack(alignment: .top) {
                        aircraftPhoto(enrichment: featuredEnrichment)
                            .frame(height: 220)
                            .clipped()

                        LinearGradient(
                            colors: [
                                Color.black.opacity(0.16),
                                Color.clear,
                                navy.opacity(0.38)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )

                        HStack(alignment: .top) {
                            HStack(spacing: 9) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                                        .fill(trafficColor(featuredProfile?.kind).opacity(0.96))
                                    Image(systemName: featuredProfile?.symbolName ?? "airplane")
                                        .font(.system(size: 28, weight: .heavy))
                                        .foregroundStyle(.white)
                                }
                                .frame(width: 52, height: 52)
                                .shadow(
                                    color: trafficColor(featuredProfile?.kind).opacity(0.45),
                                    radius: 8
                                )

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(featuredHeader)
                                        .font(.caption2.weight(.heavy))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 9)
                                        .padding(.vertical, 5)
                                        .background(
                                            isPriorityActive
                                                ? Color.red.opacity(0.94)
                                                : navy.opacity(0.82),
                                            in: Capsule()
                                        )

                                    Text(featuredTitle(aircraft))
                                        .font(.title2.bold())
                                        .foregroundStyle(.white)
                                        .shadow(color: .black.opacity(0.72), radius: 4)
                                        .lineLimit(1)
                                }
                            }

                            Spacer()

                            VStack(alignment: .trailing, spacing: 3) {
                                Text(distanceText(aircraft))
                                    .font(.system(size: 32, weight: .heavy, design: .rounded))
                                    .foregroundStyle(.white)
                                    .monospacedDigit()
                                Text(sizeLabel(featuredProfile))
                                    .font(.caption2.bold())
                                    .foregroundStyle(.white.opacity(0.82))
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(navy.opacity(0.84), in: RoundedRectangle(cornerRadius: 13))
                        }
                        .padding(14)
                    }

                    VStack(spacing: 11) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(aircraftIdentity(aircraft, enrichment: featuredEnrichment))
                                    .font(.callout.bold())
                                    .foregroundStyle(.white.opacity(0.82))
                                    .lineLimit(1)
                            }

                            Spacer()

                            if isPriorityActive {
                                HStack(spacing: 6) {
                                    Circle()
                                        .fill(Color.red)
                                        .frame(width: 8, height: 8)
                                    Text("PRIORITAIRE")
                                        .font(.caption2.weight(.heavy))
                                        .foregroundStyle(.red)
                                }
                            }
                        }

                        if hasCompleteRoute(featuredEnrichment) {
                            cityRouteLine(enrichment: featuredEnrichment)
                                .padding(.vertical, 3)
                        }

                        HStack(spacing: 8) {
                            metric(title: "ALTITUDE", value: aircraft.altitudeLabel, icon: "mountain.2")
                            metric(title: "VITESSE", value: aircraft.speedLabel, icon: "gauge.with.dots.needle.67percent")
                            metric(title: "CAP", value: aircraft.headingLabel, icon: "location.north.fill")
                        }
                    }
                    .padding(13)
                    .background(
                        LinearGradient(
                            colors: [navy, deepBlue.opacity(0.94)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                }
                .background(navy)
                .clipShape(RoundedRectangle(cornerRadius: 23, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 23, style: .continuous)
                        .stroke(
                            isPriorityActive
                                ? Color.red.opacity(0.92)
                                : trafficColor(featuredProfile?.kind).opacity(0.46),
                            lineWidth: isPriorityActive ? 2.8 : 1.5
                        )
                }
                .shadow(
                    color: isPriorityActive
                        ? Color.red.opacity(0.38)
                        : trafficColor(featuredProfile?.kind).opacity(0.16),
                    radius: isPriorityActive ? 16 : 10,
                    y: 4
                )
            } else {
                VStack(spacing: 12) {
                    ProgressView().tint(.cyan)
                    Text("Recherche du trafic…")
                        .font(.headline)
                        .foregroundStyle(.white)
                }
                .frame(maxWidth: .infinity, minHeight: 300)
                .background(navy, in: RoundedRectangle(cornerRadius: 23, style: .continuous))
            }
        }
    }

    private var destinationCard: some View {
        ZStack(alignment: .bottomLeading) {
            destinationMediaView
                .id(mediaService.current?.id ?? "destination-fallback")
                .frame(height: 258)
                .clipped()
                .animation(.easeInOut(duration: 0.8), value: mediaService.current?.id)

            LinearGradient(
                colors: [.clear, .black.opacity(0.76)],
                startPoint: .center,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Label(
                        isOverheadPass ? "VILLE D’ARRIVÉE · LECTURE AUTO" : "VILLE D’ARRIVÉE",
                        systemImage: isOverheadPass ? "play.rectangle.fill" : "photo.on.rectangle"
                    )
                    .font(.caption.bold())
                    .foregroundStyle(.white)

                    Spacer()

                    Text(isOverheadPass ? "PASSAGE PROCHE" : "VUES AÉRIENNES · AÉROPORT")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4)
                        .background(Color.cyan.opacity(0.74), in: Capsule())
                }

                Text(featuredEnrichment?.arrivalAirport?.city ?? "Destination")
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                if let airport = featuredEnrichment?.arrivalAirport {
                    Text(airport.name ?? airport.city)
                        .font(.callout.bold())
                        .foregroundStyle(.white.opacity(0.84))
                        .lineLimit(1)
                }

                if let media = mediaService.current {
                    Text(attribution(media))
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.58))
                        .lineLimit(1)
                }
            }
            .padding(14)
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 23, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 23, style: .continuous)
                .stroke(Color.cyan.opacity(0.42), lineWidth: 2)
        }
        .shadow(color: .black.opacity(0.13), radius: 9, y: 4)
    }

    @ViewBuilder
    private var destinationMediaView: some View {
        if let media = mediaService.current {
            if media.isVideo,
               isOverheadPass,
               let url = media.televisionVideoURL {
                LoopingVideoView(url: url)
            } else if media.isVideo,
                      let preview = media.previewURL {
                CinematicDestinationImage(
                    url: preview,
                    fallback: AnyView(destinationFallback)
                )
            } else if media.isVideo {
                destinationFallback
            } else if let url = media.mediaURL {
                CinematicDestinationImage(
                    url: url,
                    fallback: AnyView(destinationFallback)
                )
            } else {
                destinationFallback
            }
        } else {
            destinationFallback
        }
    }

    private var noDestinationCard: some View {
        HStack(spacing: 15) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(deepBlue)
                Image(systemName: featuredProfile?.symbolName ?? "airplane")
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundStyle(trafficColor(featuredProfile?.kind))
            }
            .frame(width: 58, height: 58)

            VStack(alignment: .leading, spacing: 3) {
                Text("Trajet non disponible")
                    .font(.title3.bold())
                    .foregroundStyle(ink)
                Text("Suivi direct maintenu : position, altitude, vitesse et cap.")
                    .font(.callout)
                    .foregroundStyle(ink.opacity(0.68))
            }

            Spacer()
        }
        .padding(17)
        .frame(maxWidth: .infinity, minHeight: 100)
        .background(Color.white.opacity(0.96), in: RoundedRectangle(cornerRadius: 23, style: .continuous))
        .shadow(color: .black.opacity(0.11), radius: 8, y: 3)
    }

    private var nearbyCard: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Label("Trafic à proximité", systemImage: "scope")
                    .font(.title3.bold())
                    .foregroundStyle(ink)
                Spacer()
                Text(isPriorityActive ? "ALERTE PRIORITAIRE" : "5 plus proches")
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(isPriorityActive ? Color.red : ink.opacity(0.55))
            }

            ForEach(Array(service.displayAircraft.prefix(5).enumerated()), id: \.element.id) { index, aircraft in
                nearbyRow(aircraft, index: index)
            }
        }
        .padding(13)
        .background(Color.white.opacity(0.97), in: RoundedRectangle(cornerRadius: 23, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 23, style: .continuous)
                .stroke(Color.blue.opacity(0.10), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
    }

    private func nearbyRow(_ aircraft: Aircraft, index: Int) -> some View {
        let enrichment = service.enrichment(for: aircraft)
        let profile = service.trafficProfile(for: aircraft)
        let isFeatured = featuredAircraft?.id == aircraft.id
        let route = routeCities(enrichment)

        return HStack(spacing: 10) {
            nearbyThumbnail(
                aircraft: aircraft,
                enrichment: enrichment,
                profile: profile
            )
            .frame(width: 54, height: 38)

            VStack(alignment: .leading, spacing: 1) {
                Text(route)
                    .font(.headline.bold())
                    .foregroundStyle(ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.76)

                if route == "Trajet non disponible" {
                    Text(profile.label)
                        .font(.caption2.bold())
                        .foregroundStyle(trafficColor(profile.kind))
                }
            }

            Spacer()

            Text(distanceText(aircraft))
                .font(.headline.bold().monospacedDigit())
                .foregroundStyle(
                    profile.isPriorityTraffic
                        ? Color.red
                        : (isFeatured ? Color.cyan : ink)
                )
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(
            profile.isPriorityTraffic
                ? Color.red.opacity(0.08)
                : (isFeatured ? Color.cyan.opacity(0.10) : Color.clear),
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
    }

    @ViewBuilder
    private func nearbyThumbnail(
        aircraft: Aircraft,
        enrichment: TVAircraftEnrichment?,
        profile: TVTrafficProfile
    ) -> some View {
        if let url = enrichment?.photoURL,
           enrichment?.photo.kind != "generic" {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image
                        .resizable()
                        .scaledToFill()
                } else {
                    trafficSymbol(profile)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
        } else {
            trafficSymbol(profile)
        }
    }

    private func trafficSymbol(_ profile: TVTrafficProfile) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(trafficColor(profile.kind).opacity(0.15))
            Image(systemName: profile.symbolName)
                .font(.system(size: 22 * CGFloat(profile.relativeIconScale), weight: .heavy))
                .foregroundStyle(trafficColor(profile.kind))
        }
    }

    private var featuredHeader: String {
        guard let profile = featuredProfile else {
            return "AÉRONEF LE PLUS PROCHE"
        }

        if isPriorityActive {
            return profile.kind == .civilSecurity
                ? "ALERTE PRIORITAIRE · SÉCURITÉ CIVILE"
                : "ALERTE PRIORITAIRE · ARMÉE"
        }

        return profile.label
    }

    private func featuredTitle(_ aircraft: Aircraft) -> String {
        if let model = featuredEnrichment?.aircraftModel,
           !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return model
        }
        if let type = aircraft.description,
           !type.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return type
        }
        if let type = aircraft.aircraftType,
           !type.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return type
        }
        return aircraft.displayName
    }

    private func sizeLabel(_ profile: TVTrafficProfile?) -> String {
        guard let scale = profile?.relativeIconScale else { return "Gabarit inconnu" }
        if scale >= 1.25 { return "Gabarit : grand" }
        if scale >= 1.02 { return "Gabarit : moyen" }
        return "Gabarit : léger"
    }

    @ViewBuilder
    private func aircraftPhoto(enrichment: TVAircraftEnrichment?) -> some View {
        if let url = enrichment?.photoURL,
           enrichment?.photo.kind != "generic" {
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
                colors: [
                    deepBlue,
                    trafficColor(featuredProfile?.kind).opacity(0.56)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Image(systemName: featuredProfile?.symbolName ?? "airplane")
                .font(.system(size: 96 * CGFloat(featuredProfile?.relativeIconScale ?? 1), weight: .heavy))
                .foregroundStyle(.white.opacity(0.88))
                .shadow(color: trafficColor(featuredProfile?.kind), radius: 14)
        }
    }

    private func cityRouteLine(enrichment: TVAircraftEnrichment?) -> some View {
        HStack(spacing: 10) {
            Text(enrichment?.departureAirport?.city ?? "Départ")
                .font(.headline.bold())
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.72)

            Spacer()

            Image(systemName: featuredProfile?.symbolName ?? "airplane")
                .font(.headline.bold())
                .foregroundStyle(trafficColor(featuredProfile?.kind))

            Image(systemName: "arrow.right")
                .font(.caption.bold())
                .foregroundStyle(.white.opacity(0.68))

            Spacer()

            Text(enrichment?.arrivalAirport?.city ?? "Arrivée")
                .font(.headline.bold())
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
    }

    private func metric(title: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .foregroundStyle(.cyan)
                Text(title)
                    .font(.caption2.bold())
                    .foregroundStyle(.white.opacity(0.58))
            }

            Text(value)
                .font(.headline.bold().monospacedDigit())
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var destinationFallback: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.16, green: 0.62, blue: 0.90),
                    Color(red: 0.98, green: 0.58, blue: 0.30)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(spacing: 10) {
                Image(systemName: "airplane.arrival")
                    .font(.system(size: 62, weight: .heavy))
                Text("Vue destination en préparation")
                    .font(.headline.bold())
            }
            .foregroundStyle(.white.opacity(0.80))
        }
    }

    private func hasCompleteRoute(_ enrichment: TVAircraftEnrichment?) -> Bool {
        enrichment?.departureAirport != nil && enrichment?.arrivalAirport != nil
    }

    private func routeCities(_ enrichment: TVAircraftEnrichment?) -> String {
        guard let departure = enrichment?.departureAirport?.city,
              let arrival = enrichment?.arrivalAirport?.city,
              !departure.isEmpty,
              !arrival.isEmpty else {
            return "Trajet non disponible"
        }
        return "\(departure)  →  \(arrival)"
    }

    private func distanceText(_ aircraft: Aircraft) -> String {
        String(format: "%.1f km", aircraft.distanceKilometers(from: service.center))
    }

    private func aircraftIdentity(
        _ aircraft: Aircraft,
        enrichment: TVAircraftEnrichment?
    ) -> String {
        if let operatorName = enrichment?.operatorName ?? aircraft.operatorName,
           !operatorName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return operatorName
        }

        if let registration = enrichment?.registration ?? aircraft.registration,
           !registration.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return registration
        }

        return "Données ADS-B en direct"
    }

    private func trafficColor(_ kind: TVTrafficKind?) -> Color {
        switch kind {
        case .civilSecurity:
            return Color(red: 1.00, green: 0.62, blue: 0.05)
        case .military:
            return Color(red: 0.96, green: 0.12, blue: 0.17)
        case .helicopter, .medical:
            return Color(red: 0.04, green: 0.78, blue: 0.38)
        case .surveillance:
            return Color(red: 0.61, green: 0.34, blue: 0.96)
        case .airline:
            return Color(red: 0.00, green: 0.70, blue: 1.00)
        case .lightPrivate:
            return Color(red: 0.70, green: 0.76, blue: 0.83)
        case .ultralight, .glider:
            return Color(red: 0.98, green: 0.76, blue: 0.10)
        case .drone:
            return Color(red: 0.12, green: 0.86, blue: 0.82)
        case .balloon:
            return Color(red: 0.96, green: 0.40, blue: 0.72)
        case .specialized:
            return Color(red: 0.40, green: 0.62, blue: 1.00)
        case .unknown, .none:
            return Color(red: 0.70, green: 0.77, blue: 0.84)
        }
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

private struct PriorityAlertBanner: View {
    let title: String
    let subtitle: String
    let symbolName: String

    @State private var pulse = false

    var body: some View {
        HStack(spacing: 11) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.title2.bold())
            Image(systemName: symbolName)
                .font(.title3.bold())

            VStack(alignment: .leading, spacing: 1) {
                Text("ALERTE PRIORITAIRE")
                    .font(.caption2.weight(.heavy))
                Text("\(title) · \(subtitle)")
                    .font(.headline.bold())
                    .lineLimit(1)
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background(
            LinearGradient(
                colors: [Color.red, Color.red.opacity(0.76)],
                startPoint: .leading,
                endPoint: .trailing
            ),
            in: RoundedRectangle(cornerRadius: 15, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .stroke(Color.white.opacity(pulse ? 1 : 0.28), lineWidth: pulse ? 3 : 1)
        }
        .shadow(color: Color.red.opacity(pulse ? 0.78 : 0.20), radius: pulse ? 18 : 5)
        .scaleEffect(pulse ? 1.02 : 0.99)
        .onAppear {
            pulse = false
            withAnimation(
                .easeInOut(duration: 0.55)
                .repeatForever(autoreverses: true)
            ) {
                pulse = true
            }
        }
    }
}

private struct RadarSweepOverlay: View {
    @State private var rotation = 0.0

    var body: some View {
        ZStack {
            ForEach(1...4, id: \.self) { index in
                Circle()
                    .stroke(
                        Color.cyan.opacity(index == 4 ? 0.34 : 0.21),
                        style: StrokeStyle(
                            lineWidth: index == 4 ? 2 : 1,
                            dash: [8, 8]
                        )
                    )
                    .scaleEffect(Double(index) / 4.0)
            }

            Path { path in
                path.move(to: CGPoint(x: 0, y: 0))
                path.addLine(to: CGPoint(x: 0, y: -14))
            }
            .stroke(Color.cyan.opacity(0.01))

            RadarSector()
                .fill(
                    LinearGradient(
                        colors: [
                            Color.cyan.opacity(0.02),
                            Color.cyan.opacity(0.24)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .rotationEffect(.degrees(rotation))

            GeometryReader { proxy in
                Path { path in
                    path.move(
                        to: CGPoint(
                            x: proxy.size.width / 2,
                            y: proxy.size.height / 2
                        )
                    )
                    path.addLine(
                        to: CGPoint(
                            x: proxy.size.width,
                            y: proxy.size.height / 2
                        )
                    )
                }
                .stroke(
                    LinearGradient(
                        colors: [
                            Color.cyan.opacity(0.08),
                            Color.cyan.opacity(0.95)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    ),
                    lineWidth: 2
                )
                .rotationEffect(.degrees(rotation))
                .shadow(color: .cyan.opacity(0.65), radius: 5)
            }

            Circle()
                .fill(Color.cyan)
                .frame(width: 9, height: 9)
                .shadow(color: .cyan, radius: 7)
        }
        .compositingGroup()
        .blendMode(.plusLighter)
        .opacity(0.88)
        .onAppear {
            rotation = 0
            withAnimation(
                .linear(duration: 4.2)
                .repeatForever(autoreverses: false)
            ) {
                rotation = 360
            }
        }
    }
}

private struct RadarSector: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2
        let start = Angle.degrees(-28)
        let end = Angle.degrees(0)

        path.move(to: center)
        path.addLine(
            to: CGPoint(
                x: center.x + CGFloat(cos(start.radians)) * radius,
                y: center.y + CGFloat(sin(start.radians)) * radius
            )
        )
        path.addArc(
            center: center,
            radius: radius,
            startAngle: start,
            endAngle: end,
            clockwise: false
        )
        path.closeSubpath()
        return path
    }
}

private struct CinematicDestinationImage: View {
    let url: URL
    let fallback: AnyView
    @State private var animate = false

    var body: some View {
        AsyncImage(url: url) { phase in
            if let image = phase.image {
                image
                    .resizable()
                    .scaledToFill()
                    .scaleEffect(animate ? 1.13 : 1.02)
                    .offset(
                        x: animate ? -10 : 10,
                        y: animate ? -5 : 5
                    )
                    .onAppear {
                        animate = false
                        withAnimation(
                            .easeInOut(duration: 8.5)
                            .repeatForever(autoreverses: true)
                        ) {
                            animate = true
                        }
                    }
            } else {
                fallback
            }
        }
    }
}

@MainActor
private final class AmbientSoundscape: ObservableObject {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let alertPlayer = AVAudioPlayerNode()
    private var buffer: AVAudioPCMBuffer?
    private var audioFormat: AVAudioFormat?
    private var configured = false

    func start() {
        guard !player.isPlaying else { return }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)

            if !configured {
                engine.attach(player)
                engine.attach(alertPlayer)
                guard let format = AVAudioFormat(
                    standardFormatWithSampleRate: 44_100,
                    channels: 2
                ) else { return }

                audioFormat = format
                engine.connect(player, to: engine.mainMixerNode, format: format)
                engine.connect(alertPlayer, to: engine.mainMixerNode, format: format)
                buffer = makeAmbientBuffer(format: format, duration: 24)
                configured = true
            }

            if !engine.isRunning {
                try engine.start()
            }

            if let buffer {
                player.scheduleBuffer(buffer, at: nil, options: .loops)
                engine.mainMixerNode.outputVolume = 0.62
                player.volume = 0.18
                player.play()
            }
        } catch {
            // La musique reste optionnelle : le radar continue même si l'audio n'est pas disponible.
        }
    }

    func stop() {
        player.stop()
        alertPlayer.stop()
        engine.pause()
        try? AVAudioSession.sharedInstance().setActive(false)
    }

    func playPriorityAlert() {
        if !configured {
            start()
        }

        guard let format = audioFormat,
              let alertBuffer = makePriorityAlertBuffer(format: format) else {
            return
        }

        do {
            if !engine.isRunning {
                try engine.start()
            }
            alertPlayer.stop()
            alertPlayer.scheduleBuffer(alertBuffer, at: nil, options: [])
            alertPlayer.volume = 0.42
            alertPlayer.play()
        } catch {
            // L'alerte visuelle reste active même si la sortie audio est indisponible.
        }
    }

    private func makePriorityAlertBuffer(format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let duration = 0.72
        let sampleRate = format.sampleRate
        let frameCount = AVAudioFrameCount(sampleRate * duration)

        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: frameCount
        ) else { return nil }

        buffer.frameLength = frameCount
        guard let channels = buffer.floatChannelData else { return nil }

        let twoPi = Double.pi * 2

        for frame in 0..<Int(frameCount) {
            let time = Double(frame) / sampleRate
            let firstTone = time < 0.28
            let frequency = firstTone ? 880.0 : 1_175.0
            let phaseTime = firstTone ? time : time - 0.28
            let attack = min(1.0, phaseTime / 0.025)
            let releaseStart = firstTone ? 0.22 : 0.62
            let release = max(0.0, min(1.0, (releaseStart - time) / 0.08))
            let envelope = max(0.0, attack * release)
            let tone = sin(twoPi * frequency * time) * envelope * 0.34
            let sample = Float(tone)

            channels[0][frame] = sample
            channels[1][frame] = sample
        }

        return buffer
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
        let chords: [[Double]] = [
            [130.81, 164.81, 196.00, 246.94], // Cmaj7
            [110.00, 130.81, 164.81, 196.00], // Am7
            [87.31, 130.81, 174.61, 220.00],  // Fmaj7
            [98.00, 146.83, 196.00, 246.94]   // G6
        ]
        let chordDuration = duration / Double(chords.count)

        for frame in 0..<Int(frameCount) {
            let time = Double(frame) / sampleRate
            let chordIndex = min(chords.count - 1, Int(time / chordDuration))
            let localTime = time.truncatingRemainder(dividingBy: chordDuration)
            let edge = min(1.0, min(localTime / 1.2, (chordDuration - localTime) / 1.2))
            let breathe = 0.80 + 0.20 * sin(twoPi * time / 8.0)

            var tone = 0.0
            for (index, frequency) in chords[chordIndex].enumerated() {
                let weight = index == 0 ? 0.34 : 0.18
                tone += sin(twoPi * frequency * time) * weight
                tone += sin(twoPi * frequency * 2.0 * time) * weight * 0.10
            }

            let air = sin(twoPi * 523.25 * time) * 0.025
                * (0.5 + 0.5 * sin(twoPi * time / 12.0))
            let sample = Float((tone * breathe * max(0.12, edge) + air) * 0.22)

            channels[0][frame] = sample
            channels[1][frame] = sample * Float(0.94 + 0.03 * sin(twoPi * time / 10.0))
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
