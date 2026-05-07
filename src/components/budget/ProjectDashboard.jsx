import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

// Brand Adision : palette utilisée pour les 3 sections du budget.
const BRAND = {
  bleu: "#1F3A8A",
  teal: "#0F9D7A",
  rouge: "#E94B4B",
  gris: "#5A6B7B",
};

const VIEW_LABELS = {
  total: "Total",
  materiaux: "Matériaux seul",
  main_oeuvre: "Main-d'œuvre seul",
  sous_traitant: "Sous-traitant seul",
};

const VIEW_COLORS = {
  total: BRAND.bleu,
  materiaux: BRAND.bleu,
  main_oeuvre: BRAND.teal,
  sous_traitant: BRAND.rouge,
};

const VIEW_FIELDS = {
  // Pour chaque vue filtrée, le champ de la ligne dont on somme la valeur.
  // (En vue "total", on somme `total` directement.)
  materiaux: "stMatVal",
  main_oeuvre: "stMoVal",
  sous_traitant: "stStVal",
};

function fmtMoney(n) {
  // Format québécois : 132 450 $ (espace milliers, $ après).
  const v = Number(n) || 0;
  const rounded = Math.round(v);
  return `${rounded.toLocaleString("fr-CA").replace(/ | /g, " ")} $`;
}
function fmtPct(n) {
  const v = Number(n) || 0;
  return `${v.toLocaleString("fr-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

// Hook d'agrégation : transforme les lignes du budget en totaux par section
// CSI + totaux globaux + données prêtes pour les charts. La vue (`view`)
// décide de la valeur affichée par section dans le bar chart.
export function useDashboardData(budgetLignes, view) {
  return useMemo(() => {
    const totals = { materiaux: 0, mainOeuvre: 0, sousTraitant: 0, total: 0 };
    const bySection = new Map();

    for (const l of (budgetLignes || [])) {
      const mat = Number(l.stMatVal || 0);
      const mo = Number(l.stMoVal || 0);
      const st = Number(l.stStVal || 0);
      const tot = Number(l.total || 0);
      totals.materiaux += mat;
      totals.mainOeuvre += mo;
      totals.sousTraitant += st;
      totals.total += tot;

      const key = (l.section || "—").toString().trim() || "—";
      const cur = bySection.get(key) || {
        section: key,
        description: l.description || "",
        materiaux: 0, mainOeuvre: 0, sousTraitant: 0, total: 0,
      };
      cur.materiaux += mat;
      cur.mainOeuvre += mo;
      cur.sousTraitant += st;
      cur.total += tot;
      // Première description rencontrée — sert d'étiquette indicative.
      if (!cur.description && l.description) cur.description = l.description;
      bySection.set(key, cur);
    }

    const sections = Array.from(bySection.values());
    const grandTotal = totals.total || 1; // évite division par 0 sur projet vide
    for (const s of sections) {
      s.percent = (s.total / grandTotal) * 100;
    }

    // Bar chart : selon la vue, on prend total ou un sous-total.
    const valueField = view === "total" ? "total" : (
      view === "materiaux" ? "materiaux"
        : view === "main_oeuvre" ? "mainOeuvre"
        : "sousTraitant"
    );
    const barData = sections
      .map((s) => ({ ...s, value: s[valueField] }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const donutData = [
      { name: "Matériaux",     value: totals.materiaux,     color: BRAND.bleu },
      { name: "Main-d'œuvre",  value: totals.mainOeuvre,    color: BRAND.teal },
      { name: "Sous-traitant", value: totals.sousTraitant,  color: BRAND.rouge },
    ];

    return { totals, sections, donutData, barData };
  }, [budgetLignes, view]);
}

function Kpi({ label, value, primary }) {
  return (
    <div style={{
      flex: 1, minWidth: 160,
      padding: primary ? "20px 22px" : "16px 20px",
      borderRadius: 10,
      background: primary ? BRAND.bleu : "#fff",
      color: primary ? "#fff" : "#0f172a",
      border: primary ? "none" : "1px solid #e2e8f0",
      boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
        textTransform: "uppercase",
        color: primary ? "rgba(255,255,255,0.85)" : "#64748b",
        marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontSize: primary ? 28 : 22, fontWeight: 700,
        letterSpacing: "-0.3px",
      }}>{value}</div>
    </div>
  );
}

function DonutTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pct = total > 0 ? (p.value / total) * 100 : 0;
  return (
    <div style={{
      background: "#fff", border: "1px solid #cbd5e1", borderRadius: 6,
      padding: "8px 10px", fontSize: 12, boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
    }}>
      <div style={{ fontWeight: 600, color: p.payload.color }}>{p.name}</div>
      <div>{fmtMoney(p.value)} · {fmtPct(pct)}</div>
    </div>
  );
}

function BarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{
      background: "#fff", border: "1px solid #cbd5e1", borderRadius: 6,
      padding: "8px 10px", fontSize: 12, boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
    }}>
      <div style={{ fontWeight: 600 }}>{p.payload.section}</div>
      {p.payload.description && (
        <div style={{ color: "#64748b", maxWidth: 280 }}>{p.payload.description}</div>
      )}
      <div>{fmtMoney(p.value)}</div>
    </div>
  );
}

function SectionTable({ sections, view }) {
  const [sortKey, setSortKey] = useState("total");
  const [sortDir, setSortDir] = useState("desc");
  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }
  const sorted = useMemo(() => {
    const arr = [...sections];
    arr.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const cmp = typeof va === "string"
        ? String(va).localeCompare(String(vb), "fr")
        : (va || 0) - (vb || 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [sections, sortKey, sortDir]);
  const total = useMemo(() => sections.reduce((acc, s) => ({
    materiaux: acc.materiaux + s.materiaux,
    mainOeuvre: acc.mainOeuvre + s.mainOeuvre,
    sousTraitant: acc.sousTraitant + s.sousTraitant,
    total: acc.total + s.total,
  }), { materiaux: 0, mainOeuvre: 0, sousTraitant: 0, total: 0 }), [sections]);

  const cols = [
    { key: "section",       label: "Section",       align: "left",  fmt: (v) => v },
    { key: "description",   label: "Description",   align: "left",  fmt: (v) => v },
    { key: "materiaux",     label: "Total Mat",     align: "right", fmt: fmtMoney },
    { key: "mainOeuvre",    label: "Total M-O",     align: "right", fmt: fmtMoney },
    { key: "sousTraitant",  label: "Total S-T",     align: "right", fmt: fmtMoney },
    { key: "total",         label: "Total ligne",   align: "right", fmt: fmtMoney },
    { key: "percent",       label: "% du projet",   align: "right", fmt: fmtPct },
  ];
  const arrow = (k) => (sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "");
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key}
                  onClick={() => toggleSort(c.key)}
                  style={{
                    position: "sticky", top: 0, zIndex: 1,
                    background: BRAND.bleu, color: "#fff",
                    textAlign: c.align, padding: "10px 12px",
                    fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
                    textTransform: "uppercase", cursor: "pointer",
                    userSelect: "none", whiteSpace: "nowrap",
                  }}>
                  {c.label}{arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, idx) => (
              <tr key={s.section + idx} style={{
                background: idx % 2 === 0 ? "#fff" : "#f8fafc",
              }}>
                {cols.map((c) => (
                  <td key={c.key} style={{
                    textAlign: c.align, padding: "8px 12px",
                    borderBottom: "1px solid #e2e8f0",
                    color: c.key === "description" ? "#475569" : "#0f172a",
                    fontWeight: c.key === "total" ? 600 : 400,
                  }}>
                    {c.fmt(s[c.key])}
                  </td>
                ))}
              </tr>
            ))}
            <tr style={{ background: "#f1f5f9", fontWeight: 700 }}>
              <td style={{ padding: "10px 12px" }} colSpan={2}>TOTAL</td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtMoney(total.materiaux)}</td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtMoney(total.mainOeuvre)}</td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtMoney(total.sousTraitant)}</td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtMoney(total.total)}</td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtPct(100)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ProjectDashboard({ projet, budgetLignes, onClose }) {
  const [view, setView] = useState("total");
  const [exporting, setExporting] = useState(false);
  const captureRef = useRef(null);
  const data = useDashboardData(budgetLignes, view);

  // ESC pour fermer.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Empêche le scroll du body sous la modal.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function exportPDF() {
    if (!captureRef.current) return;
    setExporting(true);
    try {
      // Lazy-load pour ne pas alourdir le bundle initial — la modal n'est
      // ouverte qu'à la demande.
      const [{ default: html2canvas }, jspdfModule] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const jsPDF = jspdfModule.jsPDF || jspdfModule.default;
      const node = captureRef.current;
      const canvas = await html2canvas(node, {
        scale: 2, backgroundColor: "#fff", useCORS: true, logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const headerH = 36;
      const footerH = 24;
      // En-tête
      pdf.setFontSize(13);
      pdf.setTextColor(31, 58, 138);
      pdf.text(`Dashboard — ${projet?.nom || "Projet"}`, margin, margin + 4);
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      const today = new Date();
      const dateStr = today.toLocaleDateString("fr-CA");
      pdf.text(`Exporté le ${dateStr}`, pageW - margin, margin + 4, { align: "right" });
      // Image (capture du dashboard)
      const availW = pageW - 2 * margin;
      const availH = pageH - margin - headerH - footerH;
      const imgW = canvas.width;
      const imgH = canvas.height;
      const ratio = Math.min(availW / imgW, availH / imgH);
      const drawW = imgW * ratio;
      const drawH = imgH * ratio;
      const drawX = (pageW - drawW) / 2;
      const drawY = margin + headerH;
      pdf.addImage(imgData, "PNG", drawX, drawY, drawW, drawH);
      // Pied de page
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text("Généré par Adision · app.adision.ca",
        pageW / 2, pageH - margin / 2, { align: "center" });
      const safeNom = (projet?.nom || "projet")
        .replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "projet";
      const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, "");
      pdf.save(`Dashboard_${safeNom}_${yyyymmdd}.pdf`);
    } catch (err) {
      console.error("Export PDF dashboard:", err);
      alert("Erreur lors de l'export PDF.");
    } finally {
      setExporting(false);
    }
  }

  const viewColor = VIEW_COLORS[view];
  const isFiltered = view !== "total";

  // Layout responsive : graphiques empilés en dessous de 1024px.
  const [stack, setStack] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    function onResize() { setStack(window.innerWidth < 1024); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // KPI principal : varie selon la vue (montant de la section ou TOTAL).
  const primaryKpi = useMemo(() => {
    if (view === "materiaux") return { label: "Total Matériaux", value: data.totals.materiaux };
    if (view === "main_oeuvre") return { label: "Total Main-d'œuvre", value: data.totals.mainOeuvre };
    if (view === "sous_traitant") return { label: "Total Sous-traitant", value: data.totals.sousTraitant };
    return { label: "TOTAL GÉNÉRAL", value: data.totals.total };
  }, [view, data]);

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dashboard du projet"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}>
      <div style={{
        background: "#f8fafc", borderRadius: 12,
        width: "95%", maxWidth: 1400, height: "90vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
        overflow: "hidden",
      }}>
        {/* En-tête modal */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", background: "#fff",
          borderBottom: "1px solid #e2e8f0",
        }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.2px",
          }}>
            <span style={{ color: BRAND.bleu }}>Dashboard projet</span>
            {projet?.nom && <span style={{ color: "#475569" }}> — {projet.nom}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, color: "#475569",
            }}>
              Vue
              <select value={view}
                onChange={(e) => setView(e.target.value)}
                style={{
                  padding: "5px 8px", border: "1px solid #cbd5e1",
                  borderRadius: 6, fontSize: 13, background: "#fff", outline: "none",
                }}>
                {Object.entries(VIEW_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </label>
            <button onClick={exportPDF} disabled={exporting}
              style={{
                padding: "6px 12px", background: "#fff",
                border: "1px solid #c7d7f5", borderRadius: 6,
                color: BRAND.bleu, fontWeight: 600, fontSize: 13,
                cursor: exporting ? "wait" : "pointer",
              }}>
              📄 {exporting ? "Export…" : "Exporter PDF"}
            </button>
            <button onClick={onClose} aria-label="Fermer le dashboard"
              style={{
                background: "transparent", border: "none",
                fontSize: 22, color: "#475569", cursor: "pointer",
                lineHeight: 1, padding: "0 4px",
              }}>
              ✕
            </button>
          </div>
        </div>

        {/* Corps scrollable — capturé en PDF */}
        <div ref={captureRef} style={{
          padding: 20, overflowY: "auto", flex: 1, background: "#f8fafc",
        }}>
          {/* Zone 1 : KPIs */}
          <div style={{
            display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18,
          }}>
            <Kpi label="Total Matériaux"     value={fmtMoney(data.totals.materiaux)} />
            <Kpi label="Total Main-d'œuvre"  value={fmtMoney(data.totals.mainOeuvre)} />
            <Kpi label="Total Sous-traitant" value={fmtMoney(data.totals.sousTraitant)} />
            <Kpi label={primaryKpi.label}    value={fmtMoney(primaryKpi.value)} primary />
          </div>

          {/* Zone 2 : Charts (donut + bar) */}
          <div style={{
            display: "grid",
            gridTemplateColumns: stack ? "1fr" : "1fr 1fr",
            gap: 16, marginBottom: 18,
          }}>
            {/* Donut — masqué si vue filtrée (1 valeur, pas de répartition) */}
            {!isFiltered && (
              <div style={{
                background: "#fff", border: "1px solid #e2e8f0",
                borderRadius: 10, padding: 16, height: 320,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: BRAND.bleu,
                  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
                }}>Répartition par section</div>
                <div style={{ position: "relative", height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.donutData} dataKey="value" nameKey="name"
                        cx="40%" cy="50%" innerRadius={60} outerRadius={100}
                        paddingAngle={2}>
                        {data.donutData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <RTooltip content={<DonutTooltip total={data.totals.total} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Centre du donut : TOTAL en gros */}
                  <div style={{
                    position: "absolute", top: "50%", left: "40%",
                    transform: "translate(-50%, -50%)", textAlign: "center",
                    pointerEvents: "none",
                  }}>
                    <div style={{ fontSize: 11, color: "#64748b",
                                  letterSpacing: 0.5, textTransform: "uppercase" }}>Total</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                      {fmtMoney(data.totals.total)}
                    </div>
                  </div>
                  {/* Légende manuelle (montants + %) */}
                  <div style={{
                    position: "absolute", right: 12, top: "50%",
                    transform: "translateY(-50%)", display: "flex",
                    flexDirection: "column", gap: 8, fontSize: 12,
                  }}>
                    {data.donutData.map((d) => {
                      const pct = data.totals.total > 0
                        ? (d.value / data.totals.total) * 100 : 0;
                      return (
                        <div key={d.name} style={{
                          display: "flex", alignItems: "center", gap: 8,
                        }}>
                          <span style={{
                            width: 10, height: 10, borderRadius: 2,
                            background: d.color, flexShrink: 0,
                          }} />
                          <div>
                            <div style={{ fontWeight: 600, color: "#0f172a" }}>{d.name}</div>
                            <div style={{ color: "#64748b" }}>
                              {fmtMoney(d.value)} · {fmtPct(pct)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Bar chart — top 10 sections */}
            <div style={{
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
              padding: 16, height: 320,
              gridColumn: isFiltered ? (stack ? "auto" : "span 2") : "auto",
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: BRAND.bleu,
                textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
              }}>Top 10 sections — {VIEW_LABELS[view]}</div>
              <div style={{ height: 260, overflowY: data.barData.length > 10 ? "auto" : "hidden" }}>
                <ResponsiveContainer width="100%"
                  height={Math.max(260, data.barData.length * 28)}>
                  <BarChart data={data.barData} layout="vertical"
                    margin={{ top: 4, right: 30, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={(v) => fmtMoney(v)}
                      tick={{ fontSize: 10, fill: "#64748b" }} />
                    <YAxis type="category" dataKey="section" width={100}
                      tick={{ fontSize: 11, fill: "#0f172a" }}
                      tickFormatter={(v) => v.length > 30 ? v.slice(0, 28) + "…" : v} />
                    <RTooltip content={<BarTooltip />} />
                    <Bar dataKey="value" fill={viewColor} radius={[0, 4, 4, 0]}
                      label={{
                        position: "right", fontSize: 10, fill: "#475569",
                        formatter: (v) => fmtMoney(v),
                      }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Zone 3 : Tableau récap */}
          <SectionTable sections={data.sections} view={view} />
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
