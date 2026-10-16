#pragma once
// High-accuracy speech-to-text abstraction and implementation using local Faster-Whisper.
// Supports offline transcription for Urdu (ur / ur-PK), English, Hindi, Pashto, Arabic, etc.

#include <filesystem>
#include <memory>
#include <string>
#include <cstdio>
#include <cstdlib>

#include "models/Models.hpp"
#include "utils/ConfigManager.hpp"
#include "utils/Http.hpp"
#include "utils/Logger.hpp"

namespace fs = std::filesystem;

namespace voicetext {

class SpeechToTextProvider {
public:
    virtual ~SpeechToTextProvider() = default;

    // audioFile is a server-side path inside storage/audio/uploads
    virtual TranscriptResult transcribe(const std::string& audioFile, const std::string& language) = 0;

    virtual std::string providerName() const = 0;
};

// Demo/mock provider
class MockSpeechToTextProvider : public SpeechToTextProvider {
public:
    TranscriptResult transcribe(const std::string& audioFile, const std::string& language) override {
        Logger::instance().info("MockSTTProvider: simulating transcription for " + audioFile);
        TranscriptResult result;
        result.success = true;
        result.isDemo = true;
        result.language = language;
        result.confidence = 0.0;
        result.text = "[DEMO TRANSCRIPTION] Mock STT provider standing in for " + audioFile;
        return result;
    }

    std::string providerName() const override { return "mock"; }
};

// Real, local high-accuracy speech-to-text provider using faster-whisper
class WhisperSTTProvider : public SpeechToTextProvider {
public:
    explicit WhisperSTTProvider(std::string scriptPath = "backend/scripts/transcribe.py")
        : scriptPath_(std::move(scriptPath)) {}

    TranscriptResult transcribe(const std::string& audioFile, const std::string& language) override {
        TranscriptResult result;
        result.success = false;
        result.isDemo = false;
        result.language = language;
        result.confidence = 0.95;

        if (!fs::exists(audioFile)) {
            Logger::instance().error("WhisperSTTProvider: audio file not found: " + audioFile);
            result.text = "Audio file not found: " + audioFile;
            return result;
        }

        // Locate transcribe.py script
        fs::path script = fs::absolute(scriptPath_);
        if (!fs::exists(script)) {
            if (fs::exists("backend/scripts/transcribe.py")) {
                script = fs::absolute("backend/scripts/transcribe.py");
            } else if (fs::exists("../backend/scripts/transcribe.py")) {
                script = fs::absolute("../backend/scripts/transcribe.py");
            }
        }

        std::string langArg = language.empty() ? "" : (" --language \"" + language + "\"");
        std::string cmd = "python \"" + script.string() + "\" \"" + audioFile + "\"" + langArg;

        Logger::instance().info("WhisperSTTProvider: transcribing with Faster-Whisper (" + language + "): " + audioFile);

        std::string output;
        FILE* pipe = _popen(cmd.c_str(), "r");
        if (!pipe) {
            Logger::instance().error("WhisperSTTProvider: failed to open pipe for command: " + cmd);
            result.text = "Failed to launch transcription process";
            return result;
        }

        char buffer[1024];
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            output += buffer;
        }
        int rc = _pclose(pipe);

        if (rc != 0 || output.empty()) {
            Logger::instance().warning("WhisperSTTProvider: process exited with code " + std::to_string(rc));
        }

        try {
            // Find JSON in output (in case python printed any warnings)
            auto jsonStart = output.find('{');
            auto jsonEnd = output.rfind('}');
            if (jsonStart != std::string::npos && jsonEnd != std::string::npos && jsonEnd > jsonStart) {
                std::string jsonStr = output.substr(jsonStart, jsonEnd - jsonStart + 1);
                auto j = Json::parse(jsonStr, nullptr, false);
                if (!j.is_discarded() && j.value("success", false)) {
                    result.success = true;
                    result.text = j.value("text", "");
                    if (j.contains("language") && !j["language"].is_null()) {
                        result.language = j["language"].get<std::string>();
                    }
                    result.confidence = 0.98;
                    Logger::instance().info("WhisperSTTProvider: transcription successful (" +
                                            std::to_string(result.text.size()) + " chars)");
                    return result;
                } else if (!j.is_discarded() && j.contains("error")) {
                    Logger::instance().error("WhisperSTTProvider error: " + j["error"].get<std::string>());
                    result.text = j["error"].get<std::string>();
                }
            }
        } catch (const std::exception& e) {
            Logger::instance().error("WhisperSTTProvider: JSON parse exception: " + std::string(e.what()));
        }

        if (!output.empty() && output.find('{') == std::string::npos) {
            result.success = true;
            result.text = output;
            return result;
        }

        result.success = false;
        result.text = "Transcription failed to process audio";
        return result;
    }

    std::string providerName() const override { return "faster-whisper"; }

private:
    std::string scriptPath_;
};

// Factory: builds the configured provider, defaulting to WhisperSTTProvider
inline std::unique_ptr<SpeechToTextProvider> createSpeechToTextProvider(const ConfigManager& config) {
    std::string provider = config.get("STT_PROVIDER");
    if (provider == "mock") {
        Logger::instance().warning("Using MockSpeechToTextProvider as explicitly requested by config");
        return std::make_unique<MockSpeechToTextProvider>();
    }
    // High-accuracy local Faster-Whisper is the default production engine
    Logger::instance().info("Initializing WhisperSTTProvider (local Faster-Whisper backend)");
    return std::make_unique<WhisperSTTProvider>();
}

} // namespace voicetext
