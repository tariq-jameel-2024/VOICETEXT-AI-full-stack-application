import { useEffect, useRef, useState } from "react";
import { Mic, Square, Pause, Play, XCircle, Upload, Copy, Save, Download, Sparkles, Languages, FileText as FileIcon, Loader2, RefreshCw } from "lucide-react";
import { Layout } from "../components/Layout";
import { Card, Button, Select, Textarea, Badge } from "../components/ui";
import { MicPulse, Waveform, AIAgentThinking } from "../components/AgentAnimations";
import { LANGUAGES } from "../lib/languages";
import { LiveRecognizer, AudioRecorder, isSpeechRecognitionSupported } from "../lib/speech";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { sttApi, aiApi, settingsApi, isBackendAvailable } from "../lib/api";
import type { AIOperation } from "../types";

type RecState = "idle" | "recording" | "paused" | "processing" | "finished";

export default function VoiceToText() {
  const { user } = useAuth();
  const { push } = useToast();
  const [language, setLanguage] = useState("en");
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [state, setState] = useState<RecState>("idle");
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [aiBusy, setAiBusy] = useState<AIOperation | null>(null);
  const [aiResult, setAiResult] = useState<{ op: AIOperation; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [translateTarget, setTranslateTarget] = useState("ur");

  const recognizerRef = useRef<LiveRecognizer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supported = isSpeechRecognitionSupported();

  useEffect(() => {
    const userId = user?.id || "guest";
    settingsApi.get(userId).then((res) => {
      if (res.data) {
        if (res.data.defaultLanguage) setLanguage(res.data.defaultLanguage);
        if (typeof res.data.autoSave === "boolean") setAutoSaveEnabled(res.data.autoSave);
      }
    });
  }, [user]);

  useEffect(() => {
    return () => {
      recognizerRef.current?.abort();
      audioRecorderRef.current?.cancel();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  function startTimer() {
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
  }
  function stopTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }

  const recordedBlobRef = useRef<Blob | null>(null);

  async function handleStart() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      push("Microphone permission denied. Please allow microphone access to record.", "error");
      return;
    }
    setTranscript("");
    setInterim("");
    setSeconds(0);
    setAiResult(null);
    setRecordedAudioUrl(null);
    recordedBlobRef.current = null;

    const audioRec = new AudioRecorder();
    audioRecorderRef.current = audioRec;
    try {
      await audioRec.start();
    } catch {
      // MediaRecorder fallback
    }

    const langCode = LANGUAGES.find((l) => l.code === language)?.speechCode || (language === "ur" ? "ur-PK" : "en-US");
    if (supported) {
      const recognizer = new LiveRecognizer(langCode, {
        onFinal: (text) => setTranscript((prev) => (prev + " " + text).trim()),
        onInterim: (text) => setInterim(text),
        onError: (msg) => {
          console.warn("Live speech recognition warning:", msg);
        },
        onEnd: () => {
          setInterim("");
        },
      });
      recognizerRef.current = recognizer;
      try {
        recognizer.start();
      } catch {
        // live recognizer start issue
      }
    }
    setState("recording");
    startTimer();
  }

  function handlePause() {
    recognizerRef.current?.stop();
    audioRecorderRef.current?.pause();
    setState("paused");
    stopTimer();
  }
  function handleResume() {
    recognizerRef.current?.start();
    audioRecorderRef.current?.resume();
    setState("recording");
    startTimer();
  }
  async function handleStop() {
    recognizerRef.current?.stop();
    setState("processing");
    stopTimer();

    let audioBlob: Blob | null = null;
    if (audioRecorderRef.current) {
      try {
        const { blob, url } = await audioRecorderRef.current.stop();
        audioBlob = blob;
        recordedBlobRef.current = blob;
        setRecordedAudioUrl(url);
      } catch {
        // audio capture end
      }
    }

    let finalContent = transcript.trim();

    // Send real recorded audio to local Faster-Whisper backend for high accuracy
    if (audioBlob && audioBlob.size > 200 && (await isBackendAvailable())) {
      push("Transcribing audio with Faster-Whisper AI…", "info");
      try {
        const ext = audioBlob.type.includes("wav") ? "wav" : audioBlob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([audioBlob], `voice_${Date.now()}.${ext}`, {
          type: audioBlob.type || "audio/webm",
        });
        const res = await sttApi.upload(file, language);
        if (res.success && res.data?.content) {
          finalContent = res.data.content;
          setTranscript(res.data.content);
          if (res.data.title) setTitle(res.data.title);
          push("Transcribed accurately with Faster-Whisper AI", "success");
        } else if (!finalContent) {
          push(res.message || "Could not transcribe audio", "warning");
        }
      } catch (err) {
        console.error("Faster-Whisper error:", err);
      }
    }

    setState("finished");

    if (autoSaveEnabled && finalContent) {
      sttApi.saveTranscription(user?.id || "guest", finalContent, language, seconds, title || undefined).then((res) => {
        if (res.success) push("Transcript auto-saved to library", "info");
      });
    }
  }
  function handleCancel() {
    recognizerRef.current?.abort();
    audioRecorderRef.current?.cancel();
    setRecordedAudioUrl(null);
    setTranscript("");
    setInterim("");
    setSeconds(0);
    setState("idle");
    stopTimer();
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      push("Unsupported file type. Please upload an audio file.", "error");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      push("File is too large. Maximum size is 25MB.", "error");
      return;
    }
    push("Uploading audio to the C++ speech service…", "info");
    setState("recording");
    const result = await sttApi.upload(file, language);
    setState(result.success ? "finished" : "idle");
    if (result.success && result.data) {
      setTranscript(result.data.content);
      setTitle(result.data.title);
      push(result.message, "success");
    } else {
      push(result.message, "error");
    }
    e.target.value = "";
  }

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const charCount = transcript.length;

  async function handleSave() {
    if (!transcript.trim()) {
      push("Nothing to save yet — record or type a transcript first.", "warning");
      return;
    }
    setSaving(true);
    const res = await sttApi.saveTranscription(user?.id || "guest", transcript.trim(), language, seconds, title || undefined);
    setSaving(false);
    if (res.success) push("Transcript saved to your documents", "success");
    else push(res.message, "error");
  }

  function handleCopy() {
    navigator.clipboard.writeText(transcript);
    push("Transcript copied to clipboard", "success");
  }

  function handleDownload() {
    const blob = new Blob([transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "transcript"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runAI(op: AIOperation) {
    if (!transcript.trim()) {
      push("Add some transcript text before running AI tools.", "warning");
      return;
    }
    setAiBusy(op);
    const target = op === "translate" ? translateTarget : (language === "en" ? "ur" : "en");
    const res = await aiApi.process(transcript, op, target);
    setAiBusy(null);
    if (res.success && res.data) setAiResult({ op, text: res.data.result });
    else push(res.message, "error");
  }

  return (
    <Layout title="Voice to Text">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <div className="mb-5 flex items-center justify-between gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-indigo-500" /> Input Language
            </span>
            <Badge tone="green">Faster-Whisper AI</Badge>
          </div>
          <Select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={state === "recording" || state === "processing"}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.label}
              </option>
            ))}
          </Select>

          <div className="my-8 flex flex-col items-center justify-center">
            {state === "processing" ? (
              <div className="flex flex-col items-center py-4">
                <Loader2 className="h-12 w-12 animate-spin text-indigo-500" />
                <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Transcribing with Faster-Whisper…
                </p>
                <p className="mt-1 text-xs text-slate-400">High-accuracy Urdu neural speech recognition</p>
              </div>
            ) : (
              <>
                <MicPulse active={state === "recording"} />
                <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-300">
                  {state === "idle" && "Ready to record"}
                  {state === "recording" && "Listening…"}
                  {state === "paused" && "Paused"}
                  {state === "finished" && "Recording finished"}
                </p>
                {(state === "recording" || state === "paused") && (
                  <p className="mt-1 font-mono text-2xl font-semibold text-slate-800 dark:text-slate-100">{formatTime(seconds)}</p>
                )}
                <Waveform active={state === "recording"} className="mt-3" />
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {state === "idle" && (
              <Button onClick={handleStart} icon={<Mic className="h-4 w-4" />}>
                Start Recording
              </Button>
            )}
            {state === "recording" && (
              <>
                <Button variant="secondary" onClick={handlePause} icon={<Pause className="h-4 w-4" />}>
                  Pause
                </Button>
                <Button variant="danger" onClick={handleStop} icon={<Square className="h-4 w-4" />}>
                  Stop
                </Button>
              </>
            )}
            {state === "paused" && (
              <>
                <Button onClick={handleResume} icon={<Play className="h-4 w-4" />}>
                  Resume
                </Button>
                <Button variant="danger" onClick={handleStop} icon={<Square className="h-4 w-4" />}>
                  Stop
                </Button>
              </>
            )}
            {state === "processing" && (
              <Button disabled icon={<Loader2 className="h-4 w-4 animate-spin" />}>
                Transcribing Audio…
              </Button>
            )}
            {(state === "recording" || state === "paused") && (
              <Button variant="ghost" onClick={handleCancel} icon={<XCircle className="h-4 w-4" />}>
                Cancel
              </Button>
            )}
            {state === "finished" && (
              <Button variant="outline" onClick={handleCancel} icon={<Mic className="h-4 w-4" />}>
                Record Again
              </Button>
            )}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Or upload audio</p>
            <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={handleFileSelected} />
            <Button variant="outline" className="w-full justify-center" onClick={handleUploadClick} icon={<Upload className="h-4 w-4" />}>
              Upload Audio File
            </Button>
          </div>

          {recordedAudioUrl && (
            <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 dark:border-indigo-500/20 dark:bg-indigo-500/5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                Audio Recording Playback
              </p>
              <audio controls src={recordedAudioUrl} className="w-full h-8 mb-2" />
              <a
                href={recordedAudioUrl}
                download={`${title || "voice-recording"}.webm`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <Download className="h-3.5 w-3.5" /> Download Audio File
              </a>
              {recordedBlobRef.current && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!recordedBlobRef.current) return;
                    setState("processing");
                    push("Re-transcribing audio with Faster-Whisper AI…", "info");
                    const ext = recordedBlobRef.current.type.includes("wav") ? "wav" : "webm";
                    const file = new File([recordedBlobRef.current], `re_${Date.now()}.${ext}`, {
                      type: recordedBlobRef.current.type || "audio/webm",
                    });
                    const res = await sttApi.upload(file, language);
                    setState("finished");
                    if (res.success && res.data?.content) {
                      setTranscript(res.data.content);
                      push("Re-transcription complete with Faster-Whisper!", "success");
                    } else {
                      push(res.message || "Failed to re-transcribe", "error");
                    }
                  }}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-white py-1.5 text-xs font-medium text-indigo-700 shadow-sm transition hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
                >
                  <RefreshCw className="h-3 w-3" /> Re-transcribe with Faster-Whisper AI
                </button>
              )}
            </div>
          )}

          {!supported && (
            <p className="mt-4 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              Live dictation isn't supported in this browser. Use Chrome/Edge, or upload an audio file for file-based transcription.
            </p>
          )}
        </Card>

        <Card className="flex flex-col p-6 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">Transcript</h3>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>Words: {wordCount}</span>
              <span>Characters: {charCount}</span>
            </div>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled voice note…"
            className="mb-3 rounded-lg border-0 bg-transparent px-1 text-lg font-medium text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />

          <Textarea
            value={transcript + (interim ? " " + interim : "")}
            onChange={(e) => setTranscript(e.target.value)}
            rows={10}
            placeholder="Your converted text appears here as you speak, or type/paste manually…"
            className="flex-1"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={handleCopy} icon={<Copy className="h-4 w-4" />}>
              Copy
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDownload} icon={<Download className="h-4 w-4" />}>
              Download
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} icon={<Save className="h-4 w-4" />}>
              Save Transcript
            </Button>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Sparkles className="h-3.5 w-3.5" /> AI Processing
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">Translate to:</span>
                <select
                  value={translateTarget}
                  onChange={(e) => setTranslateTarget(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["summarize", "grammar", "translate", "notes", "keywords", "rewrite"] as AIOperation[]).map((op) => (
                <Button key={op} variant="outline" size="sm" disabled={aiBusy !== null} onClick={() => runAI(op)}>
                  {labelFor(op)}
                </Button>
              ))}
            </div>

            {aiBusy && <AIAgentThinking label={`Running ${labelFor(aiBusy)}…`} />}

            {aiResult && !aiBusy && (
              <div className="mt-4 animate-fade-in-up rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/5">
                <div className="mb-2 flex items-center justify-between">
                  <Badge tone="indigo">
                    <FileIcon className="mr-1 inline h-3 w-3" /> {labelFor(aiResult.op)} Result
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(aiResult.text)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{aiResult.text}</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}

function labelFor(op: AIOperation) {
  return {
    summarize: "Summarize",
    grammar: "Correct Grammar",
    translate: "Translate",
    notes: "Generate Notes",
    keywords: "Extract Keywords",
    rewrite: "Rewrite",
  }[op];
}

function formatTime(total: number) {
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
