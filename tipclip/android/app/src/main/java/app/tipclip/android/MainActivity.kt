package app.tipclip.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color
import app.tipclip.android.ui.RootScreen

class MainActivity : ComponentActivity() {

    lateinit var state: AppState
        private set

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        state = AppState(applicationContext)
        handleIntent(intent)

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = Color(0xFF22C55E),
                    background = Color(0xFF0B0D12),
                    surface = Color(0xFF151923),
                ),
            ) {
                RootScreen(state, this)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** NFC tap, App Link, or tipclip:// deep link → open the tip sheet. */
    private fun handleIntent(intent: Intent?) {
        intent ?: return
        NfcReader.clipIdFrom(intent)?.let { state.pendingClipId = it }
    }
}
