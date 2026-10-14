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
    private let planeView = UIImageView()
    private let haloView = UIView()
    private let tagLabel = UILabel()

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)

        haloView.layer.cornerRadius = 25
        addSubview(haloView)

        planeView.contentMode = .scaleAspectFit
        planeView.layer.shadowOpacity = 0.82
        planeView.layer.shadowRadius = 8
        planeView.layer.shadowOffset = .zero
        addSubview(planeView)

        tagLabel.font = .systemFont(ofSize: 15, weight: .bold)
        tagLabel.textColor = UIColor(red: 0.03, green: 0.12, blue: 0.23, alpha: 1)
        tagLabel.textAlignment = .center
        tagLabel.backgroundColor = UIColor.white.withAlphaComponent(0.97)
        tagLabel.layer.cornerRadius = 10
        tagLabel.layer.borderWidth = 1.4
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
        displayPriority = item.isSelected ? .required : (item.profile.isPriorityTraffic ? .required : .defaultHigh)

        let isSpecial = item.profile.isPriorityTraffic
        let symbolSize: CGFloat = item.isSelected ? 46 : (isSpecial ? 32 : 27)
        let configuration = UIImage.SymbolConfiguration(pointSize: symbolSize, weight: .heavy)

        let selectedColor: UIColor = isSpecial ? .systemOrange : .systemCyan
        let normalColor: UIColor = isSpecial
            ? UIColor.systemOrange.withAlphaComponent(0.96)
            : UIColor(red: 0.13, green: 0.30, blue: 0.52, alpha: 0.90)
        let tint = item.isSelected ? selectedColor : normalColor

        let image = UIImage(systemName: item.profile.symbolName, withConfiguration: configuration)
            ?? UIImage(systemName: "airplane", withConfiguration: configuration)
        planeView.image = image?.withTintColor(tint, renderingMode: .alwaysOriginal)
        planeView.layer.shadowColor = tint.cgColor

        if let track = item.aircraft.trueTrack,
           item.profile.symbolName == "airplane" {
            // Le symbole SF "airplane" pointe vers la droite (90°).
            // Le cap ADS-B est 0° = nord.
            planeView.transform = CGAffineTransform(rotationAngle: (track - 90) * .pi / 180)
        } else {
            planeView.transform = .identity
        }

        if item.isSelected {
            frame = CGRect(x: 0, y: 0, width: 300, height: 64)
            haloView.frame = CGRect(x: 0, y: 7, width: 50, height: 50)
            haloView.backgroundColor = tint.withAlphaComponent(0.18)
            haloView.layer.cornerRadius = 25

            planeView.frame = CGRect(x: 4, y: 10, width: 44, height: 44)

            let type = item.aircraft.aircraftType?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let suffix = type.isEmpty ? "" : " · \(type)"
            let priority = isSpecial ? "\(item.profile.label) · " : ""
            tagLabel.text = "  \(priority)\(item.aircraft.displayName)\(suffix) · \(String(format: "%.1f", item.distanceKm)) km  "
            tagLabel.frame = CGRect(x: 56, y: 11, width: 238, height: 42)
            tagLabel.layer.borderColor = tint.withAlphaComponent(0.78).cgColor
            tagLabel.isHidden = false
            centerOffset = CGPoint(x: 118, y: 0)
        } else {
            frame = CGRect(x: 0, y: 0, width: 46, height: 46)
            haloView.frame = CGRect(x: 3, y: 3, width: 40, height: 40)
            haloView.layer.cornerRadius = 20
            haloView.backgroundColor = isSpecial ? tint.withAlphaComponent(0.14) : .clear
            planeView.frame = bounds.insetBy(dx: 5, dy: 5)
            tagLabel.isHidden = true
            centerOffset = .zero
        }
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

        let region = MKCoordinateRegion(
            center: center,
            latitudinalMeters: 92_000,
            longitudinalMeters: 92_000
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

        // Le balayage radar animé est dessiné en SwiftUI par-dessus la carte.
        // On garde seulement les portées principales sur MapKit.
        [10_000.0, 25_000.0, 40_000.0].forEach { radius in
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
                latitudinalMeters: 92_000,
                longitudinalMeters: 92_000
            )
            map.setRegion(region, animated: true)
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
                let identifier = "home-v4"
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                    ?? MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)

                view.annotation = annotation
                view.displayPriority = .required
                view.canShowCallout = false
                let configuration = UIImage.SymbolConfiguration(pointSize: 32, weight: .bold)
                view.image = UIImage(systemName: "house.circle.fill", withConfiguration: configuration)?
                    .withTintColor(
                        UIColor(red: 0.02, green: 0.25, blue: 0.48, alpha: 1),
                        renderingMode: .alwaysOriginal
                    )
                return view
            }

            guard let aircraftAnnotation = annotation as? AircraftAnnotation else { return nil }

            let identifier = aircraftAnnotation.isSelected ? "aircraft-v4-selected" : "aircraft-v4"
            let view = (mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? AircraftAnnotationView)
                ?? AircraftAnnotationView(annotation: annotation, reuseIdentifier: identifier)
            view.configure(with: aircraftAnnotation)
            return view
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let polyline = overlay as? MKPolyline {
                let renderer = MKPolylineRenderer(polyline: polyline)
                renderer.strokeColor = UIColor.systemCyan.withAlphaComponent(0.92)
                renderer.lineWidth = 5
                renderer.lineJoin = .round
                renderer.lineCap = .round
                return renderer
            }

            if let circle = overlay as? MKCircle {
                let renderer = MKCircleRenderer(circle: circle)
                renderer.strokeColor = UIColor.systemBlue.withAlphaComponent(0.28)
                renderer.fillColor = UIColor.systemCyan.withAlphaComponent(0.012)
                renderer.lineWidth = circle.radius >= 40_000 ? 1.6 : 1.0
                renderer.lineDashPattern = [8, 8]
                return renderer
            }

            return MKOverlayRenderer(overlay: overlay)
        }
    }
}
