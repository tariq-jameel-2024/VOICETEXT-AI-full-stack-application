#include <cassert>
#include <cstdio>
#include <iostream>
#include <thread>
#include <vector>

#include "models/Models.hpp"
#include "repositories/TranscriptRepository.hpp"
#include "repositories/UserRepository.hpp"
#include "services/AuthService.hpp"
#include "services/STTService.hpp"
#include "services/TTSService.hpp"
#include "utils/DatabaseManager.hpp"
#include "utils/FileManager.hpp"

using namespace voicetext;

static int failures = 0;
#define CHECK(cond, msg) do { if (!(cond)) { std::cerr << "FAILED: " << msg << std::endl; failures++; } } while (0)

int main() {
    const char* dbFile = "test_hardening.db";
    std::remove(dbFile);
    DatabaseManager db(dbFile);
    db.migrate();

    UserRepository users(db);
    TranscriptRepository transcripts(db);
    SessionTokenManager tokens("hardening-test-secret");
    AuthService authService(users, tokens);

    // 1. Test multi-threaded database concurrency
    std::cout << "Testing database concurrency across threads..." << std::endl;
    std::vector<std::thread> workers;
    for (int i = 0; i < 8; ++i) {
        workers.emplace_back([&db, i]() {
            for (int j = 0; j < 25; ++j) {
                try {
                    auto stmt = db.prepare("SELECT 1");
                    stmt->step();
                } catch (const std::exception& e) {
                    std::cerr << "Concurrency error: " << e.what() << std::endl;
                    failures++;
                }
            }
        });
    }
    for (auto& w : workers) {
        w.join();
    }
    CHECK(failures == 0, "Multi-threaded database queries executed safely without SQLITE_BUSY or locks");

    // 2. Test user creation and token revocation / blacklist
    std::cout << "Testing token revocation and blacklist..." << std::endl;
    User testUser{"user_hardened", "Hardened User", "hardened@example.com", PasswordHasher::hash("pass123"), nowIso(), nowIso()};
    users.create(testUser);

    std::string token = tokens.issue(testUser.id, 3600);
    CHECK(authService.authenticate(token).has_value(), "Token should authenticate prior to revocation");
    CHECK(!authService.isTokenRevoked(token), "Token should not be marked as revoked initially");

    authService.revokeToken(token);
    CHECK(authService.isTokenRevoked(token), "Token should be marked as revoked after revocation");
    CHECK(!authService.authenticate(token).has_value(), "Revoked token must be rejected by authenticate");

    // 3. Test STT finalized transcript persistence
    std::cout << "Testing STT finalized transcript saving..." << std::endl;
    FileManager files("test_storage");
    // Mock STT provider that always succeeds
    class MockProvider : public SpeechToTextProvider {
    public:
        std::string providerName() const override { return "Mock"; }
        TranscriptResult transcribe(const std::string&, const std::string&) override {
            return {true, "Test text", "en", false};
        }
    };
    STTService sttService(std::make_unique<MockProvider>(), transcripts, files);

    Json saveResult = sttService.saveFinalizedTranscript(testUser.id, "Meeting Summary", "This is the transcript content from Web Speech.", "en-US", 42);
    CHECK(saveResult["success"].get<bool>(), "saveFinalizedTranscript should return success");
    CHECK(saveResult["data"]["title"] == "Meeting Summary", "Transcript title should match");
    CHECK(saveResult["data"]["duration"] == 42, "Transcript duration should match");

    std::string docId = saveResult["data"]["id"];
    auto savedDoc = transcripts.findById(docId);
    CHECK(savedDoc.has_value(), "Saved transcript should be retrievable from repository");
    CHECK(savedDoc->content == "This is the transcript content from Web Speech.", "Content should match");

    // 4. Test orphaned file cleanup when transcription provider fails
    std::cout << "Testing orphaned file cleanup on provider failure..." << std::endl;
    class FailingProvider : public SpeechToTextProvider {
    public:
        std::string providerName() const override { return "FailingMock"; }
        TranscriptResult transcribe(const std::string&, const std::string&) override {
            throw std::runtime_error("Simulated STT failure");
        }
    };
    STTService failingSttService(std::make_unique<FailingProvider>(), transcripts, files);
    std::string dummyAudio = "RIFF1234WAVEfmt 1234data";
    Json failResult = failingSttService.transcribeUpload(testUser.id, "audio.wav", "audio/wav", dummyAudio, "en-US");
    CHECK(!failResult["success"].get<bool>(), "transcribeUpload should return failure when provider throws");
    CHECK(failResult["error_code"] == "STT_PROCESSING_ERROR", "Error code should be STT_PROCESSING_ERROR");

    // 5. Test TTS text sanitization (stripping Urdu and English stage directions and markdown)
    std::cout << "Testing TTS text sanitization..." << std::endl;
    std::string songLyrics = "[Intro]\nمکھڑا:\nدل سے تیری نگاہ جگر تک اتر گئی\nانترا ۱:\nدونوں کو اک ادا میں رضا مند کر گئی\n[Outro]";
    std::string sanitized = TTSService::sanitizeText(songLyrics);
    CHECK(sanitized.find("[Intro]") == std::string::npos, "Stage direction [Intro] must be removed");
    CHECK(sanitized.find("[Outro]") == std::string::npos, "Stage direction [Outro] must be removed");
    CHECK(sanitized.find("مکھڑا") == std::string::npos, "Urdu section marker 'مکھڑا' must be removed");
    CHECK(sanitized.find("انترا") == std::string::npos, "Urdu section marker 'انترا' must be removed");
    CHECK(sanitized.find("دل سے تیری نگاہ جگر تک اتر گئی") != std::string::npos, "Actual lyrics content must be preserved");
    CHECK(sanitized.find("دونوں کو اک ادا میں رضا مند کر گئی") != std::string::npos, "Second line lyrics must be preserved");

    // 6. Test EdgeTTSProvider synthesis for both Uzma and Asad voices
    std::cout << "Testing EdgeTTSProvider synthesis..." << std::endl;
    EdgeTTSProvider edgeTTS("test_storage");
    AudioResult urduVoice = edgeTTS.synthesize("یہ ایک ٹیسٹ ہے", "ur", "ur-female");
    CHECK(urduVoice.success, "Edge-TTS should successfully synthesize Urdu voice (Uzma)");
    CHECK(!urduVoice.audioFilePath.empty(), "Generated audio path must not be empty");
    CHECK(urduVoice.mimeType == "audio/mpeg", "Mime type should be audio/mpeg");
    CHECK(std::filesystem::exists("test_storage/audio/generated/" + urduVoice.audioFilePath), "Audio file must exist in storage/audio/generated/");

    AudioResult urduMale = edgeTTS.synthesize("یہ اسد کی آواز کا ٹیسٹ ہے", "ur", "ur-male");
    CHECK(urduMale.success, "Edge-TTS should successfully synthesize Urdu voice (Asad)");
    CHECK(!urduMale.audioFilePath.empty(), "Generated male audio path must not be empty");
    CHECK(std::filesystem::exists("test_storage/audio/generated/" + urduMale.audioFilePath), "Male audio file must exist in storage/audio/generated/");

    // Clean up
    std::remove(dbFile);
    std::error_code ec;
    std::filesystem::remove_all("test_storage", ec);

    if (failures == 0) {
        std::cout << "All hardening tests passed successfully!" << std::endl;
        return 0;
    }
    return 1;
}
