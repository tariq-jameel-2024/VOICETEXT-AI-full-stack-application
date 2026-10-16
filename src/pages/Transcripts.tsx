import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Plus, Star, Trash2, Search, Edit3, Copy, Download, FileJson, Save } from "lucide-react";
import { Layout } from "../components/Layout";
import { Card, Button, Input, Textarea, Badge, EmptyState, Modal } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { transcriptApi } from "../lib/api";
import type { Transcript } from "../types";
import { getLanguage, LANGUAGES } from "../lib/languages";

export default function Transcripts() {
  const { user } = useAuth();
  const { push } = useToast();
  const [docs, setDocs] = useState<Transcript[]>([]);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Transcript | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    transcriptApi.list(user.id).then((res) => {
      setDocs(res.data ?? []);
      setLoading(false);
    });
  }, [user]);

  const filtered = useMemo(
    () => docs.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()) || d.content.toLowerCase().includes(search.toLowerCase())),
    [docs, search]
  );

  function refreshDoc(updated: Transcript) {
    setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    setActive(updated);
  }

  async function createDoc(title: string, language: string) {
    if (!user) return;
    const res = await transcriptApi.create({
      user_id: user.id,
      title: title || "Untitled Document",
      content: "",
      language,
      type: "voice_to_text",
      source_audio: null,
      duration: null,
      favorite: false,
      status: "demo",
    });
    if (res.success && res.data) {
      setDocs((prev) => [res.data!, ...prev]);
      setActive(res.data);
      setShowNew(false);
      push("New document created", "success");
    }
  }

  async function toggleFavorite(doc: Transcript) {
    const res = await transcriptApi.update(doc.id, { favorite: !doc.favorite, user_id: doc.user_id });
    if (res.success && res.data) refreshDoc(res.data);
  }

  async function removeDoc(id: string) {
    await transcriptApi.remove(id);
    setDocs((prev) => prev.filter((d) => d.id !== id));
    if (active?.id === id) setActive(null);
    push("Document deleted", "info");
  }

  return (
    <Layout title="My Transcripts">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" className="pl-9" />
        </div>
        <Button onClick={() => setShowNew(true)} icon={<Plus className="h-4 w-4" />}>
          New Document
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading documents…</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<FileText className="h-6 w-6" />} title="No documents found" description="Create a document manually or save a voice transcript to see it here." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => (
            <Card key={doc.id} className="flex flex-col p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 font-semibold text-slate-800 dark:text-slate-100">{doc.title}</h3>
                <button onClick={() => toggleFavorite(doc)}>
                  <Star className={`h-4 w-4 ${doc.favorite ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                </button>
              </div>
              <p className="mb-3 line-clamp-3 flex-1 text-sm text-slate-500 dark:text-slate-400">{doc.content || "Empty document…"}</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <Badge tone="indigo">
                  {getLanguage(doc.language).flag} {getLanguage(doc.language).label}
                </Badge>
                <Badge tone="slate">{typeLabel(doc.type)}</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="flex-1 justify-center" onClick={() => setActive(doc)} icon={<Edit3 className="h-3.5 w-3.5" />}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeDoc(doc.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {active && <EditorModal doc={active} onClose={() => setActive(null)} onSaved={refreshDoc} />}
      {showNew && <NewDocModal onClose={() => setShowNew(false)} onCreate={createDoc} />}
    </Layout>
  );
}

function typeLabel(t: Transcript["type"]) {
  return { voice_to_text: "Voice to Text", text_to_voice: "Text to Voice", ai_summary: "AI Summary", translation: "Translation" }[t];
}

function NewDocModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string, language: string) => void }) {
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("en");
  return (
    <Modal
      open
      onClose={onClose}
      title="New Document"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onCreate(title, language)}>Create</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting notes…" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}

// Full-featured document editor: word/char counts, find & replace, undo/redo,
// rename, favorite, autosave, manual save, copy, export.
function EditorModal({ doc, onClose, onSaved }: { doc: Transcript; onClose: () => void; onSaved: (d: Transcript) => void }) {
  const { push } = useToast();
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showFind, setShowFind] = useState(false);
  const historyRef = useRef<string[]>([doc.content]);
  const historyIndexRef = useRef(0);
  const autoSaveTimer = useRef<number | null>(null);

  function pushHistory(value: string) {
    const h = historyRef.current.slice(0, historyIndexRef.current + 1);
    h.push(value);
    historyRef.current = h;
    historyIndexRef.current = h.length - 1;
  }

  function handleChange(value: string) {
    setContent(value);
    pushHistory(value);
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => save(value, title, true), 1500);
  }

  function undo() {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      setContent(historyRef.current[historyIndexRef.current]);
    }
  }
  function redo() {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      setContent(historyRef.current[historyIndexRef.current]);
    }
  }

  function applyReplace() {
    if (!findText) return;
    const updated = content.split(findText).join(replaceText);
    handleChange(updated);
    push(`Replaced all occurrences of "${findText}"`, "success");
  }

  async function save(c = content, t = title, silent = false) {
    const res = await transcriptApi.update(doc.id, { content: c, title: t, user_id: doc.user_id });
    if (res.success && res.data) {
      onSaved(res.data);
      if (!silent) push("Document saved", "success");
    }
  }

  async function toggleFavorite() {
    const res = await transcriptApi.update(doc.id, { favorite: !doc.favorite, user_id: doc.user_id });
    if (res.success && res.data) onSaved(res.data);
  }

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
    if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => save(content, newTitle, true), 1500);
  }

  function exportTxt() {
    const blob = new Blob([content], { type: "text/plain" });
    triggerDownload(blob, `${title}.txt`);
  }
  function exportMd() {
    const md = `# ${title}\n\n**Language:** ${getLanguage(doc.language).label}\n**Type:** ${typeLabel(doc.type)}\n\n---\n\n${content}\n`;
    const blob = new Blob([md], { type: "text/markdown" });
    triggerDownload(blob, `${title}.md`);
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify({ title, content, language: doc.language, type: doc.type }, null, 2)], { type: "application/json" });
    triggerDownload(blob, `${title}.json`);
  }
  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={() => save(content, title)}
            className="w-full bg-transparent text-lg font-semibold text-slate-900 outline-none dark:text-white"
          />
          <div className="flex items-center gap-1">
            <button onClick={toggleFavorite} title="Favorite">
              <Star className={`h-5 w-5 ${doc.favorite ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
            </button>
            <button onClick={onClose} className="ml-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={undo}>
            Undo
          </Button>
          <Button variant="ghost" size="sm" onClick={redo}>
            Redo
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowFind((s) => !s)}>
            Find &amp; Replace
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(content)} icon={<Copy className="h-3.5 w-3.5" />}>
            Copy
          </Button>
          <Button variant="ghost" size="sm" onClick={exportTxt} icon={<Download className="h-3.5 w-3.5" />}>
            TXT
          </Button>
          <Button variant="ghost" size="sm" onClick={exportMd} icon={<Download className="h-3.5 w-3.5" />}>
            MD
          </Button>
          <Button variant="ghost" size="sm" onClick={exportJson} icon={<FileJson className="h-3.5 w-3.5" />}>
            JSON
          </Button>
        </div>

        {showFind && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
            <Input value={findText} onChange={(e) => setFindText(e.target.value)} placeholder="Find…" className="max-w-[160px]" />
            <Input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="Replace with…" className="max-w-[160px]" />
            <Button size="sm" onClick={applyReplace}>
              Replace All
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          <Textarea value={content} onChange={(e) => handleChange(e.target.value)} rows={14} placeholder="Start writing or editing your transcript…" />
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-400 dark:border-slate-800">
          <span>
            Words: {words} &nbsp;·&nbsp; Characters: {content.length.toLocaleString()}
          </span>
          <Button size="sm" onClick={() => save()} icon={<Save className="h-3.5 w-3.5" />}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
