import AVFoundation
import MapKit
import SwiftUI
import UIKit

struct ContentView: View {
    @StateObject private var service = AircraftService()
    @StateObject private var mediaService = DestinationMediaService()
    @StateObject private var airportWeather = AirportWeatherService()
    @StateObject private var homeScene = HomeSceneService()
    @StateObject private var soundscape = AmbientSoundscape()
    @StateObject private var aviationTicker = AviationTickerService()
    @State private var displayClock = Date()
    @State private var lastEmergency: ObservedEmergency?
    @State private var failedVideoURLs: Set<String> = []
    // Une alerte se déclenche une seule fois par passage, pour 5 minutes maximum.
    @State private var priorityWindow: TimedFlightAlert?
    @State private var priorityAlreadyAlerted: Set<String> = []
    @State private var distressWindow: TimedFlightAlert?
    @State private var emergencyAlreadyAlerted: Set<String> = []
    @State private var worldIncidentWindow: TimedFlightAlert?
    @State private var seenWorldNews: Set<String> = []
    @State private var hasInitializedWorldNews = false

    private struct TimedFlightAlert {
        let key: String
        let startedAt: Date
    }

    // Heure de première observation locale : ne pas confondre avec l'heure
    // de survenue réelle de l'évènement aéronautique.
    private struct ObservedEmergency {
        let key: String
        let code: String
        let aircraft: String
        let detectedAt: Date
    }

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

    // Même numéro sur la fiche et sur la position réelle de l'avion dans la carte.
    // Le vol présenté peut être le n° 2 ou le n° 3 si sa destination est connue.
    private var followedRank: Int? {
        guard let featuredAircraft else { return nil }
        return service.aircraft.prefix(3).firstIndex(where: { $0.id == featuredAircraft.id })
            .map { $0 + 1 }
    }

    private var followedRankColor: Color {
        switch followedRank {
        case 1: return Color(red: 1.0, green: 0.76, blue: 0.20)
        case 2: return Color(red: 0.08, green: 0.72, blue: 0.99)
        case 3: return Color(red: 0.69, green: 0.39, blue: 1.0)
        default: return Color(red: 0.02, green: 0.57, blue: 0.84)
        }
    }

    // Conserver les moyens nationaux en alerte pendant les escales vidéo.
    private var priorityAircraft: Aircraft? {
        // 20 km autour de la maison : le passage local, pas toute la région.
        guard radarIsLive else { return nil }
        return service.specialAircraftInZone.first {
            $0.distanceKilometers(from: service.center) <= 20
                && ($0.positionAgeSeconds ?? 0) < 90
        }
    }

    private var priorityFocusAircraft: Aircraft? {
        guard let alert = priorityWindow,
              priorityAlertKey == alert.key,
              displayClock.timeIntervalSince(alert.startedAt) < 300 else { return nil }
        return priorityAircraft
    }

    private var prioritySecondsLeft: Int {
        guard let alert = priorityWindow else { return 0 }
        return max(0, Int(300 - displayClock.timeIntervalSince(alert.startedAt)))
    }

    private var distressIsFlashing: Bool {
        guard let alert = distressWindow,
              alert.key == activeEmergencyKey else { return false }
        return displayClock.timeIntervalSince(alert.startedAt) < 300
    }

    private var worldNewsIsFlashing: Bool {
        guard let alert = worldIncidentWindow else { return false }
        return displayClock.timeIntervalSince(alert.startedAt) < 300
    }

    private var latestSeriousWorldNews: AviationTickerService.Article? {
        // Articles de presse mondiaux : jamais confondus avec un signal ADS-B.
        aviationTicker.news
            .filter {
                $0.title.range(
                    of: "crash|accident aérien|air crash|plane crash|emergency landing|atterrissage d'urgence|mayday|détresse|distress|aviation emergency",
                    options: [.regularExpression, .caseInsensitive]
                ) != nil
            }
            .sorted { $0.date > $1.date }
            .first
    }

    private var priorityProfile: TVTrafficProfile? {
        guard let priorityAircraft else { return nil }
        return service.trafficProfile(for: priorityAircraft)
    }

    private var specialCounts: (civil: Int, military: Int) {
        let kinds = service.specialAircraftInZone.map { service.trafficProfile(for: $0).kind }
        return (
            kinds.filter { $0 == .civilSecurity }.count,
            kinds.filter { $0 == .military }.count
        )
    }

    private var radarIsLive: Bool {
        guard let updated = service.updatedAt else { return false }
        return service.errorMessage == nil && displayClock.timeIntervalSince(updated) < 40
    }

    private var radarStatus: String {
        guard let updated = service.updatedAt else { return "RECHERCHE DU TRAFIC…" }
        if !radarIsLive { return "DONNÉES À ACTUALISER" }
        return "RADAR ACTIF · " + updated.formatted(date: .omitted, time: .shortened)
    }

    private var trafficProfiles: [String: TVTrafficProfile] {
        Dictionary(uniqueKeysWithValues: service.aircraft.map { aircraft in
            (aircraft.id, service.trafficProfile(for: aircraft))
        })
    }

    private var trafficRoutes: [String: String] {
        Dictionary(uniqueKeysWithValues: service.aircraft.compactMap { aircraft in
            guard let info = service.enrichment(for: aircraft),
                  let departure = info.departureAirport?.code,
                  let arrival = info.arrivalAirport?.code,
                  departure != "—", arrival != "—" else { return nil }
            return (aircraft.id, "\(departure) → \(arrival)")
        })
    }

    private var podiumAirports: [TVAirport] {
        let highlighted: [TVAirport] = [
            featuredEnrichment?.departureAirport,
            featuredEnrichment?.arrivalAirport
        ].compactMap { $0 }
        let others = service.aircraft.prefix(3).flatMap { aircraft -> [TVAirport] in
            let info = service.enrichment(for: aircraft)
            return [info?.departureAirport, info?.arrivalAirport].compactMap { $0 }
        }
        return highlighted + others
    }

    private var podiumWeatherKey: String {
        podiumAirports.compactMap(\.icao).sorted().joined(separator: ",")
    }

    private var isPriorityActive: Bool {
        guard let aircraft = featuredAircraft,
              let profile = featuredProfile else { return false }
        return profile.isPriorityTraffic
            && aircraft.distanceKilometers(from: service.center) <= 50
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
        guard let aircraft = priorityAircraft else { return "none" }
        return aircraft.id
    }

    private var activeEmergency: Aircraft? {
        guard radarIsLive else { return nil }
        return service.aircraft.first {
            ["7700", "7600", "7500"].contains($0.squawk ?? "")
                && ($0.positionAgeSeconds ?? 0) < 90
        }
    }

    private var activeEmergencyKey: String {
        guard let aircraft = activeEmergency else { return "none" }
        return aircraft.id + "-" + (aircraft.squawk ?? "")
    }

    private var latestTechnicalArticle: AviationTickerService.Article? {
        // Il s'agit d'articles de presse : les titres ne prouvent pas une panne.
        // On ne présente aucun évènement fictif si le flux n'en fournit pas.
        aviationTicker.news
            .filter {
                $0.title.range(
                    of: "panne|avarie|problème technique|probleme technique|incident technique|pressurisation|dépressurisation|depressurisation|panne moteur",
                    options: [.regularExpression, .caseInsensitive]
                ) != nil
            }
            .sorted { $0.date > $1.date }
            .first
    }

    private func emergencyTitle(_ code: String) -> String {
        switch code {
        case "7700": return "URGENCE TRANSPONDEUR · CAUSE NON CONFIRMÉE"
        case "7600": return "DÉFAILLANCE RADIO SIGNALÉE"
        case "7500": return "CODE D'INTERVENTION ILLICITE"
        default: return "CODE D'URGENCE SIGNALÉ"
        }
    }

