import MapKit
import SwiftUI
import UIKit

final class AircraftAnnotation: NSObject, MKAnnotation {
    let aircraft: Aircraft
    dynamic var coordinate: CLLocationCoordinate2D
    var title: String? { aircraft.displayName }
    var subtitle: String? { aircraft.subtitle }

    init(aircraft: Aircraft) {
        self.aircraft = aircraft
        self.coordinate = aircraft.coordinate
        super.init()
    }
}

struct AircraftMapView: UIViewRepresentable {
    let aircraft: [Aircraft]
    let center: CLLocationCoordinate2D
    @Binding var selectedID: String?

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView(frame: .zero)
        map.delegate = context.coordinator
        map.mapType = .mutedStandard
        map.pointOfInterestFilter = .excludingAll

        let region = MKCoordinateRegion(
            center: center,
            latitudinalMeters: 120_000,
            longitudinalMeters: 120_000
        )
        map.setRegion(region, animated: false)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.parent = self

        let oldAnnotations = map.annotations.compactMap { $0 as? AircraftAnnotation }
        map.removeAnnotations(oldAnnotations)
        map.addAnnotations(aircraft.map(AircraftAnnotation.init))

        if let selectedID,
           selectedID != context.coordinator.lastSelectedID,
           let selected = aircraft.first(where: { $0.id == selectedID }) {
            context.coordinator.lastSelectedID = selectedID
            let region = MKCoordinateRegion(
                center: selected.coordinate,
                latitudinalMeters: 28_000,
                longitudinalMeters: 28_000
            )
            map.setRegion(region, animated: true)

            if let annotation = map.annotations
                .compactMap({ $0 as? AircraftAnnotation })
                .first(where: { $0.aircraft.id == selectedID }) {
                map.selectAnnotation(annotation, animated: true)
            }
        }
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var parent: AircraftMapView
        var lastSelectedID: String?

        init(parent: AircraftMapView) {
            self.parent = parent
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let aircraftAnnotation = annotation as? AircraftAnnotation else { return nil }

            let identifier = "aircraft"
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)

            view.annotation = annotation
            view.canShowCallout = true
            view.displayPriority = .required
            view.collisionMode = .circle

            let configuration = UIImage.SymbolConfiguration(pointSize: 25, weight: .bold)
            let image = UIImage(systemName: "airplane", withConfiguration: configuration)?
                .withTintColor(.systemCyan, renderingMode: .alwaysOriginal)

            view.image = image
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
            lastSelectedID = annotation.aircraft.id
        }
    }
}
