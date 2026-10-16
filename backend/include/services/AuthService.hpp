#pragma once
// Business logic for registration, login, profile & password management.
// Controllers call into this layer only — never the repositories directly.

#include <atomic>
#include <chrono>
#include <ctime>
#include <optional>
#include <sstream>
#include <string>

#include "models/Models.hpp"
#include "repositories/UserRepository.hpp"
#include "utils/Http.hpp"
#include "utils/Logger.hpp"
#include "utils/Security.hpp"

namespace voicetext {

inline std::string nowIso() {
    auto now = std::chrono::system_clock::now();
    auto t = std::chrono::system_clock::to_time_t(now);
    std::ostringstream oss;
    oss << std::put_time(std::gmtime(&t), "%Y-%m-%dT%H:%M:%SZ");
    return oss.str();
}

inline std::string generateId(const std::string& prefix) {
    static std::atomic<long> counter{0};
    std::ostringstream oss;
    oss << prefix << "_" << std::time(nullptr) << "_" << counter.fetch_add(1);
    return oss.str();
}

class AuthService {
public:
    AuthService(UserRepository& users, SessionTokenManager tokens) : users_(users), tokens_(std::move(tokens)) {}

    Json registerUser(const std::string& name, const std::string& email, const std::string& password) {
        if (!Validator::isNonEmpty(name, 200) || !Validator::isValidEmail(email) || !Validator::isValidPassword(password)) {
            return JsonResponse::fail("Please provide a valid name, email, and password (6+ characters)", "VALIDATION_ERROR");
        }
        if (users_.findByEmail(email)) {
            return JsonResponse::fail("An account with this email already exists", "EMAIL_TAKEN");
        }
        User user;
        user.id = generateId("user");
        user.name = name;
        user.email = email;
        user.passwordHash = PasswordHasher::hash(password);
        user.createdAt = user.updatedAt = nowIso();
        users_.create(user);
        Logger::instance().audit("User registered: " + user.id);
        std::string token = tokens_.issue(user.id);
        return JsonResponse::ok(Json{{"token", token}, {"user", userToJson(user)}}, "Account created successfully");
    }

    Json login(const std::string& email, const std::string& password) {
        auto user = users_.findByEmail(email);
        if (!user || !PasswordHasher::verify(password, user->passwordHash)) {
            Logger::instance().security("Failed login attempt for email: " + email);
            return JsonResponse::fail("Invalid email or password", "AUTH_FAILED");
        }
        std::string token = tokens_.issue(user->id);
        Logger::instance().audit("User logged in: " + user->id);
        return JsonResponse::ok(Json{{"token", token}, {"user", userToJson(*user)}}, "Welcome back!");
    }

    bool isTokenRevoked(const std::string& token) {
        return users_.isTokenRevoked(token);
    }

    void revokeToken(const std::string& token) {
        if (token.empty()) return;
        std::string userId = tokens_.verify(token);
        if (userId.empty()) {
            auto dot = token.find_last_of('.');
            if (dot != std::string::npos) {
                std::string payload = token.substr(0, dot);
                auto colon = payload.find(':');
                if (colon != std::string::npos) {
                    userId = payload.substr(0, colon);
                }
            }
        }
        users_.revokeToken(token, userId, nowIso());
        Logger::instance().audit("Token revoked: " + token.substr(0, std::min<size_t>(token.size(), 12)) + "...");
    }

    std::optional<User> authenticate(const std::string& token) {
        if (isTokenRevoked(token)) return std::nullopt;
        std::string userId = tokens_.verify(token);
        if (userId.empty()) return std::nullopt;
        return users_.findById(userId);
    }

    Json updateProfile(const std::string& userId, const std::string& name) {
        if (!Validator::isNonEmpty(name, 200)) return JsonResponse::fail("Name cannot be empty", "VALIDATION_ERROR");
        users_.updateProfile(userId, name, nowIso());
        auto updated = users_.findById(userId);
        if (!updated) return JsonResponse::fail("User not found", "NOT_FOUND");
        return JsonResponse::ok(userToJson(*updated), "Profile updated");
    }

    Json changePassword(const std::string& userId, const std::string& current, const std::string& next) {
        auto user = users_.findById(userId);
        if (!user || !PasswordHasher::verify(current, user->passwordHash)) {
            return JsonResponse::fail("Current password is incorrect", "AUTH_FAILED");
        }
        if (!Validator::isValidPassword(next)) return JsonResponse::fail("New password must be at least 6 characters", "VALIDATION_ERROR");
        users_.updatePassword(userId, PasswordHasher::hash(next), nowIso());
        Logger::instance().audit("Password changed for user: " + userId);
        return JsonResponse::ok(nullptr, "Password updated successfully");
    }

    Json deleteAccount(const std::string& userId) {
        users_.remove(userId);
        Logger::instance().audit("Account deleted: " + userId);
        return JsonResponse::ok(nullptr, "Account deleted");
    }

    static Json userToJson(const User& u) {
        return Json{{"id", u.id}, {"name", u.name}, {"email", u.email}, {"created_at", u.createdAt}, {"updated_at", u.updatedAt}};
    }

private:
    UserRepository& users_;
    SessionTokenManager tokens_;
};

} // namespace voicetext
