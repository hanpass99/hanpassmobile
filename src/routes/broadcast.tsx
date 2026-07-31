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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createBroadcast, getBroadcastAudience, listBroadcasts, sendBroadcastBatch,
} from "@/lib/broadcast.functions";

export const Route = createFileRoute("/broadcast")({
  head: () => ({
    meta: [
      { title: "브로드캐스트 · Hanpass Mobile OB CRM" },
      { name: "description", content: "수신 동의한 텔레그램 고객에게 요금제·이벤트 안내를 안전하게 단체 발송합니다." },
      { property: "og:title", content: "브로드캐스트 · Hanpass Mobile OB CRM" },
      { property: "og:description", content: "수신 동의 고객 대상 안전한 텔레그램 단체 발송 관리." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BroadcastPage,
});

type LangFilter = "all" | "uz" | "ru";
type MediaState = { storagePath: string; fileName: string; mime: string; kind: "photo" | "document" } | null;

const LANG_LABEL: Record<LangFilter, string> = {
  all: "전체",
  uz: "우즈베크어",
  ru: "러시아어",
};

function BroadcastPage() {
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
        <PageHeader title="브로드캐스트" description="관리자만 접근할 수 있습니다." />
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
      toast.error(e instanceof Error ? e.message : "업로드 실패");
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
      toast.success(`발송 완료 — 성공 ${ok}명 / 실패 ${fail}명`);
      setMessage("");
      setMedia(null);
      qc.invalidateQueries({ queryKey: ["broadcast-history"] });
      qc.invalidateQueries({ queryKey: ["broadcast-audience"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "발송 실패");
    } finally {
      setSending(false);
    }
  };

  const canSend = (message.trim().length > 0 || !!media) && audienceCount > 0 && !sending;

  return (
    <div className="space-y-4">
      <PageHeader
        title="브로드캐스트"
        description="수신 동의(opt-in)한 텔레그램 고객에게만 안전한 속도로 단체 발송합니다."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4" /> 새 브로드캐스트
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>메시지 *</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                maxLength={3500}
                placeholder="요금제 / 이벤트 안내 내용을 입력하세요."
              />
              <p className="text-xs text-muted-foreground">
                모든 메시지 하단에 수신 거부 안내 문구와 버튼이 자동으로 추가됩니다.
              </p>
            </div>

            <div className="space-y-2">
              <Label>대상 언어</Label>
              <Select value={langFilter} onValueChange={(v) => setLangFilter(v as LangFilter)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="uz">우즈베크어만</SelectItem>
                  <SelectItem value="ru">러시아어만</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>첨부 (선택)</Label>
              {media ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{media.fileName}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMedia(null)}>
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
                  발송 중… {progress.done}/{progress.total} · 성공 {progress.ok} · 실패 {progress.fail}
                </p>
              </div>
            )}

            {result && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                발송 결과 — 성공 <strong>{result.ok}</strong>명 / 실패(차단 등) <strong>{result.fail}</strong>명
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button disabled={!canSend} onClick={() => setConfirmOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                {sending ? "발송 중…" : "발송"}
              </Button>
              <span className="text-sm text-muted-foreground">
                예상 수신자: <strong>{audienceCount}</strong>명 ({LANG_LABEL[langFilter]})
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">안전 정책</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>· 수신 동의(marketing_opt_in)한 고객에게만 발송됩니다.</p>
            <p>· /stop 을 보낸 고객에게는 절대 발송되지 않습니다.</p>
            <p>· 초당 약 1건 속도로 순차 발송하여 봇 차단을 예방합니다.</p>
            <p>· 차단(403)·오류 고객은 자동으로 수신 거부 처리 후 건너뜁니다.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">발송 이력</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>발송 시각</TableHead>
                <TableHead>내용</TableHead>
                <TableHead>언어</TableHead>
                <TableHead className="text-right">대상</TableHead>
                <TableHead className="text-right">성공</TableHead>
                <TableHead className="text-right">실패</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history?.broadcasts ?? []).map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(b.created_at).toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="max-w-[360px] truncate text-xs">
                    {b.message || (b.media_file_name ?? "(첨부)")}
                  </TableCell>
                  <TableCell className="text-xs">{LANG_LABEL[(b.lang_filter as LangFilter) ?? "all"]}</TableCell>
                  <TableCell className="text-right text-xs">{b.target_count}</TableCell>
                  <TableCell className="text-right text-xs">{b.success_count}</TableCell>
                  <TableCell className="text-right text-xs">{b.failed_count}</TableCell>
                  <TableCell>
                    <Badge variant={b.status === "completed" ? "secondary" : "outline"}>
                      {b.status === "completed" ? "완료" : "진행중"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(history?.broadcasts ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    발송 이력이 없습니다.
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
            <AlertDialogTitle>단체 발송 확인</AlertDialogTitle>
            <AlertDialogDescription>
              정말 {audienceCount}명에게 보내시겠습니까? 초당 약 1건 속도로 순차 발송되며, 발송 중에는 이 화면을 닫지 마세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={runBroadcast}>발송</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
