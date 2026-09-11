"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Download, Pencil, Plus, Trash2, UserCheck, Users, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { payStructureLabel } from "@/lib/finance";
import type { DeductionRow, DriverRow, SettlementRow } from "@/lib/types";
import { cn, entityStatusTone, fmtDate, fmtMoney, num, statusLabel } from "@/lib/util";
import { Card, ConfirmDialog, EmptyState, Field, Loading, Modal, PageHeader, Pill, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";

type FormState = Record<string, string>;
const BLANK: FormState = {
  name: "", phone: "", email: "", licenseNumber: "", licenseExpiry: "",
  payType: "percentage", payRate: "25", status: "active",
};

const PAY_RATE_LABELS: Record<string, string> = {
  percentage: "Pay rate (% of linehaul)",
  per_mile: "Pay rate ($ per mile)",
  flat: "Pay rate ($ per load)",
};

export default function DriversPage() {
  const toast = useToast();
  const [drivers, setDrivers] = useState<DriverRow[] | null>(null);
  const [deductions, setDeductions] = useState<DeductionRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DriverRow | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<DriverRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, ded, s] = await Promise.all([
      api<DriverRow[]>("/api/drivers"),
      api<DeductionRow[]>("/api/deductions"),
      api<SettlementRow[]>("/api/settlements"),
    ]);
    setDrivers(d);
    setDeductions(ded);
    setSettlements(s);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load, toast]);

  const openDeductionsByDriver = useMemo(() => {
    const m = new Map<string, number>();
    deductions.filter((d) => !d.settlementId).forEach((d) => {
      m.set(d.driverId, (m.get(d.driverId) ?? 0) + num(d.amount));
    });
    return m;
  }, [deductions]);

  const settledByDriver = useMemo(() => {
    const m = new Map<string, number>();
    settlements.forEach((s) => m.set(s.driverId, (m.get(s.driverId) ?? 0) + num(s.netPay)));
    return m;
  }, [settlements]);

  const kpis = useMemo(() => {
    if (!drivers) return { active: 0, roster: 0, openDed: 0, settled: 0 };
    return {
      active: drivers.filter((d) => d.status === "active").length,
      roster: drivers.length,
      openDed: deductions.filter((d) => !d.settlementId).reduce((s, d) => s + num(d.amount), 0),
      settled: settlements.reduce((s, x) => s + num(x.netPay), 0),
    };
  }, [drivers, deductions, settlements]);

  const openCreate = () => { setEditing(null); setForm(BLANK); setModalOpen(true); };
  const openEdit = (d: DriverRow) => {
    setEditing(d);
    setForm({
      name: d.name, phone: d.phone, email: d.email,
      licenseNumber: d.licenseNumber, licenseExpiry: d.licenseExpiry ?? "",
      payType: d.payType, payRate: String(num(d.payRate)), status: d.status,
    });
    setModalOpen(true);
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/drivers/${editing.id}`, { method: "PATCH", body: form });
        toast.success(`${form.name} updated`);
      } else {
        await api("/api/drivers", { method: "POST", body: form });
        toast.success(`${form.name} added to roster`);
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
      await api(`/api/drivers/${deleting.id}`, { method: "DELETE" });
      toast.success(`${deleting.name} removed`);
      setDeleting(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const exportCsv = () => {
    if (!drivers) return;
    downloadCsv("ironhaul_drivers.csv", drivers.map((d) => ({
      Name: d.name, Phone: d.phone, Email: d.email,
      "License #": d.licenseNumber, "License Expiry": d.licenseExpiry ?? "",
      "Pay Type": d.payType, "Pay Rate": num(d.payRate),
      "Open Deductions (USD)": (openDeductionsByDriver.get(d.id) ?? 0).toFixed(2),
      "Settled To Date (USD)": (settledByDriver.get(d.id) ?? 0).toFixed(2),
      Status: statusLabel(d.status),
    })));
    toast.success("Driver roster exported");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="People"
        title="Drivers"
        sub="Roster, CDL data and pay structures — the inputs the settlement engine runs on."
        actions={
          <>
            <button className="btn btn-ghost" onClick={exportCsv}><Download size={14} /> Export CSV</button>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Add Driver</button>
          </>
        }
      />

      <div className="rise grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Active drivers", value: String(kpis.active), icon: UserCheck },
          { label: "Total roster", value: String(kpis.roster), icon: Users },
          { label: "Open deductions", value: fmtMoney(kpis.openDed), icon: Wallet, mono: true, warn: kpis.openDed > 0 },
          { label: "Settled to date", value: fmtMoney(kpis.settled), icon: BadgeDollarSign, mono: true },
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
        {!drivers ? (
          <Loading />
        ) : drivers.length === 0 ? (
          <EmptyState icon={Users} title="No drivers yet" hint="Add your first driver to start dispatching loads." />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Driver</th><th>Contact</th><th>CDL</th><th>Pay structure</th>
                  <th className="text-right">Open deductions</th>
                  <th className="text-right">Settled to date</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => openEdit(d)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-gradient-to-br from-zinc-700/40 to-zinc-800/40 text-[11px] font-bold text-amber-300">
                          {d.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                        </span>
                        <span className="font-semibold text-zinc-100">{d.name}</span>
                      </div>
                    </td>
                    <td className="text-[12px]">
                      <div className="text-zinc-400">{d.phone || "—"}</div>
                      <div className="text-zinc-600">{d.email}</div>
                    </td>
                    <td>
                      <div className="mono text-[12px] text-zinc-300">{d.licenseNumber}</div>
                      <div className="text-[10.5px] text-zinc-600">exp {fmtDate(d.licenseExpiry)}</div>
                    </td>
                    <td className="font-medium text-sky-300">{payStructureLabel(d.payType, d.payRate)}</td>
                    <td className={cn("mono text-right", (openDeductionsByDriver.get(d.id) ?? 0) > 0 ? "text-amber-300" : "text-zinc-600")}>
                      {fmtMoney(openDeductionsByDriver.get(d.id) ?? 0)}
                    </td>
                    <td className="mono text-right font-semibold text-emerald-300">
                      {fmtMoney(settledByDriver.get(d.id) ?? 0)}
                    </td>
                    <td><Pill tone={entityStatusTone(d.status)}>{statusLabel(d.status)}</Pill></td>
                    <td className="whitespace-nowrap text-right">
                      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openEdit(d); }} aria-label="Edit"><Pencil size={14} /></button>
                      <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); setDeleting(d); }} aria-label="Delete"><Trash2 size={14} /></button>
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
        title={editing ? `Edit ${editing.name}` : "Add driver"}
        description="Pay structure here drives settlement calculations."
        wide
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name"><input className="input" value={form.name} onChange={set("name")} placeholder="Alex Rivera" /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={set("phone")} placeholder="(555) 010-2233" /></Field>
          <Field label="Email"><input className="input" value={form.email} onChange={set("email")} placeholder="driver@carrier.co" /></Field>
          <Field label="Status">
            <select className="input" value={form.status} onChange={set("status")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="CDL / License number"><input className="input mono" value={form.licenseNumber} onChange={set("licenseNumber")} placeholder="IL-DL-0000000" /></Field>
          <Field label="License expiry"><input className="input" type="date" value={form.licenseExpiry} onChange={set("licenseExpiry")} /></Field>
          <Field label="Pay structure">
            <select className="input" value={form.payType} onChange={set("payType")}>
              <option value="percentage">% of gross linehaul</option>
              <option value="per_mile">Per mile</option>
              <option value="flat">Flat per load</option>
            </select>
          </Field>
          <Field label={PAY_RATE_LABELS[form.payType]} hint="Preview: 25 → “25% of linehaul”">
            <input className="input mono" type="number" min="0" step={form.payType === "per_mile" ? "0.01" : "0.5"} value={form.payRate} onChange={set("payRate")} />
          </Field>
        </div>
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 text-[12.5px] text-zinc-400">
          Structure preview — <span className="font-semibold text-sky-300">{payStructureLabel(form.payType, form.payRate || 0)}</span>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim() || !form.licenseNumber.trim()}>
            {saving && <Spinner />} {editing ? "Save changes" : "Add driver"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={`Remove ${deleting?.name}?`}
        message="Drivers with settlement history cannot be deleted (mark them inactive instead). Loads assigned to this driver will become unassigned."
        busy={deleteBusy}
        confirmLabel="Remove"
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
