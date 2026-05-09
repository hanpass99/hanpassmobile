import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CALL_RESULTS, CUSTOMERS, PLANS, STATUSES } from "@/lib/mock-data";
import { toast } from "sonner";

export function CallUpdateDialog({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const customer = CUSTOMERS.find((c) => c.id === customerId);
  const [callResult, setCallResult] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [recallDate, setRecallDate] = useState("");
  const [plan, setPlan] = useState<string>("");
  const [activationDate, setActivationDate] = useState("");

  useEffect(() => {
    if (customer) {
      setCallResult(customer.callResult ?? "");
      setStatus(customer.status);
      setMemo(customer.memo);
      setRecallDate("");
      setPlan(customer.planName ?? "");
      setActivationDate(customer.activationDate ?? "");
    }
  }, [customer]);

  if (!customerId) return null;

  return (
    <Dialog open={!!customerId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>콜 결과 업데이트</DialogTitle>
          <DialogDescription>
            {customer?.name} · {customer?.phone}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-2">
            <Label>콜 결과</Label>
            <Select value={callResult} onValueChange={setCallResult}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {CALL_RESULTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>상태</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>재연락 예정일</Label>
            <Input type="date" value={recallDate} onChange={(e) => setRecallDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>요금제</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger><SelectValue placeholder="요금제" /></SelectTrigger>
              <SelectContent>
                {PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>개통일</Label>
            <Input type="date" value={activationDate} onChange={(e) => setActivationDate(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="콜 메모를 입력하세요" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => {
              toast.success("콜 결과가 저장되었습니다 (목업)");
              onClose();
            }}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
