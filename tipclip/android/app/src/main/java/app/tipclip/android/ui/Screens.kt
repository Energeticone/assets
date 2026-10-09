package app.tipclip.android.ui

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.tipclip.android.AppState
import app.tipclip.android.ClipProfile
import app.tipclip.android.Dashboard
import app.tipclip.android.GivenTip
import app.tipclip.android.SignupResult
import app.tipclip.android.TipReceipt
import app.tipclip.android.dollars
import app.tipclip.android.wallet.GooglePay
import app.tipclip.android.wallet.SamsungPay
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// Root: three tabs + the tip sheet that NFC taps / links / manual codes open.
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RootScreen(state: AppState, activity: Activity) {
    var tab by rememberSaveable { mutableIntStateOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(tab == 0, onClick = { tab = 0 }, icon = {}, label = { Text("Tip") })
                NavigationBarItem(tab == 1, onClick = { tab = 1 }, icon = {}, label = { Text("My Clip") })
                NavigationBarItem(tab == 2, onClick = { tab = 2 }, icon = {}, label = { Text("Settings") })
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            when (tab) {
                0 -> HomeScreen(state)
                1 -> MyClipScreen(state)
                else -> SettingsScreen(state)
            }
        }
    }

    state.pendingClipId?.let { clipId ->
        ModalBottomSheet(onDismissRequest = { state.pendingClipId = null }) {
            TipSheet(state, activity, clipId) { state.pendingClipId = null }
        }
    }
}

// ---------------------------------------------------------------------------
// Tipper home: NFC hint + manual clip code + history.
// ---------------------------------------------------------------------------

