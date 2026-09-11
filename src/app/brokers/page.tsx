"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Clock, Download, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { BrokerRow, LoadRow } from "@/lib/types";
import { cn, fmtMoney, num, statusLabel } from "@/lib/util";
import { Card, ConfirmDialog, EmptyState, Field, Loading, Modal, PageHeader, Pill, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";

type FormState = Record<string, string>;
const BLANK: FormState = {
  companyName: "", mcNumber: "", dotNumber: "", contactName: "",
  phone: "", email: "", paymentTermsDays: "30",
};

export default function BrokersPage() {
  const toast = useToast();
  const [brokers, setBrokers] = useState<BrokerRow[] | null>(null);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BrokerRow | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<BrokerRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    const [b, l] = await Promise.all([
      api<BrokerRow[]>("/api/brokers"),
      api<LoadRow[]>("/api/loads"),
    ]);
    setBrokers(b);
    setLoads(l);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load, toast]);

  const perBroker = useMemo(() => {
    const m = new Map<string, { loads: number; revenue: number; openAR: number }>();
    loads.forEach((l) => {
      if (!l.brokerId) return;
      const cur = m.get(l.brokerId) ?? { loads: 0, revenue: 0, openAR: 0 };
      cur.loads += 1;
      if (l.status === "delivered") {
        cur.revenue += num(l.rate);
        if (l.factoringStatus !== "funded") cur.openAR += num(l.rate);
      }
      m.set(l.brokerId, cur);
    });
    return m;
  }, [loads]);

  const kpis = useMemo(() => {
    const vals = [...perBroker.values()];
    return {
      count: brokers?.length ?? 0,
      revenue: vals.reduce((s, v) => s + v.revenue, 0),
      openAR: vals.reduce((s, v) => s + v.openAR, 0),
      avgTerms: brokers?.length
        ? Math.round(brokers.reduce((s, b) => s + b.paymentTermsDays, 0) / brokers.length)
        : 0,
    };
  }, [brokers, perBroker]);

  const openCreate = () => { setEditing(null); setForm(BLANK); setModalOpen(true); };
  const openEdit = (b: BrokerRow) => {
    setEditing(b);
    setForm({
      companyName: b.companyName, mcNumber: b.mcNumber, dotNumber: b.dotNumber,
      contactName: b.contactName, phone: b.phone, email: b.email,
      paymentTermsDays: String(b.paymentTermsDays),
    });
    setModalOpen(true);
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/brokers/${editing.id}`, { method: "PATCH", body: form });
        toast.success(`${form.companyName} updated`);
      } else {
        await api("/api/brokers", { method: "POST", body: form });
        toast.success(`${form.companyName} added`);
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/brokers/${deleting.id}`, { method: "DELETE" });
      toast.success(`${deleting.companyName} removed`);
      setDeleting(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const exportCsv = () => {
    if (!brokers) return;
    downloadCsv("ironhaul_brokers.csv", brokers.map((b) => {
      const roll = perBroker.get(b.id);
      return {
        Company: b.companyName, "MC #": b.mcNumber, "DOT #": b.dotNumber,
        Contact: b.contactName, Phone: b.phone, Email: b.email,
        "Payment Terms (days)": b.paymentTermsDays,
        "Lifetime Loads": roll?.loads ?? 0,
        "Delivered Revenue (USD)": (roll?.revenue ?? 0).toFixed(2),
        "Open AR (USD)": (roll?.openAR ?? 0).toFixed(2),
      };
    }));
    toast.success("Broker list exported");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Partners"
        title="Brokers & Shippers"
        sub="Credit terms, contacts and receivables exposure per customer."
        actions={
          <>
            <button className="btn btn-ghost" onClick={exportCsv}><Download size={14} /> Export CSV</button>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Add Broker</button>
          </>
        }
      />

      <div className="rise grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Broker partners", value: String(kpis.count), icon: Building2 },
          { label: "Delivered revenue", value: fmtMoney(kpis.revenue), icon: Landmark, mono: true },
          { label: "Open receivables", value: fmtMoney(kpis.openAR), icon: Clock, mono: true, warn: kpis.openAR > 0 },
          { label: "Avg payment terms", value: `Net ${kpis.avgTerms}`, icon: Clock },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3.5 p-4">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", s.warn ? "border-amber-400/25 bg-amber-400/10 text-amber-400" : "border-white/[0.07] bg-white/[0.03] text-zinc-400")}>
              <s.icon size={17} />
            </span>
            <div>
              <div className={cn("text-[17px] font-bold leading-tight text-zinc-50", s.mono && "mono")}>{s.value}</div>
              <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-zinc-500">{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="rise overflow-hidden">
        {!brokers ? (
          <Loading />
        ) : brokers.length === 0 ? (
          <EmptyState icon={Building2} title="No brokers yet" hint="Add broker profiles to attach to loads and track receivables." />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Company</th><th>Authority</th><th>Contact</th><th>Terms</th>
                  <th className="text-right">Loads</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Open AR</th><th></th>
                </tr>
              </thead>
              <tbody>
                {brokers.map((b) => {
                  const roll = perBroker.get(b.id);
                  return (
                    <tr key={b.id} className="clickable" onClick={() => openEdit(b)}>
                      <td>
                        <div className="font-semibold text-zinc-100">{b.companyName}</div>
                        <div className="text-[11px] text-zinc-600">{b.contactName || "—"}</div>
                      </td>
                      <td>
                        <div className="mono text-[12px] text-zinc-300">{b.mcNumber || "—"}</div>
                        <div className="mono text-[10.5px] text-zinc-600">DOT {b.dotNumber || "—"}</div>
                      </td>
                      <td className="text-[12px]">
                        <div className="text-zinc-400">{b.phone || "—"}</div>
                        <div className="text-zinc-600">{b.email}</div>
                      </td>
                      <td><Pill tone={b.paymentTermsDays <= 10 ? "emerald" : b.paymentTermsDays <= 30 ? "sky" : "amber"}>Net {b.paymentTermsDays}</Pill></td>
                      <td className="mono text-right text-zinc-400">{roll?.loads ?? 0}</td>
                      <td className="mono text-right font-semibold text-zinc-200">{fmtMoney(roll?.revenue ?? 0)}</td>
                      <td className={cn("mono text-right", (roll?.openAR ?? 0) > 0 ? "font-semibold text-amber-300" : "text-zinc-600")}>
                        {fmtMoney(roll?.openAR ?? 0)}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openEdit(b); }} aria-label="Edit"><Pencil size={14} /></button>
                        <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); setDeleting(b); }} aria-label="Delete"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.companyName}` : "Add broker / shipper"}
        description="Terms drive AR aging on the factoring pipeline."
        wide
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Company name" className="sm:col-span-2"><input className="input" value={form.companyName} onChange={set("companyName")} placeholder="BlueRidge Logistics" /></Field>
          <Field label="MC number"><input className="input mono" value={form.mcNumber} onChange={set("mcNumber")} placeholder="MC-000000" /></Field>
          <Field label="DOT number"><input className="input mono" value={form.dotNumber} onChange={set("dotNumber")} placeholder="0000000" /></Field>
          <Field label="AP / Ops contact"><input className="input" value={form.contactName} onChange={set("contactName")} placeholder="Hannah Boyd" /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={set("phone")} placeholder="(555) 010-2233" /></Field>
          <Field label="Billing email"><input className="input" value={form.email} onChange={set("email")} placeholder="ap@broker.com" /></Field>
          <Field label="Payment terms (days)" hint="QuickPay ≈ 1–7 · Standard Net 30">
            <input className="input mono" type="number" min="0" max="120" value={form.paymentTermsDays} onChange={set("paymentTermsDays")} />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.companyName.trim()}>
            {saving && <Spinner />} {editing ? "Save changes" : "Add broker"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={`Remove ${deleting?.companyName}?`}
        message="Loads associated with this broker will remain but show an unattached customer."
        busy={deleteBusy}
        confirmLabel="Remove"
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
