// Unit tests for input validation & security guards: SQL-injection-style
// strings (must simply be treated as plain text thanks to parameterized
// queries elsewhere), path traversal attempts, and file validation.
#include <iostream>

#include "utils/Http.hpp"

using namespace voicetext;

static int failures = 0;
#define CHECK(cond, msg) do { if (!(cond)) { std::cerr << "FAILED: " << msg << std::endl; failures++; } } while (0)

int main() {
    CHECK(Validator::isValidEmail("user@example.com"), "valid email should pass");
    CHECK(!Validator::isValidEmail("not-an-email"), "invalid email should fail");

    CHECK(Validator::isValidPassword("secure1"), "6+ char password should pass");
    CHECK(!Validator::isValidPassword("abc"), "short password should fail");

    // Path traversal attempts must be rejected by the filename validator.
    CHECK(!Validator::isSafeFilename("../../etc/passwd"), "path traversal must be rejected");
    CHECK(!Validator::isSafeFilename("../secret.txt"), "relative traversal must be rejected");
    CHECK(!Validator::isSafeFilename("/etc/passwd"), "absolute path must be rejected");
    CHECK(Validator::isSafeFilename("my-recording_01.wav"), "a normal safe filename should pass");

    // SQL-injection-style payloads are treated as inert text by this layer;
    // real protection comes from parameterized queries in the repositories.
    std::string injection = "'; DROP TABLE users; --";
    CHECK(Validator::isNonEmpty(injection), "injection-like text is still just text at the validation layer");

    CHECK(Validator::isAllowedAudioMime("audio/wav"), "wav should be an allowed mime type");
    CHECK(!Validator::isAllowedAudioMime("application/x-msdownload"), "executables must never be accepted as audio");

    if (failures == 0) std::cout << "All validation/security tests passed." << std::endl;
    return failures == 0 ? 0 : 1;
}
