// Unit tests: password hashing + session token issuance/verification,
// including security-focused edge cases (tampered tokens, expiry, wrong
// password).
#include <cassert>
#include <iostream>

#include "utils/Security.hpp"

using namespace voicetext;

static int failures = 0;
#define CHECK(cond, msg) do { if (!(cond)) { std::cerr << "FAILED: " << msg << std::endl; failures++; } } while (0)

int main() {
    // Password hashing round-trip
    std::string hash = PasswordHasher::hash("correct-horse-battery-staple");
    CHECK(PasswordHasher::verify("correct-horse-battery-staple", hash), "correct password should verify");
    CHECK(!PasswordHasher::verify("wrong-password", hash), "incorrect password must fail verification");

    // Plaintext must never be recoverable from the stored hash
    CHECK(hash.find("correct-horse-battery-staple") == std::string::npos, "hash must not contain plaintext password");

    // Session tokens
    SessionTokenManager tokens("test-secret");
    std::string token = tokens.issue("user_123", 60);
    CHECK(tokens.verify(token) == "user_123", "valid token should resolve to the correct user id");

    std::string tampered = token + "x";
    CHECK(tokens.verify(tampered).empty(), "tampered token must be rejected");

    std::string expired = tokens.issue("user_123", -10); // already expired
    CHECK(tokens.verify(expired).empty(), "expired token must be rejected");

    // Malformed tokens (must not throw exceptions or crash)
    CHECK(tokens.verify("invalid-token-without-dot").empty(), "token without dot must be rejected");
    CHECK(tokens.verify("user:notanumber.fakehmac").empty(), "token with non-numeric expiry must be rejected safely");
    CHECK(tokens.verify("user.fakehmac").empty(), "token without colon in payload must be rejected");

    // Corrupted hash verification (must return false, not throw)
    CHECK(!PasswordHasher::verify("password", "invalid_hash_no_dollar"), "invalid hash format must safely fail");
    CHECK(!PasswordHasher::verify("password", "zzzz$ffff"), "corrupted non-hex hash must safely fail");

    // Duplicate email / registration logic is covered at the AuthService
    // level via integration tests against a real SQLite database.

    if (failures == 0) std::cout << "All AuthService/Security tests passed." << std::endl;
    return failures == 0 ? 0 : 1;
}
