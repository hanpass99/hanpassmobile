import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // 페이지 전환 시 캐시된 데이터를 즉시 표시 (5분간 fresh)
        staleTime: 5 * 60_000,
        // 사용하지 않는 캐시는 10분간 보관
        gcTime: 10 * 60_000,
        // 창 포커스 / 재연결 시 자동 refetch 비활성화 (불필요한 호출 방지)
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // 실패 시 재시도 1회
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // 링크 hover 시 라우트 미리 로드 → 클릭 즉시 전환
    defaultPreload: "intent",
  });

  return router;
};
