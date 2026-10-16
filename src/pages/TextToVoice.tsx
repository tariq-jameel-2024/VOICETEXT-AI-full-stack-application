import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, Play, Pause, Square, Download, Save, Trash2, Languages, Gauge, Mic2, Star, Sparkles } from "lucide-react";
import { Layout } from "../components/Layout";
import { Card, Button, Select, Textarea, Badge, EmptyState } from "../components/ui";
import { Waveform } from "../components/AgentAnimations";
import { LANGUAGES, voicesForLanguage } from "../lib/languages";
import {
  findBestVoiceForLanguage,
  isSpeechSynthesisSupported,
  pauseSpeech,
  resumeSpeech,
  speak,
  cancelSpeech,
  sanitizeTTSText,
} from "../lib/speech";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { isBackendAvailable, ttsApi, settingsApi } from "../lib/api";
import type { TTSGeneration } from "../types";

type PlayState = "idle" | "speaking" | "paused";

export default function TextToVoice() {
  const { user } = useAuth();
  const { push } = useToast();
  const [text, setText] = useState("Welcome to VoiceText AI — type anything and hear it come to life.");
  const [language, setLanguage] = useState("en");
  const [voice, setVoice] = useState(voicesForLanguage("en")[0]?.id || "");
  const [speed, setSpeed] = useState(1);
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean>(true);
  const [items, setItems] = useState<TTSGeneration[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const supported = isSpeechSynthesisSupported();

  useEffect(() => {
    const userId = user?.id || "guest";
    settingsApi.get(userId).then((res) => {
      if (res.data) {
        if (res.data.defaultLanguage) setLanguage(res.data.defaultLanguage);
        if (res.data.defaultVoice) setVoice(res.data.defaultVoice);
        if (res.data.defaultSpeed) setSpeed(res.data.defaultSpeed);
      }
    });
  }, [user]);

  useEffect(() => {
    isBackendAvailable().then(setBackendOnline);
    const timer = setInterval(() => {
      isBackendAvailable().then(setBackendOnline);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    ttsApi.list(user.id).then((res) => setItems(res.data ?? []));
  }, [user]);

  useEffect(() => {
    // preload available voices (required on some browsers)
    if (supported) window.speechSynthesis.getVoices();
  }, [supported]);

  const voiceOptions = useMemo(() => voicesForLanguage(language), [language]);
  const langMeta = LANGUAGES.find((l) => l.code === language)!;

  async function handleGenerate() {
    const cleaned = sanitizeTTSText(text);
    if (!cleaned.trim()) {
      push("Please enter text or lyrics before generating speech.", "warning");
      return;
    }

    setGenerating(true);
    setPlayState("idle");

    // 1. Try real server-side TTS engine first (Edge-TTS supporting natural Urdu Uzma/Asad)
    if (await isBackendAvailable()) {
      try {
        const res = await ttsApi.generate(user?.id || "guest", cleaned, language, voice, speed);
        if (res.success && res.data) {
          const newItem = res.data;
          setItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);

          if (newItem.audio_path) {
            const audioEndpoint = `http://localhost:8080/api/audio/${newItem.audio_path}`;
            setAudioUrl(audioEndpoint);
            setGenerating(false);

            if (audioRef.current) {
              audioRef.current.src = audioEndpoint;
              audioRef.current.playbackRate = speed;
              audioRef.current
                .play()
                .then(() => {
                  setPlayState("speaking");
                  push(`Audio generated using ${voiceOptions.find((v) => v.id === voice)?.label || voice} neural voice`, "success");
                })
                .catch(() => {
                  setPlayState("idle");
                  push("Audio generated and ready to play", "success");
                });
            }
            return;
          }
        }
      } catch (err) {
        console.warn("Backend TTS generation failed, falling back to browser synthesis:", err);
      }
    }

    // 2. Client-side Web Speech fallback with robust Urdu voice inspection
    if (!supported) {
      setGenerating(false);
      push("Speech synthesis is not supported in this browser.", "error");
      return;
    }

    const match = findBestVoiceForLanguage(langMeta.speechCode);
    if (match.isUrduMissing) {
      if (match.usedFallback && match.voice) {
        push(
          "No native Urdu voice found in your browser/system. Using Hindi voice fallback. Start backend for natural Urdu.",
          "warning"
        );
      } else {
        setGenerating(false);
        push(
          "No Urdu voice found in your browser/system. Please install Urdu speech pack or start backend TTS engine.",
          "error"
        );
        return;
      }
    }

    setAudioUrl(null);
    setGenerating(false);
    setPlayState("speaking");
    speak(cleaned, {
      lang: match.effectiveLang,
      voiceURI: match.voice?.voiceURI,
      rate: speed,
      onEnd: () => setPlayState("idle"),
      onStart: () => setPlayState("speaking"),
      onError: (err) => {
        console.error("Speech error:", err);
        setPlayState("idle");
        push(`Speech synthesis error: ${err.error || "playback failed"}`, "error");
      },
    });
    push("Speech synthesized and playing", "success");
  }

  function handlePlayAudio() {
    if (audioUrl && audioRef.current) {
      audioRef.current.playbackRate = speed;
      audioRef.current
        .play()
        .then(() => setPlayState("speaking"))
        .catch(() => handleGenerate());
      return;
    }
    handleGenerate();
  }

  function handlePause() {
    if (audioUrl && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    } else {
      pauseSpeech();
    }
    setPlayState("paused");
  }

  function handleResume() {
    if (audioUrl && audioRef.current && audioRef.current.paused) {
      audioRef.current.play();
    } else {
      resumeSpeech();
    }
    setPlayState("speaking");
  }

  function handleStop() {
    if (audioUrl && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    cancelSpeech();
    setPlayState("idle");
  }

  async function handleSave() {
    if (!user) return;
    const cleaned = sanitizeTTSText(text);
    const res = await ttsApi.generate(user.id, cleaned || text, language, voice, speed);
    if (res.success && res.data) {
      setItems((prev) => [res.data!, ...prev.filter((i) => i.id !== res.data!.id)]);
      push("Voice generation saved to history", "success");
    } else {
      push(res.message, "error");
    }
  }

  async function handleDelete(id: string) {
    await ttsApi.remove(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    push("Audio deleted", "info");
  }

  async function handleToggleFavorite(item: TTSGeneration) {
    const next = !item.favorite;
    const res = await ttsApi.toggleFavorite(item.id, next);
    if (res.success) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, favorite: next } : i)));
      push(res.message, "success");
    } else {
      push(res.message, "error");
    }
  }

  async function downloadBlobUrl(url: string, filename: string) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      push(`Original audio downloaded successfully (.mp3)`, "success");
    } catch {
      // Direct link fallback
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      push("Audio file opened for download", "info");
    }
  }

  async function handleDownloadAudio() {
    const cleaned = sanitizeTTSText(text);
    if (!cleaned.trim()) {
      push("Please enter text first before downloading audio.", "warning");
      return;
    }

    let targetUrl = audioUrl;

    // If audio has not been generated yet or text was changed, generate real Edge-TTS speech now!
    if (!targetUrl) {
      setDownloading(true);
      push("Generating original Edge-TTS audio for download...", "info");
      try {
        const res = await ttsApi.generate(user?.id || "guest", cleaned, language, voice, speed);
        if (res.success && res.data?.audio_path) {
          const endpoint = `http://localhost:8080/api/audio/${res.data.audio_path}`;
          targetUrl = endpoint;
          setAudioUrl(endpoint);
          setItems((prev) => [res.data!, ...prev.filter((i) => i.id !== res.data!.id)]);
          if (audioRef.current) {
            audioRef.current.src = endpoint;
            audioRef.current.playbackRate = speed;
          }
        } else {
          setDownloading(false);
          push(res.message || "Failed to generate audio from TTS engine", "error");
          return;
        }
      } catch (err) {
        setDownloading(false);
        push("Cannot connect to backend TTS engine. Please ensure voicetext_server is running on port 8080.", "error");
        return;
      }
      setDownloading(false);
    }

    if (!targetUrl) {
      push("Audio generation failed. Please check backend connection.", "error");
      return;
    }

    const voiceLabel = voiceOptions.find((v) => v.id === voice)?.label.replace(/[^\w\s-]/g, "").trim() || voice;
    const filename = `voice-${language}-${voiceLabel}-${Date.now()}.mp3`;
    await downloadBlobUrl(targetUrl, filename);
  }

  async function handleDownloadSavedItem(item: TTSGeneration) {
    if (item.audio_path) {
      const endpoint = `http://localhost:8080/api/audio/${item.audio_path}`;
      const filename = `voice-${item.language}-${item.voice}-${Date.now()}.mp3`;
      await downloadBlobUrl(endpoint, filename);
    } else {
      push("This item has no server audio path. Please regenerate.", "warning");
    }
  }

  function handlePlaySavedItem(item: TTSGeneration) {
    setText(item.text);
    setLanguage(item.language);
    setVoice(item.voice);
    setSpeed(item.speed);

    if (item.audio_path) {
      const endpoint = `http://localhost:8080/api/audio/${item.audio_path}`;
      setAudioUrl(endpoint);
      if (audioRef.current) {
        audioRef.current.src = endpoint;
        audioRef.current.playbackRate = item.speed;
        audioRef.current
          .play()
          .then(() => setPlayState("speaking"))
          .catch(() => setPlayState("idle"));
      }
    } else {
      setAudioUrl(null);
      const match = findBestVoiceForLanguage(LANGUAGES.find((l) => l.code === item.language)?.speechCode || "en-US");
      speak(sanitizeTTSText(item.text), {
        lang: match.effectiveLang,
        voiceURI: match.voice?.voiceURI,
        rate: item.speed,
        onEnd: () => setPlayState("idle"),
        onStart: () => setPlayState("speaking"),
      });
    }
  }

  return (
    <Layout title="Text to Voice">
      {/* Hidden audio element for high-quality server-streamed audio playback */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayState("idle")}
        onPlay={() => setPlayState("speaking")}
        onPause={() => setPlayState("paused")}
        className="hidden"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h3 className="font-semibold text-slate-900 dark:text-white">Enter your text</h3>
              {backendOnline ? (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Edge-TTS Connected
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-400" title="Run voicetext_server.exe for original Edge-TTS voices">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Backend Offline
                </span>
              )}
            </div>
            <span className="text-xs text-slate-400">{text.length}/5000</span>
          </div>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value.slice(0, 5000));
              setAudioUrl(null);
            }}
            rows={9}
            placeholder="Type or paste the lyrics or speech you want to convert to voice… (Stage directions like [Chorus] or مکھڑا are automatically filtered)"
          />

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Languages className="h-3.5 w-3.5" /> Language
              </label>
              <Select
                value={language}
                onChange={(e) => {
                  const newLang = e.target.value;
                  setLanguage(newLang);
                  const voices = voicesForLanguage(newLang);
                  setVoice(voices[0]?.id || "");
                  setAudioUrl(null);
                }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Mic2 className="h-3.5 w-3.5" /> Voice
              </label>
              <Select
                value={voice}
                onChange={(e) => {
                  setVoice(e.target.value);
                  setAudioUrl(null);
                }}
              >
                {voiceOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Gauge className="h-3.5 w-3.5" /> Speed: {speed.toFixed(1)}x
              </label>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={speed}
                onChange={(e) => {
                  const s = parseFloat(e.target.value);
                  setSpeed(s);
                  if (audioRef.current) {
                    audioRef.current.playbackRate = s;
                  }
                }}
                className="mt-3 w-full accent-indigo-600"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button className="w-full justify-center sm:w-auto" onClick={handleGenerate} disabled={generating} icon={<Volume2 className="h-4 w-4" />}>
              {generating ? "Generating Speech…" : "Generate Voice"}
            </Button>
            {audioUrl && (
              <Badge tone="green">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Neural Audio Generated
                </span>
              </Badge>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-100 p-5 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Audio Player</p>
              {audioUrl ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">Server Neural Stream (.mp3)</span>
              ) : (
                <span className="text-xs text-slate-400">Web Speech Engine</span>
              )}
            </div>
            <Waveform active={playState === "speaking"} />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {playState === "idle" && (
                <Button size="sm" onClick={handlePlayAudio} icon={<Play className="h-4 w-4" />}>
                  Play
                </Button>
              )}
              {playState === "speaking" && (
                <Button size="sm" variant="secondary" onClick={handlePause} icon={<Pause className="h-4 w-4" />}>
                  Pause
                </Button>
              )}
              {playState === "paused" && (
                <Button size="sm" onClick={handleResume} icon={<Play className="h-4 w-4" />}>
                  Resume
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleStop} icon={<Square className="h-4 w-4" />}>
                Stop
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadAudio}
                disabled={downloading}
                icon={<Download className="h-4 w-4" />}
              >
                {downloading ? "Preparing MP3…" : "Download MP3"}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleSave} icon={<Save className="h-4 w-4" />}>
                Save
              </Button>
            </div>
            {!supported && !audioUrl && <p className="mt-3 text-xs text-amber-600">Speech synthesis isn't supported in this browser.</p>}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 font-semibold text-slate-900 dark:text-white">Saved Voice Generations</h3>
          {items.length === 0 ? (
            <EmptyState icon={<Volume2 className="h-6 w-6" />} title="No saved audio yet" description="Generate and save speech to see it listed here." />
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                  <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-200">{item.text}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <Badge tone="slate">
                      {LANGUAGES.find((l) => l.code === item.language)?.flag} {item.voice} · {item.speed}x
                    </Badge>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleFavorite(item)}
                        className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                        title={item.favorite ? "Unfavorite" : "Favorite"}
                      >
                        <Star className={`h-3.5 w-3.5 ${item.favorite ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePlaySavedItem(item)}
                        title="Play audio"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      {item.audio_path && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadSavedItem(item)}
                          title="Download original MP3"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Layout>
  );
}
