#pragma once
#include <crow.h>

#include "controllers/AuthController.hpp"
#include "services/AuthService.hpp"
#include "services/SettingsService.hpp"

namespace voicetext {

inline void registerUserRoutes(CrowApp& app, AuthService& authService, SettingsService& settingsService) {
    CROW_ROUTE(app, "/api/user/profile").methods(crow::HTTPMethod::Get)([&app, &authService](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        auto user = authService.authenticate(req.get_header_value("Authorization").substr(7));
        if (!user) return crow::response(401, JsonResponse::fail("Session expired", "NO_SESSION").dump());
        return crow::response(200, JsonResponse::ok(AuthService::userToJson(*user)).dump());
    });

    CROW_ROUTE(app, "/api/user/profile").methods(crow::HTTPMethod::Put)([&app, &authService](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        auto body = Json::parse(req.body, nullptr, false);
        if (body.is_discarded()) return crow::response(400, JsonResponse::fail("Invalid JSON body", "VALIDATION_ERROR").dump());
        Json result = authService.updateProfile(ctx.userId, body.value("name", ""));
        return crow::response(result["success"] ? 200 : 400, result.dump());
    });

    CROW_ROUTE(app, "/api/user/password").methods(crow::HTTPMethod::Post)([&app, &authService](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        auto body = Json::parse(req.body, nullptr, false);
        if (body.is_discarded()) return crow::response(400, JsonResponse::fail("Invalid JSON body", "VALIDATION_ERROR").dump());
        Json result = authService.changePassword(ctx.userId, body.value("current_password", ""), body.value("new_password", ""));
        return crow::response(result["success"] ? 200 : 400, result.dump());
    });

    CROW_ROUTE(app, "/api/user/settings").methods(crow::HTTPMethod::Get)([&app, &settingsService](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        std::string userId = ctx.authenticated && !ctx.userId.empty() ? ctx.userId : "guest";
        crow::response res(200, settingsService.get(userId).dump());
        res.set_header("Content-Type", "application/json");
        return res;
    });

    CROW_ROUTE(app, "/api/user/settings").methods(crow::HTTPMethod::Put)([&app, &settingsService](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        std::string userId = ctx.authenticated && !ctx.userId.empty() ? ctx.userId : "guest";
        auto body = Json::parse(req.body, nullptr, false);
        if (body.is_discarded()) return crow::response(400, JsonResponse::fail("Invalid JSON body", "VALIDATION_ERROR").dump());
        crow::response res(200, settingsService.update(userId, body).dump());
        res.set_header("Content-Type", "application/json");
        return res;
    });

    CROW_ROUTE(app, "/api/user/account").methods(crow::HTTPMethod::Delete)([&app, &authService](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        return crow::response(200, authService.deleteAccount(ctx.userId).dump());
    });
}

} // namespace voicetext
