<!-- apk: 0.15.0 -->
<!-- electron: 44.11.5 -->
# ALTTER 0.21.2

## Poprawki

- **Lektor przez VoiceStudio działa:** ALTTER używa API VoiceStudio zgodnego z OpenAI (`/v1/audio/speech`, `/v1/audio/voices`). Wcześniej VoiceStudio wyglądało na wyłączone, choć działało.
- **Czasy słów do napisów** liczy lokalny Whisper ALTTER-a na procesorze, zamiast drugiego modelu na karcie graficznej. Na kartach z 4 GB pamięci nagrywanie już się nie zawiesza.
- To samo dla agentów robiących rolki (`voice.mjs`).
