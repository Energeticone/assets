package app.tipclip.android

// Data models mirroring the tipclip/server JSON API.

data class WearerSummary(val id: String, val name: String, val role: String, val photo: String)

data class ClipProfile(
    val clipId: String,
    val wearer: WearerSummary,
    val presetsCents: List<Int>,
    val instantPayout: Boolean,
)

data class TipReceipt(val tipId: String, val wearerName: String, val amountCents: Int)

data class Payout(val label: String, val instant: Boolean)

data class DashboardTotals(val todayCents: Int, val weekCents: Int, val allTimeCents: Int, val count: Int)

data class RecentTip(val amountCents: Int, val netCents: Int, val createdAt: String)

data class Dashboard(
    val wearer: WearerSummary,
    val payout: Payout,
    val totals: DashboardTotals,
    val recent: List<RecentTip>,
)

data class SignupResult(val wearerId: String, val clipId: String)

/** A tip the local user gave, kept on-device for the history list. */
data class GivenTip(val id: String, val wearerName: String, val amountCents: Int, val atMillis: Long)

fun Int.dollars(): String {
    val whole = this / 100
    val cents = this % 100
    return if (cents == 0) "$$whole" else "$$whole.%02d".format(cents)
}
