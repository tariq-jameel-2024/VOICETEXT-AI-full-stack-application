#pragma once
// RAII wrapper around a single SQLite3 connection. All queries elsewhere in
// the codebase go through this class using parameterized statements only —
// never raw string concatenation — to prevent SQL injection.

#include <sqlite3.h>

#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

#include "utils/Logger.hpp"

namespace voicetext {

class SqliteStatement {
public:
    SqliteStatement(sqlite3* db, const std::string& sql, std::recursive_mutex& mtx)
        : db_(db), lock_(mtx) {
        if (sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt_, nullptr) != SQLITE_OK) {
            throw std::runtime_error(std::string("Failed to prepare statement: ") + sqlite3_errmsg(db_));
        }
    }
    ~SqliteStatement() {
        if (stmt_) {
            sqlite3_finalize(stmt_);
            stmt_ = nullptr;
        }
    }

    SqliteStatement(const SqliteStatement&) = delete;
    SqliteStatement& operator=(const SqliteStatement&) = delete;

    SqliteStatement(SqliteStatement&& other) noexcept
        : db_(other.db_), stmt_(other.stmt_), lock_(std::move(other.lock_)) {
        other.stmt_ = nullptr;
        other.db_ = nullptr;
    }

    SqliteStatement& operator=(SqliteStatement&& other) noexcept {
        if (this != &other) {
            if (stmt_) sqlite3_finalize(stmt_);
            db_ = other.db_;
            stmt_ = other.stmt_;
            lock_ = std::move(other.lock_);
            other.stmt_ = nullptr;
            other.db_ = nullptr;
        }
        return *this;
    }

    void bind(int index, const std::string& value) { sqlite3_bind_text(stmt_, index, value.c_str(), -1, SQLITE_TRANSIENT); }
    void bind(int index, int value) { sqlite3_bind_int(stmt_, index, value); }
    void bind(int index, double value) { sqlite3_bind_double(stmt_, index, value); }
    void bindNull(int index) { sqlite3_bind_null(stmt_, index); }

    bool step() { return sqlite3_step(stmt_) == SQLITE_ROW; }
    void execute() { sqlite3_step(stmt_); }

    std::string columnText(int col) const {
        const unsigned char* txt = sqlite3_column_text(stmt_, col);
        return txt ? reinterpret_cast<const char*>(txt) : "";
    }
    int columnInt(int col) const { return sqlite3_column_int(stmt_, col); }
    double columnDouble(int col) const { return sqlite3_column_double(stmt_, col); }
    bool isNull(int col) const { return sqlite3_column_type(stmt_, col) == SQLITE_NULL; }

private:
    sqlite3* db_;
    sqlite3_stmt* stmt_ = nullptr;
    std::unique_lock<std::recursive_mutex> lock_;
};

class DatabaseManager {
public:
    explicit DatabaseManager(const std::string& path) {
        if (path != ":memory:") {
            const std::filesystem::path dbPath(path);
            if (!dbPath.parent_path().empty()) {
                std::error_code ec;
                std::filesystem::create_directories(dbPath.parent_path(), ec);
                if (ec) {
                    throw std::runtime_error("Unable to create SQLite database directory: " + ec.message());
                }
            }
        }
        if (sqlite3_open(path.c_str(), &db_) != SQLITE_OK) {
            throw std::runtime_error("Unable to open SQLite database at " + path);
        }
        // Set 5-second busy timeout to gracefully handle concurrent operations
        sqlite3_busy_timeout(db_, 5000);
        // Enable Write-Ahead Logging (WAL) for high concurrency
        sqlite3_exec(db_, "PRAGMA journal_mode = WAL;", nullptr, nullptr, nullptr);
        sqlite3_exec(db_, "PRAGMA synchronous = NORMAL;", nullptr, nullptr, nullptr);
        sqlite3_exec(db_, "PRAGMA foreign_keys = ON;", nullptr, nullptr, nullptr);
        Logger::instance().info("Connected to SQLite database: " + path);
    }

    ~DatabaseManager() {
        std::lock_guard<std::recursive_mutex> lock(mutex_);
        if (db_) {
            sqlite3_close(db_);
            db_ = nullptr;
        }
    }

    DatabaseManager(const DatabaseManager&) = delete;
    DatabaseManager& operator=(const DatabaseManager&) = delete;

    std::unique_ptr<SqliteStatement> prepare(const std::string& sql) {
        return std::make_unique<SqliteStatement>(db_, sql, mutex_);
    }

    void exec(const std::string& sql) {
        std::lock_guard<std::recursive_mutex> lock(mutex_);
        char* errMsg = nullptr;
        if (sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &errMsg) != SQLITE_OK) {
            std::string message = errMsg ? errMsg : "unknown error";
            sqlite3_free(errMsg);
            throw std::runtime_error("SQL execution failed: " + message);
        }
    }

    std::recursive_mutex& mutex() const { return mutex_; }

    void migrate() {
        exec(R"sql(
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            INSERT OR IGNORE INTO users (id, name, email, password_hash, created_at, updated_at)
            VALUES ('guest', 'Guest User', 'guest@voicetext.local', 'none', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS revoked_tokens (
                token TEXT PRIMARY KEY,
                user_id TEXT,
                revoked_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                language TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'voice_to_text',
                source_audio TEXT,
                duration INTEGER,
                favorite INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'completed',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_transcripts_user ON transcripts(user_id);
            CREATE INDEX IF NOT EXISTS idx_transcripts_title ON transcripts(title);

            CREATE TABLE IF NOT EXISTS audio_files (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                filepath TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                duration INTEGER,
                file_size INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tts_generations (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                language TEXT NOT NULL,
                voice TEXT NOT NULL,
                speed REAL NOT NULL DEFAULT 1.0,
                audio_path TEXT,
                favorite INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'completed',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ai_operations (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                transcript_id TEXT REFERENCES transcripts(id) ON DELETE SET NULL,
                operation TEXT NOT NULL,
                input_text TEXT NOT NULL,
                output_text TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS languages (
                code TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                speech_code TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                theme TEXT NOT NULL DEFAULT 'light',
                default_language TEXT NOT NULL DEFAULT 'en',
                default_voice TEXT NOT NULL DEFAULT 'default-female',
                default_speed REAL NOT NULL DEFAULT 1.0,
                auto_save INTEGER NOT NULL DEFAULT 1,
                audio_retention_days INTEGER NOT NULL DEFAULT 30,
                notifications INTEGER NOT NULL DEFAULT 1,
                share_with_providers INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS favorites (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                document_id TEXT NOT NULL,
                document_type TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS activity_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
        )sql");
        Logger::instance().info("Database schema migrated successfully");
    }

private:
    sqlite3* db_ = nullptr;
    mutable std::recursive_mutex mutex_;
};

} // namespace voicetext
