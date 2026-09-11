"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleCheck, Download, Pencil, Plus, Timer, Trash2, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { MaintenanceRow, TruckRow } from "@/lib/types";
import { cn, entityStatusTone, fmtDate, fmtMoney, num, statusLabel } from "@/lib/util";
import { Card, ConfirmDialog, EmptyState, Field, Loading, Modal, PageHeader, Pill, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";

type FormState = Record<string, string>;
const BLANK: FormState = {
  truckId: "", serviceDate: new Date().toISOString().slice(0, 10), repairType: "",
  description: "", cost: "", shop: "", status: "completed", odometer: "",
};

const REPAIR_SUGGESTIONS = [
  "PM service", "Brakes & drums", "Tire replacement", "A/C repair", "Electrical",
  "DOT inspection repair", "Cooling system", "Clutch / transmission", "Aftertreatment / DEF", "Suspension",
];

export default function MaintenancePage() {
  const toast = useToast();
  const [records, setRecords] = useState<MaintenanceRow[] | null>(null);
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRow | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MaintenanceRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    const [m, t] = await Promise.all([
      api<MaintenanceRow[]>("/api/maintenance"),
      api<TruckRow[]>("/api/trucks"),
    ]);
    setRecords(m);
    setTrucks(t);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load, toast]);

  const kpis = useMemo(() => {
    if (!records) return { total: 0, open: 0, completed: 0, avg: 0 };
    const open = records.filter((r) => r.status === "in_progress");
    return {
      total: records.reduce((s, r) => s + num(r.cost), 0),
      open: open.length,
      completed: records.length - open.length,
      avg: records.length ? records.reduce((s, r) => s + num(r.cost), 0) / records.length : 0,
    };
  }, [records]);

  const openCreate = () => { setEditing(null); setForm({ ...BLANK, truckId: trucks[0]?.id ?? "" }); setModalOpen(true); };
  const openEdit = (r: MaintenanceRow) => {
    setEditing(r);
    setForm({
      truckId: r.truckId ?? "", serviceDate: r.serviceDate, repairType: r.repairType,
      description: r.description, cost: String(num(r.cost)), shop: r.shop,
      status: r.status, odometer: r.odometer ? String(r.odometer) : "",
    });
    setModalOpen(true);
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/maintenance/${editing.id}`, { method: "PATCH", body: form });
        toast.success("Service record updated");
      } else {
        await api("/api/maintenance", { method: "POST", body: form });
        toast.success("Service record logged");
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
      await api(`/api/maintenance/${deleting.id}`, { method: "DELETE" });
      toast.success("Record deleted");
      setDeleting(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const exportCsv = () => {
    if (!records) return;
    downloadCsv("ironhaul_maintenance.csv", records.map((r) => ({
      Date: r.serviceDate, Unit: r.truckUnit ?? "", "Repair Type": r.repairType,
      Description: r.description, Shop: r.shop, Odometer: r.odometer ?? "",
      "Cost (USD)": num(r.cost).toFixed(2), Status: statusLabel(r.status),
    })));
    toast.success("Maintenance log exported");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Fleet Health"
        title="Maintenance"
        sub="Work orders, repair history and downtime per unit — maintenance spend feeds the P&L."
        actions={
          <>
            <button className="btn btn-ghost" onClick={exportCsv}><Download size={14} /> Export CSV</button>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Log Service</button>
          </>
        }
      />

      <div className="rise grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total spend", value: fmtMoney(kpis.total), icon: Wrench, mono: true },
          { label: "Units down now", value: String(kpis.open), icon: Timer, warn: kpis.open > 0 },
          { label: "Jobs completed", value: String(kpis.completed), icon: CircleCheck },
          { label: "Avg cost / repair", value: fmtMoney(kpis.avg), icon: Wrench, mono: true },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3.5 p-4">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", s.warn ? "border-rose-400/25 bg-rose-400/10 text-rose-400" : "border-white/[0.07] bg-white/[0.03] text-zinc-400")}>
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
        {!records ? (
          <Loading />
        ) : records.length === 0 ? (
          <EmptyState icon={Wrench} title="No service records" hint="Log repairs and PM services to track downtime and cost per unit." />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th><th>Unit</th><th>Repair</th><th>Shop</th>
                  <th className="text-right">Odometer</th>
                  <th className="text-right">Cost</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => openEdit(r)}>
                    <td className="whitespace-nowrap text-zinc-400">{fmtDate(r.serviceDate)}</td>
                    <td className="mono font-bold text-amber-300">{r.truckUnit ?? "—"}</td>
                    <td>
                      <div className="font-medium text-zinc-200">{r.repairType}</div>
                      {r.description && <div className="max-w-[280px] truncate text-[11px] text-zinc-600">{r.description}</div>}
                    </td>
                    <td className="max-w-[180px] truncate text-zinc-400">{r.shop || "—"}</td>
                    <td className="mono text-right text-zinc-500">{r.odometer ? r.odometer.toLocaleString() : "—"}</td>
                    <td className="mono text-right font-semibold text-rose-300">{fmtMoney(r.cost)}</td>
                    <td><Pill tone={r.status === "in_progress" ? "rose" : "emerald"}>{statusLabel(r.status)}</Pill></td>
                    <td className="whitespace-nowrap text-right">
                      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openEdit(r); }} aria-label="Edit"><Pencil size={14} /></button>
                      <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); setDeleting(r); }} aria-label="Delete"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit service record" : "Log service"}
        description="Marking a record “In progress” counts the unit as down."
        wide
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Unit">
            <select className="input" value={form.truckId} onChange={set("truckId")}>
              <option value="">— Select unit —</option>
              {trucks.map((t) => <option key={t.id} value={t.id}>{t.unitNumber} · {t.make} {t.model}</option>)}
            </select>
          </Field>
          <Field label="Service date"><input className="input" type="date" value={form.serviceDate} onChange={set("serviceDate")} /></Field>
          <Field label="Repair type">
            <input className="input" list="repair-types" value={form.repairType} onChange={set("repairType")} placeholder="PM service" />
            <datalist id="repair-types">
              {REPAIR_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </Field>
          <Field label="Mechanic / Shop"><input className="input" value={form.shop} onChange={set("shop")} placeholder="Rush Truck Center — Columbus, OH" /></Field>
          <Field label="Cost (USD)"><input className="input mono" type="number" min="0" step="0.01" value={form.cost} onChange={set("cost")} placeholder="850.00" /></Field>
          <Field label="Odometer (mi)"><input className="input mono" type="number" min="0" value={form.odometer} onChange={set("odometer")} placeholder="412,300" /></Field>
          <Field label="Status">
            <select className="input" value={form.status} onChange={set("status")}>
              <option value="in_progress">In progress — unit down</option>
              <option value="completed">Completed</option>
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea className="input min-h-[56px] resize-y" value={form.description} onChange={set("description")} placeholder="Parts replaced, warranty info…" />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.repairType.trim() || !form.serviceDate}>
            {saving && <Spinner />} {editing ? "Save changes" : "Log service"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete service record?"
        message={`This removes the ${deleting?.repairType ?? ""} record for ${deleting?.truckUnit ?? "the unit"} and its cost from the P&L.`}
        busy={deleteBusy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
