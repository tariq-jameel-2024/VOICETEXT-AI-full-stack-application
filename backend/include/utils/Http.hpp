#pragma once
// Consistent JSON API response envelope + lightweight input validators.

#include <nlohmann/json.hpp>
#include <regex>
#include <string>

namespace voicetext {

using Json = nlohmann::json;

class JsonResponse {
public:
    static Json ok(const Json& data = nullptr, const std::string& message = "Success") {
        Json j{{"success", true}, {"message", message}};
        if (!data.is_null()) j["data"] = data;
        return j;
    }

    static Json fail(const std::string& message, const std::string& errorCode = "ERROR") {
        return Json{{"success", false}, {"message", message}, {"error_code", errorCode}};
    }
};

class Validator {
public:
    static bool isValidEmail(const std::string& email) {
        static const std::regex pattern(R"((\w|\.|-)+@(\w|-)+\.[a-zA-Z]{2,})");
        return std::regex_match(email, pattern);
    }

    static bool isValidPassword(const std::string& password) {
        return password.size() >= 6 && password.size() <= 128;
    }

    static bool isNonEmpty(const std::string& value, size_t maxLen = 10000) {
        return !value.empty() && value.size() <= maxLen;
    }

    // Prevents path traversal in any user-supplied filename.
    static bool isSafeFilename(const std::string& filename) {
        if (filename.empty() || filename.size() > 255) return false;
        if (filename.find("..") != std::string::npos) return false;
        if (filename.find('/') != std::string::npos || filename.find('\\') != std::string::npos) return false;
        static const std::regex allowed(R"([A-Za-z0-9_\-. ]+)");
        return std::regex_match(filename, allowed);
    }

    static bool isAllowedAudioMime(const std::string& mime) {
        std::string baseMime = mime;
        auto semi = baseMime.find(';');
        if (semi != std::string::npos) baseMime = baseMime.substr(0, semi);
        static const std::vector<std::string> allowed = {
            "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/webm", "audio/ogg", "audio/mp4", "audio/m4a", "audio/aac", "audio/flac"};
        for (const auto& m : allowed)
            if (m == baseMime) return true;
        return false;
    }
};

} // namespace voicetext
