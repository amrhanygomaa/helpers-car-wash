import { useEffect } from "react";
import { useSettings } from "../../store/SettingsContext";
import { formatCurrency, formatDate } from "../../lib/format";
import { buildXlsx } from "../../lib/xlsx";

export interface StatementRow {
  key: string;
  date: string;
  sortKey: string;
  description: string;
  madin: number;
  daen: number;
  balance: number;
}

interface Props {
  kind: "customer" | "supplier";
  partyName: string;
  partyCode?: string;
  partyPhone?: string;
  rows: StatementRow[];
}

export function StatementPrintLayout({ kind, partyName, partyCode, partyPhone, rows }: Props) {
  const { settings } = useSettings();

  const title = kind === "customer" ? "كشف حساب عميل" : "كشف حساب مورد";
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].balance : 0;
  const totalMadin = rows.reduce((s, r) => s + r.madin, 0);
  const totalDaen = rows.reduce((s, r) => s + r.daen, 0);

  useEffect(() => {
    document.title = `${title} — ${partyName}`;
  }, [title, partyName]);

  function downloadXlsx() {
    const headers = ["التاريخ", "البيان", "مدين", "دائن", "الرصيد"];
    const dataRows: (string | number)[][] = rows.map((r) => [
      r.date,
      r.description,
      r.madin || "",
      r.daen || "",
      r.balance,
    ]);
    dataRows.push(["", "الإجمالي", totalMadin, totalDaen, finalBalance]);
    const bytes = buildXlsx([{ name: "كشف الحساب", headers, rows: dataRows }]);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `كشف_حساب_${partyName}_${new Date().toLocaleDateString("en-CA")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-200 py-8 px-4 print:p-0 print:bg-white" dir="rtl">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            @page { size: A4 portrait; margin: 0; }
            body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .statement-page { box-shadow: none !important; border-radius: 0 !important; }
          }
          @media screen { .statement-page { max-width: 210mm; } }
        `,
        }}
      />

      {/* Screen toolbar */}
      <div className="no-print max-w-[210mm] mx-auto flex items-center justify-between mb-4">
        <button
          onClick={() => window.history.back()}
          className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 h-9"
        >
          ← رجوع
        </button>
        <div className="flex gap-2">
          <button
            onClick={downloadXlsx}
            className="h-9 px-4 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            ⬇ Excel
          </button>
          <button
            onClick={() => window.print()}
            className="h-9 px-6 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            طباعة
          </button>
        </div>
      </div>

      {/* A4 page */}
      <div
        className="statement-page mx-auto bg-white shadow-xl print:shadow-none"
        style={{ minHeight: "297mm", display: "flex", flexDirection: "column" }}
      >
        {/* Top accent bar */}
        <div style={{ height: 8, background: "linear-gradient(90deg, #1e3a5f 0%, #2563eb 100%)" }} />

        <div style={{ padding: "20mm 16mm 14mm", flex: 1, display: "flex", flexDirection: "column" }}>

          {/* ── HEADER ── */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 20,
              paddingBottom: 14,
              borderBottom: "2px solid #1e3a5f",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 52, height: 52, borderRadius: 10, overflow: "hidden", flexShrink: 0,
                  background: settings.logoImage ? "transparent" : "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white", fontWeight: 700, fontSize: 16,
                }}
              >
                {settings.logoImage
                  ? <img src={settings.logoImage} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  : settings.logoText}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: "#0f172a", lineHeight: 1.2 }}>
                  {settings.arabicLabels ? settings.companyNameAr : settings.companyName}
                </div>
                {settings.companyNameAr && settings.companyName &&
                  settings.companyNameAr !== settings.companyName && (
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{settings.companyName}</div>
                  )}
              </div>
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1e3a5f", letterSpacing: -0.5 }}>{title}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
              </div>
            </div>
          </div>

          {/* ── PARTY INFO ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            <div style={{ border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 10px", background: "#eff6ff", borderRight: "3px solid #2563eb" }}>
              <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>
                {kind === "customer" ? "العميل" : "المورد"}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{partyName}</div>
            </div>
            {partyCode ? (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", background: "#f8fafc" }}>
                <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>الكود</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>{partyCode}</div>
              </div>
            ) : <div />}
            {partyPhone ? (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", background: "#f8fafc" }}>
                <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3 }}>الهاتف</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{partyPhone}</div>
              </div>
            ) : <div />}
          </div>

          {/* ── TABLE ── */}
          <div style={{ flex: 1 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr>
                  <Th style={{ width: 72 }}>التاريخ</Th>
                  <Th>البيان</Th>
                  <Th center style={{ width: 100 }}>مدين</Th>
                  <Th center style={{ width: 100 }}>دائن</Th>
                  <Th center style={{ width: 110 }}>الرصيد</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "28px", color: "#94a3b8", fontSize: 12 }}>
                      لا توجد حركات مسجلة
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr key={row.key} style={{ background: idx % 2 === 1 ? "#f8fafc" : "#ffffff" }}>
                      <Td muted center>{formatDate(row.date)}</Td>
                      <Td>{row.description}</Td>
                      <Td center mono>{row.madin > 0 ? formatCurrency(row.madin, settings.currency) : "—"}</Td>
                      <Td center mono green>{row.daen > 0 ? formatCurrency(row.daen, settings.currency) : "—"}</Td>
                      <Td
                        center mono bold
                        red={row.balance > 0}
                        green={row.balance < 0}
                      >
                        {row.balance === 0
                          ? "صفر"
                          : row.balance > 0
                            ? formatCurrency(row.balance, settings.currency)
                            : `دائن: ${formatCurrency(-row.balance, settings.currency)}`}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot style={{ borderTop: "2px solid #1e3a5f" }}>
                <tr style={{ background: "#f8fafc" }}>
                  <td colSpan={2} style={{ padding: "10px 12px", border: "1px solid #e2e8f0", textAlign: "left", fontWeight: 700, fontSize: 12, color: "#64748b" }}>
                    إجمالي الحركات (مدين / دائن)
                  </td>
                  <td style={{ padding: "10px 6px", border: "1px solid #e2e8f0", textAlign: "center", fontWeight: 700, fontSize: 12, fontFamily: "monospace", color: "#0f172a" }}>
                    {totalMadin > 0 ? formatCurrency(totalMadin, settings.currency) : "—"}
                  </td>
                  <td style={{ padding: "10px 6px", border: "1px solid #e2e8f0", textAlign: "center", fontWeight: 700, fontSize: 12, fontFamily: "monospace", color: "#16a34a" }}>
                    {totalDaen > 0 ? formatCurrency(totalDaen, settings.currency) : "—"}
                  </td>
                  <td style={{ border: "1px solid #e2e8f0", background: "#f8fafc" }}></td>
                </tr>
                <tr>
                  <td colSpan={4} style={{ padding: "12px", border: "1px solid #1e3a5f", background: "#1e3a5f", textAlign: "left", fontWeight: 700, fontSize: 14, color: "white" }}>
                    الرصيد النهائي
                  </td>
                  <td style={{ padding: "12px 6px", border: "1px solid #1e3a5f", background: "#1e3a5f", textAlign: "center", fontWeight: 800, fontSize: 14, fontFamily: "monospace", color: "white" }}>
                    {finalBalance === 0 ? "صفر" : finalBalance > 0 ? formatCurrency(finalBalance, settings.currency) : `رصيد دائن: ${formatCurrency(-finalBalance, settings.currency)}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ flex: 1 }} />

          {/* Footer */}
          <div style={{ marginTop: 20, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
            {settings.invoiceFooter && (
              <div style={{ textAlign: "center", fontSize: 11, color: "#64748b", whiteSpace: "pre-line", marginBottom: 8 }}>
                {settings.invoiceFooter}
              </div>
            )}
            <div style={{ textAlign: "center", fontSize: 9, color: "#cbd5e1", marginTop: 4 }}>
              هيلبيرز تكنولوجي
            </div>
          </div>
        </div>

        {/* Bottom accent bar */}
        <div style={{ height: 5, background: "linear-gradient(90deg, #1e3a5f 0%, #2563eb 100%)" }} />
      </div>
    </div>
  );
}

/* ── Helpers ── */

function Th({ children, center, style }: { children: React.ReactNode; center?: boolean; style?: React.CSSProperties }) {
  return (
    <th style={{ padding: "8px 6px", border: "1px solid #1e3a5f", background: "#1e3a5f", color: "white", fontWeight: 700, fontSize: 11, textAlign: center ? "center" : "right", ...style }}>
      {children}
    </th>
  );
}

function Td({ children, center, muted, mono, bold, green, red }: {
  children: React.ReactNode;
  center?: boolean; muted?: boolean; mono?: boolean; bold?: boolean; green?: boolean; red?: boolean;
}) {
  return (
    <td style={{
      padding: "8px 6px",
      border: "1px solid #e2e8f0",
      textAlign: center ? "center" : "right",
      color: green ? "#16a34a" : red ? "#dc2626" : muted ? "#64748b" : "#0f172a",
      fontWeight: bold ? 700 : 400,
      fontFamily: mono ? "monospace" : undefined,
      fontSize: 11.5,
    }}>
      {children}
    </td>
  );
}