    // SKY SHOW, projet n° 2 : grande carte à gauche, destination en haut
    // à droite, panneau prioritaire à la place des avions 1, 2 et 3.
    // Les médias gardent le mode silencieux. Aucun clic requis.
    var body: some View {
        GeometryReader { geometry in
            let width = max(0, geometry.size.width - 32)
            let height = max(0, geometry.size.height - 28)
            let rightWidth = width * 0.55
            let videoHeight = height * 0.365
            let infoHeight = height * 0.275
            let alertHeight: CGFloat = 112

            ZStack {
                SkyShowBackdrop().ignoresSafeArea()
                    .allowsHitTesting(false)

                HStack(spacing: 12) {
                    AircraftMapView(
                        aircraft: service.aircraft,
                        center: service.center,
                        trails: service.trails,
                        selectedID: priorityFocusAircraft?.id ?? featuredAircraft?.id,
                        profiles: trafficProfiles,
                        routes: trafficRoutes
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                    .overlay(RoundedRectangle(cornerRadius: 18)
                        .stroke(Color.white.opacity(0.9), lineWidth: 2))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                    VStack(spacing: 9) {
                        cinemaVersionFourDestination
                            .frame(height: videoHeight)

                        Group {
                            if let operational = priorityFocusAircraft {
                                priorityTakeover(operational)
                            } else {
                                VStack(spacing: 9) {
                                    cinemaVersionFourFlightOne
                                        .frame(height: infoHeight)
                                    cinemaVersionFourSecondaries
                                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)

                        HStack(spacing: 9) {
                            cinemaPriorityStatus.frame(maxWidth: .infinity)
                            cinemaIncidentPanel.frame(maxWidth: .infinity)
                        }
                        .frame(height: alertHeight)
                    }
                    .frame(width: rightWidth, height: height)
                }
                .frame(width: width, height: height)
            }
        }
        .allowsHitTesting(false)
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            service.start()
            soundscape.prepareAlertsOnly()
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            service.stop()
            soundscape.stop()
        }
        .task {
            // L'état de liaison évolue même lorsque le fournisseur ADS-B
            // ne répond plus : ne jamais afficher EN DIRECT indéfiniment.
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 4_000_000_000) }
                catch { break }
                displayClock = Date()
                if let alert = priorityWindow,
                   displayClock.timeIntervalSince(alert.startedAt) >= 300 {
                    priorityAlreadyAlerted.insert(alert.key)
                    priorityWindow = nil
                }
                if let alert = distressWindow,
                   displayClock.timeIntervalSince(alert.startedAt) >= 300 {
                    emergencyAlreadyAlerted.insert(alert.key)
                    distressWindow = nil
                }
                if let alert = worldIncidentWindow,
                   displayClock.timeIntervalSince(alert.startedAt) >= 300 {
                    worldIncidentWindow = nil
                }
            }
        }
        .task(id: podiumWeatherKey) {
            await airportWeather.refresh(for: podiumAirports)
        }
        .task {
            // Vraie météo de Bâgé-Dommartin actualisée toutes les 15 minutes.
            while !Task.isCancelled {
                await homeScene.refresh()
                do { try await Task.sleep(nanoseconds: 900_000_000_000) }
                catch { break }
            }
        }
        .task {
            // Rotation automatique des photographies locales.
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 15_000_000_000) }
                catch { break }
                homeScene.advancePhoto()
            }
        }
        .task(id: destinationTaskKey) {
            failedVideoURLs.removeAll()
            await mediaService.load(for: featuredEnrichment)
            // Préférer la vidéo réelle de la destination dès qu'elle existe,
            // même sans passage à moins de 12 km de HOME.
            mediaService.preferVideo()
        }
        .task(id: mediaService.current?.id) {
            guard let media = mediaService.current else { return }
            let seconds: UInt64 = media.isVideo ? 20 : 11
            try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
            guard !Task.isCancelled else { return }
            await mediaService.advance()
        }
        .task(id: priorityAlertKey) {
            guard priorityAlertKey != "none" else {
                priorityWindow = nil
                priorityAlreadyAlerted.removeAll()
                return
            }
            guard !priorityAlreadyAlerted.contains(priorityAlertKey) else { return }
            let now = Date()
            priorityWindow = TimedFlightAlert(key: priorityAlertKey, startedAt: now)
            priorityAlreadyAlerted.insert(priorityAlertKey)
            soundscape.playPriorityAlert()
        }
        .task(id: activeEmergencyKey) {
            guard let aircraft = activeEmergency, let code = aircraft.squawk else {
                distressWindow = nil
                emergencyAlreadyAlerted.removeAll()
                return
            }
            guard !emergencyAlreadyAlerted.contains(activeEmergencyKey) else { return }
            let now = Date()
            emergencyAlreadyAlerted.insert(activeEmergencyKey)
            distressWindow = TimedFlightAlert(key: activeEmergencyKey, startedAt: now)
            lastEmergency = ObservedEmergency(
                key: activeEmergencyKey, code: code,
                aircraft: aircraft.displayName, detectedAt: now
            )
            soundscape.playEmergencyAlert()
        }
        .task(id: latestSeriousWorldNews?.id) {
            guard let article = latestSeriousWorldNews else { return }
            // Au premier chargement on ne fait pas sonner des anciennes dépêches.
            if !hasInitializedWorldNews {
                hasInitializedWorldNews = true
                seenWorldNews.insert(article.id)
                return
            }
            guard !seenWorldNews.contains(article.id) else { return }
            seenWorldNews.insert(article.id)
            guard let published = ISO8601DateFormatter().date(from: article.date),
                  abs(Date().timeIntervalSince(published)) < 1_800 else { return }
            worldIncidentWindow = TimedFlightAlert(key: article.id, startedAt: Date())
            soundscape.playEmergencyAlert()
        }
        .task {
            // Information aéronautique provenant de la presse (jamais de
            // fausses alertes 7700/7600/7500 attribuées à des vols).
            while !Task.isCancelled {
                await aviationTicker.refresh()
                do { try await Task.sleep(nanoseconds: 900_000_000_000) }
                catch { break }
            }
        }
    }

    // Grande fiche unique à la place des avions 1, 2, 3 pendant le
    // passage local (au maximum cinq minutes). Pas de vol fictif affiché.
    private func priorityTakeover(_ aircraft: Aircraft) -> some View {
        let details = service.enrichment(for: aircraft)
        let profile = service.trafficProfile(for: aircraft)
        let remaining = prioritySecondsLeft
        let minutes = remaining / 60
        let seconds = remaining % 60
        let started = priorityWindow?.startedAt ?? displayClock
        return VStack(alignment: .leading, spacing: 11) {
            HStack(spacing: 9) {
                Image(systemName: "siren.fill")
                    .font(.system(size: 29, weight: .black))
                Text("MOYEN PRIORITAIRE DÉTECTÉ")
                    .font(.system(size: 29, weight: .black, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.60)
                Spacer(minLength: 0)
                Text(String(format: "%02d:%02d", minutes, seconds))
                    .font(.system(size: 25, weight: .black).monospacedDigit())
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.red.opacity(0.79), in: RoundedRectangle(cornerRadius: 13))

            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(aircraft.displayName)
                        .font(.system(size: 43, weight: .black, design: .rounded))
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Text(profile.label.uppercased())
                        .font(.system(size: 19, weight: .heavy))
                        .foregroundStyle(Color(red: 1, green: 0.71, blue: 0.30))
                        .lineLimit(1).minimumScaleFactor(0.65)
                    Text(details?.aircraftModel ?? aircraft.aircraftType ?? "TYPE NON PRÉCISÉ")
                        .font(.system(size: 17, weight: .semibold))
                        .lineLimit(1)
                    Text(aircraft.registration ?? "Immatriculation indisponible")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.white.opacity(0.79))
                        .lineLimit(1)
                    priorityRoute(aircraft, details: details)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                priorityPhoto(details, profile: profile)
                    .frame(width: 340, height: 215)
            }
            .frame(maxWidth: .infinity)

            priorityMetrics(aircraft)
            HStack(spacing: 6) {
                Image(systemName: "location.circle.fill")
                    .foregroundStyle(.red)
                Text("Secteur Bâgé-Dommartin · détection le "
                    + started.formatted(.dateTime.day().month().year().hour().minute()))
                    .font(.system(size: 13, weight: .bold))
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 0)
                Text("ADS-B · positions publiques non exhaustives")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.70))
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
        }
        .foregroundStyle(.white)
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            LinearGradient(
                colors: [Color(red: 0.37, green: 0.025, blue: 0.070),
                         Color(red: 0.055, green: 0.055, blue: 0.12)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ), in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20)
            .stroke(Color.red, lineWidth: 3))
        .modifier(CinemaAlertPulse(isEnabled: true))
    }

    private func priorityPhoto(
        _ details: TVAircraftEnrichment?, profile: TVTrafficProfile
    ) -> some View {
        ZStack(alignment: .bottomLeading) {
            if let photo = details?.photoURL {
                AsyncImage(url: photo) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        priorityPhotoFallback(profile)
                    }
                }
            } else {
                priorityPhotoFallback(profile)
            }
            LinearGradient(
                colors: [.clear, .black.opacity(0.73)],
                startPoint: .center, endPoint: .bottom
            )
            HStack(spacing: 7) {
                if let logo = details?.logoURL {
                    AsyncImage(url: logo) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        Image(systemName: "airplane")
                    }
                    .frame(width: 39, height: 34)
                    .padding(4)
                    .background(Color.white.opacity(0.92),
                                in: RoundedRectangle(cornerRadius: 8))
                }
                Text(details?.photo.source ?? "Photo indisponible")
                    .font(.system(size: 12, weight: .bold))
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
            .padding(8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14)
            .stroke(Color.white.opacity(0.65), lineWidth: 1.5))
    }

    private func priorityPhotoFallback(_ profile: TVTrafficProfile) -> some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.11, green: 0.21, blue: 0.32),
                         Color(red: 0.20, green: 0.08, blue: 0.12)],
                startPoint: .topLeading, endPoint: .bottomTrailing)
            VStack(spacing: 8) {
                Image(systemName: profile.isRotorcraft ? "helicopter" : "airplane")
                    .font(.system(size: 77, weight: .bold))
                    .foregroundStyle(.white)
                Text("PHOTO NON DISPONIBLE")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
    }

    private func priorityRoute(
        _ aircraft: Aircraft, details: TVAircraftEnrichment?
    ) -> some View {
        let departure = details?.departureAirport?.city ?? "Non communiqué"
        let arrival = details?.arrivalAirport?.city ?? "Non communiqué"
        let isConfirmed = details?.routeConfidence == "confirmed"
        return VStack(alignment: .leading, spacing: 3) {
            Text("DÉPART · " + departure)
                .font(.system(size: 17, weight: .heavy))
                .lineLimit(1).minimumScaleFactor(0.65)
            Text("ARRIVÉE · " + arrival)
                .font(.system(size: 17, weight: .heavy))
                .lineLimit(1).minimumScaleFactor(0.65)
            Text(isConfirmed ? "TRAJET CONFIRMÉ PAR LA SOURCE"
                 : "TRAJET NON CONFIRMÉ / PARTIEL")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white.opacity(0.67))
        }
    }

    private func priorityMetrics(_ aircraft: Aircraft) -> some View {
        HStack(spacing: 7) {
            priorityMetric("ALTITUDE", aircraft.altitudeLabel, "mountain.2.fill")
            priorityMetric("VITESSE", aircraft.speedLabel, "speedometer")
            priorityMetric("CAP", directionFrancais(aircraft.trueTrack), "location.north.fill")
            priorityMetric("DISTANCE", String(format: "%.1f km",
                aircraft.distanceKilometers(from: service.center)), "location.fill")
        }
    }

    private func priorityMetric(_ label: String, _ value: String, _ symbol: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: symbol).font(.system(size: 22, weight: .bold))
                .foregroundStyle(Color(red: 1, green: 0.49, blue: 0.47))
            Text(value).font(.system(size: 21, weight: .black))
                .lineLimit(1).minimumScaleFactor(0.58)
            Text(label).font(.system(size: 12, weight: .heavy))
                .foregroundStyle(.white.opacity(0.77))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 7)
        .background(Color.black.opacity(0.29),
            in: RoundedRectangle(cornerRadius: 10))
    }

    private var cinemaVersionFourHeader: some View {
        HStack(spacing: 11) {
            Image(systemName: "airplane.circle.fill")
                .font(.system(size: 33, weight: .heavy))
                .foregroundStyle(Color(red: 0.04, green: 0.19, blue: 0.36))
            Text("XAVPAC TV · SKY SHOW")
                .font(.system(size: 29, weight: .black, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 10)
            Circle().fill(radarIsLive ? Color.green : Color.orange)
                .frame(width: 13, height: 13)
            Text(radarIsLive ? "DIRECT" : "LIAISON")
                .font(.system(size: 17, weight: .black))
            Text(displayClock, format: .dateTime.hour().minute())
                .font(.system(size: 25, weight: .black).monospacedDigit())
        }
        .foregroundStyle(Color(red: 0.05, green: 0.20, blue: 0.37))
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .background(Color.white.opacity(0.97), in: RoundedRectangle(cornerRadius: 19))
        .shadow(color: .black.opacity(0.22), radius: 11, y: 4)
    }

    // Version 4 : médias réellement chargés, très peu de texte superposé
    // pour que la séquence audiovisuelle soit clairement visible sur TV.
    // Les films sont lus sans audio ; aucune playlist et aucun clic.
    private var cinemaVersionFourDestination: some View {
        let knownDestination = featuredEnrichment?.arrivalAirport != nil
            && featuredEnrichment?.routeConfidence != "unavailable"
        let destinationName = featuredEnrichment?.arrivalAirport?.city ?? "Prochaine escale"
        let isVideo = knownDestination && mediaService.current?.televisionVideoURL != nil

        return GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                Group {
                    if knownDestination {
                        cinemaMedia
                    } else if let photo = homeScene.currentPhoto,
                              let url = URL(string: photo.url) {
                        CinematicDestinationImage(
                            url: url,
                            fallback: AnyView(homeScenicFallback)
                        )
                    } else {
                        homeScenicFallback
                    }
                }
                .frame(width: geometry.size.width, height: geometry.size.height)
                .clipped()
                .id(knownDestination ? mediaService.current?.id ?? "en-attente" : homeScene.currentPhoto?.id ?? "local")

                LinearGradient(
                    colors: [.black.opacity(0.44), .clear, .black.opacity(0.62)],
                    startPoint: .top, endPoint: .bottom
                )
                .allowsHitTesting(false)

                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 10) {
                        Image(systemName: "play.rectangle.fill")
                            .font(.system(size: 25, weight: .black))
                        Text("VUE IMMERSIVE · VIDÉO")
                            .font(.system(size: 22, weight: .black, design: .rounded))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                        Spacer(minLength: 0)
                        Text(isVideo ? "VIDÉO AUTOMATIQUE"
                             : "PHOTO · VIDÉO SI DISPONIBLE")
                            .font(.system(size: 12, weight: .black))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(.black.opacity(0.62), in: Capsule())
                    }
                    Spacer(minLength: 15)
                    Text(knownDestination ? destinationName : "Bâgé-Dommartin")
                        .font(.system(size: 41, weight: .black, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(knownDestination
                         ? (mediaService.current?.sourceName ?? "Destination aérienne")
                         : "En attente de la prochaine destination identifiée")
                        .font(.system(size: 15, weight: .semibold))
                        .lineLimit(1)
                }
                .foregroundStyle(.white)
                .padding(17)
            }
        }
        .background(Color(red: 0.05, green: 0.22, blue: 0.38))
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.white, lineWidth: 3))
    }

    private var cinemaVersionFourFlightOne: some View {
        let first = service.aircraft.first
        let details = service.enrichment(for: first)
        let dep = details?.departureAirport
        let arr = details?.arrivalAirport

        return VStack(alignment: .leading, spacing: 8) {
            cinemaVersionFourFlightHeader(first, details: details)

            Text((dep?.city ?? "Départ non renseigné") + "  →  " + (arr?.city ?? "Arrivée non renseignée"))
                .font(.system(size: 24, weight: .black, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.65)

            HStack(spacing: 8) {
                cinemaVersionFourWeather("DÉPART", airport: dep)
                cinemaVersionFourWeather("ARRIVÉE", airport: arr)
            }
            cinemaVersionFourMetrics(first)
        }
        .padding(.horizontal, 15)
        .padding(.vertical, 12)
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(red: 0.02, green: 0.09, blue: 0.17),
                    in: RoundedRectangle(cornerRadius: 21))
        .overlay(RoundedRectangle(cornerRadius: 21)
            .stroke(Color.cyan.opacity(0.42), lineWidth: 2))
    }

    private func cinemaVersionFourFlightHeader(
        _ first: Aircraft?, details: TVAircraftEnrichment?
    ) -> some View {
        let model: String = details?.aircraftModel
            ?? details?.aircraftType
            ?? first?.description
            ?? first?.aircraftType
            ?? "TYPE NON IDENTIFIÉ"

        return HStack(spacing: 11) {
            Text("1")
                .font(.system(size: 25, weight: .black))
                .foregroundStyle(Color(red: 0.12, green: 0.19, blue: 0.32))
                .frame(width: 47, height: 47)
                .background(Color(red: 1, green: 0.77, blue: 0.22), in: Circle())
            aircraftThumbnail(details)
                .frame(width: 164, height: 81)
            VStack(alignment: .leading, spacing: 1) {
                Text(first?.displayName ?? "AVION N° 1 EN ATTENTE")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text(model)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white.opacity(0.74))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Text("N° 1")
                .font(.system(size: 18, weight: .black))
                .foregroundStyle(.yellow)
        }
    }

    private func aircraftThumbnail(_ details: TVAircraftEnrichment?) -> some View {
        ZStack(alignment: .bottomTrailing) {
            if let url = details?.photoURL {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Image(systemName: "airplane")
                            .resizable().scaledToFit()
                            .padding(16)
                            .foregroundStyle(.white.opacity(0.75))
                    }
                }
            } else {
                Image(systemName: "airplane")
                    .resizable().scaledToFit()
                    .padding(16)
                    .foregroundStyle(.white.opacity(0.75))
            }
            if let logo = details?.logoURL {
                AsyncImage(url: logo) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    Color.clear
                }
                .frame(width: 33, height: 29)
                .padding(3)
                .background(Color.white.opacity(0.94),
                            in: RoundedRectangle(cornerRadius: 7))
                .padding(4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.07, green: 0.20, blue: 0.35))
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10)
            .stroke(Color.white.opacity(0.35), lineWidth: 1))
    }

    private func cinemaVersionFourMetrics(_ first: Aircraft?) -> some View {
        let altitude: String = first?.altitudeLabel ?? "—"
        let speed: String = first?.speedLabel ?? "—"
        let heading: String = directionFrancais(first?.trueTrack)
        let distance: String = first.map { distanceText($0) } ?? "—"

        return HStack(spacing: 4) {
            cinemaSkyMetric("ALTITUDE", value: altitude, icon: "mountain.2.fill")
            cinemaSkyMetric("VITESSE", value: speed, icon: "speedometer")
            cinemaSkyMetric("CAP", value: heading, icon: "location.north.fill")
            cinemaSkyMetric("DISTANCE", value: distance, icon: "location.fill")
        }
    }

    // 16 secteurs, en toutes lettres et en français.
    private func directionFrancais(_ angle: Double?) -> String {
        guard let angle, angle.isFinite else { return "—" }
        let sectors = [
            "nord", "nord-nord-est", "nord-est", "est-nord-est",
            "est", "est-sud-est", "sud-est", "sud-sud-est",
            "sud", "sud-sud-ouest", "sud-ouest", "ouest-sud-ouest",
            "ouest", "ouest-nord-ouest", "nord-ouest", "nord-nord-ouest"
        ]
        let heading = (angle.truncatingRemainder(dividingBy: 360) + 360)
            .truncatingRemainder(dividingBy: 360)
        let index = Int((heading + 11.25) / 22.5) % 16
        return sectors[index]
    }

    private var cinemaVersionFourSecondaries: some View {
        GeometryReader { geo in
            let aircraft = Array(service.aircraft.dropFirst().prefix(2))
            let half = max(0, (geo.size.width - 8) / 2)
            HStack(spacing: 8) {
                cinemaVersionFourSecondary(aircraft.first, rank: 2)
                    .frame(width: half, height: geo.size.height)
                cinemaVersionFourSecondary(aircraft.count > 1 ? aircraft[1] : nil, rank: 3)
                    .frame(width: half, height: geo.size.height)
            }
        }
    }

    private func cinemaVersionFourSecondary(_ aircraft: Aircraft?, rank: Int) -> some View {
        let details = service.enrichment(for: aircraft)
        let departure = details?.departureAirport?.city ?? "—"
        let arrival = details?.arrivalAirport?.city ?? "—"
        let accent = rank == 2
            ? Color(red: 0.12, green: 0.67, blue: 0.97)
            : Color(red: 0.76, green: 0.32, blue: 0.93)

        return VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 8) {
                aircraftThumbnail(details)
                    .frame(width: 106, height: 70)
                Text(String(rank))
                    .font(.system(size: 23, weight: .black))
                    .frame(width: 36, height: 36)
                    .background(accent, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(aircraft?.displayName ?? "AVION " + String(rank))
                        .font(.system(size: 21, weight: .black))
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                    Text(aircraft == nil ? "EN ATTENTE D'UN PASSAGE"
                         : details?.aircraftModel ?? aircraft?.aircraftType ?? "TYPE NON IDENTIFIÉ")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.72))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            Spacer(minLength: 1)
            Text("DÉPART · " + departure)
                .font(.system(size: 13, weight: .bold))
                .lineLimit(1).minimumScaleFactor(0.65)
            Text("ARRIVÉE · " + arrival)
                .font(.system(size: 13, weight: .bold))
                .lineLimit(1).minimumScaleFactor(0.65)
            Text("CAP · " + directionFrancais(aircraft?.trueTrack))
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(accent)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .foregroundStyle(.white)
        .padding(11)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(red: 0.03, green: 0.11, blue: 0.21),
                    in: RoundedRectangle(cornerRadius: 17))
        .overlay(RoundedRectangle(cornerRadius: 17)
            .stroke(accent.opacity(0.75), lineWidth: 2))
    }

    private func cinemaVersionFourWeather(_ title: String, airport: TVAirport?) -> some View {
        let weather = airportWeather.weather(for: airport)
        return HStack(spacing: 7) {
            Image(systemName: weather?.symbolName ?? "cloud.fill")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(Color(red: 0.66, green: 0.88, blue: 1))
            VStack(alignment: .leading, spacing: 2) {
                Text(title + " · " + (airport?.code ?? "—"))
                    .font(.system(size: 12, weight: .black))
                    .foregroundStyle(.cyan)
                    .lineLimit(1)
                Text(weather?.temperatureLabel ?? "—")
                    .font(.system(size: 23, weight: .black))
                    .lineLimit(1)
                Text(weather?.windLabel ?? "Météo indisponible")
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 7)
        .padding(.vertical, 6)
        .background(Color(red: 0.07, green: 0.19, blue: 0.30),
                    in: RoundedRectangle(cornerRadius: 11))
    }

    // Carte agrandie : suppression de l'ancien bandeau presse inférieur.
    // Avions 2/3 identifiés ici et sur la carte ; alertes regroupées en bas à droite.
    private var cinemaSkyStage: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height
            let edge: CGFloat = 20

            ZStack {
                AircraftMapView(
                    aircraft: service.aircraft,
                    center: service.center,
                    trails: service.trails,
                    selectedID: featuredAircraft?.id,
                    profiles: trafficProfiles,
                    routes: trafficRoutes
                )
                .frame(width: width, height: height)

                // Garder la cartographie lisible, même avec les incrustations.
                LinearGradient(
                    colors: [
                        Color(red: 0.85, green: 0.96, blue: 1.0).opacity(0.12),
                        .clear,
                        Color(red: 0.02, green: 0.17, blue: 0.31).opacity(0.14)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .allowsHitTesting(false)

                VStack {
                    HStack(alignment: .top, spacing: 18) {
                        cinemaSkyIdentity
                            .frame(width: width * 0.415, height: min(190, height * 0.34))
                        Spacer(minLength: 20)
                        cinemaDestination
                            .frame(width: width * 0.38, height: height * 0.59)
                    }

                    Spacer(minLength: 15)

                    HStack(alignment: .bottom, spacing: 18) {
                        cinemaSkyRouteWeather
                            .frame(width: width * 0.42, height: min(174, height * 0.31))
                        Spacer(minLength: 20)
                        cinemaSkyFlightCharacteristics
                            .frame(width: width * 0.34, height: min(174, height * 0.31))
                    }
                }
                .padding(edge)
            }
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 26).stroke(Color.white, lineWidth: 4))
            .shadow(color: Color.cyan.opacity(0.29), radius: 22, y: 5)
        }
    }

    private var cinemaSkyIdentity: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 12) {
                Label("XAVPAC TV · SKY SHOW", systemImage: "airplane.circle.fill")
                    .font(.system(size: 24, weight: .black, design: .rounded))
                    .foregroundStyle(Color(red: 0.03, green: 0.36, blue: 0.60))
                Spacer(minLength: 0)
                Circle()
                    .fill(radarIsLive ? Color.green : Color.orange)
                    .frame(width: 12, height: 12)
                Text(radarIsLive ? "DIRECT" : "LIAISON")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(Color(red: 0.10, green: 0.40, blue: 0.56))
                Text(displayClock, format: .dateTime.hour().minute())
                    .font(.system(size: 24, weight: .black).monospacedDigit())
                    .foregroundStyle(Color(red: 0.03, green: 0.28, blue: 0.49))
            }
            cinemaFeaturedIdentity
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(.horizontal, 17)
        .padding(.vertical, 13)
        .background(
            LinearGradient(
                colors: [Color.white.opacity(0.99), Color(red: 0.86, green: 0.96, blue: 1).opacity(0.96)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.cyan.opacity(0.40), lineWidth: 2))
        .shadow(color: Color(red: 0.01, green: 0.33, blue: 0.51).opacity(0.28), radius: 14, y: 4)
    }

    private var cinemaSkyRouteWeather: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 9) {
                Image(systemName: "airplane.departure")
                    .font(.system(size: 25, weight: .heavy))
                    .foregroundStyle(Color(red: 0.42, green: 0.87, blue: 1.0))
                Text(cinemaRouteLabel)
                    .font(.system(size: 24, weight: .black, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.67)
                Spacer(minLength: 0)
                Text("MÉTÉO DÉPART / ARRIVÉE")
                    .font(.system(size: 13, weight: .black))
                    .tracking(0.5)
            }
            .foregroundStyle(.white)

            HStack(spacing: 9) {
                cinemaAirportWeatherTile(title: "DÉPART", airport: featuredEnrichment?.departureAirport)
                cinemaAirportWeatherTile(title: "ARRIVÉE", airport: featuredEnrichment?.arrivalAirport)
            }
        }
        .padding(13)
        .background(Color(red: 0.02, green: 0.11, blue: 0.24).opacity(0.94),
                    in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.cyan.opacity(0.73), lineWidth: 2))
        .shadow(color: .black.opacity(0.43), radius: 12, y: 4)
    }

    private var cinemaSkyFlightCharacteristics: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Image(systemName: featuredProfile?.isRotorcraft == true ? "helicopter" : "airplane")
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundStyle(Color(red: 1, green: 0.78, blue: 0.32))
                VStack(alignment: .leading, spacing: 2) {
                    Text(featuredAircraft?.displayName ?? "EN ATTENTE DE VOL")
                        .font(.system(size: 29, weight: .black, design: .rounded))
                    Text(featuredEnrichment?.aircraftModel
                         ?? featuredAircraft?.description
                         ?? featuredAircraft?.aircraftType
                         ?? "TYPE EN COURS D'IDENTIFICATION")
                        .font(.system(size: 15, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                        .foregroundStyle(.white.opacity(0.76))
                }
                Spacer(minLength: 0)
                Text("N° " + String(followedRank ?? 1))
                    .font(.system(size: 19, weight: .black))
                    .foregroundStyle(Color(red: 1, green: 0.80, blue: 0.29))
            }
            HStack(spacing: 7) {
                cinemaSkyMetric("ALTITUDE", value: featuredAircraft?.altitudeLabel ?? "—", icon: "mountain.2.fill")
                cinemaSkyMetric("VITESSE", value: featuredAircraft?.speedLabel ?? "—", icon: "speedometer")
                cinemaSkyMetric("CAP", value: featuredAircraft?.headingLabel ?? "—", icon: "location.north.fill")
                cinemaSkyMetric("DISTANCE", value: featuredAircraft.map(distanceText) ?? "—", icon: "location.fill")
            }
        }
        .padding(15)
        .foregroundStyle(.white)
        .background(Color(red: 0.02, green: 0.11, blue: 0.24).opacity(0.96),
                    in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20)
            .stroke(followedRankColor.opacity(0.9), lineWidth: 2.5))
        .shadow(color: .black.opacity(0.4), radius: 13, y: 4)
    }

    private func cinemaSkyMetric(_ label: String, value: String, icon: String) -> some View {
        VStack(alignment: .center, spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 23, weight: .bold))
                .foregroundStyle(Color(red: 0.63, green: 0.89, blue: 1.0))
            Text(value)
                .font(.system(size: 18, weight: .black, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label)
                .font(.system(size: 12, weight: .heavy))
                .tracking(0.4)
                .foregroundStyle(.white.opacity(0.7))
        }
        .frame(maxWidth: .infinity)
    }

    // La veille de presse reste disponible au service AviationTickerService.
    // À l'écran : les seules remontées affichées concernent les incidents.
    private var cinemaIncidentPanel: some View {
        let emergency = activeEmergency
        let isLive = emergency != nil
        let showLive = isLive  // Ne jamais faire disparaître une urgence ADS-B active.
        let article = latestSeriousWorldNews ?? latestTechnicalArticle
        let prior = lastEmergency
        let heading: String
        let title: String
        let source: String
        let date: String?

        if showLive {
            heading = "🚨 ALERTE EN TEMPS RÉEL"
            title = emergencyTitle(emergency?.squawk ?? "")
            source = (emergency?.displayName ?? "Vol inconnu") + " · code " + (emergency?.squawk ?? "—")
            if let observation = prior, observation.key == activeEmergencyKey {
                date = observation.detectedAt.formatted(.dateTime.day().month().year().hour().minute())
            } else {
                date = nil
            }
        } else if let article = article {
            heading = worldNewsIsFlashing
                ? "🚨 NOUVELLE URGENCE MONDIALE · PRESSE"
                : "⚠ DERNIER INCIDENT MONDIAL · PRESSE"
            title = article.title
            source = article.source + " · publié " + article.dateLabel
            date = nil
        } else if let observation = prior {
            heading = "⚠ DERNIÈRE URGENCE OBSERVÉE"
            title = "Code " + observation.code + " · " + observation.aircraft
            source = "ADS-B · détecté le "
                + observation.detectedAt.formatted(.dateTime.day().month().year().hour().minute())
            date = nil
        } else {
            heading = "✓ SURVEILLANCE DES URGENCES"
            title = "Aucun incident connu dans les données disponibles"
            source = "ADS-B · couverture partielle"
            date = nil
        }

        return HStack(spacing: 12) {
            Image(systemName: showLive ? "exclamationmark.triangle.fill"
                : article != nil || prior != nil ? "clock.badge.exclamationmark" : "checkmark.shield.fill")
                .font(.system(size: 27, weight: .black))
                .foregroundStyle(showLive ? Color.red : Color.orange)
                .frame(width: 36)
            VStack(alignment: .leading, spacing: 4) {
                Text(heading)
                    .font(.system(size: 14, weight: .black))
                    .foregroundStyle(showLive ? Color(red: 1, green: 0.42, blue: 0.42) : Color(red: 1, green: 0.76, blue: 0.31))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(title)
                    .font(.system(size: 16, weight: .heavy))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                Text(source + (date.map { " · détecté le " + $0 } ?? ""))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.81))
                    .lineLimit(1)
                    .minimumScaleFactor(0.73)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .foregroundStyle(.white)
        .background(
            LinearGradient(
                colors: [Color(red: 0.08, green: 0.12, blue: 0.22),
                         Color(red: showLive ? 0.40 : 0.23, green: 0.07, blue: 0.12)],
                startPoint: .leading, endPoint: .trailing
            ),
            in: RoundedRectangle(cornerRadius: 20, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 20)
            .stroke(showLive ? Color.red : Color.orange.opacity(0.65), lineWidth: 2))
        .modifier(CinemaAlertPulse(isEnabled: distressIsFlashing || worldNewsIsFlashing))
    }

    private var cinemaHeader: some View {
        HStack(spacing: 22) {
            // Le bandeau ne montre plus « XavPac TV » :
            // vraie photo de l'appareil suivi + logo de sa compagnie.
            cinemaFeaturedIdentity
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 14) {
                Circle()
                    .fill(radarIsLive ? Color.green : Color.orange)
                    .frame(width: 19, height: 19)
                    .shadow(color: Color.green.opacity(0.6), radius: 8)
                Text(radarIsLive ? "EN DIRECT" : "RECONNEXION")
                    .font(.system(size: 24, weight: .black))
                    .foregroundStyle(Color(red: 0.04, green: 0.39, blue: 0.53))
            }
            .padding(.horizontal, 21)
            .frame(height: 69)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20)
                .stroke(Color.cyan.opacity(0.25), lineWidth: 2))

            HStack(alignment: .firstTextBaseline, spacing: 11) {
                Text("\(service.aircraft.count)")
                    .font(.system(size: 56, weight: .black, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Color(red: 0.02, green: 0.43, blue: 0.73))
                Text("AÉRONEFS")
                    .font(.system(size: 21, weight: .heavy))
                    .foregroundStyle(Color(red: 0.24, green: 0.40, blue: 0.55))
            }
            .padding(.horizontal, 20)
            .frame(height: 69)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 20))
        }
    }

    // Identité du vol mis en avant, mise à jour automatiquement :
    // une photo de l'aéronef, le logo réel de son opérateur et son nom.
    @ViewBuilder
    private var cinemaFeaturedIdentity: some View {
        if let aircraft = featuredAircraft {
            let details = featuredEnrichment
            let profile = featuredProfile
            let company = details?.operatorName ?? aircraft.operatorName ?? "Compagnie non renseignée"
            let model = details?.aircraftModel ?? details?.aircraftType
                ?? aircraft.description ?? aircraft.aircraftType ?? "Aéronef en direct"

            HStack(spacing: 15) {
                Group {
                    if let photoURL = details?.photoURL, details?.photo.kind != "generic" {
                        AsyncImage(url: photoURL) { phase in
                            if let image = phase.image {
                                image.resizable().scaledToFill()
                            } else {
                                cinemaHeaderAircraftFallback(isHelicopter: profile?.isRotorcraft ?? false)
                            }
                        }
                    } else {
                        cinemaHeaderAircraftFallback(isHelicopter: profile?.isRotorcraft ?? false)
                    }
                }
                .frame(width: 170, height: 79)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(alignment: .topLeading) {
                    if let rank = followedRank {
                        Text(String(rank))
                            .font(.system(size: 24, weight: .black, design: .rounded))
                            .foregroundStyle(rank == 1 ? Color(red: 0.12, green: 0.20, blue: 0.34) : .white)
                            .frame(width: 43, height: 43)
                            .background(followedRankColor, in: Circle())
                            .overlay(Circle().stroke(Color.white, lineWidth: 3))
                            .shadow(color: followedRankColor.opacity(0.7), radius: 8)
                            .padding(5)
                    }
                }
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(followedRankColor.opacity(0.96), lineWidth: 3))
                .shadow(color: followedRankColor.opacity(0.42), radius: 12)

                Group {
                    if let logo = details?.logoURL {
                        AsyncImage(url: logo) { phase in
                            if let image = phase.image {
                                image.resizable().scaledToFit().padding(5)
                            } else {
                                cinemaHeaderLogoFallback(isHelicopter: profile?.isRotorcraft ?? false)
                            }
                        }
                    } else {
                        cinemaHeaderLogoFallback(isHelicopter: profile?.isRotorcraft ?? false)
                    }
                }
                .frame(width: 77, height: 73)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color(red: 0.70, green: 0.86, blue: 0.95), lineWidth: 1.5))

                VStack(alignment: .leading, spacing: 3) {
                    Text(company)
                        .font(.system(size: 29, weight: .black, design: .rounded))
                        .foregroundStyle(Color(red: 0.06, green: 0.23, blue: 0.40))
                        .lineLimit(1)
                        .minimumScaleFactor(0.68)
                    Text(model)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Color(red: 0.24, green: 0.43, blue: 0.59))
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                    if let rank = followedRank {
                        HStack(spacing: 7) {
                            Image(systemName: "scope")
                            Text("AVION SUIVI · REPÈRE " + String(rank) + " SUR LA CARTE")
                        }
                        .font(.system(size: 15, weight: .heavy, design: .rounded))
                        .foregroundStyle(Color(red: 0.02, green: 0.37, blue: 0.58))
                        .lineLimit(1)
                        .minimumScaleFactor(0.70)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 84)
        } else {
            HStack(spacing: 16) {
                cinemaHeaderAircraftFallback(isHelicopter: false)
                    .frame(width: 170, height: 79)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text("LE CIEL EN DIRECT")
                        .font(.system(size: 27, weight: .black, design: .rounded))
                    Text("Recherche du prochain aéronef…")
                        .font(.system(size: 19, weight: .medium))
                }
                .foregroundStyle(Color(red: 0.08, green: 0.34, blue: 0.50))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func cinemaHeaderAircraftFallback(isHelicopter: Bool) -> some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.73, green: 0.92, blue: 1.0),
                         Color(red: 0.25, green: 0.66, blue: 0.88)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: isHelicopter ? "helicopter" : "airplane")
                .font(.system(size: 57, weight: .semibold))
                .foregroundStyle(.white)
                .shadow(color: .blue.opacity(0.25), radius: 8)
        }
    }

    private func cinemaHeaderLogoFallback(isHelicopter: Bool) -> some View {
        Image(systemName: isHelicopter ? "helicopter" : "airplane")
            .resizable()
            .scaledToFit()
            .foregroundStyle(Color(red: 0.02, green: 0.52, blue: 0.76))
            .padding(17)
    }

    private var cinemaMap: some View {
        ZStack(alignment: .topLeading) {
            AircraftMapView(
                aircraft: service.aircraft,
                center: service.center,
                trails: service.trails,
                selectedID: featuredAircraft?.id,
                profiles: trafficProfiles,
                routes: trafficRoutes
            )
            .overlay(alignment: .bottomTrailing) {
                if let aircraft = featuredAircraft, let rank = followedRank {
                    HStack(spacing: 9) {
                        Text(String(rank))
                            .foregroundStyle(rank == 1
                                ? Color(red: 0.12, green: 0.20, blue: 0.34) : .white)
                            .font(.system(size: 23, weight: .black))
                            .frame(width: 42, height: 42)
                            .background(followedRankColor, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text("AVION SUIVI SUR LA CARTE")
                                .font(.system(size: 14, weight: .black))
                                .tracking(1)
                            Text(aircraft.displayName)
                                .font(.system(size: 22, weight: .heavy, design: .rounded))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        .foregroundStyle(Color(red: 0.07, green: 0.28, blue: 0.45))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(Color.white.opacity(0.96), in: RoundedRectangle(cornerRadius: 17))
                    .overlay(RoundedRectangle(cornerRadius: 17)
                        .stroke(followedRankColor, lineWidth: 2.5))
                    .shadow(color: followedRankColor.opacity(0.3), radius: 13)
                    .padding(19)
                }
            }

            HStack(spacing: 12) {
                Image(systemName: "sparkle")
                    .font(.system(size: 20, weight: .heavy))
                    .foregroundStyle(Color(red: 0.05, green: 0.65, blue: 0.87))
                Text("50 KM")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color(red: 0.14, green: 0.46, blue: 0.62))
            }
            .foregroundStyle(Color(red: 0.04, green: 0.29, blue: 0.46))
            .padding(.horizontal, 19)
            .padding(.vertical, 15)
            .background(Color.white.opacity(0.97), in: RoundedRectangle(cornerRadius: 18))
            .padding(23)


        }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26)
            .stroke(Color.white, lineWidth: 5))
        .shadow(color: Color(red: 0.23, green: 0.46, blue: 0.69).opacity(0.22),
                radius: 22, y: 7)
    }

    @ViewBuilder
    private var cinemaDestination: some View {
        // L'escale reste un spectacle même sans avion ou destination connue.
        // Le trafic non identifié continue d'être visible sur le radar.
        if featuredEnrichment?.arrivalAirport == nil
            || featuredEnrichment?.routeConfidence == "unavailable" {
            cinemaHomeWeather
        } else {
            cinemaFlightDestination
        }
    }

    // Statut discret au-dessus de la météo : le panneau reste identique,
    // seul le message change en fonction du trafic effectivement reçu.
    private var homeTrafficStatus: (icon: String, message: String) {
        guard radarIsLive else {
            return ("antenna.radiowaves.left.and.right", "RADAR EN ATTENTE DE DONNÉES")
        }
        if service.aircraft.isEmpty {
            return ("checkmark.circle.fill", "AUCUN AVION DANS LA ZONE")
        }
        return (
            "airplane",
            service.aircraft.count == 1
                ? "AVION DÉTECTÉ · DESTINATION NON IDENTIFIÉE"
                : "\(service.aircraft.count) AVIONS DÉTECTÉS · DESTINATION NON IDENTIFIÉE"
        )
    }

    private var cinemaHomeWeather: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                if let photo = homeScene.currentPhoto,
                   let url = URL(string: photo.url) {
                    CinematicDestinationImage(
                        url: url,
                        fallback: AnyView(homeScenicFallback)
                    )
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .clipped()
                    .id(photo.id)
                    .transition(.opacity)
                } else {
                    homeScenicFallback
                        .frame(width: geometry.size.width, height: geometry.size.height)
                }

                LinearGradient(
                    stops: [
                        .init(color: Color(red: 0.01, green: 0.13, blue: 0.25).opacity(0.30), location: 0),
                        .init(color: .clear, location: 0.28),
                        .init(color: Color(red: 0.01, green: 0.10, blue: 0.22).opacity(0.94), location: 0.69),
                        .init(color: Color(red: 0.01, green: 0.10, blue: 0.22).opacity(0.98), location: 1)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                VStack(alignment: .leading, spacing: 11) {
                    HStack {
                        Label("✦  ESCALE IMMERSIVE", systemImage: "sun.horizon.fill")
                            .font(.system(size: 22, weight: .black))
                            .tracking(1.1)
                        Spacer()
                        Text("MÉTÉO LOCALE")
                            .font(.system(size: 17, weight: .heavy))
                            .tracking(1.6)
                            .padding(.horizontal, 13)
                            .padding(.vertical, 7)
                            .background(.white.opacity(0.22), in: Capsule())
                    }

                    Spacer(minLength: 8)

                    Text("Bâgé-Dommartin")
                        .font(.system(size: 53, weight: .black, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.62)
                        .shadow(color: .black.opacity(0.45), radius: 9)

                    // Un message informatif seulement, jamais un bouton.
                    // Conserver la météo et le diaporama, avec ou sans avion.
                    HStack(spacing: 12) {
                        Image(systemName: homeTrafficStatus.icon)
                            .font(.system(size: 22, weight: .black))
                            .foregroundStyle(Color(red: 0.89, green: 0.96, blue: 1.0))
                        Text(homeTrafficStatus.message)
                            .font(.system(size: 21, weight: .heavy, design: .rounded))
                            .tracking(0.25)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                    }
                    .padding(.horizontal, 15)
                    .padding(.vertical, 12)
                    .background(
                        Color(red: 0.04, green: 0.23, blue: 0.38).opacity(0.84),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.white.opacity(0.42), lineWidth: 1)
                    )

                    if let weather = homeScene.weather {
                        HStack(alignment: .center, spacing: 16) {
                            Image(systemName: weather.symbolName)
                                .symbolRenderingMode(.hierarchical)
                                .font(.system(size: 58, weight: .regular))
                                .foregroundStyle(Color(red: 0.95, green: 0.82, blue: 0.41))
                            Text(weather.temperatureLabel)
                                .font(.system(size: 83, weight: .black, design: .rounded))
                                .monospacedDigit()
                                .minimumScaleFactor(0.72)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(weather.conditionLabel)
                                    .font(.system(size: 25, weight: .heavy))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.68)
                                Text(weather.minMaxLabel)
                                    .font(.system(size: 19, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.86))
                            }
                        }
                        HStack(spacing: 10) {
                            localWeatherMetric("VENT", value: weather.windLabel, icon: "wind")
                            localWeatherMetric("HUMIDITÉ", value: weather.humidityLabel, icon: "humidity.fill")
                            localWeatherMetric("PRESSION", value: weather.pressureLabel, icon: "barometer")
                        }
                        .padding(.top, 10)
                    } else {
                        Text("Météo en cours de chargement…")
                            .font(.system(size: 25, weight: .bold))
                        Text("Les observations locales s'affichent automatiquement.")
                            .font(.system(size: 19))
                            .foregroundStyle(.white.opacity(0.78))
                    }

                    HStack(spacing: 6) {
                        if let photo = homeScene.currentPhoto {
                            Text(photo.caption + " · " + photo.author)
                                .lineLimit(1)
                        } else {
                            Text("Paysages de Bâgé-Dommartin")
                        }
                        Spacer(minLength: 6)
                        Text("Météo : Open-Meteo · Photos : Wikimedia Commons")
                            .lineLimit(1)
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.69))
                    .padding(.top, 4)
                }
                .padding(26)
                .foregroundStyle(.white)
            }
        }
        .background(Color(red: 0.09, green: 0.38, blue: 0.57))
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 26)
                .stroke(Color.white, lineWidth: 4)
        }
        .shadow(color: .cyan.opacity(0.25), radius: 25, y: 6)
    }

    private var homeScenicFallback: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(
                    colors: [
                        Color(red: 0.51, green: 0.83, blue: 0.97),
                        Color(red: 0.16, green: 0.57, blue: 0.76),
                        Color(red: 0.15, green: 0.41, blue: 0.45)
                    ], startPoint: .topLeading, endPoint: .bottomTrailing
                )
                Image(systemName: "house.lodge.fill")
                    .font(.system(size: 195, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.36))
                    .position(x: geometry.size.width * 0.60, y: geometry.size.height * 0.37)
            }
        }
    }

    private func localWeatherMetric(_ label: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 7) {
                Image(systemName: icon)
                Text(label)
            }
            .font(.system(size: 15, weight: .heavy))
            .tracking(0.9)
            .foregroundStyle(Color(red: 0.72, green: 0.94, blue: 1.0))
            Text(value)
                .font(.system(size: 23, weight: .black, design: .rounded))
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color(red: 0.03, green: 0.19, blue: 0.31).opacity(0.78),
            in: RoundedRectangle(cornerRadius: 15, style: .continuous)
        )
    }

    private var cinemaFlightDestination: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                cinemaMedia
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .clipped()
                    .id(mediaService.current?.id ?? "cinema-fallback")
                    .transition(.opacity)
                    .animation(.easeInOut(duration: 1.0), value: mediaService.current?.id)
                SkyShowGlimmers()
                    .allowsHitTesting(false)

                LinearGradient(
                    colors: [.clear, .black.opacity(0.04), Color(red: 0.01, green: 0.10, blue: 0.25).opacity(0.96)],
                    startPoint: .top,
                    endPoint: .bottom
                )

                VStack(alignment: .leading, spacing: 9) {
                    HStack(spacing: 11) {
                        Image(systemName: "play.rectangle.fill")
                            .font(.system(size: 28, weight: .bold))
                        Text("✦  ESCALE IMMERSIVE")
                            .font(.system(size: 23, weight: .black))
                            .tracking(1.8)
                        Spacer()
                        if let media = mediaService.current {
                            Text(media.sceneLabel)
                                .font(.system(size: 15, weight: .black))
                                .tracking(0.6)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Color.black.opacity(0.50), in: Capsule())
                        }
                        if isOverheadPass {
                            Text("PASSAGE PROCHE")
                                .font(.system(size: 19, weight: .heavy))
                                .padding(.horizontal, 15)
                                .padding(.vertical, 8)
                                .background(Color(red: 0.03, green: 0.58, blue: 0.89),
                                            in: Capsule())
                        }
                    }
                    Spacer()
                    Text(featuredEnrichment?.arrivalAirport?.city ?? "Prochaine escale…")
                        .font(.system(size: 65, weight: .black, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.56)
                        .shadow(color: .black.opacity(0.40), radius: 8)
                    Text(cinemaRouteLabel)
                        .font(.system(size: 27, weight: .bold, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .foregroundStyle(Color(red: 0.81, green: 0.95, blue: 1.0))

                    // Deux observations METAR sous l'image / vidéo immersive.
                    // Elles ne sont pas remplacées par un trafic prioritaire.
                    HStack(alignment: .top, spacing: 12) {
                        cinemaAirportWeatherTile(
                            title: "DÉPART",
                            airport: featuredEnrichment?.departureAirport
                        )
                        cinemaAirportWeatherTile(
                            title: "ARRIVÉE",
                            airport: featuredEnrichment?.arrivalAirport
                        )
                    }
                    .padding(.top, 14)

                    if featuredEnrichment?.arrivalAirport == nil {
                        Text("Les images de la prochaine ville apparaîtront automatiquement")
                            .font(.system(size: 20, weight: .medium))
                            .lineLimit(2)
                    }
                }
                .padding(29)
                .foregroundStyle(.white)
            }
        }
        .background(Color(red: 0.05, green: 0.25, blue: 0.54))
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26)
            .stroke(Color.white, lineWidth: 4))
        .shadow(color: .cyan.opacity(0.25), radius: 25, y: 6)
    }


    // Météo aéroportuaire utilisée en mode Escale normale.
    // Elle cède sa place à la fiche opérationnelle lors d'une alerte.
    private func cinemaAirportWeatherTile(title: String, airport: TVAirport?) -> some View {
        let weather = airportWeather.weather(for: airport)
        let name = airport?.city ?? "Non identifié"
        let code = airport?.code ?? "—"

        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 7) {
                Image(systemName: weather?.symbolName ?? "cloud")
                    .font(.system(size: 23, weight: .bold))
                    .foregroundStyle(Color(red: 0.67, green: 0.93, blue: 1.0))
                Text(title + "  ·  " + code)
                    .font(.system(size: 18, weight: .black))
                    .tracking(1)
                    .foregroundStyle(Color(red: 0.67, green: 0.93, blue: 1.0))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(weather?.temperatureLabel ?? "—")
                    .font(.system(size: 28, weight: .black, design: .rounded))
                    .monospacedDigit()
            }
            Text(name)
                .font(.system(size: 21, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(weather?.windLabel ?? "Vent indisponible")
                .font(.system(size: 17, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            HStack(spacing: 10) {
                Text(weather?.visibilityLabel ?? "VIS. —")
                Spacer(minLength: 0)
                Text(weather?.observationLabel ?? "Obs. indisponible")
            }
            .font(.system(size: 14, weight: .bold))
            .lineLimit(1)
            .minimumScaleFactor(0.73)
            .foregroundStyle(.white.opacity(0.8))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 13)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color(red: 0.02, green: 0.15, blue: 0.30).opacity(0.78),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.35), lineWidth: 1)
        )
    }

    // Photo réellement rattachée à l'appareil si disponible, jamais inventée.
    private func cinemaPrioritySpotlight(_ aircraft: Aircraft) -> some View {
        let enrichment = service.enrichment(for: aircraft)
        let profile = service.trafficProfile(for: aircraft)
        let alertTint: Color
        switch profile.kind {
        case .civilSecurity: alertTint = Color(red: 1.0, green: 0.70, blue: 0.18)
        case .military: alertTint = Color(red: 1.0, green: 0.29, blue: 0.35)
        case .medical: alertTint = Color(red: 0.12, green: 0.88, blue: 0.55)
        default: alertTint = Color(red: 0.11, green: 0.80, blue: 0.96)
        }
        let aircraftName = enrichment?.aircraftModel
            ?? enrichment?.aircraftType
            ?? aircraft.description
            ?? aircraft.aircraftType
            ?? "TYPE EN COURS D'IDENTIFICATION"

        return GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                if let photoURL = enrichment?.photoURL,
                   enrichment?.photo.kind != "generic" {
                    AsyncImage(url: photoURL) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else {
                            priorityPhotoPlaceholder(isHelicopter: profile.isRotorcraft, color: alertTint)
                        }
                    }
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .clipped()
                } else {
                    priorityPhotoPlaceholder(isHelicopter: profile.isRotorcraft, color: alertTint)
                }

                LinearGradient(
                    colors: [.black.opacity(0.08), .black.opacity(0.30),
                             Color(red: 0.05, green: 0.09, blue: 0.20).opacity(0.97)],
                    startPoint: .top, endPoint: .bottom
                )
                SkyShowGlimmers()
                    .allowsHitTesting(false)

                VStack(alignment: .leading, spacing: 13) {
                    HStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 30, weight: .black))
                        Text(profile.kind == .military
                             ? "✦  MOYEN MILITAIRE DÉTECTÉ"
                             : "✦  SÉCURITÉ CIVILE DÉTECTÉE")
                            .font(.system(size: 22, weight: .black, design: .rounded))
                            .tracking(1.3)
                        Spacer(minLength: 0)
                        Image(systemName: profile.isRotorcraft ? "helicopter" : "airplane")
                            .font(.system(size: 32, weight: .heavy))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 13)
                    .background(alertTint.opacity(0.85), in: RoundedRectangle(cornerRadius: 15))
                    .modifier(CinemaAlertPulse(isEnabled: true))

                    Spacer()

                    Text(profile.isRotorcraft ? "HÉLICOPTÈRE · \(profile.label)" : profile.label)
                        .font(.system(size: 28, weight: .black, design: .rounded))
                        .tracking(3)
                        .foregroundStyle(alertTint)
                        .shadow(color: .black, radius: 6)

                    Text(aircraftName)
                        .font(.system(size: 54, weight: .black, design: .rounded))
                        .lineLimit(2)
                        .minimumScaleFactor(0.62)
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.6), radius: 8)

                    if let operatorName = enrichment?.operatorName ?? aircraft.operatorName,
                       !operatorName.isEmpty {
                        Text(operatorName)
                            .font(.system(size: 24, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.70)
                            .foregroundStyle(.white.opacity(0.88))
                    }

                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(aircraft.displayName)
                            if let registration = enrichment?.registration ?? aircraft.registration,
                               !registration.isEmpty,
                               registration != aircraft.displayName {
                                Text(registration)
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.82))
                            }
                        }
                            .font(.system(size: 28, weight: .bold))
                            .lineLimit(1)
                        Spacer(minLength: 5)
                        Text(String(format: "%.1f", aircraft.distanceKilometers(from: service.center))
                             + " KM")
                            .font(.system(size: 42, weight: .black, design: .rounded))
                            .monospacedDigit()
                    }
                    .foregroundStyle(.white)

                    HStack(spacing: 20) {
                        Label(aircraft.altitudeLabel, systemImage: "mountain.2.fill")
                        Label(aircraft.speedLabel, systemImage: "speedometer")
                        Label(aircraft.headingLabel, systemImage: "location.north.fill")
                    }
                    .font(.system(size: 21, weight: .bold))
                    .foregroundStyle(.white.opacity(0.83))
                }
                .padding(30)
            }
        }
        .background(Color(red: 0.10, green: 0.13, blue: 0.22))
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(alertTint, lineWidth: 4)
        }
        .shadow(color: alertTint.opacity(0.55), radius: 25)
    }

    private func priorityPhotoPlaceholder(isHelicopter: Bool, color: Color) -> some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(
                    colors: [Color(red: 0.12, green: 0.21, blue: 0.42),
                             color.opacity(0.68),
                             Color(red: 0.08, green: 0.14, blue: 0.29)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
                Image(systemName: isHelicopter ? "helicopter" : "airplane")
                    .font(.system(size: 170, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.58))
                    .rotationEffect(.degrees(-12))
                    .shadow(color: color.opacity(0.8), radius: 30)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
    }

    private var cinemaRouteLabel: String {
        guard let info = featuredEnrichment,
              let arrival = info.arrivalAirport else { return "LE MONDE DÉFILE AU-DESSUS DE NOUS" }
        let start = info.departureAirport?.city ?? info.departureAirport?.code ?? "EN VOL"
        return "\(start.uppercased())  →  \(arrival.code)"
    }

    @ViewBuilder
    private var cinemaMedia: some View {
        if let videoURL = mediaService.current?.televisionVideoURL,
           !failedVideoURLs.contains(videoURL.absoluteString) {
            LoopingVideoView(url: videoURL, onStall: {
                failedVideoURLs.insert(videoURL.absoluteString)
                Task { await mediaService.advance() }
            })
        } else if let media = mediaService.current,
                  !media.isVideo,
                  let url = media.mediaURL {
            CinematicDestinationImage(url: url, fallback: AnyView(destinationFallback))
        } else if let still = mediaService.items.first(where: { !$0.isVideo && $0.mediaURL != nil }),
                  let url = still.mediaURL {
            CinematicDestinationImage(url: url, fallback: AnyView(destinationFallback))
        } else {
            destinationFallback
        }
    }

    private var cinemaFeatured: some View {
        HStack(spacing: 24) {
            if let aircraft = featuredAircraft {
                Image(systemName: featuredProfile?.isRotorcraft == true ? "helicopter" : "airplane")
                    .font(.system(size: 70, weight: .black))
                    .foregroundStyle(trafficColor(featuredProfile?.kind))
                    .frame(width: 87)

                VStack(alignment: .leading, spacing: 7) {
                    Text(featuredProfile?.label ?? "TRAFIC AÉRIEN")
                        .font(.system(size: 19, weight: .black))
                        .tracking(1.1)
                        .foregroundStyle(Color(red: 0.25, green: 0.50, blue: 0.67))
                        .lineLimit(1)
                    Text(aircraft.displayName)
                        .font(.system(size: 51, weight: .black, design: .rounded))
                        .foregroundStyle(Color(red: 0.03, green: 0.22, blue: 0.40))
                        .lineLimit(1)
                        .minimumScaleFactor(0.58)
                    Text(featuredTitle(aircraft))
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(Color(red: 0.35, green: 0.48, blue: 0.57))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 9) {
                    Text(distanceText(aircraft))
                        .font(.system(size: 42, weight: .black, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Color(red: 0.0, green: 0.53, blue: 0.77))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(aircraft.altitudeLabel + "   •   " + aircraft.speedLabel)
                        .font(.system(size: 21, weight: .bold))
                        .foregroundStyle(Color(red: 0.28, green: 0.48, blue: 0.59))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
            } else {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.system(size: 55, weight: .bold))
                    .foregroundStyle(.cyan)
                VStack(alignment: .leading, spacing: 9) {
                    Text("RADAR EN ÉCOUTE")
                        .font(.system(size: 37, weight: .black))
                        .foregroundStyle(Color(red: 0.05, green: 0.25, blue: 0.47))
                    Text("Le prochain avion s’affichera automatiquement")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(Color(red: 0.29, green: 0.49, blue: 0.61))
                }
                Spacer()
            }
        }
        .padding(.horizontal, 27)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24)
            .stroke(Color(red: 0.71, green: 0.87, blue: 0.96), lineWidth: 2))
        .shadow(color: Color(red: 0.35, green: 0.56, blue: 0.69).opacity(0.17),
                radius: 12, y: 4)
    }

    // Les 2e et 3e aéronefs les plus proches se partagent le bas gauche.
    // La destination et les deux METAR restent dans la colonne droite.
    private var cinemaTwoClosest: some View {
        GeometryReader { geometry in
            let aircraft = Array(service.aircraft.dropFirst().prefix(2))
            let gap: CGFloat = 15
            let width = max(0, (geometry.size.width - gap) / 2)

            HStack(alignment: .bottom, spacing: gap) {
                podiumPosition(aircraft, index: 0, rank: 2, hero: false)
                    .frame(width: width, height: geometry.size.height)
                podiumPosition(aircraft, index: 1, rank: 3, hero: false)
                    .frame(width: width, height: geometry.size.height)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .animation(.easeInOut(duration: 0.55), value: aircraft.first?.id)
        }
    }

    @ViewBuilder
    private func podiumPosition(
        _ aircraft: [Aircraft], index: Int, rank: Int, hero: Bool
    ) -> some View {
        if aircraft.indices.contains(index) {
            let item = aircraft[index]
            ApproachPodiumCard(
                aircraft: item,
                enrichment: service.enrichment(for: item),
                profile: service.trafficProfile(for: item),
                home: service.center,
                rank: rank,
                isHero: hero,
                departureWeather: airportWeather.weather(for: service.enrichment(for: item)?.departureAirport),
                arrivalWeather: airportWeather.weather(for: service.enrichment(for: item)?.arrivalAirport)
            )
            .id(item.id)
        } else {
            PodiumWaitingCard(rank: rank, isHero: hero)
        }
    }

    // Toujours montrer l'état des moyens spéciaux : jamais « Ligne commerciale »
    // à cet emplacement, même lorsque le vol vedette est un avion de ligne.
    private var cinemaPriorityStatus: some View {
        let counts = specialCounts
        let active = priorityFocusAircraft != nil
        return HStack(spacing: 11) {
            Image(systemName: priorityProfile?.isRotorcraft == true ? "helicopter" : "cross.case.fill")
                .font(.system(size: 29, weight: .heavy))
                .frame(width: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text("MOYENS PRIORITAIRES · ALERTE DISTINCTE")
                    .font(.system(size: 14, weight: .black))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(active && priorityAircraft != nil
                     ? (priorityProfile?.label ?? "MOYEN") + " · " + priorityAircraft!.displayName + " · " + distanceText(priorityAircraft!)
                     : radarIsLive ? "Aucun moyen prioritaire identifié" : "Données radar non actualisées")
                    .font(.system(size: 15, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("SÉCURITÉ CIVILE " + String(counts.civil) + " · ARMÉE " + String(counts.military))
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Image(systemName: active ? "dot.radiowaves.left.and.right" : "checkmark.shield.fill")
                .font(.system(size: 23, weight: .bold))
        }
        .padding(.horizontal, 13)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .foregroundStyle(active ? .white : Color(red: 0.08, green: 0.37, blue: 0.55))
        .background(
            LinearGradient(
                colors: active ? [Color(red: 0.90, green: 0.35, blue: 0.10), Color(red: 0.32, green: 0.19, blue: 0.30)]
                  : [.white, Color(red: 0.87, green: 0.96, blue: 1.0)],
                startPoint: .leading, endPoint: .trailing
            ),
            in: RoundedRectangle(cornerRadius: 20, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 20)
            .stroke(active ? Color.orange : Color.cyan.opacity(0.35), lineWidth: 2))
        .modifier(CinemaAlertPulse(isEnabled: active))
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
                Text(radarStatus)
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
                value: "\(service.specialAircraftInZone.count)",
                label: "moyens spéciaux",
                color: service.specialAircraftInZone.isEmpty ? .green : .orange
            )

            HStack(spacing: 11) {
                Image(systemName: "music.note")
                    .font(.title3.bold())
                    .foregroundStyle(.cyan)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Électro-pop solaire ✦")
                        .font(.headline.bold())
                        .foregroundStyle(.white)
                    Text("Lounge aérien · dynamique douce")
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
                profiles: trafficProfiles,
                routes: trafficRoutes
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
                LoopingVideoView(url: url, onStall: {
                    Task { await mediaService.advance() }
                })
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
            return "MOYEN SPÉCIAL · " + profile.label
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

// Flux d'actualités aéronautiques : ce sont des TITRES DE PRESSE,
// jamais des alertes de transpondeur inventées. Aucune interaction.
@MainActor
private final class AviationTickerService: ObservableObject {
    struct Article: Decodable, Identifiable {
        let title: String
        let source: String
        let date: String

        var id: String { title + "|" + date }

        var dateLabel: String {
            guard let date = ISO8601DateFormatter().date(from: self.date) else {
                return "Date indisponible"
            }
            return date.formatted(.dateTime.day().month(.abbreviated).hour().minute())
        }
    }

    private struct Payload: Decodable {
        let news: [Article]
    }

    @Published private(set) var news: [Article] = []
    @Published private(set) var updatedAt: Date?

    func refresh() async {
        guard let url = URL(string: "https://xavpac-ty3i.vercel.app/api/aviation-news") else {
            return
        }

        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 14
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let response = response as? HTTPURLResponse,
                  (200..<300).contains(response.statusCode) else {
                return
            }
            let result = try JSONDecoder().decode(Payload.self, from: data)
            news = Array(result.news.prefix(8))
            updatedAt = Date()
        } catch {
            // Le diaporama, la carte et le radar ne dépendent pas des actualités.
        }
    }
}

// Lumières d'ambiance tvOS : peu d'éléments, aucune interaction, visibles au vidéoprojecteur.
private struct SkyShowBackdrop: View {
    @State private var drift = false

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(
                    colors: [
                        Color(red: 0.82, green: 0.95, blue: 1.00),
                        Color(red: 0.98, green: 0.995, blue: 1.0),
                        Color(red: 0.90, green: 0.96, blue: 1.0)
                    ],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )

                Circle()
                    .fill(Color(red: 0.15, green: 0.80, blue: 0.98).opacity(0.23))
                    .frame(width: geometry.size.width * 0.65)
                    .blur(radius: 110)
                    .offset(x: drift ? -140 : 140, y: -geometry.size.height * 0.30)

                Circle()
                    .fill(Color(red: 1.0, green: 0.71, blue: 0.32).opacity(0.18))
                    .frame(width: geometry.size.width * 0.45)
                    .blur(radius: 95)
                    .offset(x: drift ? 190 : -150, y: geometry.size.height * 0.30)

                Circle()
                    .stroke(Color.white.opacity(0.54), lineWidth: 2)
                    .frame(width: geometry.size.width * 0.72)
                    .offset(x: geometry.size.width * 0.43,
                            y: geometry.size.height * 0.49)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .onAppear {
                withAnimation(.easeInOut(duration: 12).repeatForever(autoreverses: true)) {
                    drift = true
                }
            }
        }
    }
}

private struct SkyShowGlimmers: View {
    @State private var shimmering = false

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Image(systemName: "sparkle")
                    .font(.system(size: 48, weight: .ultraLight))
                    .position(x: geometry.size.width * 0.84, y: geometry.size.height * 0.16)
                Image(systemName: "sparkle")
                    .font(.system(size: 27, weight: .ultraLight))
                    .position(x: geometry.size.width * 0.68, y: geometry.size.height * 0.25)
                Image(systemName: "sparkle")
                    .font(.system(size: 19, weight: .ultraLight))
                    .position(x: geometry.size.width * 0.91, y: geometry.size.height * 0.38)
            }
            .foregroundStyle(Color.white.opacity(shimmering ? 0.78 : 0.22))
            .shadow(color: .white.opacity(0.55), radius: shimmering ? 15 : 2)
            .scaleEffect(shimmering ? 1.04 : 0.98)
            .onAppear {
                withAnimation(.easeInOut(duration: 2.8).repeatForever(autoreverses: true)) {
                    shimmering = true
                }
            }
        }
    }
}

