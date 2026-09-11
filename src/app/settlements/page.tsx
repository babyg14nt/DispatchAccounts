"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Calculator,
  Download,
  Eye,
  HandCoins,
  Plus,
  Printer,
  Trash2,
  Undo2,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { calcLoadPay, DEDUCTION_TYPES, payStructureLabel } from "@/lib/finance";
import type { DeductionRow, DriverRow, LoadRow, SettlementRow } from "@/lib/types";
import { cn, fmtDate, fmtMoney, num, statusLabel, todayIso } from "@/lib/util";
import {
  Card, ConfirmDialog, EmptyState, Field, Loading, Modal, PageHeader, Pill, SectionHead, Spinner,
} from "@/components/ui";
import { useToast } from "@/components/toast";

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const DED_TONES: Record<string, "amber" | "orange" | "rose" | "violet" | "zinc"> = {
  fuel_advance: "amber", cash_advance: "orange", repair: "rose", escrow: "violet", other: "zinc",
};

export default function SettlementsPage() {
  const toast = useToast();
  const [settlements, setSettlements] = useState<SettlementRow[] | null>(null);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [deductions, setDeductions] = useState<DeductionRow[]>([]);

  /* generator state */
  const [genDriver, setGenDriver] = useState("");
  const [genStart, setGenStart] = useState(isoDaysAgo(30));
  const [genEnd, setGenEnd] = useState(todayIso());
  const [generating, setGenerating] = useState(false);

  /* deduction quick-add state */
  const [dedDriver, setDedDriver] = useState("");
  const [dedDate, setDedDate] = useState(todayIso());
  const [dedType, setDedType] = useState("fuel_advance");
  const [dedAmount, setDedAmount] = useState("");
  const [dedNote, setDedNote] = useState("");
  const [dedSaving, setDedSaving] = useState(false);

  const [statement, setStatement] = useState<SettlementRow | null>(null);
  const [deleting, setDeleting] = useState<SettlementRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [dedDeleting, setDedDeleting] = useState<DeductionRow | null>(null);

  const load = useCallback(async () => {
    const [s, d, l, ded] = await Promise.all([
      api<SettlementRow[]>("/api/settlements"),
      api<DriverRow[]>("/api/drivers"),
      api<LoadRow[]>("/api/loads"),
      api<DeductionRow[]>("/api/deductions"),
    ]);
    setSettlements(s);
    setDrivers(d);
    setLoads(l);
    setDeductions(ded);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load, toast]);

  const activeDrivers = drivers.filter((d) => d.status === "active");

  /* ------------------------- Live settlement preview ----------------------- */
  const preview = useMemo(() => {
    if (!genDriver || !settlements) return null;
    const driver = drivers.find((d) => d.id === genDriver);
    if (!driver) return null;
    const settledLoadIds = new Set(
      settlements
        .filter((s) => s.driverId === genDriver)
        .flatMap((s) => s.items.map((i) => i.loadId).filter(Boolean)),
    );
    const eligible = loads.filter(
      (l) =>
        l.driverId === genDriver && l.status === "delivered" &&
        l.deliveryDate && genStart <= l.deliveryDate && l.deliveryDate <= genEnd &&
        !settledLoadIds.has(l.id),
    );
    const gross = eligible.reduce((s, l) => s + calcLoadPay(driver.payType, driver.payRate, l.rate, l.miles), 0);
    const openDeds = deductions.filter(
      (d) => d.driverId === genDriver && !d.settlementId && d.deductionDate <= genEnd,
    );
    const dedTotal = openDeds.reduce((s, d) => s + num(d.amount), 0);
    return { eligible, gross, openDeds, dedTotal, net: gross - dedTotal, driver };
  }, [genDriver, genStart, genEnd, loads, settlements, drivers, deductions]);

  const generate = async () => {
    setGenerating(true);
    try {
      const s = await api<SettlementRow>("/api/settlements", {
        method: "POST",
        body: { driverId: genDriver, periodStart: genStart, periodEnd: genEnd },
      });
      toast.success(`Settlement ${s.settlementNumber} generated — ${fmtMoney(s.netPay, true)} net`);
      await load();
      setStatement(s); /* response already carries the full itemized bundle */
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const togglePaid = async (s: SettlementRow) => {
    try {
      const to = s.status === "paid" ? "draft" : "paid";
      await api(`/api/settlements/${s.id}`, { method: "PATCH", body: { status: to } });
      toast.success(`${s.settlementNumber} marked ${to}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/settlements/${deleting.id}`, { method: "DELETE" });
      toast.success(`${deleting.settlementNumber} deleted — deductions released`);
      setDeleting(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const addDeduction = async () => {
    setDedSaving(true);
    try {
      await api("/api/deductions", {
        method: "POST",
        body: { driverId: dedDriver, deductionDate: dedDate, type: dedType, amount: dedAmount, note: dedNote },
      });
      toast.success("Deduction recorded");
      setDedAmount("");
      setDedNote("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setDedSaving(false);
    }
  };

  const removeDeduction = async () => {
    if (!dedDeleting) return;
    try {
      await api(`/api/deductions/${dedDeleting.id}`, { method: "DELETE" });
      toast.success("Deduction removed");
      setDedDeleting(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const exportAll = () => {
    if (!settlements) return;
    downloadCsv("ironhaul_settlements.csv", settlements.map((s) => ({
      "Settlement #": s.settlementNumber, Driver: s.driverName ?? "",
      "Period Start": s.periodStart, "Period End": s.periodEnd,
      "Loads Settled": s.items.filter((i) => i.kind === "load").length,
      "Gross Pay (USD)": num(s.grossPay).toFixed(2),
      "Deductions (USD)": num(s.totalDeductions).toFixed(2),
      "Net Pay (USD)": num(s.netPay).toFixed(2),
      Status: statusLabel(s.status),
    })));
    toast.success("Settlement register exported");
  };

  const exportLines = (s: SettlementRow) => {
    downloadCsv(`ironhaul_${s.settlementNumber}_lines.csv`, s.items.map((i) => ({
      Type: i.kind === "load" ? "Earnings (load)" : "Deduction",
      Description: i.description,
      "Amount (USD)": num(i.amount).toFixed(2),
    })));
    toast.success("Statement lines exported");
  };

  const printStatement = () => {
    document.body.classList.add("print-mode");
    window.onafterprint = () => document.body.classList.remove("print-mode");
    window.print();
    setTimeout(() => document.body.classList.remove("print-mode"), 1500);
  };

  const openDeductionsList = deductions.filter((d) => !d.settlementId);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Payroll"
        title="Driver Settlements"
        sub="Generate itemized pay statements from delivered loads, minus advances and chargebacks."
        actions={<button className="btn btn-ghost" onClick={exportAll}><Download size={14} /> Export register</button>}
      />

      {/* ------------------------------ Generator ---------------------------- */}
      <Card className="rise p-5">
        <SectionHead title="Generate settlement" right={<Calculator size={15} className="text-amber-400" />} />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Driver" className="min-w-[200px] flex-1">
            <select className="input" value={genDriver} onChange={(e) => setGenDriver(e.target.value)}>
              <option value="">— Select driver —</option>
              {activeDrivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name} · {payStructureLabel(d.payType, d.payRate)}</option>
              ))}
            </select>
          </Field>
          <Field label="Period start" className="w-[170px]">
            <input className="input" type="date" value={genStart} onChange={(e) => setGenStart(e.target.value)} />
          </Field>
          <Field label="Period end" className="w-[170px]">
            <input className="input" type="date" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} />
          </Field>
          <button
            className="btn btn-primary"
            disabled={generating || !genDriver || !preview || preview.eligible.length === 0 && preview.openDeds.length === 0}
            onClick={generate}
          >
            {generating && <Spinner />} Generate
          </button>
        </div>

        {preview && (
          <div className="fade-in mt-4 grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 md:grid-cols-4">
            <div>
              <div className="mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-500">Payable loads</div>
              <div className="mono text-[18px] font-bold text-zinc-50">{preview.eligible.length}</div>
              <div className="text-[10.5px] text-zinc-600">{payStructureLabel(preview.driver.payType, preview.driver.payRate)}</div>
            </div>
            <div>
              <div className="mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-500">Gross earnings</div>
              <div className="mono text-[18px] font-bold text-amber-300">{fmtMoney(preview.gross, true)}</div>
            </div>
            <div>
              <div className="mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-500">Open deductions</div>
              <div className="mono text-[18px] font-bold text-rose-300">−{fmtMoney(preview.dedTotal, true)}</div>
              <div className="text-[10.5px] text-zinc-600">{preview.openDeds.length} item(s) through {fmtDate(genEnd)}</div>
            </div>
            <div>
              <div className="mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-500">Estimated net pay</div>
              <div className="mono text-[18px] font-bold text-emerald-300">{fmtMoney(preview.net, true)}</div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* --------------------------- Settlement list ------------------------ */}
        <Card className="rise overflow-hidden xl:col-span-2">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <SectionHead title="Settlement register" className="mb-0" />
          </div>
          {!settlements ? (
            <Loading />
          ) : settlements.length === 0 ? (
            <EmptyState icon={Wallet} title="No settlements yet" hint="Pick a driver and period above to generate the first statement." />
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {settlements.map((s) => {
                const loadLines = s.items.filter((i) => i.kind === "load").length;
                const dedLines = s.items.filter((i) => i.kind === "deduction").length;
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 transition-colors hover:bg-white/[0.02]">
                    <div className="min-w-[150px]">
                      <div className="mono text-[13.5px] font-bold text-zinc-100">{s.settlementNumber}</div>
                      <div className="text-[11px] text-zinc-500">{s.driverName}</div>
                    </div>
                    <div className="min-w-[160px] text-[11.5px] text-zinc-500">
                      {fmtDate(s.periodStart)} — {fmtDate(s.periodEnd)}
                      <div className="text-[10.5px] text-zinc-600">{loadLines} loads · {dedLines} deductions</div>
                    </div>
                    <div className="ml-auto flex items-center gap-5">
                      <div className="text-right">
                        <div className="mono text-[15px] font-bold text-emerald-300">{fmtMoney(s.netPay, true)}</div>
                        <div className="mono text-[10.5px] text-zinc-600">
                          {fmtMoney(s.grossPay)} − {fmtMoney(s.totalDeductions)}
                        </div>
                      </div>
                      <Pill tone={s.status === "paid" ? "emerald" : "zinc"}>{statusLabel(s.status)}</Pill>
                      <div className="flex items-center gap-1">
                        <button className="icon-btn" title="View statement" onClick={() => setStatement(s)}><Eye size={14} /></button>
                        <button className="icon-btn" title={s.status === "paid" ? "Reopen" : "Mark paid"} onClick={() => togglePaid(s)}>
                          {s.status === "paid" ? <Undo2 size={14} /> : <BadgeCheck size={14} />}
                        </button>
                        <button className="icon-btn" title="Export lines" onClick={() => exportLines(s)}><Download size={14} /></button>
                        <button className="icon-btn danger" title="Delete" onClick={() => setDeleting(s)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* --------------------------- Deductions ledger ---------------------- */}
        <div className="space-y-4">
          <Card className="rise p-5">
            <SectionHead title="Record deduction" right={<HandCoins size={15} className="text-amber-400" />} />
            <div className="space-y-3">
              <Field label="Driver">
                <select className="input" value={dedDriver} onChange={(e) => setDedDriver(e.target.value)}>
                  <option value="">— Select driver —</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date"><input className="input" type="date" value={dedDate} onChange={(e) => setDedDate(e.target.value)} /></Field>
                <Field label="Amount (USD)"><input className="input mono" type="number" min="0" step="0.01" value={dedAmount} onChange={(e) => setDedAmount(e.target.value)} placeholder="250.00" /></Field>
              </div>
              <Field label="Type">
                <select className="input" value={dedType} onChange={(e) => setDedType(e.target.value)}>
                  {DEDUCTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Note"><input className="input" value={dedNote} onChange={(e) => setDedNote(e.target.value)} placeholder="Comchek fuel advance" /></Field>
              <button className="btn btn-primary w-full" disabled={dedSaving || !dedDriver || !dedAmount} onClick={addDeduction}>
                {dedSaving ? <Spinner /> : <Plus size={15} />} Add deduction
              </button>
            </div>
          </Card>

          <Card className="rise p-5">
            <SectionHead
              title="Open deductions"
              right={<span className="pill tone-amber">{openDeductionsList.length} open</span>}
            />
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {openDeductionsList.length === 0 && (
                <div className="py-6 text-center text-[12px] text-zinc-600">No unsettled deductions.</div>
              )}
              {openDeductionsList.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[12.5px] font-semibold text-zinc-200">{d.driverName}</span>
                      <Pill tone={DED_TONES[d.type] ?? "zinc"}>{statusLabel(d.type)}</Pill>
                    </div>
                    <div className="truncate text-[10.5px] text-zinc-600">{d.note || "—"} · {fmtDate(d.deductionDate)}</div>
                  </div>
                  <span className="mono shrink-0 text-[13px] font-bold text-rose-300">−{fmtMoney(d.amount)}</span>
                  <button className="icon-btn danger shrink-0" onClick={() => setDedDeleting(d)} aria-label="Delete"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* --------------------------- Statement modal -------------------------- */}
      <Modal
        open={!!statement}
        onClose={() => setStatement(null)}
        title={statement ? `Statement ${statement.settlementNumber}` : ""}
        description="Itemized driver settlement statement"
        wide
      >
        {statement && (
          <>
            <div className="print-area rounded-xl border border-white/[0.07] bg-white/[0.015] p-6 sm:p-8">
              {/* statement header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-amber-400/60 pb-5">
                <div>
                  <div className="text-[19px] font-extrabold tracking-[0.12em] text-zinc-50">IRONHAUL LOGISTICS LLC</div>
                  <div className="mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                    MC 118-442 · DOT 2533110 · Columbus, OH
                  </div>
                </div>
                <div className="text-right">
                  <div className="mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">Settlement</div>
                  <div className="mono text-[20px] font-bold text-amber-300">{statement.settlementNumber}</div>
                  <div className="text-[11px] text-zinc-500">Issued {fmtDate(statement.createdAt?.slice(0, 10))}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <div className="mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">Driver</div>
                  <div className="text-[13.5px] font-semibold text-zinc-100">{statement.driverName}</div>
                </div>
                <div>
                  <div className="mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">Period</div>
                  <div className="text-[13.5px] font-semibold text-zinc-100">{fmtDate(statement.periodStart)} — {fmtDate(statement.periodEnd)}</div>
                </div>
                <div>
                  <div className="mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">Pay structure</div>
                  <div className="text-[13.5px] font-semibold text-zinc-100">{payStructureLabel(statement.payTypeSnapshot, statement.payRateSnapshot)}</div>
                </div>
                <div>
                  <div className="mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">Status</div>
                  <div className={cn("text-[13.5px] font-bold", statement.status === "paid" ? "text-emerald-300" : "text-zinc-300")}>{statusLabel(statement.status)}</div>
                </div>
              </div>

              {/* earnings */}
              <div className="mono mt-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Earnings — delivered loads</div>
              <table className="mt-2 w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left">
                    <th className="py-1.5 font-semibold text-zinc-500">Load / Lane</th>
                    <th className="py-1.5 text-right font-semibold text-zinc-500">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.items.filter((i) => i.kind === "load").map((i) => (
                    <tr key={i.id} className="border-b border-white/[0.04]">
                      <td className="py-1.5 text-zinc-300">{i.description}</td>
                      <td className="mono py-1.5 text-right text-emerald-300">{fmtMoney(i.amount, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* deductions */}
              <div className="mono mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Deductions & recoupments</div>
              <table className="mt-2 w-full text-[12.5px]">
                <tbody>
                  {statement.items.filter((i) => i.kind === "deduction").length === 0 && (
                    <tr><td className="py-1.5 text-zinc-500">None this period</td><td className="mono text-right text-zinc-500">$0.00</td></tr>
                  )}
                  {statement.items.filter((i) => i.kind === "deduction").map((i) => (
                    <tr key={i.id} className="border-b border-white/[0.04]">
                      <td className="py-1.5 text-zinc-300">{i.description}</td>
                      <td className="mono py-1.5 text-right text-rose-300">{fmtMoney(i.amount, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* totals */}
              <div className="mt-5 space-y-1.5 border-t border-white/[0.08] pt-4 text-[13px]">
                <div className="flex justify-between text-zinc-400"><span>Gross earnings</span><span className="mono">{fmtMoney(statement.grossPay, true)}</span></div>
                <div className="flex justify-between text-zinc-400"><span>Total deductions</span><span className="mono text-rose-300">−{fmtMoney(statement.totalDeductions, true)}</span></div>
                <div className="flex items-center justify-between border-t border-dashed border-white/[0.12] pt-3">
                  <span className="text-[15px] font-extrabold tracking-tight text-zinc-50">NET PAY</span>
                  <span className="mono text-[24px] font-bold text-amber-300">{fmtMoney(statement.netPay, true)}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2.5">
              <button className="btn btn-ghost" onClick={() => exportLines(statement)}><Download size={14} /> Lines CSV</button>
              <button className="btn btn-primary" onClick={printStatement}><Printer size={14} /> Print statement</button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.settlementNumber}?`}
        message="Line items are removed and any swept deductions become open again so they can be settled later. Loads are untouched."
        busy={deleteBusy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
      <ConfirmDialog
        open={!!dedDeleting}
        title="Delete deduction?"
        message={`Remove the ${dedDeleting ? fmtMoney(dedDeleting.amount) : ""} deduction for ${dedDeleting?.driverName ?? "driver"}?`}
        onConfirm={removeDeduction}
        onCancel={() => setDedDeleting(null)}
      />
    </div>
  );
}
