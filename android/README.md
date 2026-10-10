# Android WebView app

This Android app opens the deployed web application at `https://pemetaanlingga.vercel.app/`.
It requires an internet connection and keeps navigation inside the WebView limited to that
HTTPS host. Links to other sites open in the device's browser.

The wrapper supports photo/document selection, launching the camera for image fields, and
the location permission requested by the web app. Android asks for location permission
when the app first needs GPS.

## Build a test APK

From this directory, run:

```powershell
.\gradlew.bat :app:assembleDebug
```

The debug APK is written to
`app\build\outputs\apk\debug\app-debug.apk`. It is debug-signed for testing and should
not be distributed as the production APK.

## Build a directly distributed release APK

Create and keep a release keystore outside this repository. Do not commit it or its
passwords. Keep a secure backup: future updates of this app must be signed with the same
keystore and key alias.

With `keytool` installed, create a keystore interactively so passwords are not placed in
the command history:

```powershell
keytool -genkeypair -v -keystore "$HOME\lingga-release.jks" -alias lingga -keyalg RSA -keysize 2048 -validity 10000
```

Set these environment variables in the shell used for the build, then run
`.\gradlew.bat :app:assembleRelease`:

- `LINGGA_KEYSTORE_PATH`
- `LINGGA_KEYSTORE_PASSWORD`
- `LINGGA_KEY_ALIAS`
- `LINGGA_KEY_PASSWORD`

When all four variables are present, Gradle signs the APK at
`app\build\outputs\apk\release\app-release.apk`. Without them, Gradle produces an
unsigned release APK that Android cannot install until it is signed.

Direct APK installation may require users to allow installation from the app they use to
open the APK. Signing the APK with a stable release key helps verify the publisher and
allows updates, but does not guarantee that Play Protect will never show a warning.
