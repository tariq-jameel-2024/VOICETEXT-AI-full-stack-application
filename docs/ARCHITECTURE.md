# VoiceText AI — Architecture

## 1. Layered backend architecture

```mermaid
flowchart TD
    A[HTTP Request] --> B[Crow Routes / Controllers]
    B --> C[Services]
    C --> D[Repositories]
    D --> E[(SQLite Database)]
    C --> F[Provider Abstractions]
    F --> G[STT Provider]
    F --> H[TTS Provider]
    F --> I[AI Text Provider]
    B --> J[Auth Middleware]
    J --> C
```

## 2. Request lifecycle (Voice → Text)

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant FE as Frontend (React SPA)
    participant API as Crow REST API
    participant STT as STTService
    participant P as SpeechToTextProvider
    participant DB as SQLite

    U->>FE: Click "Start Recording"
    FE->>FE: Capture audio (MediaRecorder / Web Speech API)
    FE->>API: POST /api/stt/upload (multipart audio + language)
    API->>STT: transcribeUpload(user, file, mime, bytes, lang)
    STT->>STT: validate size / mime / path safety
    STT->>P: transcribe(path, language)
    P-->>STT: TranscriptResult
    STT->>DB: INSERT transcripts(...)
    STT-->>API: {success, message, data}
    API-->>FE: JSON response
    FE-->>U: Transcript displayed & editable
```

## 3. Domain model (ER diagram)

```mermaid
erDiagram
    USERS ||--o{ TRANSCRIPTS : owns
    USERS ||--o{ AUDIO_FILES : owns
    USERS ||--o{ TTS_GENERATIONS : owns
    USERS ||--o{ AI_OPERATIONS : requests
    USERS ||--|| USER_SETTINGS : has
    USERS ||--o{ FAVORITES : marks
    TRANSCRIPTS ||--o{ AI_OPERATIONS : derives

    USERS {
        string id PK
        string name
        string email
        string password_hash
    }
    TRANSCRIPTS {
        string id PK
        string user_id FK
        string title
        string content
        string language
        string type
        bool favorite
    }
    TTS_GENERATIONS {
        string id PK
        string user_id FK
        string text
        string language
        string voice
        real speed
    }
    AUDIO_FILES {
        string id PK
        string user_id FK
        string filename
        string filepath
    }
```

## 4. Provider abstraction (replaceable AI backends)

`SpeechToTextProvider`, `TextToSpeechProvider`, and `AITextService` are pure
C++ interfaces. The application ships a `Mock*` implementation of each so it
runs in **Demo Mode** out of the box. Production deployments implement the
same interface against a real engine (local Whisper.cpp model, a cloud STT
API, a neural TTS engine, or an LLM) and swap it in via the `*_PROVIDER`
environment variable — no controller/service/route code changes needed.

## 5. Frontend ⇄ backend contract

The React frontend (`src/`) talks to the backend exclusively through the REST
API documented in the root `README.md`. In this hosted preview environment
(no C++ runtime available), `src/lib/api.ts` automatically falls back to an
in-browser **Demo Mode** that reproduces the exact same
`{ success, message, data }` envelope using `localStorage` and the browser's
native Web Speech API — so the UI, state management, and workflows are
identical to what you get when the real backend is running locally.
