// APIClient.swift — the app's data layer.
//
// `TipClipAPI` is the one interface the views talk to. Two implementations:
//   • DemoAPI — in-memory, no network. The default, so the app runs in the
//     Simulator (and on a device without the backend) out of the box.
//   • LiveAPI — JSON over HTTP against tipclip/server (node server.js).
// Switch between them, and set the server URL, in Settings.

import Foundation

protocol TipClipAPI: Sendable {
    func clipProfile(_ clipId: String) async throws -> ClipProfile
    func sendTip(clipId: String, amountCents: Int, tipperPhone: String?) async throws -> TipReceipt
    func dashboard(wearerId: String) async throws -> Dashboard
    func signup(name: String, role: String, phone: String) async throws -> SignupResult
    func connectPayout(wearerId: String, label: String, instant: Bool) async throws
    func claimClip(clipId: String, wearerId: String) async throws
}

enum APIError: LocalizedError {
    case badURL
    case server(String)
    case unknownClip

    var errorDescription: String? {
        switch self {
        case .badURL: return "The server URL in Settings isn't valid."
        case .server(let message): return message
        case .unknownClip: return "That clip hasn't been claimed yet."
        }
    }
}

// MARK: - Live backend

struct LiveAPI: TipClipAPI {
    let baseURL: URL

    func clipProfile(_ clipId: String) async throws -> ClipProfile {
        try await get("api/clip/\(clipId)")
    }

    func sendTip(clipId: String, amountCents: Int, tipperPhone: String?) async throws -> TipReceipt {
        var body: [String: Any] = ["clipId": clipId, "amountCents": amountCents]
        if let tipperPhone, !tipperPhone.isEmpty { body["tipperPhone"] = tipperPhone }
        return try await post("api/tip", body: body)
    }

    func dashboard(wearerId: String) async throws -> Dashboard {
        try await get("api/wearer/\(wearerId)")
    }

    func signup(name: String, role: String, phone: String) async throws -> SignupResult {
        try await post("api/signup", body: ["name": name, "role": role, "phone": phone])
    }

    func connectPayout(wearerId: String, label: String, instant: Bool) async throws {
        let _: OKResponse = try await post("api/wearer/\(wearerId)/payout", body: ["label": label, "instant": instant])
    }

    func claimClip(clipId: String, wearerId: String) async throws {
        let _: OKResponse = try await post("api/clip/\(clipId)/claim", body: ["wearerId": wearerId])
    }

    // MARK: plumbing

    private struct OKResponse: Decodable { let ok: Bool }
    private struct ErrorResponse: Decodable { let error: String }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        try await request(path, method: "GET", body: nil)
    }

    private func post<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        let data = try JSONSerialization.data(withJSONObject: body)
        return try await request(path, method: "POST", body: data)
    }

    private func request<T: Decodable>(_ path: String, method: String, body: Data?) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.httpBody = body
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.server("No response") }
        guard (200..<300).contains(http.statusCode) else {
            if let err = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw APIError.server(err.error)
            }
            throw APIError.server("Server error (\(http.statusCode))")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

// MARK: - Demo mode

