import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Volume2, FileText, Star, ArrowUpRight, HardDrive, Globe2, FolderClock, Play, Pause, Download } from "lucide-react";
import { Layout } from "../components/Layout";
import { Card, Badge, Button, EmptyState } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { transcriptApi, ttsApi } from "../lib/api";
import type { Transcript, TTSGeneration } from "../types";
import { getLanguage } from "../lib/languages";

export default function Dashboard() {
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [tts, setTts] = useState<TTSGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const userId = user?.id || "guest";
    Promise.all([transcriptApi.list(userId), ttsApi.list(userId)])
      .then(([t, v]) => {
        setTranscripts(t.data ?? []);
        setTts(v.data ?? []);
      })
      .catch((err) => console.error("Error loading dashboard data:", err))
      .finally(() => setLoading(false));
  }, [user]);

  const favorites = transcripts.filter((t) => t.favorite).length + tts.filter((t) => t.favorite).length;

  const storageUsedKb = useMemo(() => {
    const bytes = transcripts.reduce((acc, t) => acc + t.content.length, 0) + tts.reduce((acc, t) => acc + t.text.length, 0);
    return (bytes / 1024).toFixed(1);
  }, [transcripts, tts]);

  const languageUsage = useMemo(() => {
    const counts = new Map<string, number>();
    [...transcripts.map((t) => t.language), ...tts.map((t) => t.language)].forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [transcripts, tts]);

  const stats = [
    {
      label: "Transcriptions",
      value: transcripts.filter((t) => t.type === "voice_to_text").length,
      icon: Mic,
      tone: "from-indigo-500 to-violet-600",
      path: "/voice-to-text",
      hint: "Record voice note",
    },
    {
      label: "Voice Generations",
      value: tts.length,
      icon: Volume2,
      tone: "from-emerald-500 to-teal-600",
      path: "/text-to-voice",
      hint: "Generate speech",
    },
    {
      label: "Saved Documents",
      value: transcripts.length,
      icon: FileText,
      tone: "from-amber-500 to-orange-600",
      path: "/transcripts",
      hint: "View all documents",
    },
    {
      label: "Favorites",
      value: favorites,
      icon: Star,
      tone: "from-rose-500 to-pink-600",
      path: "/favorites",
      hint: "Starred items",
    },
  ];

  function handlePlayTts(item: TTSGeneration) {
    if (playingId === item.id) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
      return;
    }

    if (item.audio_path) {
      const endpoint = `http://localhost:8080/api/audio/${item.audio_path}`;
      if (audioRef.current) {
        audioRef.current.src = endpoint;
        audioRef.current.playbackRate = item.speed || 1.0;
        audioRef.current
          .play()
          .then(() => setPlayingId(item.id))
          .catch(() => {
            setPlayingId(null);
            push("Could not play audio. Ensure backend server is running.", "error");
          });
      }
    } else {
      push("No server audio available for this item.", "warning");
    }
  }

  async function handleDownloadTts(item: TTSGeneration) {
    if (!item.audio_path) {
      push("No audio file exists for this item.", "warning");
      return;
    }
    const endpoint = `http://localhost:8080/api/audio/${item.audio_path}`;
    try {
      push("Downloading original MP3...", "info");
      const resp = await fetch(endpoint);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `voice-${item.language}-${item.voice}-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      push("Original MP3 downloaded successfully!", "success");
    } catch {
      window.open(endpoint, "_blank");
    }
  }

  const recentDocs = transcripts.slice(0, 4);
  const recentTts = tts.slice(0, 4);

  return (
    <Layout title="Dashboard">
      {/* Hidden audio element for instant playback on dashboard */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        onPause={() => setPlayingId(null)}
        className="hidden"
      />

      <div className="mb-6 animate-fade-in-up rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg shadow-indigo-500/20 sm:p-8">
        <h2 className="text-2xl font-bold">Hi {user?.name?.split(" ")[0] ?? "there"}, welcome back 👋</h2>
        <p className="mt-1 max-w-xl text-indigo-100/90">
          Turn your voice into text, or your text into natural speech — then let AI summarize, translate, or clean it up.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <QuickAction label="Voice to Text" icon={<Mic className="h-4 w-4" />} onClick={() => navigate("/voice-to-text")} />
          <QuickAction label="Text to Voice" icon={<Volume2 className="h-4 w-4" />} onClick={() => navigate("/text-to-voice")} />
          <QuickAction label="New Document" icon={<FileText className="h-4 w-4" />} onClick={() => navigate("/transcripts")} />
          <QuickAction label="History" icon={<FolderClock className="h-4 w-4" />} onClick={() => navigate("/history")} />
        </div>
      </div>

      {/* Activated Top Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card
            key={s.label}
            onClick={() => navigate(s.path)}
            className="group relative cursor-pointer overflow-hidden p-5 transition-all duration-200 hover:-translate-y-1 hover:border-indigo-400/60 hover:shadow-lg dark:hover:border-indigo-500/50"
          >
            <div className="flex items-start justify-between">
              <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${s.tone} text-white shadow-sm transition-transform duration-200 group-hover:scale-110`}>
                <s.icon className="h-5 w-5" />
              </div>
              <span className="flex items-center gap-0.5 text-xs font-medium text-slate-400 opacity-0 transition-opacity duration-200 group-hover:text-indigo-600 group-hover:opacity-100 dark:group-hover:text-indigo-400">
                Open <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{loading ? "—" : s.value}</p>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">{s.label}</p>
              <span className="text-[11px] font-medium text-indigo-500 dark:text-indigo-400">{s.hint}</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Activated Recent Transcripts */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white">Recent Transcripts</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate("/transcripts")}>
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          {recentDocs.length === 0 ? (
            <EmptyState
              icon={<Mic className="h-6 w-6" />}
              title="No transcripts yet"
              description="Record your voice to generate your first transcript."
              action={
                <Button
                  size="sm"
                  onClick={() => navigate("/voice-to-text")}
                  icon={<Mic className="h-4 w-4" />}
                  className="mt-3"
                >
                  Start Recording
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentDocs.map((d) => (
                <li
                  key={d.id}
                  onClick={() => navigate("/transcripts")}
                  className="group -mx-2 flex cursor-pointer items-center justify-between rounded-xl px-2 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                      {d.title}
                    </p>
                    <p className="text-xs text-slate-400">
                      {getLanguage(d.language).flag} {getLanguage(d.language).label} · {new Date(d.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.favorite && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                    <ArrowUpRight className="h-4 w-4 text-slate-400 opacity-0 transition group-hover:opacity-100" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Storage & Usage */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white">Storage &amp; Usage</h3>
            <Button variant="ghost" size="sm" onClick={() => navigate("/history")}>
              History <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{storageUsedKb} KB used</p>
              <p className="text-xs text-slate-400">Workspace storage</p>
            </div>
          </div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Globe2 className="h-3.5 w-3.5" /> Recently used languages
          </h4>
          <div className="flex flex-wrap gap-2">
            {languageUsage.length === 0 && <p className="text-sm text-slate-400">No activity yet</p>}
            {languageUsage.map(([code, count]) => (
              <button
                key={code}
                onClick={() => navigate("/text-to-voice")}
                className="transition hover:scale-105 active:scale-95"
              >
                <Badge tone="indigo">
                  {getLanguage(code).flag} {getLanguage(code).label} · {count}
                </Badge>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Activated Recent Voice Generations with Direct Playback & Downloads */}
      <Card className="mt-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900 dark:text-white">Recent Voice Generations</h3>
            <Badge tone="green">{tts.length} Total</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/text-to-voice")}>
            Create new <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        {recentTts.length === 0 ? (
          <EmptyState
            icon={<Volume2 className="h-6 w-6" />}
            title="No voice generations yet"
            description="Generate natural speech from any text in seconds."
            action={
              <Button
                size="sm"
                onClick={() => navigate("/text-to-voice")}
                icon={<Volume2 className="h-4 w-4" />}
                className="mt-3"
              >
                Generate Voice
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {recentTts.map((t) => (
              <div
                key={t.id}
                className="group relative flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-indigo-400/60 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80"
              >
                <div>
                  <p className="line-clamp-2 text-sm font-medium text-slate-800 dark:text-slate-100">{t.text}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {getLanguage(t.language).flag} {getLanguage(t.language).label} · {t.voice} · {t.speed}x
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={playingId === t.id ? "primary" : "secondary"}
                      onClick={() => handlePlayTts(t)}
                      icon={playingId === t.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    >
                      {playingId === t.id ? "Pause" : "Play"}
                    </Button>
                    {t.audio_path && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownloadTts(t)}
                        title="Download original MP3"
                        icon={<Download className="h-3.5 w-3.5" />}
                      >
                        MP3
                      </Button>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate("/text-to-voice")}
                    title="Open in Text to Voice"
                  >
                    Open <ArrowUpRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Layout>
  );
}

function QuickAction({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25 active:scale-95"
    >
      {icon} {label}
    </button>
  );
}
