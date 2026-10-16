#pragma once
#include <crow.h>

#include "controllers/AuthController.hpp"
#include "services/AIService.hpp"

namespace voicetext {

inline void registerAIRoutes(CrowApp& app, AIService& service) {
    auto handler = [&app, &service](const std::string& operation) {
        return [&app, &service, operation](const crow::request& req) {
            auto& ctx = app.get_context<AuthMiddleware>(req);
            if (!ctx.authenticated) return crow::response(401, JsonResponse::fail("Authentication required", "UNAUTHORIZED").dump());
            auto body = Json::parse(req.body, nullptr, false);
            std::string targetLang = body.value("target_language", "en");
            Json result = service.run(body.value("text", ""), operation, targetLang);
            return crow::response(result["success"] ? 200 : 400, result.dump());
        };
    };

    CROW_ROUTE(app, "/api/ai/summarize").methods(crow::HTTPMethod::Post)(handler("summarize"));
    CROW_ROUTE(app, "/api/ai/translate").methods(crow::HTTPMethod::Post)(handler("translate"));
    CROW_ROUTE(app, "/api/ai/grammar").methods(crow::HTTPMethod::Post)(handler("grammar"));
    CROW_ROUTE(app, "/api/ai/keywords").methods(crow::HTTPMethod::Post)(handler("keywords"));
    CROW_ROUTE(app, "/api/ai/notes").methods(crow::HTTPMethod::Post)(handler("notes"));
    CROW_ROUTE(app, "/api/ai/rewrite").methods(crow::HTTPMethod::Post)(handler("rewrite"));
}

} // namespace voicetext
