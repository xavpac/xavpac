import Combine
import CoreLocation
import Foundation

@MainActor
final class AircraftService: ObservableObject {
    @Published private(set) var aircraft: [Aircraft] = []
    @Published private(set) var center = CLLocationCoordinate2D(latitude: 46.345497, longitude: 4.976824)
    @Published private(set) var source = "XavPac"
    @Published private(set) var updatedAt: Date?
    @Published private(set) var errorMessage: String?
    @Published private(set) var enrichedByID: [String: TVAircraftEnrichment] = [:]
    @Published private(set) var trails: [String: [CLLocationCoordinate2D]] = [:]

    private var refreshTask: Task<Void, Never>?
    private var enrichmentTask: Task<Void, Never>?
    private var lastEnrichmentAt: Date?
    private var lastEnrichmentSignature = ""

    deinit {
        refreshTask?.cancel()
        enrichmentTask?.cancel()
    }

    func start() {
        guard refreshTask == nil else { return }

        refreshTask = Task { [weak self] in
            guard let self else { return }
            await self.refresh()

            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                if Task.isCancelled { break }
                await self.refresh()
            }
        }
    }

    func stop() {
        refreshTask?.cancel()
        refreshTask = nil
        enrichmentTask?.cancel()
        enrichmentTask = nil
    }

    func enrichment(for aircraft: Aircraft?) -> TVAircraftEnrichment? {
        guard let aircraft else { return nil }
        return enrichedByID[aircraft.id.lowercased()]
            ?? enrichedByID[aircraft.id.uppercased()]
    }

    func trafficProfile(for aircraft: Aircraft) -> TVTrafficProfile {
        aircraft.trafficProfile(enrichment: enrichment(for: aircraft))
    }

    // La scène immersive n'affiche Bâgé-Dommartin que si aucun des trois
    // aéronefs les plus proches ne possède une destination exploitable.
    var featuredAircraft: Aircraft? {
        let podium = Array(aircraft.prefix(3))
        let identifiable = podium.filter { item in
            guard let info = enrichment(for: item),
                  info.routeConfidence != "unavailable",
                  let destination = info.arrivalAirport else {
                return false
            }
            return destination.iata != nil || destination.icao != nil
                || destination.municipality != nil || destination.name != nil
        }
        return identifiable.first ?? podium.first
    }

    var displayAircraft: [Aircraft] {
        aircraft.sorted { lhs, rhs in
            let leftDistance = lhs.distanceKilometers(from: center)
            let rightDistance = rhs.distanceKilometers(from: center)
            let leftProfile = trafficProfile(for: lhs)
            let rightProfile = trafficProfile(for: rhs)

            let leftPriority = leftDistance <= 50 && leftProfile.isPriorityTraffic
            let rightPriority = rightDistance <= 50 && rightProfile.isPriorityTraffic

            if leftPriority != rightPriority {
                return leftPriority && !rightPriority
            }

            if leftPriority && rightPriority && leftProfile.priorityTier != rightProfile.priorityTier {
                return leftProfile.priorityTier < rightProfile.priorityTier
            }

            return leftDistance < rightDistance
        }
    }

    var specialAircraftInZone: [Aircraft] {
        // Le trafic prioritaire n'est affirmé que quand l'identification est suffisante.
        // Cela inclut les moyens médicaux identifiés, mais pas les hélicoptères civils.
        displayAircraft.filter { item in
            return item.distanceKilometers(from: center) <= 50
                && !item.onGround.orFalse
                && (item.positionAgeSeconds ?? 0) < 90
                && trafficProfile(for: item).isPriorityTraffic
        }
    }

    func refresh() async {
        guard let url = URL(string: "\(xavPacBaseURL.absoluteString)/api/aircraft?lat=46.345497&lon=4.976824&radius=50") else {
            errorMessage = "Adresse XavPac invalide."
            return
        }

        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 12
            request.setValue("XavPacTV/4.0", forHTTPHeaderField: "User-Agent")

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw URLError(.badServerResponse)
            }

            let payload = try JSONDecoder().decode(AircraftPayload.self, from: data)

            // HOME est un point géographique fixe : ne jamais utiliser le centre
            // de recherche renvoyé par une API ou un ancien serveur.
            // Sinon, la maison peut apparaître vers Mâcon au lieu de Bâgé-Dommartin.

            let sorted = payload.aircraft
                .filter { !$0.onGround.orFalse }
                .filter { $0.positionAgeSeconds.map { $0 <= 120 } ?? true }
                .filter { $0.distanceKilometers(from: center) <= 50 }
                .sorted { lhs, rhs in
                    lhs.distanceKilometers(from: center) < rhs.distanceKilometers(from: center)
                }

            aircraft = sorted
            updateTrails(with: sorted)
            source = payload.source ?? "XavPac"
            updatedAt = ISO8601DateFormatter().date(from: payload.fetchedAt ?? "") ?? Date()
            errorMessage = nil

            let rawPriority = sorted
                .filter { item in
                    item.distanceKilometers(from: center) <= 50
                        && item.trafficProfile(enrichment: nil).isPriorityTraffic
                }
            let candidates = rawPriority + sorted
            var seen = Set<String>()
            let enrichmentTargets = candidates.filter { seen.insert($0.id).inserted }.prefix(25)
            let top = Array(enrichmentTargets)

            let signature = top.map(\.id).joined(separator: ":")
            let enrichmentExpired = lastEnrichmentAt.map { Date().timeIntervalSince($0) > 30 } ?? true
            if enrichmentExpired || signature != lastEnrichmentSignature {
                // L'API d'enrichissement peut prendre plusieurs secondes.
                // Ne jamais retarder le cycle radar de 8 secondes pour des photos.
                enrichmentTask?.cancel()
                lastEnrichmentAt = Date()
                lastEnrichmentSignature = signature
                enrichmentTask = Task { [weak self] in
                    await self?.refreshEnrichment(for: top)
                }
            }
        } catch {
            errorMessage = "Trafic momentanément indisponible — dernière situation conservée."
        }
    }

    private func updateTrails(with aircraft: [Aircraft]) {
        let visibleIDs = Set(aircraft.prefix(50).map(\.id))
        var next = trails.filter { visibleIDs.contains($0.key) }

        for item in aircraft.prefix(50) {
            var points = next[item.id] ?? []
            let coordinate = item.coordinate

            if let last = points.last {
                let previous = CLLocation(latitude: last.latitude, longitude: last.longitude)
                let latest = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
                let separation = previous.distance(from: latest)
                // Reject ADS-B teleports: keep only consecutive plausible
                // positions; an implausible jump starts a new trail.
                if separation > 8_000 {
                    points = [coordinate]
                } else if separation > 12 {
                    points.append(coordinate)
                }
            } else {
                points.append(coordinate)
            }

            if points.count > 90 {
                points.removeFirst(points.count - 90)
            }
            next[item.id] = points
        }

        trails = next
    }

    private func refreshEnrichment(for aircraft: [Aircraft]) async {
        let valid = aircraft.filter {
            $0.id.range(of: "^[A-Fa-f0-9]{6}$", options: .regularExpression) != nil
                || !($0.registration ?? "").isEmpty
        }
        guard !valid.isEmpty,
              let url = URL(string: "\(xavPacBaseURL.absoluteString)/api/aviation/enriched-aircraft") else {
            return
        }

        let items: [[String: Any?]] = valid.map { item in
            [
                "modeS": item.id,
                "registration": item.registration,
                "callsign": item.callsign,
                "operator": item.operatorName,
                "aircraftType": item.aircraftType,
                "description": item.description,
                "category": item.category,
                "positionSource": item.feedSource,
                "distanceKm": item.distanceKilometers(from: center)
            ]
        }

        let cleanItems = items.map { dictionary in
            dictionary.compactMapValues { $0 }
        }

        do {
            let body: [String: Any] = [
                "aircraft": cleanItems,
                "selectedModeS": valid.first?.id as Any
            ]
            let data = try JSONSerialization.data(withJSONObject: body)

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.httpBody = data
            request.timeoutInterval = 18
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("XavPacTV/4.0", forHTTPHeaderField: "User-Agent")

            let (responseData, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return
            }

            let payload = try JSONDecoder().decode(TVAircraftEnrichmentPayload.self, from: responseData)
            var next = enrichedByID
            for item in payload.enriched {
                next[item.modeS.lowercased()] = item
                next[item.modeS.uppercased()] = item
            }
            enrichedByID = next
        } catch {
            // L'enrichissement est un plus visuel : le radar reste fonctionnel sans lui.
        }
    }
}

