import MapKit
import SwiftUI
import UIKit

final class AircraftAnnotation: NSObject, MKAnnotation {
    let aircraft: Aircraft
    let isSelected: Bool
    let distanceKm: Double
    dynamic var coordinate: CLLocationCoordinate2D

    init(aircraft: Aircraft, isSelected: Bool, center: CLLocationCoordinate2D) {
        self.aircraft = aircraft
        self.isSelected = isSelected
        self.distanceKm = aircraft.distanceKilometers(from: center)
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
    private let tagLabel = UILabel()

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)

        planeView.contentMode = .scaleAspectFit
        addSubview(planeView)

        tagLabel.font = .systemFont(ofSize: 15, weight: .bold)
        tagLabel.textColor = UIColor(red: 0.03, green: 0.16, blue: 0.29, alpha: 1)
        tagLabel.textAlignment = .center
        tagLabel.backgroundColor = UIColor.white.withAlphaComponent(0.95)
        tagLabel.layer.cornerRadius = 9
        tagLabel.layer.borderWidth = 1
        tagLabel.layer.borderColor = UIColor.systemCyan.withAlphaComponent(0.55).cgColor
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
        displayPriority = item.isSelected ? .required : .defaultHigh

        let symbolSize: CGFloat = item.isSelected ? 38 : 25
        let configuration = UIImage.SymbolConfiguration(pointSize: symbolSize, weight: .bold)
        let tint: UIColor = item.isSelected
            ? UIColor.systemCyan
            : UIColor(red: 0.30, green: 0.38, blue: 0.49, alpha: 0.88)

        planeView.image = UIImage(systemName: "airplane", withConfiguration: configuration)?
            .withTintColor(tint, renderingMode: .alwaysOriginal)

        if let track = item.aircraft.trueTrack {
            // Le symbole SF "airplane" pointe vers la droite (90°). Le cap ADS-B est 0° = nord.
            planeView.transform = CGAffineTransform(rotationAngle: (track - 90) * .pi / 180)
        } else {
            planeView.transform = .identity
        }

        if item.isSelected {
            frame = CGRect(x: 0, y: 0, width: 220, height: 54)
            planeView.frame = CGRect(x: 0, y: 7, width: 42, height: 42)
            let type = item.aircraft.aircraftType?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let suffix = type.isEmpty ? "" : " · \(type)"
            tagLabel.text = "  \(item.aircraft.displayName)\(suffix) · \(item.distanceKm.formatted(.number.precision(.fractionLength(1)))) km  "
            tagLabel.frame = CGRect(x: 48, y: 9, width: 168, height: 36)
            tagLabel.isHidden = false
            centerOffset = CGPoint(x: 88, y: 0)
        } else {
            frame = CGRect(x: 0, y: 0, width: 34, height: 34)
            planeView.frame = bounds
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
            latitudinalMeters: 105_000,
            longitudinalMeters: 105_000
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
            aircraft.prefix(45).map {
                AircraftAnnotation(
                    aircraft: $0,
                    isSelected: $0.id == selectedID,
                    center: center
                )
            }
        )

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
                latitudinalMeters: 105_000,
                longitudinalMeters: 105_000
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
                let identifier = "home-v3"
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                    ?? MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)

                view.annotation = annotation
                view.displayPriority = .required
                view.canShowCallout = false
                let configuration = UIImage.SymbolConfiguration(pointSize: 28, weight: .bold)
                view.image = UIImage(systemName: "house.circle.fill", withConfiguration: configuration)?
                    .withTintColor(
                        UIColor(red: 0.02, green: 0.25, blue: 0.48, alpha: 1),
                        renderingMode: .alwaysOriginal
                    )
                return view
            }

            guard let aircraftAnnotation = annotation as? AircraftAnnotation else { return nil }

            let identifier = aircraftAnnotation.isSelected ? "aircraft-v3-selected" : "aircraft-v3"
            let view = (mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? AircraftAnnotationView)
                ?? AircraftAnnotationView(annotation: annotation, reuseIdentifier: identifier)
            view.configure(with: aircraftAnnotation)
            return view
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let polyline = overlay as? MKPolyline {
                let renderer = MKPolylineRenderer(polyline: polyline)
                renderer.strokeColor = UIColor.systemCyan.withAlphaComponent(0.90)
                renderer.lineWidth = 4
                renderer.lineJoin = .round
                renderer.lineCap = .round
                return renderer
            }

            if let circle = overlay as? MKCircle {
                let renderer = MKCircleRenderer(circle: circle)
                renderer.strokeColor = UIColor.systemBlue.withAlphaComponent(0.35)
                renderer.fillColor = UIColor.systemCyan.withAlphaComponent(0.015)
                renderer.lineWidth = circle.radius >= 40_000 ? 1.7 : 1.1
                renderer.lineDashPattern = [7, 7]
                return renderer
            }

            return MKOverlayRenderer(overlay: overlay)
        }
    }
}
