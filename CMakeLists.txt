# VoiceText AI — Root CMake build script
# Builds the C++17 Crow + SQLite REST backend.
#
# Linux / macOS:
#   mkdir build && cd build
#   cmake -DCMAKE_BUILD_TYPE=Release ..
#   cmake --build . -j
#   ./voicetext_server
#
# Windows (MSVC + vcpkg recommended for Crow/SQLite3/nlohmann-json):
#   mkdir build && cd build
#   cmake .. -DCMAKE_TOOLCHAIN_FILE=%VCPKG_ROOT%\scripts\buildsystems\vcpkg.cmake
#   cmake --build . --config Release
#   .\Release\voicetext_server.exe

cmake_minimum_required(VERSION 3.16)
project(VoiceTextAI VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -Wall -Wextra")
set(CMAKE_CXX_FLAGS_RELEASE "-O2")

option(BUILD_TESTS "Build unit/integration tests" ON)

find_package(Threads REQUIRED)

# --- Dependencies ------------------------------------------------------
# Crow 1.2 uses Asio's deprecated io_service API, so pin a compatible release
# instead of relying on whichever version happens to be installed.
include(FetchContent)
FetchContent_Declare(
  StandaloneAsio
  URL https://github.com/chriskohlhoff/asio/archive/refs/tags/asio-1-28-2.zip
  URL_HASH SHA256=417536ED4D31645B550D6C475A952544D1AAB30A04D7228E6CE6CA935BF2DC1B
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_GetProperties(StandaloneAsio)
if(NOT standaloneasio_POPULATED)
  if(POLICY CMP0169)
    cmake_policy(SET CMP0169 OLD)
  endif()
  FetchContent_Populate(StandaloneAsio)
endif()
set(ASIO_INCLUDE_DIR "${standaloneasio_SOURCE_DIR}/asio/include" CACHE PATH "Standalone Asio include directory" FORCE)

# Crow (header-only HTTP framework)
find_path(CROW_INCLUDE_DIR crow.h PATH_SUFFIXES crow)
if(NOT CROW_INCLUDE_DIR)
  FetchContent_Declare(Crow GIT_REPOSITORY https://github.com/CrowCpp/Crow.git GIT_TAG v1.2.0)
  FetchContent_MakeAvailable(Crow)
endif()

# nlohmann/json (header-only)
find_package(nlohmann_json 3.9 QUIET)
if(NOT nlohmann_json_FOUND)
  include(FetchContent)
  FetchContent_Declare(json URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz)
  FetchContent_MakeAvailable(json)
endif()

# SQLite3
find_package(SQLite3 REQUIRED)

# OpenSSL (password hashing / HMAC session tokens)
find_package(OpenSSL REQUIRED)

# --- Backend sources -----------------------------------------------------
file(GLOB_RECURSE VOICETEXT_SOURCES CONFIGURE_DEPENDS backend/src/*.cpp)

add_executable(voicetext_server backend/main.cpp ${VOICETEXT_SOURCES})

target_include_directories(voicetext_server PRIVATE
  backend/include
  ${SQLite3_INCLUDE_DIRS}
)

target_link_libraries(voicetext_server PRIVATE
  Threads::Threads
  SQLite3::SQLite3
  OpenSSL::Crypto
)

if(WIN32)
  target_link_libraries(voicetext_server PRIVATE ws2_32 mswsock)
endif()

if(TARGET Crow::Crow)
  target_link_libraries(voicetext_server PRIVATE Crow::Crow)
elseif(CROW_INCLUDE_DIR)
  target_include_directories(voicetext_server PRIVATE ${CROW_INCLUDE_DIR})
endif()

if(TARGET nlohmann_json::nlohmann_json)
  target_link_libraries(voicetext_server PRIVATE nlohmann_json::nlohmann_json)
endif()

target_compile_definitions(voicetext_server PRIVATE VOICETEXT_VERSION="${PROJECT_VERSION}")

# --- Tests -----------------------------------------------------------------
if(BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()

install(TARGETS voicetext_server RUNTIME DESTINATION bin)
