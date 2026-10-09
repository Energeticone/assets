// TipClipApp.swift — app entry point and shared state.

import SwiftUI

@MainActor
final class AppState: ObservableObject {
    /// Demo mode (default): in-memory backend, works anywhere with no setup.
    @Published var demoMode: Bool {
        didSet { UserDefaults.standard.set(demoMode, forKey: "demoMode") }
    }

    /// Where LiveAPI points. The prototype server: http://localhost:8787
    @Published var serverURLString: String {
        didSet { UserDefaults.standard.set(serverURLString, forKey: "serverURL") }
    }

    /// Set once the local user finishes wearer onboarding.
    @Published var wearerId: String? {
        didSet { UserDefaults.standard.set(wearerId, forKey: "wearerId") }
    }

    /// A clip waiting to be tipped — set by an NFC scan, a universal link, or
    /// manual code entry. RootView presents the tip sheet whenever it's non-nil.
    @Published var pendingClipId: String?

    /// Tips the local user has given, kept on-device for the history list.
    @Published var givenTips: [GivenTip] {
        didSet {
            if let data = try? JSONEncoder().encode(givenTips) {
                UserDefaults.standard.set(data, forKey: "givenTips")
            }
        }
    }

    var api: TipClipAPI {
        if demoMode { return DemoAPI() }
        guard let url = URL(string: serverURLString) else { return DemoAPI() }
        return LiveAPI(baseURL: url)
    }

    init() {
        let defaults = UserDefaults.standard
        demoMode = defaults.object(forKey: "demoMode") as? Bool ?? true
        serverURLString = defaults.string(forKey: "serverURL") ?? "http://localhost:8787"
        wearerId = defaults.string(forKey: "wearerId")
        if let data = defaults.data(forKey: "givenTips"),
           let tips = try? JSONDecoder().decode([GivenTip].self, from: data) {
            givenTips = tips
        } else {
            givenTips = []
        }
    }
}

@main
struct TipClipApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .onOpenURL { url in
                    // tipclip://t/<clipId> (URL scheme) and, once the domain's
                    // apple-app-site-association is in place, universal links
                    // for https://tipcl.ip/t/<clipId>.
                    if let clipId = ClipScanner.clipId(from: url) {
                        state.pendingClipId = clipId
                    }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Tip", systemImage: "wave.3.right.circle.fill") }
            MyClipView()
                .tabItem { Label("My Clip", systemImage: "person.crop.square.filled.and.at.rectangle") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .sheet(item: Binding(
            get: { state.pendingClipId.map(PendingClip.init) },
            set: { if $0 == nil { state.pendingClipId = nil } }
        )) { pending in
            TipSheetView(clipId: pending.id)
        }
    }
}

/// Identifiable wrapper so a bare clip ID can drive .sheet(item:).
private struct PendingClip: Identifiable {
    let id: String
}
