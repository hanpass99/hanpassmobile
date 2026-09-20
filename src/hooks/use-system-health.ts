import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CheckStatus = "ok" | "warn" | "error";

export interface SystemCheckRow {
  check_key: string;
  category: string;
  status: CheckStatus;
  message: string;
  metric: number | null;
  details: Record<string, unknown>;
  checked_at: string;
}

export function useSystemChecks(enabled: boolean) {
  return useQuery({
    queryKey: ["system-health", "latest"],
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<SystemCheckRow[]> => {
      const { data, error } = await supabase.rpc("latest_system_checks");
      if (error) throw error;
      return (data ?? []) as unknown as SystemCheckRow[];
    },
  });
}

export function useRunSystemChecks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("run_system_checks");
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["system-health"] });
    },
  });
}
