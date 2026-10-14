import Combine
import CoreLocation
import Foundation

@MainActor
final class AircraftService: ObservableObject {
    @Published private(set) var aircraft: [Aircraft] = []
    @Published private(set) var center = CLLocationCoordinate2D(latitude: 46.346, longitude: 4.977)
    @Published private(set) var source = "XavPac"
    @Published private(set) var updatedAt: Date?
    @Published private(set) var errorMessage: String?
    @Published private(set) var enrichedByID: [String: TVAircraftEnrichment] = [:]
    @Published private(set) var trails: [String: [CLLocationCoordinate2D]] = [:]

    private var refreshTask: Task<Void, Never>?
    private var lastEnrichmentAt: Date?
    private var lastEnrichmentSignature = ""

    deinit {
        refreshTask?.cancel()
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
        let priority = aircraft
            .filter { item in
                item.distanceKilometers(from: center) <= 40
                    && trafficProfile(for: item).isPriorityTraffic
            }
            .sorted { lhs, rhs in
                let leftProfile = trafficProfile(for: lhs)
                let rightProfile = trafficProfile(for: rhs)

                if leftProfile.priorityTier != rightProfile.priorityTier {
                    return leftProfile.priorityTier < rightProfile.priorityTier
                }

                return lhs.distanceKilometers(from: center)
                    < rhs.distanceKilometers(from: center)
            }

        return priority.first ?? aircraft.first
    }

    var displayAircraft: [Aircraft] {
        aircraft.sorted { lhs, rhs in
            let leftDistance = lhs.distanceKilometers(from: center)
            let rightDistance = rhs.distanceKilometers(from: center)
            let leftProfile = trafficProfile(for: lhs)
            let rightProfile = trafficProfile(for: rhs)

            let leftPriority = leftDistance <= 40 && leftProfile.isPriorityTraffic
            let rightPriority = rightDistance <= 40 && rightProfile.isPriorityTraffic

            if leftPriority != rightPriority {
                return leftPriority && !rightPriority
            }

            if leftPriority && rightPriority && leftProfile.priorityTier != rightProfile.priorityTier {
                return leftProfile.priorityTier < rightProfile.priorityTier
            }

            return leftDistance < rightDistance
        }
    }

    var priorityAircraftWithin40: [Aircraft] {
        displayAircraft.filter { item in
            item.distanceKilometers(from: center) <= 40
                && trafficProfile(for: item).isPriorityTraffic
        }
    }

    func refresh() async {
        guard let url = URL(string: "https://xavpac-one.vercel.app/api/aircraft?radius=50") else {
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

            if let responseCenter = payload.center {
                center = CLLocationCoordinate2D(
                    latitude: responseCenter.latitude,
                    longitude: responseCenter.longitude
                )
            }

            let sorted = payload.aircraft
                .filter { !$0.onGround.orFalse }
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
                    item.distanceKilometers(from: center) <= 40
                        && item.trafficProfile(enrichment: nil).isPriorityTraffic
                }
            let candidates = rawPriority + sorted
            var seen = Set<String>()
            let enrichmentTargets = candidates.filter { seen.insert($0.id).inserted }.prefix(25)
            let top = Array(enrichmentTargets)

            let signature = top.map(\.id).joined(separator: ":")
            let enrichmentExpired = lastEnrichmentAt.map { Date().timeIntervalSince($0) > 30 } ?? true
            if enrichmentExpired || signature != lastEnrichmentSignature {
                await refreshEnrichment(for: top)
                lastEnrichmentAt = Date()
                lastEnrichmentSignature = signature
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
                let moved = abs(last.latitude - coordinate.latitude) > 0.00008
                    || abs(last.longitude - coordinate.longitude) > 0.00008
                if moved {
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
              let url = URL(string: "https://xavpac-one.vercel.app/api/aviation/enriched-aircraft") else {
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
        guard var components = URLComponents(string: "https://xavpac-one.vercel.app/api/tv/destination-media") else {
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
            let unseen = payload.items.filter { !seen.contains($0.id) }.shuffled()
            let fallback = payload.items.shuffled()
            let chosen = unseen.isEmpty ? fallback : unseen

            self.city = payload.city
            self.provider = payload.provider
            self.items = chosen
            self.currentIndex = 0
        } catch {
            // En cas de panne média, la carte et le trafic restent pleinement disponibles.
        }
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
