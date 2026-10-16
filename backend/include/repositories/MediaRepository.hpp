#pragma once
// Repository for audio_files and tts_generations tables.

#include <optional>
#include <string>
#include <vector>

#include "models/Models.hpp"
#include "utils/DatabaseManager.hpp"

namespace voicetext {

class AudioRepository {
public:
    explicit AudioRepository(DatabaseManager& db) : db_(db) {}

    void create(const AudioFile& a) {
        auto stmt = db_.prepare(
            "INSERT INTO audio_files (id, user_id, filename, filepath, mime_type, duration, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        stmt->bind(1, a.id);
        stmt->bind(2, a.userId);
        stmt->bind(3, a.filename);
        stmt->bind(4, a.filepath);
        stmt->bind(5, a.mimeType);
        if (a.duration) stmt->bind(6, *a.duration); else stmt->bindNull(6);
        stmt->bind(7, static_cast<int>(a.fileSize));
        stmt->bind(8, a.createdAt);
        stmt->execute();
    }

    void remove(const std::string& id, const std::string& userId) {
        auto stmt = db_.prepare("DELETE FROM audio_files WHERE id = ? AND user_id = ?");
        stmt->bind(1, id);
        stmt->bind(2, userId);
        stmt->execute();
    }

private:
    DatabaseManager& db_;
};

class TTSRepository {
public:
    explicit TTSRepository(DatabaseManager& db) : db_(db) {}

    void create(const TTSGeneration& t) {
        auto stmt = db_.prepare(
            "INSERT INTO tts_generations (id, user_id, text, language, voice, speed, audio_path, favorite, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        stmt->bind(1, t.id);
        stmt->bind(2, t.userId);
        stmt->bind(3, t.text);
        stmt->bind(4, t.language);
        stmt->bind(5, t.voice);
        stmt->bind(6, t.speed);
        if (t.audioPath) stmt->bind(7, *t.audioPath); else stmt->bindNull(7);
        stmt->bind(8, t.favorite ? 1 : 0);
        stmt->bind(9, t.status);
        stmt->bind(10, t.createdAt);
        stmt->execute();
    }

    std::vector<TTSGeneration> listByUser(const std::string& userId) {
        auto stmt = db_.prepare(
            "SELECT id, user_id, text, language, voice, speed, audio_path, favorite, status, created_at FROM tts_generations "
            "WHERE user_id = ? ORDER BY created_at DESC");
        stmt->bind(1, userId);
        std::vector<TTSGeneration> items;
        while (stmt->step()) items.push_back(rowToTts(*stmt));
        return items;
    }

    std::optional<TTSGeneration> findById(const std::string& id) {
        auto stmt = db_.prepare(
            "SELECT id, user_id, text, language, voice, speed, audio_path, favorite, status, created_at FROM tts_generations WHERE id = ? LIMIT 1");
        stmt->bind(1, id);
        if (!stmt->step()) return std::nullopt;
        return rowToTts(*stmt);
    }

    void updateFavorite(const std::string& id, const std::string& userId, bool favorite) {
        auto stmt = db_.prepare("UPDATE tts_generations SET favorite = ? WHERE id = ? AND user_id = ?");
        stmt->bind(1, favorite ? 1 : 0);
        stmt->bind(2, id);
        stmt->bind(3, userId);
        stmt->execute();
    }

    void remove(const std::string& id, const std::string& userId) {
        auto stmt = db_.prepare("DELETE FROM tts_generations WHERE id = ? AND user_id = ?");
        stmt->bind(1, id);
        stmt->bind(2, userId);
        stmt->execute();
    }

private:
    DatabaseManager& db_;

    static TTSGeneration rowToTts(SqliteStatement& stmt) {
        TTSGeneration t;
        t.id = stmt.columnText(0);
        t.userId = stmt.columnText(1);
        t.text = stmt.columnText(2);
        t.language = stmt.columnText(3);
        t.voice = stmt.columnText(4);
        t.speed = stmt.columnDouble(5);
        if (!stmt.isNull(6)) t.audioPath = stmt.columnText(6);
        t.favorite = stmt.columnInt(7) != 0;
        t.status = stmt.columnText(8);
        t.createdAt = stmt.columnText(9);
        return t;
    }
};

} // namespace voicetext
