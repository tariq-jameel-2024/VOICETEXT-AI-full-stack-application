#pragma once
#include <crow.h>

#include "controllers/AuthController.hpp"
#include "services/STTService.hpp"

namespace voicetext {

inline void registerSTTRoutes(CrowApp& app, STTService& service) {
    // multipart/form-data upload: fields `audio` (file) and `language` (text)
    CROW_ROUTE(app, "/api/stt/upload").methods(crow::HTTPMethod::Post)([&app, &service](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        std::string userId = ctx.authenticated && !ctx.userId.empty() ? ctx.userId : "guest";

        crow::multipart::message msg(req);
        std::string language = "ur";
        std::string filename, mimeType, bytes;

        for (const auto& part : msg.parts) {
            std::string partName;
            std::string partFilename;

            for (const auto& [k, v] : part.headers) {
                std::string lowerK = k;
                std::transform(lowerK.begin(), lowerK.end(), lowerK.begin(), ::tolower);
                if (lowerK == "content-disposition") {
                    for (const auto& [paramKey, paramVal] : v.params) {
                        std::string lowerP = paramKey;
                        std::transform(lowerP.begin(), lowerP.end(), lowerP.begin(), ::tolower);
                        if (lowerP == "name") partName = paramVal;
                        else if (lowerP == "filename") partFilename = paramVal;
                    }
                    if (partName.empty()) {
                        if (v.value.find("name=\"audio\"") != std::string::npos || v.value.find("name=audio") != std::string::npos) {
                            partName = "audio";
                        } else if (v.value.find("name=\"language\"") != std::string::npos || v.value.find("name=language") != std::string::npos) {
                            partName = "language";
                        }
                    }
                } else if (lowerK == "content-type") {
                    mimeType = v.value;
                }
            }

            if (partName == "language") {
                language = part.body;
            } else if (partName == "audio" || (!part.body.empty() && partFilename.find('.') != std::string::npos)) {
                bytes = part.body;
                if (!partFilename.empty()) filename = partFilename;
            }
        }

        if (bytes.empty() && !msg.parts.empty()) {
            for (const auto& part : msg.parts) {
                if (!part.body.empty() && part.body.size() > 50) {
                    bytes = part.body;
                    break;
                }
            }
        }
        Json result = service.transcribeUpload(userId, filename, mimeType, bytes, language);
        int status = result["success"] ? 200 : 400;
        crow::response res(status, result.dump());
        res.set_header("Content-Type", "application/json");
        return res;
    });

    // JSON variant used by the frontend for client-finalized speech transcripts
    CROW_ROUTE(app, "/api/stt/transcribe").methods(crow::HTTPMethod::Post)([&app, &service](const crow::request& req) {
        auto& ctx = app.get_context<AuthMiddleware>(req);
        std::string userId = ctx.authenticated && !ctx.userId.empty() ? ctx.userId : "guest";

        auto body = Json::parse(req.body, nullptr, false);
        if (body.is_discarded()) {
            return crow::response(400, JsonResponse::fail("Invalid JSON body", "VALIDATION_ERROR").dump());
        }

        std::string content = body.value("content", "");
        if (content.empty()) {
            return crow::response(400, JsonResponse::fail("Transcript content cannot be empty", "EMPTY_CONTENT").dump());
        }

        std::string language = body.value("language", "ur");
        std::string title = body.value("title", "Voice Note");
        int duration = body.value("duration", 0);

        Json result = service.saveFinalizedTranscript(userId, title, content, language, duration);
        int status = result["success"] ? 201 : 400;
        crow::response res(status, result.dump());
        res.set_header("Content-Type", "application/json");
        return res;
    });
}

} // namespace voicetext
