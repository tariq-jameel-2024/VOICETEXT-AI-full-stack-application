#pragma once
// Data-access layer for users and sessions. All queries use bound
// parameters — never raw string concatenation — to prevent SQL injection.

#include <optional>
#include <string>

#include "models/Models.hpp"
#include "utils/DatabaseManager.hpp"

namespace voicetext {

class UserRepository {
public:
    explicit UserRepository(DatabaseManager& db) : db_(db) {}

    void create(const User& user) {
        auto stmt = db_.prepare("INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
        stmt->bind(1, user.id);
        stmt->bind(2, user.name);
        stmt->bind(3, user.email);
        stmt->bind(4, user.passwordHash);
        stmt->bind(5, user.createdAt);
        stmt->bind(6, user.updatedAt);
        stmt->execute();
    }

    std::optional<User> findByEmail(const std::string& email) {
        auto stmt = db_.prepare("SELECT id, name, email, password_hash, created_at, updated_at FROM users WHERE email = ? LIMIT 1");
        stmt->bind(1, email);
        if (!stmt->step()) return std::nullopt;
        return rowToUser(*stmt);
    }

    std::optional<User> findById(const std::string& id) {
        auto stmt = db_.prepare("SELECT id, name, email, password_hash, created_at, updated_at FROM users WHERE id = ? LIMIT 1");
        stmt->bind(1, id);
        if (!stmt->step()) return std::nullopt;
        return rowToUser(*stmt);
    }

    void updateProfile(const std::string& id, const std::string& name, const std::string& updatedAt) {
        auto stmt = db_.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?");
        stmt->bind(1, name);
        stmt->bind(2, updatedAt);
        stmt->bind(3, id);
        stmt->execute();
    }

    void updatePassword(const std::string& id, const std::string& passwordHash, const std::string& updatedAt) {
        auto stmt = db_.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?");
        stmt->bind(1, passwordHash);
        stmt->bind(2, updatedAt);
        stmt->bind(3, id);
        stmt->execute();
    }

    void remove(const std::string& id) {
        auto stmt = db_.prepare("DELETE FROM users WHERE id = ?");
        stmt->bind(1, id);
        stmt->execute();
    }

    void revokeToken(const std::string& token, const std::string& userId, const std::string& revokedAt) {
        auto stmt = db_.prepare("INSERT OR REPLACE INTO revoked_tokens (token, user_id, revoked_at) VALUES (?, ?, ?)");
        stmt->bind(1, token);
        stmt->bind(2, userId);
        stmt->bind(3, revokedAt);
        stmt->execute();

        if (!userId.empty() && findById(userId)) {
            try {
                auto sessStmt = db_.prepare("INSERT OR REPLACE INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)");
                sessStmt->bind(1, token);
                sessStmt->bind(2, userId);
                sessStmt->bind(3, revokedAt);
                sessStmt->bind(4, revokedAt);
                sessStmt->execute();
            } catch (...) {}
        }
    }

    bool isTokenRevoked(const std::string& token) {
        if (token.empty()) return false;
        auto stmt = db_.prepare("SELECT 1 FROM revoked_tokens WHERE token = ? UNION SELECT 1 FROM sessions WHERE token = ? LIMIT 1");
        stmt->bind(1, token);
        stmt->bind(2, token);
        return stmt->step();
    }

private:
    DatabaseManager& db_;

    static User rowToUser(SqliteStatement& stmt) {
        User u;
        u.id = stmt.columnText(0);
        u.name = stmt.columnText(1);
        u.email = stmt.columnText(2);
        u.passwordHash = stmt.columnText(3);
        u.createdAt = stmt.columnText(4);
        u.updatedAt = stmt.columnText(5);
        return u;
    }
};

} // namespace voicetext
