#pragma once
// Abstraction layer for text-to-speech engines with native Microsoft Edge TTS support.

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <memory>
#include <string>

#include "models/Models.hpp"
#include "utils/ConfigManager.hpp"
#include "utils/FileManager.hpp"
#include "utils/Logger.hpp"

namespace fs = std::filesystem;

namespace voicetext {

class TextToSpeechProvider {
public:
    virtual ~TextToSpeechProvider() = default;

    virtual AudioResult synthesize(const std::string& text, const std::string& language, const std::string& voice) = 0;

    virtual std::string providerName() const = 0;
};

// Demo provider: returns demo status when no TTS engine is desired.
class MockTextToSpeechProvider : public TextToSpeechProvider {
public:
    AudioResult synthesize(const std::string& text, const std::string& language, const std::string& voice) override {
        (void)text;
        Logger::instance().info("MockTTSProvider: simulating synthesis (" + language + ", " + voice + ")");
        AudioResult result;
        result.success = true;
        result.isDemo = true;
        result.audioFilePath = "";
        result.mimeType = "audio/wav";
        result.errorMessage = "No real TTS_PROVIDER configured — audio was not generated server-side. "
                               "Configure TTS_PROVIDER / TTS_API_KEY in config/.env for production audio.";
        return result;
    }

    std::string providerName() const override { return "mock"; }
};

// High-quality multilingual TTS provider using Microsoft Edge Neural voices (via edge-tts)
// Supports natural native Urdu (ur-PK-UzmaNeural, ur-PK-AsadNeural), Hindi, English, Pashto, Arabic
class EdgeTTSProvider : public TextToSpeechProvider {
public:
    explicit EdgeTTSProvider(std::string storageDir) : storageDir_(std::move(storageDir)) {
        fs::create_directories(fs::path(storageDir_) / "audio" / "generated");
    }

    AudioResult synthesize(const std::string& text, const std::string& language, const std::string& voice) override {
        AudioResult result;
        if (text.empty()) {
            result.success = false;
            result.errorMessage = "Text cannot be empty";
            return result;
        }

        std::string neuralVoice = resolveNeuralVoice(language, voice);
        std::string safeFilename = FileManager::generateSafeFilename("mp3");
        fs::path genDir = fs::path(storageDir_) / "audio" / "generated";
        fs::create_directories(genDir);
        fs::path outPath = genDir / safeFilename;

        // Write text to a temporary UTF-8 file to safely handle Arabic/Urdu scripts on Windows
        std::string tempName = "tts_" + FileManager::generateSafeFilename("txt");
        fs::path tempPath = genDir / tempName;
        {
            std::ofstream out(tempPath, std::ios::binary);
            if (!out) {
                result.success = false;
                result.errorMessage = "Unable to create temporary text file for TTS";
                return result;
            }
            out.write(text.data(), static_cast<std::streamsize>(text.size()));
        }

        // Execute edge-tts CLI to synthesize speech to .mp3 in storage/audio/generated/
        std::string cmd = "edge-tts --voice \"" + neuralVoice + "\" -f \"" + tempPath.string() + "\" --write-media \"" + outPath.string() + "\"";
        Logger::instance().info("EdgeTTSProvider: synthesizing speech for language [" + language + "] using voice [" + neuralVoice + "]");
        int rc = std::system(cmd.c_str());

        // Fallback to python -m edge_tts if edge-tts CLI binary wasn't found directly in PATH
        if (rc != 0 || !fs::exists(outPath) || fs::file_size(outPath) == 0) {
            std::string pyCmd = "python -m edge_tts --voice \"" + neuralVoice + "\" -f \"" + tempPath.string() + "\" --write-media \"" + outPath.string() + "\"";
            rc = std::system(pyCmd.c_str());
        }

        // Always clean up temporary text file after synthesis
        std::error_code ec;
        fs::remove(tempPath, ec);

        if (rc == 0 && fs::exists(outPath) && fs::file_size(outPath) > 0) {
            result.success = true;
            result.isDemo = false;
            result.audioFilePath = safeFilename;
            result.mimeType = "audio/mpeg";
            Logger::instance().info("EdgeTTSProvider: successfully generated audio " + safeFilename + " (" + std::to_string(fs::file_size(outPath)) + " bytes)");
            return result;
        }

        Logger::instance().error("EdgeTTSProvider: synthesis command failed with code " + std::to_string(rc));
        result.success = false;
        result.errorMessage = "TTS synthesis command failed";
        return result;
    }

    std::string providerName() const override { return "edge-tts"; }

private:
    std::string storageDir_;

    static std::string resolveNeuralVoice(const std::string& language, const std::string& voice) {
        // Direct neural voice ID passed by caller
        if (voice.find("Neural") != std::string::npos) {
            return voice;
        }

        std::string lang = language;
        auto dash = lang.find('-');
        if (dash != std::string::npos) lang = lang.substr(0, dash);
        std::transform(lang.begin(), lang.end(), lang.begin(), ::tolower);

        std::string lowerVoice = voice;
        std::transform(lowerVoice.begin(), lowerVoice.end(), lowerVoice.begin(), ::tolower);

        // Distinguish female vs male (avoid "female".find("male") false match)
        bool isFemale = (lowerVoice.find("female") != std::string::npos ||
                         lowerVoice.find("uzma") != std::string::npos ||
                         lowerVoice.find("swara") != std::string::npos ||
                         lowerVoice.find("latifa") != std::string::npos ||
                         lowerVoice.find("zariyah") != std::string::npos ||
                         lowerVoice.find("aria") != std::string::npos);

        bool isMale = !isFemale && (lowerVoice.find("male") != std::string::npos ||
                                    lowerVoice.find("asad") != std::string::npos ||
                                    lowerVoice.find("madhur") != std::string::npos ||
                                    lowerVoice.find("gulnawaz") != std::string::npos ||
                                    lowerVoice.find("gul nawaz") != std::string::npos ||
                                    lowerVoice.find("hamed") != std::string::npos ||
                                    lowerVoice.find("guy") != std::string::npos);

        // Map Urdu (ur / ur-PK) to ur-PK-UzmaNeural (female) and ur-PK-AsadNeural (male)
        if (lang == "ur" || language == "ur-PK" || language == "ur-pk") {
            return isMale ? "ur-PK-AsadNeural" : "ur-PK-UzmaNeural";
        } else if (lang == "hi") {
            return isMale ? "hi-IN-MadhurNeural" : "hi-IN-SwaraNeural";
        } else if (lang == "ps") {
            return isMale ? "ps-AF-GulNawazNeural" : "ps-AF-LatifaNeural";
        } else if (lang == "ar") {
            return isMale ? "ar-SA-HamedNeural" : "ar-SA-ZariyahNeural";
        } else {
            // default English
            return isMale ? "en-US-GuyNeural" : "en-US-AriaNeural";
        }
    }
};

using EdgeTextToSpeechProvider = EdgeTTSProvider;

inline std::unique_ptr<TextToSpeechProvider> createTextToSpeechProvider(const ConfigManager& config, const std::string& storagePath = "./storage") {
    std::string provider = config.get("TTS_PROVIDER");
    if (provider == "mock") {
        Logger::instance().info("Using mock TTS provider as configured in .env");
        return std::make_unique<MockTextToSpeechProvider>();
    }

    // Default to high quality EdgeTTSProvider
    Logger::instance().info("Initializing EdgeTTSProvider with storage directory: " + storagePath);
    return std::make_unique<EdgeTTSProvider>(storagePath);
}

} // namespace voicetext
