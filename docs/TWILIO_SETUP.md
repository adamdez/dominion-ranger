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

## Twilio Console Configuration

1. **TwiML App** (Console > Voice > TwiML Apps):
   - Voice Request URL: `{BASE_URL}/api/dialer/voice`

2. **Phone Number** (Console > Phone Numbers > Active Numbers):
   - Voice: TwiML App → select your app
   - Messaging Webhook: `{BASE_URL}/api/sms/inbound`
   - Status Callback: `{BASE_URL}/api/sms/status`

## Local Development

```bash
# Install and start ngrok
ngrok http 3100

# Copy the https URL, update BASE_URL in .env
# Update TwiML App Voice URL in Twilio Console
# Update Phone Number webhooks in Twilio Console
```

## Testing

1. Start backend: `npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Open http://localhost:3000/dial-queue
4. Should see "Browser dialer active" in green
5. Click a lead with a phone number → Call via Browser
