import { useTranslation } from "react-i18next";
import { uiCopy } from "@/i18n/ui-copy";
import { createFileRoute } from "@tanstack/react-router";
import { AiChatPanel } from "@/components/AiChatPanel";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/ai-assistant")({
  component: AiAssistantPage,
  head: () => ({
    meta: [{ title: uiCopy("ux.copybf3be4bbb0") }],
  }),
});

function AiAssistantPage() {
  useTranslation();
  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-[420px] flex-col gap-3 sm:h-[calc(100vh-100px)] sm:gap-4">
      <PageHeader title={uiCopy("ux.copy6eb7d86174")} description={uiCopy("ux.copy1cbbac0407")} />
      <AiChatPanel className="flex-1 min-h-0" />
    </div>
  );
}
