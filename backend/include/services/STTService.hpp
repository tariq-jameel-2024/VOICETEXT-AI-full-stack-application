#pragma once
#include <memory>
#include <string>

#include "providers/SpeechToTextProvider.hpp"
#include "repositories/TranscriptRepository.hpp"
#include "services/AuthService.hpp"
#include "utils/FileManager.hpp"
#include "utils/Http.hpp"
#include "utils/Logger.hpp"

namespace voicetext {

class STTService {
public:
    STTService(std::unique_ptr<SpeechToTextProvider> provider, TranscriptRepository& transcripts, FileManager& files)
        : provider_(std::move(provider)), transcripts_(transcripts), files_(files) {}

    // Handles a raw uploaded audio payload: validates it, stores it safely,
    // runs it through the configured (or mock) provider, and persists the
    // resulting transcript.
    Json transcribeUpload(const std::string& userId, const std::string& filenameHint, const std::string& mimeType,
                           const std::string& bytes, const std::string& language) {
        if (bytes.empty()) return JsonResponse::fail("Uploaded audio is empty", "EMPTY_AUDIO");
        if (bytes.size() > kMaxAudioBytes) return JsonResponse::fail("Audio file exceeds the 25MB limit", "FILE_TOO_LARGE");

        std::string effectiveMime = mimeType;
        if (effectiveMime == "application/octet-stream" || effectiveMime.empty()) {
            if (filenameHint.find(".wav") != std::string::npos) effectiveMime = "audio/wav";
            else if (filenameHint.find(".mp3") != std::string::npos) effectiveMime = "audio/mpeg";
            else if (filenameHint.find(".webm") != std::string::npos) effectiveMime = "audio/webm";
            else if (filenameHint.find(".ogg") != std::string::npos) effectiveMime = "audio/ogg";
            else if (filenameHint.find(".m4a") != std::string::npos || filenameHint.find(".mp4") != std::string::npos) effectiveMime = "audio/mp4";
            else effectiveMime = "audio/webm";
        }

        if (!Validator::isAllowedAudioMime(effectiveMime)) return JsonResponse::fail("Unsupported audio format", "UNSUPPORTED_FORMAT");

        std::string ext = extensionForMime(effectiveMime);
        std::string safeName = FileManager::generateSafeFilename(ext);
        if (!files_.saveBinary("audio/uploads", safeName, bytes, kMaxAudioBytes)) {
            return JsonResponse::fail("Unable to store uploaded audio", "STORAGE_ERROR");
        }

        std::string path = files_.absolutePath("audio/uploads", safeName);
        TranscriptResult result;
        try {
            result = provider_->transcribe(path, language);
        } catch (const std::exception& ex) {
            Logger::instance().error(std::string("STT provider failure: ") + ex.what());
            files_.remove("audio/uploads", safeName);
            return JsonResponse::fail("Unable to process audio", "STT_PROCESSING_ERROR");
        } catch (...) {
            Logger::instance().error("STT provider failure: unknown exception");
            files_.remove("audio/uploads", safeName);
            return JsonResponse::fail("Unable to process audio", "STT_PROCESSING_ERROR");
        }
        if (!result.success) {
            files_.remove("audio/uploads", safeName);
            return JsonResponse::fail("Unable to process audio", "STT_PROCESSING_ERROR");
        }

        Transcript t;
        t.id = generateId("doc");
        t.userId = userId;
        t.title = "Voice Note";
        t.content = result.text;
        t.language = result.language.empty() ? language : result.language;
        t.type = "voice_to_text";
        t.sourceAudio = safeName;
        t.status = result.isDemo ? "demo" : "completed";
        t.createdAt = t.updatedAt = nowIso();
        transcripts_.create(t);

        return JsonResponse::ok(TranscriptService_toJson(t), "Transcription completed successfully");
    }

    // Persist client-finalized transcripts directly as completed entries
    Json saveFinalizedTranscript(const std::string& userId, const std::string& title,
                                 const std::string& content, const std::string& language, int duration) {
        if (!Validator::isNonEmpty(content)) {
            return JsonResponse::fail("Transcript content cannot be empty", "EMPTY_CONTENT");
        }
        Transcript t;
        t.id = generateId("doc");
        t.userId = userId;
        t.title = title.empty() ? "Voice Note" : title;
        t.content = content;
        t.language = language.empty() ? "en-US" : language;
        t.type = "voice_to_text";
        t.sourceAudio = std::nullopt;
        if (duration > 0) t.duration = duration;
        t.favorite = false;
        t.status = "completed";
        t.createdAt = t.updatedAt = nowIso();
        transcripts_.create(t);

        return JsonResponse::ok(TranscriptService_toJson(t), "Transcript saved successfully");
    }

private:
    static constexpr size_t kMaxAudioBytes = 25 * 1024 * 1024;
    std::unique_ptr<SpeechToTextProvider> provider_;
    TranscriptRepository& transcripts_;
    FileManager& files_;

    static std::string extensionForMime(const std::string& mime) {
        std::string baseMime = mime;
        auto semi = baseMime.find(';');
        if (semi != std::string::npos) baseMime = baseMime.substr(0, semi);

        if (baseMime == "audio/wav" || baseMime == "audio/x-wav") return "wav";
        if (baseMime == "audio/mpeg" || baseMime == "audio/mp3") return "mp3";
        if (baseMime == "audio/webm") return "webm";
        if (baseMime == "audio/ogg") return "ogg";
        if (baseMime == "audio/mp4" || baseMime == "audio/m4a") return "m4a";
        return "webm";
    }

    static Json TranscriptService_toJson(const Transcript& t) {
        Json j = Json{
            {"id", t.id}, {"user_id", t.userId}, {"title", t.title}, {"content", t.content},
            {"language", t.language}, {"type", t.type}, {"favorite", t.favorite}, {"status", t.status},
            {"created_at", t.createdAt}, {"updated_at", t.updatedAt}};
        if (t.sourceAudio) j["source_audio"] = *t.sourceAudio; else j["source_audio"] = nullptr;
        if (t.duration) j["duration"] = *t.duration; else j["duration"] = nullptr;
        return j;
    }
};

} // namespace voicetext
