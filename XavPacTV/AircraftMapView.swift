import MapKit
import SwiftUI
import UIKit

final class AircraftAnnotation: NSObject, MKAnnotation {
    let aircraft: Aircraft
    let isSelected: Bool
    dynamic var coordinate: CLLocationCoordinate2D
    var title: String? { aircraft.displayName }
    var subtitle: String? { aircraft.subtitle }

    init(aircraft: Aircraft, isSelected: Bool) {
        self.aircraft = aircraft
        self.isSelected = isSelected
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

struct AircraftMapView: UIViewRepresentable {
    let aircraft: [Aircraft]
    let center: CLLocationCoordinate2D
    let trails: [String: [CLLocationCoordinate2D]]
    @Binding var selectedID: String?

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView(frame: .zero)
        map.delegate = context.coordinator
        map.mapType = .mutedStandard
        map.pointOfInterestFilter = .excludingAll
        map.overrideUserInterfaceStyle = .dark

        let region = MKCoordinateRegion(
            center: center,
            latitudinalMeters: 125_000,
            longitudinalMeters: 125_000
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
            aircraft.prefix(60).map {
                AircraftAnnotation(aircraft: $0, isSelected: $0.id == selectedID)
            }
        )

        [10_000.0, 25_000.0, 50_000.0].forEach { radius in
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
                latitudinalMeters: 125_000,
                longitudinalMeters: 125_000
            )
            map.setRegion(region, animated: true)
        }

        if let selectedID,
           let annotation = map.annotations
            .compactMap({ $0 as? AircraftAnnotation })
            .first(where: { $0.aircraft.id == selectedID }) {
            map.selectAnnotation(annotation, animated: false)
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
                let identifier = "home"
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                    ?? MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)

                view.annotation = annotation
                view.displayPriority = .required
                let configuration = UIImage.SymbolConfiguration(pointSize: 30, weight: .bold)
                view.image = UIImage(systemName: "house.circle.fill", withConfiguration: configuration)?
                    .withTintColor(.systemBlue, renderingMode: .alwaysOriginal)
                return view
            }

            guard let aircraftAnnotation = annotation as? AircraftAnnotation else { return nil }

            let identifier = aircraftAnnotation.isSelected ? "aircraft-selected" : "aircraft"
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)

            view.annotation = annotation
            view.canShowCallout = true
            view.displayPriority = aircraftAnnotation.isSelected ? .required : .defaultHigh
            view.collisionMode = .circle

            let size: CGFloat = aircraftAnnotation.isSelected ? 32 : 24
            let configuration = UIImage.SymbolConfiguration(pointSize: size, weight: .bold)
            let tint: UIColor = aircraftAnnotation.isSelected ? .systemOrange : .systemCyan
            view.image = UIImage(systemName: "airplane", withConfiguration: configuration)?
                .withTintColor(tint, renderingMode: .alwaysOriginal)

            if let track = aircraftAnnotation.aircraft.trueTrack {
                view.transform = CGAffineTransform(rotationAngle: track * .pi / 180)
            } else {
                view.transform = .identity
            }

            return view
        }

        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            guard let annotation = view.annotation as? AircraftAnnotation else { return }
            parent.selectedID = annotation.aircraft.id
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let polyline = overlay as? MKPolyline {
                let renderer = MKPolylineRenderer(polyline: polyline)
                renderer.strokeColor = .systemOrange
                renderer.lineWidth = 5
                renderer.lineJoin = .round
                renderer.lineCap = .round
                return renderer
            }

            if let circle = overlay as? MKCircle {
                let renderer = MKCircleRenderer(circle: circle)
                renderer.strokeColor = UIColor.systemCyan.withAlphaComponent(0.45)
                renderer.fillColor = UIColor.systemCyan.withAlphaComponent(0.025)
                renderer.lineWidth = circle.radius >= 50_000 ? 2 : 1.2
                renderer.lineDashPattern = circle.radius >= 50_000 ? [8, 8] : nil
                return renderer
            }

            return MKOverlayRenderer(overlay: overlay)
        }
    }
}
