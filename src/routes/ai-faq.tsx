import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import {
  listAiFaqs,
  upsertAiFaq,
  deleteAiFaq,
  getAiReplySettings,
  setAiReplyGlobalEnabled,
} from "@/lib/ai-faq.functions";

export const Route = createFileRoute("/ai-faq")({
  component: AiFaqPage,
  head: () => ({
    meta: [
      { title: "AI 학습 · Hanpass Mobile OB" },
      { name: "description", content: "텔레그램 자동 응답 FAQ 관리 및 AI 학습" },
    ],
  }),
});

type Faq = {
  id: string;
  category: string | null;
  question_examples: string[];
  answer_uz: string;
  answer_ru: string;
  is_active: boolean;
  updated_at: string;
};

function AiFaqPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listAiFaqs);
  const upsertFn = useServerFn(upsertAiFaq);
  const deleteFn = useServerFn(deleteAiFaq);
  const settingsFn = useServerFn(getAiReplySettings);
  const toggleGlobalFn = useServerFn(setAiReplyGlobalEnabled);
  const [editing, setEditing] = useState<Partial<Faq> | null>(null);

  const { data: listData } = useQuery({
    queryKey: ["ai-faq-list"],
    queryFn: () => listFn(),
  });
  const { data: settings } = useQuery({
    queryKey: ["ai-reply-settings-global"],
    queryFn: () => settingsFn({ data: { chatRowId: null } }),
  });

  const upsert = useMutation({
    mutationFn: (payload: {
      id?: string | null;
      category: string | null;
      question_examples: string[];
      answer_uz: string;
      answer_ru: string;
      is_active: boolean;
    }) => upsertFn({ data: payload }),
    onSuccess: () => {
      toast.success("저장되었습니다");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["ai-faq-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("삭제되었습니다");
      qc.invalidateQueries({ queryKey: ["ai-faq-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleGlobal = useMutation({
    mutationFn: (enabled: boolean) => toggleGlobalFn({ data: { enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-reply-settings-global"] }),
  });

  if (!isAdmin) {
    return (
      <div className="p-6 text-sm text-muted-foreground">관리자만 접근할 수 있습니다.</div>
    );
  }

  const faqs = (listData?.faqs ?? []) as Faq[];
  const globalEnabled = settings?.global?.enabled ?? true;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="AI 학습 (FAQ)"
        description="텔레그램 자동 응답에 사용되는 질문·답변 예시를 관리합니다."
      />

      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div>
          <div className="text-sm font-medium">AI 자동 응답 (전역)</div>
          <div className="text-xs text-muted-foreground">
            꺼짐 상태에서는 모든 채팅방에서 AI가 답장하지 않습니다.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-xs">{globalEnabled ? "ON" : "OFF"}</Label>
          <Switch
            checked={globalEnabled}
            onCheckedChange={(v) => toggleGlobal.mutate(v)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">총 {faqs.length}개</div>
        <Button
          size="sm"
          onClick={() =>
            setEditing({
              question_examples: [""],
              answer_uz: "",
              answer_ru: "",
              is_active: true,
              category: "",
            })
          }
        >
          <Plus className="mr-1 h-4 w-4" /> FAQ 추가
        </Button>
      </div>

      <div className="space-y-3">
        {faqs.map((f) => (
          <div key={f.id} className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {f.category && <Badge variant="secondary">{f.category}</Badge>}
                {!f.is_active && <Badge variant="outline">비활성</Badge>}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(f)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("이 FAQ를 삭제하시겠습니까?")) remove.mutate(f.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mb-2 space-y-1">
              <div className="text-xs font-medium text-muted-foreground">질문 예시</div>
              <div className="flex flex-wrap gap-1">
                {f.question_examples.map((q, i) => (
                  <Badge key={i} variant="outline" className="whitespace-normal">
                    {q}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-muted-foreground">답변 (UZ)</div>
                <div className="whitespace-pre-wrap text-sm">{f.answer_uz}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">답변 (RU)</div>
                <div className="whitespace-pre-wrap text-sm">{f.answer_ru}</div>
              </div>
            </div>
          </div>
        ))}
        {faqs.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            등록된 FAQ가 없습니다.
          </div>
        )}
      </div>

      {editing && (
        <FaqEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(p) => upsert.mutate(p)}
          saving={upsert.isPending}
        />
      )}
    </div>
  );
}

function FaqEditor({
  initial,
  onCancel,
  onSave,
  saving,
}: {
  initial: Partial<Faq>;
  onCancel: () => void;
  onSave: (p: {
    id?: string | null;
    category: string | null;
    question_examples: string[];
    answer_uz: string;
    answer_ru: string;
    is_active: boolean;
  }) => void;
  saving: boolean;
}) {
  const [category, setCategory] = useState(initial.category ?? "");
  const [examples, setExamples] = useState<string[]>(
    initial.question_examples?.length ? initial.question_examples : [""],
  );
  const [uz, setUz] = useState(initial.answer_uz ?? "");
  const [ru, setRu] = useState(initial.answer_ru ?? "");
  const [active, setActive] = useState(initial.is_active ?? true);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial.id ? "FAQ 편집" : "FAQ 추가"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>카테고리 (선택)</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="예: 요금제, 개통, 배송"
            />
          </div>
          <div>
            <Label>질문 예시 (여러 개 등록)</Label>
            <div className="space-y-2">
              {examples.map((q, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={q}
                    onChange={(e) => {
                      const next = [...examples];
                      next[i] = e.target.value;
                      setExamples(next);
                    }}
                    placeholder="고객이 물어볼 수 있는 표현"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setExamples(examples.filter((_, idx) => idx !== i))}
                    disabled={examples.length === 1}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExamples([...examples, ""])}
              >
                <Plus className="mr-1 h-4 w-4" /> 예시 추가
              </Button>
            </div>
          </div>
          <div>
            <Label>답변 (Uzbek)</Label>
            <Textarea value={uz} onChange={(e) => setUz(e.target.value)} rows={4} />
          </div>
          <div>
            <Label>답변 (Russian)</Label>
            <Textarea value={ru} onChange={(e) => setRu(e.target.value)} rows={4} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label>활성화</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button
            onClick={() => {
              const cleaned = examples.map((s) => s.trim()).filter(Boolean);
              if (cleaned.length === 0) return toast.error("질문 예시를 하나 이상 입력하세요");
              if (!uz.trim() || !ru.trim()) return toast.error("UZ/RU 답변을 모두 입력하세요");
              onSave({
                id: initial.id ?? null,
                category: category.trim() || null,
                question_examples: cleaned,
                answer_uz: uz.trim(),
                answer_ru: ru.trim(),
                is_active: active,
              });
            }}
            disabled={saving}
          >
            {saving ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
