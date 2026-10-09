package app.tipclip.android

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/**
 * The app's data layer. [LiveApi] speaks JSON over HTTP to tipclip/server;
 * [DemoApi] is a seeded in-memory stand-in so the app runs on an emulator
 * with no backend — the default, same as the iOS app.
 */
interface TipClipApi {
    suspend fun clipProfile(clipId: String): ClipProfile
    suspend fun sendTip(clipId: String, amountCents: Int, tipperPhone: String?): TipReceipt
    suspend fun dashboard(wearerId: String): Dashboard
    suspend fun signup(name: String, role: String, phone: String): SignupResult
    suspend fun connectPayout(wearerId: String, label: String, instant: Boolean)
    suspend fun claimClip(clipId: String, wearerId: String)
}

class ApiException(message: String) : Exception(message)

class LiveApi(private val baseUrl: String) : TipClipApi {

    override suspend fun clipProfile(clipId: String): ClipProfile {
        val o = request("GET", "api/clip/$clipId", null)
        val w = o.getJSONObject("wearer")
        val presets = o.getJSONArray("presetsCents")
        return ClipProfile(
            clipId = o.getString("clipId"),
            wearer = WearerSummary(w.getString("id"), w.getString("name"), w.optString("role"), w.optString("photo", "🙂")),
            presetsCents = List(presets.length()) { presets.getInt(it) },
            instantPayout = o.optBoolean("instantPayout"),
        )
    }

    override suspend fun sendTip(clipId: String, amountCents: Int, tipperPhone: String?): TipReceipt {
        val body = JSONObject().put("clipId", clipId).put("amountCents", amountCents)
        if (!tipperPhone.isNullOrBlank()) body.put("tipperPhone", tipperPhone)
        val o = request("POST", "api/tip", body)
        return TipReceipt(o.getString("tipId"), o.getString("wearerName"), o.getInt("amountCents"))
    }

    override suspend fun dashboard(wearerId: String): Dashboard {
        val o = request("GET", "api/wearer/$wearerId", null)
        val w = o.getJSONObject("wearer")
        val p = w.getJSONObject("payout")
        val t = o.getJSONObject("totals")
        val recent = o.getJSONArray("recent")
        return Dashboard(
            wearer = WearerSummary(w.getString("id"), w.getString("name"), w.optString("role"), w.optString("photo", "🙂")),
            payout = Payout(p.optString("label", "not connected"), p.optBoolean("instant")),
            totals = DashboardTotals(
                t.getInt("todayCents"), t.getInt("weekCents"), t.getInt("allTimeCents"), t.getInt("count")
            ),
            recent = List(recent.length()) { i ->
                val r = recent.getJSONObject(i)
                RecentTip(r.getInt("amountCents"), r.getInt("netCents"), r.getString("createdAt"))
            },
        )
    }

    override suspend fun signup(name: String, role: String, phone: String): SignupResult {
        val body = JSONObject().put("name", name).put("role", role).put("phone", phone)
        val o = request("POST", "api/signup", body)
        return SignupResult(o.getString("wearerId"), o.getString("clipId"))
    }

    override suspend fun connectPayout(wearerId: String, label: String, instant: Boolean) {
        request("POST", "api/wearer/$wearerId/payout", JSONObject().put("label", label).put("instant", instant))
    }

    override suspend fun claimClip(clipId: String, wearerId: String) {
        request("POST", "api/clip/$clipId/claim", JSONObject().put("wearerId", wearerId))
    }

    private suspend fun request(method: String, path: String, body: JSONObject?): JSONObject =
        withContext(Dispatchers.IO) {
            val conn = URL("${baseUrl.trimEnd('/')}/$path").openConnection() as HttpURLConnection
            try {
                conn.requestMethod = method
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000
                if (body != null) {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.outputStream.use { it.write(body.toString().toByteArray()) }
                }
                val ok = conn.responseCode in 200..299
                val text = (if (ok) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()?.readText() ?: ""
                val json = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
                if (!ok) throw ApiException(json.optString("error", "Server error (${conn.responseCode})"))
                json
            } finally {
                conn.disconnect()
            }
        }
}

/** Marcus the valet is wearing clip "demo"; his dashboard fills up as you tip him. */
object DemoApi : TipClipApi {
    private val wearers = mutableMapOf(
        "w_demo" to Triple(
            WearerSummary("w_demo", "Marcus", "Valet · St. Mary’s Hospital", "🧑‍✈️"),
            Payout("Revolut ••4821", true),
            mutableListOf<RecentTip>(),
        ),
    )
    private val clips = mutableMapOf("demo" to "w_demo")

    override suspend fun clipProfile(clipId: String): ClipProfile {
        val wearerId = clips[clipId] ?: throw ApiException("That clip hasn’t been claimed yet.")
        val (summary, payout, _) = wearers.getValue(wearerId)
        return ClipProfile(clipId, summary, listOf(100, 200, 500, 1000, 2500), payout.instant)
    }

    override suspend fun sendTip(clipId: String, amountCents: Int, tipperPhone: String?): TipReceipt {
        val wearerId = clips[clipId] ?: throw ApiException("That clip hasn’t been claimed yet.")
        val entry = wearers.getValue(wearerId)
        val fee = minOf(amountCents, 30 + (amountCents * 0.05).toInt())
        entry.third.add(0, RecentTip(amountCents, amountCents - fee, "now"))
        return TipReceipt("tip_demo_${UUID.randomUUID().toString().take(8)}", entry.first.name, amountCents)
    }

    override suspend fun dashboard(wearerId: String): Dashboard {
        val (summary, payout, tips) = wearers[wearerId] ?: throw ApiException("Unknown wearer")
        val net = tips.sumOf { it.netCents }
        return Dashboard(summary, payout, DashboardTotals(net, net, net, tips.size), tips.toList())
    }

    override suspend fun signup(name: String, role: String, phone: String): SignupResult {
        val wearerId = "w_" + UUID.randomUUID().toString().take(8)
        val clipId = "c_" + UUID.randomUUID().toString().take(8)
        wearers[wearerId] = Triple(WearerSummary(wearerId, name, role, "🙂"), Payout("not connected", false), mutableListOf())
        return SignupResult(wearerId, clipId)
    }

    override suspend fun connectPayout(wearerId: String, label: String, instant: Boolean) {
        wearers[wearerId]?.let { wearers[wearerId] = Triple(it.first, Payout(label, instant), it.third) }
    }

    override suspend fun claimClip(clipId: String, wearerId: String) {
        clips[clipId] = wearerId
    }
}
