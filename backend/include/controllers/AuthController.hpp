#pragma once
#include <crow.h>

#include "middleware/AuthMiddleware.hpp"
#include "services/AuthService.hpp"
#include "utils/Http.hpp"
#include "utils/Logger.hpp"

namespace voicetext {

using CrowApp = crow::App<AuthMiddleware>;

inline void registerAuthRoutes(CrowApp& app, AuthService& authService) {
    CROW_ROUTE(app, "/api/auth/register").methods(crow::HTTPMethod::Post)([&authService](const crow::request& req) {
        auto body = Json::parse(req.body, nullptr, false);
        if (body.is_discarded()) return crow::response(400, JsonResponse::fail("Invalid JSON body", "VALIDATION_ERROR").dump());
        std::string name = body.value("name", "");
        std::string email = body.value("email", "");
        std::string password = body.value("password", "");
        Json result = authService.registerUser(name, email, password);
        return crow::response(result["success"] ? 201 : 400, result.dump());
    });

    CROW_ROUTE(app, "/api/auth/login").methods(crow::HTTPMethod::Post)([&authService](const crow::request& req) {
        auto body = Json::parse(req.body, nullptr, false);
        if (body.is_discarded()) return crow::response(400, JsonResponse::fail("Invalid JSON body", "VALIDATION_ERROR").dump());
        std::string email = body.value("email", "");
        std::string password = body.value("password", "");
        Json result = authService.login(email, password);
        return crow::response(result["success"] ? 200 : 401, result.dump());
    });

    CROW_ROUTE(app, "/api/auth/logout").methods(crow::HTTPMethod::Post)([&authService](const crow::request& req) {
        std::string token;
        std::string authHeader = req.get_header_value("Authorization");
        const std::string prefix = "Bearer ";
        if (authHeader.rfind(prefix, 0) == 0) {
            token = authHeader.substr(prefix.size());
        } else if (!req.body.empty()) {
            auto body = Json::parse(req.body, nullptr, false);
            if (!body.is_discarded() && body.contains("token")) {
                token = body["token"].get<std::string>();
            }
        }
        if (!token.empty()) {
            authService.revokeToken(token);
        }
        return crow::response(200, JsonResponse::ok(nullptr, "Logged out successfully").dump());
    });

    CROW_ROUTE(app, "/api/auth/me").methods(crow::HTTPMethod::Get)([&app, &authService](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Session expired. Please log in again.", "NO_SESSION").dump());
        auto user = authService.authenticate(req.get_header_value("Authorization").substr(7));
        if (!user) return crow::response(401, JsonResponse::fail("Session expired", "NO_SESSION").dump());
        return crow::response(200, JsonResponse::ok(AuthService::userToJson(*user)).dump());
    });
}

} // namespace voicetext
