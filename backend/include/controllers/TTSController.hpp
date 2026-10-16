#pragma once
#include <crow.h>

#include "controllers/AuthController.hpp"
#include "services/TTSService.hpp"

namespace voicetext {

inline void registerTTSRoutes(CrowApp& app, TTSService& service, const std::string& storagePath = "./storage") {
    CROW_ROUTE(app, "/api/tts/generate").methods(crow::HTTPMethod::Post)([&app, &service](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        std::string userId = ctx.authenticated ? ctx.userId : "guest";
        auto body = Json::parse(req.body, nullptr, false);
        if (body.is_discarded()) return crow::response(400, JsonResponse::fail("Invalid JSON body", "VALIDATION_ERROR").dump());
        Json result = service.generate(userId, body.value("text", ""), body.value("language", "en"), body.value("voice", "default-female"), body.value("speed", 1.0));
        return crow::response(result["success"] ? 201 : 400, result.dump());
    });

    CROW_ROUTE(app, "/api/tts").methods(crow::HTTPMethod::Get)([&app, &service](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        return crow::response(200, service.list(ctx.userId).dump());
    });

    CROW_ROUTE(app, "/api/tts/<string>").methods(crow::HTTPMethod::Delete)([&app, &service](const crow::request& req, const std::string& id) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        Json result = service.remove(id, ctx.userId);
        return crow::response(result["success"] ? 200 : 404, result.dump());
    });

    CROW_ROUTE(app, "/api/tts/<string>/favorite").methods(crow::HTTPMethod::Put)([&app, &service](const crow::request& req, const std::string& id) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        auto body = Json::parse(req.body, nullptr, false);
        bool fav = body.is_object() ? body.value("favorite", true) : true;
        Json result = service.toggleFavorite(id, ctx.userId, fav);
        return crow::response(result["success"] ? 200 : 404, result.dump());
    });
}

} // namespace voicetext
