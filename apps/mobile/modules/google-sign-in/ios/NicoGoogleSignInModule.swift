import ExpoModulesCore
import GoogleSignIn
import Security

public class NicoGoogleSignInModule: Module {
  private var signingIn = false

  public func definition() -> ModuleDefinition {
    Name("NicoGoogleSignIn")

    AsyncFunction("signIn") { (webClientId: String, promise: Promise) in
      guard !self.signingIn else {
        promise.reject("ERR_GOOGLE_SIGN_IN_BUSY", "Google sign-in is already open.")
        return
      }
      guard let iosClientId = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
        self.isClientId(iosClientId), self.isClientId(webClientId), iosClientId != webClientId
      else {
        promise.reject(
          "ERR_GOOGLE_SIGN_IN_CONFIG", "Google sign-in is not configured for this iOS app build.")
        return
      }
      let callbackScheme = iosClientId.components(separatedBy: ".").reversed().joined(
        separator: ".")
      let urlTypes =
        Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
      guard
        urlTypes.contains(where: {
          ($0["CFBundleURLSchemes"] as? [String])?.contains(callbackScheme) == true
        })
      else {
        promise.reject(
          "ERR_GOOGLE_SIGN_IN_CONFIG",
          "Rebuild the iOS app with its Google sign-in callback scheme.")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_GOOGLE_SIGN_IN_PRESENTATION", "Open the app before signing in.")
        return
      }
      var bytes = [UInt8](repeating: 0, count: 32)
      guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
        promise.reject("ERR_GOOGLE_SIGN_IN_NONCE", "Google sign-in could not start. Please retry.")
        return
      }
      // Match Android's 32-byte base64url nonce and the backend's strict nonce check.
      let nonce = Data(bytes).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
      self.signingIn = true
      let google = GIDSignIn.sharedInstance
      // Always start from the user's explicit button tap, without restoring a Google session.
      google.signOut()
      google.configuration = GIDConfiguration(clientID: iosClientId, serverClientID: webClientId)
      google.signIn(withPresenting: presenter, hint: nil, additionalScopes: nil, nonce: nonce) {
        result, error in
        self.signingIn = false
        // Only Convex owns the app session. Remove the SDK's cached Google credentials.
        let idToken = result?.user.idToken?.tokenString
        google.signOut()
        if let error = error as NSError? {
          if error.domain == kGIDSignInErrorDomain
            && error.code == GIDSignInError.canceled.rawValue
          {
            promise.resolve(nil)
          } else {
            // Never expose SDK errors, credential data or ID tokens in logs/messages.
            promise.reject(
              "ERR_GOOGLE_SIGN_IN",
              "Google sign-in could not finish. Check your connection and the app's Google sign-in configuration."
            )
          }
          return
        }
        guard let idToken, !idToken.isEmpty else {
          promise.reject(
            "ERR_GOOGLE_SIGN_IN_TOKEN", "Google did not return a sign-in token. Please retry.")
          return
        }
        promise.resolve(["idToken": idToken, "nonce": nonce])
      }
    }
    .runOnQueue(.main)

    AsyncFunction("clearCredentialState") {
      GIDSignIn.sharedInstance.signOut()
    }
    .runOnQueue(.main)
  }

  private func isClientId(_ value: String) -> Bool {
    return value.range(
      of: "^[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com$", options: .regularExpression)
      != nil
  }
}
