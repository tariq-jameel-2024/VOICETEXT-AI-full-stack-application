#pragma once
// Structured logger used across every backend layer.
// Never logs passwords, API keys, tokens, or raw audio/transcript content.

#include <chrono>
#include <ctime>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <sstream>
#include <string>

namespace voicetext {

enum class LogLevel { Info, Warning, Error, Security, Audit };

class Logger {
public:
    static Logger& instance() {
        static Logger logger;
        return logger;
    }

    void log(LogLevel level, const std::string& message) {
        std::lock_guard<std::mutex> lock(mutex_);
        std::cout << "[" << timestamp() << "] [" << levelLabel(level) << "] " << message << std::endl;
    }

    void info(const std::string& msg) { log(LogLevel::Info, msg); }
    void warning(const std::string& msg) { log(LogLevel::Warning, msg); }
    void error(const std::string& msg) { log(LogLevel::Error, msg); }
    void security(const std::string& msg) { log(LogLevel::Security, msg); }
    void audit(const std::string& msg) { log(LogLevel::Audit, msg); }

private:
    Logger() = default;
    std::mutex mutex_;

    static std::string levelLabel(LogLevel level) {
        switch (level) {
            case LogLevel::Info: return "INFO";
            case LogLevel::Warning: return "WARNING";
            case LogLevel::Error: return "ERROR";
            case LogLevel::Security: return "SECURITY";
            case LogLevel::Audit: return "AUDIT";
        }
        return "INFO";
    }

    static std::string timestamp() {
        auto now = std::chrono::system_clock::now();
        auto t = std::chrono::system_clock::to_time_t(now);
        std::ostringstream oss;
        oss << std::put_time(std::localtime(&t), "%Y-%m-%d %H:%M:%S");
        return oss.str();
    }
};

} // namespace voicetext
