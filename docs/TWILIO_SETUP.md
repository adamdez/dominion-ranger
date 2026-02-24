# Twilio Setup for Dominion Ranger

## Required Environment Variables

Add to your `.env` file:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxx     (Console dashboard)
TWILIO_AUTH_TOKEN=xxxxxxxx         (Console dashboard)
TWILIO_PHONE_NUMBER=+15091234567   (E.164 format)
TWILIO_TWIML_APP_SID=APxxxxxxxx   (Console > Voice > TwiML Apps)
TWILIO_API_KEY=SKxxxxxxxx          (Console > API Keys)
TWILIO_API_SECRET=xxxxxxxx         (Console > API Keys)
BASE_URL=https://your-backend.com  (or ngrok URL for local dev)
```

### Where to find each value

| Variable | Twilio Console Location |
|----------|------------------------|
| `TWILIO_ACCOUNT_SID` | Dashboard — starts with `AC` |
| `TWILIO_AUTH_TOKEN` | Dashboard — click "Show" |
| `TWILIO_PHONE_NUMBER` | Phone Numbers > Manage > Active Numbers — E.164 format (`+15091234567`) |
| `TWILIO_TWIML_APP_SID` | Voice > TwiML Apps — starts with `AP` |
| `TWILIO_API_KEY` | API Keys — create a Standard key, starts with `SK` |
| `TWILIO_API_SECRET` | API Keys — shown once at creation, save immediately |

## Twilio Console Configuration

### 1. TwiML App (Console > Voice > TwiML Apps)

Create a TwiML App (or use existing):
- **Voice Request URL:** `{BASE_URL}/api/dialer/voice`
- **Status Callback URL:** `{BASE_URL}/api/dialer/status`

This is what Twilio calls when the browser client initiates a call via `device.connect()`.

### 2. Phone Number (Console > Phone Numbers > Active Numbers)

Select your purchased number:
- **Voice Configuration:** TwiML App → select the app you created above
- **Messaging Configuration:**
  - Webhook URL (inbound SMS): `{BASE_URL}/api/sms/inbound`
  - Status Callback URL: `{BASE_URL}/api/sms/status`

### 3. API Key (Console > API Keys)

Create a **Standard** API key. Save both the SID (`SK...`) and Secret immediately — the secret is only shown once.

## Local Development

### Without ngrok (browser calling only)

Set in `.env`:
```
BASE_URL=http://localhost:3100
```

This works because:
- The `@twilio/voice-sdk` browser client connects directly through Twilio's WebSocket — no public URL needed for outgoing calls
- Webhook signature validation is skipped in `NODE_ENV=development`
- Status callbacks and recording callbacks won't fire back to localhost, but core calling works

### With ngrok (full webhook support)

```bash
# Install ngrok (one time)
npm install -g ngrok

# Start tunnel
ngrok http 3100

# You'll get a URL like: https://abc123.ngrok-free.app
```

Then:
1. Set `BASE_URL=https://abc123.ngrok-free.app` in `.env`
2. Update TwiML App Voice URL in Twilio Console to `https://abc123.ngrok-free.app/api/dialer/voice`
3. Update Phone Number webhook URLs in Twilio Console:
   - SMS inbound: `https://abc123.ngrok-free.app/api/sms/inbound`
   - SMS status: `https://abc123.ngrok-free.app/api/sms/status`
4. Restart the backend (`npm run dev`)

**Note:** ngrok URLs change each restart unless you have a paid plan with reserved domains.

### For Production

Set `BASE_URL` to the actual backend URL (e.g., `https://api.dominionhomedeals.com`). Update the TwiML App and Phone Number webhooks in Twilio Console to match.

## Testing the Dialer

1. Start backend: `npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Check startup logs — look for `Twilio dialer status` with `configured: true`
4. Verify dialer status:
   ```bash
   curl http://localhost:3100/api/dialer/status-check -H "X-API-Key: YOUR_ADMIN_TOKEN"
   # Should return: {"configured":true,"clientConfigured":true}
   ```
5. Get a client token:
   ```bash
   curl http://localhost:3100/api/dialer/token -H "X-API-Key: YOUR_ADMIN_TOKEN"
   # Should return: {"token":"eyJ...","identity":"admin-bootstrap"}
   ```
6. Open http://localhost:3000/dial-queue
7. You should see "Browser dialer active" in green
8. Navigate to a lead with a phone number
9. Click "Call via Browser" — your browser will ring the lead's phone

## Architecture

```
Browser (@twilio/voice-sdk)
    ↓ WebSocket to Twilio
Twilio Cloud
    ↓ HTTP POST to TwiML App Voice URL
Backend /api/dialer/voice
    ↓ Returns TwiML XML
Twilio Cloud
    ↓ Dials the lead's phone
    ↓ Status callbacks → /api/dialer/status
    ↓ Recording callbacks → /api/dialer/recording
```

The browser client handles the audio connection. The backend provides:
- **Token generation** (`/api/dialer/token`) — AccessToken with VoiceGrant
- **Voice TwiML** (`/api/dialer/voice`) — tells Twilio what to do when call connects
- **Status callbacks** (`/api/dialer/status`) — tracks call state changes
- **Recording callbacks** (`/api/dialer/recording`) — stores recording URLs
- **Call logging** — all calls logged to `call_logs` table

## Phone Number Resolution

When initiating a call, `getCallablePhone()` resolves numbers in this order:
1. `properties.phone` (primary)
2. `properties.phone2` (secondary)
3. `properties.phone3` (tertiary)
4. `property_contacts.phone` — skip trace results, filtered by `dnd_calls = false`, ordered by `is_primary DESC`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `configured: false` in status check | Missing `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, or `TWILIO_PHONE_NUMBER` in `.env` |
| `clientConfigured: false` | Missing `TWILIO_API_KEY`, `TWILIO_API_SECRET`, or `TWILIO_TWIML_APP_SID` in `.env` |
| "Browser dialer active" not showing | Check browser console for errors, ensure token endpoint returns valid JWT |
| Calls connect but no audio | TwiML App Voice URL may be wrong — must point to `{BASE_URL}/api/dialer/voice` |
| Status callbacks not received | `BASE_URL` must be publicly reachable — use ngrok for local dev |
| SMS inbound not logging | Phone number webhook must point to `{BASE_URL}/api/sms/inbound` |
