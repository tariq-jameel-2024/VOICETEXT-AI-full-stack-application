#pragma once
#include <algorithm>
#include <cctype>
#include <memory>
#include <regex>
#include <string>
#include <vector>

#include "providers/TextToSpeechProvider.hpp"
#include "repositories/MediaRepository.hpp"
#include "services/AuthService.hpp"
#include "utils/Http.hpp"

namespace voicetext {

class TTSService {
public:
    TTSService(std::unique_ptr<TextToSpeechProvider> provider, TTSRepository& repo) : provider_(std::move(provider)), repo_(repo) {}

    // Strips non-vocal stage directions, section headers (e.g. انترا, مکھڑا, [Chorus]),
    // brackets, and markdown before sending to the TTS voice engine.
    static std::string sanitizeText(const std::string& input) {
        if (input.empty()) return "";
        std::string s = input;

        // 1. Remove bracketed stage directions [Chorus], [Verse 1], (Intro), etc.
        std::regex brackets(R"(\[[^\]]*\]|\([^\)]*\)|\{[^\}]*\})");
        s = std::regex_replace(s, brackets, " ");

        // 2. Remove English song/speech structural labels
        std::regex engDirections(R"((^|\n)\s*(Verse|Chorus|Outro|Bridge|Intro|Hook|Refrain)(\s*\d+)?\s*[:\-\.]?\s*)", std::regex::icase);
        s = std::regex_replace(s, engDirections, "\n");

        // 3. Remove Urdu song / poetry structural headings
        const std::vector<std::string> urduHeadings = {
            "مکھڑا", "استھائی", "انترا", "بند", "کورس", "شعر", "گیت"
        };
        for (const auto& heading : urduHeadings) {
            size_t pos = 0;
            while ((pos = s.find(heading, pos)) != std::string::npos) {
                size_t lineStart = s.rfind('\n', pos);
                size_t start = (lineStart == std::string::npos) ? 0 : lineStart + 1;
                bool prefixAllSpace = true;
                for (size_t k = start; k < pos; ++k) {
                    if (!std::isspace(static_cast<unsigned char>(s[k]))) { prefixAllSpace = false; break; }
                }
                if (prefixAllSpace) {
                    size_t lineEnd = s.find('\n', pos);
                    if (lineEnd == std::string::npos) {
                        s.erase(start);
                        break;
                    } else {
                        s.erase(start, lineEnd - start);
                        pos = start;
                        continue;
                    }
                }
                pos += heading.size();
            }
        }

        // 4. Remove markdown header hashes (#, ##) and decorators (*, _, ~, `)
        std::regex mdHeading(R"((^|\n)\s*#+\s*)");
        s = std::regex_replace(s, mdHeading, "$1");

        std::string cleaned;
        cleaned.reserve(s.size());
        for (char c : s) {
            if (c != '*' && c != '_' && c != '~' && c != '`') {
                cleaned.push_back(c);
            }
        }

        // 5. Normalize whitespace
        std::regex spaces(R"([ \t]+)");
        cleaned = std::regex_replace(cleaned, spaces, " ");
        std::regex multiNewlines(R"(\n\s*\n\s*\n+)");
        cleaned = std::regex_replace(cleaned, multiNewlines, "\n\n");

        size_t first = cleaned.find_first_not_of(" \t\r\n");
        if (first == std::string::npos) return "";
        size_t last = cleaned.find_last_not_of(" \t\r\n");
        return cleaned.substr(first, last - first + 1);
    }

    Json generate(const std::string& userId, const std::string& text, const std::string& language, const std::string& voice, double speed) {
        if (!Validator::isNonEmpty(text, 5000)) return JsonResponse::fail("Text cannot be empty or exceed 5000 characters", "VALIDATION_ERROR");
        if (speed < 0.5 || speed > 2.0) speed = 1.0;

        std::string spokenText = sanitizeText(text);
        if (spokenText.empty()) spokenText = text;

        AudioResult audio = provider_->synthesize(spokenText, language, voice);

        TTSGeneration item;
        item.id = generateId("tts");
        item.userId = userId;
        item.text = text;
        item.language = language;
        item.voice = voice;
        item.speed = speed;
        item.audioPath = audio.audioFilePath.empty() ? std::nullopt : std::optional<std::string>(audio.audioFilePath);
        item.status = audio.isDemo ? "demo" : "completed";
        item.createdAt = nowIso();
        repo_.create(item);

        return JsonResponse::ok(toJson(item), audio.isDemo ? "Speech generated (demo mode — no server audio engine configured)" : "Speech generated successfully");
    }

    Json list(const std::string& userId) {
        auto items = repo_.listByUser(userId);
        Json arr = Json::array();
        for (auto& i : items) arr.push_back(toJson(i));
        return JsonResponse::ok(arr);
    }

    Json remove(const std::string& id, const std::string& userId) {
        auto existing = repo_.findById(id);
        if (!existing || existing->userId != userId) return JsonResponse::fail("Audio not found", "NOT_FOUND");
        repo_.remove(id, userId);
        return JsonResponse::ok(nullptr, "Audio deleted");
    }

    Json toggleFavorite(const std::string& id, const std::string& userId, bool favorite) {
        auto existing = repo_.findById(id);
        if (!existing || existing->userId != userId) return JsonResponse::fail("Audio not found", "NOT_FOUND");
        repo_.updateFavorite(id, userId, favorite);
        existing->favorite = favorite;
        return JsonResponse::ok(toJson(*existing), favorite ? "Saved to favorites" : "Removed from favorites");
    }

    static Json toJson(const TTSGeneration& t) {
        Json j = Json{
            {"id", t.id}, {"user_id", t.userId}, {"text", t.text}, {"language", t.language},
            {"voice", t.voice}, {"speed", t.speed}, {"favorite", t.favorite}, {"status", t.status},
            {"created_at", t.createdAt}
        };
        if (t.audioPath) {
            j["audio_path"] = *t.audioPath;
            j["audio_url"] = "/api/audio/" + *t.audioPath;
        } else {
            j["audio_path"] = nullptr;
            j["audio_url"] = nullptr;
        }
        return j;
    }

private:
    std::unique_ptr<TextToSpeechProvider> provider_;
    TTSRepository& repo_;
};

} // namespace voicetext
