#pragma once
#include <memory>
#include <string>

#include "providers/AITextService.hpp"
#include "utils/Http.hpp"

namespace voicetext {

// Thin orchestration layer around AITextService so controllers stay simple
// and future features (e.g. persisting ai_operations rows) have one place
// to live.
class AIService {
public:
    explicit AIService(std::unique_ptr<AITextService> provider) : provider_(std::move(provider)) {}

    Json run(const std::string& text, const std::string& operation, const std::string& targetLanguage = "en") {
        if (!Validator::isNonEmpty(text, 20000)) return JsonResponse::fail("No text supplied for AI processing", "VALIDATION_ERROR");
        AIResult result;
        try {
            result = provider_->process(text, operation, targetLanguage);
        } catch (const std::exception& ex) {
            return JsonResponse::fail("AI provider is currently unavailable", "AI_PROVIDER_ERROR");
        }
        if (!result.success) return JsonResponse::fail(result.errorMessage.empty() ? "AI processing failed" : result.errorMessage, "AI_PROCESSING_ERROR");
        return JsonResponse::ok(Json{{"operation", result.operation}, {"result", result.outputText}, {"demo", result.isDemo}},
                                 result.isDemo ? "AI processing complete (demo engine)" : "AI processing complete");
    }

private:
    std::unique_ptr<AITextService> provider_;
};

} // namespace voicetext
