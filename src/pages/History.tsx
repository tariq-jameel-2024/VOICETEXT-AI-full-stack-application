import { useEffect, useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight, Star, Mic, Volume2, Sparkles, Languages } from "lucide-react";
import type { ReactElement } from "react";
import { Layout } from "../components/Layout";
import { Card, Input, Select, Badge, EmptyState } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { transcriptApi, ttsApi } from "../lib/api";
import type { DocumentType, Transcript, TTSGeneration } from "../types";
import { getLanguage } from "../lib/languages";

type Row = {
  id: string;
  name: string;
  type: DocumentType;
  language: string;
  created_at: string;
  updated_at: string;
  duration?: number | null;
  status: string;
  favorite: boolean;
};

const FILTERS = ["All", "Voice-to-Text", "Text-to-Voice", "Favorites", "Recent"] as const;
const PAGE_SIZE = 6;

export default function History() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!user) return;
    Promise.all([transcriptApi.list(user.id), ttsApi.list(user.id)]).then(([t, v]) => {
      const tRows: Row[] = (t.data ?? []).map((d: Transcript) => ({
        id: d.id,
        name: d.title,
        type: d.type,
        language: d.language,
        created_at: d.created_at,
        updated_at: d.updated_at,
        duration: d.duration,
        status: d.status,
        favorite: d.favorite,
      }));
      const vRows: Row[] = (v.data ?? []).map((d: TTSGeneration) => ({
        id: d.id,
        name: d.text.slice(0, 40) + (d.text.length > 40 ? "…" : ""),
        type: "text_to_voice",
        language: d.language,
        created_at: d.created_at,
        updated_at: d.created_at,
        duration: null,
        status: d.status,
        favorite: d.favorite,
      }));
      setRows([...tRows, ...vRows]);
    });
  }, [user]);

  async function toggleRowFavorite(row: Row) {
    const next = !row.favorite;
    if (row.type === "text_to_voice") {
      await ttsApi.toggleFavorite(row.id, next);
    } else {
      await transcriptApi.update(row.id, { favorite: next, user_id: user?.id });
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, favorite: next } : r)));
  }

  const filtered = useMemo(() => {
    let data = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
    if (filter === "Voice-to-Text") data = data.filter((r) => r.type === "voice_to_text");
    if (filter === "Text-to-Voice") data = data.filter((r) => r.type === "text_to_voice");
    if (filter === "Favorites") data = data.filter((r) => r.favorite);
    if (filter === "Recent") data = data.filter((r) => Date.now() - new Date(r.created_at).getTime() < 1000 * 60 * 60 * 24 * 7);
    data = [...data].sort((a, b) => (sortDesc ? +new Date(b.created_at) - +new Date(a.created_at) : +new Date(a.created_at) - +new Date(b.created_at)));
    return data;
  }, [rows, search, filter, sortDesc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Layout title="History">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search history…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                filter === f ? "bg-indigo-600 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {f}
            </button>
          ))}
          <Select value={sortDesc ? "desc" : "asc"} onChange={(e) => setSortDesc(e.target.value === "desc")} className="w-auto">
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {pageRows.length === 0 ? (
          <EmptyState icon={<Languages className="h-6 w-6" />} title="No history found" description="Your conversions and AI operations will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map((r) => (
                  <tr key={r.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="flex items-center gap-2 px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
                      <button onClick={() => toggleRowFavorite(r)} title={r.favorite ? "Unfavorite" : "Favorite"}>
                        <Star className={`h-3.5 w-3.5 ${r.favorite ? "fill-amber-400 text-amber-400" : "text-slate-300 hover:text-slate-500"}`} />
                      </button>
                      {r.name}
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={r.type} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {getLanguage(r.language).flag} {getLanguage(r.language).label}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.duration ? `${r.duration}s` : "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={r.status === "demo" ? "amber" : "green"}>{r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40 dark:border-slate-700"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40 dark:border-slate-700"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </Layout>
  );
}

function TypeBadge({ type }: { type: DocumentType }) {
  const map: Record<DocumentType, { label: string; icon: ReactElement; tone: "indigo" | "green" | "amber" | "rose" }> = {
    voice_to_text: { label: "Voice to Text", icon: <Mic className="mr-1 inline h-3 w-3" />, tone: "indigo" },
    text_to_voice: { label: "Text to Voice", icon: <Volume2 className="mr-1 inline h-3 w-3" />, tone: "green" },
    ai_summary: { label: "AI Summary", icon: <Sparkles className="mr-1 inline h-3 w-3" />, tone: "amber" },
    translation: { label: "Translation", icon: <Languages className="mr-1 inline h-3 w-3" />, tone: "rose" },
  };
  const m = map[type];
  return (
    <Badge tone={m.tone}>
      {m.icon}
      {m.label}
    </Badge>
  );
}
