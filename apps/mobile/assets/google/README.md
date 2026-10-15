# Google sign-in artwork

Sources downloaded 15 October 2026:

- [Google branding guidelines](https://developers.google.com/identity/branding-guidelines)
- [Official button asset bundle](https://developers.google.com/static/identity/images/signin-assets.zip)
- [Official multicolor Google logo](https://developers.google.com/static/identity/images/g-logo.png)

The current button uses the official `g-logo.png` and the unchanged Google Sans label path from the Android + Web light button SVG (`signin-label.svg`). The SVG viewBox includes the label only; its glyph geometry and color are preserved. A native full-width white container supplies the requested accent-colored border without adding a second outline or background around the artwork. Platform-specific logo-to-label spacing is retained.

The React Native control exposes a native accessible “Sign in with Google” label and a minimum 48 dp touch target. Loading and error feedback appear outside the button. The original complete PNG buttons are retained for reference.
