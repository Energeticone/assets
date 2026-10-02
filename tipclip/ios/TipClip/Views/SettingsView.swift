// SettingsView.swift — demo vs live backend, server URL, account reset.

import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var state: AppState
    @State private var confirmReset = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Demo mode", isOn: $state.demoMode)
                    if !state.demoMode {
                        TextField("Server URL", text: $state.serverURLString)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                } header: {
                    Text("Backend")
                } footer: {
                    Text(state.demoMode
                         ? "Demo mode runs entirely on-device — tip the clip code “demo” to see the flow."
                         : "Point this at the prototype server (node server.js → http://localhost:8787 in the Simulator, or your Mac’s LAN IP from a device).")
                }

                if state.wearerId != nil {
                    Section("Wearer account") {
                        LabeledContent("Wearer ID", value: state.wearerId ?? "")
                        Button("Reset wearer account", role: .destructive) {
                            confirmReset = true
                        }
                    }
                }

                Section("About") {
                    LabeledContent("Version", value: "1.0 (prototype)")
                    Link("TipClip design docs", destination: URL(string: "https://github.com/Energeticone/assets/tree/master/tipclip")!)
                }
            }
            .navigationTitle("Settings")
            .confirmationDialog("Remove this wearer account from the app?",
                                isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Reset", role: .destructive) { state.wearerId = nil }
            }
        }
    }
}

#Preview {
    SettingsView().environmentObject(AppState())
}
