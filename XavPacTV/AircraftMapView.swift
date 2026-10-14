import MapKit
import SwiftUI
import UIKit

final class AircraftAnnotation: NSObject, MKAnnotation {
    let aircraft: Aircraft
    let isSelected: Bool
    let distanceKm: Double
    let profile: TVTrafficProfile
    dynamic var coordinate: CLLocationCoordinate2D

    init(
        aircraft: Aircraft,
        isSelected: Bool,
        center: CLLocationCoordinate2D,
        profile: TVTrafficProfile
    ) {
        self.aircraft = aircraft
        self.isSelected = isSelected
        self.distanceKm = aircraft.distanceKilometers(from: center)
        self.profile = profile
        self.coordinate = aircraft.coordinate
        super.init()
    }
}

final class RadarHomeAnnotation: NSObject, MKAnnotation {
    dynamic var coordinate: CLLocationCoordinate2D

    init(coordinate: CLLocationCoordinate2D) {
        self.coordinate = coordinate
        super.init()
    }
}

private final class AircraftAnnotationView: MKAnnotationView {
    private let symbolView = UIImageView()
    private let haloView = UIView()
    private let tagLabel = UILabel()

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)

        haloView.isUserInteractionEnabled = false
        addSubview(haloView)

        symbolView.contentMode = .scaleAspectFit
        symbolView.layer.shadowOpacity = 0.9
        symbolView.layer.shadowRadius = 9
        symbolView.layer.shadowOffset = .zero
        addSubview(symbolView)

        tagLabel.font = .systemFont(ofSize: 15, weight: .heavy)
        tagLabel.textColor = UIColor(red: 0.025, green: 0.09, blue: 0.18, alpha: 1)
        tagLabel.textAlignment = .center
        tagLabel.backgroundColor = UIColor.white.withAlphaComponent(0.97)
        tagLabel.layer.cornerRadius = 11
        tagLabel.layer.borderWidth = 1.6
        tagLabel.clipsToBounds = true
        addSubview(tagLabel)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(with item: AircraftAnnotation) {
        annotation = item
        canShowCallout = false
        collisionMode = .circle
        displayPriority = item.isSelected || item.profile.isPriorityTraffic ? .required : .defaultHigh

        let tint = color(for: item.profile.kind)
        let baseSize: CGFloat = item.isSelected ? 46 : 29
        let iconSize = baseSize * CGFloat(item.profile.relativeIconScale)
        let configuration = UIImage.SymbolConfiguration(pointSize: iconSize, weight: .heavy)

        let image = UIImage(systemName: item.profile.symbolName, withConfiguration: configuration)
            ?? UIImage(systemName: "airplane", withConfiguration: configuration)

        symbolView.image = image?.withTintColor(tint, renderingMode: .alwaysOriginal)
        symbolView.layer.shadowColor = tint.cgColor

        if let track = item.aircraft.trueTrack,
           item.profile.symbolName == "airplane" {
            symbolView.transform = CGAffineTransform(rotationAngle: (track - 90) * .pi / 180)
        } else {
            symbolView.transform = .identity
        }

        haloView.layer.removeAllAnimations()

        if item.isSelected {
            frame = CGRect(x: 0, y: 0, width: 292, height: 68)

            let symbolBox: CGFloat = 54
            haloView.frame = CGRect(x: 1, y: 7, width: symbolBox, height: symbolBox)
            haloView.layer.cornerRadius = symbolBox / 2
            haloView.backgroundColor = tint.withAlphaComponent(item.profile.isPriorityTraffic ? 0.30 : 0.17)

            symbolView.frame = CGRect(x: 5, y: 11, width: 46, height: 46)

            let type = item.aircraft.aircraftType?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let typeSuffix = type.isEmpty ? "" : " · \(type)"
            let prefix = item.profile.isPriorityTraffic ? "\(item.profile.label) · " : ""
            tagLabel.text = "  \(prefix)\(item.aircraft.displayName)\(typeSuffix) · \(String(format: "%.1f", item.distanceKm)) km  "
            tagLabel.frame = CGRect(x: 61, y: 12, width: 225, height: 42)
            tagLabel.layer.borderColor = tint.withAlphaComponent(0.9).cgColor
            tagLabel.isHidden = false
            centerOffset = CGPoint(x: 114, y: 0)

            if item.profile.isPriorityTraffic {
                startPriorityPulse(color: tint)
            }
        } else {
            let box = max(40, 46 * CGFloat(item.profile.relativeIconScale))
            frame = CGRect(x: 0, y: 0, width: box, height: box)
            haloView.frame = bounds.insetBy(dx: 2, dy: 2)
            haloView.layer.cornerRadius = haloView.bounds.width / 2
            haloView.backgroundColor = item.profile.isPriorityTraffic
                ? tint.withAlphaComponent(0.20)
                : tint.withAlphaComponent(0.06)
            symbolView.frame = bounds.insetBy(dx: 5, dy: 5)
            tagLabel.isHidden = true
            centerOffset = .zero
        }
    }

    private func color(for kind: TVTrafficKind) -> UIColor {
        switch kind {
        case .civilSecurity:
            return UIColor(red: 1.00, green: 0.64, blue: 0.04, alpha: 1)
        case .military:
            return UIColor(red: 0.95, green: 0.13, blue: 0.17, alpha: 1)
        case .helicopter, .medical:
            return UIColor(red: 0.05, green: 0.78, blue: 0.38, alpha: 1)
        case .surveillance:
            return UIColor(red: 0.60, green: 0.33, blue: 0.96, alpha: 1)
        case .airline:
            return UIColor(red: 0.00, green: 0.70, blue: 1.00, alpha: 1)
        case .lightPrivate:
            return UIColor.white
        case .ultralight, .glider:
            return UIColor(red: 0.98, green: 0.76, blue: 0.10, alpha: 1)
        case .drone:
            return UIColor(red: 0.18, green: 0.90, blue: 0.86, alpha: 1)
        case .balloon:
            return UIColor(red: 0.96, green: 0.40, blue: 0.72, alpha: 1)
        case .specialized:
            return UIColor(red: 0.55, green: 0.74, blue: 1.00, alpha: 1)
        case .unknown:
            return UIColor(red: 0.82, green: 0.86, blue: 0.91, alpha: 1)
        }
    }

    private func startPriorityPulse(color: UIColor) {
        let opacity = CABasicAnimation(keyPath: "opacity")
        opacity.fromValue = 0.24
        opacity.toValue = 0.92
        opacity.duration = 0.58
        opacity.autoreverses = true
        opacity.repeatCount = .infinity

        let scale = CABasicAnimation(keyPath: "transform.scale")
        scale.fromValue = 0.86
        scale.toValue = 1.16
        scale.duration = 0.58
        scale.autoreverses = true
        scale.repeatCount = .infinity

        haloView.layer.borderWidth = 2
        haloView.layer.borderColor = color.cgColor
        haloView.layer.add(opacity, forKey: "priorityOpacity")
        haloView.layer.add(scale, forKey: "priorityScale")
    }
}

