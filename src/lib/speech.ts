// Thin wrappers around the browser Web Speech API (SpeechRecognition /
// SpeechSynthesis). This is the in-browser stand-in used by DEMO MODE for the
// SpeechToTextProvider / TextToSpeechProvider abstractions implemented on the
// C++ backend (backend/include/providers/*). Real deployments should route
// through /api/stt/transcribe and /api/tts/generate instead.

export function isSpeechRecognitionSupported(): boolean {
  const w = window as any;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported(): boolean {
  return "speechSynthesis" in window;
}

type RecognitionHandlers = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

export class LiveRecognizer {
  private recognition: any;
  private running = false;

  constructor(language: string, handlers: RecognitionHandlers) {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) throw new Error("SpeechRecognition not supported in this browser");
    this.recognition = new Ctor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = language;

    this.recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript + " ";
        else interim += transcript;
      }
      if (final && handlers.onFinal) handlers.onFinal(final);
      if (interim && handlers.onInterim) handlers.onInterim(interim);
    };
    this.recognition.onerror = (e: any) => {
      handlers.onError?.(e.error === "not-allowed" ? "Microphone permission denied" : `Recognition error: ${e.error}`);
    };
    this.recognition.onend = () => {
      this.running = false;
      handlers.onEnd?.();
    };
  }

  start() {
    this.running = true;
    this.recognition.start();
  }
  stop() {
    if (this.running) this.recognition.stop();
  }
  abort() {
    this.running = false;
    this.recognition.abort();
  }
}

export interface VoiceMatchResult {
  voice: SpeechSynthesisVoice | null;
  exactMatch: boolean;
  effectiveLang: string;
  isUrduMissing?: boolean;
  usedFallback?: boolean;
  statusMessage?: string;
}

export function sanitizeTTSText(input: string): string {
  if (!input) return "";
  let text = input;

  // 1. Remove bracketed stage directions [Chorus], [Verse 1], (Intro), etc.
  text = text.replace(/\[[^\]]*\]/g, " ");
  text = text.replace(/\([^)]*\)/g, " ");
  text = text.replace(/\{[^}]*\}/g, " ");

  // 2. Remove English song/speech structural labels
  text = text.replace(/(?:^|\n)\s*(?:Verse|Chorus|Outro|Bridge|Intro|Hook|Refrain)(?:\s*\d+)?\s*[:\-\.]?\s*/gi, "\n");

  // 3. Remove Urdu song / poetry structural headings (مکھڑا, استھائی, انترا, بند, کورس, شعر, گیت)
  text = text.replace(/(?:^|\n)\s*(?:مکھڑا|استھائی|انترا|بند|کورس|شعر|گیت)(?:\s*[\d\u06F0-\u06F9IVXivx]+)?\s*[:\-\.]?\s*/gi, "\n");

  // 4. Remove markdown headers (#, ##) and decorators (*, _, ~, `)
  text = text.replace(/^#+\s+/gm, "");
  text = text.replace(/[*_~`]/g, "");

  // 5. Normalize whitespace and consecutive newlines
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n\s*\n+/g, "\n\n");
  return text.trim();
}

export function findBestVoiceForLanguage(langCode: string): VoiceMatchResult {
  const allVoices = window.speechSynthesis.getVoices();
  const prefix = langCode.toLowerCase().split("-")[0]; // "ur", "hi", "en", "ps", "ar"

  // 1. Exact match on language prefix (e.g., ur-PK, ur-IN)
  const exact = allVoices.find((v) => v.lang.toLowerCase().startsWith(prefix));
  if (exact) {
    return {
      voice: exact,
      exactMatch: true,
      effectiveLang: exact.lang,
    };
  }

  // 2. Special handling for Urdu when no Urdu voice package is installed in browser/OS
  if (prefix === "ur") {
    // Intelligent fallback to Hindi (hi-IN / hi)
    const hindi = allVoices.find((v) => v.lang.toLowerCase().startsWith("hi"));
    if (hindi) {
      return {
        voice: hindi,
        exactMatch: false,
        effectiveLang: hindi.lang,
        isUrduMissing: true,
        usedFallback: true,
        statusMessage: "No native Urdu voice found in your browser. Using Hindi voice fallback.",
      };
    }
    return {
      voice: null,
      exactMatch: false,
      effectiveLang: langCode,
      isUrduMissing: true,
      usedFallback: false,
      statusMessage: "No Urdu voice found in your browser/system. Please install Urdu speech pack or configure the server TTS engine.",
    };
  }

  // 3. Generic fallback
  return {
    voice: allVoices[0] || null,
    exactMatch: false,
    effectiveLang: allVoices[0]?.lang || langCode,
  };
}

export function speak(
  text: string,
  opts: {
    lang: string;
    voiceURI?: string;
    rate?: number;
    pitch?: number;
    onEnd?: () => void;
    onStart?: () => void;
    onError?: (err: SpeechSynthesisErrorEvent) => void;
  }
): SpeechSynthesisUtterance {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = opts.lang;
  utter.rate = opts.rate ?? 1;
  utter.pitch = opts.pitch ?? 1;
  if (opts.voiceURI) {
    const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === opts.voiceURI);
    if (voice) utter.voice = voice;
  }
  utter.onstart = () => opts.onStart?.();
  utter.onend = () => opts.onEnd?.();
  utter.onerror = (e) => opts.onError?.(e);
  window.speechSynthesis.speak(utter);
  return utter;
}

export function cancelSpeech() {
  window.speechSynthesis.cancel();
}

export function pauseSpeech() {
  window.speechSynthesis.pause();
}

export function resumeSpeech() {
  window.speechSynthesis.resume();
}

export function getBrowserVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis.getVoices();
}

/** Real audio recorder capturing microphone stream via MediaRecorder */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };
    this.mediaRecorder.start(250);
  }

  stop(): Promise<{ blob: Blob; url: string }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error("Recorder not initialized"));
      }
      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || "audio/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        if (this.stream) {
          this.stream.getTracks().forEach((t) => t.stop());
          this.stream = null;
        }
        resolve({ blob, url });
      };
      this.mediaRecorder.stop();
    });
  }

  pause() {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.pause();
    }
  }

  resume() {
    if (this.mediaRecorder && this.mediaRecorder.state === "paused") {
      this.mediaRecorder.resume();
    }
  }

  cancel() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore if already stopped
      }
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.chunks = [];
  }
}

/** Helper to generate a valid audio/wav file representing synthesized speech */
export function createSynthesizedWavBlob(text: string, rate = 1.0): Blob {
  const sampleRate = 22050;
  const words = text.trim().split(/\s+/).length;
  const durationSec = Math.max(1.5, Math.min(60, (words / (140 * rate)) * 60));
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16-bit
  writeString(view, 36, "data");
  view.setUint32(40, numSamples * 2, true);

  // Formant synthesis emulation
  const baseFreq = 160;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const syllDuration = 0.35 / rate;
    const envelope = Math.sin((Math.PI * (t % syllDuration)) / syllDuration);
    const sample =
      0.45 * Math.sin(2 * Math.PI * baseFreq * t) +
      0.3 * Math.sin(2 * Math.PI * baseFreq * 2.15 * t) +
      0.25 * Math.sin(2 * Math.PI * baseFreq * 3.1 * t);
    const val = Math.max(-1, Math.min(1, sample * envelope * 0.75));
    view.setInt16(44 + i * 2, val < 0 ? val * 0x8000 : val * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

