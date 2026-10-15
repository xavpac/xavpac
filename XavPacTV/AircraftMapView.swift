import MapKit
import SwiftUI
import UIKit

final class AircraftAnnotation: NSObject, MKAnnotation {
    let aircraft: Aircraft
    let isSelected: Bool
    let distanceKm: Double
    let profile: TVTrafficProfile
    let routeLabel: String?
    let approachRank: Int?
    dynamic var coordinate: CLLocationCoordinate2D

    init(
        aircraft: Aircraft,
        isSelected: Bool,
        center: CLLocationCoordinate2D,
        profile: TVTrafficProfile,
        routeLabel: String?,
        approachRank: Int?
    ) {
        self.aircraft = aircraft
        self.isSelected = isSelected
        self.distanceKm = aircraft.distanceKilometers(from: center)
        self.profile = profile
        self.routeLabel = routeLabel
        self.approachRank = approachRank
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
    private let glyphView = UIImageView()
    private let haloView = UIView()
    private let tagLabel = UILabel()

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)

        haloView.isUserInteractionEnabled = false
        addSubview(haloView)

        glyphView.contentMode = .scaleAspectFit
        glyphView.layer.shadowOpacity = 0.88
        glyphView.layer.shadowRadius = 9
        glyphView.layer.shadowOffset = .zero
        addSubview(glyphView)

        tagLabel.font = .systemFont(ofSize: 19, weight: .heavy)
        tagLabel.textColor = .white
        tagLabel.textAlignment = .center
        tagLabel.backgroundColor = UIColor(red: 0.025, green: 0.13, blue: 0.26, alpha: 0.93)
        tagLabel.layer.cornerRadius = 11
        tagLabel.layer.borderWidth = 1.5
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

        haloView.layer.removeAllAnimations()
        glyphView.layer.removeAllAnimations()

        let tint: UIColor
        if item.profile.isPriorityTraffic {
            tint = color(for: item.profile.kind)
        } else {
            switch item.approachRank {
            case 1: tint = UIColor(red: 1.0, green: 0.76, blue: 0.20, alpha: 1)
            case 2: tint = UIColor(red: 0.08, green: 0.72, blue: 0.99, alpha: 1)
            case 3: tint = UIColor(red: 0.69, green: 0.39, blue: 1.0, alpha: 1)
            default: tint = color(for: item.profile.kind)
            }
        }
        let scale = CGFloat(item.profile.relativeIconScale)
        let normalSize = max(34, 42 * scale)
        let selectedSize = max(52, 62 * scale)
        let symbolSize = item.isSelected ? selectedSize : normalSize

        if item.profile.isRotorcraft {
            glyphView.image = Self.helicopterTopDownImage(
                tint: tint,
                canvasSize: CGSize(width: 76, height: 76)
            )
        } else {
            let configuration = UIImage.SymbolConfiguration(
                pointSize: symbolSize,
                weight: .heavy
            )
            let image = UIImage(
                systemName: item.profile.symbolName,
                withConfiguration: configuration
            ) ?? UIImage(systemName: "airplane", withConfiguration: configuration)
            glyphView.image = image?.withTintColor(tint, renderingMode: .alwaysOriginal)
        }

        glyphView.layer.shadowColor = tint.cgColor

        if let track = item.aircraft.trueTrack {
            let angle: CGFloat
            if item.profile.isRotorcraft {
                // Notre hélicoptère vectoriel pointe vers le nord.
                angle = CGFloat(track) * .pi / 180
            } else {
                // Le symbole SF airplane pointe vers la droite (90°).
                angle = CGFloat(track - 90) * .pi / 180
            }
            glyphView.transform = CGAffineTransform(rotationAngle: angle)
        } else {
            glyphView.transform = .identity
        }

