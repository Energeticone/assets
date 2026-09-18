// TipClipApp.swift — SwiftUI sketch of the native tipper app.
//
// The web tip page (opened automatically when any iPhone taps a clip's NFC
// tag) is the zero-install path. This app is the power-user layer on top:
// saved card, favourite amount, tip history, and "nearby wearers" via the
// optional BLE-beacon clips.
//
// Illustrative sketch — compiles against iOS 17 SDK concepts; wire real
// networking/payments before shipping.

import SwiftUI
import CoreNFC
import CoreBluetooth
import PassKit

// MARK: - Models

struct WearerProfile: Codable, Identifiable {
    let clipId: String
    let name: String
    let role: String
    let photo: String
    var id: String { clipId }
}

// MARK: - NFC: read a clip's tag (same URL any non-app tap opens)

final class ClipScanner: NSObject, ObservableObject, NFCNDEFReaderSessionDelegate {
    @Published var scannedClipId: String?
    private var session: NFCNDEFReaderSession?

    func beginScan() {
        session = NFCNDEFReaderSession(delegate: self, queue: nil, invalidateAfterFirstRead: true)
        session?.alertMessage = "Hold your iPhone near the TipClip"
        session?.begin()
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        // Tag payload is a URI record: https://tipcl.ip/t/<clipId>
        for message in messages {
            for record in message.records {
                guard let url = record.wellKnownTypeURIPayload(),
                      url.pathComponents.count >= 3, url.pathComponents[1] == "t" else { continue }
                DispatchQueue.main.async { self.scannedClipId = url.pathComponents[2] }
                return
            }
        }
    }

    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {}
}

// MARK: - BLE: discover powered clips nearby (v2 hardware, optional)

final class NearbyWearers: NSObject, ObservableObject, CBCentralManagerDelegate {
    // Powered clips advertise a fixed service UUID with the clip ID in
    // manufacturer data; RSSI gates the list to "within a few meters".
    static let clipService = CBUUID(string: "F1D0-0001-7C1E-4B1D-9E2A-TIPCLIP0BLE0".replacingOccurrences(of: "-", with: ""))
    @Published var nearby: [String] = []   // clip IDs, closest first
    private var central: CBCentralManager!
    private var seen: [String: NSNumber] = [:]

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard central.state == .poweredOn else { return }
        central.scanForPeripherals(withServices: [Self.clipService])
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard RSSI.intValue > -60,   // ≈ within a few meters
              let data = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data,
              let clipId = String(data: data.dropFirst(2), encoding: .utf8) else { return }
        seen[clipId] = RSSI
        nearby = seen.sorted { $0.value.intValue > $1.value.intValue }.map(\.key)
    }
}

// MARK: - UI

struct TipSheet: View {
    let profile: WearerProfile
    @State private var selectedCents: Int? = nil
    @State private var tipped = false
    private let presets = [100, 200, 500, 1000, 2500]   // $1 $2 $5 $10 $25 (+ Custom)

    var body: some View {
        VStack(spacing: 20) {
            if tipped {
                Text("🎉").font(.system(size: 72))
                Text("You've tipped \(profile.name)!").font(.title2.bold())
                Text("They just got a text. You'll get one too.").foregroundStyle(.secondary)
            } else {
                Text(profile.photo).font(.system(size: 56))
                Text(profile.name).font(.title.bold())
                Text(profile.role).foregroundStyle(.secondary)

                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 12) {
                    ForEach(presets, id: \.self) { cents in
                        amountButton("$\(cents / 100)", cents: cents)
                    }
                    amountButton("Custom", cents: nil)   // presents a numeric field
                }

                // Apple Pay: PKPaymentRequest with the selected amount, confirmed
                // against the Stripe PaymentIntent's clientSecret from POST /api/tip.
                Button {
                    Task { await pay() }
                } label: {
                    Label("Pay with Apple Pay", systemImage: "applelogo")
                        .frame(maxWidth: .infinity).padding()
                }
                .buttonStyle(.borderedProminent)
                .disabled(selectedCents == nil)
            }
        }
        .padding(24)
    }

    private func amountButton(_ label: String, cents: Int?) -> some View {
        Button(label) { selectedCents = cents }
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(selectedCents == cents ? Color.green.opacity(0.2) : Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func pay() async {
        // POST /api/tip { clipId, amountCents } → confirm PaymentIntent via PassKit
        tipped = true
    }
}

@main
struct TipClipApp: App {
    @StateObject private var scanner = ClipScanner()

    var body: some Scene {
        WindowGroup {
            VStack(spacing: 24) {
                Text("TipClip").font(.largeTitle.bold())
                Button("Tap a clip") { scanner.beginScan() }
                    .buttonStyle(.borderedProminent)
                // Nearby (BLE) wearer list would render here for v2 clips.
            }
            .sheet(item: Binding(
                get: { scanner.scannedClipId.map { WearerProfile(clipId: $0, name: "Marcus", role: "Valet", photo: "🧑‍✈️") } },
                set: { _ in scanner.scannedClipId = nil }
            )) { profile in
                TipSheet(profile: profile)   // production: fetch GET /api/clip/<id> first
            }
        }
    }
}
