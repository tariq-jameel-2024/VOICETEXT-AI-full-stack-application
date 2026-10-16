# Distributed under the OSI-approved BSD 3-Clause License.  See accompanying
# file LICENSE.rst or https://cmake.org/licensing for details.

cmake_minimum_required(VERSION ${CMAKE_VERSION}) # this file comes with cmake

# If CMAKE_DISABLE_SOURCE_CHANGES is set to true and the source directory is an
# existing directory in our source tree, calling file(MAKE_DIRECTORY) on it
# would cause a fatal error, even though it would be a no-op.
if(NOT EXISTS "C:/Users/PC vision/OneDrive/Documents/VOICETEXT-AI-full-stack-application/build-ucrt/_deps/standaloneasio-src")
  file(MAKE_DIRECTORY "C:/Users/PC vision/OneDrive/Documents/VOICETEXT-AI-full-stack-application/build-ucrt/_deps/standaloneasio-src")
endif()
file(MAKE_DIRECTORY
  "C:/Users/PC vision/OneDrive/Documents/VOICETEXT-AI-full-stack-application/build-ucrt/_deps/standaloneasio-build"
  "C:/Users/PC vision/OneDrive/Documents/VOICETEXT-AI-full-stack-application/build-ucrt/_deps/standaloneasio-subbuild/standaloneasio-populate-prefix"
  "C:/Users/PC vision/OneDrive/Documents/VOICETEXT-AI-full-stack-application/build-ucrt/_deps/standaloneasio-subbuild/standaloneasio-populate-prefix/tmp"
  "C:/Users/PC vision/OneDrive/Documents/VOICETEXT-AI-full-stack-application/build-ucrt/_deps/standaloneasio-subbuild/standaloneasio-populate-prefix/src/standaloneasio-populate-stamp"
  "C:/Users/PC vision/OneDrive/Documents/VOICETEXT-AI-full-stack-application/build-ucrt/_deps/standaloneasio-subbuild/standaloneasio-populate-prefix/src"
  "C:/Users/PC vision/OneDrive/Documents/VOICETEXT-AI-full-stack-application/build-ucrt/_deps/standaloneasio-subbuild/standaloneasio-populate-prefix/src/standaloneasio-populate-stamp"
)

set(configSubDirs )
foreach(subDir IN LISTS configSubDirs)
    file(MAKE_DIRECTORY "C:/Users/PC vision/OneDrive/Documents/VOICETEXT-AI-full-stack-application/build-ucrt/_deps/standaloneasio-subbuild/standaloneasio-populate-prefix/src/standaloneasio-populate-stamp/${subDir}")
endforeach()
if(cfgdir)
  file(MAKE_DIRECTORY "C:/Users/PC vision/OneDrive/Documents/VOICETEXT-AI-full-stack-application/build-ucrt/_deps/standaloneasio-subbuild/standaloneasio-populate-prefix/src/standaloneasio-populate-stamp${cfgdir}") # cfgdir has leading slash
endif()
