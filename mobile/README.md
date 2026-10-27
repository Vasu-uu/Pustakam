# Pustakam for Android

This folder turns the Pustakam website (`index.html`, `style.css`, `script.js` in the folder above) into an Android app using [Capacitor](https://capacitorjs.com). The app shows the same pages, so **keep editing the website files** — the app picks up your changes the next time you build it.

## What's different in the app

- **Works offline.** The fonts are bundled inside the app instead of loaded from Google Fonts.
- **Backups.** *Download backup* saves the CSV to **Documents/Pustakam** on the phone (open it with the Files app). The message that appears has a **Share** button to send it to Drive, email, WhatsApp or another phone.
- **Restore** opens the phone's file picker, so you can pick a CSV from Downloads, Drive and so on.
- **Back button** closes the open form, dialog or menu first, then clears the search and filters, and only then leaves the app.
- **Status bar** icons switch between dark and light with the app's theme.
- The app has its own icon (the green book) and splash screen.

Books are stored inside the app on the phone, separately from any browser. To move books between the website and the app, use *Download backup* in one and *Restore from backup* in the other.

## Install the app on your phone

The app is **`Pustakam.apk`** in this `mobile` folder (about 1.7 MB). It is an optimised, signed release build.

1. Copy `Pustakam.apk` to your phone (USB cable, Google Drive, email to yourself…).
2. Open it on the phone. Android will ask you to allow installing apps from that source (Files, Drive or Chrome) — allow it once.
3. Tap **Install**. Pustakam appears with your other apps.

Or, with the phone plugged in over USB and *USB debugging* turned on in Developer options:

```bash
adb install -r Pustakam.apk
```

Installing a newer `Pustakam.apk` over the old one keeps your books. Android may show a Play Protect notice for apps that don't come from the Play Store; choose *Install anyway*.

## Building it again after changing the website

You need Node.js, the Android SDK and **Java 21** (Capacitor 8 does not build with Java 17). On this computer Java 21 is in `C:UsersUSER.jdksjdk-21.0.12.1+1`, and the build script finds it there by itself.

From this `mobile` folder:

```bash
npm run build:apk
```

That copies the website into `www/`, updates the Android project and builds a new `Pustakam.apk`. On a new computer, run `npm install` first. Before sharing a new version, raise `versionCode` (and `versionName`) in `android/app/build.gradle`.

What makes the app small and quick:

- Android code shrinking (R8) and resource shrinking remove everything the app doesn't use (6.1 MB → 1.7 MB).
- `script.js` and `style.css` are minified in the app copy (your website files stay readable).
- Only the font files Pustakam needs are bundled: Latin and Malayalam, in the compact woff2 format.
- Books are drawn 40 at a time as you scroll, and cards far off screen aren't drawn at all — big catalogues stay smooth.
- Only the first few cards animate, and searching updates the list instantly without animations.
- In the app (the `is-app` class that `scripts/copy-web.mjs` adds), the frosted-glass blur is replaced by solid colours, the books appear without the website's short loading pause, and animations are shorter.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build:debug` | Build `Pustakam-debug.apk` for testing (can be inspected with Chrome's `chrome://inspect`) |
| `npm run sync` | Copy the website into the app without building |
| `npm run icons` | Redraw the app icon and splash screen (`scripts/make-icon.mjs`) |
| `npm run open` | Open the Android project in Android Studio |

## Signing key — keep it safe

Release builds are signed with `android/pustakam-release.jks`; its passwords are in `android/keystore.properties`. Both are kept out of git on purpose.

**Back up both files somewhere safe** (a USB stick or a private cloud folder). Android only installs an update over an existing app when it is signed with the same key. If the key is lost, a new build can't be installed over the old one — you'd have to uninstall first, which deletes the books on that phone (download a backup first).

The same key can be used later to publish on Google Play: open the project with `npm run open` and choose **Build → Generate Signed App Bundle / APK** with this key.

## Files

| Path | Purpose |
| --- | --- |
| `capacitor.config.json` | App name, app ID (`com.pustakam.app`) and settings |
| `scripts/copy-web.mjs` | Copies the website into `www/` and bundles the fonts |
| `scripts/make-icon.mjs` | Draws the icon and splash images into `assets/` |
| `scripts/build-apk.mjs` | Runs the Android build with Java 21 and copies the APK here |
| `android/app/src/main/java/com/pustakam/app/WindowColorPlugin.java` | Colours the status/navigation bar strips to match the theme |
| `android/` | The Android project (open it in Android Studio if you like) |
| `www/` | Generated — don't edit, it's replaced on every build |

## iPhone

Capacitor can also make an iPhone app from the same files, but building it needs a Mac with Xcode.
