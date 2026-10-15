package expo.modules.nicogooglesignin

import android.content.MutableContextWrapper
import android.util.Base64
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.SecureRandom
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class NicoGoogleSignInModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NicoGoogleSignIn")

    AsyncFunction("signIn") Coroutine { webClientId: String ->
      if (!webClientId.endsWith(".apps.googleusercontent.com")) {
        throw CodedException("Google sign-in is not configured for this app.")
      }
      val activity = appContext.currentActivity
        ?: throw CodedException("Open the app before signing in.")
      val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
      val nonce = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
      // Called only by the sign-in button. Always let the user choose an account.
      val option = GetGoogleIdOption.Builder()
        .setServerClientId(webClientId)
        .setFilterByAuthorizedAccounts(false)
        .setAutoSelectEnabled(false)
        .setNonce(nonce)
        .build()
      val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
      try {
        val response = withContext(Dispatchers.Main) {
          val manager = CredentialManager.create(activity)
          try {
            manager.getCredential(MutableContextWrapper(activity), request)
          } catch (_: NoCredentialException) {
            // The sheet may be unavailable (e.g. disabled prompts or no device accounts).
            // Keep sign-in available; dismissing the sheet never triggers this fallback.
            val fallback = GetSignInWithGoogleOption.Builder(webClientId).setNonce(nonce).build()
            val fallbackRequest = GetCredentialRequest.Builder().addCredentialOption(fallback).build()
            manager.getCredential(MutableContextWrapper(activity), fallbackRequest)
          }
        }
        val credential = response.credential
        if (credential !is CustomCredential ||
          credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
          throw CodedException("Google returned an unsupported sign-in response.")
        }
        val google = GoogleIdTokenCredential.createFrom(credential.data)
        mapOf("idToken" to google.idToken, "nonce" to nonce)
      } catch (_: GetCredentialCancellationException) {
        null
      } catch (_: GetCredentialException) {
        // Never include credential data or ID tokens in errors/logs.
        throw CodedException("Google sign-in could not start. Check Google Play services and the app's Google sign-in configuration.")
      }
    }

    AsyncFunction("clearCredentialState") Coroutine { ->
      val context = appContext.reactContext
        ?: throw CodedException("The app is unavailable.")
      CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest())
    }
  }
}
