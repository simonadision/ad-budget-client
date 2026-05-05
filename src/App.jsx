import { useEffect, useMemo, useState } from "react";

const API_URL = "http://localhost:8000";

const allowedUnites = [
  "pi²",
  "m²",
  "pi",
  "plin",
  "mlin",
  "unité",
  "global",
  "sem",
  "/1000$",
];

const SURFACE_PLANCHER_TERMS = ["nettoyage", "revêtement de sol", "revetement de sol"];

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = {
  app: {
    padding: "32px 40px",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    background: "#f5f6fa",
    minHeight: "100vh",
    color: "#1a1a2e",
  },
  header: {
    marginBottom: 28,
    borderBottom: "2px solid #2563eb",
    paddingBottom: 16,
  },
  h1: {
    fontSize: 28,
    fontWeight: 700,
    color: "#1e3a8a",
    margin: 0,
  },
  subtitle: {
    color: "#64748b",
    fontSize: 14,
    margin: "4px 0 0",
  },
  paramsBar: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 24,
    background: "#fff",
    padding: "16px 20px",
    borderRadius: 10,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    alignItems: "center",
  },
  paramLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  paramInput: {
    padding: "6px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
    width: 110,
    outline: "none",
    transition: "border-color 0.2s",
  },
  statBadge: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "#1d4ed8",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1e3a8a",
    margin: "0 0 12px",
  },
  card: {
    background: "#fff",
    borderRadius: 10,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    overflow: "hidden",
    marginBottom: 32,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 20px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  cardHeaderActions: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1100,
    fontSize: 13,
  },
  th: {
    padding: "10px 10px",
    textAlign: "left",
    background: "#1e3a8a",
    color: "#fff",
    fontWeight: 600,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid #e2e8f0",
    verticalAlign: "middle",
  },
  trEven: { background: "#f8fafc" },
  trOdd: { background: "#fff" },
  input: {
    padding: "5px 8px",
    border: "1px solid #cbd5e1",
    borderRadius: 5,
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
  },
  inputDisabled: {
    padding: "5px 8px",
    border: "1px solid #e2e8f0",
    borderRadius: 5,
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
    background: "#f1f5f9",
    color: "#94a3b8",
  },
  select: {
    padding: "5px 8px",
    border: "1px solid #cbd5e1",
    borderRadius: 5,
    fontSize: 13,
    width: "100%",
    background: "#fff",
    outline: "none",
  },
  btnSave: {
    padding: "5px 12px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    marginRight: 6,
  },
  btnAdd: {
    padding: "7px 16px",
    background: "#16a34a",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnDelete: {
    padding: "5px 10px",
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnDeleteSelected: {
    padding: "7px 16px",
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnDeleteSelectedDisabled: {
    padding: "7px 16px",
    background: "#fca5a5",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: "not-allowed",
  },
  btnRetirer: {
    padding: "5px 10px",
    background: "#64748b",
    color: "#fff",
    border: "none",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  totalRow: {
    textAlign: "right",
    padding: "16px 20px",
    fontSize: 16,
    fontWeight: 700,
    color: "#1e3a8a",
    borderTop: "2px solid #2563eb",
    background: "#eff6ff",
  },
  amountStrong: {
    fontWeight: 700,
    color: "#1e3a8a",
  },
  emptyMsg: {
    padding: 24,
    color: "#94a3b8",
    fontStyle: "italic",
    textAlign: "center",
  },
  loading: {
    padding: 32,
    textAlign: "center",
    color: "#64748b",
    fontStyle: "italic",
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(",", ".");
  const number = parseFloat(cleaned);
  return Number.isNaN(number) ? 0 : number;
}

// ─── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [items, setItems] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(new Set());

  const [globalParams, setGlobalParams] = useState({
    surfacePlancher: "",
    hauteurCloisons: "",
    longueurCloisons: "",
    mobilisation: "",
  });

  // ── API ──────────────────────────────────────────────────────────────────

  async function loadItems() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/budget/prix-moyens`);
      const data = await res.json();
      setItems(data);
    } catch (error) {
      console.error(error);
      alert("Erreur de connexion à l'API.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  // ── State helpers ────────────────────────────────────────────────────────

  function updateGlobalParam(field, value) {
    setGlobalParams((prev) => ({
      ...prev,
      [field]: String(value).replace(",", "."),
    }));
  }

  function updateEdit(id, field, value) {
    const cleanedValue = ["qte", "prixUnitaire", "ajustementPct"].includes(field)
      ? String(value).replace(",", ".")
      : value;

    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: cleanedValue },
    }));
  }

  function resetRow(id) {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], qte: "", ajustementPct: "" },
    }));
  }

  // ── Row computation ──────────────────────────────────────────────────────

  function getRow(item) {
    const edit = edits[item.id] || {};

    const section = edit.section ?? item.section ?? "";
    const description = edit.description ?? item.description ?? "";

    const uniteFromDb = allowedUnites.includes(item.unite) ? item.unite : "global";
    const unite = edit.unite ?? uniteFromDb;

    const descriptionLower = description.toLowerCase();
    const isSurfacePlancherItem = SURFACE_PLANCHER_TERMS.some((t) =>
      descriptionLower.includes(t)
    );

    const globalSurfacePlancher = normalizeNumber(globalParams.surfacePlancher);
    const globalMobilisation = normalizeNumber(globalParams.mobilisation);

    const qte = isSurfacePlancherItem
      ? globalSurfacePlancher
      : unite === "sem"
      ? globalMobilisation
      : normalizeNumber(edit.qte ?? item.qte ?? 0);

    const prixUnitaire = normalizeNumber(edit.prixUnitaire ?? item.prix_moyen_pied ?? 0);
    const ajustementPct = normalizeNumber(edit.ajustementPct ?? 0);
    const sousTotal = qte * prixUnitaire;
    const total = sousTotal * (1 + ajustementPct / 100);

    return {
      ...item,
      section,
      description,
      qte,
      unite,
      prixUnitaire,
      ajustementPct,
      sousTotal,
      total,
      isSurfacePlancherItem,
    };
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const budgetItems = useMemo(
    () => items.map(getRow).filter((item) => item.qte > 0),
    [items, edits, globalParams]
  );

  const grandTotal = budgetItems.reduce((sum, item) => sum + item.total, 0);

  const surfaceMur = useMemo(() => {
    const h = normalizeNumber(globalParams.hauteurCloisons);
    const l = normalizeNumber(globalParams.longueurCloisons);
    return h * l;
  }, [globalParams.hauteurCloisons, globalParams.longueurCloisons]);

  const surfaceGypse = surfaceMur * 2;

  // ── Selection ────────────────────────────────────────────────────────────

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSelectAll(e) {
    setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set());
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function saveItem(item) {
    const row = getRow(item);
    setSaving((prev) => new Set(prev).add(item.id));
    try {
      const res = await fetch(`${API_URL}/budget/item/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: row.section,
          description: row.description,
          unite: row.unite,
          prix_moyen_pied: row.prixUnitaire,
          prix_moyen_m2: item.prix_moyen_m2,
          ajustement: row.ajustementPct,
        }),
      });
      if (!res.ok) throw new Error("Erreur API");
      await loadItems();
      alert("Item sauvegardé.");
    } catch (error) {
      console.error(error);
      alert("Erreur lors de la sauvegarde.");
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function deleteItem(id) {
    if (!confirm("Supprimer cet élément ?")) return;
    try {
      const res = await fetch(`${API_URL}/budget/item/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur API");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadItems();
    } catch (error) {
      console.error(error);
      alert("Erreur lors de la suppression.");
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Supprimer ${selected.size} élément(s) ?`)) return;
    for (const id of selected) {
      await fetch(`${API_URL}/budget/item/${id}`, { method: "DELETE" });
    }
    setSelected(new Set());
    await loadItems();
  }

  async function addItem() {
    try {
      const res = await fetch(`${API_URL}/budget/item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "Divers",
          description: "Nouvel élément",
          unite: "global",
          prix_moyen_pied: 0,
          prix_moyen_m2: 0,
          ajustement: 0,
        }),
      });
      if (!res.ok) throw new Error("Erreur API");
      await loadItems();
    } catch (error) {
      console.error(error);
      alert("Erreur lors de l'ajout. Vérifiez que la route POST /budget/item existe dans l'API.");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.h1}>Ad Budget</h1>
        <p style={styles.subtitle}>Prototype indépendant — budget éditable par éléments</p>
      </div>

      {/* Paramètres globaux */}
      <div style={styles.paramsBar}>
        {[
          { label: "Mobilisation (sem)", field: "mobilisation", width: 90 },
          { label: "Surface plancher (pi²)", field: "surfacePlancher", width: 100 },
          { label: "Hauteur cloisons", field: "hauteurCloisons", width: 90 },
          { label: "Longueur cloisons", field: "longueurCloisons", width: 100 },
        ].map(({ label, field, width }) => (
          <label key={field} style={styles.paramLabel}>
            {label}
            <input
              type="text"
              inputMode="decimal"
              value={globalParams[field]}
              onChange={(e) => updateGlobalParam(field, e.target.value)}
              style={{ ...styles.paramInput, width }}
            />
          </label>
        ))}

        <div style={styles.statBadge}>Surface mur : {surfaceMur.toFixed(2)} pi²</div>
        <div style={styles.statBadge}>Surface gypse : {surfaceGypse.toFixed(2)} pi²</div>
      </div>

      {loading && <p style={styles.loading}>Chargement des éléments…</p>}

      {!loading && (
        <>
          {/* ── Base de données ── */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Base de données</h2>
<div style={styles.cardHeaderActions}>
  <button onClick={addItem} style={styles.btnAdd}>
    + Ajouter
  </button>
  <button
    onClick={deleteSelected}
                  disabled={selected.size === 0}
                  style={
                    selected.size === 0
                      ? styles.btnDeleteSelectedDisabled
                      : styles.btnDeleteSelected
                  }
                >
                  Supprimer sélectionnés ({selected.size})
                </button>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {[
                      <input type="checkbox" onChange={handleSelectAll} />,
                      "Section",
                      "Description",
                      "Qté",
                      "Unité",
                      "Prix unitaire",
                      "Sous-total",
                      "Ajustement %",
                      "Total",
                      "Actions",
                    ].map((col, i) => (
                      <th key={i} style={styles.th}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {items.map((item, idx) => {
                    const row = getRow(item);
                    const isDisabled = row.isSurfacePlancherItem || row.unite === "sem";

                    return (
                      <tr key={item.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                        <td style={{ ...styles.td, width: 40, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                          />
                        </td>

                        <td style={{ ...styles.td, width: 110 }}>
                          <input
                            value={row.section}
                            onChange={(e) => updateEdit(item.id, "section", e.target.value)}
                            style={styles.input}
                          />
                        </td>

                        <td style={{ ...styles.td, minWidth: 200 }}>
                          <input
                            value={row.description}
                            onChange={(e) => updateEdit(item.id, "description", e.target.value)}
                            style={styles.input}
                          />
                        </td>

                        <td style={{ ...styles.td, width: 90 }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={
                              isDisabled
                                ? row.isSurfacePlancherItem
                                  ? String(globalParams.surfacePlancher ?? "")
                                  : String(globalParams.mobilisation ?? "")
                                : edits[item.id]?.qte ?? ""
                            }
                            disabled={isDisabled}
                            onChange={(e) => updateEdit(item.id, "qte", e.target.value)}
                            style={isDisabled ? styles.inputDisabled : styles.input}
                          />
                        </td>

                        <td style={{ ...styles.td, width: 100 }}>
                          <select
                            value={row.unite}
                            onChange={(e) => updateEdit(item.id, "unite", e.target.value)}
                            style={styles.select}
                          >
                            {allowedUnites.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td style={{ ...styles.td, width: 110 }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={
                              edits[item.id]?.prixUnitaire ?? row.prixUnitaire.toFixed(2)
                            }
                            onChange={(e) =>
                              updateEdit(item.id, "prixUnitaire", e.target.value)
                            }
                            style={styles.input}
                          />
                        </td>

                        <td style={{ ...styles.td, width: 110, color: "#475569" }}>
                          {row.sousTotal.toFixed(2)} $
                        </td>

                        <td style={{ ...styles.td, width: 90 }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={edits[item.id]?.ajustementPct ?? ""}
                            onChange={(e) =>
                              updateEdit(item.id, "ajustementPct", e.target.value)
                            }
                            style={styles.input}
                          />
                        </td>

                        <td style={{ ...styles.td, width: 110 }}>
                          <strong style={styles.amountStrong}>
                            {row.total.toFixed(2)} $
                          </strong>
                        </td>

                        <td style={{ ...styles.td, width: 140, whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => saveItem(item)}
                            disabled={saving.has(item.id)}
                            style={{
                              ...styles.btnSave,
                              opacity: saving.has(item.id) ? 0.6 : 1,
                            }}
                          >
                            {saving.has(item.id) ? "…" : "Sauver"}
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            style={styles.btnDelete}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Budget affiché ── */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={{ ...styles.sectionTitle, margin: 0 }}>Budget affiché</h2>
            </div>

            {budgetItems.length === 0 ? (
              <p style={styles.emptyMsg}>
                Aucun élément avec une quantité &gt; 0 pour le moment.
              </p>
            ) : (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {[
                          "Section",
                          "Description",
                          "Qté",
                          "Unité",
                          "Prix unitaire",
                          "Sous-total",
                          "Ajustement %",
                          "Total",
                          "Action",
                        ].map((col) => (
                          <th key={col} style={styles.th}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {budgetItems.map((item, idx) => (
                        <tr key={item.id} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                          <td style={styles.td}>{item.section}</td>
                          <td style={styles.td}>{item.description}</td>
                          <td style={styles.td}>{item.qte}</td>
                          <td style={styles.td}>{item.unite}</td>
                          <td style={styles.td}>{item.prixUnitaire.toFixed(2)} $</td>
                          <td style={{ ...styles.td, color: "#475569" }}>
                            {item.sousTotal.toFixed(2)} $
                          </td>
                          <td style={styles.td}>{item.ajustementPct} %</td>
                          <td style={styles.td}>
                            <strong style={styles.amountStrong}>
                              {item.total.toFixed(2)} $
                            </strong>
                          </td>
                          <td style={styles.td}>
                            <button onClick={() => resetRow(item.id)} style={styles.btnRetirer}>
                              Retirer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={styles.totalRow}>
                  Total budget : {grandTotal.toFixed(2)} $
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}