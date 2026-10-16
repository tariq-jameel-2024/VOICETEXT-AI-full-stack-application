// VoiceText AI — C++ backend entry point.
// Wires together configuration, the database, repositories, providers,
// services, middleware and controllers. Keeps main() thin by design —
// all real logic lives in backend/include and backend/src.

#include <crow.h>

#ifdef DELETE
#undef DELETE
#endif

#include <memory>

#include "controllers/AIController.hpp"
#include "controllers/AuthController.hpp"
#include "controllers/STTController.hpp"
#include "controllers/TTSController.hpp"
#include "controllers/TranscriptController.hpp"
#include "controllers/UserController.hpp"
#include "middleware/AuthMiddleware.hpp"
#include "providers/AITextService.hpp"
#include "providers/SpeechToTextProvider.hpp"
#include "providers/TextToSpeechProvider.hpp"
#include "repositories/MediaRepository.hpp"
#include "repositories/TranscriptRepository.hpp"
#include "repositories/UserRepository.hpp"
#include "services/AIService.hpp"
#include "services/AuthService.hpp"
#include "services/STTService.hpp"
#include "services/SettingsService.hpp"
#include "services/TTSService.hpp"
#include "services/TranscriptService.hpp"
#include "utils/ConfigManager.hpp"
#include "utils/DatabaseManager.hpp"
#include "utils/FileManager.hpp"
#include "utils/Http.hpp"
#include "utils/Logger.hpp"

using namespace voicetext;

int main() {
    auto& config = ConfigManager::instance();
    config.loadFromFile("config/.env");

    const std::string dbPath = config.get("DATABASE_PATH", "./data/voicetext.db");
    const int port = config.getInt("SERVER_PORT", 8080);
    const std::string sessionSecret = config.get("SESSION_SECRET", "dev-only-insecure-secret-change-me");

    if (config.isDemoMode()) {
        Logger::instance().warning("Running in DEMO MODE — no external STT/TTS/AI providers configured. "
                                    "All responses are clearly labeled as demo data.");
    }

    DatabaseManager db(dbPath);
    db.migrate();

    const std::string storagePath = config.get("STORAGE_PATH", "./storage");
    FileManager files(storagePath);

    UserRepository userRepo(db);
    TranscriptRepository transcriptRepo(db);
    TTSRepository ttsRepo(db);

    AuthService authService(userRepo, SessionTokenManager(sessionSecret));
    TranscriptService transcriptService(transcriptRepo);
    SettingsService settingsService(db);

    auto sttProvider = createSpeechToTextProvider(config);
    auto ttsProvider = createTextToSpeechProvider(config, storagePath);
    auto aiProvider = createAITextService(config);

    STTService sttService(std::move(sttProvider), transcriptRepo, files);
    TTSService ttsService(std::move(ttsProvider), ttsRepo);
    AIService aiService(std::move(aiProvider));

    crow::App<AuthMiddleware> app;
    auto& authMiddleware = app.get_middleware<AuthMiddleware>();
    authMiddleware.authService = &authService;
    authMiddleware.allowedOrigin = config.get("ALLOWED_ORIGIN", "http://localhost:5173");

    // --- CORS + security headers (basic, dependency-free) -----------------
    CROW_ROUTE(app, "/api/<path>").methods(crow::HTTPMethod::Options)([&app](const crow::request& req, const std::string&) {
        crow::response response(204);
        app.get_middleware<AuthMiddleware>().applyCors(req, response);
        return response;
    });

    CROW_ROUTE(app, "/api/health").methods(crow::HTTPMethod::Get)([&config]() {
        Json body{{"status", "ok"}, {"mode", config.isDemoMode() ? "demo" : "live"}, {"version", VOICETEXT_VERSION}};
        return crow::response(200, JsonResponse::ok(body, "VoiceText AI backend is healthy").dump());
    });

    registerAuthRoutes(app, authService);
    registerTranscriptRoutes(app, transcriptService);
    registerSTTRoutes(app, sttService);
    registerTTSRoutes(app, ttsService);
    registerAIRoutes(app, aiService);
    registerUserRoutes(app, authService, settingsService);

    // --- Audio Streaming Route with Directory Traversal Protection ---------
    CROW_ROUTE(app, "/api/audio/<string>").methods(crow::HTTPMethod::Get)([&storagePath](const std::string& filename) {
        // Prevent directory traversal attacks
        if (filename.empty() || 
            filename.find("..") != std::string::npos || 
            filename.find('/') != std::string::npos || 
            filename.find('\\') != std::string::npos ||
            filename.find(':') != std::string::npos ||
            filename.find('%') != std::string::npos ||
            filename.find('\0') != std::string::npos) {
            return crow::response(400, JsonResponse::fail("Invalid audio filename", "INVALID_FILENAME").dump());
        }

        namespace fs = std::filesystem;
        fs::path p1 = fs::path(storagePath) / "audio" / "generated" / filename;
        fs::path p2 = fs::path(storagePath) / "audio" / "uploads" / filename;
        fs::path targetPath = (fs::exists(p1) && fs::is_regular_file(p1)) ? p1 : ((fs::exists(p2) && fs::is_regular_file(p2)) ? p2 : fs::path{});

        if (targetPath.empty()) {
            return crow::response(404, JsonResponse::fail("Audio file not found", "NOT_FOUND").dump());
        }

        // Validate that canonical target path resides inside storagePath
        std::error_code ec;
        fs::path canonicalTarget = fs::canonical(targetPath, ec);
        fs::path canonicalStorage = fs::canonical(fs::path(storagePath), ec);
        if (!ec) {
            std::string sTarget = canonicalTarget.string();
            std::string sStorage = canonicalStorage.string();
            if (sTarget.rfind(sStorage, 0) != 0) {
                return crow::response(403, JsonResponse::fail("Access denied", "FORBIDDEN").dump());
            }
        }

        std::ifstream in(targetPath, std::ios::binary);
        if (!in) {
            return crow::response(500, JsonResponse::fail("Failed to read audio file", "IO_ERROR").dump());
        }
        std::string buffer((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
        crow::response res(200, buffer);
        res.set_header("Content-Type", "audio/mpeg");
        res.set_header("Accept-Ranges", "bytes");
        res.set_header("Access-Control-Allow-Origin", "*");
        return res;
    });

    Logger::instance().info("VoiceText AI backend starting on port " + std::to_string(port));
    app.port(port).multithreaded().run();
    return 0;
}
