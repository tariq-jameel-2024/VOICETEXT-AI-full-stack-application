import { useEffect, useState } from "react";
import { Star, Mic, Volume2 } from "lucide-react";
import { Layout } from "../components/Layout";
import { Card, Badge, EmptyState, Button } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { transcriptApi, ttsApi } from "../lib/api";
import type { Transcript, TTSGeneration } from "../types";
import { getLanguage } from "../lib/languages";

export default function Favorites() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Transcript[]>([]);
  const [tts, setTts] = useState<TTSGeneration[]>([]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  function load() {
    if (!user) return;
    transcriptApi.list(user.id).then((r) => setDocs((r.data ?? []).filter((d) => d.favorite)));
    ttsApi.list(user.id).then((r) => setTts((r.data ?? []).filter((d) => d.favorite)));
  }

  async function unfavoriteDoc(d: Transcript) {
    await transcriptApi.update(d.id, { favorite: false, user_id: d.user_id });
    load();
  }

  async function unfavoriteTts(t: TTSGeneration) {
    await ttsApi.toggleFavorite(t.id, false);
    load();
  }

  const isEmpty = docs.length === 0 && tts.length === 0;

  return (
    <Layout title="Favorites">
      {isEmpty ? (
        <EmptyState icon={<Star className="h-6 w-6" />} title="No favorites yet" description="Star your best transcripts and voice generations to find them quickly here." />
      ) : (
        <div className="space-y-8">
          {docs.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                <Mic className="h-4 w-4" /> Favorite Transcripts
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {docs.map((d) => (
                  <Card key={d.id} className="p-5">
                    <div className="mb-2 flex items-start justify-between">
                      <h4 className="font-semibold text-slate-800 dark:text-slate-100">{d.title}</h4>
                      <button onClick={() => unfavoriteDoc(d)}>
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      </button>
                    </div>
                    <p className="mb-3 line-clamp-3 text-sm text-slate-500 dark:text-slate-400">{d.content}</p>
                    <Badge tone="indigo">
                      {getLanguage(d.language).flag} {getLanguage(d.language).label}
                    </Badge>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {tts.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                <Volume2 className="h-4 w-4" /> Favorite Voice Generations
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tts.map((t) => (
                  <Card key={t.id} className="p-5">
                    <div className="mb-2 flex items-start justify-between">
                      <p className="line-clamp-3 flex-1 text-sm text-slate-700 dark:text-slate-200">{t.text}</p>
                      <button onClick={() => unfavoriteTts(t)} title="Unfavorite" className="ml-2">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      </button>
                    </div>
                    <Badge tone="green">
                      {getLanguage(t.language).flag} {t.voice}
                    </Badge>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <Button variant="ghost" size="sm" onClick={load}>
            Refresh
          </Button>
        </div>
      )}
    </Layout>
  );
}
