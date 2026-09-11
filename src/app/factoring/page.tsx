"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Banknote,
  Download,
  Landmark,
  RotateCcw,
  Timer,
} from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { factoringNet } from "@/lib/finance";
import type { LoadRow } from "@/lib/types";
import { cn, daysSince, fmtMoney, num, statusLabel } from "@/lib/util";
import { Card, PageHeader, PageLoading, Pill, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";

type Stage = LoadRow["factoringStatus"];

const PIPELINE: { key: Stage; label: string; blurb: string }[] = [
  { key: "not_submitted", label: "Not Submitted", blurb: "Delivered — invoice not yet sent to factor" },
  { key: "submitted", label: "Submitted", blurb: "Packet sent — awaiting factor approval" },
  { key: "approved", label: "Approved", blurb: "Approved — waiting on funds to hit" },
  { key: "funded", label: "Funded", blurb: "Money received — invoice closed" },
  { key: "rejected", label: "Rejected", blurb: "Factor declined — bill broker direct" },
];

const NEXT: Partial<Record<Stage, Stage>> = {
  not_submitted: "submitted",
  submitted: "approved",
  approved: "funded",
};
const PREV: Partial<Record<Stage, Stage>> = {
  submitted: "not_submitted",
  approved: "submitted",
  funded: "approved",
};

const COLUMN_ACCENT: Record<Stage, string> = {
  not_submitted: "text-zinc-400",
  submitted: "text-sky-400",
  approved: "text-violet-400",
  funded: "text-emerald-400",
  rejected: "text-rose-400",
};

export default function FactoringPage() {
  const toast = useToast();
  const [loads, setLoads] = useState<LoadRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoads(await api<LoadRow[]>("/api/loads"));
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load, toast]);

  const delivered = useMemo(() => (loads ?? []).filter((l) => l.status === "delivered"), [loads]);

  const byStage = useMemo(() => {
    const m = new Map<Stage, LoadRow[]>();
    PIPELINE.forEach((s) =>
      m.set(
        s.key,
        delivered
          .filter((l) => l.factoringStatus === s.key)
          .sort((a, b) => daysSince(b.deliveryDate) - daysSince(a.deliveryDate)),
      ),
    );
    return m;
  }, [delivered]);

  const totals = useMemo(() => {
    const unfunded = delivered.filter((l) => l.factoringStatus !== "funded");
    const inPipe = delivered.filter(
      (l) => l.factoringStatus === "submitted" || l.factoringStatus === "approved",
    );
    return {
      ar: unfunded.reduce((s, l) => s + num(l.rate), 0),
      fees: inPipe.reduce((s, l) => s + factoringNet(l.rate, l.factoringFeePct).fee, 0),
      net: inPipe.reduce((s, l) => s + factoringNet(l.rate, l.factoringFeePct).net, 0),
      funded: delivered
        .filter((l) => l.factoringStatus === "funded")
        .reduce((s, l) => s + factoringNet(l.rate, l.factoringFeePct).net, 0),
    };
  }, [delivered]);

  const move = async (l: LoadRow, to: Stage) => {
    setBusyId(l.id);
    try {
      await api(`/api/loads/${l.id}`, { method: "PATCH", body: { factoringStatus: to } });
      toast.success(`${l.loadNumber} → ${statusLabel(to)}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    downloadCsv("ironhaul_factoring.csv", delivered.map((l) => {
      const fact = factoringNet(l.rate, l.factoringFeePct);
      return {
        "Load #": l.loadNumber, Broker: l.brokerName ?? "",
        "Delivery Date": l.deliveryDate ?? "", "Days Outstanding": daysSince(l.deliveryDate),
        "Invoice (USD)": num(l.rate).toFixed(2), "Fee %": num(l.factoringFeePct).toFixed(2),
        "Fee (USD)": fact.fee.toFixed(2), "Expected Net (USD)": fact.net.toFixed(2),
        Status: statusLabel(l.factoringStatus),
      };
    }));
    toast.success("Factoring report exported");
  };

  if (!loads) return <PageLoading />;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Cash Flow"
        title="Factoring Pipeline"
        sub="Invoice factoring from packet submission to funding — fees and net payouts computed live."
        actions={
          <button className="btn btn-ghost" onClick={exportCsv}><Download size={14} /> Export AR report</button>
        }
      />

      {/* ------------------------------ Totals row --------------------------- */}
      <div className="rise grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card className="flex items-center gap-3.5 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/[0.08] text-sky-400"><Banknote size={17} /></span>
          <div>
            <div className="mono text-[17px] font-bold leading-tight text-zinc-50">{fmtMoney(totals.ar)}</div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-zinc-500">Outstanding AR</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3.5 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-400/[0.08] text-violet-400"><Landmark size={17} /></span>
          <div>
            <div className="mono text-[17px] font-bold leading-tight text-zinc-50">{fmtMoney(totals.fees)}</div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-zinc-500">Factor fees in pipe</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3.5 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/[0.08] text-amber-400"><Timer size={17} /></span>
          <div>
            <div className="mono text-[17px] font-bold leading-tight text-zinc-50">{fmtMoney(totals.net)}</div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-zinc-500">Expected net (in pipe)</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3.5 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-400"><Banknote size={17} /></span>
          <div>
            <div className="mono text-[17px] font-bold leading-tight text-zinc-50">{fmtMoney(totals.funded)}</div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-zinc-500">Funded (net received)</div>
          </div>
        </Card>
      </div>

      {/* ------------------------------ Kanban ------------------------------- */}
      <div className="rise grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {PIPELINE.map((stage, si) => {
          const items = byStage.get(stage.key) ?? [];
          const sum = items.reduce((s, l) => s + num(l.rate), 0);
          return (
            <div key={stage.key} className="card flex flex-col overflow-hidden" style={{ animationDelay: `${si * 60}ms` }}>
              <div className="border-b border-white/[0.06] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-[13px] font-bold tracking-tight", COLUMN_ACCENT[stage.key])}>
                    {stage.label}
                  </span>
                  <Pill tone={stage.key === "funded" ? "emerald" : stage.key === "rejected" ? "rose" : stage.key === "approved" ? "violet" : stage.key === "submitted" ? "sky" : "zinc"}>
                    {items.length}
                  </Pill>
                </div>
                <div className="mono mt-0.5 text-[11px] text-zinc-500">{fmtMoney(sum)} face value</div>
                <div className="mt-1 text-[10.5px] leading-snug text-zinc-600">{stage.blurb}</div>
              </div>

              <div className="min-h-[220px] flex-1 space-y-2.5 overflow-y-auto p-3" style={{ maxHeight: 520 }}>
                {items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/[0.07] py-8 text-center text-[11px] text-zinc-600">
                    Nothing here
                  </div>
                )}
                {items.map((l) => {
                  const fact = factoringNet(l.rate, l.factoringFeePct);
                  const age = daysSince(l.deliveryDate);
                  const overdue = l.brokerTerms != null && age > l.brokerTerms && stage.key !== "funded";
                  return (
                    <div key={l.id} className="card-hover rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="mono text-[12.5px] font-bold text-zinc-100">{l.loadNumber}</span>
                        <span className={cn("mono rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold", overdue ? "bg-rose-400/15 text-rose-300" : "bg-white/[0.05] text-zinc-400")}>
                          {age}d{overdue ? " past terms" : ""}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-zinc-500">{l.brokerName ?? "—"}</div>

                      <div className="mt-2 flex items-end justify-between">
                        <div>
                          <div className="mono text-[15px] font-bold text-amber-300">{fmtMoney(l.rate)}</div>
                          <div className="mono text-[10px] text-zinc-600">
                            −{num(l.factoringFeePct).toFixed(2)}% fee ({fmtMoney(fact.fee)})
                          </div>
                          <div className="mono text-[10.5px] font-semibold text-emerald-300/90">
                            net {fmtMoney(fact.net)}
                          </div>
                        </div>
                      </div>

                      {/* status controls */}
                      <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.05] pt-2.5">
                        {PREV[stage.key] && (
                          <button
                            className="icon-btn"
                            title={`Back to ${statusLabel(PREV[stage.key]!)}`}
                            disabled={busyId === l.id}
                            onClick={() => move(l, PREV[stage.key]!)}
                          >
                            <ArrowLeft size={13} />
                          </button>
                        )}
                        {NEXT[stage.key] ? (
                          <button
                            className="btn btn-ghost btn-sm flex-1 justify-center text-[11px]"
                            disabled={busyId === l.id}
                            onClick={() => move(l, NEXT[stage.key]!)}
                          >
                            {busyId === l.id ? <Spinner /> : <ArrowRight size={12} />}
                            {statusLabel(NEXT[stage.key]!)}
                          </button>
                        ) : stage.key === "rejected" ? (
                          <button
                            className="btn btn-ghost btn-sm flex-1 justify-center text-[11px]"
                            disabled={busyId === l.id}
                            onClick={() => move(l, "not_submitted")}
                          >
                            <RotateCcw size={12} /> Reinstate
                          </button>
                        ) : (
                          <span className="flex-1 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
                            Closed
                          </span>
                        )}
                        {stage.key !== "rejected" && stage.key !== "funded" && (
                          <button
                            className="icon-btn danger"
                            title="Mark rejected"
                            disabled={busyId === l.id}
                            onClick={() => move(l, "rejected")}
                          >
                            <Ban size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
