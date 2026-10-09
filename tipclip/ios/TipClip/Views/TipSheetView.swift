// TipSheetView.swift — the tipping flow: pick an amount, confirm, done.
//
// Payment note: the prototype backend settles the tip server-side (its mock
// provider, or Stripe when the server has keys). When the production Stripe
// integration lands, the Pay button becomes an Apple Pay sheet confirming the
// PaymentIntent clientSecret that POST /api/tip already returns.

import SwiftUI

struct TipSheetView: View {
    let clipId: String

    @EnvironmentObject private var state: AppState
    @Environment(\.dismiss) private var dismiss

    private enum Phase {
        case loading
        case ready(ClipProfile)
        case paying(ClipProfile)
        case done(TipReceipt)
        case failed(String)
    }

    @State private var phase: Phase = .loading
    @State private var selectedCents: Int?
    @State private var customAmount = ""
    @State private var useCustom = false
    @State private var phone = ""

    private var amountCents: Int? {
        if useCustom {
            guard let value = Double(customAmount) else { return nil }
            return Int((value * 100).rounded())
        }
        return selectedCents
    }

    private var amountValid: Bool {
        guard let cents = amountCents else { return false }
        return (100...50000).contains(cents)
    }

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .loading:
                    ProgressView("Finding the clip…")
                case .ready(let profile), .paying(let profile):
                    form(profile)
                case .done(let receipt):
                    success(receipt)
                case .failed(let message):
                    failure(message)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Leave a tip")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await load() }
        }
        .presentationDetents([.large])
    }

    // MARK: - Screens

    private func form(_ profile: ClipProfile) -> some View {
        ScrollView {
            VStack(spacing: 20) {
                VStack(spacing: 6) {
                    Text(profile.wearer.photo).font(.system(size: 56))
                    Text(profile.wearer.name).font(.title.bold())
                    Text(profile.wearer.role).foregroundStyle(.secondary).font(.subheadline)
                    if profile.instantPayout {
                        Label("Tips reach their bank instantly", systemImage: "bolt.fill")
                            .font(.caption)
                            .foregroundStyle(Color.accentColor)
                    }
                }

                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 10) {
                    ForEach(profile.presetsCents, id: \.self) { cents in
                        amountButton(cents.dollars, isSelected: !useCustom && selectedCents == cents) {
                            useCustom = false
                            selectedCents = cents
                        }
                    }
                    amountButton("Custom", isSelected: useCustom) {
                        useCustom = true
                        selectedCents = nil
                    }
                }

                if useCustom {
                    TextField("Amount in dollars", text: $customAmount)
                        .keyboardType(.decimalPad)
                        .textFieldStyle(.roundedBorder)
                        .font(.title3.weight(.semibold))
                        .multilineTextAlignment(.center)
                }

                TextField("Your mobile # for a text receipt (optional)", text: $phone)
                    .keyboardType(.phonePad)
                    .textFieldStyle(.roundedBorder)

                Button {
                    Task { await pay(profile) }
                } label: {
                    if case .paying = phase {
                        ProgressView().frame(maxWidth: .infinity).padding(.vertical, 6)
                    } else {
                        Text(amountValid ? "Pay \(amountCents!.dollars)" : "Pay")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!amountValid || isPaying)

                Text("Appears on your statement as TIPCLIP")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
    }

    private func success(_ receipt: TipReceipt) -> some View {
        VStack(spacing: 14) {
            Text("🎉").font(.system(size: 72))
            Text("You’ve tipped \(receipt.wearerName) \(receipt.amountCents.dollars)")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text(phone.isEmpty
                 ? "Thanks for making someone’s day! 💚"
                 : "A text receipt is on its way. Thanks for making someone’s day! 💚")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Done") { dismiss() }
                .buttonStyle(.borderedProminent)
                .padding(.top, 8)
        }
        .padding()
    }

    private func failure(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 44))
                .foregroundStyle(.orange)
            Text(message)
                .multilineTextAlignment(.center)
            Button("Try again") { Task { await load() } }
                .buttonStyle(.bordered)
        }
        .padding()
    }

    private func amountButton(_ label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 54)
        }
        .buttonStyle(.plain)
        .background(
            isSelected ? Color.accentColor.opacity(0.18) : Color(.secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: 14)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(isSelected ? Color.accentColor : .clear, lineWidth: 1.5)
        )
    }

    // MARK: - Actions

    private var isPaying: Bool {
        if case .paying = phase { return true }
        return false
    }

    private func load() async {
        phase = .loading
        do {
            phase = .ready(try await state.api.clipProfile(clipId))
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private func pay(_ profile: ClipProfile) async {
        guard let cents = amountCents, amountValid else { return }
        phase = .paying(profile)
        do {
            let receipt = try await state.api.sendTip(
                clipId: clipId, amountCents: cents,
                tipperPhone: phone.isEmpty ? nil : phone)
            state.givenTips.insert(
                GivenTip(id: receipt.tipId, wearerName: receipt.wearerName,
                         amountCents: receipt.amountCents, date: Date()),
                at: 0)
            phase = .done(receipt)
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}

#Preview {
    TipSheetView(clipId: "demo").environmentObject(AppState())
}
