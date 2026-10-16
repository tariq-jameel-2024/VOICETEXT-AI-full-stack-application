#pragma once
#include <string>

#include "models/Models.hpp"
#include "utils/DatabaseManager.hpp"
#include "utils/Http.hpp"

namespace voicetext {

// Repository + service combined (settings is a single-row-per-user table,
// simple enough to not warrant a separate repository file).
class SettingsService {
public:
    explicit SettingsService(DatabaseManager& db) : db_(db) {}

    Json get(const std::string& userId) {
        auto stmt = db_.prepare(
            "SELECT theme, default_language, default_voice, default_speed, auto_save, audio_retention_days, notifications, share_with_providers "
            "FROM user_settings WHERE user_id = ?");
        stmt->bind(1, userId);
        if (!stmt->step()) return JsonResponse::ok(defaultSettingsJson());
        Json j{{"theme", stmt->columnText(0)}, {"default_language", stmt->columnText(1)}, {"default_voice", stmt->columnText(2)},
               {"default_speed", stmt->columnDouble(3)}, {"auto_save", stmt->columnInt(4) != 0}, {"audio_retention_days", stmt->columnInt(5)},
               {"notifications", stmt->columnInt(6) != 0}, {"share_with_providers", stmt->columnInt(7) != 0}};
        return JsonResponse::ok(j);
    }

    Json update(const std::string& userId, const Json& body) {
        auto stmt = db_.prepare(
            "INSERT INTO user_settings (user_id, theme, default_language, default_voice, default_speed, auto_save, audio_retention_days, notifications, share_with_providers) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme, default_language=excluded.default_language, default_voice=excluded.default_voice, "
            "default_speed=excluded.default_speed, auto_save=excluded.auto_save, audio_retention_days=excluded.audio_retention_days, "
            "notifications=excluded.notifications, share_with_providers=excluded.share_with_providers");
        stmt->bind(1, userId);
        stmt->bind(2, body.value("theme", "light"));
        stmt->bind(3, body.value("default_language", "en"));
        stmt->bind(4, body.value("default_voice", "default-female"));
        stmt->bind(5, body.value("default_speed", 1.0));
        stmt->bind(6, body.value("auto_save", true) ? 1 : 0);
        stmt->bind(7, body.value("audio_retention_days", 30));
        stmt->bind(8, body.value("notifications", true) ? 1 : 0);
        stmt->bind(9, body.value("share_with_providers", false) ? 1 : 0);
        stmt->execute();
        return JsonResponse::ok(body, "Settings saved");
    }

private:
    DatabaseManager& db_;

    static Json defaultSettingsJson() {
        return Json{{"theme", "light"}, {"default_language", "en"}, {"default_voice", "default-female"}, {"default_speed", 1.0},
                    {"auto_save", true}, {"audio_retention_days", 30}, {"notifications", true}, {"share_with_providers", false}};
    }
};

} // namespace voicetext