struct AircraftMapView: UIViewRepresentable {
    let aircraft: [Aircraft]
    let center: CLLocationCoordinate2D
    let trails: [String: [CLLocationCoordinate2D]]
    let selectedID: String?
    let profiles: [String: TVTrafficProfile]

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView(frame: .zero)
        map.delegate = context.coordinator
        map.mapType = .standard
        map.pointOfInterestFilter = .excludingAll
        map.overrideUserInterfaceStyle = .light

        // Cartographie volontairement figée pour l'affichage mural.
        map.isScrollEnabled = false
        map.isZoomEnabled = false
        map.isRotateEnabled = false
        map.isUserInteractionEnabled = false

        let region = MKCoordinateRegion(
            center: center,
            latitudinalMeters: 90_000,
            longitudinalMeters: 90_000
        )
        map.setRegion(region, animated: false)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.parent = self

        map.removeAnnotations(map.annotations)
        map.removeOverlays(map.overlays)

        map.addAnnotation(RadarHomeAnnotation(coordinate: center))
        map.addAnnotations(
            aircraft.prefix(60).map { item in
                AircraftAnnotation(
                    aircraft: item,
                    isSelected: item.id == selectedID,
                    center: center,
                    profile: profiles[item.id] ?? item.trafficProfile(enrichment: nil)
                )
            }
        )

        [10_000.0, 20_000.0, 40_000.0].forEach { radius in
            map.addOverlay(MKCircle(center: center, radius: radius))
        }

        if let selectedID,
           let points = trails[selectedID],
           points.count >= 2 {
            var coordinates = points
            map.addOverlay(MKPolyline(coordinates: &coordinates, count: coordinates.count))
        }

        if context.coordinator.lastCenter.latitude != center.latitude
            || context.coordinator.lastCenter.longitude != center.longitude {
            context.coordinator.lastCenter = center
            let region = MKCoordinateRegion(
                center: center,
                latitudinalMeters: 90_000,
                longitudinalMeters: 90_000
            )
            map.setRegion(region, animated: false)
        }
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var parent: AircraftMapView
        var lastCenter = CLLocationCoordinate2D(latitude: 0, longitude: 0)

        init(parent: AircraftMapView) {
            self.parent = parent
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            if annotation is RadarHomeAnnotation {
                let identifier = "home-final"
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                    ?? MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)

                view.annotation = annotation
                view.displayPriority = .required
                view.canShowCallout = false
                let configuration = UIImage.SymbolConfiguration(pointSize: 32, weight: .heavy)
                view.image = UIImage(systemName: "house.circle.fill", withConfiguration: configuration)?
                    .withTintColor(
                        UIColor(red: 0.02, green: 0.27, blue: 0.56, alpha: 1),
                        renderingMode: .alwaysOriginal
                    )
                return view
            }

            guard let aircraftAnnotation = annotation as? AircraftAnnotation else { return nil }

            let identifier = aircraftAnnotation.isSelected ? "aircraft-final-selected" : "aircraft-final"
            let view = (mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? AircraftAnnotationView)
                ?? AircraftAnnotationView(annotation: annotation, reuseIdentifier: identifier)
            view.configure(with: aircraftAnnotation)
            return view
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let polyline = overlay as? MKPolyline {
                let renderer = MKPolylineRenderer(polyline: polyline)
                renderer.strokeColor = UIColor.systemCyan.withAlphaComponent(0.94)
                renderer.lineWidth = 5
                renderer.lineJoin = .round
                renderer.lineCap = .round
                return renderer
            }

            if let circle = overlay as? MKCircle {
                let renderer = MKCircleRenderer(circle: circle)
                renderer.strokeColor = UIColor.systemCyan.withAlphaComponent(0.38)
                renderer.fillColor = UIColor.systemCyan.withAlphaComponent(0.012)
                renderer.lineWidth = circle.radius >= 40_000 ? 1.8 : 1.1
                renderer.lineDashPattern = [8, 8]
                return renderer
            }

            return MKOverlayRenderer(overlay: overlay)
        }
    }
}
