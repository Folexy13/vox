# 🎤 Vox — Real-Time Multilingual Voice Agent

**Your voice. Any language. Real time.**

[![Gemini Live Agent Challenge](https://img.shields.io/badge/Hackathon-Gemini%20Live%20Agent%20Challenge%202026-blue)](https://devpost.com)
[![Google Cloud](https://img.shields.io/badge/Hosted%20on-Google%20Cloud%20Run-4285F4)](https://cloud.google.com/run)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🌟 What It Does

Two people join a call. Each speaks naturally in their own language and accent. Vox sits invisibly between them — detecting language, translating in real-time, and resynthesizing each speaker's voice so the other person hears them clearly **in their own language, in the original speaker's voice**.

**Neither person changes anything. The agent does all the work invisibly, in real time.**

### Key Features

- 🗣️ **Real-time Translation** — No turn-taking, natural conversation flow
- 🎯 **Interruption Handling** — Speak over each other naturally, just like a real call
- 😊 **Emotion Detection** — Preserves emotional tone in translations
- 🎤 **Voice Cloning** — Hear translations in the speaker's own voice
- 📝 **Live Transcripts** — See original and translated text in real-time

---

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker + Docker Compose
- Google Cloud account with billing enabled

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/vox.git
cd vox

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys

# Start with Docker Compose
docker-compose up --build

# Access the app
# Frontend: http://localhost:5173
# Backend:  http://localhost:8080/health
```

### Cloud Deployment

```bash
# Set environment variables
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_API_KEY=your-gemini-api-key

# Deploy to Google Cloud Run
cd infrastructure
chmod +x deploy.sh
./deploy.sh
```

---

## 🏗️ Architecture

```
┌─────────────────┐                    ┌─────────────────┐
│   User A        │                    │   User B        │
│   (French)      │                    │   (English)     │
│   🇫🇷 Speaks    │                    │   🇬🇧 Speaks    │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         │ Pipecat WebRTC Transport             │ Pipecat WebRTC Transport
         │                                      │
         ▼                                      ▼
┌─────────────────────────────────────────────────────────┐
│                   Google Cloud Run                       │
│  ┌─────────────────────────────────────────────────┐    │
│  │               Pipecat Pipeline                   │    │
│  │         (Silero VAD Native Interruption)         │    │
│  └─────────────────────┬───────────────────────────┘    │
│                        │                                 │
│  ┌─────────────────────▼───────────────────────────┐    │
│  │          GeminiLiveLLMService (Pipecat)          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │    │
│  │  │ Language │  │ Emotion  │  │  Translator  │  │    │
│  │  │ Context  │  │ Context  │  │   (Gemini)   │  │    │
│  │  └──────────┘  └──────────┘  └──────────────┘  │    │
│  │                      │                          │    │
│  │  ┌──────────────────▼───────────────────────┐  │    │
│  │  │     Google TTS Service / Voice Cloning     │  │    │
│  │  └──────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
         │                                      │
         ▼                                      ▼
┌─────────────────┐                    ┌─────────────────┐
│   User A        │                    │   User B        │
│   🇬🇧 Hears     │                    │   🇫🇷 Hears     │
│   English       │                    │   French        │
│   in B's voice  │                    │   in A's voice  │
└─────────────────┘                    └─────────────────┘
```

---

## ⚡ Powered by Pipecat
Vox is powered by the **[Pipecat](https://github.com/pipecat-ai/pipecat)** framework for real-time, multimodal AI pipelines. By leveraging Pipecat, Vox achieves:
* **Zero-Lag Native Streaming**: Audio chunks flow continuously into Gemini Live without waiting for full sentences to complete.
* **Flawless Interruption Handling**: Silero VAD monitors speech events. If a user interrupts, Pipecat immediately drops current processing tasks and switches focus, resulting in a naturally flowing conversation.
* **Unified Pipeline Architecture**: Simplified WebSocket and WebRTC transport bridging directly into Google Cloud TTS and Gemini.

---

## 📁 Project Structure

```
vox/
├── backend/
│   ├── main.py                    # FastAPI entry point
│   ├── config.py                  # Environment configuration
│   ├── api/
│   │   └── websocket.py           # WebSocket handlers
│   └── core/
│       ├── audio_pipeline.py      # Main processing orchestrator
│       ├── interruption_handler.py # VAD-based interruption logic
│       ├── language_detector.py   # Google Speech-to-Text
│       ├── translator.py          # Gemini translation
│       ├── voice_synthesizer.py   # Google Cloud TTS
│       ├── voice_profiler.py      # Voice characteristic extraction
│       └── emotion_detector.py    # Emotion-aware translation
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx           # Landing page
│   │   │   ├── VoiceSetup.jsx     # Voice profile capture
│   │   │   └── CallRoom.jsx       # Main call interface
│   │   ├── components/
│   │   │   ├── StatusIndicator.jsx # Real-time status display
│   │   │   ├── TranscriptPanel.jsx # Live transcript view
│   │   │   └── EmotionBadge.jsx   # Emotion visualization
│   │   └── hooks/
│   │       ├── useWebSocket.js    # WebSocket management
│   │       └── useAudioCapture.js # Microphone + VAD
│
├── infrastructure/
│   ├── deploy.sh                  # One-command deployment
│   ├── cloudbuild.yaml            # CI/CD configuration
│   └── cloudrun.yaml              # Service definition
│
└── docker-compose.yml             # Local development setup
```

---

## 🌍 Supported Languages
*(Native Google Gemini Multimodal Live Support)*

| Language | Code | Status |
|----------|------|--------|
| English (US) | en-US | ✅ Full support |
| English (UK) | en-GB | ✅ Full support |
| French | fr-FR | ✅ Full support |
| Spanish | es-ES | ✅ Full support |
| Portuguese | pt-BR | ✅ Full support |
| German | de-DE | ✅ Full support |
| **Igbo** | ig-NG | ✅ **Differentiator** |
| **Hausa** | ha-NG | ✅ **Differentiator** |
| French | fr-FR | ✅ Full support |
| Spanish | es-ES | ✅ Full support |
| Portuguese | pt-BR | ✅ Full support |
| German | de-DE | ✅ Full support |
| Chinese (Mandarin) | zh-CN | ✅ Full support |
| Japanese | ja-JP | ✅ Full support |
| Korean | ko-KR | ✅ Full support |
| Arabic | ar-SA | ✅ Full support |

---

## 🎯 Hackathon Requirements

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Real-time interaction | Live audio between two people | ✅ |
| Natural conversation | No turn-taking required | ✅ |
| Can be interrupted | Full VAD-based interruption handling | ✅ |
| Gemini Live API | Core translation engine | ✅ |
| Google Cloud hosted | Cloud Run deployment | ✅ |
| Audio/Vision focus | Audio + emotion detection | ✅ |

---

## 🎬 Demo Script (4 Minutes)

### 0:00 - 0:30: The Problem
Show two people struggling to understand each other due to language/accent barriers.

### 0:30 - 1:30: Same Language Demo
Turn on Vox. Watch accents get clarified. Show emotion badges changing.

### 1:30 - 2:00: Interruption Demo ⭐
Person A speaks. Person B interrupts. Vox switches instantly. **This is the key demo moment.**

### 2:00 - 3:15: Cross-Language Demo
French ↔ English and Spanish ↔ English translation. Show live transcript panel.

### 3:15 - 3:45: Architecture + Cloud Proof
Show GCP console with running service.

### 3:45 - 4:00: Emotional Close
"1.5 billion people speak English as a second language. Vox ends the communication barrier."

---

## 🔧 Environment Variables

### Backend (.env)
```env
GOOGLE_API_KEY=your_gemini_api_key
GOOGLE_CLOUD_PROJECT=your_gcp_project_id
GOOGLE_CLOUD_REGION=us-central1
GCS_BUCKET_NAME=lorem-voice-profily
REDIS_URL=redis://localhost:6379  # Optional
```

### Frontend (.env)
```env
VITE_BACKEND_URL=http://localhost:8080
```

---

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/rooms` | Create new room |
| GET | `/api/rooms/{id}/verify` | Verify room exists |
| POST | `/api/voice-profile` | Upload voice profile |
| WS | `/ws/{room_id}/{user_id}` | Real-time audio streaming |

---

## 🏆 Bonus Points

- [x] **Blog post**: Share on social media with #GeminiLiveAgentChallenge
- [x] **Infrastructure as Code**: deploy.sh + cloudbuild.yaml
- [ ] **GDG Profile**: Sign up at gdg.community.dev

---

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- Google Gemini API for powerful translation
- Google Cloud Speech-to-Text and Text-to-Speech
- The Gemini Live Agent Challenge team

---

*Built for Gemini Live Agent Challenge 2026*
*Category: Live Agents | Targeting: Grand Prize + Best of Live Agents*
*#GeminiLiveAgentChallenge*