/// Seeded, in-memory stand-in for the backend so the whole app works with no
/// server: Marcus the valet is wearing clip "demo", and his dashboard fills up
/// as you tip him.
actor DemoStore {
    static let shared = DemoStore()

    private var wearers: [String: (summary: WearerSummary, phone: String, payout: Payout)] = [
        "w_demo": (
            WearerSummary(id: "w_demo", name: "Marcus", role: "Valet · St. Mary’s Hospital", photo: "🧑‍✈️"),
            "+15550100",
            Payout(provider: "stripe_instant", label: "Revolut ••4821", instant: true)
        ),
    ]
    private var clips: [String: String] = ["demo": "w_demo"]   // clipId → wearerId
    private var tips: [String: [RecentTip]] = [:]              // wearerId → tips, newest first

    func profile(_ clipId: String) throws -> ClipProfile {
        guard let wearerId = clips[clipId], let wearer = wearers[wearerId] else { throw APIError.unknownClip }
        return ClipProfile(clipId: clipId, wearer: wearer.summary,
                           presetsCents: [100, 200, 500, 1000, 2500],
                           instantPayout: wearer.payout.instant)
    }

    func tip(clipId: String, amountCents: Int) throws -> TipReceipt {
        guard let wearerId = clips[clipId], let wearer = wearers[wearerId] else { throw APIError.unknownClip }
        let fee = min(amountCents, 30 + Int((Double(amountCents) * 0.05).rounded()))
        let entry = RecentTip(amountCents: amountCents, netCents: amountCents - fee,
                              createdAt: ISO8601DateFormatter.tipclipFractional.string(from: Date()))
        tips[wearerId, default: []].insert(entry, at: 0)
        return TipReceipt(ok: true, tipId: "tip_demo_\(UUID().uuidString.prefix(8))",
                          wearerName: wearer.summary.name, amountCents: amountCents)
    }

    func dashboard(_ wearerId: String) throws -> Dashboard {
        guard let wearer = wearers[wearerId] else { throw APIError.server("Unknown wearer") }
        let recent = tips[wearerId] ?? []
        let now = Date()
        let dayStart = Calendar.current.startOfDay(for: now)
        let weekAgo = now.addingTimeInterval(-7 * 86400)
        func sum(_ since: Date) -> Int { recent.filter { $0.date >= since }.reduce(0) { $0 + $1.netCents } }
        return Dashboard(
            wearer: DashboardWearer(id: wearerId, name: wearer.summary.name, role: wearer.summary.role,
                                    photo: wearer.summary.photo, payout: wearer.payout),
            totals: DashboardTotals(todayCents: sum(dayStart), weekCents: sum(weekAgo),
                                    allTimeCents: recent.reduce(0) { $0 + $1.netCents }, count: recent.count),
            recent: recent
        )
    }

    func signup(name: String, role: String, phone: String) -> SignupResult {
        let wearerId = "w_" + UUID().uuidString.prefix(8).lowercased()
        let clipId = "c_" + UUID().uuidString.prefix(8).lowercased()
        wearers[wearerId] = (
            WearerSummary(id: wearerId, name: name, role: role, photo: "🙂"),
            phone,
            Payout(provider: "stripe_instant", label: "not connected", instant: false)
        )
        // The clip stays out of `clips` until claim() binds it to the wearer.
        return SignupResult(wearerId: wearerId, clipId: clipId, tapUrl: "/t/\(clipId)")
    }

    func connectPayout(wearerId: String, label: String, instant: Bool) {
        guard let wearer = wearers[wearerId] else { return }
        wearers[wearerId] = (wearer.summary, wearer.phone,
                             Payout(provider: "stripe_instant", label: label, instant: instant))
    }

    func claim(clipId: String, wearerId: String) {
        clips[clipId] = wearerId
    }
}

struct DemoAPI: TipClipAPI {
    private func pause() async { try? await Task.sleep(for: .milliseconds(350)) }

    func clipProfile(_ clipId: String) async throws -> ClipProfile {
        await pause()
        return try await DemoStore.shared.profile(clipId)
    }

    func sendTip(clipId: String, amountCents: Int, tipperPhone: String?) async throws -> TipReceipt {
        await pause()
        return try await DemoStore.shared.tip(clipId: clipId, amountCents: amountCents)
    }

    func dashboard(wearerId: String) async throws -> Dashboard {
        try await DemoStore.shared.dashboard(wearerId)
    }

    func signup(name: String, role: String, phone: String) async throws -> SignupResult {
        await pause()
        return await DemoStore.shared.signup(name: name, role: role, phone: phone)
    }

    func connectPayout(wearerId: String, label: String, instant: Bool) async throws {
        await pause()
        await DemoStore.shared.connectPayout(wearerId: wearerId, label: label, instant: instant)
    }

    func claimClip(clipId: String, wearerId: String) async throws {
        await pause()
        await DemoStore.shared.claim(clipId: clipId, wearerId: wearerId)
    }
}
