# Lightweight, dependency-free test runner (no external test framework
# required). Each test file defines `int main()` and returns non-zero on
# failure; CTest treats that as a failing test.

add_executable(test_auth unit/test_auth.cpp)
target_include_directories(test_auth PRIVATE ${CMAKE_SOURCE_DIR}/backend/include)
target_link_libraries(test_auth PRIVATE OpenSSL::Crypto)
add_test(NAME AuthTests COMMAND test_auth)

add_executable(test_validation unit/test_validation.cpp)
target_include_directories(test_validation PRIVATE ${CMAKE_SOURCE_DIR}/backend/include)
add_test(NAME ValidationTests COMMAND test_validation)

add_executable(test_transcript_repository integration/test_transcript_repository.cpp)
target_include_directories(test_transcript_repository PRIVATE ${CMAKE_SOURCE_DIR}/backend/include)
target_link_libraries(test_transcript_repository PRIVATE SQLite3::SQLite3 OpenSSL::Crypto)
add_test(NAME TranscriptRepositoryTests COMMAND test_transcript_repository)

add_executable(test_hardening integration/test_hardening.cpp)
target_include_directories(test_hardening PRIVATE ${CMAKE_SOURCE_DIR}/backend/include)
target_link_libraries(test_hardening PRIVATE SQLite3::SQLite3 OpenSSL::Crypto)
add_test(NAME HardeningTests COMMAND test_hardening)

