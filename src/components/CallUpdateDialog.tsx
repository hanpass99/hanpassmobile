import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CALL_RESULTS, CALL_RESULT_LABEL, CUSTOMER_STATUSES, STATUS_LABEL, statusForResult, type CallResult, type CustomerStatus } from "@/lib/labels";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Customer = { id: string; name: string; phone: string; status: CustomerStatus };

export function CallUpdateDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const [result, setResult] = useState<CallResult>("no_answer");
  const [status, setStatus] = useState<CustomerStatus>("new");
  const [duration, setDuration] = useState(60);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setResult("no_answer");
      setStatus(customer.status);
      setDuration(60);
      setNotes("");
    }
  }, [customer]);

  if (!customer) return null;

  const onPickResult = (r: CallResult) => {
    setResult(r);
    setStatus(statusForResult(r));
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const isAct = result === "activated";

    const { error: e1 } = await supabase.from("call_logs").insert({
      customer_id: customer.id,
      staff_id: user.id,
      result,
      duration_sec: duration,
      notes: notes || null,
      is_activation: isAct,
    });
    if (e1) { toast.error(`콜 저장 실패: ${e1.message}`); setSaving(false); return; }

    const { error: e2 } = await supabase
      .from("customers")
      .update({ status, notes: notes || null })
      .eq("id", customer.id);
    if (e2) { toast.error(`고객 업데이트 실패: ${e2.message}`); setSaving(false); return; }

    toast.success("콜 결과가 저장되었습니다");
    setSaving(false);
    onSaved?.();
    onClose();
  };

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>콜 결과 업데이트</DialogTitle>
          <DialogDescription>{customer.name} · {customer.phone}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-2">
            <Label>콜 결과</Label>
            <Select value={result} onValueChange={(v) => onPickResult(v as CallResult)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CALL_RESULTS.map((r) => <SelectItem key={r} value={r}>{CALL_RESULT_LABEL[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>고객 상태</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CustomerStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CUSTOMER_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>통화 시간 (초)</Label>
            <Input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>메모</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="콜 메모를 입력하세요" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
