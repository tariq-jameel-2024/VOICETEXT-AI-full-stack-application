import { Sparkles, Bot } from "lucide-react";

/** Animated microphone with expanding pulse rings, used while recording. */
export function MicPulse({ active, size = 120 }: { active: boolean; size?: number }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {active && (
        <>
          <span className="mic-pulse-ring absolute inset-0 rounded-full bg-rose-500/60" />
          <span className="mic-pulse-ring delay-1 absolute inset-0 rounded-full bg-rose-500/60" />
          <span className="mic-pulse-ring delay-2 absolute inset-0 rounded-full bg-rose-500/60" />
        </>
      )}
      <div
        className={`relative z-10 flex items-center justify-center rounded-full text-white shadow-xl transition-all duration-300 ${
          active ? "bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/40 scale-105" : "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-500/30"
        }`}
        style={{ width: size * 0.66, height: size * 0.66 }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: size * 0.28, height: size * 0.28 }}>
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </div>
    </div>
  );
}

/** Animated waveform bars reacting visually to "recording" / "speaking" state. */
export function Waveform({ active, bars = 24, className = "" }: { active: boolean; bars?: number; className?: string }) {
  return (
    <div className={`flex h-12 items-center justify-center gap-[3px] ${className}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={`wave-bar w-1 rounded-full ${active ? "bg-indigo-500 dark:bg-indigo-400" : "bg-slate-300 dark:bg-slate-700"}`}
          style={{
            height: active ? `${20 + Math.round(Math.sin(i) * 10) + (i % 5) * 6}%` : "20%",
            animationDelay: `${i * 0.045}s`,
            animationPlayState: active ? "running" : "paused",
          }}
        />
      ))}
    </div>
  );
}

/** Floating "AI Agent" badge with a glowing animated avatar — shown while AI is thinking. */
export function AIAgentThinking({ label = "AI Agent is thinking" }: { label?: string }) {
  return (
    <div className="agent-glow flex items-center gap-3 rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3 dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-violet-500/10">
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
        <Bot className="h-5 w-5" />
        <Sparkles className="spin-slow absolute -right-1 -top-1 h-3.5 w-3.5 text-amber-300" />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{label}</span>
        <span className="ai-dot h-1.5 w-1.5 rounded-full bg-indigo-500" style={{ animationDelay: "0s" }} />
        <span className="ai-dot h-1.5 w-1.5 rounded-full bg-indigo-500" style={{ animationDelay: "0.15s" }} />
        <span className="ai-dot h-1.5 w-1.5 rounded-full bg-indigo-500" style={{ animationDelay: "0.3s" }} />
      </div>
    </div>
  );
}

/** Small persistent floating AI agent orb used as decoration across the app. */
export function FloatingAgentOrb() {
  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-30 hidden select-none sm:block">
      <div className="float-y agent-glow flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-xl">
        <Bot className="h-6 w-6" />
      </div>
    </div>
  );
}
