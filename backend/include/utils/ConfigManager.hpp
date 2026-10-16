#pragma once
// Loads server configuration from environment variables / a .env file.
// No secrets are ever hardcoded; everything falls back to safe demo defaults
// so the application can run in APP_MODE=demo without external credentials.

#include <fstream>
#include <sstream>
#include <string>
#include <unordered_map>

namespace voicetext {

class ConfigManager {
public:
    static ConfigManager& instance() {
        static ConfigManager cfg;
        return cfg;
    }

    void loadFromFile(const std::string& path = "config/.env") {
        std::ifstream file(path);
        if (!file.is_open()) return; // absent .env is fine, defaults apply
        std::string line;
        while (std::getline(file, line)) {
            if (line.empty() || line[0] == '#') continue;
            auto pos = line.find('=');
            if (pos == std::string::npos) continue;
            std::string key = trim(line.substr(0, pos));
            std::string value = trim(line.substr(pos + 1));
            values_[key] = value;
        }
    }

    std::string get(const std::string& key, const std::string& fallback = "") const {
        if (const char* env = std::getenv(key.c_str())) return std::string(env);
        auto it = values_.find(key);
        return it != values_.end() ? it->second : fallback;
    }

    int getInt(const std::string& key, int fallback) const {
        std::string v = get(key);
        if (v.empty()) return fallback;
        try { return std::stoi(v); } catch (...) { return fallback; }
    }

    bool isDemoMode() const {
        return get("APP_MODE", "demo") == "demo" || get("STT_PROVIDER").empty();
    }

private:
    std::unordered_map<std::string, std::string> values_;

    static std::string trim(const std::string& s) {
        size_t start = s.find_first_not_of(" \t\r\n\"");
        size_t end = s.find_last_not_of(" \t\r\n\"");
        if (start == std::string::npos) return "";
        return s.substr(start, end - start + 1);
    }
};

} // namespace voicetext
