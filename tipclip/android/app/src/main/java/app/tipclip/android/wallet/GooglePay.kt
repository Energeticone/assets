package app.tipclip.android.wallet

import android.app.Activity
import com.google.android.gms.wallet.IsReadyToPayRequest
import com.google.android.gms.wallet.PaymentDataRequest
import com.google.android.gms.wallet.PaymentsClient
import com.google.android.gms.wallet.Wallet
import com.google.android.gms.wallet.WalletConstants
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject

/**
 * Google Pay via the Google Pay API (Play services Wallet).
 *
 * Production flow: `loadPaymentData` opens the Google Pay sheet; the returned
 * token (tokenizationSpecification gateway = "stripe") is attached to the
 * PaymentIntent whose clientSecret POST /api/tip returns, and Stripe settles
 * the charge. In the prototype the backend's mock provider settles instead,
 * so the sheet result is only used to confirm intent.
 *
 * Use WalletConstants.ENVIRONMENT_TEST until the integration is approved in
 * the Google Pay & Wallet Console.
 */
object GooglePay {

    fun client(activity: Activity): PaymentsClient =
        Wallet.getPaymentsClient(
            activity,
            Wallet.WalletOptions.Builder()
                .setEnvironment(WalletConstants.ENVIRONMENT_TEST)
                .build(),
        )

    private fun baseCardPaymentMethod(withToken: Boolean): JSONObject {
        val method = JSONObject()
            .put("type", "CARD")
            .put(
                "parameters",
                JSONObject()
                    .put("allowedAuthMethods", JSONArray(listOf("PAN_ONLY", "CRYPTOGRAM_3DS")))
                    .put("allowedCardNetworks", JSONArray(listOf("AMEX", "DISCOVER", "MASTERCARD", "VISA"))),
            )
        if (withToken) {
            method.put(
                "tokenizationSpecification",
                JSONObject()
                    .put("type", "PAYMENT_GATEWAY")
                    .put(
                        "parameters",
                        JSONObject()
                            .put("gateway", "stripe")
                            .put("stripe:version", "2024-06-20")
                            // The platform's Stripe publishable key:
                            .put("stripe:publishableKey", "pk_test_REPLACE_ME"),
                    ),
            )
        }
        return method
    }

    private fun baseRequest(): JSONObject = JSONObject()
        .put("apiVersion", 2)
        .put("apiVersionMinor", 0)

    /** True when this device can show the Google Pay sheet. */
    suspend fun isAvailable(activity: Activity): Boolean = try {
        val request = baseRequest()
            .put("allowedPaymentMethods", JSONArray().put(baseCardPaymentMethod(withToken = false)))
        client(activity)
            .isReadyToPay(IsReadyToPayRequest.fromJson(request.toString()))
            .await() == true
    } catch (_: Exception) {
        false
    }

    /** The PaymentDataRequest for one tip, ready for `loadPaymentData`. */
    fun paymentDataRequest(amountCents: Int, wearerName: String): PaymentDataRequest {
        val request = baseRequest()
            .put("allowedPaymentMethods", JSONArray().put(baseCardPaymentMethod(withToken = true)))
            .put(
                "transactionInfo",
                JSONObject()
                    .put("totalPrice", "%d.%02d".format(amountCents / 100, amountCents % 100))
                    .put("totalPriceStatus", "FINAL")
                    .put("currencyCode", "USD"),
            )
            .put("merchantInfo", JSONObject().put("merchantName", "TipClip · $wearerName"))
        return PaymentDataRequest.fromJson(request.toString())
    }
}
