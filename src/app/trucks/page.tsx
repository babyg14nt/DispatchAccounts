"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Container, Download, Pencil, Plus, Trash2, Truck, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { MaintenanceRow, TruckRow } from "@/lib/types";
import { cn, entityStatusTone, fmtMoney, num, statusLabel } from "@/lib/util";
import { Card, ConfirmDialog, EmptyState, Field, Loading, Modal, PageHeader, Pill, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";

type FormState = Record<string, string>;
const BLANK: FormState = {
  unitNumber: "", equipmentType: "truck", make: "", model: "", year: String(new Date().getFullYear()),
  vin: "", status: "active",
};

export default function TrucksPage() {
  const toast = useToast();
  const [trucks, setTrucks] = useState<TruckRow[] | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TruckRow | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TruckRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    const [t, m] = await Promise.all([
      api<TruckRow[]>("/api/trucks"),
      api<MaintenanceRow[]>("/api/maintenance"),
    ]);
    setTrucks(t);
    setMaintenance(m);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load, toast]);

  const maintByTruck = useMemo(() => {
    const m = new Map<string, { total: number; open: number }>();
    maintenance.forEach((r) => {
      if (!r.truckId) return;
      const cur = m.get(r.truckId) ?? { total: 0, open: 0 };
      cur.total += num(r.cost);
      if (r.status === "in_progress") cur.open += 1;
      m.set(r.truckId, cur);
    });
    return m;
  }, [maintenance]);

  const kpis = useMemo(() => {
    if (!trucks) return { units: 0, active: 0, inShop: 0, trailers: 0, maint: 0 };
    return {
      units: trucks.filter((t) => t.equipmentType === "truck").length,
      active: trucks.filter((t) => t.status === "active").length,
      inShop: trucks.filter((t) => t.status === "in_shop").length,
      trailers: trucks.filter((t) => t.equipmentType === "trailer").length,
      maint: maintenance.reduce((s, r) => s + num(r.cost), 0),
    };
  }, [trucks, maintenance]);

  const openCreate = () => { setEditing(null); setForm(BLANK); setModalOpen(true); };
  const openEdit = (t: TruckRow) => {
    setEditing(t);
    setForm({
      unitNumber: t.unitNumber, equipmentType: t.equipmentType, make: t.make,
      model: t.model, year: t.year ? String(t.year) : "", vin: t.vin, status: t.status,
    });
    setModalOpen(true);
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/trucks/${editing.id}`, { method: "PATCH", body: form });
        toast.success(`${form.unitNumber} updated`);
      } else {
        await api("/api/trucks", { method: "POST", body: form });
        toast.success(`${form.unitNumber} added to fleet`);
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
      await api(`/api/trucks/${deleting.id}`, { method: "DELETE" });
      toast.success(`${deleting.unitNumber} removed`);
      setDeleting(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const exportCsv = () => {
    if (!trucks) return;
    downloadCsv("ironhaul_fleet.csv", trucks.map((t) => ({
      "Unit #": t.unitNumber, Type: t.equipmentType, Make: t.make, Model: t.model,
      Year: t.year ?? "", VIN: t.vin, Status: statusLabel(t.status),
      "Lifetime Repair Cost (USD)": (maintByTruck.get(t.id)?.total ?? 0).toFixed(2),
    })));
    toast.success("Fleet exported");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Fleet"
        title="Trucks & Equipment"
        sub="Tractors and trailers with service status and lifetime repair cost per unit."
        actions={
          <>
            <button className="btn btn-ghost" onClick={exportCsv}><Download size={14} /> Export CSV</button>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Add Unit</button>
          </>
        }
      />

      <div className="rise grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: "Tractors", value: String(kpis.units), icon: Truck },
          { label: "Trailers", value: String(kpis.trailers), icon: Container },
          { label: "Active units", value: String(kpis.active), icon: Truck },
          { label: "In shop", value: String(kpis.inShop), icon: Wrench, warn: kpis.inShop > 0 },
          { label: "Lifetime repairs", value: fmtMoney(kpis.maint), icon: Wrench, mono: true },
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
        {!trucks ? (
          <Loading />
        ) : trucks.length === 0 ? (
          <EmptyState icon={Truck} title="No equipment yet" hint="Add your first tractor or trailer." />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Unit</th><th>Type</th><th>Equipment</th><th>VIN</th>
                  <th className="text-right">Repair history</th>
                  <th className="text-right">Lifetime cost</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {trucks.map((t) => {
                  const m = maintByTruck.get(t.id);
                  return (
                    <tr key={t.id} className="clickable" onClick={() => openEdit(t)}>
                      <td className="mono font-bold text-amber-300">{t.unitNumber}</td>
                      <td className="capitalize text-zinc-400">{t.equipmentType}</td>
                      <td>
                        <span className="font-medium text-zinc-200">{t.year ?? ""} {t.make}</span>{" "}
                        <span className="text-zinc-500">{t.model}</span>
                      </td>
                      <td className="mono text-[11.5px] text-zinc-500">{t.vin || "—"}</td>
                      <td className={cn("text-right text-[12px]", m?.open ? "font-semibold text-rose-300" : "text-zinc-400")}>
                        {m?.open ? `${m.open} work order${m.open > 1 ? "s" : ""} open` : "No open orders"}
                      </td>
                      <td className="mono text-right text-zinc-300">{fmtMoney(m?.total ?? 0)}</td>
                      <td><Pill tone={entityStatusTone(t.status)}>{statusLabel(t.status)}</Pill></td>
                      <td className="whitespace-nowrap text-right">
                        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openEdit(t); }} aria-label="Edit"><Pencil size={14} /></button>
                        <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); setDeleting(t); }} aria-label="Delete"><Trash2 size={14} /></button>
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
        title={editing ? `Edit ${editing.unitNumber}` : "Add unit"}
        description="Tractors and trailers share the same register."
        wide
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Unit number"><input className="input mono" value={form.unitNumber} onChange={set("unitNumber")} placeholder="T-108" /></Field>
          <Field label="Equipment type">
            <select className="input" value={form.equipmentType} onChange={set("equipmentType")}>
              <option value="truck">Truck / Tractor</option>
              <option value="trailer">Trailer</option>
            </select>
          </Field>
          <Field label="Make"><input className="input" value={form.make} onChange={set("make")} placeholder="Freightliner" /></Field>
          <Field label="Model"><input className="input" value={form.model} onChange={set("model")} placeholder="Cascadia" /></Field>
          <Field label="Year"><input className="input mono" type="number" min="1980" max="2100" value={form.year} onChange={set("year")} /></Field>
          <Field label="Status">
            <select className="input" value={form.status} onChange={set("status")}>
              <option value="active">Active</option>
              <option value="in_shop">In Shop</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="VIN" className="sm:col-span-2"><input className="input mono" value={form.vin} onChange={set("vin")} placeholder="17-character VIN" /></Field>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.unitNumber.trim()}>
            {saving && <Spinner />} {editing ? "Save changes" : "Add unit"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={`Remove ${deleting?.unitNumber}?`}
        message="Maintenance records for this unit will also be deleted. Loads assigned to this unit will become unassigned."
        busy={deleteBusy}
        confirmLabel="Remove"
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
