# Balance

An Android app that shows one number a day: what you ate minus the share of what you burned.

- **Food:** scan a product barcode (looked up in the open Open Food Facts database), search by name in English or Arabic (about 40 common Egyptian and Arabic foods are built in, plus an online search of packaged products), repeat a recent food, copy yesterday's meal, or add a meal by hand.
- **Activity:** track a run, walk or ride with GPS (it keeps recording with the screen locked), or log any other workout manually with its effort.
- **Reminders:** an optional lunch and day-end notification, skipped on days that meal is already logged.
- **Backup:** save all data to one file and restore it on a new phone.
- **Progress:** 7-day weight average, days in range and weekly active minutes.
- **Team:** private teams of 3 to 5 people are planned for the next version.

All data stays on the phone. There are no accounts and no servers.

## Rules the numbers follow

| Rule | Value |
|---|---|
| Daily target | Mifflin-St Jeor resting energy × 1.2, minus or plus the chosen weekly pace (7,700 kcal per kg) |
| Range | Target ± 10% |
| Minimum target | 1,200 kcal for women, 1,500 kcal for men |
| Losing weight | Not offered below a BMI of 18.5 |
| Age | 18 and over only |
| Activity credit | Half of the estimated burn by default (none, half or all in the profile) |
| Protein | 1.8 g per kg of body weight |
| Active minutes | Hard minutes count double; weekly goal 150 |

Burned energy is always an estimate and is labelled as one.

## Develop

```sh
npm install
npm run dev      # web version in the browser
npm test         # unit tests for the calculation rules
npm run build    # production web build in dist/
```

## Android

Pushing changes under `balance/` runs the **Balance Android build** workflow, which builds a debug APK. Download it from the workflow run's **Artifacts** section, unzip it and install `app-debug.apk` on the phone (Android asks you to allow installing from that source).

To build locally you need Android Studio or the Android SDK with JDK 21:

```sh
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Known limits

- Values for the built-in common foods are typical for home cooking, so they are approximate.
- Barcode coverage is weaker for some local products, so search and manual entry are always one tap away.
- Tracking with the screen locked uses an Android foreground service with a visible notification. Some phone makers stop background apps aggressively; if tracking stops, set the app's battery use to "Unrestricted".
- Reminders and background tracking only work in the Android app, not in a browser.
