import { localizeError } from "@/i18n/localize-error";
import { useTranslation } from "react-i18next";
import { uiCopy } from "@/i18n/ui-copy";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Megaphone, Paperclip, Send, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createBroadcast,
  getBroadcastAudience,
  listBroadcasts,
  sendBroadcastBatch,
} from "@/lib/broadcast.functions";

export const Route = createFileRoute("/broadcast")({
  head: () => ({
    meta: [
      { title: uiCopy("pages.broadcast.title") },
      { name: "description", content: uiCopy("pages.broadcast.description") },
      { property: "og:title", content: uiCopy("pages.broadcast.title") },
      { property: "og:description", content: uiCopy("pages.broadcast.description") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BroadcastPage,
});

type LangFilter = "all" | "uz" | "ru";
type MediaState = {
  storagePath: string;
  fileName: string;
  mime: string;
  kind: "photo" | "document";
} | null;

const LANG_LABEL: Record<LangFilter, string> = {
  get all() {
    return uiCopy("ux.copy934dd25ec5");
  },
  get uz() {
    return uiCopy("ux.copy915cb7fbc7");
  },
  get ru() {
    return uiCopy("ux.copy368c007214");
  },
};

function BroadcastPage() {
  useTranslation();
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();

  const audienceFn = useServerFn(getBroadcastAudience);
  const createFn = useServerFn(createBroadcast);
  const batchFn = useServerFn(sendBroadcastBatch);
  const listFn = useServerFn(listBroadcasts);

  const [message, setMessage] = useState("");
  const [langFilter, setLangFilter] = useState<LangFilter>("all");
  const [media, setMedia] = useState<MediaState>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, ok: 0, fail: 0 });
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null);

  const { data: audience } = useQuery({
    queryKey: ["broadcast-audience", langFilter],
    enabled: isAdmin,
    queryFn: () => audienceFn({ data: { langFilter } }),
    refetchInterval: 60_000,
  });

  const { data: history } = useQuery({
    queryKey: ["broadcast-history"],
    enabled: isAdmin,
    queryFn: () => listFn(),
  });

  const audienceCount = audience?.count ?? 0;

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title={uiCopy("ux.copyc4da70b633")} description={uiCopy("ux.copy5a5a3d6567")} />
      </div>
    );
  }

  const onUpload = async (file: File) => {
    if (!user?.id) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `broadcasts/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("telegram-media").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (error) throw error;
      setMedia({
        storagePath: path,
        fileName: file.name,
        mime: file.type || "application/octet-stream",
        kind: file.type.startsWith("image/") ? "photo" : "document",
      });
    } catch (e) {
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copya40a00757b")));
    } finally {
      setUploading(false);
    }
  };

  const runBroadcast = async () => {
    setConfirmOpen(false);
    setSending(true);
    setResult(null);
    setProgress({ done: 0, total: audienceCount, ok: 0, fail: 0 });
    try {
      const { broadcastId } = await createFn({
        data: { message, langFilter, media, targetCount: audienceCount },
      });
      let afterId: string | null = null;
      let ok = 0;
      let fail = 0;
      // Batches are throttled server-side to ~1 message/second.
      for (;;) {
        const r = await batchFn({ data: { broadcastId, afterId, batchSize: 15 } });
        ok = r.totalSuccess;
        fail = r.totalFailed;
        afterId = r.lastId;
        setProgress({ done: ok + fail, total: Math.max(audienceCount, ok + fail), ok, fail });
        if (r.done) break;
      }
      setResult({ ok, fail });
      toast.success(uiCopy("ux.copyed7dd9ebba", { value0: ok, value1: fail }));
      setMessage("");
      setMedia(null);
      qc.invalidateQueries({ queryKey: ["broadcast-history"] });
      qc.invalidateQueries({ queryKey: ["broadcast-audience"] });
    } catch (e) {
      toast.error(localizeError(e instanceof Error ? e.message : uiCopy("ux.copyc7df7ab9d2")));
    } finally {
      setSending(false);
    }
  };

  const canSend = (message.trim().length > 0 || !!media) && audienceCount > 0 && !sending;

  return (
    <div className="space-y-4">
      <PageHeader title={uiCopy("ux.copyc4da70b633")} description={uiCopy("ux.copyab1bf4947f")} />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4" /> {uiCopy("ux.copy528d29f905")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{uiCopy("ux.copyc54c521437")}</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                maxLength={3500}
                placeholder={uiCopy("ux.copy80f2eff975")}
              />
              <p className="text-xs text-muted-foreground">{uiCopy("ux.copy882a2fcef1")}</p>
            </div>

            <div className="space-y-2">
              <Label>{uiCopy("ux.copya09e9a6dbb")}</Label>
              <Select value={langFilter} onValueChange={(v) => setLangFilter(v as LangFilter)}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{uiCopy("ux.copy934dd25ec5")}</SelectItem>
                  <SelectItem value="uz">{uiCopy("ux.copy521fd56509")}</SelectItem>
                  <SelectItem value="ru">{uiCopy("ux.copy3921c2a44f")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{uiCopy("ux.copyfd95a7c85d")}</Label>
              {media ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{media.fileName}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setMedia(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <input
                  type="file"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                    e.target.value = "";
                  }}
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
                />
              )}
            </div>

            {sending && (
              <div className="space-y-2">
                <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
                <p className="text-xs text-muted-foreground">
                  {uiCopy("ux.copy8321f5ba42")} {progress.done}/{progress.total}{" "}
                  {uiCopy("ux.copy70d898c46c")} {progress.ok} {uiCopy("ux.copyb2a76f8a46")}{" "}
                  {progress.fail}
                </p>
              </div>
            )}

            {result && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                {uiCopy("ux.copy523c3ace86")} <strong>{result.ok}</strong>
                {uiCopy("ux.copyabdc9c407b")} <strong>{result.fail}</strong>
                {uiCopy("ux.copy5a62fd50d2")}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!canSend} onClick={() => setConfirmOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                {sending ? uiCopy("ux.copy8321f5ba42") : uiCopy("ux.copy6979bfc484")}
              </Button>
              <span className="text-sm text-muted-foreground">
                {uiCopy("ux.copy78bac16426")} <strong>{audienceCount}</strong>
                {uiCopy("ux.copyfddd3e1176")}
                {LANG_LABEL[langFilter]})
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{uiCopy("ux.copyb66d1487bc")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{uiCopy("ux.copy89fe4a949a")}</p>
            <p>{uiCopy("ux.copy7782656d48")}</p>
            <p>{uiCopy("ux.copyb2f8bea756")}</p>
            <p>{uiCopy("ux.copycad01055c0")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{uiCopy("ux.copyed11019be9")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{uiCopy("ux.copy3a17ac56c8")}</TableHead>
                <TableHead>{uiCopy("ux.copy8a0c65f9e1")}</TableHead>
                <TableHead>{uiCopy("ux.copy1a723e1dbb")}</TableHead>
                <TableHead className="text-right">{uiCopy("ux.copy6bf537cb7e")}</TableHead>
                <TableHead className="text-right">{uiCopy("ux.copy23b6441130")}</TableHead>
                <TableHead className="text-right">{uiCopy("ux.copy732fe33ab1")}</TableHead>
                <TableHead>{uiCopy("ux.copy2926977ba7")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history?.broadcasts ?? []).map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(b.created_at).toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="max-w-[360px] truncate text-xs">
                    {b.message || (b.media_file_name ?? uiCopy("ux.copy3809a0592f"))}
                  </TableCell>
                  <TableCell className="text-xs">
                    {LANG_LABEL[(b.lang_filter as LangFilter) ?? "all"]}
                  </TableCell>
                  <TableCell className="text-right text-xs">{b.target_count}</TableCell>
                  <TableCell className="text-right text-xs">{b.success_count}</TableCell>
                  <TableCell className="text-right text-xs">{b.failed_count}</TableCell>
                  <TableCell>
                    <Badge variant={b.status === "completed" ? "secondary" : "outline"}>
                      {b.status === "completed"
                        ? uiCopy("ux.copy8d8680373c")
                        : uiCopy("ux.copy0dae9079ff")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(history?.broadcasts ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    {uiCopy("ux.copy688f0e9740")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{uiCopy("ux.copy99441fe7d5")}</AlertDialogTitle>
            <AlertDialogDescription>
              {uiCopy("ux.copye800876038")} {audienceCount}
              {uiCopy("ux.copy5626f026c0")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uiCopy("ux.copy19b2d19bc1")}</AlertDialogCancel>
            <AlertDialogAction onClick={runBroadcast}>
              {uiCopy("ux.copy6979bfc484")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
