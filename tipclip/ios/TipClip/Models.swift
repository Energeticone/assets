// Models.swift — Codable mirrors of the tipclip/server JSON API.

import Foundation

struct WearerSummary: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let role: String
    let photo: String
}

/// GET /api/clip/:clipId
struct ClipProfile: Codable, Identifiable, Hashable {
    let clipId: String
    let wearer: WearerSummary
    let presetsCents: [Int]
    let instantPayout: Bool
    var id: String { clipId }
}

/// POST /api/tip response
struct TipReceipt: Codable, Hashable {
    let ok: Bool
    let tipId: String
    let wearerName: String
    let amountCents: Int
}

struct Payout: Codable, Hashable {
    let provider: String?
    let label: String
    let instant: Bool
}

struct DashboardWearer: Codable, Hashable {
    let id: String
    let name: String
    let role: String
    let photo: String
    let payout: Payout
}

struct DashboardTotals: Codable, Hashable {
    let todayCents: Int
    let weekCents: Int
    let allTimeCents: Int
    let count: Int
}

struct RecentTip: Codable, Identifiable, Hashable {
    let amountCents: Int
    let netCents: Int
    let createdAt: String
    var id: String { createdAt + String(amountCents) }

    var date: Date {
        ISO8601DateFormatter.tipclipFractional.date(from: createdAt)
            ?? ISO8601DateFormatter().date(from: createdAt)
            ?? .distantPast
    }
}

/// GET /api/wearer/:wearerId
struct Dashboard: Codable, Hashable {
    let wearer: DashboardWearer
    let totals: DashboardTotals
    let recent: [RecentTip]
}

/// POST /api/signup response
struct SignupResult: Codable, Hashable {
    let wearerId: String
    let clipId: String
    let tapUrl: String
}

/// A tip the local user gave, kept on-device for the history list.
struct GivenTip: Codable, Identifiable, Hashable {
    let id: String
    let wearerName: String
    let amountCents: Int
    let date: Date
}

// MARK: - Helpers

extension Int {
    /// 500 → "$5" · 445 → "$4.45"
    var dollars: String {
        let amount = Double(self) / 100
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = self % 100 == 0 ? 0 : 2
        return formatter.string(from: NSNumber(value: amount)) ?? "$\(amount)"
    }
}

extension ISO8601DateFormatter {
    static let tipclipFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
