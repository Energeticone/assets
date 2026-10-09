// ClipScanner.swift — Core NFC reading of a TipClip badge.
//
// Each clip's tag holds one NDEF URI record: https://tipcl.ip/t/<clipId>.
// This is the same URL Safari opens for people without the app; here we pull
// the clipId out and stay in-app. On the Simulator (no NFC hardware) the
// Home screen falls back to manual code entry and the demo clip.

import Foundation
import CoreNFC

@MainActor
final class ClipScanner: NSObject, ObservableObject {
    @Published var scannedClipId: String?
    @Published var lastError: String?

    static var isAvailable: Bool { NFCNDEFReaderSession.readingAvailable }

    private var session: NFCNDEFReaderSession?

    func beginScan() {
        guard Self.isAvailable else {
            lastError = "NFC isn’t available on this device. Enter the clip code instead."
            return
        }
        lastError = nil
        session = NFCNDEFReaderSession(delegate: self, queue: nil, invalidateAfterFirstRead: true)
        session?.alertMessage = "Hold your iPhone near the TipClip"
        session?.begin()
    }

    /// Pulls the clip ID out of a tap URL: https://tipcl.ip/t/<clipId>,
    /// http://localhost:8787/t/<clipId>, or tipclip://t/<clipId>.
    nonisolated static func clipId(from url: URL) -> String? {
        var components = url.pathComponents.filter { $0 != "/" }
        if url.scheme == "tipclip" {
            // tipclip://t/<id> parses host="t", path="/<id>"
            if let host = url.host { components.insert(host, at: 0) }
        }
        guard let tIndex = components.firstIndex(of: "t"), components.count > tIndex + 1 else { return nil }
        return components[tIndex + 1]
    }
}

extension ClipScanner: NFCNDEFReaderSessionDelegate {
    nonisolated func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        for message in messages {
            for record in message.records {
                guard let url = record.wellKnownTypeURIPayload(),
                      let clipId = Self.clipId(from: url) else { continue }
                Task { @MainActor in self.scannedClipId = clipId }
                return
            }
        }
        Task { @MainActor in self.lastError = "That tag isn’t a TipClip." }
    }

    nonisolated func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        let nfcError = error as? NFCReaderError
        // User cancelling or the session ending after a successful read is not an error.
        guard let nfcError,
              nfcError.code != .readerSessionInvalidationErrorUserCanceled,
              nfcError.code != .readerSessionInvalidationErrorFirstNDEFTagRead else { return }
        let message = error.localizedDescription
        Task { @MainActor in self.lastError = message }
    }
}
