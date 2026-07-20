import { createFileRoute } from "@tanstack/react-router";
import { AiChatPanel } from "@/components/AiChatPanel";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/ai-assistant")({
  component: AiAssistantPage,
  head: () => ({
    meta: [{ title: "AI 어시스턴트 — Hanpass OB CRM" }],
  }),
});

function AiAssistantPage() {
  return (
    <div className="flex h-[calc(100vh-100px)] flex-col gap-4">
      <PageHeader title="AI 어시스턴트" subtitle="CRM 데이터를 대화로 조회하고 작업하세요" />
      <AiChatPanel className="flex-1 min-h-0" />
    </div>
  );
}
