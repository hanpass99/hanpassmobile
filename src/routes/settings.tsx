import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, RefreshCw, UserX, UserCheck, UserPlus, KeyRound, Copy, Mail, Clock, Camera, Trash2, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { MultiCountrySelect } from "@/components/MultiCountrySelect";
import { resizeImage } from "@/lib/image-resize";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "설정 — Hanpass OB CRM" }] }),
  component: Settings,
});

type Country = { id: string; code: string; name_ko: string };
type Row = {
  id: string;
  display_name: string;
  department: string | null;
  is_active: boolean;
  role: "admin" | "staff";
  country_ids: string[];
  avatar_url: string | null;
  call_target: number;
  activation_target: number;
  email: string | null;
  last_sign_in_at: string | null;
  sort_order: number;
  can_access_new_signup: boolean;
};

const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth() + 1;

function Settings() {
  const { t } = useTranslation();
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkCall, setBulkCall] = useState(200);
  const [bulkAct, setBulkAct] = useState(120);
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<Row | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; tempPassword: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const resetPassword = async () => {
    if (!resetTarget) return;
    setResetting(true);
    const { data, error } = await supabase.functions.invoke("admin-reset-staff-password", {
      body: { user_id: resetTarget.id },
    });
    setResetting(false);
    if (error || (data as any)?.error) {
      return toast.error(t("settings.resetFailed", { msg: (data as any)?.error ?? error?.message }));
    }
    setResetResult({ name: resetTarget.display_name, tempPassword: (data as any).temp_password });
    setResetTarget(null);
    toast.success(t("settings.tempPwdIssued"));
  };

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: targets }, { data: co }, { data: pcs }, activityRes] = await Promise.all([
      supabase.from("profiles").select("id, display_name, department, is_active, country_id, avatar_url, sort_order, can_access_new_signup").order("sort_order").order("display_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("targets").select("user_id, call_target, activation_target").eq("year", Y).eq("month", M),
      supabase.from("countries").select("id, code, name_ko").order("code"),
      supabase.from("profile_countries").select("user_id, country_id"),
      isAdmin
        ? supabase.functions.invoke("admin-list-staff-activity")
        : Promise.resolve({ data: { users: [] }, error: null } as any),
    ]);
    const activityList: { id: string; email: string | null; last_sign_in_at: string | null }[] =
      (activityRes as any)?.data?.users ?? [];
    const pcMap = new Map<string, string[]>();
    (pcs ?? []).forEach((p: any) => {
      const arr = pcMap.get(p.user_id) ?? [];
      arr.push(p.country_id);
      pcMap.set(p.user_id, arr);
    });
    const merged: Row[] = (profiles ?? []).map((p: any) => {
      const r = roles?.find((x) => x.user_id === p.id);
      const tg = targets?.find((x) => x.user_id === p.id);
      const a = activityList.find((x) => x.id === p.id);
      return {
        id: p.id,
        display_name: p.display_name,
        department: p.department,
        is_active: p.is_active,
        role: (r?.role as "admin" | "staff") ?? "staff",
        country_ids: pcMap.get(p.id) ?? [],
        avatar_url: p.avatar_url ?? null,
        call_target: tg?.call_target ?? 0,
        activation_target: tg?.activation_target ?? 0,
        email: a?.email ?? null,
        last_sign_in_at: a?.last_sign_in_at ?? null,
        sort_order: p.sort_order ?? 1000,
        can_access_new_signup: !!p.can_access_new_signup,
      };
    });
    merged.sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name));
    setRows(merged);
    setCountries(co ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [isAdmin]);

  const saveTarget = async (r: Row) => {
    const { error } = await supabase.from("targets").upsert(
      { user_id: r.id, year: Y, month: M, call_target: r.call_target, activation_target: r.activation_target },
      { onConflict: "user_id,year,month" }
    );
    if (error) { toast.error(t("settings.targetSaveFailed", { msg: error.message })); return; }
    toast.success(t("settings.targetSaved", { name: r.display_name }));
  };

  const setActive = async (r: Row, active: boolean) => {
    const { error } = await supabase.rpc("admin_set_profile_active", { _user_id: r.id, _active: active });
    if (error) { toast.error(t("settings.actionFailed", { msg: error.message })); return; }
    toast.success(active ? t("settings.activated") : t("settings.deactivated"));
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: active } : x)));
  };

  const setRole = async (r: Row, role: "admin" | "staff") => {
    const { error } = await supabase.rpc("admin_set_user_role", { _user_id: r.id, _role: role });
    if (error) { toast.error(t("settings.actionFailed", { msg: error.message })); return; }
    toast.success(t("settings.roleChanged"));
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, role } : x)));
  };

  const setCountries2 = async (r: Row, country_ids: string[]) => {
    const { error } = await supabase.rpc("admin_set_profile_countries", {
      _user_id: r.id,
      _country_ids: country_ids as any,
    });
    if (error) { toast.error(t("settings.actionFailed", { msg: error.message })); return; }
    toast.success(t("settings.countryChanged"));
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, country_ids } : x)));
  };

  const setNewSignupAccess = async (r: Row, value: boolean) => {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, can_access_new_signup: value } : x)));
    const { error } = await (supabase as any).rpc("admin_set_profile_new_signup_access", {
      _user_id: r.id,
      _value: value,
    });
    if (error) {
      toast.error(error.message);
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, can_access_new_signup: !value } : x)));
      return;
    }
    toast.success(value ? "신규 가입자 접근 허용" : "신규 가입자 접근 차단");
  };


  const moveRow = async (idx: number, dir: -1 | 1) => {
    const next = [...rows];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    const reordered = next.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 }));
    setRows(reordered);
    const { error } = await supabase.rpc("admin_set_profile_sort_orders", {
      _user_ids: reordered.map((r) => r.id) as any,
    });
    if (error) { toast.error(t("settings.actionFailed", { msg: error.message })); load(); return; }
  };

  const deleteStaff = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmText !== deleteTarget.display_name) {
      toast.error(t("settings.deleteNameMismatch"));
      return;
    }
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("admin-delete-staff", {
      body: { user_id: deleteTarget.id },
    });
    setDeleting(false);
    const errMsg = (data as any)?.error ?? error?.message;
    if (errMsg) {
      toast.error(t("settings.deleteFailed", { msg: errMsg }));
      return;
    }
    toast.success(t("settings.deleteDone", { name: deleteTarget.display_name }));
    setDeleteTarget(null);
    setDeleteConfirmText("");
    load();
  };

  const bulkApply = async () => {
    const payload = rows
      .filter((r) => r.is_active && r.role === "staff")
      .map((r) => ({ user_id: r.id, year: Y, month: M, call_target: bulkCall, activation_target: bulkAct }));
    if (!payload.length) return toast.info(t("settings.noStaffToApply"));
    const { error } = await supabase.from("targets").upsert(payload, { onConflict: "user_id,year,month" });
    if (error) return toast.error(t("settings.actionFailed", { msg: error.message }));
    toast.success(t("settings.bulkApplyDone", { n: payload.length }));
    load();
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />

      {/* 내 계정 정보 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.myAccount")}</CardTitle>
          <CardDescription>{t("settings.myAccountDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProfilePhotoSection />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> {t("settings.emailId")}
              </div>
              <div className="mt-1 truncate text-sm font-semibold">{user?.email ?? "-"}</div>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5" /> {t("settings.permission")}
              </div>
              <div className="mt-1 text-sm font-semibold">{isAdmin ? t("common.admin") : t("common.staff")}</div>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {t("settings.lastLogin")}
              </div>
              <div className="mt-1 text-sm font-semibold">
                {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "-"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isAdmin && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 text-sm text-muted-foreground">
            {t("settings.readOnly")}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t("settings.staffMgmt")}</CardTitle>
            <CardDescription>
              {t("settings.staffMgmtDesc", { y: Y, m: M })}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> {t("settings.addStaff")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> {t("common.refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {isAdmin && <TableHead className="w-20">{t("settings.order")}</TableHead>}
                <TableHead>{t("settings.name")}</TableHead>
                <TableHead>{t("settings.email")}</TableHead>
                <TableHead>{t("settings.lastAccess")}</TableHead>
                <TableHead>{t("settings.department")}</TableHead>
                <TableHead>{t("settings.role")}</TableHead>
                <TableHead>{t("settings.assignedCountry")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="w-28">{t("settings.callTarget")}</TableHead>
                <TableHead className="w-28">{t("settings.activationTarget")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={r.id} className={r.is_active ? "" : "opacity-50"}>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0} onClick={() => moveRow(idx, -1)} title={t("settings.moveUp")}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === rows.length - 1} onClick={() => moveRow(idx, 1)} title={t("settings.moveDown")}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    {r.display_name}
                    {r.id === user?.id && <span className="ml-2 text-xs text-muted-foreground">{t("settings.me")}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.email ?? "-"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {r.last_sign_in_at ? (
                      <span className="text-foreground">{new Date(r.last_sign_in_at).toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">{t("settings.notSignedIn")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.department ?? "-"}</TableCell>
                  <TableCell>
                    {isAdmin && r.id !== user?.id ? (
                      <Select value={r.role} onValueChange={(v) => setRole(r, v as "admin" | "staff")}>
                        <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">{t("common.admin")}</SelectItem>
                          <SelectItem value="staff">{t("common.staff")}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={r.role === "admin" ? "default" : "secondary"}>
                        {r.role === "admin" ? t("common.admin") : t("common.staff")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <MultiCountrySelect
                        options={countries}
                        value={r.country_ids}
                        onChange={(next) => setCountries2(r, next)}
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.country_ids.length === 0 ? (
                          <span className="text-xs text-muted-foreground">{t("common.all")}</span>
                        ) : (
                          r.country_ids.map((id) => (
                            <Badge key={id} variant="secondary" className="text-[10px]">
                              {countries.find((c) => c.id === id)?.code ?? "?"}
                            </Badge>
                          ))
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? "default" : "outline"}>
                      {r.is_active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={r.call_target}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setRows((p) => p.map((x) => (x.id === r.id ? { ...x, call_target: Number(e.target.value) } : x)))
                      }
                      className="h-8 w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={r.activation_target}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setRows((p) => p.map((x) => (x.id === r.id ? { ...x, activation_target: Number(e.target.value) } : x)))
                      }
                      className="h-8 w-20"
                    />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => saveTarget(r)}>{t("common.save")}</Button>
                        {r.id !== user?.id && (
                          <Button size="sm" variant="ghost" onClick={() => setResetTarget(r)}>
                            <KeyRound className="mr-1 h-3.5 w-3.5" /> {t("settings.resetPwd")}
                          </Button>
                        )}
                        {r.id !== user?.id && (
                          r.is_active ? (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setActive(r, false)}>
                              <UserX className="mr-1 h-3.5 w-3.5" /> {t("settings.deactivate")}
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setActive(r, true)}>
                              <UserCheck className="mr-1 h-3.5 w-3.5" /> {t("settings.activate")}
                            </Button>
                          )
                        )}
                        {r.id !== user?.id && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setDeleteTarget(r); setDeleteConfirmText(""); }}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("settings.delete")}
                          </Button>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && !loading && (
                <TableRow><TableCell colSpan={isAdmin ? 11 : 10} className="text-center text-sm text-muted-foreground py-8">{t("dashboard.noStaff")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.bulkTargetTitle")}</CardTitle>
            <CardDescription>{t("settings.bulkTargetDesc", { y: Y, m: M })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="bcall">{t("settings.callTargetCount")}</Label>
                <Input id="bcall" type="number" value={bulkCall} onChange={(e) => setBulkCall(Number(e.target.value))} className="w-32" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bact">{t("settings.activationTargetCount")}</Label>
                <Input id="bact" type="number" value={bulkAct} onChange={(e) => setBulkAct(Number(e.target.value))} className="w-32" />
              </div>
              <Button onClick={bulkApply}>
                <Plus className="mr-2 h-4 w-4" /> {t("settings.bulkApply")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <CreateStaffDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={load}
        countries={countries}
      />

      {/* 비밀번호 초기화 확인 */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.resetPwdTitle")}</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            {t("settings.resetPwdConfirm", { name: resetTarget?.display_name ?? "" })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetting}>{t("common.cancel")}</Button>
            <Button onClick={resetPassword} disabled={resetting}>
              {resetting ? t("common.processing") : t("settings.issueTempPwd")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 임시 비밀번호 결과 */}
      <Dialog open={!!resetResult} onOpenChange={(o) => !o && setResetResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.tempPwdIssuedTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm">
              {t("settings.tempPwdMsg", { name: resetResult?.name ?? "" })}
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-3">
              <code className="flex-1 font-mono text-base font-bold tracking-wider">
                {resetResult?.tempPassword}
              </code>
              <Button size="sm" variant="outline" onClick={() => {
                navigator.clipboard.writeText(resetResult?.tempPassword ?? "");
                toast.success(t("settings.copied"));
              }}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.tempPwdWarn")}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setResetResult(null)}>{t("common.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 직원 삭제 확인 (2차) */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteConfirmText(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> {t("settings.deleteTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p>{t("settings.deleteWarn", { name: deleteTarget?.display_name ?? "" })}</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>{t("settings.deleteKeepData")}</li>
              <li>{t("settings.deleteUnassign")}</li>
              <li>{t("settings.deleteIrreversible")}</li>
            </ul>
            <div className="space-y-1.5 pt-2">
              <Label className="text-xs">{t("settings.deleteTypeName", { name: deleteTarget?.display_name ?? "" })}</Label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteTarget?.display_name ?? ""}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={deleteStaff}
              disabled={deleting || deleteConfirmText !== (deleteTarget?.display_name ?? "")}
            >
              {deleting ? t("common.processing") : t("settings.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProfilePhotoSection() {
  const { t } = useTranslation();
  const { user, displayName, avatarUrl, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = (displayName || user?.email || "U").trim().charAt(0).toUpperCase();

  const onPick = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error(t("settings.photoSizeLimit"));
    setBusy(true);
    try {
      const blob = await resizeImage(file, 512, 0.85);
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/jpeg", upsert: true,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: upErr } = await supabase.from("profiles")
        .update({ avatar_url: pub.publicUrl }).eq("id", user.id);
      if (upErr) throw upErr;
      toast.success(t("settings.photoUpdated"));
      await refresh();
    } catch (e: any) {
      toast.error(t("settings.photoFailed", { msg: e.message }));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!user) return;
    setBusy(true);
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    await refresh();
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border/60 p-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xl font-bold text-primary">
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold">{displayName || user?.email}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={inputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Camera className="mr-1.5 h-3.5 w-3.5" />
            {busy ? t("settings.uploading") : t("settings.uploadPhoto")}
          </Button>
          {avatarUrl && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={busy}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("settings.removePhoto")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateStaffDialog({
  open, onClose, onCreated, countries,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  countries: Country[];
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [department, setDepartment] = useState("");
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(""); setPassword(""); setDisplayName(""); setDepartment("");
      setCountryIds([]); setRole("staff");
    }
  }, [open]);

  const submit = async () => {
    if (!email || !password || !displayName) return toast.error(t("settings.createRequired"));
    if (password.length < 6) return toast.error(t("settings.pwdLenError"));
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-create-staff", {
      body: {
        email, password,
        display_name: displayName,
        department: department || undefined,
        country_ids: countryIds,
        role,
      },
    });
    setSaving(false);
    let errMsg: string | undefined = (data as any)?.error;
    if (error) {
      // supabase-js 는 non-2xx 시 본문을 숨기므로 직접 파싱
      try {
        const ctx: any = (error as any).context;
        if (ctx?.json) {
          const body = await ctx.json();
          errMsg = body?.error ?? body?.message ?? errMsg;
        } else if (ctx?.text) {
          errMsg = (await ctx.text()) || errMsg;
        }
      } catch {}
      errMsg = errMsg ?? error.message;
    }
    if (errMsg) {
      return toast.error(t("settings.createFailed", { msg: errMsg }));
    }
    toast.success(t("settings.createDone", { name: displayName }));
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("settings.createTitle")}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2 space-y-2">
            <Label>{t("settings.emailStar")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>{t("settings.pwdMin6")}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("settings.nameStar")}</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("settings.department")}</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("settings.role")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">{t("common.staff")}</SelectItem>
                <SelectItem value="admin">{t("common.admin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>{t("settings.assignedCountry")}</Label>
            <MultiCountrySelect
              options={countries}
              value={countryIds}
              onChange={setCountryIds}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button onClick={submit} disabled={saving}>{saving ? t("settings.creating") : t("settings.createBtn")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
