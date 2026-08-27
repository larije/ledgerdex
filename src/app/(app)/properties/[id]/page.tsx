"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Edit2, Save, X, Plus, Trash2, Paperclip,
  MessageSquare, CreditCard, Clock, FileText, Loader2, ExternalLink, Copy, Check,
  Bookmark, BookmarkCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Property, Remark, Payment, Attachment } from "@/types";
import {
  formatCurrency, formatDate, formatDateTime, formatFileSize,
  formatQuarter, getPaymentStatusColor, getPropertyTypeLabel,
  REMARK_COLORS, REMARK_LABELS,
} from "@/lib/utils";

export default function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [saving,  setSaving]    = useState(false);
  const [form,    setForm]      = useState<Partial<Property>>({});
  const [saveError, setSaveError] = useState("");

  // Modals
  const [payModal,    setPayModal]    = useState(false);
  const [remarkModal, setRemarkModal] = useState(false);
  const [attModal,    setAttModal]    = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedTD, setCopiedTD] = useState(false);
  const [pasteError, setPasteError] = useState("");
  const autoCopiedRef = useRef(false);

  // Edit payment
  const [editPayId,   setEditPayId]   = useState<string | null>(null);
  const [editPayForm, setEditPayForm] = useState({
    orNumber: "", paymentDate: "", amount: "", collector: "",
    year: "", quarter: "", notes: "",
  });

  const toggleChecked = async () => {
    const next = !property?.isChecked;
    setProperty((prev) => prev ? { ...prev, isChecked: next } : prev);
    await fetch(`/api/properties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isChecked: next }),
    });
  };

  const copyTdNumber = (tdNumber: string) => {
    navigator.clipboard.writeText(tdNumber);
    setCopiedTD(true);
    setTimeout(() => setCopiedTD(false), 1500);
  };

  const copyPaymentRow = (pay: Payment) => {
    const date = pay.paymentDate ? pay.paymentDate.slice(0, 10) : "";
    const amount = pay.amount != null ? Number(pay.amount) : "";
    // Format: notes | orNumber | date | collector | "" | "" | toYear | toQuarter | amount | 0
    const row = [
      pay.notes ?? "",
      pay.orNumber ?? "",
      date,
      pay.collector ?? "",
      "",
      "",
      pay.year ?? "",
      pay.quarter ?? "",
      amount,
      0,
    ].join("\t");
    navigator.clipboard.writeText(row);
    setCopiedId(pay.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const applyPasteText = useCallback((text: string) => {
    setPasteError("");
    const cols = text.trim().split("\t");
    // Format: notes | orNumber | date | collector | fromYear | fromQtr | toYear | toQtr | amount | penalty
    if (cols.length < 8) { setPasteError("Clipboard doesn't look like a payment row."); return; }
    const notes      = cols[0]?.trim() ?? "";
    const orNumber   = cols[1]?.trim() ?? "";
    const payDate    = cols[2]?.trim() ?? "";
    const collector  = cols[3]?.trim() ?? "";
    const year       = cols[6]?.trim() ?? "";
    const quarter    = cols[7]?.trim() ?? "";
    const amount     = cols[8]?.trim() ?? "";

    const toYear = parseInt(year);
    const currentYear = new Date().getFullYear();
    let paymentStatus = "PAID";
    if (!isNaN(toYear)) {
      if (toYear > currentYear)            paymentStatus = "ADVANCE";
      else if (toYear === currentYear)     paymentStatus = "PAID";
      else if (toYear === currentYear - 1) paymentStatus = "CURRENT";
      else                                 paymentStatus = "DELINQUENT";
    }

    setPayForm((f) => ({
      ...f,
      orNumber,
      paymentDate: payDate,
      collector,
      year,
      quarter,
      amount,
      notes,
      paymentStatus,
    }));
  }, []);

  // Ctrl+V anywhere in the modal auto-fills the form (no permission popup needed)
  useEffect(() => {
    if (!payModal) return;
    const handler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text");
      if (text) { e.preventDefault(); applyPasteText(text); }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [payModal, applyPasteText]);

  const pastePaymentRow = async () => {
    setPasteError("");
    try {
      const text = await navigator.clipboard.readText();
      applyPasteText(text);
    } catch {
      setPasteError("Could not read clipboard. Press Ctrl+V to paste.");
    }
  };

  const [statusSaving, setStatusSaving] = useState(false);

  const updatePaymentStatus = async (status: string) => {
    setStatusSaving(true);
    await fetch(`/api/properties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentStatus: status }),
    });
    await load();
    setStatusSaving(false);
  };

  const openEditPay = (pay: Payment) => {
    setEditPayForm({
      orNumber:    pay.orNumber    ?? "",
      paymentDate: pay.paymentDate ? pay.paymentDate.slice(0, 10) : "",
      amount:      pay.amount != null ? String(Number(pay.amount)) : "",
      collector:   pay.collector   ?? "",
      year:        pay.year        != null ? String(pay.year)    : "",
      quarter:     pay.quarter     != null ? String(pay.quarter) : "",
      notes:       pay.notes       ?? "",
    });
    setEditPayId(pay.id);
  };

  const saveEditPay = async () => {
    if (!editPayId) return;
    await fetch(`/api/properties/${id}/payments/${editPayId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editPayForm),
    });
    setEditPayId(null);
    load();
  };

  const deletePayment = async (paymentId: string) => {
    await fetch(`/api/properties/${id}/payments/${paymentId}`, { method: "DELETE" });
    load();
  };

  // Payment form
  const [payForm, setPayForm] = useState({
    orNumber: "", paymentDate: "", amount: "", collector: "",
    year: "", quarter: "", notes: "", paymentStatus: "PAID",
  });

  // Remark form
  const [remarkForm, setRemarkForm] = useState({ label: "FOR_VERIFICATION", text: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch(`/api/properties/${id}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setProperty(data.property ?? null);
    if (data.property) setForm(data.property);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoCopiedRef.current && property?.tdNumber && localStorage.getItem("prop_autoCopyTd") === "true") {
      navigator.clipboard.writeText(property.tdNumber).then(() => {
        setCopiedTD(true);
        setTimeout(() => setCopiedTD(false), 1500);
      }).catch(() => {/* browser blocked auto-copy without user gesture */});
      autoCopiedRef.current = true;
    }
  }, [property?.tdNumber]);

  const saveEdit = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSaveError(d.error ?? "Save failed. Please try again.");
        return;
      }
      setEditing(false);
      load();
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const submitPayment = async () => {
    const amount = parseFloat(payForm.amount);
    if (!isFinite(amount) || amount <= 0) {
      alert("Please enter a valid payment amount greater than zero.");
      return;
    }
    await fetch(`/api/properties/${id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payForm,
        amount,
        year:    payForm.year    ? parseInt(payForm.year)    : null,
        quarter: payForm.quarter ? parseInt(payForm.quarter) : null,
      }),
    });
    setPayModal(false);
    setPayForm({ orNumber: "", paymentDate: "", amount: "", collector: "", year: "", quarter: "", notes: "", paymentStatus: "PAID" });
    load();
  };

  const submitRemark = async () => {
    await fetch(`/api/properties/${id}/remarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(remarkForm),
    });
    setRemarkModal(false);
    setRemarkForm({ label: "FOR_VERIFICATION", text: "" });
    load();
  };

  const deleteRemark = async (remarkId: string) => {
    await fetch(`/api/properties/${id}/remarks`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remarkId }),
    });
    load();
  };

  const uploadAttachment = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    await fetch(`/api/properties/${id}/attachments`, { method: "POST", body: form });
    setAttModal(false);
    load();
  };

  const deleteAttachment = async (attachmentId: string) => {
    await fetch(`/api/properties/${id}/attachments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId }),
    });
    load();
  };

  const deleteProperty = async () => {
    await fetch(`/api/properties/${id}`, { method: "DELETE" });
    window.location.href = "/properties";
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-slate-400" />
    </div>
  );
  if (!property) return <p className="text-slate-500">Property not found.</p>;

  const p = property;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/properties" className="hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft size={14} /> Properties
        </Link>
        <span>/</span>
        <button
          onClick={() => copyTdNumber(p.tdNumber)}
          title="Copy TD Number"
          className="text-slate-800 font-mono font-medium flex items-center gap-1 hover:text-blue-600 transition-colors"
        >
          {p.tdNumber}
          {copiedTD ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="opacity-40" />}
        </button>
      </div>

      <PageHeader
        title={p.tdNumber}
        subtitle={p.propertyLocation ?? undefined}
        actions={
          editing ? (
            <>
              {saveError && (
                <span className="text-xs text-red-600 mr-2">{saveError}</span>
              )}
              <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setSaveError(""); }}>
                <X size={14} /> Cancel
              </Button>
              <Button size="sm" onClick={saveEdit} loading={saving}>
                <Save size={14} /> Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setDeleteModal(true)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                <Trash2 size={14} /> Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleChecked}
                title={p.isChecked ? "Mark as unchecked" : "Mark as checked"}
                className={p.isChecked ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-slate-500 hover:text-amber-600 hover:bg-amber-50"}
              >
                {p.isChecked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                {p.isChecked ? "Checked" : "Mark Checked"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <Edit2 size={14} /> Edit
              </Button>
              <Button size="sm" onClick={() => setPayModal(true)}>
                <CreditCard size={14} /> Record Payment
              </Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: property fields */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-700">Property Details</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {editing ? (
                  <>
                    <Input label="TD Number"          value={form.tdNumber ?? ""}           onChange={(e) => setForm({ ...form, tdNumber: e.target.value })} />
                    <Input label="Property Index No." value={form.propertyIndexNo ?? ""}    onChange={(e) => setForm({ ...form, propertyIndexNo: e.target.value })} />
                    <Input label="Property Location"  value={form.propertyLocation ?? ""}   onChange={(e) => setForm({ ...form, propertyLocation: e.target.value })} className="col-span-2" />
                    <Input label="Barangay"           value={form.barangay ?? ""}           onChange={(e) => setForm({ ...form, barangay: e.target.value })} />
                    <Input label="Municipality"       value={form.municipality ?? ""}       onChange={(e) => setForm({ ...form, municipality: e.target.value })} />
                    <Input label="Lot/Block No."      value={form.lotBlockNo ?? ""}         onChange={(e) => setForm({ ...form, lotBlockNo: e.target.value })} />
                    <Input label="Class"              value={form.class ?? ""}              onChange={(e) => setForm({ ...form, class: e.target.value })} />
                    <Select label="Type" value={form.type ?? ""} onChange={(e) => setForm({ ...form, type: e.target.value as Property["type"] })}>
                      {["LAND","BLDG","MACH","MISC"].map((t) => <option key={t} value={t}>{getPropertyTypeLabel(t as Property["type"])}</option>)}
                    </Select>
                    <Input label="Area (sqm)" type="number" value={form.area?.toString() ?? ""} onChange={(e) => setForm({ ...form, area: parseFloat(e.target.value) || undefined })} />
                    <Input label="Market Value" type="number" value={form.marketValue?.toString() ?? ""} onChange={(e) => setForm({ ...form, marketValue: parseFloat(e.target.value) || undefined })} />
                    <Input label="Assessed Value" type="number" value={form.assessedValue?.toString() ?? ""} onChange={(e) => setForm({ ...form, assessedValue: parseFloat(e.target.value) || undefined })} />
                    <Input label="Effectivity (Year)" type="number" value={form.effectivity?.toString() ?? ""} onChange={(e) => setForm({ ...form, effectivity: parseInt(e.target.value) || undefined })} />
                    <Select label="Taxability" value={form.taxability ?? "TAXABLE"} onChange={(e) => setForm({ ...form, taxability: e.target.value as Property["taxability"] })}>
                      <option value="TAXABLE">Taxable</option>
                      <option value="EXEMPT">Exempt</option>
                    </Select>
                    <Input label="Taxes Begin Year" type="number" value={form.taxesBeginYear?.toString() ?? ""} onChange={(e) => setForm({ ...form, taxesBeginYear: parseInt(e.target.value) || undefined })} />
                    <Select label="Taxes Begin Quarter" value={form.taxesBeginQuarter?.toString() ?? ""} onChange={(e) => setForm({ ...form, taxesBeginQuarter: parseInt(e.target.value) || undefined })}>
                      <option value="">—</option>
                      {[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}
                    </Select>
                    <Select label="Payment Status" value={form.paymentStatus ?? "UNPAID"} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value as Property["paymentStatus"] })}>
                      {["PAID","PARTIAL","UNPAID","DELINQUENT","ADVANCE","CURRENT"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">TD Number</p>
                      <button
                        onClick={() => copyTdNumber(p.tdNumber)}
                        title="Copy TD Number"
                        className="text-sm text-slate-800 mt-0.5 font-mono flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                      >
                        {p.tdNumber}
                        {copiedTD ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="opacity-40" />}
                      </button>
                    </div>
                    {[
                      ["Property Index No.", p.propertyIndexNo],
                      ["Property Location",  p.propertyLocation, "col-span-2"],
                      ["Barangay",           p.barangay],
                      ["Municipality",       p.municipality],
                      ["Lot/Block No.",      p.lotBlockNo],
                      ["Class",              p.class],
                      ["Type",               getPropertyTypeLabel(p.type)],
                      ["Area (sqm)",         p.area != null ? Number(p.area).toLocaleString() : "—"],
                      ["Market Value",       formatCurrency(p.marketValue as unknown as number)],
                      ["Assessed Value",     formatCurrency(p.assessedValue as unknown as number)],
                      ["Effectivity",        p.effectivity],
                    ].map(([label, value, span]) => (
                      <div key={label as string} className={span as string}>
                        <p className="text-xs text-slate-400 font-medium">{label}</p>
                        <p className="text-sm text-slate-800 mt-0.5 font-mono">{(value as string) ?? "—"}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tax & Payment Info */}
          <Card>
            <CardHeader><h3 className="text-sm font-semibold text-slate-700">Tax & Payment Status</h3></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Taxability</p>
                  <Badge variant={p.taxability === "TAXABLE" ? "info" : "default"} className="mt-1">{p.taxability}</Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Taxes Begin</p>
                  <p className="text-sm text-slate-800 mt-0.5">{formatQuarter(p.taxesBeginYear, p.taxesBeginQuarter)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Payment Status</p>
                  <div className="relative mt-1 inline-flex items-center gap-1">
                    <select
                      value={p.paymentStatus}
                      disabled={statusSaving}
                      onChange={(e) => updatePaymentStatus(e.target.value)}
                      className={`appearance-none pl-2.5 pr-6 py-1 rounded-full text-xs font-semibold border cursor-pointer disabled:opacity-60 ${getPaymentStatusColor(p.paymentStatus)}`}
                    >
                      {["PAID","PARTIAL","UNPAID","DELINQUENT","ADVANCE","CURRENT"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    {statusSaving
                      ? <Loader2 size={11} className="absolute right-1.5 animate-spin text-slate-400 pointer-events-none" />
                      : <svg className="absolute right-1.5 pointer-events-none text-current opacity-60" width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                    }
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Paid Up To</p>
                  <p className="text-sm text-slate-800 mt-0.5">{formatQuarter(p.paidUpToYear, p.paidUpToQuarter)}</p>
                </div>
                {p.document && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-400">Source Document</p>
                    <Link href={`/documents/${p.document.id}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                      <FileText size={13} /> {(p.document as { originalName?: string }).originalName ?? "View Document"}
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">
                  Payment History
                  <span className="ml-2 text-slate-400 font-normal">({p.payments?.length ?? 0})</span>
                </h3>
                <Button size="sm" variant="secondary" onClick={() => setPayModal(true)}>
                  <Plus size={13} /> Add
                </Button>
              </div>
            </CardHeader>
            {(!p.payments || p.payments.length === 0) ? (
              <CardContent>
                <p className="text-xs text-slate-400 text-center py-4">No payments recorded yet.</p>
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-100 text-slate-500 uppercase tracking-wide">
                      {["OR Number","Date","Amount","Year","Quarter","Notes",""].map((h) => (
                        <th key={h} className="text-left px-4 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {p.payments.map((pay: Payment) => (
                      <tr key={pay.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono font-medium text-slate-700">{pay.orNumber ?? "—"}</td>
                        <td className="px-4 py-2.5 text-slate-600">{pay.paymentDate ? formatDate(pay.paymentDate) : "—"}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{formatCurrency(pay.amount)}</td>
                        <td className="px-4 py-2.5 text-slate-600">{pay.year ?? "—"}</td>
                        <td className="px-4 py-2.5 text-slate-600">{pay.quarter ? `Q${pay.quarter}` : "—"}</td>
                        <td className="px-4 py-2.5 text-slate-500 max-w-[200px] truncate">{pay.notes ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            {editing ? (
                              <>
                                <button
                                  onClick={() => openEditPay(pay)}
                                  title="Edit payment"
                                  className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => deletePayment(pay.id)}
                                  title="Delete payment"
                                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => copyPaymentRow(pay)}
                                title="Copy row as tab-separated values"
                                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                              >
                                {copiedId === pay.id ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right: Remarks & Attachments */}
        <div className="space-y-5">
          {/* Remarks */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">
                  <MessageSquare size={14} className="inline mr-1.5" />
                  Remarks ({p.remarks?.length ?? 0})
                </h3>
                <Button size="sm" variant="secondary" onClick={() => setRemarkModal(true)}>
                  <Plus size={13} /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(!p.remarks || p.remarks.length === 0) && (
                <p className="text-xs text-slate-400 text-center py-2">No remarks yet.</p>
              )}
              {p.remarks?.map((r: Remark) => (
                <div key={r.id} className="rounded-lg border p-3 text-xs" style={{ borderColor: r.color + "40", background: r.color + "10" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs uppercase tracking-wide" style={{ color: r.color }}>
                      {REMARK_LABELS[r.label]}
                    </span>
                    <button onClick={() => deleteRemark(r.id)} className="text-slate-400 hover:text-red-500 transition">
                      <X size={12} />
                    </button>
                  </div>
                  <p className="text-slate-700 leading-relaxed">{r.text}</p>
                  <p className="text-slate-400 mt-1.5">{(r.createdBy as { name: string })?.name} · {formatDate(r.createdAt)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">
                  <Paperclip size={14} className="inline mr-1.5" />
                  Attachments ({p.attachments?.length ?? 0})
                </h3>
                <Button size="sm" variant="secondary" onClick={() => setAttModal(true)}>
                  <Plus size={13} /> Upload
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {(!p.attachments || p.attachments.length === 0) && (
                <p className="text-xs text-slate-400 text-center py-2">No attachments yet.</p>
              )}
              {p.attachments?.map((a: Attachment) => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="w-7 h-7 bg-blue-50 rounded flex items-center justify-center shrink-0">
                    <Paperclip size={12} className="text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{a.originalName}</p>
                    <p className="text-xs text-slate-400">{formatFileSize(a.fileSize)}</p>
                  </div>
                  <button onClick={() => deleteAttachment(a.id)} className="text-slate-400 hover:text-red-500">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Meta */}
          <Card>
            <CardContent className="space-y-2 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <Clock size={12} />
                <span>Created: {formatDateTime(p.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={12} />
                <span>Updated: {formatDateTime(p.updatedAt)}</span>
              </div>
              {p.isManualEntry && (
                <Badge variant="info" className="text-xs">Manual Entry</Badge>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Modal */}
      <Modal open={payModal} onClose={() => { setPayModal(false); setPasteError(""); }} title="Record Payment" size="lg">
        <div className="mb-4">
          <button
            onClick={pastePaymentRow}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition w-full justify-center"
          >
            <Copy size={12} /> Paste row from clipboard <span className="opacity-50 font-normal">(or Ctrl+V)</span>
          </button>
          {pasteError && <p className="text-xs text-red-500 mt-1 text-center">{pasteError}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="OR Number" placeholder="e.g. 0012345" value={payForm.orNumber} onChange={(e) => setPayForm({ ...payForm, orNumber: e.target.value })} />
          <Input label="Payment Date" type="date" value={payForm.paymentDate} onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} />
          <Input label="Amount (₱)" type="number" placeholder="0.00" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          <Input label="Year" type="number" placeholder="2024" value={payForm.year} onChange={(e) => setPayForm({ ...payForm, year: e.target.value })} />
          <Select label="Quarter" value={payForm.quarter} onChange={(e) => setPayForm({ ...payForm, quarter: e.target.value })} placeholder="Select quarter">
            {[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}
          </Select>
          <Select label="Update Payment Status" value={payForm.paymentStatus} onChange={(e) => setPayForm({ ...payForm, paymentStatus: e.target.value })} className="col-span-2">
            {["PAID","PARTIAL","UNPAID","DELINQUENT","ADVANCE","CURRENT"].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Textarea label="Notes" placeholder="Optional notes" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="col-span-2" />
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <Button variant="secondary" onClick={() => setPayModal(false)}>Cancel</Button>
          <Button onClick={submitPayment} disabled={!payForm.amount}>Save Payment</Button>
        </div>
      </Modal>

      {/* Remark Modal */}
      <Modal open={remarkModal} onClose={() => setRemarkModal(false)} title="Add Remark" size="md">
        <div className="space-y-4">
          <Select label="Label" value={remarkForm.label} onChange={(e) => setRemarkForm({ ...remarkForm, label: e.target.value })}>
            {Object.entries(REMARK_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
          <Textarea label="Remark Text" rows={4} placeholder="Enter remark…" value={remarkForm.text} onChange={(e) => setRemarkForm({ ...remarkForm, text: e.target.value })} />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setRemarkModal(false)}>Cancel</Button>
            <Button onClick={submitRemark} disabled={!remarkForm.text}>Save Remark</Button>
          </div>
        </div>
      </Modal>

      {/* Attachment Modal */}
      <Modal open={attModal} onClose={() => setAttModal(false)} title="Upload Attachment" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Upload supporting documents (Official Receipts, photos, etc.)</p>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 cursor-pointer hover:border-blue-400 transition">
            <Paperclip size={24} className="text-slate-400 mb-2" />
            <span className="text-sm text-slate-600">Click to choose a file</span>
            <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) uploadAttachment(e.target.files[0]); }} />
          </label>
          <Button variant="secondary" className="w-full" onClick={() => setAttModal(false)}>Cancel</Button>
        </div>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal open={!!editPayId} onClose={() => setEditPayId(null)} title="Edit Payment" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Input label="OR Number" placeholder="e.g. 0012345" value={editPayForm.orNumber} onChange={(e) => setEditPayForm({ ...editPayForm, orNumber: e.target.value })} />
          <Input label="Payment Date" type="date" value={editPayForm.paymentDate} onChange={(e) => setEditPayForm({ ...editPayForm, paymentDate: e.target.value })} />
          <Input label="Amount (₱)" type="number" placeholder="0.00" value={editPayForm.amount} onChange={(e) => setEditPayForm({ ...editPayForm, amount: e.target.value })} />
          <Input label="Collector" placeholder="Collector name" value={editPayForm.collector} onChange={(e) => setEditPayForm({ ...editPayForm, collector: e.target.value })} />
          <Input label="Year" type="number" placeholder="2024" value={editPayForm.year} onChange={(e) => setEditPayForm({ ...editPayForm, year: e.target.value })} />
          <Select label="Quarter" value={editPayForm.quarter} onChange={(e) => setEditPayForm({ ...editPayForm, quarter: e.target.value })} placeholder="Select quarter">
            {[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}
          </Select>
          <Textarea label="Notes" placeholder="Optional notes" value={editPayForm.notes} onChange={(e) => setEditPayForm({ ...editPayForm, notes: e.target.value })} className="col-span-2" />
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <Button variant="secondary" onClick={() => setEditPayId(null)}>Cancel</Button>
          <Button onClick={saveEditPay} disabled={!editPayForm.amount}><Save size={14} /> Save Changes</Button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Delete Property" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <strong>{p.tdNumber}</strong>? This will also delete all payments, remarks, and attachments.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={deleteProperty}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
