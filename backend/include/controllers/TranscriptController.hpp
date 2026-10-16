#pragma once
#include <crow.h>

#include "controllers/AuthController.hpp"
#include "services/TranscriptService.hpp"

namespace voicetext {

inline void registerTranscriptRoutes(CrowApp& app, TranscriptService& service) {
    CROW_ROUTE(app, "/api/transcripts").methods(crow::HTTPMethod::Get)([&app, &service](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        int page = 1;
        int pageSize = 20;
        if (const char* p = req.url_params.get("page")) {
            try { page = std::max(1, std::stoi(p)); } catch (...) { page = 1; }
        }
        if (const char* ps = req.url_params.get("page_size")) {
            try { pageSize = std::clamp(std::stoi(ps), 1, 100); } catch (...) { pageSize = 20; }
        }
        const char* q = req.url_params.get("q");
        Json result = q ? service.search(ctx.userId, q) : service.list(ctx.userId, page, pageSize);
        return crow::response(200, result.dump());
    });

    CROW_ROUTE(app, "/api/transcripts/<string>").methods(crow::HTTPMethod::Get)([&app, &service](const crow::request& req, const std::string& id) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        Json result = service.getOne(id, ctx.userId);
        return crow::response(result["success"] ? 200 : 404, result.dump());
    });

    CROW_ROUTE(app, "/api/transcripts").methods(crow::HTTPMethod::Post)([&app, &service](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        auto body = Json::parse(req.body, nullptr, false);
        if (body.is_discarded()) return crow::response(400, JsonResponse::fail("Invalid JSON body", "VALIDATION_ERROR").dump());
        Json result = service.create(ctx.userId, body.value("title", ""), body.value("content", ""), body.value("language", "en"),
                                     body.value("type", "voice_to_text"), body);
        return crow::response(result["success"] ? 201 : 400, result.dump());
    });

    CROW_ROUTE(app, "/api/transcripts/<string>").methods(crow::HTTPMethod::Put)([&app, &service](const crow::request& req, const std::string& id) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        auto body = Json::parse(req.body, nullptr, false);
        if (body.is_discarded()) return crow::response(400, JsonResponse::fail("Invalid JSON body", "VALIDATION_ERROR").dump());
        Json result = service.update(id, ctx.userId, body);
        return crow::response(result["success"] ? 200 : 404, result.dump());
    });

    CROW_ROUTE(app, "/api/transcripts/<string>").methods(crow::HTTPMethod::Delete)([&app, &service](const crow::request& req, const std::string& id) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
        Json result = service.remove(id, ctx.userId);
        return crow::response(result["success"] ? 200 : 404, result.dump());
    });
}

} // namespace voicetext
