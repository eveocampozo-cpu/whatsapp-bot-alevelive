# Media Files for WhatsApp Bot

This folder contains pre-recorded audio files sent during the onboarding flow.

## Required Files

### `audio_bienvenida.ogg` (First Audio)
- **When sent**: To NEW users after welcome message
- **Content**: Evelin explaining the agency and process overview
- **Duration**: Recommended 30-60 seconds

### `audio_interes.ogg` (Second Audio)
- **When sent**: After user shows interest ("sí", "me gustaría", etc.)
- **Content**: Evelin explaining detailed steps to join
- **Duration**: Recommended 1-2 minutes

## Onboarding Flow

```
1. User: "Hola"
2. Bot: Welcome message + agency link
3. Bot: audio_bienvenida.ogg
4. Bot: "Yo soy streamer y quien da las capacitaciones.."
5. Bot: "te gustaría aprender? 💖"
6. User: "Sí, me interesa!" (or similar)
7. Bot: "¡Súper! 🎉 Te envío un audio..."
8. Bot: audio_interes.ogg
9. [From here: RAG mode for questions/support]
```

## Configuration

Add `BASE_URL` to your `.env`:

```env
BASE_URL=https://your-domain.com
```

For local testing with ngrok:
```env
BASE_URL=https://abc123.ngrok.io
```

## Supported Formats

- OGG (recommended for WhatsApp)
- MP3
- WAV
- AMR

## File Size Limits

- Audio: Max 16 MB
