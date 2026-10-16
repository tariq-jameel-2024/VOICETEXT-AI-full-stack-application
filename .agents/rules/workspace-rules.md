# VoiceText AI Workspace Rules

## 1. C++ Toolchain Execution on Windows
When running C++ tests, ctest, or binaries built in `build-ucrt`, always prepend the UCRT64 binary directory to `$env:PATH`:
```powershell
$env:PATH = "C:\msys64\ucrt64\bin;" + $env:PATH
ctest --output-on-failure
```

## 2. Robust Input Parsing
Never use raw `std::stoi` or `std::stol` in Crow route handlers or token verification routines without exception guards (`try/catch`). Always provide safe fallbacks.

## 3. TypeScript API Client Casts
When transforming generic `ApiResponse<A>` to `ApiResponse<B>` where `A` and `B` do not share overlapping fields, cast through `unknown` to adhere to TypeScript strict variance rules:
```typescript
return (response as unknown) as ApiResponse<Target>;
```
