# KHS SRT.Ai 🎙️

An advanced, all-in-one platform for **AI Neural Text-to-Speech (TTS)**, **Multi-Speaker Dialogue Studio**, **Subtitle Synchronizer (SRT & VTT Dubbing)**, and **Web Audio Processing** powered by Microsoft Edge Neural Speech engines.

---

## ✨ Full Suite of Features

### 1. 🎙️ Text-to-Speech Studio
- **322+ AI Neural Voices**: Ultra-lifelike voices across 70+ languages and regional accents (US, UK, Australia, India, Spain, Mexico, France, Germany, Japan, China, Vietnam, Korea, Italy, Brazil, and more).
- **Zero Registration & 100% Free**: Powered by Microsoft Edge's Neural Voice synthesis engine with no API keys or token limits.
- **Natural Voice Tuning**:
  - **Speech Speed / Rate**: Continuous slider from `0.5x` to `2.0x` with 1-click reset.
  - **Voice Pitch**: Modulation from `-50Hz` (deep) to `+50Hz` (high).
  - **Pause Insertion**: Insert custom pauses (e.g. `[pause 0.5s]`, `[pause 1s]`, `[pause 2s]`).
  - **Acronym Spell-Out**: Tag words with `[spell]NASA[/spell]` to spell out letters.
  - **Style Presets**: Natural, Storyteller, Deep Bass, and Brisk Explainer.
  - **Sample Script Presets**: YouTube Explainer, Commercial Ad, Bedtime Story, News Broadcast, Software Guide, and Motivational Quotes.
  - **Output Formats**: High-Definition 96kbps MP3, Standard 48kbps MP3, and Lossless WAV PCM.
  - **Text Cleanup Bar**: Remove line breaks, collapse spaces, straighten curly quotes, sentence casing.
  - **Document Import**: Direct upload for `.txt`, `.md`, `.srt`, and `.vtt` scripts.

### 2. 💬 Multi-Speaker Dialogue Studio (Podcasts & Conversations)
- **Multi-Role Scripting**: Assign different voice actors to different speakers in a single script.
- **Custom Cast**: Create custom speakers (Host, Guest, Narrator, Expert) with individualized voice assignments.
- **Automated Pacing**: Adjust silence pauses between dialogue turns (0.25s Fast, 0.4s Natural, 0.75s Relaxed, 1.2s Dramatic).
- **Unified Master Export**: Stitches multi-person conversational dialogue into a seamless single audio track for podcasts and storytelling.

### 3. 🎬 Subtitle to Speech (SRT & VTT Synchronizer & Dubbing)
- **SRT & WebVTT Support**: Drop `.srt` or `.vtt` subtitle files or test with the built-in sample.
- **Interactive Timeline**: Inspect and edit subtitle cues and timestamps inline.
- **Time Shift Tool**: Shift all subtitle timestamps by `+/- 0.5s` or `+/- 1.0s` with a single click.
- **Batch ZIP Export**: Download all generated cue audio files in an organized ZIP file (`cue_001.mp3`, `cue_002.mp3`, etc.).
- **Master Dubbed Audio Track**: Generates a synchronized continuous dubbing track with exact silence intervals matching the subtitle video timestamps.
- **Export Modified Subtitles**: Save edited `.srt` files directly from the browser.

### 4. 🎛️ Vocal Effects & Background Music (BGM Studio)
- **Vocal FX Presets**:
  - *Clean Studio* (transparent baseline)
  - *Podcast Warmth* (low-shelf warmth + treble clarity)
  - *Telephone Effect* (bandpass 1800Hz)
  - *Retro Radio* (bandpass 2200Hz)
  - *Large Hall Reverb* (convolver impulse response)
  - *Megaphone / Announcer* (highpass 900Hz)
- **Background Music (BGM)**:
  - Ambient Chill Synth, Lo-Fi Study Beat, Peaceful Piano, or custom MP3 upload.
  - **Smart Auto-Ducking**: Automatically attenuates background music when voice is speaking and restores volume during speech pauses.

### 5. 🌊 Dynamic Waveform Visualizer & Audio Player
- Real-time animated neon frequency spectrum visualizer powered by Web Audio API (`AnalyserNode`).
- Full playback controls: Play/Pause, Timeline Scrubber, Speed Multiplier (`0.8x`, `1.0x`, `1.25x`, `1.5x`), Volume & Mute.
- Direct **"Download MP3"** and **"Download WAV"** with automatic clean file naming.

### 6. 👥 Voice Library Directory
- Search and browse all 322 AI voices.
- Filter by Language/Region and Gender (All, Female, Male).
- **Favorite Voices (⭐)**: Star voices to save them to your personal favorites list.
- **Instant Audition Preview**: Listen to any voice before selecting it.
- **"Use Voice"** button to load the selected voice directly into the TTS Studio.

### 7. 🕒 Unlimited Offline Audio History (IndexedDB)
- Automatically saves generated audio clips and scripts permanently in browser `IndexedDB`.
- Instant search filter, replay, script reload into editor, and re-download.

---

## 🚀 Quick Start

### 1. Start the Server

```bash
npm start
```
Or:
```bash
node server.js
```

### 2. Open in Browser

Open your browser and navigate to:
```
http://localhost:3000
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Enter` / `Cmd + Enter` | Generate Voiceover / Speech |
| `Space` | Play / Pause current master audio |
| `Esc` | Stop voice preview audition |

---

## 📡 API Endpoints

- `GET /api/voices`: Returns the list of 322 AI neural voices and supported locales.
- `GET /api/preview?voice=en-US-JennyNeural`: Generates a quick sample audio preview for any voice (cached in RAM).
- `POST /api/tts`: Synthesizes text to MP3 audio.
  - Body: `{ text: "Hello world", voice: "en-US-JennyNeural", rate: 1.0, pitch: 0, format: "96k" }`
- `POST /api/srt-synthesize`: Synthesizes audio clips for subtitle cues.
- `POST /api/dialogue-synthesize`: Synthesizes multi-speaker podcast dialogue lines into unified audio.
- `GET /api/health`: Health status and engine status.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, `msedge-tts` (Microsoft Edge Neural Speech API), `ws`, `cors`
- **Frontend**: HTML5, Tailwind CSS, Lucide Icons, JSZip, Web Audio API (`AudioContext`, `BiquadFilterNode`, `ConvolverNode`, `AnalyserNode`, `OfflineAudioContext`), `IndexedDB`
