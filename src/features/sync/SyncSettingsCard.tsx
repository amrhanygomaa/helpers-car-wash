import { useEffect, useState } from "react";
import { Cloud, RefreshCw } from "lucide-react";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Field, Input } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import type { SyncConfig, SyncStatus } from "../../types/desktop";

const api = () => (typeof window !== "undefined" ? window.desktopAPI?.sync : undefined);

export function SyncSettingsCard({ defaultBranchId }: { defaultBranchId: string }) {
  const toast = useToast();
  const [available] = useState(() => Boolean(api()));
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [orgId, setOrgId] = useState("");
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const s = api();
    if (!s) return;
    try {
      const [cfg, st] = await Promise.all([s.getConfig(), s.status()]);
      setEnabled(cfg.enabled);
      setUrl(cfg.url ?? "");
      setKey(cfg.key ?? "");
      setOrgId(cfg.orgId ?? "");
      setBranchId(cfg.branchId || defaultBranchId);
      setStatus(st);
    } catch {
      /* not authorized yet / not ready */
    }
  }

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function save() {
    const s = api();
    if (!s) return;
    setBusy(true);
    try {
      const cfg: Partial<SyncConfig> = { enabled, url, key, orgId, branchId };
      const st = await s.setConfig(cfg);
      setStatus(st);
      toast.success("تم حفظ إعدادات المزامنة");
    } catch {
      toast.error("تعذّر حفظ الإعدادات");
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    const s = api();
    if (!s) return;
    setBusy(true);
    try {
      const r = await s.now();
      if (r.ok) {
        toast.success("تمت المزامنة", `رفع ${r.pushed ?? 0} · جلب ${r.pulled ?? 0}`);
      } else {
        toast.error("تعذّرت المزامنة", r.reason === "not_configured" ? "أكمل بيانات الاتصال" : r.error || r.reason);
      }
      await refresh();
    } catch {
      toast.error("تعذّرت المزامنة");
    } finally {
      setBusy(false);
    }
  }

  if (!available) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader title="المزامنة السحابية (الفروع)" subtitle="مزامنة بيانات الفروع عبر السحابة" />
        <CardBody>
          <div className="text-sm text-slate-500">تعمل هذه الميزة داخل تطبيق سطح المكتب فقط.</div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="المزامنة السحابية (الفروع)"
        subtitle="اختياري — يعمل التطبيق أوفلاين بالكامل، والمزامنة طبقة إضافية فوقه"
        actions={
          status ? (
            <div className="flex items-center gap-2">
              {status.enabled ? <Badge tone="green">مفعّلة</Badge> : <Badge tone="slate">موقوفة</Badge>}
              {status.pending > 0 ? <Badge tone="amber">{status.pending} بانتظار الرفع</Badge> : null}
            </div>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="تفعيل المزامنة">
            <label className="flex items-center gap-2 h-9 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              مزامنة بيانات هذا الفرع مع السحابة
            </label>
          </Field>
          <Field label="معرّف المؤسسة (Org ID)" hint="نفس المعرّف لكل الفروع">
            <Input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="topgear" />
          </Field>
          <Field label="معرّف الفرع">
            <Input value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="branch-main" />
          </Field>
          <Field label="Supabase URL" className="md:col-span-3">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" dir="ltr" />
          </Field>
          <Field label="Supabase Key (anon)" className="md:col-span-3" hint="مفتاح عام محمي بسياسات RLS — لا تضع مفتاح service role">
            <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} dir="ltr" />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={busy}>
            <Cloud className="w-4 h-4" /> حفظ الإعدادات
          </Button>
          <Button variant="outline" onClick={syncNow} disabled={busy || !status?.configured}>
            <RefreshCw className="w-4 h-4" /> مزامنة الآن
          </Button>
        </div>

        {status ? (
          <div className="text-xs text-slate-500 space-y-1 border-t pt-3">
            <div>آخر مزامنة: {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString("ar-EG") : "—"}</div>
            {status.lastError ? <div className="text-rose-600">آخر خطأ: {status.lastError}</div> : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
