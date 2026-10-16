#pragma once
#include <string>
#include <vector>

#include "models/Models.hpp"
#include "repositories/TranscriptRepository.hpp"
#include "services/AuthService.hpp"
#include "utils/Http.hpp"

namespace voicetext {

class TranscriptService {
public:
    explicit TranscriptService(TranscriptRepository& repo) : repo_(repo) {}

    Json list(const std::string& userId, int page, int pageSize) {
        int offset = std::max(0, (page - 1) * pageSize);
        auto items = repo_.listByUser(userId, pageSize, offset);
        Json arr = Json::array();
        for (auto& t : items) arr.push_back(toJson(t));
        return JsonResponse::ok(arr);
    }

    Json search(const std::string& userId, const std::string& query) {
        auto items = repo_.search(userId, query);
        Json arr = Json::array();
        for (auto& t : items) arr.push_back(toJson(t));
        return JsonResponse::ok(arr);
    }

    Json getOne(const std::string& id, const std::string& userId) {
        auto t = repo_.findById(id);
        if (!t || t->userId != userId) return JsonResponse::fail("Document not found", "NOT_FOUND");
        return JsonResponse::ok(toJson(*t));
    }

    Json create(const std::string& userId, const std::string& title, const std::string& content, const std::string& language,
                const std::string& type, const Json& fields = Json::object()) {
        if (!Validator::isNonEmpty(title, 300)) return JsonResponse::fail("Title is required", "VALIDATION_ERROR");
        Transcript t;
        t.id = generateId("doc");
        t.userId = userId;
        t.title = title;
        t.content = content;
        t.language = language;
        t.type = type.empty() ? "voice_to_text" : type;
        if (fields.contains("source_audio") && !fields["source_audio"].is_null()) {
            t.sourceAudio = fields["source_audio"].get<std::string>();
        }
        if (fields.contains("duration") && !fields["duration"].is_null()) {
            t.duration = fields["duration"].get<int>();
        }
        t.favorite = fields.value("favorite", false);
        t.status = fields.value("status", "completed");
        t.createdAt = t.updatedAt = nowIso();
        repo_.create(t);
        return JsonResponse::ok(toJson(t), "Document saved");
    }

    Json update(const std::string& id, const std::string& userId, const Json& patch) {
        auto existing = repo_.findById(id);
        if (!existing || existing->userId != userId) return JsonResponse::fail("Document not found", "NOT_FOUND");
        Transcript t = *existing;
        if (patch.contains("title")) t.title = patch["title"].get<std::string>();
        if (patch.contains("content")) t.content = patch["content"].get<std::string>();
        if (patch.contains("language")) t.language = patch["language"].get<std::string>();
        if (patch.contains("favorite")) t.favorite = patch["favorite"].get<bool>();
        if (patch.contains("status")) t.status = patch["status"].get<std::string>();
        t.updatedAt = nowIso();
        repo_.update(t);
        return JsonResponse::ok(toJson(t), "Document updated");
    }

    Json remove(const std::string& id, const std::string& userId) {
        auto existing = repo_.findById(id);
        if (!existing || existing->userId != userId) return JsonResponse::fail("Document not found", "NOT_FOUND");
        repo_.remove(id, userId);
        return JsonResponse::ok(nullptr, "Document deleted");
    }

    static Json toJson(const Transcript& t) {
        return Json{
            {"id", t.id}, {"user_id", t.userId}, {"title", t.title}, {"content", t.content},
            {"language", t.language}, {"type", t.type}, {"duration", t.duration ? Json(*t.duration) : Json(nullptr)},
            {"favorite", t.favorite}, {"status", t.status}, {"created_at", t.createdAt}, {"updated_at", t.updatedAt}};
    }

private:
    TranscriptRepository& repo_;
};

} // namespace voicetext
