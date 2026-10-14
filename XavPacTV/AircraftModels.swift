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
    let aircraftCategory: String?
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
        case aircraftType, aircraftModel, aircraftCategory
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


enum TVTrafficKind: String, Hashable {
    case civilSecurity
    case medical
    case military
    case surveillance
    case helicopter
    case drone
    case glider
    case balloon
    case ultralight
    case lightPrivate
    case specialized
    case airline
    case unknown

    var label: String {
        switch self {
        case .civilSecurity: return "SÉCURITÉ CIVILE"
        case .medical: return "SECOURS / MÉDICAL"
        case .military: return "MILITAIRE"
        case .surveillance: return "SURVEILLANCE"
        case .helicopter: return "HÉLICOPTÈRE"
        case .drone: return "DRONE"
        case .glider: return "PLANEUR"
        case .balloon: return "AÉROSTAT"
        case .ultralight: return "ULM"
        case .lightPrivate: return "PRIVÉ / LÉGER"
        case .specialized: return "AÉRONEF SPÉCIAL"
        case .airline: return "VOL DE LIGNE"
        case .unknown: return "AÉRONEF"
        }
    }

    var symbolName: String {
        switch self {
        case .helicopter, .medical, .civilSecurity:
            return "helicopter"
        case .drone:
            return "paperplane.fill"
        case .balloon:
            return "balloon.2.fill"
        case .military, .surveillance:
            return "airplane"
        case .glider, .ultralight, .lightPrivate, .specialized, .airline, .unknown:
            return "airplane"
        }
    }

    var priorityTier: Int {
        switch self {
        case .civilSecurity, .military:
            return 0
        case .medical, .surveillance, .helicopter, .drone,
             .glider, .balloon, .ultralight, .lightPrivate,
             .specialized, .airline, .unknown:
            return 9
        }
    }

    var isPriorityTraffic: Bool {
        self == .civilSecurity || self == .military
    }
}

struct TVTrafficProfile: Hashable {
    let kind: TVTrafficKind
    let label: String
    let symbolName: String
    let priorityTier: Int
    let relativeIconScale: Double

    var isPriorityTraffic: Bool { kind.isPriorityTraffic }
}

extension Aircraft {
    func trafficProfile(enrichment: TVAircraftEnrichment?) -> TVTrafficProfile {
        let joined = [
            callsign,
            registration,
            aircraftType,
            description,
            operatorName,
            category,
            enrichment?.aircraftType,
            enrichment?.aircraftModel,
            enrichment?.aircraftCategory,
            enrichment?.operatorName
        ]
        .compactMap { $0?.lowercased() }
        .joined(separator: " ")

        let adsbCategory = category?.lowercased()

        let kind: TVTrafficKind
        if joined.range(of: #"sécurité civile|securite civile|civil security|dragons?d{2}|canadair|cl-?415|cl-?215|water bomber|fire boss|at-?802"#, options: .regularExpression) != nil {
            kind = .civilSecurity
        } else if joined.range(of: #"samu|smur|medevac|medical|médical|hems|secours|urgences"#, options: .regularExpression) != nil {
            kind = .medical
        } else if joined.range(of: #"rafale|mirage|military|militaire|armée|armee|air force|french navy|marine nationale|french army|alat|aéronavale|aeronavale|a400m|c-?130|c160|transall|alphajet|alpha jet|awacs|dga essais"#, options: .regularExpression) != nil || enrichment?.aircraftCategory == "military" {
            kind = .military
        } else if joined.range(of: #"douane|customs|surveillance|police|gendarmerie|coast guard|gardes.côtes|patmar"#, options: .regularExpression) != nil {
            kind = .surveillance
        } else if adsbCategory == "a7"
                    || enrichment?.aircraftCategory == "helicopter"
                    || joined.range(of: #"helic|hélic|rotor|h125|h145|ec145|h135|ec135|as[ .-]?350|as50|écureuil|squirrel|nh90|caracal|cougar|gazelle|dauphin"#, options: .regularExpression) != nil {
            kind = .helicopter
        } else if adsbCategory == "b6"
                    || enrichment?.aircraftCategory == "drone"
                    || joined.range(of: #"drone|uav|uas"#, options: .regularExpression) != nil {
            kind = .drone
        } else if adsbCategory == "b1"
                    || joined.range(of: #"glider|planeur|sailplane"#, options: .regularExpression) != nil {
            kind = .glider
        } else if adsbCategory == "b2"
                    || enrichment?.aircraftCategory == "balloon"
                    || joined.range(of: #"balloon|ballon|montgolfi[eè]re|airship|dirigeable|zeppelin"#, options: .regularExpression) != nil {
            kind = .balloon
        } else if adsbCategory == "b4"
                    || joined.range(of: #"ulm|ultralight|bristell"#, options: .regularExpression) != nil {
            kind = .ultralight
        } else if enrichment?.aircraftCategory == "light"
                    || adsbCategory == "a1"
                    || adsbCategory == "a2"
                    || joined.range(of: #"private|privé|cessna|piper|robin|cirrus|diamond|da20|da40|da42|tecnam|pilatus|pc-?6|pc-?12"#, options: .regularExpression) != nil {
            kind = .lightPrivate
        } else if enrichment?.aircraftCategory == "specialized"
                    || joined.range(of: #"special|experimental|survey|research|calibration"#, options: .regularExpression) != nil {
            kind = .specialized
        } else if enrichment?.aircraftCategory == "airliner"
                    || joined.range(of: #"airbus|boeing|a3dd|b7dd|embraer|airliner"#, options: .regularExpression) != nil {
            kind = .airline
        } else {
            kind = .unknown
        }

        let relativeIconScale: Double = {
            switch kind {
            case .airline:
                if joined.range(of: #"a38|a350|b74|b77|b78|widebody|heavy"#, options: .regularExpression) != nil {
                    return 1.35
                }
                return 1.15
            case .military:
                return 1.18
            case .civilSecurity:
                return joined.contains("helic") || joined.contains("h145") || adsbCategory == "a7" ? 1.02 : 1.16
            case .helicopter, .medical:
                return 0.98
            case .surveillance, .specialized:
                return 1.02
            case .lightPrivate:
                return 0.88
            case .ultralight, .glider, .drone:
                return 0.74
            case .balloon:
                return 0.86
            case .unknown:
                return 0.94
            }
        }()

        return TVTrafficProfile(
            kind: kind,
            label: kind.label,
            symbolName: kind.symbolName,
            priorityTier: kind.priorityTier,
            relativeIconScale: relativeIconScale
        )
    }
}
