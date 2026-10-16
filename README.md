# 🎙️ VoiceText AI

A full-stack, two-way **Voice ⇄ Text** AI platform: record or upload speech
and get an editable transcript, or type text and generate natural speech —
with AI-powered summarize/translate/grammar/notes/keywords tools on top.

- **Backend:** C++17, [Crow](https://crowcpp.org/) REST framework, SQLite, OpenSSL
- **Frontend:** React 19 + TypeScript + Tailwind CSS (SPA)
- **Architecture:** layered (Routes → Controllers → Services → Repositories → DB/Providers), OOP, provider abstractions, demo mode

> **Note on this environment:** this repository is built to run two ways. The
> `backend/` folder is a real, compilable C++ REST server you build with
> CMake and run locally (see §9/§10). Because this particular hosted preview
> sandbox only executes the Vite/React frontend, the frontend ships with an
> automatic **Demo Mode fallback** (`src/lib/api.ts`) that reproduces the
> exact same REST contract using the browser's own Web Speech API and
> `localStorage`, so every workflow below is fully clickable right now even
> without the C++ server running. Point `VITE_API_BASE_URL` at a running
> instance of the real backend to switch to live mode.

---

## 1. Features

- 🎙️ **Voice → Text**: start/pause/resume/stop/cancel recording, live transcript preview, audio upload fallback, editable transcript, copy/save/export.
- 📝 **Text → Voice**: multi-language text-to-speech with voice + speed selection, play/pause/stop, save, download (where the configured provider supports it).
- 🤖 **AI processing**: Summarize, Grammar Correction, Translate, Generate Notes, Extract Keywords, Rewrite — all optional and gracefully degraded when no AI provider is configured.
- 🌍 **Configurable languages**: English, Urdu, Hindi, Pashto, Arabic out of the box; add more via `config/settings.json` without code changes.
- 📁 **Document management**: full editor (word/char count, find & replace, undo/redo, autosave, rename, favorite, delete), history with search/filter/sort/pagination, favorites.
- 🔐 **Authentication**: registration, login, logout, profile, password change, account deletion — hashed passwords (PBKDF2-HMAC-SHA256), signed session tokens, auth middleware on every protected route.
- 🛡️ **Security**: parameterized SQL, path-traversal-proof file storage, MIME/size validation, input validation, structured audit/security logging, CORS, no secrets in frontend code.
- 🧩 **Provider abstraction**: `SpeechToTextProvider`, `TextToSpeechProvider`, `AITextService` interfaces — swap in real engines without touching controllers/routes. Demo/mock implementations ship by default.
- 🌓 Responsive SaaS dashboard UI with dark/light mode, toasts, modals, animated mic/waveform/AI-agent visuals.

## 2. Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for Mermaid diagrams of the
layered backend, request lifecycle, ER diagram, and provider abstraction.

```
HTTP Request → Routes → Controllers → Services → Repositories → SQLite
                                   ↘ Provider Abstractions → STT / TTS / AI
```

## 3. Technology stack

| Layer      | Technology |
|------------|------------|
| Backend    | C++17, Crow, SQLite3, OpenSSL, nlohmann/json, CMake |
| Frontend   | React 19, TypeScript, Tailwind CSS 4, Vite, react-router-dom, lucide-react |
| Browser AI | Web Speech API (`SpeechRecognition`, `speechSynthesis`) for the demo-mode fallback |
| Database   | SQLite (file-based); schema designed to be PostgreSQL-portable |

## 4. Project structure

```
VoiceTextAI/
├── backend/            # C++ REST server (Crow + SQLite)
│   ├── include/        # controllers, services, repositories, models, middleware, utils, providers
│   ├── src/            # reserved for non-header-only translation units
│   └── main.cpp        # thin composition root
├── src/                # React/TypeScript frontend (this is what the preview serves)
├── database/
│   ├── migrations/      # canonical SQL schema
│   └── seed/             # optional seed data
├── storage/              # audio uploads, generated audio, transcripts, exports
├── config/               # config.example.env, settings.json
├── tests/                # unit + integration tests (no external framework required)
├── docs/                 # architecture docs & diagrams
├── CMakeLists.txt
└── README.md
```

## 5. REST API

All responses share one envelope:

```json
{ "success": true, "message": "Transcription completed successfully", "data": {} }
```
```json
{ "success": false, "message": "Unable to process audio", "error_code": "STT_PROCESSING_ERROR" }
```

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server/demo-mode status |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in, returns a signed session token |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current authenticated user |
| POST | `/api/stt/upload` | Multipart audio upload → transcript |
| POST | `/api/stt/transcribe` | JSON-based STT helper endpoint |
| POST | `/api/tts/generate` | Generate speech from text |
| GET | `/api/tts` | List saved voice generations |
| DELETE | `/api/tts/{id}` | Delete a voice generation |
| GET/POST | `/api/transcripts` | List / create documents |
| GET/PUT/DELETE | `/api/transcripts/{id}` | Read / update / delete a document |
| POST | `/api/ai/summarize`, `/translate`, `/grammar`, `/keywords`, `/notes` | AI text operations |
| GET/PUT | `/api/user/profile` | View / update profile |
| GET/PUT | `/api/user/settings` | View / update settings |
| DELETE | `/api/user/account` | Delete account |

All routes except `/api/health`, `/api/auth/register`, and `/api/auth/login`
require `Authorization: Bearer <token>` and are protected by `AuthMiddleware`.

## 6. Running the frontend (this preview)

```bash
npm install
npm run dev      # local development
npm run build    # production build → dist/
```

The frontend works standalone in **Demo Mode** (no backend required): data is
kept in `localStorage`, STT uses the browser's `SpeechRecognition` API, and
TTS uses `speechSynthesis`. Demo output is always clearly labeled.

## 7. Building & running the real C++ backend

### Prerequisites
- CMake ≥ 3.16, a C++17 compiler (GCC/Clang/MSVC)
- SQLite3 + OpenSSL development packages
- Crow and nlohmann/json (auto-fetched via `FetchContent` if not found locally)
- A Crow-compatible standalone Asio release (pinned and fetched via `FetchContent`)

### Linux / macOS
```bash
sudo apt-get install -y libsqlite3-dev libssl-dev   # Debian/Ubuntu example
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build . -j
cp -r ../config .  # or run from the project root
./voicetext_server
```

### Windows (vcpkg recommended)
```powershell
vcpkg install sqlite3 openssl nlohmann-json
mkdir build; cd build
cmake .. -DCMAKE_TOOLCHAIN_FILE=$env:VCPKG_ROOT\scripts\buildsystems\vcpkg.cmake
cmake --build . --config Release
.\Release\voicetext_server.exe
```

The server listens on `SERVER_PORT` (default `8080`) and auto-creates/
migrates the SQLite database on first run.

## 8. Configuration

Copy `config/config.example.env` to `config/.env` and adjust values. No
secrets are hardcoded anywhere; every provider key is read from environment
variables / `.env` only, and the frontend never contains API keys.

```env
APP_MODE=demo
SERVER_PORT=8080
DATABASE_PATH=./data/voicetext.db
STT_PROVIDER=
TTS_PROVIDER=
AI_PROVIDER=
```

Leaving `*_PROVIDER` blank keeps the whole app fully functional in **Demo
Mode** — registration, login, document management, and the full STT/TTS/AI
workflow all work, with clearly labeled simulated results.

## 9. Connecting the frontend to the real backend

The Vite development server proxies `/api` requests to
`http://127.0.0.1:8080` by default, so run the frontend and backend together
to use the C++ API without browser CORS configuration. For another backend
URL, set `VITE_API_BASE_URL` (for example, `http://localhost:8080/api`) in the
Vite environment. For a production frontend, serve it behind a same-origin
reverse proxy for `/api` or configure the backend's `ALLOWED_ORIGIN` and the
deployment's CORS preflight handling. The frontend checks `/api/health` and
uses the browser demo implementation only when the backend is unavailable.

## 10. Testing

```bash
cd build
ctest --output-on-failure
```

Covers: password hashing & session token security (tamper/expiry), input
validation (SQL-injection-style strings, path traversal, file MIME checks),
and transcript repository CRUD + cross-user authorization checks.

## 11. Security

- Passwords hashed with PBKDF2-HMAC-SHA256 + per-password random salt (never stored in plaintext).
- Session tokens are HMAC-signed and expire; tampering invalidates them.
- Every SQL query is parameterized — no string concatenation into SQL.
- Uploaded files are renamed to random safe names; path traversal is blocked at the filesystem layer (`FileManager`).
- MIME type + file size validated server-side for every upload.
- `AuthMiddleware` protects all non-public routes.
- Structured logging distinguishes `INFO`/`WARNING`/`ERROR`/`SECURITY`/`AUDIT` and never logs secrets or raw content.

## 12. Privacy

- Microphone access requires explicit browser permission.
- Users can delete audio independently of its transcript.
- `audio_retention_days` setting controls automatic cleanup.
- External provider usage is opt-in via the Settings → Privacy toggle and clearly disclosed.

## 13. Troubleshooting

| Problem | Fix |
|---|---|
| "Microphone permission denied" | Allow mic access in the browser's site settings and reload. |
| Live dictation unavailable | Use Chrome/Edge, or use the "Upload Audio File" fallback. |
| Backend fails to find SQLite/OpenSSL | Install the `-dev` packages listed in §7, or use vcpkg on Windows. |
| Crow/json not found by CMake | They are fetched automatically via `FetchContent`; ensure you have internet access during the CMake configure step, or vendor them manually. |

## 14. Future improvements

- Real STT/TTS/AI provider adapters (Whisper.cpp, cloud APIs, local LLMs).
- WebSocket-based streaming transcription for providers that support it.
- PostgreSQL repository implementations behind the same interfaces.
- PDF/DOCX exporters alongside the existing TXT/JSON exporters.
- Rate limiting middleware and refresh-token rotation.

## License

MIT — see [`LICENSE`](LICENSE).
