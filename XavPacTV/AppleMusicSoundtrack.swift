import Foundation
import MusicKit
import SwiftUI

/// Bande-son Apple Music de XavPac TV.
/// La playlist est celle partagée par l'utilisateur ; elle est résolue sur son
/// propre Apple TV après consentement, sans extraire ses identifiants privés.
/// Si MusicKit n'est pas configuré ou ne peut pas lire la playlist,
/// le son d'ambiance synthétique existant reste disponible.
@MainActor
final class AppleMusicSoundtrack: ObservableObject {
    @Published private(set) var isPlaying = false

    private let sharedPlaylistID = MusicItemID("pl.u-7jUWNk8oEy")
    private let player = ApplicationMusicPlayer.shared

    func start() async -> Bool {
        if isPlaying { return true }

        let authorization = MusicAuthorization.currentStatus == .authorized
            ? MusicAuthorization.Status.authorized
            : await MusicAuthorization.request()
        guard authorization == .authorized else {
            print("XavPac TV : autorisation Apple Music non accordée.")
            return false
        }

        do {
            let subscription = try await MusicSubscription.current
            guard subscription.canPlayCatalogContent else {
                print("XavPac TV : abonnement de lecture Apple Music indisponible.")
                return false
            }

            guard let playlist = await findSharedPlaylist() else {
                print("XavPac TV : playlist Morceaux préférés introuvable pour ce compte.")
                return false
            }
            let populated = try await playlist.with([.tracks])
            guard let tracks = populated.tracks, !tracks.isEmpty else {
                print("XavPac TV : playlist sans morceaux lisibles.")
                return false
            }

            player.queue = ApplicationMusicPlayer.Queue(for: tracks)
            player.state.repeatMode = .all
            try await player.play()
            isPlaying = true
            return true
        } catch {
            print("XavPac TV : Apple Music indisponible : \(error.localizedDescription)")
            return false
        }
    }

    func stop() {
        if isPlaying {
            player.stop()
            isPlaying = false
        }
    }

    private func findSharedPlaylist() async -> Playlist? {
        // Le lien public peut être résolu par le catalogue lorsqu'il est
        // exposé. Cela évite de choisir une autre playlist homonyme.
        let catalogRequest = MusicCatalogResourceRequest<Playlist>(
            matching: \.id,
            equalTo: sharedPlaylistID
        )
        if let response = try? await catalogRequest.response(),
           let playlist = response.items.first {
            return playlist
        }

        // Les playlists personnalisées pl.u-... ne sont pas toujours
        // référencées dans le catalogue ; récupérer celle du compte Apple
        // Music connecté à l'Apple TV.
        var request = MusicLibraryRequest<Playlist>()
        request.limit = 100
        for page in 0..<6 {
            request.offset = page * request.limit
            guard let response = try? await request.response() else { break }
            if let exact = response.items.first(where: { $0.id == sharedPlaylistID }) {
                return exact
            }
            if let named = response.items.first(where: {
                let title = $0.name.folding(options: [.diacriticInsensitive, .caseInsensitive],
                                            locale: Locale(identifier: "fr_FR"))
                return title == "favorite songs" || title == "morceaux preferes"
            }) {
                return named
            }
            if response.items.count < request.limit { break }
        }
        return nil
    }
}