@MainActor
final class DestinationMediaService: ObservableObject {
    @Published private(set) var items: [DestinationMedia] = []
    @Published private(set) var currentIndex = 0
    @Published private(set) var city = ""
    @Published private(set) var provider = ""
    @Published private(set) var isLoading = false

    private var destinationKey = ""
    private var cycle = 0
    private var destinationICAO: String?

    var current: DestinationMedia? {
        guard items.indices.contains(currentIndex) else { return nil }
        return items[currentIndex]
    }

    func load(for enrichment: TVAircraftEnrichment?) async {
        guard let airport = enrichment?.arrivalAirport else {
            items = []
            currentIndex = 0
            city = ""
            provider = ""
            destinationKey = ""
            destinationICAO = nil
            return
        }

        let key = "\(airport.code)|\(airport.city)|\(airport.name ?? "")"
        if key == destinationKey, !items.isEmpty {
            return
        }

        destinationKey = key
        destinationICAO = airport.icao
        cycle = 0
        await fetch(city: airport.city, iata: airport.iata ?? airport.icao, icao: airport.icao, airportName: airport.name)
    }

    func preferVideo() {
        guard !items.isEmpty,
              let videoIndex = items.firstIndex(where: { $0.televisionVideoURL != nil }) else {
            return
        }

        currentIndex = videoIndex
    }

