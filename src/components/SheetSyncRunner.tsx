import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncAllSheets } from "@/lib/google-form-sync.functions";
import { useAuth } from "@/hooks/use-auth";

const INTERVAL_MS = 60_000;

/**
 * 로그인한 직원 화면 어디에서든 1분마다 모든 구글 시트(접수완료·구글폼·인터·QR·친구추천)를 동기화.
 * 예전에는 해당 탭을 열어 둔 사람이 있을 때만 그 시트가 동기화돼서, 아무도 QR 탭을 열지 않으면
 * QR 신청이 고객 목록에 들어오지 않았음.
 * 서버가 시트마다 전 직원 기준 20초에 한 번만 실제로 실행하므로 접속자가 많아도 부하는 늘지 않음.
 * 화면 표시는 없음 (결과·오류는 시스템 점검의 "구글 시트 동기화" 항목에서 확인).
 */
export function SheetSyncRunner() {
  const { user, isActive } = useAuth();
  const userId = user?.id ?? null;
  const run = useServerFn(syncAllSheets);
  const qc = useQueryClient();
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!userId || isActive !== true || typeof document === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let busy = false;

    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await runRef.current();
        if (r.inserted > 0) {
          void qc.invalidateQueries({ queryKey: ["customers", "list"] });
          void qc.invalidateQueries({ queryKey: ["customers", "poolCounts"] });
          void qc.invalidateQueries({ queryKey: ["customers", "statusCounts"] });
        }
      } catch {
        // 네트워크 오류 등은 다음 주기에 다시 시도
      } finally {
        busy = false;
      }
    };
    const start = () => {
      if (timer) return;
      void tick();
      timer = setInterval(() => void tick(), INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId, isActive, qc]);

  return null;
}