@Composable
fun HomeScreen(state: AppState) {
    var code by rememberSaveable { mutableStateOf("") }

    LazyColumn(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("💸", fontSize = 56.sp)
                    Text("Tap a clip", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Hold your phone against someone’s TipClip —\nit opens here automatically.",
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it },
                    label = { Text("Clip code (try “demo”)") },
                    modifier = Modifier.weight(1f),
                )
                Button(onClick = {
                    if (code.isNotBlank()) {
                        state.pendingClipId = code.trim()
                        code = ""
                    }
                }) { Text("Go") }
            }
        }
        if (state.givenTips.isNotEmpty()) {
            item { Text("Your tips", style = MaterialTheme.typography.titleMedium) }
            items(state.givenTips) { tip: GivenTip ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(tip.wearerName)
                    Text(tip.amountCents.dollars())
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tip sheet: profile → amount grid → wallet-branded pay → success.
// ---------------------------------------------------------------------------

@Composable
fun TipSheet(state: AppState, activity: Activity, clipId: String, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var profile by remember { mutableStateOf<ClipProfile?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Int?>(null) }
    var custom by remember { mutableStateOf("") }
    var paying by remember { mutableStateOf(false) }
    var receipt by remember { mutableStateOf<TipReceipt?>(null) }
    var wallet by remember { mutableStateOf("card") }

    LaunchedEffect(clipId) {
        // Wallet branding: Samsung Pay first on Galaxy devices with the SDK
        // bundled, else Google Pay when the device can show its sheet.
        wallet = when {
            SamsungPay.isAvailable(activity) -> "Samsung Pay"
            GooglePay.isAvailable(activity) -> "Google Pay"
            else -> "card"
        }
        profile = runCatching { state.api.clipProfile(clipId) }
            .onFailure { error = it.message }
            .getOrNull()
    }

    val amountCents = custom.toDoubleOrNull()?.let { (it * 100).toInt() } ?: selected
    val valid = amountCents != null && amountCents in 100..50_000

    Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        when {
            receipt != null -> {
                Text("🎉", fontSize = 64.sp)
                Text(
                    "You’ve tipped ${receipt!!.wearerName} ${receipt!!.amountCents.dollars()}",
                    style = MaterialTheme.typography.headlineSmall,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(16.dp))
                Button(onClick = onDone) { Text("Done") }
            }
            error != null -> {
                Text(error!!, textAlign = TextAlign.Center)
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = onDone) { Text("Close") }
            }
            profile == null -> CircularProgressIndicator(Modifier.padding(40.dp))
            else -> {
                val p = profile!!
                Text(p.wearer.photo, fontSize = 48.sp)
                Text(p.wearer.name, style = MaterialTheme.typography.headlineSmall)
                Text(p.wearer.role, style = MaterialTheme.typography.bodySmall)
                if (p.instantPayout) Text("⚡ Tips reach their bank instantly", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall)
                Spacer(Modifier.height(16.dp))

                LazyVerticalGrid(GridCells.Fixed(3), Modifier.height(130.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(p.presetsCents) { cents ->
                        val choose = { selected = cents; custom = "" }
                        if (selected == cents && custom.isEmpty()) Button(onClick = choose) { Text(cents.dollars()) }
                        else OutlinedButton(onClick = choose) { Text(cents.dollars()) }
                    }
                }
                OutlinedTextField(
                    value = custom,
                    onValueChange = { custom = it; selected = null },
                    label = { Text("Custom amount ($)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(14.dp))

                // Production: for "Google Pay" this launches the sheet from
                // GooglePay.paymentDataRequest(...) and sends the token to
                // Stripe against the clientSecret from POST /api/tip; for
                // "Samsung Pay" the same via PaymentManager (SamsungPay.kt).
                // The prototype settles server-side after the tap.
                Button(
                    enabled = valid && !paying,
                    onClick = {
                        paying = true
                        scope.launch {
                            runCatching { state.api.sendTip(clipId, amountCents!!, null) }
                                .onSuccess {
                                    receipt = it
                                    state.recordGivenTip(GivenTip(it.tipId, it.wearerName, it.amountCents, System.currentTimeMillis()))
                                }
                                .onFailure { error = it.message }
                            paying = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        when {
                            paying -> "Paying…"
                            wallet == "card" -> "Pay ${if (valid) amountCents!!.dollars() else ""}"
                            else -> "Pay ${if (valid) amountCents!!.dollars() + " " else ""}with $wallet"
                        },
                    )
                }
                Text("Appears on your statement as TIPCLIP", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Wearer side: onboarding wizard, then dashboard.
// ---------------------------------------------------------------------------

@Composable
fun MyClipScreen(state: AppState) {
    val wearerId = state.wearerId
    if (wearerId == null) OnboardingScreen(state) else DashboardScreen(state, wearerId)
}

@Composable
fun OnboardingScreen(state: AppState) {
    val scope = rememberCoroutineScope()
    var step by rememberSaveable { mutableIntStateOf(1) }
    var name by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var instant by rememberSaveable { mutableStateOf(true) }
    var dest by rememberSaveable { mutableStateOf("") }
    var signup by remember { mutableStateOf<SignupResult?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Get your clip · step $step of 3", style = MaterialTheme.typography.titleMedium)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        when (step) {
            1 -> {
                OutlinedTextField(name, { name = it }, label = { Text("First name (shown to tippers)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(role, { role = it }, label = { Text("Where you work (optional)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(phone, { phone = it }, label = { Text("Mobile — we text you every tip") }, modifier = Modifier.fillMaxWidth())
                Button(
                    enabled = name.isNotBlank() && !busy,
                    onClick = {
                        busy = true
                        scope.launch {
                            runCatching { state.api.signup(name.trim(), role.trim(), phone.trim()) }
                                .onSuccess { signup = it; step = 2; error = null }
                                .onFailure { error = it.message }
                            busy = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Continue") }
            }
            2 -> {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.weight(1f)) {
                        Text(if (instant) "Debit card — ⚡ instant (minutes)" else "Bank account — 1–2 days")
                        Text("Revolut, Chase, any bank", style = MaterialTheme.typography.bodySmall)
                    }
                    Switch(checked = instant, onCheckedChange = { instant = it })
                }
                OutlinedTextField(dest, { dest = it }, label = { Text(if (instant) "Debit card number" else "Account number") }, modifier = Modifier.fillMaxWidth())
                Button(
                    enabled = dest.isNotBlank() && !busy,
                    onClick = {
                        busy = true
                        scope.launch {
                            val last4 = dest.filter { it.isDigit() }.takeLast(4).ifEmpty { "0000" }
                            runCatching {
                                state.api.connectPayout(signup!!.wearerId, "${if (instant) "Debit card" else "Bank account"} ••$last4", instant)
                            }.onSuccess { step = 3; error = null }.onFailure { error = it.message }
                            busy = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Connect payout") }
                Text(
                    "In production this step is Stripe’s hosted onboarding — TipClip never sees your numbers.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            else -> {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Your clip code", style = MaterialTheme.typography.bodySmall)
                        Text(signup?.clipId ?: "…", style = MaterialTheme.typography.headlineSmall)
                    }
                }
                Text(
                    "New signups get a clip mailed within 3–5 days, pre-encoded with this code.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Button(
                    enabled = !busy,
                    onClick = {
                        busy = true
                        scope.launch {
                            runCatching { state.api.claimClip(signup!!.clipId, signup!!.wearerId) }
                                .onSuccess { state.setWearer(signup!!.wearerId) }
                                .onFailure { error = it.message }
                            busy = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Claim my clip") }
            }
        }
    }
}

@Composable
fun DashboardScreen(state: AppState, wearerId: String) {
    var dashboard by remember { mutableStateOf<Dashboard?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(wearerId) {
        while (true) {
            runCatching { state.api.dashboard(wearerId) }
                .onSuccess { dashboard = it; error = null }
                .onFailure { if (dashboard == null) error = it.message }
            delay(5_000)
        }
    }

    val d = dashboard
    LazyColumn(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when {
            d == null && error != null -> item { Text(error!!) }
            d == null -> item { CircularProgressIndicator(Modifier.padding(40.dp)) }
            else -> {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(d.wearer.photo, fontSize = 36.sp)
                        Column {
                            Text(d.wearer.name, style = MaterialTheme.typography.titleLarge)
                            Text(d.wearer.role, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TotalTile("Today", d.totals.todayCents, Modifier.weight(1f))
                        TotalTile("This week", d.totals.weekCents, Modifier.weight(1f))
                        TotalTile("All time", d.totals.allTimeCents, Modifier.weight(1f))
                    }
                }
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Payout · ${d.payout.label}")
                            Text(if (d.payout.instant) "⚡ Instant" else "1–2 days", color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
                item { Text("Recent tips", style = MaterialTheme.typography.titleMedium) }
                if (d.recent.isEmpty()) item { Text("No tips yet — go say hi 👋", style = MaterialTheme.typography.bodySmall) }
                items(d.recent) { tip ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(14.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(tip.amountCents.dollars(), style = MaterialTheme.typography.titleMedium)
                            Text("${tip.netCents.dollars()} to you", color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TotalTile(label: String, cents: Int, modifier: Modifier = Modifier) {
    Card(modifier) {
        Column(Modifier.padding(14.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(cents.dollars(), style = MaterialTheme.typography.titleMedium)
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}

// ---------------------------------------------------------------------------
// Settings.
// ---------------------------------------------------------------------------

@Composable
fun SettingsScreen(state: AppState) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Demo mode")
                Text("Runs entirely on-device — tip clip code “demo”.", style = MaterialTheme.typography.bodySmall)
            }
            Switch(checked = state.demoMode, onCheckedChange = { state.setDemo(it) })
        }
        if (!state.demoMode) {
            OutlinedTextField(
                value = state.serverUrl,
                onValueChange = { state.setServer(it) },
                label = { Text("Server URL (10.0.2.2 = host from emulator)") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (state.wearerId != null) {
            OutlinedButton(onClick = { state.setWearer(null) }, modifier = Modifier.fillMaxWidth()) {
                Text("Reset wearer account")
            }
        }
        Text("TipClip Android · 1.0 (prototype)", style = MaterialTheme.typography.labelSmall)
    }
}
