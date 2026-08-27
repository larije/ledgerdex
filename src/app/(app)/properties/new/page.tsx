"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, AlertCircle, Info, CheckCircle2, Building2, TreePine, Cog, LayoutGrid } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/layout/PageHeader";
import { MUNICIPALITIES, getPropertyTypeLabel } from "@/lib/utils";

const PROPERTY_TYPES = ["LAND", "BLDG", "MACH", "MISC"] as const;

const TYPE_GUIDE = [
  { icon: TreePine,   color: "text-green-500",  bg: "bg-green-50",  label: "Land (LAND)",   desc: "Vacant lots and agricultural land parcels." },
  { icon: Building2,  color: "text-blue-500",   bg: "bg-blue-50",   label: "Building (BLDG)", desc: "Residential, commercial, or industrial structures." },
  { icon: Cog,        color: "text-orange-500", bg: "bg-orange-50", label: "Machinery (MACH)", desc: "Equipment and machinery assessed as real property." },
  { icon: LayoutGrid, color: "text-purple-500", bg: "bg-purple-50", label: "Misc (MISC)",    desc: "Other improvements not classified above." },
];

const REQUIRED_FIELDS = ["TD Number", "Type"];

export default function NewPropertyPage() {
  const [form, setForm] = useState({
    tdNumber: "", propertyIndexNo: "", propertyLocation: "",
    barangay: "", municipality: "", lotBlockNo: "", class: "",
    type: "MISC", area: "", marketValue: "", assessedValue: "",
    effectivity: "", taxability: "TAXABLE",
    taxesBeginYear: "", taxesBeginQuarter: "",
  });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [conflict, setConflict] = useState<string | null>(null);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tdNumber || !form.type) { setError("TD Number and Type are required."); return; }
    setSaving(true);
    setError("");
    setConflict(null);

    const res = await fetch("/api/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        area:              form.area              ? parseFloat(form.area)              : null,
        marketValue:       form.marketValue       ? parseFloat(form.marketValue)       : null,
        assessedValue:     form.assessedValue     ? parseFloat(form.assessedValue)     : null,
        effectivity:       form.effectivity       ? parseInt(form.effectivity)         : null,
        taxesBeginYear:    form.taxesBeginYear    ? parseInt(form.taxesBeginYear)      : null,
        taxesBeginQuarter: form.taxesBeginQuarter ? parseInt(form.taxesBeginQuarter)   : null,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (res.status === 409) {
      setConflict(data.existingId);
    } else if (!res.ok) {
      setError(data.error ?? "Failed to save.");
    } else {
      window.location.href = `/properties/${data.property.id}`;
    }
  };

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/properties" className="hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft size={14} /> Properties
        </Link>
        <span>/</span>
        <span className="text-slate-800">Manual Entry</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Add Property Record"
          subtitle="Manually enter a property tax declaration"
        />
        <div className="flex gap-3 shrink-0 pt-1">
          <Link href="/properties">
            <Button variant="secondary" type="button">Cancel</Button>
          </Link>
          <Button type="submit" form="property-form" loading={saving}>
            <Save size={14} /> Save Property
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {conflict && (
        <div className="flex items-center justify-between px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} /> TD Number already exists in the system.
          </div>
          <Link href={`/properties/${conflict}`} className="text-blue-600 hover:underline font-medium">
            View existing →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-3 gap-5 items-start">
        {/* Form — left 2/3 */}
        <form id="property-form" onSubmit={submit} className="col-span-2 space-y-4">
          <Card>
            <CardHeader><h3 className="text-sm font-semibold text-slate-700">Property Information</h3></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Input label="TD Number *" placeholder="e.g. 2023-05-0001-01628" value={form.tdNumber} onChange={set("tdNumber")} required />
                <Input label="Property Index No." placeholder="e.g. 063-05-0001-026-36-2001" value={form.propertyIndexNo} onChange={set("propertyIndexNo")} />
                <Input label="Property Location" placeholder="e.g. POBLACION, NEW CORELLA" value={form.propertyLocation} onChange={set("propertyLocation")} className="col-span-2" />
                <Input label="Barangay" value={form.barangay} onChange={set("barangay")} />
                <Select label="Municipality" value={form.municipality} onChange={set("municipality")} placeholder="Select municipality">
                  {MUNICIPALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
                <Input label="Lot/Block No." placeholder="e.g. 2496" value={form.lotBlockNo} onChange={set("lotBlockNo")} />
                <Input label="Class" placeholder="e.g. C" value={form.class} onChange={set("class")} />
                <Select label="Type *" value={form.type} onChange={set("type")}>
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{getPropertyTypeLabel(t)}</option>)}
                </Select>
                <Input label="Area (sqm)" type="number" placeholder="0.00" value={form.area} onChange={set("area")} />
                <Input label="Market Value (₱)" type="number" placeholder="0.00" value={form.marketValue} onChange={set("marketValue")} />
                <Input label="Assessed Value (₱)" type="number" placeholder="0.00" value={form.assessedValue} onChange={set("assessedValue")} />
                <Input label="Effectivity (Year)" type="number" placeholder="2024" value={form.effectivity} onChange={set("effectivity")} />
                <Select label="Taxability" value={form.taxability} onChange={set("taxability")}>
                  <option value="TAXABLE">Taxable</option>
                  <option value="EXEMPT">Exempt</option>
                </Select>
                <Input label="Taxes Begin Year" type="number" placeholder="2024" value={form.taxesBeginYear} onChange={set("taxesBeginYear")} />
                <Select label="Taxes Begin Quarter" value={form.taxesBeginQuarter} onChange={set("taxesBeginQuarter")} placeholder="Select quarter">
                  {[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}
                </Select>
              </div>
            </CardContent>
          </Card>

        </form>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Required fields */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Info size={13} /> Required Fields
              </h3>
            </CardHeader>
            <CardContent className="space-y-2">
              {REQUIRED_FIELDS.map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-slate-600">
                  <CheckCircle2 size={13} className="text-blue-500 shrink-0" />
                  {f}
                </div>
              ))}
              <p className="text-xs text-slate-400 pt-1 border-t border-slate-100 mt-2">
                All other fields are optional and can be filled later.
              </p>
            </CardContent>
          </Card>

          {/* Property type guide */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-700">Property Type Guide</h3>
            </CardHeader>
            <CardContent className="space-y-3">
              {TYPE_GUIDE.map(({ icon: Icon, color, bg, label, desc }) => (
                <div key={label} className="flex gap-3">
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon size={14} className={color} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{label}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* TD Number format hint */}
          <Card className="border-blue-100 bg-blue-50/50">
            <CardContent className="py-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">TD Number Format</p>
              <p className="font-mono text-xs text-blue-600 bg-white/80 px-2 py-1 rounded border border-blue-100">
                YYYY-MM-NNNN-NNNNN
              </p>
              <p className="text-xs text-blue-500 mt-1.5">
                e.g. <span className="font-mono">2023-05-0001-01628</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
