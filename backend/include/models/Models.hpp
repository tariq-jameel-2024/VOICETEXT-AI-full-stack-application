#pragma once
// Plain-old-data domain models shared by repositories, services and
// controllers. Kept dependency-free (no SQLite/Crow types leak in here).

#include <optional>
#include <string>

namespace voicetext {

struct User {
    std::string id;
    std::string name;
    std::string email;
    std::string passwordHash;
    std::string createdAt;
    std::string updatedAt;
};

struct Session {
    std::string token;
    std::string userId;
    std::string expiresAt;
    std::string createdAt;
};

struct Transcript {
    std::string id;
    std::string userId;
    std::string title;
    std::string content;
    std::string language;
    std::string type; // voice_to_text | text_to_voice | ai_summary | translation
    std::optional<std::string> sourceAudio;
    std::optional<int> duration;
    bool favorite = false;
    std::string status = "completed";
    std::string createdAt;
    std::string updatedAt;
};

struct AudioFile {
    std::string id;
    std::string userId;
    std::string filename;
    std::string filepath;
    std::string mimeType;
    std::optional<int> duration;
    long fileSize = 0;
    std::string createdAt;
};

struct TTSGeneration {
    std::string id;
    std::string userId;
    std::string text;
    std::string language;
    std::string voice;
    double speed = 1.0;
    std::optional<std::string> audioPath;
    bool favorite = false;
    std::string status = "completed";
    std::string createdAt;
};

struct UserSettings {
    std::string userId;
    std::string theme = "light";
    std::string defaultLanguage = "en";
    std::string defaultVoice = "default-female";
    double defaultSpeed = 1.0;
    bool autoSave = true;
    int audioRetentionDays = 30;
    bool notifications = true;
    bool shareWithProviders = false;
};

// Result types returned by the provider abstraction layer.
struct TranscriptResult {
    bool success = false;
    std::string text;
    std::string language;
    double confidence = 0.0;
    bool isDemo = false;
    std::string errorMessage;
};

struct AudioResult {
    bool success = false;
    std::string audioFilePath; // relative to storage/audio/generated
    std::string mimeType = "audio/wav";
    bool isDemo = false;
    std::string errorMessage;
};

struct AIResult {
    bool success = false;
    std::string operation;
    std::string outputText;
    bool isDemo = false;
    std::string errorMessage;
};

} // namespace voicetext