        if item.isSelected {
            frame = CGRect(x: 0, y: 0, width: 332, height: 80)

            let haloSize = max(63, 72 * scale)
            haloView.frame = CGRect(
                x: 0,
                y: (80 - haloSize) / 2,
                width: haloSize,
                height: haloSize
            )
            haloView.layer.cornerRadius = haloSize / 2
            haloView.backgroundColor = tint.withAlphaComponent(
                item.profile.isPriorityTraffic ? 0.24 : 0.16
            )

            glyphView.frame = CGRect(
                x: 5,
                y: (80 - selectedSize) / 2,
                width: selectedSize,
                height: selectedSize
            )

            let title: String
            if item.profile.isPriorityTraffic {
                title = item.profile.label
            } else {
                title = item.routeLabel ?? "TRAJET À CONFIRMER"
            }

            tagLabel.text = " \(title) · \(String(format: "%.1f", item.distanceKm)) km "
            tagLabel.adjustsFontSizeToFitWidth = true
            tagLabel.minimumScaleFactor = 0.65
            tagLabel.frame = CGRect(x: 78, y: 17, width: 242, height: 46)
            tagLabel.layer.borderColor = tint.withAlphaComponent(0.90).cgColor
            tagLabel.isHidden = false
            centerOffset = CGPoint(x: 102, y: 0)

            if item.profile.isPriorityTraffic {
                addPriorityPulse(color: tint)
            }
        } else {
            let viewSize = max(56, 62 * scale)
            frame = CGRect(x: 0, y: 0, width: viewSize, height: viewSize)

            haloView.frame = bounds.insetBy(dx: 2, dy: 2)
            haloView.layer.cornerRadius = haloView.bounds.width / 2
            haloView.backgroundColor = item.profile.isPriorityTraffic
                ? tint.withAlphaComponent(0.18)
                : UIColor.black.withAlphaComponent(0.08)

            let inset = max(3, 6 / scale)
            glyphView.frame = bounds.insetBy(dx: inset, dy: inset)
            tagLabel.isHidden = true
            centerOffset = .zero

            if item.profile.isPriorityTraffic {
                addPriorityPulse(color: tint)
            }
        }
    }

    private func addPriorityPulse(color: UIColor) {
        let animation = CABasicAnimation(keyPath: "transform.scale")
        animation.fromValue = 0.92
        animation.toValue = 1.20
        animation.duration = 0.60
        animation.autoreverses = true
        animation.repeatCount = .infinity
        haloView.layer.add(animation, forKey: "priorityPulse")

        let opacity = CABasicAnimation(keyPath: "opacity")
        opacity.fromValue = 0.35
        opacity.toValue = 0.95
        opacity.duration = 0.60
        opacity.autoreverses = true
        opacity.repeatCount = .infinity
        haloView.layer.shadowColor = color.cgColor
        haloView.layer.shadowRadius = 14
        haloView.layer.shadowOpacity = 0.9
        haloView.layer.shadowOffset = .zero
        haloView.layer.add(opacity, forKey: "priorityOpacity")
    }

    private func color(for kind: TVTrafficKind) -> UIColor {
        switch kind {
        case .civilSecurity:
            return UIColor(red: 1.00, green: 0.62, blue: 0.03, alpha: 1)
        case .military:
            return UIColor(red: 0.95, green: 0.08, blue: 0.14, alpha: 1)
        case .helicopter, .medical:
            return UIColor(red: 0.05, green: 0.78, blue: 0.36, alpha: 1)
        case .surveillance:
            return UIColor(red: 0.62, green: 0.35, blue: 0.98, alpha: 1)
        case .airline:
            return UIColor(red: 0.00, green: 0.69, blue: 1.00, alpha: 1)
        case .lightPrivate:
            return UIColor(white: 0.96, alpha: 1)
        case .ultralight, .glider:
            return UIColor(red: 0.98, green: 0.76, blue: 0.08, alpha: 1)
        case .drone:
            return UIColor(red: 0.12, green: 0.86, blue: 0.82, alpha: 1)
        case .balloon:
            return UIColor(red: 0.95, green: 0.38, blue: 0.72, alpha: 1)
        case .specialized:
            return UIColor(red: 0.36, green: 0.62, blue: 1.00, alpha: 1)
        case .unknown:
            return UIColor(red: 0.73, green: 0.79, blue: 0.86, alpha: 1)
        }
    }

    private static func helicopterTopDownImage(
        tint: UIColor,
        canvasSize: CGSize
    ) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: canvasSize)
        return renderer.image { imageContext in
            let ctx = imageContext.cgContext
            let w = canvasSize.width
            let h = canvasSize.height

            ctx.setLineCap(.round)
            ctx.setLineJoin(.round)

            // Halo intérieur subtil pour garder le pictogramme lisible au projecteur.
            ctx.setShadow(
                offset: .zero,
                blur: 6,
                color: tint.withAlphaComponent(0.65).cgColor
            )

            // Rotor principal.
            ctx.setStrokeColor(tint.cgColor)
            ctx.setLineWidth(4.3)
            ctx.move(to: CGPoint(x: w * 0.12, y: h * 0.37))
            ctx.addLine(to: CGPoint(x: w * 0.88, y: h * 0.37))
            ctx.strokePath()

            // Mât.
            ctx.setLineWidth(3.3)
            ctx.move(to: CGPoint(x: w * 0.50, y: h * 0.37))
            ctx.addLine(to: CGPoint(x: w * 0.50, y: h * 0.48))
            ctx.strokePath()

            // Fuselage vu du dessus, nez vers le haut.
            let body = UIBezierPath()
            body.move(to: CGPoint(x: w * 0.50, y: h * 0.17))
            body.addCurve(
                to: CGPoint(x: w * 0.66, y: h * 0.48),
                controlPoint1: CGPoint(x: w * 0.64, y: h * 0.24),
                controlPoint2: CGPoint(x: w * 0.69, y: h * 0.37)
            )
            body.addCurve(
                to: CGPoint(x: w * 0.56, y: h * 0.66),
                controlPoint1: CGPoint(x: w * 0.66, y: h * 0.57),
                controlPoint2: CGPoint(x: w * 0.61, y: h * 0.63)
            )
            body.addLine(to: CGPoint(x: w * 0.56, y: h * 0.80))
            body.addLine(to: CGPoint(x: w * 0.64, y: h * 0.88))
            body.addLine(to: CGPoint(x: w * 0.55, y: h * 0.86))
            body.addLine(to: CGPoint(x: w * 0.50, y: h * 0.94))
            body.addLine(to: CGPoint(x: w * 0.45, y: h * 0.86))
            body.addLine(to: CGPoint(x: w * 0.36, y: h * 0.88))
            body.addLine(to: CGPoint(x: w * 0.44, y: h * 0.80))
            body.addLine(to: CGPoint(x: w * 0.44, y: h * 0.66))
            body.addCurve(
                to: CGPoint(x: w * 0.34, y: h * 0.48),
                controlPoint1: CGPoint(x: w * 0.39, y: h * 0.63),
                controlPoint2: CGPoint(x: w * 0.34, y: h * 0.57)
            )
            body.addCurve(
                to: CGPoint(x: w * 0.50, y: h * 0.17),
                controlPoint1: CGPoint(x: w * 0.31, y: h * 0.37),
                controlPoint2: CGPoint(x: w * 0.36, y: h * 0.24)
            )
            tint.setFill()
            body.fill()

            // Patins : deux traits fins donnent immédiatement une silhouette d'hélico.
            ctx.setStrokeColor(UIColor.white.withAlphaComponent(0.86).cgColor)
            ctx.setLineWidth(2.4)
            ctx.move(to: CGPoint(x: w * 0.31, y: h * 0.55))
            ctx.addLine(to: CGPoint(x: w * 0.31, y: h * 0.70))
            ctx.move(to: CGPoint(x: w * 0.69, y: h * 0.55))
            ctx.addLine(to: CGPoint(x: w * 0.69, y: h * 0.70))
            ctx.strokePath()

            ctx.setLineWidth(2.1)
            ctx.move(to: CGPoint(x: w * 0.25, y: h * 0.70))
            ctx.addLine(to: CGPoint(x: w * 0.39, y: h * 0.70))
            ctx.move(to: CGPoint(x: w * 0.61, y: h * 0.70))
            ctx.addLine(to: CGPoint(x: w * 0.75, y: h * 0.70))
            ctx.strokePath()
        }.withRenderingMode(.alwaysOriginal)
    }
}

