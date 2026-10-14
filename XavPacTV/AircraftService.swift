import CoreLocation
import Foundation

@MainActor
final class AircraftService: ObservableObject {
    @Published private(set) var aircraft: [Aircraft] = []
    @Published private(set) var center = CLLocationCoordinate2D(latitude: 46.346, longitude: 4.977)
    @Published private(set) var source = "XavPac"
    @Published private(set) var updatedAt: Date?
    @Published private(set) var errorMessage: String?

    private var refreshTask: Task<Void, Never>?

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

    func refresh() async {
        guard let url = URL(string: "https://xavpac-one.vercel.app/api/aircraft?radius=50") else {
            errorMessage = "Adresse XavPac invalide."
            return
        }

        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.timeoutInterval = 12
            request.setValue("XavPacTV/1.0", forHTTPHeaderField: "User-Agent")

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

            aircraft = payload.aircraft
                .filter { !$0.onGround.orFalse }
                .sorted { lhs, rhs in
                    lhs.distanceKilometers(from: center) < rhs.distanceKilometers(from: center)
                }

            source = payload.source ?? "XavPac"
            updatedAt = ISO8601DateFormatter().date(from: payload.fetchedAt ?? "") ?? Date()
            errorMessage = nil
        } catch {
            errorMessage = "Trafic momentanément indisponible — dernière situation conservée."
        }
    }
}

private extension Optional where Wrapped == Bool {
    var orFalse: Bool { self ?? false }
}
