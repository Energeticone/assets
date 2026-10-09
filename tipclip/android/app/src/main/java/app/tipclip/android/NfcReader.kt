package app.tipclip.android

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.nfc.NfcAdapter
import android.nfc.NdefMessage

/**
 * Pulls a TipClip clip ID out of whatever launched us: an NFC tap
 * (NDEF_DISCOVERED carries the tag's URI record), an App Link, or a
 * tipclip:// deep link. The tag payload is the same
 * https://tipcl.ip/t/<clipId> URL the browser path uses.
 */
object NfcReader {

    fun clipIdFrom(intent: Intent): String? {
        if (intent.action == NfcAdapter.ACTION_NDEF_DISCOVERED) {
            val raw = intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES)
            raw?.filterIsInstance<NdefMessage>()?.forEach { message ->
                message.records.forEach { record ->
                    record.toUri()?.let { uri -> clipIdFrom(uri)?.let { return it } }
                }
            }
        }
        return intent.data?.let { clipIdFrom(it) }
    }

    fun clipIdFrom(uri: Uri): String? {
        val segments = mutableListOf<String>()
        if (uri.scheme == "tipclip") uri.host?.let { segments.add(it) }
        segments.addAll(uri.pathSegments)
        val tIndex = segments.indexOf("t")
        return if (tIndex >= 0 && segments.size > tIndex + 1) segments[tIndex + 1] else null
    }

    fun hasNfc(context: Context): Boolean = NfcAdapter.getDefaultAdapter(context) != null
}
