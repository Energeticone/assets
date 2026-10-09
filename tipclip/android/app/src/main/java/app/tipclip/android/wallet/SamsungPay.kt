package app.tipclip.android.wallet

import android.content.Context

/**
 * Samsung Pay via the Samsung Pay SDK.
 *
 * The SDK (samsungpay.jar) is distributed through the Samsung Pay developer
 * portal — https://pay.samsung.com/developers — not Maven, so this file ships
 * as a documented stub that reports "unavailable" until the jar is dropped
 * into app/libs and the marked lines are uncommented. Two notes that shape
 * the integration:
 *
 *  1. Coverage without the SDK: Galaxy owners who tap a clip WITHOUT the app
 *     installed get the web tip page in Samsung Internet, where Samsung Pay
 *     already surfaces through the W3C Payment Request API
 *     (supportedMethods "https://spay.samsung.com"). So Samsung Pay works
 *     today on the no-install path; this SDK only adds the in-app button.
 *
 *  2. In-app flow mirrors Google Pay: SamsungPay.getSamsungPayStatus() →
 *     PaymentManager.startInAppPayWithCustomSheet() → the returned network
 *     token goes to Stripe (gateway "stripe") against the PaymentIntent from
 *     POST /api/tip.
 *
 * Service type: INAPP_PAYMENT, registered in the Samsung Pay portal with the
 * app's package name and signing certificate.
 */
object SamsungPay {

    /**
     * True when the Samsung Pay app is present, set up, and the SDK is
     * bundled. Stub returns false; the tip sheet then falls back to
     * Google Pay or the plain confirm button.
     */
    @Suppress("UNUSED_PARAMETER")
    fun isAvailable(context: Context): Boolean {
        // With samsungpay.jar in app/libs:
        //
        // val partnerInfo = PartnerInfo(SERVICE_ID, Bundle().apply {
        //     putString(SamsungPay.PARTNER_SERVICE_TYPE, SpaySdk.ServiceType.INAPP_PAYMENT.toString())
        // })
        // SamsungPay(context, partnerInfo).getSamsungPayStatus(...)  // async → SPAY_READY
        return false
    }
}
