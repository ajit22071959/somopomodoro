# Somo Pomodoro

Static timer hosted at https://ajit22071959.github.io/somopomodoro/.

## Desktop notifications

- Desktop Chrome/Edge with service workers and at least two advertised notification
  actions: **Stop alarm** and **Start Focus/Break**. Body clicks only stop the alarm;
  the fallback preference is hidden and ignored without erasing its saved value.
- Opera, unrecognized browsers, mobile browsers, or insufficient action support:
  the click-to-start preference appears only while desktop notifications are on.
  Off: request only **Stop alarm**, and body clicks stop. On: request only
  **Start Focus/Break**, and body clicks start the next session.
- In fallback mode with notifications and click-to-start both enabled, the on-page
  **Stop alarm** button is hidden too. Clicking anywhere on the page still silences
  the alarm. Otherwise the on-page Stop button remains available while ringing.
  Test notifications only confirm delivery and never start a session.

Detection is a conservative UA/client-hint heuristic, not proof of a browser bug.
There is no reliable feature test for whether an OS/browser will pass `event.action`.
Browsers hiding their identity may be indistinguishable from Chrome. Some platforms
show no notification buttons at all; body-click fallback still applies. Notification
permission and OS notification/Do Not Disturb settings also matter.

Each notification carries its own body-click policy, next mode, and originating page
ID. Explicit Stop always stops; delivery over the worker and broadcast channels is
deduplicated. Keep the originating timer tab open: closed/reloaded tabs do not retain
a running timer or the original notification's page ID. Refresh after deployment to
load the new page and service worker.

## Regression tests

Node.js 22.13+ (or 24+) required. Run `npm ci && npm test`.

The tests execute the actual inline page script in jsdom and the actual service-worker
script in an isolated VM. They simulate browser identities, capability limits, saved
preferences, checkbox changes, focus/short/long completion, native-constructor fallback,
body/explicit actions, cross-channel deduplication, and unrelated tabs. They do **not**
exercise real Opera/Chrome/Edge native OS notification UI or establish an Opera bug.
