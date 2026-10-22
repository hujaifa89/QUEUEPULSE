# QueuePulse Manual Test Protocols

This document contains manual test protocols requiring real hardware devices and user interaction.

---

## Test Protocol MT-01: Real-Device Web Push on Android Chrome (Phase 7)

**Target Device**: Android Smartphone (Android 10+) running Google Chrome (latest version)  
**Requirement References**: FR-12 (Web Push near-turn alert), FR-07 (QR slip), SEC-08, F-07, F-10  
**Status**: **Not run** *(Awaiting manual execution on physical Android device)*  

### Pre-requisites
1. The QueuePulse server is running with valid VAPID keys (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` configured in `.env.local` or environment).
2. The Android device has network connectivity to the QueuePulse instance (via HTTPS or localhost reverse proxy e.g. ngrok/Cloudflare tunnel; Service Workers require a secure origin).
3. Chrome notifications are enabled in Android OS Settings (`Settings > Apps > Chrome > Notifications > Allowed`).

### Step-by-Step Test Procedure

| Step | Action | Expected Outcome | Result (Pass / Fail) |
|---|---|---|---|
| 1 | On Staff laptop, sign in as Staff (`/login`) and open queue controller (`/dashboard/queues/[id]`). | Staff controller loads; serving counter is displayed. | [ ] |
| 2 | Issue Token #1, #2, #3, and #4. | 4 tokens issued; Token slip displays QR code for Token #4. | [ ] |
| 3 | On Android phone, open the camera / QR scanner and scan Token #4 QR code to navigate to `/t/[code]`. | Visitor Live Page opens in mobile Chrome. Shows "Your Number: #4", People Ahead: 3. | [ ] |
| 4 | On the visitor live page, tap the **"Alert me"** button. | Browser displays native Android Chrome permission prompt: *"queuepulse.app wants to send you notifications"*. | [ ] |
| 5 | Tap **"Allow"** on the browser permission prompt. | The "Alert me" card changes to green state: *"Alerts enabled. We will notify you when your turn is near."* | [ ] |
| 6 | Lock the Android device or switch to the home screen (so Chrome is in the background). | Phone is locked / Chrome backgrounded. | [ ] |
| 7 | On Staff laptop, click **"Next"** button once. | Token #1 becomes Serving; people ahead for Token #4 becomes 2. Outbox trigger fires push delivery. | [ ] |
| 8 | Observe the Android device notification tray. | A push notification arrives with heading *"QueuePulse"* and message *"QueuePulse: 3 people ahead of you (serial #4)"*. Vibration occurs if enabled. | [ ] |
| 9 | Tap the push notification in Android notification drawer. | Chrome focuses/opens the `/t/[code]` visitor live page showing live status and current serving number. | [ ] |
| 10 | Refresh the visitor page. | The push subscription remains active; no duplicate alerts or broken states appear. | [ ] |

### Execution Sign-off
- **Tester Name**: __________________________
- **Date Tested**: __________________________
- **Device Model & OS Version**: __________________________
- **Chrome Version**: __________________________
- **Final Verdict**: [ ] PASSED  /  [ ] FAILED
- **Notes / Observations**:
