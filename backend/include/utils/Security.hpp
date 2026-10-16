#pragma once
// Password hashing (PBKDF2-HMAC-SHA256 via OpenSSL) and signed session token
// helpers. Intentionally dependency-light so it can be swapped for
// bcrypt/argon2 in production without touching any calling code.

#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>

#include <chrono>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

namespace voicetext {

class PasswordHasher {
public:
    static std::string hash(const std::string& password) {
        unsigned char salt[16];
        RAND_bytes(salt, sizeof(salt));
        unsigned char derived[32];
        PKCS5_PBKDF2_HMAC(password.c_str(), static_cast<int>(password.size()), salt, sizeof(salt), 100000, EVP_sha256(), sizeof(derived), derived);
        return toHex(salt, sizeof(salt)) + "$" + toHex(derived, sizeof(derived));
    }

    static bool verify(const std::string& password, const std::string& storedHash) {
        auto sep = storedHash.find('$');
        if (sep == std::string::npos) return false;
        auto salt = fromHex(storedHash.substr(0, sep));
        unsigned char derived[32];
        PKCS5_PBKDF2_HMAC(password.c_str(), static_cast<int>(password.size()), salt.data(), static_cast<int>(salt.size()), 100000, EVP_sha256(), sizeof(derived), derived);
        return toHex(derived, sizeof(derived)) == storedHash.substr(sep + 1);
    }

private:
    static std::string toHex(const unsigned char* data, size_t len) {
        std::ostringstream oss;
        for (size_t i = 0; i < len; ++i) oss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(data[i]);
        return oss.str();
    }
    static std::vector<unsigned char> fromHex(const std::string& hex) {
        std::vector<unsigned char> out;
        try {
            for (size_t i = 0; i + 1 < hex.size(); i += 2)
                out.push_back(static_cast<unsigned char>(std::stoi(hex.substr(i, 2), nullptr, 16)));
        } catch (...) {
            return {};
        }
        return out;
    }
};

// Minimal signed session token: base64(payload).hmacHex(payload, secret)
// Payload = "<userId>:<expiryUnixSeconds>"
class SessionTokenManager {
public:
    explicit SessionTokenManager(std::string secret) : secret_(std::move(secret)) {}

    std::string issue(const std::string& userId, int ttlSeconds = 60 * 60 * 24 * 7) const {
        long expiry = static_cast<long>(std::time(nullptr)) + ttlSeconds;
        std::string payload = userId + ":" + std::to_string(expiry);
        return payload + "." + sign(payload);
    }

    // Returns the userId if the token is valid and not expired, else empty.
    std::string verify(const std::string& token) const {
        auto dot = token.find_last_of('.');
        if (dot == std::string::npos) return "";
        std::string payload = token.substr(0, dot);
        std::string signature = token.substr(dot + 1);
        if (sign(payload) != signature) return "";
        auto colon = payload.find(':');
        if (colon == std::string::npos) return "";
        long expiry = 0;
        try {
            expiry = std::stol(payload.substr(colon + 1));
        } catch (...) {
            return "";
        }
        if (expiry < static_cast<long>(std::time(nullptr))) return "";
        return payload.substr(0, colon);
    }

private:
    std::string secret_;

    std::string sign(const std::string& payload) const {
        unsigned char result[EVP_MAX_MD_SIZE];
        unsigned int len = 0;
        HMAC(EVP_sha256(), secret_.data(), static_cast<int>(secret_.size()),
             reinterpret_cast<const unsigned char*>(payload.data()), payload.size(), result, &len);
        std::ostringstream oss;
        for (unsigned int i = 0; i < len; ++i) oss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(result[i]);
        return oss.str();
    }
};

} // namespace voicetext
