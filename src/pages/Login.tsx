import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AudioLines, Eye, EyeOff, Mic, Volume2, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, Input, Spinner } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("demo@voicetext.ai");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.success) {
      push("Welcome back to VoiceText AI!", "success");
      navigate("/dashboard");
    } else {
      setError(res.message);
    }
  };

  return (
    <AuthShell>
      <div className="mb-8">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
          <AudioLines className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to continue to your voice workspace.</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Email address</label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
          <div className="relative">
            <Input type={showPw ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full justify-center">
          {loading ? <Spinner /> : "Sign In"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Don't have an account?{" "}
        <Link to="/register" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
          Create one free
        </Link>
      </p>

      <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Create an account to get started. When the C++ backend is unavailable, the app switches to a browser-only demo account.
      </div>
    </AuthShell>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="flex items-center justify-center bg-white px-6 py-12 dark:bg-slate-900">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 lg:flex lg:items-center lg:justify-center">
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-10 h-80 w-80 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative z-10 max-w-md px-10 text-white">
          <div className="mb-8 flex gap-3">
            <div className="float-y flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <Mic className="h-7 w-7" />
            </div>
            <div className="float-y flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur" style={{ animationDelay: "0.6s" }}>
              <Volume2 className="h-7 w-7" />
            </div>
            <div className="float-y flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur" style={{ animationDelay: "1.2s" }}>
              <Sparkles className="h-7 w-7" />
            </div>
          </div>
          <h2 className="text-3xl font-bold leading-tight">Every voice, instantly understood.</h2>
          <p className="mt-4 text-indigo-100/90">
            VoiceText AI converts speech to text and text to natural speech in English, Urdu, Hindi, Pashto, and Arabic —
            backed by a modular C++ service architecture and AI-powered editing tools.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-indigo-100/90">
            {["Real-time dictation with live transcript preview", "Natural multi-voice text-to-speech", "AI summarize, translate & rewrite", "Secure, private, and fully exportable"].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