private struct CinemaAlertPulse: ViewModifier {
    var isEnabled = true
    @State private var glowing = false

    func body(content: Content) -> some View {
        content
            .opacity(isEnabled ? (glowing ? 1.0 : 0.74) : 1.0)
            .scaleEffect(isEnabled ? (glowing ? 1.0 : 0.985) : 1.0)
            .onAppear {
                if isEnabled {
                    withAnimation(.easeInOut(duration: 0.65).repeatForever(autoreverses: true)) {
                        glowing = true
                    }
                }
            }
            .onChange(of: isEnabled) { enabled in
                if enabled {
                    glowing = false
                    withAnimation(.easeInOut(duration: 0.65).repeatForever(autoreverses: true)) {
                        glowing = true
                    }
                } else {
                    glowing = false
                }
            }
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

    func prepareAlertsOnly() {
        guard !configured else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
            engine.attach(player)
            engine.attach(alertPlayer)
            guard let format = AVAudioFormat(
                standardFormatWithSampleRate: 44_100, channels: 2
            ) else { return }
            audioFormat = format
            engine.connect(player, to: engine.mainMixerNode, format: format)
            engine.connect(alertPlayer, to: engine.mainMixerNode, format: format)
            buffer = makeAmbientBuffer(format: format)
            configured = true
            try engine.start()
        } catch {
            print("XavPac TV : signal sonore d'alerte indisponible : \(error)")
        }
    }