    func advance() async {
        guard !items.isEmpty else { return }
        remember(items[currentIndex].id)

        if currentIndex + 1 < items.count {
            currentIndex += 1
            return
        }

        cycle += 1
        let parts = destinationKey.split(separator: "|", maxSplits: 2, omittingEmptySubsequences: false).map(String.init)
        let code = parts.first
        let city = parts.count > 1 ? parts[1] : self.city
        let airportName = parts.count > 2 ? parts[2] : nil
        await fetch(city: city, iata: code, icao: destinationICAO, airportName: airportName)
    }

    private func fetch(city: String, iata: String?, icao: String?, airportName: String?) async {
        guard var components = URLComponents(string: "\(xavPacBaseURL.absoluteString)/api/tv/destination-media") else {
            return
        }

        var queryItems = [
            URLQueryItem(name: "city", value: city),
            URLQueryItem(name: "cycle", value: String(cycle))
        ]
        if let iata, !iata.isEmpty {
            queryItems.append(URLQueryItem(name: "iata", value: iata))
        }
        if let airportName, !airportName.isEmpty {
            queryItems.append(URLQueryItem(name: "airport", value: airportName))
        }
        if let icao, !icao.isEmpty {
            queryItems.append(URLQueryItem(name: "icao", value: icao))
        }
        components.queryItems = queryItems

        guard let url = components.url else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 15
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("XavPacTV/4.0", forHTTPHeaderField: "User-Agent")

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return
            }

            let payload = try JSONDecoder().decode(DestinationMediaPayload.self, from: data)
            let seen = seenIDs(for: city)
            let available = payload.items.filter { item in
                if item.isVideo { return item.televisionVideoURL != nil }
                return item.mediaURL != nil
            }
            let unseen = available.filter { !seen.contains($0.id) }
            // Même si toutes les vidéos sont déjà vues, elles restent candidates
            // pour le prochain passage proche : pas d’animation bloquée sur les photos.
            let playedVideos = available.filter { $0.isVideo && seen.contains($0.id) }
            let chosen = unseen.isEmpty ? available : unseen + playedVideos

