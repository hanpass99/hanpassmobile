import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CountryRow = { id: string; code: string; name_ko: string };

export function CountrySetupGate() {
  const { t } = useTranslation();
  const { refresh, displayName, signOut } = useAuth();
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [value, setValue] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("countries")
      .select("id, code, name_ko")
      .eq("is_active", true)
      .order("code")
      .then(({ data }) => setCountries((data ?? []) as CountryRow[]));
  }, []);

  const save = async () => {
    if (!value) return toast.error(t("country.selectRequired"));
    setBusy(true);
    const { error } = await supabase.rpc("set_own_country" as any, { _country_id: value });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("country.saved"));
    await refresh();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-lg font-black text-primary-foreground">H</span>
      <h1 className="text-xl font-bold text-foreground">{t("country.setupTitle")}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t("country.setupSub")}</p>
      {displayName && <p className="mt-1 text-xs text-muted-foreground/70">{displayName}</p>}
      <div className="mt-6 w-full max-w-xs space-y-3">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder={t("country.placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {countries.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name_ko} ({c.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="w-full h-11" onClick={() => void save()} disabled={busy || !value}>
          {busy ? t("common.processing") : t("country.save")}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
          {t("auth.pendingSignOut")}
        </Button>
      </div>
    </div>
  );
}
