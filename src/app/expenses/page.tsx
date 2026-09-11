"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Fuel, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { EXPENSE_CATEGORIES } from "@/lib/finance";
import type { ExpenseRow, TruckRow } from "@/lib/types";
import { cn, fmtDate, fmtMoney, num, statusLabel } from "@/lib/util";
import { Card, ConfirmDialog, EmptyState, Field, Loading, Modal, PageHeader, Pill, SectionHead, Spinner } from "@/components/ui";
import { CATEGORY_COLORS, ExpenseDonut, LegendItem } from "@/components/charts";
import { useToast } from "@/components/toast";

type FormState = Record<string, string>;
const BLANK: FormState = {
  expenseDate: new Date().toISOString().slice(0, 10), category: "fuel",
  amount: "", description: "", truckId: "",
};

const CAT_TONES: Record<string, "amber" | "violet" | "sky" | "orange" | "zinc" | "emerald" | "rose"> = {
  fuel: "amber", insurance: "violet", ifta: "sky", permits: "orange",
  office: "zinc", tolls: "emerald", other: "zinc",
};

export default function ExpensesPage() {
  const toast = useToast();
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    const [e, t] = await Promise.all([
      api<ExpenseRow[]>("/api/expenses"),
      api<TruckRow[]>("/api/trucks"),
    ]);
    setExpenses(e);
    setTrucks(t);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load, toast]);

  const filtered = useMemo(() => {
    if (!expenses) return [];
    return category === "all" ? expenses : expenses.filter((e) => e.category === category);
  }, [expenses, category]);

  const byCategory = useMemo(() => {
    if (!expenses) return [];
    const m = new Map<string, number>();
    expenses.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + num(e.amount)));
    return [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const kpis = useMemo(() => {
    if (!expenses) return { total: 0, month: 0, top: "—", count: 0 };
    const monthKey = new Date().toISOString().slice(0, 7);
    return {
      total: expenses.reduce((s, e) => s + num(e.amount), 0),
      month: expenses.filter((e) => e.expenseDate.startsWith(monthKey)).reduce((s, e) => s + num(e.amount), 0),
      top: byCategory[0] ? statusLabel(byCategory[0].category) : "—",
      count: expenses.length,
    };
  }, [expenses, byCategory]);

  const openCreate = () => { setEditing(null); setForm(BLANK); setModalOpen(true); };
  const openEdit = (e: ExpenseRow) => {
    setEditing(e);
    setForm({
      expenseDate: e.expenseDate, category: e.category, amount: String(num(e.amount)),
      description: e.description, truckId: e.truckId ?? "",
    });
    setModalOpen(true);
  };
  const set = (k: string) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: ev.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/expenses/${editing.id}`, { method: "PATCH", body: form });
        toast.success("Expense updated");
      } else {
        await api("/api/expenses", { method: "POST", body: form });
        toast.success("Expense recorded");
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
      await api(`/api/expenses/${deleting.id}`, { method: "DELETE" });
      toast.success("Expense deleted");
      setDeleting(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const exportCsv = () => {
    downloadCsv("ironhaul_expenses.csv", filtered.map((e) => ({
      Date: e.expenseDate, Category: statusLabel(e.category),
      Description: e.description, Unit: e.truckUnit ?? "",
      "Amount (USD)": num(e.amount).toFixed(2),
    })));
    toast.success("Expense ledger exported");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Ledger"
        title="Expenses"
        sub="Categorized operational costs — fuel, insurance, IFTA, permits, tolls and office."
        actions={
          <>
            <button className="btn btn-ghost" onClick={exportCsv}><Download size={14} /> Export CSV</button>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Record Expense</button>
          </>
        }
      />

      <div className="rise grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total expenses", value: fmtMoney(kpis.total), icon: Receipt, mono: true },
          { label: "This month", value: fmtMoney(kpis.month), icon: Receipt, mono: true },
          { label: "Top category", value: kpis.top, icon: Fuel },
          { label: "Ledger entries", value: String(kpis.count), icon: Receipt },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3.5 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-zinc-400">
              <s.icon size={17} />
            </span>
            <div>
              <div className={cn("text-[17px] font-bold leading-tight text-zinc-50", s.mono && "mono")}>{s.value}</div>
              <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-zinc-500">{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ------------------------------- Table ----------------------------- */}
        <Card className="rise overflow-hidden xl:col-span-2">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.05] px-4 py-3">
            {[{ value: "all", label: "All" }, ...EXPENSE_CATEGORIES].map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-all",
                  category === c.value ? "bg-amber-400/15 text-amber-300" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          {!expenses ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Receipt} title="No expenses" hint="Record operational costs to keep the P&L honest." />
          ) : (
            <div className="max-h-[560px] overflow-y-auto overflow-x-auto">
              <table className="tbl">
                <thead className="sticky top-0">
                  <tr><th>Date</th><th>Category</th><th>Description</th><th>Unit</th><th className="text-right">Amount</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="clickable" onClick={() => openEdit(e)}>
                      <td className="whitespace-nowrap text-zinc-400">{fmtDate(e.expenseDate)}</td>
                      <td><Pill tone={CAT_TONES[e.category] ?? "zinc"}>{statusLabel(e.category)}</Pill></td>
                      <td className="max-w-[240px] truncate text-zinc-300">{e.description || "—"}</td>
                      <td className="mono text-zinc-500">{e.truckUnit ?? "—"}</td>
                      <td className="mono text-right font-semibold text-rose-300">{fmtMoney(e.amount)}</td>
                      <td className="whitespace-nowrap text-right">
                        <button className="icon-btn" onClick={(ev) => { ev.stopPropagation(); openEdit(e); }} aria-label="Edit"><Pencil size={14} /></button>
                        <button className="icon-btn danger" onClick={(ev) => { ev.stopPropagation(); setDeleting(e); }} aria-label="Delete"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ------------------------------ Breakdown --------------------------- */}
        <Card className="rise p-5">
          <SectionHead title="Category Breakdown" />
          <ExpenseDonut data={byCategory} size={230} />
          <div className="mt-4 space-y-2.5">
            {byCategory.map((c) => (
              <LegendItem
                key={c.category}
                color={CATEGORY_COLORS[c.category] ?? "#64748b"}
                label={statusLabel(c.category)}
                value={fmtMoney(c.amount)}
              />
            ))}
          </div>
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit expense" : "Record expense"}
        description="Amounts flow straight into operating expenses on the dashboard."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date"><input className="input" type="date" value={form.expenseDate} onChange={set("expenseDate")} /></Field>
          <Field label="Category">
            <select className="input" value={form.category} onChange={set("category")}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Amount (USD)"><input className="input mono" type="number" min="0" step="0.01" value={form.amount} onChange={set("amount")} placeholder="425.00" /></Field>
          <Field label="Attach to unit (optional)">
            <select className="input" value={form.truckId} onChange={set("truckId")}>
              <option value="">— Company-level —</option>
              {trucks.map((t) => <option key={t.id} value={t.id}>{t.unitNumber}</option>)}
            </select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <input className="input" value={form.description} onChange={set("description")} placeholder="Diesel — Loves #412, Indianapolis" />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.amount || !form.expenseDate}>
            {saving && <Spinner />} {editing ? "Save changes" : "Record"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete expense?"
        message={`This removes the ${deleting ? fmtMoney(deleting.amount) : ""} ${deleting?.category ?? ""} entry from the ledger and P&L.`}
        busy={deleteBusy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
