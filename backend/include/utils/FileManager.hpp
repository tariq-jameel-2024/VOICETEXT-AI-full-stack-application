#pragma once
// Secure file storage helper: generates unguessable filenames, validates
// extensions/size, and prevents path traversal outside the storage root.

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <random>
#include <sstream>
#include <string>
#include <vector>

#include "utils/Http.hpp"

namespace fs = std::filesystem;

namespace voicetext {

class FileManager {
public:
    explicit FileManager(std::string root) : root_(std::move(root)) {
        fs::create_directories(root_ + "/audio/uploads");
        fs::create_directories(root_ + "/audio/generated");
        fs::create_directories(root_ + "/transcripts");
        fs::create_directories(root_ + "/exports");
    }

    // Generates a cryptographically-random, collision-resistant filename.
    // User-supplied filenames are NEVER trusted directly.
    static std::string generateSafeFilename(const std::string& extension) {
        static const char charset[] = "abcdefghijklmnopqrstuvwxyz0123456789";
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> dist(0, sizeof(charset) - 2);
        std::ostringstream oss;
        for (int i = 0; i < 24; ++i) oss << charset[dist(gen)];
        return oss.str() + "." + sanitizeExtension(extension);
    }

    bool saveBinary(const std::string& relativeDir, const std::string& filename, const std::string& bytes, size_t maxBytes) {
        if (bytes.size() > maxBytes) return false;
        if (!Validator::isSafeFilename(filename)) return false;
        fs::path target = resolveSafePath(relativeDir, filename);
        std::ofstream out(target, std::ios::binary);
        if (!out) return false;
        out.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
        return true;
    }

    bool remove(const std::string& relativeDir, const std::string& filename) {
        if (!Validator::isSafeFilename(filename)) return false;
        std::error_code ec;
        return fs::remove(resolveSafePath(relativeDir, filename), ec);
    }

    std::string absolutePath(const std::string& relativeDir, const std::string& filename) const {
        return resolveSafePath(relativeDir, filename).string();
    }

private:
    std::string root_;

    static std::string sanitizeExtension(const std::string& ext) {
        std::string clean;
        for (char c : ext)
            if (std::isalnum(static_cast<unsigned char>(c))) clean += c;
        return clean.empty() ? "bin" : clean;
    }

    // Resolves a path inside root_ and throws/guards against traversal
    // (e.g. "../../etc/passwd") by validating the final canonical path is
    // still a descendant of the storage root.
    fs::path resolveSafePath(const std::string& relativeDir, const std::string& filename) const {
        fs::path base = fs::weakly_canonical(fs::path(root_) / relativeDir);
        fs::path candidate = fs::weakly_canonical(base / filename);
        auto baseStr = base.string();
        auto candidateStr = candidate.string();
        if (candidateStr.compare(0, baseStr.size(), baseStr) != 0) {
            throw std::runtime_error("Path traversal attempt blocked");
        }
        return candidate;
    }
};

} // namespace voicetext
