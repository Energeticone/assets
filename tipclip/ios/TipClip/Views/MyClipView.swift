// MyClipView.swift — the wearer's side of the app.
//
// No wearer account yet → the three-step onboarding wizard (about you →
// payout → claim your clip), mirroring public/signup.html. Once onboarded →
// the earnings dashboard, mirroring public/dashboard.html.

import SwiftUI

struct MyClipView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        if let wearerId = state.wearerId {
            DashboardView(wearerId: wearerId)
        } else {
            OnboardingView()
        }
    }
}

// MARK: - Onboarding

struct OnboardingView: View {
    @EnvironmentObject private var state: AppState

    private enum Step: Int { case about = 1, payout, claim }

    @State private var step: Step = .about
    @State private var busy = false
    @State private var errorMessage: String?

    // Step 1
    @State private var name = ""
    @State private var role = ""
    @State private var phone = ""
    // Step 2
    @State private var instantPayout = true
    @State private var destination = ""
    // Step 3
    @State private var signupResult: SignupResult?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    ProgressView(value: Double(step.rawValue), total: 3)
                        .tint(Color.accentColor)
                    switch step {
                    case .about: aboutStep
                    case .payout: payoutStep
                    case .claim: claimStep
                    }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }
                .padding()
            }
            .navigationTitle("Get your clip")
        }
    }

    private var aboutStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Wear it. Get tapped. Get paid.")
                .foregroundStyle(.secondary)
            LabeledField("First name (shown to tippers)", text: $name, prompt: "Marcus")
            LabeledField("Where you work (optional)", text: $role, prompt: "Valet · St. Mary’s Hospital")
            LabeledField("Mobile number — we text you every tip", text: $phone, prompt: "+1 555 010 0000")
                .keyboardType(.phonePad)
            actionButton("Continue", disabled: name.trimmingCharacters(in: .whitespaces).isEmpty) {
                let result = try await state.api.signup(
                    name: name.trimmingCharacters(in: .whitespaces),
                    role: role.trimmingCharacters(in: .whitespaces),
                    phone: phone.trimmingCharacters(in: .whitespaces))
                signupResult = result
                step = .payout
            }
        }
    }

    private var payoutStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            payoutOption(title: "Debit card", subtitle: "Revolut, Chase, any bank’s debit card",
                         badge: "⚡ Instant — minutes", instant: true)
            payoutOption(title: "Bank account", subtitle: "Any US checking account (ACH)",
                         badge: "1–2 days", instant: false)
            LabeledField(instantPayout ? "Debit card number" : "Account number",
                         text: $destination, prompt: "•••• •••• •••• 4821")
                .keyboardType(.numberPad)
            actionButton("Connect payout", disabled: destination.trimmingCharacters(in: .whitespaces).isEmpty) {
                guard let wearerId = signupResult?.wearerId else { return }
                let last4 = String(destination.filter(\.isNumber).suffix(4))
                try await state.api.connectPayout(
                    wearerId: wearerId,
                    label: "\(instantPayout ? "Debit card" : "Bank account") ••\(last4.isEmpty ? "0000" : last4)",
                    instant: instantPayout)
                step = .claim
            }
            Text("In production this step is Stripe’s hosted onboarding — identity verification and card details happen on Stripe, and TipClip never sees your numbers.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var claimStep: some View {
        VStack(spacing: 18) {
            VStack(spacing: 10) {
                Image(systemName: "wave.3.right.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(Color.accentColor)
                Text("Your clip code")
                    .foregroundStyle(.secondary)
                Text(signupResult?.clipId ?? "…")
                    .font(.system(.title3, design: .monospaced).bold())
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
            }
            .frame(maxWidth: .infinity)
            .padding(24)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))

            Text("New signups get a clip mailed within 3–5 days, pre-encoded with this code. Have it in hand already? The code on the back must match.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            actionButton("Claim my clip", disabled: false) {
                guard let result = signupResult else { return }
                try await state.api.claimClip(clipId: result.clipId, wearerId: result.wearerId)
                state.wearerId = result.wearerId   // flips MyClipView to the dashboard
            }
        }
    }

    // MARK: helpers

    private func payoutOption(title: String, subtitle: String, badge: String, instant: Bool) -> some View {
        Button {
            instantPayout = instant
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.headline)
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(badge).font(.caption).foregroundStyle(Color.accentColor)
            }
            .padding()
            .background(
                instantPayout == instant ? Color.accentColor.opacity(0.12) : Color(.secondarySystemBackground),
                in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14)
                .strokeBorder(instantPayout == instant ? Color.accentColor : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }

    private func actionButton(_ title: String, disabled: Bool, action: @escaping () async throws -> Void) -> some View {
        Button {
            Task {
                busy = true
                errorMessage = nil
                do { try await action() } catch { errorMessage = error.localizedDescription }
                busy = false
            }
        } label: {
            Group {
                if busy { ProgressView() } else { Text(title).font(.headline) }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .disabled(disabled || busy)
    }
}

private struct LabeledField: View {
    let label: String
    @Binding var text: String
    let prompt: String

    init(_ label: String, text: Binding<String>, prompt: String) {
        self.label = label
        self._text = text
        self.prompt = prompt
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            TextField(prompt, text: $text)
                .textFieldStyle(.roundedBorder)
        }
    }
}

