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
    // Diagnostic discret au pied de l'écran, sans bouton ni réglage.
    @Published private(set) var statusLabel = "APPLE MUSIC : CONNEXION…"

    private let sharedPlaylistID = MusicItemID("pl.u-7jUWNk8oEy")
    private let player = ApplicationMusicPlayer.shared

    func start() async -> Bool {
        // Une autorisation MusicKit acceptée ne garantit pas l'accès aux
        // morceaux : la bibliothèque, l'abonnement et la lecture sont séparés.
        if isPlaying && player.state.playbackStatus == .playing {
            return true
        }
        isPlaying = false
        statusLabel = "APPLE MUSIC : AUTORISATION…"

        let authorization = MusicAuthorization.currentStatus == .authorized
            ? MusicAuthorization.Status.authorized
            : await MusicAuthorization.request()
        guard authorization == .authorized else {
            statusLabel = "APPLE MUSIC : ACCÈS NON AUTORISÉ"
            return false
        }

        do {
            statusLabel = "APPLE MUSIC : ABONNEMENT…"
            let subscription = try await MusicSubscription.current
            guard subscription.canPlayCatalogContent else {
                statusLabel = "APPLE MUSIC : ABONNEMENT INDISPONIBLE"
                print("XavPac TV : abonnement Apple Music non disponible pour MusicKit.")
                return false
            }

            statusLabel = "APPLE MUSIC : RECHERCHE FAVORIS…"
            guard let playlist = await findSharedPlaylist() else {
                statusLabel = "APPLE MUSIC : PLAYLIST INTROUVABLE"
                print("XavPac TV : Favorite Songs introuvable via l'identifiant partagé et la bibliothèque.")
                return false
            }
            let populated = try await playlist.with([.tracks])
            guard let tracks = populated.tracks, !tracks.isEmpty else {
                statusLabel = "APPLE MUSIC : PLAYLIST SANS PISTES"
                print("XavPac TV : Apple Music n'a retourné aucun morceau de la playlist.")
                return false
            }

            statusLabel = "APPLE MUSIC : DÉMARRAGE…"
            player.queue = ApplicationMusicPlayer.Queue(for: tracks)
            player.state.repeatMode = .all
            try await player.play()

            isPlaying = true
            statusLabel = "FAVORIS APPLE MUSIC"
            return true
        } catch {
            // Ce message s'affiche à la TV afin de distinguer le service
            // MusicKit refusé d'un simple problème de données radar.
            statusLabel = "APPLE MUSIC : SERVICE OU LECTURE INDISPONIBLE"
            print("XavPac TV : échec MusicKit : \(error.localizedDescription)")
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
