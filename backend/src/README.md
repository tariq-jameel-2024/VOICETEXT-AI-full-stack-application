# backend/src

VoiceText AI's backend is implemented as a **header-only** C++ library under
`backend/include/` (one class per file, organized by architectural layer:
`controllers/`, `services/`, `repositories/`, `models/`, `middleware/`,
`utils/`, `providers/`). This keeps the project easy to build with a single
`CMakeLists.txt` and no split header/implementation bookkeeping, while still
being fully modular — nothing lives in `main.cpp` beyond wiring.

This directory is kept so the build system has a stable `backend/src/*.cpp`
glob target for future non-header-only translation units (for example, a
real `WhisperCppSpeechToTextProvider.cpp` that links against a native
Whisper.cpp static library). Add new `.cpp` files here and they will be
picked up automatically by the root `CMakeLists.txt`.