    func start() {
        guard !player.isPlaying else { return }
        prepareAlertsOnly()
        guard configured, let buffer else { return }
        player.scheduleBuffer(buffer, at: nil, options: .loops)
        engine.mainMixerNode.outputVolume = 0.62
        player.volume = 0.24
        player.play()
    }

    func stop() {
        player.stop()
        alertPlayer.stop()
        engine.pause()
        try? AVAudioSession.sharedInstance().setActive(false)
    }

    func disableAmbientButKeepAlerts() {
        // La piste externe prend le relais, mais les alertes restent actives.
        player.stop()
    }

    func playPriorityAlert() {
        playAlert(emergency: false)
    }

    func playEmergencyAlert() {
        // Son d’urgence distinct ; aucune bande-son en arrière-plan.
        playAlert(emergency: true)
    }

    private func playAlert(emergency: Bool) {
        if !configured {
            prepareAlertsOnly()
        }

        guard let format = audioFormat,
              let alertBuffer = makePriorityAlertBuffer(format: format, emergency: emergency) else {
            return
        }

        do {
            if !engine.isRunning {
                try engine.start()
            }
            alertPlayer.stop()
            alertPlayer.scheduleBuffer(alertBuffer, at: nil, options: [])
            alertPlayer.volume = emergency ? 0.54 : 0.42
            alertPlayer.play()
        } catch {
            // L'alerte visuelle reste active même si la sortie audio est indisponible.
        }
    }

