import CoreLocation
import Foundation

let xavPacBaseURL = URL(string: "https://xavpac-one.vercel.app")!

func xavPacAssetURL(_ value: String?) -> URL? {
    guard let value, !value.isEmpty else { return nil }
    if let absolute = URL(string: value), absolute.scheme != nil {
        return absolute
    }
    let clean = value.hasPrefix("/") ? String(value.dropFirst()) : value
    return xavPacBaseURL.appendingPathComponent(clean)
}

struct AircraftPayload: Decodable {
    struct Center: Decodable {
        let latitude: Double
        let longitude: Double
        let radiusKm: Double?
    }

    let source: String?
    let fetchedAt: String?
    let center: Center?
    let aircraft: [Aircraft]
}

struct Aircraft: Decodable, Identifiable, Hashable {
    let id: String
    let callsign: String
    let country: String?
    let longitude: Double
    let latitude: Double
    let barometricAltitude: Double?
    let geometricAltitude: Double?
    let onGround: Bool?
    let velocity: Double?
    let trueTrack: Double?
    let verticalRate: Double?
    let squawk: String?
    let registration: String?
    let aircraftType: String?
    let description: String?
    let operatorName: String?
    let category: String?
    let feedSource: String?
    let lastPositionAt: String?
    let positionAgeSeconds: Double?

    enum CodingKeys: String, CodingKey {
        case id, callsign, country, longitude, latitude
        case barometricAltitude, geometricAltitude, onGround, velocity, trueTrack
        case verticalRate, squawk, registration, aircraftType, description
        case operatorName = "operator"
        case category, feedSource, lastPositionAt, positionAgeSeconds
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var displayName: String {
        let trimmed = callsign.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? (registration ?? id.uppercased()) : trimmed
    }

    var subtitle: String {
        [registration, aircraftType, operatorName]
            .compactMap { value in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
            .prefix(2)
            .joined(separator: " · ")
    }

    func distanceKilometers(from center: CLLocationCoordinate2D) -> Double {
        let from = CLLocation(latitude: center.latitude, longitude: center.longitude)
        let to = CLLocation(latitude: latitude, longitude: longitude)
        return from.distance(from: to) / 1_000
    }

    var altitudeLabel: String {
        guard let altitude = barometricAltitude ?? geometricAltitude else { return "—" }
        return "\(Int(altitude.rounded()).formatted()) m"
    }

    var speedLabel: String {
        guard let velocity else { return "—" }
        return "\(Int((velocity * 3.6).rounded())) km/h"
    }

    var headingLabel: String {
        guard let trueTrack else { return "—" }
        return "\(Int(trueTrack.rounded()))°"
    }
}

struct TVAirport: Decodable, Hashable {
    let name: String?
    let municipality: String?
    let iata: String?
    let icao: String?
    let latitude: Double?
    let longitude: Double?

    var code: String {
        iata ?? icao ?? "—"
    }

    var city: String {
        municipality ?? name ?? code
    }
}

struct TVAircraftPhoto: Decodable, Hashable {
    let url: String
    let kind: String
    let label: String
    let source: String
    let photographer: String?
}

struct TVAircraftEnrichment: Decodable, Hashable {
    let modeS: String
    let registration: String?
    let rawCallsign: String?
    let operatorName: String?
    let aircraftType: String?
    let aircraftModel: String?
    let departureAirport: TVAirport?
    let arrivalAirport: TVAirport?
    let routeLabel: String?
    let routeSource: String?
    let routeConfidence: String
    let photo: TVAircraftPhoto
    let logo: String

    enum CodingKeys: String, CodingKey {
        case modeS, registration, rawCallsign
        case operatorName = "operator"
        case aircraftType, aircraftModel
        case departureAirport, arrivalAirport
        case routeLabel, routeSource, routeConfidence
        case photo, logo
    }

    var photoURL: URL? {
        xavPacAssetURL(photo.url)
    }

    var logoURL: URL? {
        xavPacAssetURL(logo)
    }

    var destinationLabel: String {
        arrivalAirport?.city ?? arrivalAirport?.code ?? "Destination inconnue"
    }
}

struct TVAircraftEnrichmentPayload: Decodable {
    let ok: Bool
    let enriched: [TVAircraftEnrichment]
}

struct DestinationMediaPayload: Decodable {
    let ok: Bool
    let provider: String
    let city: String
    let country: String?
    let items: [DestinationMedia]
}

struct DestinationMedia: Decodable, Identifiable, Hashable {
    let id: String
    let type: String
    let url: String
    let preview: String?
    let author: String?
    let sourceName: String
    let sourceURL: String?

    enum CodingKeys: String, CodingKey {
        case id, type, url, preview, author, sourceName
        case sourceURL = "sourceUrl"
    }

    var mediaURL: URL? { URL(string: url) }
    var previewURL: URL? { preview.flatMap(URL.init(string:)) }
    var isVideo: Bool { type == "video" }
}
