// HomeView.swift — the tipper's side: tap a clip, tip, see your history.

import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var state: AppState
    @StateObject private var scanner = ClipScanner()
    @State private var manualCode = ""
    @State private var showManualEntry = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    tapButton
                    if let error = scanner.lastError {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    alternatives
                    if !state.givenTips.isEmpty {
                        history
                    }
                }
                .padding()
            }
            .navigationTitle("TipClip")
            .onChange(of: scanner.scannedClipId) { _, clipId in
                if let clipId {
                    state.pendingClipId = clipId
                    scanner.scannedClipId = nil
                }
            }
        }
    }

    private var tapButton: some View {
        Button {
            if ClipScanner.isAvailable {
                scanner.beginScan()
            } else {
                showManualEntry = true
            }
        } label: {
            VStack(spacing: 12) {
                Image(systemName: "wave.3.right.circle.fill")
                    .font(.system(size: 64))
                Text("Tap a clip")
                    .font(.title2.bold())
                Text(ClipScanner.isAvailable
                     ? "Hold your iPhone near someone’s TipClip"
                     : "No NFC here — enter a clip code instead")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 36)
            .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 24))
        }
        .buttonStyle(.plain)
    }

    private var alternatives: some View {
        VStack(spacing: 10) {
            if showManualEntry || !ClipScanner.isAvailable {
                HStack {
                    TextField("Clip code (try “demo”)", text: $manualCode)
                        .textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Go") {
                        let code = manualCode.trimmingCharacters(in: .whitespaces)
                        guard !code.isEmpty else { return }
                        state.pendingClipId = code
                        manualCode = ""
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else {
                Button("Enter a clip code instead") { showManualEntry = true }
                    .font(.footnote)
            }
        }
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your tips")
                .font(.headline)
            ForEach(state.givenTips) { tip in
                HStack {
                    Text(tip.wearerName)
                    Spacer()
                    Text(tip.amountCents.dollars)
                        .fontWeight(.semibold)
                    Text(tip.date, style: .relative)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 6)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    HomeView().environmentObject(AppState())
}
