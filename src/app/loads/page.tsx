"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Container,
  Download,
  Landmark,
  Pencil,
  Plus,
  Search,
  Trash2,
  TruckIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { calcLoadPay, factoringNet } from "@/lib/finance";
import type { BrokerRow, DriverRow, LoadRow, TruckRow } from "@/lib/types";
import {
  bolTone,
  cn,
  factoringTone,
  fmtDate,
  fmtMoney,
  fmtNumber,
  loadStatusTone,
  num,
  statusLabel,
  todayIso,
} from "@/lib/util";
import {
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Pill,
  Spinner,
} from "@/components/ui";
import { useToast } from "@/components/toast";

type FormState = Record<string, string>;

const BLANK: FormState = {
  loadNumber: "",
  brokerId: "",
  driverId: "",
  truckId: "",
  pickupLocation: "",
  deliveryLocation: "",
  miles: "",
  rate: "",
  dispatchDate: todayIso(),
  deliveryDate: "",
  status: "booked",
  bolNumber: "",
  bolDocUrl: "",
  bolStatus: "pending",
  factoringStatus: "not_submitted",
  factoringFeePct: "2.75",
  notes: "",
};

const STATUS_FILTERS = ["all", "booked", "in_transit", "delivered"] as const;

export default function LoadsPage() {
  const toast = useToast();
  const [loads, setLoads] = useState<LoadRow[] | null>(null);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LoadRow | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<LoadRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    const [l, d, t, b] = await Promise.all([
      api<LoadRow[]>("/api/loads"),
      api<DriverRow[]>("/api/drivers"),
      api<TruckRow[]>("/api/trucks"),
      api<BrokerRow[]>("/api/brokers"),
    ]);
    setLoads(l);
    setDrivers(d);
    setTrucks(t);
    setBrokers(b);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load, toast]);

  const nextLoadNumber = useMemo(() => {
    if (!loads) return "LD-0001";
    const max = loads.reduce((m, l) => {
      const n = parseInt(l.loadNumber.replace(/\D/g, ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 2400);
    return `LD-${max + 1}`;
  }, [loads]);

  const filtered = useMemo(() => {
    if (!loads) return [];
    const q = search.trim().toLowerCase();
    return loads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return [
        l.loadNumber, l.brokerName, l.driverName, l.truckUnit,
        l.pickupLocation, l.deliveryLocation, l.bolNumber,
      ].some((v) => v?.toLowerCase().includes(q));
    });
  }, [loads, search, statusFilter]);

  const totals = useMemo(() => {
    const list = filtered;
    return {
      count: list.length,
      gross: list.reduce((s, l) => s + num(l.rate), 0),
      rolling: list.filter((l) => l.status === "in_transit").length,
      unsubmitted: list
        .filter((l) => l.status === "delivered" && l.factoringStatus === "not_submitted")
        .reduce((s, l) => s + num(l.rate), 0),
    };
  }, [filtered]);

  /* ------------------------------ Modal logic ----------------------------- */
  const openCreate = () => {
    setEditing(null);
    setForm({ ...BLANK, loadNumber: nextLoadNumber, dispatchDate: todayIso() });
    setModalOpen(true);
  };
  const openEdit = (l: LoadRow) => {
    setEditing(l);
    setForm({
      loadNumber: l.loadNumber,
      brokerId: l.brokerId ?? "",
      driverId: l.driverId ?? "",
      truckId: l.truckId ?? "",
      pickupLocation: l.pickupLocation,
      deliveryLocation: l.deliveryLocation,
      miles: String(l.miles),
      rate: String(num(l.rate)),
      dispatchDate: l.dispatchDate ?? "",
      deliveryDate: l.deliveryDate ?? "",
      status: l.status,
      bolNumber: l.bolNumber,
      bolDocUrl: l.bolDocUrl,
      bolStatus: l.bolStatus,
      factoringStatus: l.factoringStatus,
      factoringFeePct: String(num(l.factoringFeePct)),
      notes: l.notes,
    });
    setModalOpen(true);
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const selectedDriver = drivers.find((d) => d.id === form.driverId);
  const estPay = selectedDriver
    ? calcLoadPay(selectedDriver.payType, selectedDriver.payRate, form.rate || 0, form.miles || 0)
    : 0;
  const factor = factoringNet(form.rate || 0, form.factoringFeePct || 0);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) {
        await api(`/api/loads/${editing.id}`, { method: "PATCH", body: payload });
        toast.success(`${form.loadNumber} updated`);
      } else {
        await api("/api/loads", { method: "POST", body: payload });
        toast.success(`${form.loadNumber} booked`);
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
      await api(`/api/loads/${deleting.id}`, { method: "DELETE" });
      toast.success(`${deleting.loadNumber} deleted`);
      setDeleting(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const exportCsv = () => {
    downloadCsv("ironhaul_loads.csv", filtered.map((l) => ({
      "Load #": l.loadNumber, Broker: l.brokerName ?? "", Driver: l.driverName ?? "",
      Truck: l.truckUnit ?? "", Pickup: l.pickupLocation, Delivery: l.deliveryLocation,
      Miles: l.miles, "Rate (USD)": num(l.rate).toFixed(2),
      "Dispatch Date": l.dispatchDate ?? "", "Delivery Date": l.deliveryDate ?? "",
      Status: statusLabel(l.status), "BOL #": l.bolNumber, "BOL Status": statusLabel(l.bolStatus),
      "BOL Document": l.bolDocUrl, "Factoring Status": statusLabel(l.factoringStatus),
      "Factor Fee %": num(l.factoringFeePct).toFixed(2),
      "Expected Net (USD)": factoringNet(l.rate, l.factoringFeePct).net.toFixed(2),
      Notes: l.notes,
    })));
    toast.success("Loads exported to CSV");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Dispatch"
        title="Loads & BOLs"
        sub="Every load from booking to proof-of-delivery, with billing status attached."
        actions={
          <>
            <button className="btn btn-ghost" onClick={exportCsv}><Download size={14} /> Export CSV</button>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Book Load</button>
          </>
        }
      />

      {/* ------------------------------ KPI strip ---------------------------- */}
      <div className="rise grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Loads in view", value: String(totals.count), icon: Container },
          { label: "Booked value", value: fmtMoney(totals.gross), icon: Landmark, mono: true },
          { label: "Rolling now", value: String(totals.rolling), icon: TruckIcon },
          { label: "AR not submitted", value: fmtMoney(totals.unsubmitted), icon: Search, mono: true, warn: totals.unsubmitted > 0 },
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

      {/* ------------------------------- Filters ----------------------------- */}
      <div className="rise flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            className="input pl-9"
            placeholder="Search load #, broker, driver, city, BOL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12px] font-semibold capitalize transition-all",
                statusFilter === s ? "bg-amber-400/15 text-amber-300" : "text-zinc-500 hover:text-zinc-200",
              )}
            >
              {s === "all" ? "All" : statusLabel(s)}
            </button>
          ))}
        </div>
      </div>

      {/* -------------------------------- Table ------------------------------ */}
      <Card className="rise overflow-hidden">
        {!loads ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Container} title="No loads match" hint="Adjust filters, or book a new load to get rolling." />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Load</th><th>Broker / Customer</th><th>Driver</th><th>Unit</th>
                  <th>Route</th><th className="text-right">Miles</th>
                  <th className="text-right">Rate</th><th>Dates</th>
                  <th>BOL</th><th>Factoring</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="clickable" onClick={() => openEdit(l)}>
                    <td className="mono font-semibold text-zinc-100">{l.loadNumber}</td>
                    <td className="max-w-[170px]">
                      <div className="truncate font-medium text-zinc-200">{l.brokerName ?? "—"}</div>
                      {l.brokerTerms != null && (
                        <div className="text-[10.5px] text-zinc-600">Net {l.brokerTerms}</div>
                      )}
                    </td>
                    <td className="max-w-[130px] truncate">{l.driverName ?? <span className="text-zinc-600">Unassigned</span>}</td>
                    <td className="mono text-zinc-400">{l.truckUnit ?? "—"}</td>
                    <td className="max-w-[230px]">
                      <div className="truncate text-zinc-300">{l.pickupLocation}</div>
                      <div className="truncate text-[11px] text-zinc-600">→ {l.deliveryLocation}</div>
                    </td>
                    <td className="mono text-right text-zinc-400">{fmtNumber(l.miles)}</td>
                    <td className="mono text-right font-semibold text-amber-300">{fmtMoney(l.rate)}</td>
                    <td className="whitespace-nowrap text-[11.5px] text-zinc-500">
                      {fmtDate(l.dispatchDate)}<br />
                      <span className="text-zinc-400">{fmtDate(l.deliveryDate)}</span>
                    </td>
                    <td>
                      <Pill tone={bolTone(l.bolStatus)}>{statusLabel(l.bolStatus)}</Pill>
                      {l.bolNumber && <div className="mono mt-1 text-[10px] text-zinc-600">{l.bolNumber}</div>}
                    </td>
                    <td>
                      <Pill tone={factoringTone(l.factoringStatus)}>{statusLabel(l.factoringStatus)}</Pill>
                      {l.factoringStatus !== "not_submitted" && l.factoringStatus !== "rejected" && (
                        <div className="mono mt-1 text-[10px] text-zinc-600">
                          net {fmtMoney(factoringNet(l.rate, l.factoringFeePct).net)}
                        </div>
                      )}
                    </td>
                    <td><Pill tone={loadStatusTone(l.status)}>{statusLabel(l.status)}</Pill></td>
                    <td className="whitespace-nowrap text-right">
                      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); openEdit(l); }} aria-label="Edit"><Pencil size={14} /></button>
                      <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); setDeleting(l); }} aria-label="Delete"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ------------------------------ Edit modal --------------------------- */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.loadNumber}` : "Book a load"}
        description={editing ? "Update dispatch, billing and document status." : "New freight — route, rate, paperwork."}
        wide
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Load ID"><input className="input mono" value={form.loadNumber} onChange={set("loadNumber")} placeholder="LD-2451" /></Field>
          <Field label="Status">
            <select className="input" value={form.status} onChange={set("status")}>
              <option value="booked">Booked</option>
              <option value="in_transit">In Transit</option>
              <option value="delivered">Delivered</option>
            </select>
          </Field>
          <Field label="Broker / Shipper">
            <select className="input" value={form.brokerId} onChange={set("brokerId")}>
              <option value="">— Select broker —</option>
              {brokers.map((b) => <option key={b.id} value={b.id}>{b.companyName}</option>)}
            </select>
          </Field>
          <Field label="Driver">
            <select className="input" value={form.driverId} onChange={set("driverId")}>
              <option value="">— Unassigned —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id} disabled={d.status !== "active"}>
                  {d.name}{d.status !== "active" ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Truck / Unit">
            <select className="input" value={form.truckId} onChange={set("truckId")}>
              <option value="">— Unassigned —</option>
              {trucks.map((t) => (
                <option key={t.id} value={t.id} disabled={t.status === "inactive"}>
                  {t.unitNumber} · {t.make} {t.model}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rate (USD)"><input className="input mono" type="number" min="0" step="0.01" value={form.rate} onChange={set("rate")} placeholder="2400.00" /></Field>
          <Field label="Pickup location"><input className="input" value={form.pickupLocation} onChange={set("pickupLocation")} placeholder="Chicago, IL" /></Field>
          <Field label="Delivery location"><input className="input" value={form.deliveryLocation} onChange={set("deliveryLocation")} placeholder="Dallas, TX" /></Field>
          <Field label="Dispatch date"><input className="input" type="date" value={form.dispatchDate} onChange={set("dispatchDate")} /></Field>
          <Field label="Delivery date"><input className="input" type="date" value={form.deliveryDate} onChange={set("deliveryDate")} /></Field>
          <Field label="Loaded miles"><input className="input mono" type="number" min="0" value={form.miles} onChange={set("miles")} placeholder="920" /></Field>
          <div />

          <div className="sm:col-span-2 mt-1 border-t border-white/[0.06] pt-4">
            <div className="mono mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Bill of Lading</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="BOL number"><input className="input mono" value={form.bolNumber} onChange={set("bolNumber")} placeholder="BOL-89413" /></Field>
              <Field label="BOL status">
                <select className="input" value={form.bolStatus} onChange={set("bolStatus")}>
                  <option value="pending">Pending</option>
                  <option value="delivered">Delivered</option>
                  <option value="signed">Signed / Received</option>
                </select>
              </Field>
              <Field label="Document link"><input className="input" value={form.bolDocUrl} onChange={set("bolDocUrl")} placeholder="https://…/pod.pdf" /></Field>
            </div>
          </div>

          <div className="sm:col-span-2 border-t border-white/[0.06] pt-4">
            <div className="mono mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Factoring</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Factoring status">
                <select className="input" value={form.factoringStatus} onChange={set("factoringStatus")}>
                  <option value="not_submitted">Not Submitted</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="funded">Funded</option>
                  <option value="rejected">Rejected</option>
                </select>
              </Field>
              <Field label="Factor fee (%)" hint="Typical 1.5% – 3.5% of invoice face value">
                <input className="input mono" type="number" min="0" max="15" step="0.05" value={form.factoringFeePct} onChange={set("factoringFeePct")} />
              </Field>
            </div>
          </div>

          <Field label="Dispatch notes" className="sm:col-span-2">
            <textarea className="input min-h-[64px] resize-y" value={form.notes} onChange={set("notes")} placeholder="Detention, appointment refs, accessorials…" />
          </Field>
        </div>

        {/* live economics strip */}
        <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3.5">
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.18em] text-amber-500/80">Est. driver pay</div>
            <div className="mono text-[15px] font-bold text-amber-300">{selectedDriver ? fmtMoney(estPay, true) : "—"}</div>
          </div>
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.18em] text-amber-500/80">Factor fee</div>
            <div className="mono text-[15px] font-bold text-amber-300">{fmtMoney(factor.fee, true)}</div>
          </div>
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.18em] text-amber-500/80">Net payout</div>
            <div className="mono text-[15px] font-bold text-amber-300">{fmtMoney(factor.net, true)}</div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.loadNumber.trim()}>
            {saving && <Spinner />} {editing ? "Save changes" : "Book load"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.loadNumber}?`}
        message="This removes the load record and detaches it from any settlement lines. BOL references will be lost. This cannot be undone."
        busy={deleteBusy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
