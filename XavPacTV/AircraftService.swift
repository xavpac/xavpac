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

    var featuredAircraft: Aircraft? {
        // La destination garde sa place ; une alerte opérationnelle apparaît
        // indépendamment dans sa propre carte à droite.
        // Privilégier le vol qui passe près de HOME
        // et dont la ville d'arrivée est réellement identifiée.
        let closeIdentifiedFlight = aircraft
            .filter { item in
                item.distanceKilometers(from: center) <= 12
                    && enrichment(for: item)?.arrivalAirport != nil
                    && enrichment(for: item)?.routeConfidence != "unavailable"
            }
            .min { left, right in
                left.distanceKilometers(from: center) < right.distanceKilometers(from: center)
            }
        return closeIdentifiedFlight ?? aircraft.first
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
        // Seules la Sécurité civile et l'Armée sont prioritaires.
        displayAircraft.filter { item in
            let category = trafficProfile(for: item).kind
            return item.distanceKilometers(from: center) <= 50
                && (category == .civilSecurity || category == .military)
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
            return
        }

        let key = "\(airport.code)|\(airport.city)"
        if key == destinationKey, !items.isEmpty {
            return
        }

        destinationKey = key
        cycle = 0
        await fetch(city: airport.city, iata: airport.iata ?? airport.icao)
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
        let parts = destinationKey.split(separator: "|", maxSplits: 1).map(String.init)
        let code = parts.first
        let city = parts.count > 1 ? parts[1] : self.city
        await fetch(city: city, iata: code)
    }

    private func fetch(city: String, iata: String?) async {
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
            let chosen = unseen.isEmpty ? available : unseen

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
        let videos = candidates.filter { $0.isVideo && $0.televisionVideoURL != nil }
        let photos = candidates.filter { !$0.isVideo && $0.mediaURL != nil }
        var sequence: [DestinationMedia] = []
        var videoIndex = 0
        var photoIndex = 0

        while videoIndex < videos.count || photoIndex < photos.count {
            if videoIndex < videos.count {
                sequence.append(videos[videoIndex])
                videoIndex += 1
            }
            for _ in 0..<2 where photoIndex < photos.count {
                sequence.append(photos[photoIndex])
                photoIndex += 1
            }
        }
        return sequence
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


 
// Température observée (METAR) : aucune météo inventée si la station ne répond pas.
struct TVAirportWeather: Decodable {
    struct CloudLayer: Decodable { let cover: String? }
    let icaoId: String?
    let temp: Double?
    let wxString: String?
    let clouds: [CloudLayer]?
    let fltCat: String?

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
        return "sun.max.fill"
    }

    var conditionLabel: String {
        let weather = (wxString ?? "").uppercased()
        if weather.contains("TS") { return "Orage" }
        if weather.contains("SN") { return "Neige" }
        if weather.contains("RA") || weather.contains("DZ") { return "Pluie" }
        let covers = (clouds ?? []).compactMap(\.cover).map { $0.uppercased() }
        if covers.contains("OVC") || covers.contains("BKN") { return "Nuageux" }
        if covers.contains("SCT") || covers.contains("FEW") { return "Éclaircies" }
        return "Ciel dégagé"
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