struct AircraftMapView: UIViewRepresentable {
    let aircraft: [Aircraft]
    let center: CLLocationCoordinate2D
    let trails: [String: [CLLocationCoordinate2D]]
    let selectedID: String?
    let profiles: [String: TVTrafficProfile]
    let routes: [String: String]

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView(frame: .zero)
        map.delegate = context.coordinator
        map.mapType = .standard
        map.pointOfInterestFilter = .excludingAll
        map.overrideUserInterfaceStyle = .light

        // La cartographie XavPac TV est volontairement figée :
        // aucun déplacement, zoom ou réglage n'est possible depuis la télécommande.
        map.isUserInteractionEnabled = false

        let region = MKCoordinateRegion(
            center: center,
            latitudinalMeters: 92_000,
            longitudinalMeters: 92_000
        )
        map.setRegion(region, animated: false)
        // MapKit tvOS ajoute parfois un curseur de zoom blanc malgré le verrouillage.
        // Masquer les widgets natifs (sans toucher à nos marqueurs de trafic).
        DispatchQueue.main.async { [weak map] in
            guard let map else { return }
            Self.hideNativeMapControls(in: map)
        }
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.parent = self
        Self.hideNativeMapControls(in: map)

        map.removeAnnotations(map.annotations)
        map.removeOverlays(map.overlays)

