-- Optional seed data for local development.
-- Run with: sqlite3 data/voicetext.db < database/seed/seed.sql

INSERT OR IGNORE INTO languages (code, label, speech_code) VALUES
    ('en', 'English', 'en-US'),
    ('ur', 'Urdu', 'ur-PK'),
    ('hi', 'Hindi', 'hi-IN'),
    ('ps', 'Pashto', 'ps-AF'),
    ('ar', 'Arabic', 'ar-SA');