    private func makePriorityAlertBuffer(format: AVAudioFormat, emergency: Bool) -> AVAudioPCMBuffer? {
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
            let frequency = emergency
                ? (firstTone ? 700.0 : 525.0)
                : (firstTone ? 880.0 : 1_175.0)
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

    private func makeAmbientBuffer(format: AVAudioFormat) -> AVAudioPCMBuffer? {
        // Ambiance électro-pop originale, solaire et entraînante : 116 BPM.
        // Huit mesures bouclées sans piste externe et sans compte Apple Music.
        let sampleRate = format.sampleRate
        let twoPi = Double.pi * 2
        let beatDuration = 60.0 / 116.0
        let barDuration = beatDuration * 4.0
        let loopDuration = barDuration * 8.0
        let frameCount = AVAudioFrameCount((sampleRate * loopDuration).rounded())

        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return nil
        }
        buffer.frameLength = frameCount
        guard let channels = buffer.floatChannelData else { return nil }

        // Accords majeurs sans la longue coloration mélancolique précédente.
        let chords: [[Double]] = [
            [130.81, 164.81, 196.00, 246.94, 293.66], // Cmaj9
            [174.61, 220.00, 261.63, 329.63, 392.00], // Fmaj9
            [196.00, 246.94, 293.66, 329.63, 440.00], // G6/9
            [130.81, 164.81, 196.00, 261.63, 329.63]  // Cmaj9
        ]
        let melodySteps = [0, 2, 4, 2, 1, 3, 4, 3]
        let chordDuration = barDuration * 2.0

        for frame in 0..<Int(frameCount) {
            let time = Double(frame) / sampleRate
            let chordIndex = min(3, Int(time / chordDuration))
            let chord = chords[chordIndex]
            let chordTime = time.truncatingRemainder(dividingBy: chordDuration)
            let chordFade = max(0.0, min(1.0, chordTime / 0.16, (chordDuration - chordTime) / 0.16))

            // Nappe discrète, basse rebondissante et pulsation douce.
            let pad = (
                sin(twoPi * chord[1] * time) * 0.105
                + sin(twoPi * chord[2] * time) * 0.075
                + sin(twoPi * chord[3] * time) * 0.052
            ) * chordFade

            let beatPhase = time.truncatingRemainder(dividingBy: beatDuration)
            let beatIndex = Int(time / beatDuration) % 4
            let halfBeat = beatDuration / 2.0
            let halfPhase = time.truncatingRemainder(dividingBy: halfBeat)
            let bass = sin(twoPi * chord[0] * 0.5 * time) * exp(-beatPhase * 5.5) * 0.26
            let kick = sin(twoPi * (61.0 + 22.0 * exp(-beatPhase * 22)) * time)
                * exp(-beatPhase * 20) * 0.22

            // Chapeau et claquement doux sur les temps 2 et 4.
            let noise = sin(Double(frame) * 12.9898) * sin(Double(frame) * 78.233)
            let clap = beatIndex % 2 == 1
                ? noise * exp(-beatPhase * 26) * 0.15 : 0.0
            let hiHat = noise * exp(-halfPhase * 46) * 0.072

            // Notes scintillantes sur les contretemps.
            let melodyStep = Int(time / halfBeat) % melodySteps.count
            let note = chord[melodySteps[melodyStep]] * 4.0
            let sparkle = (
                sin(twoPi * note * time) * 0.15
                + sin(twoPi * note * 2.0 * time) * 0.035
            ) * exp(-halfPhase * 11.0)

            // Transition douce à chaque répétition du morceau.
            let loopFade = max(0.0, min(1.0, time / 0.045, (loopDuration - time) / 0.045))
            let mix = (pad + bass + kick + clap + hiHat + sparkle) * 0.36 * loopFade
            channels[0][frame] = Float(mix)
            channels[1][frame] = Float(mix * (0.95 + 0.05 * sin(twoPi * time / 11)))
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
    let onStall: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> PlayerLayerHostView {
        let view = PlayerLayerHostView()
        view.backgroundColor = .black
        view.playerLayer.videoGravity = .resizeAspectFill
        view.playerLayer.player = context.coordinator.player
        context.coordinator.play(url, onStall: onStall)
        return view
    }

    func updateUIView(_ view: PlayerLayerHostView, context: Context) {
        view.playerLayer.player = context.coordinator.player
        context.coordinator.play(url, onStall: onStall)
    }

    static func dismantleUIView(_ view: PlayerLayerHostView, coordinator: Coordinator) {
        coordinator.generation += 1
        coordinator.currentURL = nil
        coordinator.player.pause()
        coordinator.player.removeAllItems()
        coordinator.looper = nil
        view.playerLayer.player = nil
    }

    final class Coordinator {
        let player = AVQueuePlayer()
        var looper: AVPlayerLooper?
        var currentURL: URL?
        var generation = 0
        private var observedSecond = 0.0
        private var stalledTicks = 0

        init() {
            player.isMuted = true
            player.actionAtItemEnd = .none
        }

        func play(_ url: URL, onStall: @escaping () -> Void) {
            guard currentURL != url else {
                if player.timeControlStatus != .playing {
                    player.play()
                }
                return
            }

            currentURL = url
            generation += 1
            observedSecond = 0
            stalledTicks = 0
            let token = generation
            player.pause()
            player.removeAllItems()

            let item = AVPlayerItem(url: url)
            looper = AVPlayerLooper(player: player, templateItem: item)
            player.play()
            monitorPlayback(url, token: token, onStall: onStall)
        }

        private func monitorPlayback(_ url: URL, token: Int, onStall: @escaping () -> Void) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
                guard let self, self.generation == token,
                      self.currentURL == url else { return }
                let seconds = self.player.currentTime().seconds
                if seconds.isFinite && seconds > self.observedSecond + 0.1 {
                    self.observedSecond = seconds
                    self.stalledTicks = 0
                } else {
                    self.stalledTicks += 1
                }
                if self.stalledTicks >= 2 {
                    self.generation += 1
                    onStall()
                } else {
                    self.monitorPlayback(url, token: token, onStall: onStall)
                }
            }
        }
    }
}


