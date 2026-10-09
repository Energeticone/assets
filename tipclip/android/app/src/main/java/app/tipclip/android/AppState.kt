package app.tipclip.android

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject

/**
 * App-wide state with SharedPreferences persistence: demo/live backend, the
 * local user's wearer account, a pending clip from an NFC tap or link, and
 * the on-device history of tips given.
 */
class AppState(context: Context) {
    private val prefs = context.getSharedPreferences("tipclip", Context.MODE_PRIVATE)

    var demoMode by mutableStateOf(prefs.getBoolean("demoMode", true))
        private set

    // 10.0.2.2 reaches the host machine's localhost from the Android emulator.
    var serverUrl by mutableStateOf(prefs.getString("serverUrl", "http://10.0.2.2:8787")!!)
        private set

    var wearerId by mutableStateOf(prefs.getString("wearerId", null))
        private set

    /** Clip waiting to be tipped; the UI opens the tip sheet when non-null. */
    var pendingClipId by mutableStateOf<String?>(null)

    var givenTips by mutableStateOf(loadGivenTips())
        private set

    val api: TipClipApi
        get() = if (demoMode) DemoApi else LiveApi(serverUrl)

    fun setDemo(enabled: Boolean) {
        demoMode = enabled
        prefs.edit().putBoolean("demoMode", enabled).apply()
    }

    fun setServer(url: String) {
        serverUrl = url
        prefs.edit().putString("serverUrl", url).apply()
    }

    fun setWearer(id: String?) {
        wearerId = id
        prefs.edit().putString("wearerId", id).apply()
    }

    fun recordGivenTip(tip: GivenTip) {
        givenTips = listOf(tip) + givenTips
        val array = JSONArray()
        givenTips.take(50).forEach {
            array.put(
                JSONObject()
                    .put("id", it.id)
                    .put("wearerName", it.wearerName)
                    .put("amountCents", it.amountCents)
                    .put("atMillis", it.atMillis),
            )
        }
        prefs.edit().putString("givenTips", array.toString()).apply()
    }

    private fun loadGivenTips(): List<GivenTip> = try {
        val array = JSONArray(prefs.getString("givenTips", "[]")!!)
        List(array.length()) { i ->
            val o = array.getJSONObject(i)
            GivenTip(o.getString("id"), o.getString("wearerName"), o.getInt("amountCents"), o.getLong("atMillis"))
        }
    } catch (_: Exception) {
        emptyList()
    }
}
