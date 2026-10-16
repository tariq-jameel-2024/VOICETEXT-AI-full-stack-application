// Integration tests exercising the real SQLite-backed repositories:
// create/read/update/delete + search, plus unauthorized cross-user access
// protection (a user must never be able to read/update/delete another
// user's transcript).
#include <cassert>
#include <cstdio>
#include <iostream>

#include "repositories/MediaRepository.hpp"
#include "repositories/TranscriptRepository.hpp"
#include "repositories/UserRepository.hpp"
#include "services/AuthService.hpp"
#include "utils/DatabaseManager.hpp"

using namespace voicetext;

static int failures = 0;
#define CHECK(cond, msg) do { if (!(cond)) { std::cerr << "FAILED: " << msg << std::endl; failures++; } } while (0)

int main() {
    const char* dbFile = "test_transcripts.db";
    std::remove(dbFile);
    DatabaseManager db(dbFile);
    db.migrate();

    UserRepository users(db);
    TranscriptRepository transcripts(db);

    User alice{"user_alice", "Alice", "alice@example.com", PasswordHasher::hash("password1"), nowIso(), nowIso()};
    User bob{"user_bob", "Bob", "bob@example.com", PasswordHasher::hash("password2"), nowIso(), nowIso()};
    users.create(alice);
    users.create(bob);

    // Duplicate email should be discoverable before insert (service layer
    // enforces this; here we verify the repository lookup works).
    CHECK(users.findByEmail("alice@example.com").has_value(), "should find Alice by email");
    CHECK(!users.findByEmail("nobody@example.com").has_value(), "unknown email should not resolve");

    Transcript t;
    t.id = "doc_1";
    t.userId = alice.id;
    t.title = "Meeting Notes";
    t.content = "We discussed the roadmap.";
    t.language = "en";
    t.type = "voice_to_text";
    t.createdAt = t.updatedAt = nowIso();
    transcripts.create(t);

    auto fetched = transcripts.findById("doc_1");
    CHECK(fetched.has_value() && fetched->title == "Meeting Notes", "created transcript should be retrievable");

    auto searchResults = transcripts.search(alice.id, "roadmap");
    CHECK(searchResults.size() == 1, "search should find the transcript by content");

    fetched->title = "Updated Title";
    fetched->favorite = true;
    transcripts.update(*fetched);
    auto updated = transcripts.findById("doc_1");
    CHECK(updated->title == "Updated Title" && updated->favorite, "update should persist changes");

    // Cross-user protection: Bob must not be able to delete Alice's document.
    transcripts.remove("doc_1", bob.id);
    auto stillThere = transcripts.findById("doc_1");
    CHECK(stillThere.has_value(), "a document must not be deletable by a different user");

    transcripts.remove("doc_1", alice.id);
    auto gone = transcripts.findById("doc_1");
    CHECK(!gone.has_value(), "the owning user should be able to delete their own document");

    // TTSRepository tests (including favorite toggling)
    TTSRepository ttsRepo(db);
    TTSGeneration gen;
    gen.id = "tts_1";
    gen.userId = alice.id;
    gen.text = "Hello world";
    gen.language = "en";
    gen.voice = "default-female";
    gen.speed = 1.0;
    gen.favorite = false;
    gen.status = "completed";
    gen.createdAt = nowIso();
    ttsRepo.create(gen);

    auto ttsList = ttsRepo.listByUser(alice.id);
    CHECK(!ttsList.empty() && ttsList[0].id == "tts_1", "created TTS generation should be listed");
    CHECK(!ttsList[0].favorite, "TTS generation should start as not favorite");

    ttsRepo.updateFavorite("tts_1", alice.id, true);
    auto ttsFetched = ttsRepo.findById("tts_1");
    CHECK(ttsFetched.has_value() && ttsFetched->favorite, "TTS favorite should be updated to true");

    ttsRepo.remove("tts_1", alice.id);
    CHECK(!ttsRepo.findById("tts_1").has_value(), "TTS generation should be deleted");

    std::remove(dbFile);

    if (failures == 0) std::cout << "All transcript repository integration tests passed." << std::endl;
    return failures == 0 ? 0 : 1;
}