            self.city = payload.city
            self.provider = payload.provider
            // Un film, puis deux clichés : chaque escale devient un vrai
            // diaporama vidéo/photo et non une image répétée.
            self.items = cinematicSequence(chosen)
            self.currentIndex = 0
        } catch {
            // En cas de panne média, la carte et le trafic restent pleinement disponibles.
        }
    }

    private func cinematicSequence(_ candidates: [DestinationMedia]) -> [DestinationMedia] {
        // Séquence autonome : ville → aéroport → ville → approche → ambiance.
        // Les catégories non disponibles sont simplement sautées.
        let program: [(scene: String, video: Bool)] = [
            ("city", true), ("airport", false), ("city", false),
            ("approach", true), ("ambience", false), ("airport", true),
            ("city", false), ("airport", false), ("ambience", true),
            ("ambience", false)
        ]
        var remaining = candidates
        var result: [DestinationMedia] = []
        var step = 0

        while !remaining.isEmpty && result.count < 48 {
            let target = program[step % program.count]
            var index = remaining.firstIndex {
                ($0.scene ?? "city") == target.scene && $0.isVideo == target.video
            }
            if index == nil {
                let previous = result.last
                index = remaining.firstIndex {
                    $0.isVideo != previous?.isVideo && $0.scene != previous?.scene
                }
            }
            if index == nil {
                index = remaining.firstIndex { $0.isVideo != result.last?.isVideo }
            }
            let chosenIndex = index ?? 0
            result.append(remaining.remove(at: chosenIndex))
            step += 1
        }
        return result
    }

    private func seenKey(for city: String) -> String {
        "xavpac.tv.seenMedia.\(city.lowercased())"
    }

    private func seenIDs(for city: String) -> Set<String> {
        let values = UserDefaults.standard.stringArray(forKey: seenKey(for: city)) ?? []
        return Set(values)
    }

    private func remember(_ id: String) {
        guard !city.isEmpty else { return }
        let key = seenKey(for: city)
        var values = UserDefaults.standard.stringArray(forKey: key) ?? []
        values.removeAll(where: { $0 == id })
        values.append(id)
        if values.count > 240 {
            values.removeFirst(values.count - 240)
        }
        UserDefaults.standard.set(values, forKey: key)
    }
}

private extension Optional where Wrapped == Bool {
    var orFalse: Bool { self ?? false }
}


 
// Direction D'OÙ vient le vent, avec le nom français et la vitesse en km/h.
// Les vitesses des observations aéroportuaires sont converties de kt en km/h.
enum WindFrenchFormatter {
    static func label(speedKmh: Double, directionDegrees: Double?) -> String {
        guard speedKmh.isFinite, speedKmh >= 0 else { return "Vent indisponible" }
        let speed = Int(speedKmh.rounded())
        if speed == 0 { return "Vent calme · 0 km/h" }
        guard let degrees = directionDegrees, degrees.isFinite else {
            return "Vent variable · \(speed) km/h"
        }
        let names = [
            "Nord", "Nord-est", "Est", "Sud-est",
            "Sud", "Sud-ouest", "Ouest", "Nord-ouest"
        ]
        let bearing = degrees.truncatingRemainder(dividingBy: 360)
        let index = Int(((bearing + 360).truncatingRemainder(dividingBy: 360) + 22.5) / 45) % 8
        return names[index] + " · \(speed) km/h"
    }
}

// Température observée (METAR) : aucune météo inventée si la station ne répond pas.
private struct METARReading: Decodable {
    let raw: String
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let text = try? container.decode(String.self) {
            raw = text
        } else if let number = try? container.decode(Double.self) {
            raw = String(format: "%g", number)
        } else {
            raw = "—"
        }
    }
}

struct TVAirportWeather: Decodable {
    struct CloudLayer: Decodable { let cover: String? }
    let icaoId: String?
    let temp: Double?
    let wxString: String?
    let clouds: [CloudLayer]?
    let fltCat: String?
    private let wdir: METARReading?
    private let wspd: METARReading?
    private let visib: METARReading?
    private let reportTime: String?
    private let obsTime: METARReading?

    var windLabel: String {
        guard let knotsText = wspd?.raw,
              let knots = Double(knotsText), knots.isFinite, knots >= 0 else {
            return "Vent indisponible"
        }
        let kmh = knots * 1.852
        let rawDirection = wdir?.raw.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard let degrees = Double(rawDirection), degrees.isFinite else {
            return WindFrenchFormatter.label(speedKmh: kmh, directionDegrees: nil)
        }
        return WindFrenchFormatter.label(speedKmh: kmh, directionDegrees: degrees)
    }

