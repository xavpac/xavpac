import CoreLocation
import Foundation

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
        guard let altitude = barometricAltitude ?? geometricAltitude else { return "Altitude —" }
        return "\(Int(altitude.rounded()).formatted()) m"
    }

    var speedLabel: String {
        guard let velocity else { return "Vitesse —" }
        return "\(Int((velocity * 3.6).rounded())) km/h"
    }

    var headingLabel: String {
        guard let trueTrack else { return "Cap —" }
        return "Cap \(Int(trueTrack.rounded()))°"
    }
}