// Données locales pour la scène de repos du grand panneau « Escale immersive ».
// Aucun temps, aucune photographie d'une autre commune n'est inventé.
private struct HomeScenePayload: Decodable {
    let weather: HomeSceneWeather?
    let photos: [HomeScenePhoto]
}

private struct HomeScenePhoto: Decodable, Identifiable {
    let id: String
    let url: String
    let caption: String
    let author: String
    let license: String
    let source: String
}

private struct HomeSceneWeather: Decodable {
    let observedAt: String?
    let temperature: Double
    let feelsLike: Double?
    let humidity: Double?
    let weatherCode: Int?
    let isDay: Bool
    let windSpeed: Double?
    let windDirection: Double?
    let windGusts: Double?
    let pressure: Double?
    let cloudCover: Double?
    let high: Double?
    let low: Double?
    let rainChance: Double?

    var temperatureLabel: String { "\(Int(temperature.rounded()))°" }
    var humidityLabel: String {
        humidity.map { "\(Int($0.rounded())) %" } ?? "—"
    }
    var pressureLabel: String {
        pressure.map { "\(Int($0.rounded())) hPa" } ?? "—"
    }
    var minMaxLabel: String {
        guard let high, let low else { return "Prévisions indisponibles" }
        return "Max \(Int(high.rounded()))°  ·  Min \(Int(low.rounded()))°"
    }
    var windLabel: String {
        guard let windSpeed else { return "Vent indisponible" }
        return WindFrenchFormatter.label(
            speedKmh: windSpeed, directionDegrees: windDirection
        )
    }
    var conditionLabel: String {
        guard let weatherCode else { return "Conditions indisponibles" }
        switch weatherCode {
        case 0: return "Ciel dégagé"
        case 1, 2: return "Quelques nuages"
        case 3: return "Nuageux"
        case 45, 48: return "Brouillard"
        case 51...57: return "Bruine"
        case 61...67: return "Pluie"
        case 71...77: return "Neige"
        case 80...82: return "Averses"
        case 85, 86: return "Averses de neige"
        case 95...99: return "Orages"
        default: return "Météo locale"
        }
    }
    var symbolName: String {
        guard let weatherCode else { return "cloud.sun.fill" }
        switch weatherCode {
        case 0: return isDay ? "sun.max.fill" : "moon.stars.fill"
        case 1, 2: return isDay ? "cloud.sun.fill" : "cloud.moon.fill"
        case 3: return "cloud.fill"
        case 45, 48: return "cloud.fog.fill"
        case 51...67, 80...82: return "cloud.rain.fill"
        case 71...77, 85, 86: return "cloud.snow.fill"
        case 95...99: return "cloud.bolt.rain.fill"
        default: return "cloud.sun.fill"
        }
    }
}

@MainActor
private final class HomeSceneService: ObservableObject {
    @Published private(set) var weather: HomeSceneWeather?
    @Published private(set) var photos: [HomeScenePhoto] = []
    @Published private(set) var photoIndex = 0

    var currentPhoto: HomeScenePhoto? {
        guard photos.indices.contains(photoIndex) else { return nil }
        return photos[photoIndex]
    }

    func advancePhoto() {
        guard photos.count > 1 else { return }
        photoIndex = (photoIndex + 1) % photos.count
    }

    func refresh() async {
        guard let url = URL(
            string: "\(xavPacBaseURL.absoluteString)/api/tv/home-scene"
        ) else { return }

        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 24
            request.setValue("XavPacTV/4.0", forHTTPHeaderField: "User-Agent")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode) else { return }
            let payload = try JSONDecoder().decode(HomeScenePayload.self, from: data)
            if let newWeather = payload.weather {
                weather = newWeather
            }
            if !payload.photos.isEmpty {
                photos = payload.photos
                photoIndex = min(photoIndex, payload.photos.count - 1)
            }
        } catch {
            // Conserver la dernière météo valable ; ne jamais afficher une valeur inventée.
        }
    }
}
