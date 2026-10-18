import { useTranslation } from "react-i18next";
import { uiCopy } from "@/i18n/ui-copy";
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
  dedupeAiFaqs,
  autoApproveAiFaqCandidates,
  listAiFaqCandidates,
  approveAiFaqCandidate,
  rejectAiFaqCandidate,
} from "@/lib/ai-faq.functions";


export const Route = createFileRoute("/ai-faq")({
  component: AiFaqPage,
  head: () => ({ meta: [
{ title: uiCopy("pages.ai-faq.title") },
{ name: "description", content: uiCopy("pages.ai-faq.description") },
{ property: "og:title", content: uiCopy("pages.ai-faq.title") },
{ property: "og:description", content: uiCopy("pages.ai-faq.description") },
{ property: "og:type", content: "website" },
{ name: "twitter:card", content: "summary" }
] }),
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
  useTranslation();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listAiFaqs);
  const upsertFn = useServerFn(upsertAiFaq);
  const deleteFn = useServerFn(deleteAiFaq);
  const settingsFn = useServerFn(getAiReplySettings);
  const toggleGlobalFn = useServerFn(setAiReplyGlobalEnabled);
  const dedupeFn = useServerFn(dedupeAiFaqs);
  const autoApproveFn = useServerFn(autoApproveAiFaqCandidates);
  const [editing, setEditing] = useState<Partial<Faq> | null>(null);

  const dedupe = useMutation({
    mutationFn: () => dedupeFn(),
    onSuccess: (r) => {
      toast.success(uiCopy("ux.copy4da97e6606", { value0: r.removed }));
      qc.invalidateQueries({ queryKey: ["ai-faq-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoApprove = useMutation({
    mutationFn: () => autoApproveFn(),
    onSuccess: (r) => {
      toast.success(uiCopy("ux.copye75bacf87c", { value0: r.scanned, value1: r.approved, value2: r.duplicates }));
      qc.invalidateQueries({ queryKey: ["ai-faq-list"] });
      qc.invalidateQueries({ queryKey: ["ai-faq-candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
      toast.success(uiCopy("ux.copyb5d983174d"));
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["ai-faq-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success(uiCopy("ux.copya4c5ac4e6b"));
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
      <div className="p-6 text-sm text-muted-foreground">{uiCopy("ux.copy5a5a3d6567")}</div>
    );
  }

  const faqs = (listData?.faqs ?? []) as Faq[];
  const globalEnabled = settings?.global?.enabled ?? true;

  return (
    <div className="space-y-5 p-0 md:p-2">
      <PageHeader
        title={uiCopy("ux.copyc68ac7e1fd")}
        description={uiCopy("ux.copya7ccc6ac52")}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card p-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">{uiCopy("ux.copy20f53c3789")}</div>
          <div className="text-xs text-muted-foreground">
            {uiCopy("ux.copy8c97ffcf3a")}
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

      <CandidatesSection />



      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{uiCopy("ux.copy10d96eb939")} {faqs.length}{uiCopy("ux.copy11600c9ada")}</div>
        <div className="flex flex-wrap items-center gap-2">
        {isAdmin && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={dedupe.isPending}
              onClick={() => dedupe.mutate()}
            >
              {uiCopy("ux.copyf58cc5e289")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={autoApprove.isPending}
              onClick={() => autoApprove.mutate()}
            >
              {uiCopy("ux.copy437bf161a0")}
            </Button>
          </>
        )}
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
          <Plus className="mr-1 h-4 w-4" /> {uiCopy("ux.copy2b625e9172")}
        </Button>
        </div>
      </div>


      <div className="space-y-3">
        {faqs.map((f) => (
          <div key={f.id} className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {f.category && <Badge variant="secondary">{f.category}</Badge>}
                {!f.is_active && <Badge variant="outline">{uiCopy("ux.copyfae2014b52")}</Badge>}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(f)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(uiCopy("ux.copyf75b3c2866"))) remove.mutate(f.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mb-2 space-y-1">
              <div className="text-xs font-medium text-muted-foreground">{uiCopy("ux.copyf2c154a161")}</div>
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
                <div className="text-xs font-medium text-muted-foreground">{uiCopy("ux.copy43872d3c38")}</div>
                <div className="whitespace-pre-wrap text-sm">{f.answer_uz}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">{uiCopy("ux.copy65f6cc9300")}</div>
                <div className="whitespace-pre-wrap text-sm">{f.answer_ru}</div>
              </div>
            </div>
          </div>
        ))}
        {faqs.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {uiCopy("ux.copy281e05079d")}
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
  useTranslation();
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
          <DialogTitle>{initial.id ? uiCopy("ux.copy031319a2ee") : uiCopy("ux.copy2b625e9172")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>{uiCopy("ux.copyeece9f4070")}</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={uiCopy("ux.copy798e161b30")}
            />
          </div>
          <div>
            <Label>{uiCopy("ux.copy729b8ed9d1")}</Label>
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
                    placeholder={uiCopy("ux.copyd243eafcbd")}
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
                <Plus className="mr-1 h-4 w-4" /> {uiCopy("ux.copy9b4b700ffa")}
              </Button>
            </div>
          </div>
          <div>
            <Label>{uiCopy("ux.copy2b720dff21")}</Label>
            <Textarea value={uz} onChange={(e) => setUz(e.target.value)} rows={4} />
          </div>
          <div>
            <Label>{uiCopy("ux.copydc0f553e8c")}</Label>
            <Textarea value={ru} onChange={(e) => setRu(e.target.value)} rows={4} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label>{uiCopy("ux.copybbf831ade8")}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {uiCopy("ux.copy19b2d19bc1")}
          </Button>
          <Button
            onClick={() => {
              const cleaned = examples.map((s) => s.trim()).filter(Boolean);
              if (cleaned.length === 0) return toast.error(uiCopy("ux.copybf93e916b1"));
              if (!uz.trim() || !ru.trim()) return toast.error(uiCopy("ux.copy3cde346460"));
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
            {saving ? uiCopy("ux.copy9f678504e8") : uiCopy("ux.copy1f1712acff")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Auto-detected FAQ candidates from repeated real operator replies.
function CandidatesSection() {
  useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(listAiFaqCandidates);
  const approveFn = useServerFn(approveAiFaqCandidate);
  const rejectFn = useServerFn(rejectAiFaqCandidate);

  const q = useQuery({
    queryKey: ["ai-faq-candidates"],
    queryFn: () => listFn({ data: {} as never }),
  });
  const candidates = q.data?.candidates ?? [];

  const act = useMutation({
    mutationFn: async (v: { id: string; approve: boolean }) =>
      v.approve ? approveFn({ data: { id: v.id } }) : rejectFn({ data: { id: v.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-faq-candidates"] });
      qc.invalidateQueries({ queryKey: ["ai-faqs"] });
      toast.success(uiCopy("ux.copy7d70447c36"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (candidates.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="text-sm font-semibold">
        {uiCopy("ux.copy04655172b4")} <span className="text-muted-foreground">({candidates.length})</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {uiCopy("ux.copyd1f28b0825")}
      </p>
      {candidates.map((c) => (
        <div key={c.id} className="rounded-md border bg-card p-3">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{c.category ?? uiCopy("ux.copy3c1db0337a")}</Badge>
            <span className="text-xs text-muted-foreground">{c.occurrences}{uiCopy("ux.copycb41b51aeb")}</span>
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            {(c.question_examples ?? []).map((qe: string, i: number) => (
              <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {qe}
              </span>
            ))}
          </div>
          <div className="grid gap-2 text-xs md:grid-cols-2">
            <div className="whitespace-pre-wrap rounded bg-muted/50 p-2">🇺🇿 {c.answer_uz}</div>
            <div className="whitespace-pre-wrap rounded bg-muted/50 p-2">🇷🇺 {c.answer_ru}</div>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: c.id, approve: true })}>
              {uiCopy("ux.copy0d1cd67197")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={act.isPending}
              onClick={() => act.mutate({ id: c.id, approve: false })}
            >
              {uiCopy("ux.copy09797ed805")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