        map.addAnnotation(RadarHomeAnnotation(coordinate: center))
        map.addAnnotations(
            aircraft.prefix(60).enumerated().map { index, item in
                AircraftAnnotation(
                    aircraft: item,
                    isSelected: item.id == selectedID,
                    center: center,
                    profile: profiles[item.id] ?? item.trafficProfile(enrichment: nil),
                    routeLabel: routes[item.id],
                    approachRank: index < 3 ? index + 1 : nil
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
                latitudinalMeters: 92_000,
                longitudinalMeters: 92_000
            )
            map.setRegion(region, animated: false)
        }
    }

    private static func hideNativeMapControls(in view: UIView) {
        for subview in view.subviews {
            let kind = String(describing: type(of: subview)).lowercased()
            // Les contrôles UIKit et leurs vues privées varient selon tvOS.
            // Ne supprimer ni l'image de la carte, ni les overlays, ni les aéronefs.
            if kind.contains("zoomslider")
                || kind.contains("zoomcontrol")
                || kind.contains("compassview") {
                subview.isHidden = true
            } else {
                hideNativeMapControls(in: subview)
            }
        }
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var parent: AircraftMapView
        var lastCenter = CLLocationCoordinate2D(latitude: 0, longitude: 0)

        init(parent: AircraftMapView) {
            self.parent = parent
        }

        func mapViewDidFinishRenderingMap(_ mapView: MKMapView, fullyRendered: Bool) {
            AircraftMapView.hideNativeMapControls(in: mapView)
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            if annotation is RadarHomeAnnotation {
                let identifier = "home-v5"
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                    ?? MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)

                view.annotation = annotation
                view.displayPriority = .required
                view.canShowCallout = false
                let configuration = UIImage.SymbolConfiguration(pointSize: 31, weight: .bold)
                view.image = UIImage(
                    systemName: "house.circle.fill",
                    withConfiguration: configuration
                )?.withTintColor(
                    UIColor(red: 0.05, green: 0.82, blue: 0.95, alpha: 1),
                    renderingMode: .alwaysOriginal
                )
                return view
            }

            guard let aircraftAnnotation = annotation as? AircraftAnnotation else {
                return nil
            }

            let identifier = aircraftAnnotation.isSelected
                ? "aircraft-v5-selected"
                : "aircraft-v5"
            let view = (
                mapView.dequeueReusableAnnotationView(
                    withIdentifier: identifier
                ) as? AircraftAnnotationView
            ) ?? AircraftAnnotationView(
                annotation: annotation,
                reuseIdentifier: identifier
            )

            view.configure(with: aircraftAnnotation)
            return view
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let polyline = overlay as? MKPolyline {
                let renderer = MKPolylineRenderer(polyline: polyline)
                renderer.strokeColor = UIColor(red: 0.00, green: 0.44, blue: 0.78, alpha: 0.92)
                renderer.lineWidth = 6
                renderer.lineJoin = .round
                renderer.lineCap = .round
                return renderer
            }

            if let circle = overlay as? MKCircle {
                let renderer = MKCircleRenderer(circle: circle)
                renderer.strokeColor = UIColor(red: 0.03, green: 0.50, blue: 0.80, alpha: 0.48)
                renderer.fillColor = UIColor(red: 0.15, green: 0.76, blue: 0.98, alpha: 0.025)
                renderer.lineWidth = circle.radius >= 40_000 ? 1.8 : 1.2
                renderer.lineDashPattern = [8, 8]
                return renderer
            }

            return MKOverlayRenderer(overlay: overlay)
        }
    }
}
