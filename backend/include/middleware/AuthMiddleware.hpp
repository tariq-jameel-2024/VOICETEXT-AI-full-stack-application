#pragma once
// Crow middleware that validates the "Authorization: Bearer <token>" header
// on protected routes and injects the resolved user id into request context.

#include <crow.h>

#include "services/AuthService.hpp"
#include "utils/Logger.hpp"

namespace voicetext {

struct AuthMiddleware {
    struct context {
        std::string userId;
        bool authenticated = false;
        bool preflight = false;
    };

    AuthService* authService = nullptr;
    std::string allowedOrigin = "http://localhost:5173";

    void before_handle(crow::request& req, crow::response& res, context& ctx) {
        if (req.method == crow::HTTPMethod::Options) {
            ctx.preflight = true;
            res.code = 204;
            addCorsHeaders(req, res);
            res.end();
            return;
        }
        std::string authHeader = req.get_header_value("Authorization");
        const std::string prefix = "Bearer ";
        if (authHeader.rfind(prefix, 0) != 0) {
            return; // not authenticated; route handlers decide if that's fatal
        }
        std::string token = authHeader.substr(prefix.size());
        if (!authService) return;

        // Check if token has been revoked / blacklisted on the server
        if (authService->isTokenRevoked(token)) {
            Logger::instance().security("Rejected request with revoked token");
            res.code = 401;
            res.set_header("Content-Type", "application/json");
            res.body = JsonResponse::fail("Token has been revoked. Please log in again.", "REVOKED_TOKEN").dump();
            addCorsHeaders(req, res);
            res.end();
            return;
        }

        auto user = authService->authenticate(token);
        if (!user) {
            Logger::instance().security("Rejected request with invalid/expired token");
            return;
        }
        ctx.userId = user->id;
        ctx.authenticated = true;
    }

    void after_handle(crow::request& req, crow::response& res, context&) {
        addCorsHeaders(req, res);
    }

    void applyCors(const crow::request& req, crow::response& res) const {
        addCorsHeaders(req, res);
    }

private:
    std::string getAllowedOrigins() const {
        if (!allowedOrigin.empty() && allowedOrigin != "http://localhost:5173") {
            return allowedOrigin;
        }
        const char* envVal = std::getenv("ALLOWED_ORIGIN");
        if (envVal && *envVal) {
            return std::string(envVal);
        }
        return allowedOrigin;
    }

    void addCorsHeaders(const crow::request& req, crow::response& res) const {
        const std::string origin = req.get_header_value("Origin");
        if (!origin.empty() && isAllowedOrigin(origin)) {
            res.headers.erase("Access-Control-Allow-Origin");
            res.headers.erase("Vary");
            res.headers.erase("Access-Control-Allow-Methods");
            res.headers.erase("Access-Control-Allow-Headers");
            res.headers.erase("Access-Control-Max-Age");
            res.headers.erase("Access-Control-Allow-Credentials");
            res.add_header("Access-Control-Allow-Origin", origin);
            res.add_header("Vary", "Origin");
            res.add_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            res.add_header("Access-Control-Allow-Headers", "Authorization, Content-Type");
            res.add_header("Access-Control-Allow-Credentials", "true");
            res.add_header("Access-Control-Max-Age", "600");
        }
    }

    bool isAllowedOrigin(const std::string& origin) const {
        std::string originsConfig = getAllowedOrigins();
        std::istringstream stream(originsConfig);
        std::string item;
        while (std::getline(stream, item, ',')) {
            size_t start = item.find_first_not_of(" \t\r\n");
            size_t end = item.find_last_not_of(" \t\r\n");
            if (start == std::string::npos) continue;
            std::string allowed = item.substr(start, end - start + 1);

            if (allowed == "*" || allowed == origin) return true;

            const auto schemeEnd = allowed.find("://");
            if (schemeEnd != std::string::npos) {
                const std::string prefix = allowed.substr(0, schemeEnd + 3);
                const std::string hostAndPort = allowed.substr(schemeEnd + 3);
                const auto portPos = hostAndPort.find(':');
                std::string host = (portPos == std::string::npos) ? hostAndPort : hostAndPort.substr(0, portPos);
                std::string portSuffix = (portPos == std::string::npos) ? "" : hostAndPort.substr(portPos);
                if (host == "localhost") {
                    if (origin == prefix + "127.0.0.1" + portSuffix) return true;
                } else if (host == "127.0.0.1") {
                    if (origin == prefix + "localhost" + portSuffix) return true;
                }
            }
        }
        return false;
    }
};

} // namespace voicetext
