import i18n from "@/i18n";
import { createFileRoute, Navigate } from "@tanstack/react-router";
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
import { Plus, RefreshCw, UserX, UserCheck, UserPlus, KeyRound, Copy, Trash2, ArrowUp, ArrowDown, AlertTriangle, Search, X, Download, ArrowUpDown } from "lucide-react";
import { MultiCountrySelect } from "@/components/MultiCountrySelect";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettingsData, type AppRole, type Country, type SettingsRow as Row } from "@/hooks/use-settings";
import type {
  AdminResetPasswordResponse,
  AdminDeleteStaffResponse,
  AdminCreateStaffResponse,
} from "@/types/rpc";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: i18n.t("head.staff") }] }),
  component: StaffAdmin,
});

const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth() + 1;


function StaffAdmin() {
  const { t } = useTranslation();
  const { isAdmin, loading: authLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading: loading } = useSettingsData({ year: Y, month: M, isAdmin });
  const [rows, setRows] = useState<Row[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [bulkCall, setBulkCall] = useState(200);
  const [bulkAct, setBulkAct] = useState(120);
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<Row | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; tempPassword: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [hardDelete, setHardDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [infoTarget, setInfoTarget] = useState<Row | null>(null);

  useEffect(() => {
    if (data) {
      setRows(data.rows);
      setCountries(data.countries);
    }
  }, [data]);

  const roleLabel = (role: AppRole | null) =>
    role === null
      ? t("settings.pendingApproval")
      : role === "admin"
        ? t("common.admin")
        : role === "hanpass_staff"
          ? t("common.hanpassStaff")
          : t("common.staff");

  const setCompany = async (r: Row, company: string) => {
    const { error } = await supabase.rpc("admin_set_profile_company" as any, { _user_id: r.id, _company: company });
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, company } : x)));
    toast.success(t("settings.roleChanged"));
  };

  const load = () => queryClient.invalidateQueries({ queryKey: ["settings", Y, M, isAdmin] });

  const resetPassword = async () => {
    if (!resetTarget) return;
    setResetting(true);
    const { data: res, error } = await supabase.functions.invoke<AdminResetPasswordResponse>(
      "admin-reset-staff-password",
      { body: { user_id: resetTarget.id } },
    );
    setResetting(false);
    if (error || res?.error) {
      return toast.error(t("settings.resetFailed", { msg: res?.error ?? error?.message }));
    }
    setResetResult({ name: resetTarget.display_name, tempPassword: res?.temp_password ?? "" });
    setResetTarget(null);
    toast.success(t("settings.tempPwdIssued"));
  };


  const saveTarget = async (r: Row) => {
    const { error } = await supabase.from("targets").upsert(
      { user_id: r.id, year: Y, month: M, call_target: r.call_target, activation_target: r.activation_target },
      { onConflict: "user_id,year,month" }
    );
    if (error) { toast.error(t("settings.targetSaveFailed", { msg: error.message })); return; }
    const { error: pErr } = await supabase.rpc("admin_set_profile_phone" as any, { _user_id: r.id, _phone: r.phone ?? "" });
    if (pErr) { toast.error(pErr.message); return; }
    toast.success(t("settings.targetSaved", { name: r.display_name }));
  };


  const setActive = async (r: Row, active: boolean) => {
    const { error } = await supabase.rpc("admin_set_profile_active", { _user_id: r.id, _active: active });
    if (error) { toast.error(t("settings.actionFailed", { msg: error.message })); return; }
    toast.success(active ? t("settings.activated") : t("settings.deactivated"));
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: active, approval_status: (active ? "approved" : "disabled") as Row["approval_status"] } : x)));
  };

  const approve = async (r: Row) => {
    const { error: roleErr } = await supabase.rpc("admin_set_user_role", { _user_id: r.id, _role: "staff" as any });
    if (roleErr) { toast.error(t("settings.actionFailed", { msg: roleErr.message })); return; }
    const { error } = await supabase.rpc("admin_set_profile_active", { _user_id: r.id, _active: true });
    if (error) { toast.error(t("settings.actionFailed", { msg: error.message })); return; }
    toast.success(t("settings.approved", { name: r.display_name }));
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: true, approval_status: "approved" as const, role: "staff" as AppRole } : x)));
  };

  const setRole = async (r: Row, role: AppRole) => {
    const { error } = await supabase.rpc("admin_set_user_role", { _user_id: r.id, _role: role as any });
    if (error) { toast.error(t("settings.actionFailed", { msg: error.message })); return; }
    toast.success(t("settings.roleChanged"));
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, role } : x)));
  };

  const setCountries2 = async (r: Row, country_ids: string[]) => {
    const { error } = await supabase.rpc("admin_set_profile_countries", {
      _user_id: r.id,
      _country_ids: country_ids,
    });
    if (error) { toast.error(t("settings.actionFailed", { msg: error.message })); return; }
    toast.success(t("settings.countryChanged"));
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, country_ids } : x)));
  };

  const setNewSignupAccess = async (r: Row, value: boolean) => {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, can_access_new_signup: value } : x)));
    const { error } = await supabase.rpc("admin_set_profile_new_signup_access", {
      _user_id: r.id,
      _value: value,
    });
    if (error) {
      toast.error(error.message);
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, can_access_new_signup: !value } : x)));
      return;
    }
    toast.success(value ? t("settings.newSignupAllowed") : t("settings.newSignupBlocked"));
  };

  const setTelegramAccess = async (r: Row, value: boolean) => {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, can_access_telegram: value } : x)));
    const { error } = await supabase.rpc("admin_set_profile_telegram_access" as any, {
      _user_id: r.id,
      _value: value,
    });
    if (error) {
      toast.error(error.message);
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, can_access_telegram: !value } : x)));
      return;
    }
    toast.success(value ? "텔레그램 상담 접근 허용됨" : "텔레그램 상담 접근 차단됨");
  };


  const moveRow = async (idx: number, dir: -1 | 1) => {
    const next = [...rows];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    const reordered = next.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 }));
    setRows(reordered);
    const { error } = await supabase.rpc("admin_set_profile_sort_orders", {
      _user_ids: reordered.map((r) => r.id),
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
    const { data: res, error } = await supabase.functions.invoke<AdminDeleteStaffResponse>(
      "admin-delete-staff",
      { body: { user_id: deleteTarget.id, hard: hardDelete } },
    );
    setDeleting(false);
    const errMsg = res?.error ?? error?.message;
    if (errMsg) {
      toast.error(t("settings.deleteFailed", { msg: errMsg }));
      return;
    }
    toast.success(t("settings.deleteDone", { name: deleteTarget.display_name }));
    if (hardDelete) setRows((prev) => prev.filter((x) => x.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleteConfirmText("");
    setHardDelete(false);
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

  if (authLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">{t("errors.loading")}</div>;
  }
  if (!isAdmin) return <Navigate to="/settings" />;

  return (
    <div className="space-y-5">
      <PageHeader title={t("nav.staffMgmt")} description={t("settings.staffMgmtDesc", { y: Y, m: M })} />


      <Card>
        <CardHeader className="grid gap-3 space-y-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <CardTitle>{t("settings.staffMgmt")}</CardTitle>
            <CardDescription>
              {t("settings.staffMgmtDesc", { y: Y, m: M })}
            </CardDescription>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
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
        <CardContent className="space-y-3 p-3 md:hidden">
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => setInfoTarget(r)}>
                  <span className="block truncate text-sm font-semibold text-primary">{r.display_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.email ?? "-"}</span>
                </button>
                <Badge variant={r.is_active ? "default" : "outline"}>
                  {r.approval_status === "pending" ? t("settings.pendingApproval") : r.is_active ? t("common.active") : t("common.inactive")}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">{t("settings.company")}</span><div className="mt-0.5 font-medium">{r.company}</div></div>
                <div><span className="text-muted-foreground">{t("settings.role")}</span><div className="mt-0.5 font-medium">{roleLabel(r.role)}</div></div>
                <div className="col-span-2"><span className="text-muted-foreground">{t("settings.assignedCountry")}</span><div className="mt-1 flex flex-wrap gap-1">{r.role === "admin" ? <Badge variant="secondary">{t("country.allCountries")}</Badge> : r.country_ids.map((id) => <Badge key={id} variant="secondary">{countries.find((c) => c.id === id)?.code ?? "?"}</Badge>)}</div></div>
              </div>
              {isAdmin && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
                  {r.approval_status === "pending" ? (
                    <Button size="sm" onClick={() => approve(r)}><UserCheck className="mr-1 h-4 w-4" />{t("settings.approve")}</Button>
                  ) : (
                    <Select value={r.role ?? undefined} onValueChange={(v) => setRole(r, v as AppRole)}>
                      <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="admin">{t("common.admin")}</SelectItem><SelectItem value="staff">{t("common.staff")}</SelectItem></SelectContent>
                    </Select>
                  )}
                  <Select value={r.company} onValueChange={(v) => setCompany(r, v)}>
                    <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="한패스">한패스</SelectItem><SelectItem value="한패스 모바일">한패스 모바일</SelectItem></SelectContent>
                  </Select>
                  {r.role !== "admin" && <div className="col-span-2"><MultiCountrySelect options={countries} value={r.country_ids} onChange={(next) => setCountries2(r, next)} /></div>}
                  {r.id !== user?.id && <Button size="sm" variant="outline" onClick={() => setResetTarget(r)}><KeyRound className="mr-1 h-4 w-4" />{t("settings.resetPwd")}</Button>}
                  {r.id !== user?.id && (r.is_active ? <Button size="sm" variant="outline" className="text-destructive" onClick={() => setActive(r, false)}>{t("settings.deactivate")}</Button> : r.approval_status !== "pending" ? <Button size="sm" variant="outline" onClick={() => setActive(r, true)}>{t("settings.activate")}</Button> : null)}
                </div>
              )}
            </div>
          ))}
          {!rows.length && !loading && <div className="py-8 text-center text-sm text-muted-foreground">{t("dashboard.noStaff")}</div>}
        </CardContent>
        <CardContent className="hidden overflow-x-auto p-0 md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {isAdmin && <TableHead className="w-20">{t("settings.order")}</TableHead>}
                <TableHead>{t("settings.name")}</TableHead>
                <TableHead>{t("settings.email")}</TableHead>
                <TableHead>{t("settings.lastAccess")}</TableHead>
                <TableHead>{t("settings.department")}</TableHead>
                <TableHead className="w-36">{t("settings.company")}</TableHead>
                <TableHead className="w-40">{t("common.phone")}</TableHead>

                <TableHead>{t("settings.role")}</TableHead>
                <TableHead>{t("settings.assignedCountry")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="w-28">{t("settings.callTarget")}</TableHead>
                <TableHead className="w-28">{t("settings.activationTarget")}</TableHead>
                {isAdmin && <TableHead className="w-32">{t("settings.newSignupAccess")}</TableHead>}
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !rows.length && Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {Array.from({ length: isAdmin ? 14 : 12 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
              {rows.map((r, idx) => (
                <TableRow key={r.id} className={r.approval_status === "pending" ? "bg-warning/5" : r.is_active ? "" : "opacity-60"}>
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
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => setInfoTarget(r)}
                    >
                      {r.display_name}
                    </button>
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
                    {isAdmin ? (
                      <Select value={r.company} onValueChange={(v) => setCompany(r, v)}>
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="한패스">한패스</SelectItem>
                          <SelectItem value="한패스 모바일">한패스 모바일</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">{r.company}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={r.phone ?? ""}
                      disabled={!isAdmin && r.id !== user?.id}
                      placeholder="01012345678"
                      onChange={(e) =>
                        setRows((p) => p.map((x) => (x.id === r.id ? { ...x, phone: e.target.value } : x)))
                      }
                      className="h-8 w-36"
                    />
                  </TableCell>

                  <TableCell>
                    {isAdmin && r.id !== user?.id && r.approval_status !== "pending" ? (
                      <Select value={r.role ?? undefined} onValueChange={(v) => setRole(r, v as AppRole)}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">{t("common.admin")}</SelectItem>
                          <SelectItem value="staff">{t("common.staff")}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={r.approval_status === "pending" ? "outline" : r.role === "admin" ? "default" : "secondary"} className={r.approval_status === "pending" ? "border-warning text-warning" : undefined}>
                        {roleLabel(r.role)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.role === "admin" ? (
                      <Badge variant="secondary" className="text-[10px]">{t("country.allCountries")}</Badge>
                    ) : isAdmin ? (
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
                      {r.approval_status === "pending" ? t("settings.pendingApproval") : r.is_active ? t("common.active") : t("common.inactive")}
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
                  {isAdmin && (
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={r.role === "admin" || r.can_access_new_signup}
                            disabled={r.role === "admin"}
                            onCheckedChange={(v) => setNewSignupAccess(r, v)}
                          />
                          <span className="text-xs text-muted-foreground">
                            신규가입: {r.role === "admin" ? t("settings.accessAllowedAll") : r.can_access_new_signup ? t("settings.accessAllowed") : t("settings.accessBlocked")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={r.role === "admin" || r.can_access_telegram}
                            disabled={r.role === "admin"}
                            onCheckedChange={(v) => setTelegramAccess(r, v)}
                          />
                          <span className="text-xs text-muted-foreground">
                            텔레그램: {r.role === "admin" ? t("settings.accessAllowedAll") : r.can_access_telegram ? t("settings.accessAllowed") : t("settings.accessBlocked")}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                  )}
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
                          ) : r.approval_status === "pending" ? (
                            <Button size="sm" onClick={() => approve(r)}>
                              <UserCheck className="mr-1 h-3.5 w-3.5" /> {t("settings.approve")}
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
                <TableRow><TableCell colSpan={isAdmin ? 14 : 12} className="text-center text-sm text-muted-foreground py-8">{t("dashboard.noStaff")}</TableCell></TableRow>
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

      {/* 직원 상세 정보 */}
      <Dialog open={!!infoTarget} onOpenChange={(o) => !o && setInfoTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{infoTarget?.display_name}</DialogTitle>
          </DialogHeader>
          {infoTarget && (
            <div className="space-y-3 text-sm">
              {[
                [t("settings.email"), infoTarget.email ?? "-"],
                [t("common.phone"), infoTarget.phone || "-"],
                [t("settings.department"), infoTarget.department ?? "-"],
                [t("settings.company"), infoTarget.company],
                [t("settings.role"), roleLabel(infoTarget.role)],
                [
                  t("settings.lastAccess"),
                  infoTarget.last_sign_in_at
                    ? new Date(infoTarget.last_sign_in_at).toLocaleString()
                    : t("settings.notSignedIn"),
                ],
                [t("common.status"), infoTarget.is_active ? t("common.active") : t("common.inactive")],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-start justify-between gap-4 border-b pb-2 last:border-0">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-right font-medium break-all">{value}</span>
                </div>
              ))}
              {infoTarget.phone ? (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" asChild>
                    <a href={`tel:${infoTarget.phone}`}>{t("common.phone")}</a>
                  </Button>
                  {infoTarget.email && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={`mailto:${infoTarget.email}`}>{t("settings.email")}</a>
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteConfirmText(""); setHardDelete(false); } }}>
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
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <Switch id="hard-delete" checked={hardDelete} onCheckedChange={setHardDelete} />
              <div className="space-y-1">
                <Label htmlFor="hard-delete" className="text-xs font-semibold text-destructive">
                  {t("settings.hardDelete")}
                </Label>
                <p className="text-xs text-muted-foreground">{t("settings.hardDeleteWarn")}</p>
              </div>
            </div>
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
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); setHardDelete(false); }} disabled={deleting}>
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
  const [company, setCompany] = useState("한패스 모바일");
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [role, setRole] = useState<AppRole>("staff");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(""); setPassword(""); setDisplayName(""); setDepartment("");
      setCompany("한패스 모바일"); setCountryIds([]); setRole("staff");
    }
  }, [open]);

  const submit = async () => {
    if (!email || !password || !displayName) return toast.error(t("settings.createRequired"));
    if (password.length < 6) return toast.error(t("settings.pwdLenError"));
    if (role !== "admin" && countryIds.length === 0) return toast.error(t("country.selectRequired"));
    setSaving(true);
    const { data: res, error } = await supabase.functions.invoke<AdminCreateStaffResponse>(
      "admin-create-staff",
      {
        body: {
          email, password,
          display_name: displayName,
          department: department || undefined,
          company,
          country_ids: countryIds,
          role,
        },
      },
    );
    setSaving(false);
    let errMsg: string | undefined = res?.error;
    if (error) {
      // supabase-js 는 non-2xx 시 본문을 숨기므로 직접 파싱
      try {
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string; message?: string }>; text?: () => Promise<string> } }).context;
        if (ctx?.json) {
          const body = await ctx.json();
          errMsg = body?.error ?? body?.message ?? errMsg;
        } else if (ctx?.text) {
          errMsg = (await ctx.text()) || errMsg;
        }
      } catch {
        // ignore parse errors
      }
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
        <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("settings.emailStar")}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
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
            <Label>{t("settings.company")}</Label>
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="한패스">한패스</SelectItem>
                <SelectItem value="한패스 모바일">한패스 모바일</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("settings.role")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">{t("common.staff")}</SelectItem>
                <SelectItem value="admin">{t("common.admin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("settings.assignedCountry")}</Label>
            {role === "admin" ? (
              <p className="text-[12px] text-muted-foreground">{t("country.allCountries")}</p>
            ) : (
              <MultiCountrySelect
                options={countries}
                value={countryIds}
                onChange={setCountryIds}
              />
            )}
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
