import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SmsTemplate = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  is_shared: boolean;
  created_at: string;
};

export type SmsCustomer = {
  id: string;
  name: string;
  phone: string;
  status: string;
  country_id: string | null;
};

export type SmsLog = {
  id: string;
  staff_id: string;
  customer_id: string | null;
  receiver_name: string | null;
  receiver_phone: string;
  message: string;
  msg_type: string;
  title: string | null;
  status: string;
  error_message: string | null;
  sent_at: string;
};

export function useSmsCustomers() {
  return useQuery({
    queryKey: ["sms", "customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,phone,status,country_id")
        .order("imported_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SmsCustomer[];
    },
  });
}

export function useSmsTemplates() {
  return useQuery({
    queryKey: ["sms", "templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SmsTemplate[];
    },
  });
}

export function useSmsLogs() {
  return useQuery({
    queryKey: ["sms", "logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_logs")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SmsLog[];
    },
  });
}

export function useInvalidateSmsTemplates() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["sms", "templates"] });
}

export function useInvalidateSmsLogs() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["sms", "logs"] });
}

export function useSendSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      receivers: { customer_id?: string | null; name?: string | null; phone: string }[];
      message: string;
      title?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("send-sms", { body: payload });
      if (error) throw error;
      return data as { ok?: boolean; msg_type?: string; count?: number; aligo?: { message?: string } };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sms", "logs"] });
    },
  });
}
