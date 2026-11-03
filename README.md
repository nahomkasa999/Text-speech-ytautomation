# 🎙️ AI Book Narrator Studio

A complete, high-fidelity AI audiobook narrator application built for long-form books (12,000 to 20,000+ words). Features a sleek 3-panel studio interface with real-time progress tracking, project history, and support for all three voice synthesis methods.

---

## 🌟 The 3 Voice Engines

| Engine | Ideal For | Requirements |
| :--- | :--- | :--- |
| **1. Local (Kokoro-82M)** | Completely offline narration, 0 cloud cost, fast generation | Standard laptop CPU (Pre-downloaded & 100% ready) |
| **2. Deployed GPU (RunPod)** | Expressive storytelling, voice design, vocal events `(sigh)`, `(laugh)` | RunPod / Breeze-TTS-2 or OpenAI-compatible endpoint URL |
| **3. Cloud API** | Instant cloud generation with zero setup | OpenAI, ElevenLabs, or BreezeBlue API key |

---

## 🚀 Quick Start

1. Start the studio server:
   ```bash
   cd /home/nahomkasa/Documents/coding/book-narrator
   ./run.sh
   ```
2. Open your browser and navigate to:
   **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## 🖥️ Studio Features

- **Left Sidebar (Project History)**:
  - Automatically saves all your generated chapters/narrations.
  - Displays word counts, character counts, and audio duration.
  - Click any past project to immediately inspect its text, reload settings, or re-listen to the generated audiobook.
  - Delete unwanted projects with 1 click.
  - `+ New Narration` button to start fresh chapters.

- **Center Workspace (Audio Deck & Smart Chunker)**:
  - Paste up to 20,000+ words or drag-and-drop a `.txt` file directly into the editor.
  - Live statistics display: word count, character count, and estimated listening time.
  - **Smart Chunker**: Automatically segments text along natural punctuation and paragraph boundaries without cutting sentences mid-thought.
  - **Live Progress Card**: Server-Sent Events (SSE) display real-time progress percentages, chunk numbers, estimated time remaining (ETA), and a live snippet of the sentence being spoken.
  - **Audio Player & Exporter**: Once generated, listen directly in the embedded player and click **Download Audio (.wav)**.

- **Right Sidebar (Voice & Pacing Controls)**:
  - **Engine Switcher**: Switch between **Local (Kokoro)**, **Deployed (RunPod)**, and **Cloud API**.
  - **Voice Selector**: Pick from built-in voices (American Male/Female, British Male/Female) or custom dynamic voice designs.
  - **▶ Play Sample**: Test any voice with a 1-second preview before generating the entire book.
  - **Speed Slider**: Seamlessly adjust speaking pace from `0.6x` to `1.8x` without pitch distortion.
  - **Breathing & Pauses**: Fine-tune silence between paragraphs (e.g. `0.6s`) and sentences (`0.25s`) for natural pacing.

---

## ⚡ RunPod Setup & Tools

- **CLI Tool**: `runpodctl` is installed in `~/.local/bin/runpodctl`.
  - To link your RunPod account, run:
    ```bash
    runpodctl config --apiKey <YOUR_RUNPOD_API_KEY>
    ```
- **MCP Server**: Pre-configured in `~/.gemini/config/mcp_config.json` pointing to `https://mcp.runpod.io/`.
