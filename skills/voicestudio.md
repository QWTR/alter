---
name: Lektor (VoiceStudio)
description: Voice-overs, narration and dubbing on the user's own computer with VoiceStudio — free and local, no ElevenLabs key. The default voice engine when ElevenLabs is not connected.
triggers: (lektor|lektora|lektorem|g[łl]os(em|u)?\b|nagraj g[łl]os|voice ?-?over|narrat|czytaj|przeczytaj na g[łl]os|text to speech|tts\b|audiobook|dubbing|dubbinguj|podk[łl]ad g[łl]osowy|voicestudio|klon(uj)? g[łl]os|voice clon)
---
VoiceStudio (github.com/debpalash/VoiceStudio, AGPL-3.0) is a free, local voice app with an ElevenLabs-compatible API on `http://127.0.0.1:3900/elevenlabs`. ALTTER uses it for voice-overs whenever ElevenLabs is not connected (Studio → Voice; the user can switch engines there).

**Record a voice-over (always this way, never call the API by hand):**
1. Write the script to a file: one sentence per line, `…` for a pause, hard words spelled as they sound.
2. `node "{{STUDIO}}/voice.mjs" --text-file <script.txt> --out <folder>/voice.mp3 --lang <2-letter language of the script> [--voice "<name or id>"] [--speed 0.95]`
   → `OUTPUT <mp3>` and `TIMES <mp3>.json` = {duration, lines, words} with the time of every word: use them for captions and scene cuts.
   `--list` shows the voices (VoiceStudio: `default` + the user's cloned voices). `--engine voicestudio|elevenlabs` forces one engine.
3. Listen-check by reading the TIMES json: no line much longer than the others, the whole thing fits the reel length (30–45 s ≈ 75–110 Polish words). Too long → shorten the script, not the speed.

**If it prints NO_VOICE_KEY:** VoiceStudio is not running and ElevenLabs is not connected. Tell the user in one line: open the VoiceStudio app (Studio → Voice in ALTTER has the download link; the first run downloads its speech model, the app asks first), then say "go" — or connect ElevenLabs with `[[altter:connect:elevenlabs]]` on its own line.

**Rules:** clone a voice only from a recording of the user's own voice or one they have the right to use — ask if unsure. Generated audio carries VoiceStudio's AI watermark. The default model weights are non-commercial (CC-BY-NC): for paid client work point the user to VoiceStudio's Model Manager to pick a model whose licence allows it.
