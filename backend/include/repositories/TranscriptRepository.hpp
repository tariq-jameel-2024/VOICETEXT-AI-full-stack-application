#pragma once
#include <optional>
#include <string>
#include <vector>

#include "models/Models.hpp"
#include "utils/DatabaseManager.hpp"

namespace voicetext {

class TranscriptRepository {
public:
    explicit TranscriptRepository(DatabaseManager& db) : db_(db) {}

    void create(const Transcript& t) {
        auto stmt = db_.prepare(
            "INSERT INTO transcripts (id, user_id, title, content, language, type, source_audio, duration, favorite, status, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        stmt->bind(1, t.id);
        stmt->bind(2, t.userId);
        stmt->bind(3, t.title);
        stmt->bind(4, t.content);
        stmt->bind(5, t.language);
        stmt->bind(6, t.type);
        if (t.sourceAudio) stmt->bind(7, *t.sourceAudio); else stmt->bindNull(7);
        if (t.duration) stmt->bind(8, *t.duration); else stmt->bindNull(8);
        stmt->bind(9, t.favorite ? 1 : 0);
        stmt->bind(10, t.status);
        stmt->bind(11, t.createdAt);
        stmt->bind(12, t.updatedAt);
        stmt->execute();
    }

    std::vector<Transcript> listByUser(const std::string& userId, int limit, int offset) {
        auto stmt = db_.prepare(
            "SELECT id, user_id, title, content, language, type, source_audio, duration, favorite, status, created_at, updated_at "
            "FROM transcripts WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?");
        stmt->bind(1, userId);
        stmt->bind(2, limit);
        stmt->bind(3, offset);
        std::vector<Transcript> items;
        while (stmt->step()) items.push_back(rowToTranscript(*stmt));
        return items;
    }

    std::vector<Transcript> search(const std::string& userId, const std::string& query) {
        auto stmt = db_.prepare(
            "SELECT id, user_id, title, content, language, type, source_audio, duration, favorite, status, created_at, updated_at "
            "FROM transcripts WHERE user_id = ? AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC");
        std::string like = "%" + query + "%";
        stmt->bind(1, userId);
        stmt->bind(2, like);
        stmt->bind(3, like);
        std::vector<Transcript> items;
        while (stmt->step()) items.push_back(rowToTranscript(*stmt));
        return items;
    }

    std::optional<Transcript> findById(const std::string& id) {
        auto stmt = db_.prepare(
            "SELECT id, user_id, title, content, language, type, source_audio, duration, favorite, status, created_at, updated_at "
            "FROM transcripts WHERE id = ? LIMIT 1");
        stmt->bind(1, id);
        if (!stmt->step()) return std::nullopt;
        return rowToTranscript(*stmt);
    }

    void update(const Transcript& t) {
        auto stmt = db_.prepare(
            "UPDATE transcripts SET title = ?, content = ?, language = ?, favorite = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?");
        stmt->bind(1, t.title);
        stmt->bind(2, t.content);
        stmt->bind(3, t.language);
        stmt->bind(4, t.favorite ? 1 : 0);
        stmt->bind(5, t.status);
        stmt->bind(6, t.updatedAt);
        stmt->bind(7, t.id);
        stmt->bind(8, t.userId);
        stmt->execute();
    }

    void remove(const std::string& id, const std::string& userId) {
        auto stmt = db_.prepare("DELETE FROM transcripts WHERE id = ? AND user_id = ?");
        stmt->bind(1, id);
        stmt->bind(2, userId);
        stmt->execute();
    }

private:
    DatabaseManager& db_;

    static Transcript rowToTranscript(SqliteStatement& stmt) {
        Transcript t;
        t.id = stmt.columnText(0);
        t.userId = stmt.columnText(1);
        t.title = stmt.columnText(2);
        t.content = stmt.columnText(3);
        t.language = stmt.columnText(4);
        t.type = stmt.columnText(5);
        if (!stmt.isNull(6)) t.sourceAudio = stmt.columnText(6);
        if (!stmt.isNull(7)) t.duration = stmt.columnInt(7);
        t.favorite = stmt.columnInt(8) != 0;
        t.status = stmt.columnText(9);
        t.createdAt = stmt.columnText(10);
        t.updatedAt = stmt.columnText(11);
        return t;
    }
};

} // namespace voicetext
