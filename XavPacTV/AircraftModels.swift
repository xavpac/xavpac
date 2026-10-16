import CoreLocation
import Foundation

let xavPacBaseURL = URL(string: "https://xavpac-ty3i.vercel.app")!

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
    let appleVideoURL: String?
    let scene: String?

    enum CodingKeys: String, CodingKey {
        case id, type, url, preview, author, sourceName
        case sourceURL = "sourceUrl"
        case appleVideoURL = "appleVideoUrl"
        case scene
    }

    var mediaURL: URL? { URL(string: url) }
    var previewURL: URL? { preview.flatMap(URL.init(string:)) }
    var isVideo: Bool { type == "video" }

    var sceneLabel: String {
        switch scene {
        case "airport": return "✈  AÉROPORT D’ARRIVÉE"
        case "approach": return "✦  APPROCHE & ATTERRISSAGE"
        case "ambience": return "✦  AMBIANCE LOCALE"
        default: return isVideo ? "✦  VUE AÉRIENNE" : "✦  DÉCOUVERTE DE LA VILLE"
        }
    }

    // AVPlayer sur tvOS préfère les flux Apple (MP4/QuickTime).
    // Ne jamais afficher un fichier WebM comme s'il s'agissait d'une image.
    var televisionVideoURL: URL? {
        guard isVideo else { return nil }
        if let appleVideoURL, let url = URL(string: appleVideoURL) {
            return url
        }
        guard let url = mediaURL,
              ["mp4", "m4v", "mov"].contains(url.pathExtension.lowercased()) else {
            return nil
        }
        return url
    }
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
        case .medical: return "SAMU / SECOURS MÉDICAL"
        case .military: return "ARMÉE"
        case .surveillance: return "SURVEILLANCE"
        case .helicopter: return "HÉLICOPTÈRE"
        case .drone: return "DRONE"
        case .glider: return "PLANEUR"
        case .balloon: return "AÉROSTAT"
        case .ultralight: return "ULM"
        case .lightPrivate: return "AVIATION LÉGÈRE / PRIVÉE"
        case .specialized: return "AÉRONEF SPÉCIAL"
        case .airline: return "LIGNE COMMERCIALE"
        case .unknown: return "AÉRONEF"
        }
    }

    var defaultSymbolName: String {
        switch self {
        case .helicopter, .medical:
            return "helicopter"
        case .drone:
            return "paperplane.fill"
        case .balloon:
            return "balloon.2.fill"
        default:
            return "airplane"
        }
    }

    // Le grand pavé opérationnel est réservé aux appareils de la
    // Sécurité civile, de l'Armée et du SAMU/SMUR.
    // Un hélicoptère civil reste visible sur la carte, sans alerte.
    var priorityTier: Int {
        switch self {
        case .civilSecurity: return 0
        case .military: return 1
        case .medical: return 2
        default: return 9
        }
    }

    var isPriorityTraffic: Bool {
        switch self {
        case .civilSecurity, .military, .medical: return true
        default: return false
        }
    }
}

struct TVTrafficProfile: Hashable {
    let kind: TVTrafficKind
    let label: String
    let symbolName: String
    let priorityTier: Int
    let relativeIconScale: Double
    let isRotorcraft: Bool

    var isPriorityTraffic: Bool { kind.isPriorityTraffic }
}

extension Aircraft {
    func trafficProfile(enrichment: TVAircraftEnrichment?) -> TVTrafficProfile {
        let rawValues = [
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
        let joined = rawValues
            .compactMap { $0?.lowercased() }
            .joined(separator: " ")

        let adsbCategory = category?.lowercased()

        // « Malibu Mirage » est un Piper PA-46 civil, pas un Dassault Mirage.
        // Protéger cette identification, même si l'enrichissement distant
        // a précédemment classé l'aéronef comme militaire.
        let civilianMalibuPattern = #"\bpa[ .-]?46\b|\bmalibu(?:\s+mirage)?\b|\bpiper\s+malibu\b"#
        let isCivilianMalibu = joined.range(
            of: civilianMalibuPattern, options: .regularExpression
        ) != nil

        let helicopterPattern = #"helic|hélic|rotor|h125|h145|ec145|h135|ec135|as[ .-]?350|as50|écureuil|squirrel|nh90|caracal|cougar|gazelle|dauphin|aw139|aw169|bell|r44|r66"#
        let isRotorcraft = adsbCategory == "a7"
            || enrichment?.aircraftCategory == "helicopter"
            || joined.range(of: helicopterPattern, options: .regularExpression) != nil

        let kind: TVTrafficKind
        if joined.range(
            of: #"sécurité civile|securite civile|civil security|dragon\s?\d{2}|canadair|cl-?415|cl-?215|water bomber|fire boss|at-?802|dash 8.*sécurité|dash 8.*securite"#,
            options: .regularExpression
        ) != nil {
            kind = .civilSecurity
        } else if joined.range(
            of: #"rafale|\bmirage[ -]?(?:2000[a-z]?|f1|iii|iv|50|5)\b|fighter|military|militaire|armée|armee|air force|french navy|marine nationale|french army|alat|aéronavale|aeronavale|a400m|c-?130|c160|transall|alphajet|alpha jet|awacs|dga essais|armée de l'air"#,
            options: .regularExpression
        ) != nil || enrichment?.aircraftCategory == "military" {
            kind = isCivilianMalibu ? .lightPrivate : .military
        } else if joined.range(
            of: #"samu|smur|medevac|medical|médical|hems|secours|urgences"#,
            options: .regularExpression
        ) != nil {
            kind = .medical
        } else if joined.range(
            of: #"douane|customs|surveillance|police|gendarmerie|coast guard|gardes.côtes|patmar"#,
            options: .regularExpression
        ) != nil {
            kind = .surveillance
        } else if isRotorcraft {
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
                    || joined.range(
                        of: #"private|privé|cessna|piper|robin|cirrus|diamond|da20|da40|da42|tecnam|pilatus|pc-?6|pc-?12"#,
                        options: .regularExpression
                    ) != nil {
            kind = .lightPrivate
        } else if enrichment?.aircraftCategory == "specialized"
                    || joined.range(
                        of: #"special|experimental|survey|research|calibration"#,
                        options: .regularExpression
                    ) != nil {
            kind = .specialized
        } else if enrichment?.aircraftCategory == "airliner"
                    || joined.range(
                        of: #"airbus|boeing|a3\d\d|b7\d\d|embraer|airliner"#,
                        options: .regularExpression
                    ) != nil {
            kind = .airline
        } else {
            kind = .unknown
        }

        let scale: Double
        if isRotorcraft {
            scale = 0.90
        } else if joined.range(
            of: #"a380|b747|b777|b787|a350|a340|a330|a400m|c-?17|an-?124|beluga"#,
            options: .regularExpression
        ) != nil {
            scale = 1.42
        } else if joined.range(
            of: #"a3[12]\d|b737|b738|b739|737 max|embraer|e1[789]0|e2[789]0|crj|atr|dash|dhc-?8|c-?130"#,
            options: .regularExpression
        ) != nil {
            scale = 1.16
        } else if kind == .lightPrivate || kind == .ultralight || kind == .glider || kind == .drone {
            scale = 0.78
        } else if kind == .military {
            scale = 1.05
        } else {
            scale = 1.0
        }

        let symbolName = isRotorcraft ? "helicopter" : kind.defaultSymbolName

        return TVTrafficProfile(
            kind: kind,
            label: kind.label,
            symbolName: symbolName,
            priorityTier: kind.priorityTier,
            relativeIconScale: scale,
            isRotorcraft: isRotorcraft
        )
    }
}
