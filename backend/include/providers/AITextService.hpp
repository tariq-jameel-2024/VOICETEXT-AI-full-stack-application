#pragma once
// Abstraction layer for AI text operations (summarize, grammar correction,
// translate, notes, keywords, rewrite). The application must keep working
// even when no AI provider is configured — the mock implementation below
// uses simple, transparent heuristics instead of pretending to call an LLM.

#include <algorithm>
#include <cctype>
#include <map>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "models/Models.hpp"
#include "utils/ConfigManager.hpp"
#include "utils/Logger.hpp"

namespace voicetext {

class AITextService {
public:
    virtual ~AITextService() = default;
    virtual AIResult process(const std::string& text, const std::string& operation, const std::string& targetLanguage = "en") = 0;
    virtual std::string providerName() const = 0;
};

class MockAITextService : public AITextService {
public:
    AIResult process(const std::string& text, const std::string& operation, const std::string& targetLanguage = "en") override {
        AIResult result;
        result.success = true;
        result.isDemo = true;
        result.operation = operation;

        if (operation == "summarize") result.outputText = summarize(text);
        else if (operation == "grammar") result.outputText = correctGrammar(text);
        else if (operation == "keywords") result.outputText = extractKeywords(text);
        else if (operation == "notes") result.outputText = generateNotes(text);
        else if (operation == "rewrite") result.outputText = rewrite(text);
        else if (operation == "translate") result.outputText = translate(text, targetLanguage);
        else {
            result.success = false;
            result.errorMessage = "Unsupported AI operation: " + operation;
        }
        return result;
    }

    std::string providerName() const override { return "mock"; }

private:
    static std::vector<std::string> splitSentences(const std::string& text) {
        std::vector<std::string> sentences;
        std::string current;
        for (char c : text) {
            current += c;
            if (c == '.' || c == '?' || c == '!') {
                sentences.push_back(current);
                current.clear();
            }
        }
        if (!current.empty()) sentences.push_back(current);
        return sentences;
    }

    static std::string summarize(const std::string& text) {
        auto sentences = splitSentences(text);
        if (sentences.size() <= 2) return text;
        size_t keep = std::max<size_t>(1, static_cast<size_t>(sentences.size() * 0.4));
        std::ostringstream oss;
        for (size_t i = 0; i < keep; ++i) {
            if (i > 0) oss << " ";
            oss << sentences[i];
        }
        return oss.str();
    }

    static std::string correctGrammar(const std::string& text) {
        std::string out = text;
        if (!out.empty()) out[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(out[0])));
        return out;
    }

    static std::string extractKeywords(const std::string& text) {
        std::map<std::string, int> freq;
        std::string word;
        std::istringstream iss(text);
        while (iss >> word) {
            std::string clean;
            for (char c : word) if (std::isalnum(static_cast<unsigned char>(c))) clean += static_cast<char>(std::tolower(c));
            if (clean.size() > 3) freq[clean]++;
        }
        std::vector<std::pair<std::string, int>> sorted(freq.begin(), freq.end());
        std::sort(sorted.begin(), sorted.end(), [](auto& a, auto& b) { return a.second > b.second; });
        std::ostringstream oss;
        for (size_t i = 0; i < sorted.size() && i < 8; ++i) oss << "#" << sorted[i].first << " ";
        return oss.str();
    }

    static std::string generateNotes(const std::string& text) {
        auto sentences = splitSentences(text);
        std::ostringstream oss;
        for (auto& s : sentences) oss << "- " << s << "\n";
        return oss.str();
    }

    static std::string translate(const std::string& text, const std::string& targetLang) {
        if (targetLang == "ur") return "[اردو ترجمہ] " + text;
        if (targetLang == "hi") return "[हिंदी अनुवाद] " + text;
        if (targetLang == "ps") return "[پښتو ژباړه] " + text;
        if (targetLang == "ar") return "[ترجمة عربية] " + text;
        if (targetLang == "en") return "[English Translation] " + text;
        return "[" + targetLang + " translation] " + text;
    }

    static std::string rewrite(const std::string& text) {
        std::string out = text;
        auto replaceAll = [](std::string& str, const std::string& from, const std::string& to) {
            size_t pos = 0;
            while ((pos = str.find(from, pos)) != std::string::npos) {
                str.replace(pos, from.length(), to);
                pos += to.length();
            }
        };
        replaceAll(out, "very", "extremely");
        replaceAll(out, "good", "excellent");
        replaceAll(out, "bad", "poor");
        replaceAll(out, "important", "critical");
        return out;
    }
};

inline std::unique_ptr<AITextService> createAITextService(const ConfigManager& config) {
    std::string provider = config.get("AI_PROVIDER");
    if (provider.empty()) {
        Logger::instance().warning("AI_PROVIDER not configured — using demo/mock AI engine");
        return std::make_unique<MockAITextService>();
    }
    Logger::instance().warning("AI provider '" + provider + "' is not yet implemented — falling back to demo mode");
    return std::make_unique<MockAITextService>();
}

} // namespace voicetext
