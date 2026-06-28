import { useCallback, useEffect, useMemo, useState } from "react";
import { LogIn, LogOut, UserCheck } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Field, Input } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { hasPermissionKey } from "../lib/permissions";
import { todayISO, uid } from "../lib/utils";
import { hoursWorked, clockTime } from "../lib/attendance";
import { hasDb } from "../db/client";
import { listActiveWorkers, type Worker } from "../features/workers/queries";
import {
  listAttendanceForDate,
  checkIn,
  checkOut,
  type WorkerAttendance,
} from "../features/attendance/queries";

export function AttendancePage() {
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const branchId = settings.currentBranchId || "branch-main";
  const canManage = hasPermissionKey(currentUser, "payroll.manage");

  const [date, setDate] = useState(todayISO());
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [records, setRecords] = useState<WorkerAttendance[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!hasDb()) { setLoading(false); return; }
    setLoading(true);
    try {
      const [w, r] = await Promise.all([listActiveWorkers(), listAttendanceForDate(date, branchId)]);
      setWorkers(w);
      setRecords(r);
    } finally {
      setLoading(false);
    }
  }, [date, branchId]);

  useEffect(() => { void reload(); }, [reload]);

  const byWorker = useMemo(() => {
    const map = new Map<string, { open?: WorkerAttendance; totalHours: number; sessions: number }>();
    for (const rec of records) {
      const e = map.get(rec.workerId) ?? { totalHours: 0, sessions: 0 };
      if (!rec.checkOut) e.open = rec;
      else e.totalHours += hoursWorked(rec.checkIn, rec.checkOut);
      e.sessions += 1;
      map.set(rec.workerId, e);
    }
    return map;
  }, [records]);

  const isToday = date === todayISO();

  async function onCheckIn(workerId: string) {
    try {
      await checkIn({ id: uid("att"), workerId, businessDate: date, branchId, createdAt: new Date().toISOString() });
      toast.success("تم تسجيل الحضور");
      await reload();
    } catch {
      toast.error("تعذّر تسجيل الحضور");
    }
  }

  async function onCheckOut(id: string) {
    try {
      await checkOut(id, new Date().toISOString());
      toast.success("تم تسجيل الانصراف");
      await reload();
    } catch {
      toast.error("تعذّر تسجيل الانصراف");
    }
  }

  if (!hasDb()) {
    return (
      <>
        <PageHeader title="حضور الصنايعية" description="تسجيل الحضور والانصراف" />
        <Card><CardBody><EmptyState icon={<UserCheck className="w-5 h-5" />} title="غير متاح" description="هذه الميزة تعمل داخل تطبيق سطح المكتب فقط." /></CardBody></Card>
      </>
    );
  }

  const presentCount = [...byWorker.values()].filter((e) => e.open).length;

  return (
    <>
      <PageHeader
        title="حضور الصنايعية"
        description="سجّل حضور وانصراف الصنايعية واحسب ساعات العمل اليومية."
        actions={
          <Field label="التاريخ">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        }
      />

      <Card>
        <CardHeader
          title="سجل اليوم"
          subtitle={`${presentCount} حاضر الآن من ${workers.length} صنايعي`}
        />
        <CardBody className="p-0">
          {loading ? (
            <div className="p-6 text-center text-slate-400 text-sm">جارٍ التحميل…</div>
          ) : workers.length === 0 ? (
            <div className="p-6"><EmptyState icon={<UserCheck className="w-6 h-6" />} title="لا يوجد صنايعية" description="أضف الصنايعية من صفحة العمال." /></div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الصنايعي</TH>
                  <TH>الحضور</TH>
                  <TH>الانصراف</TH>
                  <TH className="text-end">ساعات اليوم</TH>
                  <TH>الحالة</TH>
                  {canManage ? <TH className="text-end">إجراء</TH> : null}
                </TR>
              </THead>
              <TBody>
                {workers.map((w) => {
                  const e = byWorker.get(w.id);
                  const open = e?.open;
                  const totalHours = (e?.totalHours ?? 0) + (open ? hoursWorked(open.checkIn, new Date().toISOString()) : 0);
                  return (
                    <TR key={w.id}>
                      <TD className="font-medium text-slate-900">{w.name}</TD>
                      <TD>{open ? clockTime(open.checkIn) : e ? "—" : "—"}</TD>
                      <TD>{open ? "—" : e && e.sessions > 0 ? "✓" : "—"}</TD>
                      <TD className="text-end">{totalHours > 0 ? `${totalHours.toFixed(2)} س` : "—"}</TD>
                      <TD>
                        {open ? <Badge tone="green">حاضر</Badge> : e && e.sessions > 0 ? <Badge tone="slate">انصرف</Badge> : <Badge tone="amber">لم يحضر</Badge>}
                      </TD>
                      {canManage ? (
                        <TD className="text-end">
                          {open ? (
                            <Button size="sm" variant="outline" onClick={() => onCheckOut(open.id)}>
                              <LogOut className="w-3.5 h-3.5" /> انصراف
                            </Button>
                          ) : isToday ? (
                            <Button size="sm" onClick={() => onCheckIn(w.id)}>
                              <LogIn className="w-3.5 h-3.5" /> حضور
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