    var visibilityLabel: String {
        guard let visibility = visib?.raw, visibility != "—" else { return "VIS. —" }
        // AWC METAR encodes visib in statute miles.
        return "VIS. \(visibility) SM"
    }

    var observationLabel: String {
        var observation: Date?
        if let reportTime {
            observation = ISO8601DateFormatter().date(from: reportTime)
        }
        if observation == nil, let epoch = obsTime?.raw, let seconds = Double(epoch) {
            observation = Date(timeIntervalSince1970: seconds)
        }
        guard let observation else { return "Obs. indisponible" }
        let text = observation.formatted(date: .omitted, time: .shortened)
        return "Obs. \(text)"
    }

    var temperatureLabel: String {
        guard let temp, temp.isFinite else { return "—" }
        return "\(Int(temp.rounded()))°"
    }

    var symbolName: String {
        let weather = (wxString ?? "").uppercased()
        if weather.contains("TS") { return "cloud.bolt.rain.fill" }
        if weather.contains("SN") { return "cloud.snow.fill" }
        if weather.contains("RA") || weather.contains("DZ") { return "cloud.rain.fill" }
        let covers = (clouds ?? []).compactMap(\.cover).map { $0.uppercased() }
        if covers.contains("OVC") || covers.contains("BKN") { return "cloud.fill" }
        if covers.contains("SCT") || covers.contains("FEW") { return "cloud.sun.fill" }
        if covers.contains("SKC") || covers.contains("CLR") || covers.contains("NSC") { return "sun.max.fill" }
        return "cloud"
    }

    var conditionLabel: String {
        let weather = (wxString ?? "").uppercased()
        if weather.contains("TS") { return "Orage" }
        if weather.contains("SN") { return "Neige" }
        if weather.contains("RA") || weather.contains("DZ") { return "Pluie" }
        let covers = (clouds ?? []).compactMap(\.cover).map { $0.uppercased() }
        if covers.contains("OVC") || covers.contains("BKN") { return "Nuageux" }
        if covers.contains("SCT") || covers.contains("FEW") { return "Éclaircies" }
        if covers.contains("SKC") || covers.contains("CLR") || covers.contains("NSC") { return "Ciel dégagé" }
        return "Conditions non précisées"
    }
}

private struct TVAirportWeatherResponse: Decodable {
    let metar: [TVAirportWeather]
}

@MainActor
final class AirportWeatherService: ObservableObject {
    @Published private(set) var observations: [String: TVAirportWeather] = [:]
    private var lastSignature = ""
    private var lastAttempt: Date?

    func weather(for airport: TVAirport?) -> TVAirportWeather? {
        guard let code = airport?.icao?.uppercased() else { return nil }
        return observations[code]
    }

    func refresh(for airports: [TVAirport]) async {
        let ids = Array(Set(airports.compactMap { airport -> String? in
            guard let icao = airport.icao?.uppercased(),
                  icao.range(of: "^[A-Z0-9]{4}$", options: .regularExpression) != nil else { return nil }
            return icao
        })).sorted().prefix(6)

        guard !ids.isEmpty else { return }
        let signature = ids.joined(separator: ",")
        if signature == lastSignature,
           let lastAttempt,
           Date().timeIntervalSince(lastAttempt) < 900 { return }
        lastSignature = signature
        lastAttempt = Date()

        guard var url = URLComponents(
            url: xavPacBaseURL.appendingPathComponent("api/airport-weather"),
            resolvingAgainstBaseURL: false
        ) else { return }
        url.queryItems = [URLQueryItem(name: "ids", value: signature)]
        guard let requestURL = url.url else { return }

        do {
            var request = URLRequest(url: requestURL)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 14
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode) else { return }
            let payload = try JSONDecoder().decode(TVAirportWeatherResponse.self, from: data)
            observations.merge(Dictionary(uniqueKeysWithValues: payload.metar.compactMap { item in
                guard let id = item.icaoId?.uppercased() else { return nil }
                return (id, item)
            })) { _, new in new }
        } catch {
            // Les relevés météo restent facultatifs et ne bloquent jamais le radar.
        }
    }
}