// MARK: - Dashboard

struct DashboardView: View {
    let wearerId: String

    @EnvironmentObject private var state: AppState
    @State private var dashboard: Dashboard?
    @State private var errorMessage: String?
    private let refresh = Timer.publish(every: 5, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    if let dashboard {
                        header(dashboard)
                        totals(dashboard.totals)
                        payout(dashboard.wearer.payout)
                        recent(dashboard.recent)
                    } else if let errorMessage {
                        Text(errorMessage).foregroundStyle(.secondary).padding(.top, 60)
                    } else {
                        ProgressView().padding(.top, 60)
                    }
                }
                .padding()
            }
            .navigationTitle("My tips")
            .refreshable { await load() }
            .task { await load() }
            .onReceive(refresh) { _ in Task { await load() } }
        }
    }

    private func load() async {
        do {
            dashboard = try await state.api.dashboard(wearerId: wearerId)
            errorMessage = nil
        } catch {
            if dashboard == nil { errorMessage = error.localizedDescription }
        }
    }

    private func header(_ dashboard: Dashboard) -> some View {
        HStack(spacing: 12) {
            Text(dashboard.wearer.photo).font(.system(size: 44))
            VStack(alignment: .leading, spacing: 2) {
                Text(dashboard.wearer.name).font(.title3.bold())
                Text(dashboard.wearer.role).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private func totals(_ totals: DashboardTotals) -> some View {
        HStack(spacing: 10) {
            totalTile(totals.todayCents, "Today")
            totalTile(totals.weekCents, "This week")
            totalTile(totals.allTimeCents, "All time")
        }
    }

    private func totalTile(_ cents: Int, _ label: String) -> some View {
        VStack(spacing: 4) {
            Text(cents.dollars).font(.headline)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    private func payout(_ payout: Payout) -> some View {
        HStack {
            Text("Payout · \(payout.label)")
                .font(.subheadline)
            Spacer()
            Label(payout.instant ? "Instant" : "1–2 days",
                  systemImage: payout.instant ? "bolt.fill" : "clock")
                .font(.caption.weight(.semibold))
                .foregroundStyle(payout.instant ? Color.accentColor : .secondary)
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    private func recent(_ tips: [RecentTip]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Recent tips").font(.headline)
            if tips.isEmpty {
                Text("No tips yet — go say hi 👋")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            }
            ForEach(tips) { tip in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tip.amountCents.dollars).font(.headline)
                        Text("\(tip.netCents.dollars) to you")
                            .font(.caption)
                            .foregroundStyle(Color.accentColor)
                    }
                    Spacer()
                    Text(tip.date, style: .relative)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    MyClipView().environmentObject(AppState())
}
