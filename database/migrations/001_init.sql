-- VoiceText AI — initial schema (also auto-applied by DatabaseManager::migrate()
-- at server startup; kept here as the canonical, version-controlled migration).

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    language TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'voice_to_text',
    source_audio TEXT,
    duration INTEGER,
    favorite INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transcripts_user ON transcripts(user_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_title ON transcripts(title);
CREATE INDEX IF NOT EXISTS idx_transcripts_language ON transcripts(language);

CREATE TABLE IF NOT EXISTS audio_files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    duration INTEGER,
    file_size INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tts_generations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    language TEXT NOT NULL,
    voice TEXT NOT NULL,
    speed REAL NOT NULL DEFAULT 1.0,
    audio_path TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_operations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transcript_id TEXT REFERENCES transcripts(id) ON DELETE SET NULL,
    operation TEXT NOT NULL,
    input_text TEXT NOT NULL,
    output_text TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS languages (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    speech_code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'light',
    default_language TEXT NOT NULL DEFAULT 'en',
    default_voice TEXT NOT NULL DEFAULT 'default-female',
    default_speed REAL NOT NULL DEFAULT 1.0,
    auto_save INTEGER NOT NULL DEFAULT 1,
    audio_retention_days INTEGER NOT NULL DEFAULT 30,
    notifications INTEGER NOT NULL DEFAULT 1,
    share_with_providers INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS favorites (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL,
    document_type TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL
);
