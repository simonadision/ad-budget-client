import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  authFetch,
  captureTokenFromUrl,
  clearJwt,
  getJwt,
  redirectToLogin,
  redirectToLogout,
} from "./auth.js";
import ModuleSwitcher from "./ModuleSwitcher.jsx";

const API_URL = "https://web-production-3381d.up.railway.app";

const allowedUnites = [
  "pi²", "m²", "pi", "plin", "mlin", "unité", "global", "sem", "/1000$", "m³",
];

const DEFAULT_LOGO_URL = "/adision_logo.png";

async function processLogoFile(file) {
  if (!file.type.match(/^image\/(png|jpe?g)$/)) {
    alert("Format invalide : PNG ou JPEG seulement.");
    return null;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const MAX_W = 800;
  const scale = img.width > MAX_W ? MAX_W / img.width : 1;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", 0.85);
  const sizeKB = Math.round((out.length * 3 / 4) / 1024);
  if (sizeKB > 500) {
    alert(`Image trop grande après redimensionnement (${sizeKB} KB). Choisis une image plus petite.`);
    return null;
  }
  return out;
}

// Refonte 3 sections : chaque ligne du budget se décompose en matériaux,
// main-d'œuvre et sous-traitant. Chaque section a ses inputs, son ajustement %
// et son sous-total calculé. Le total ligne est la somme des 3 sous-totaux.
const BUDGET_SECTIONS = {
  // Palette Adision pâle : dérivée du bleu / rouge / vert de marque
  // (#1F3A8A / #E94B4B / #0F9D7A). Une seule teinte par section,
  // appliquée uniformément aux 3 rangées de header et au tbody.
  materiaux:    { label: "MATÉRIAUX",    bg: "#E3E7F4", bgRow: "#E3E7F4" },
  mainOeuvre:   { label: "MAIN-D'ŒUVRE", bg: "#FCE5E5", bgRow: "#FCE5E5" },
  sousTraitant: { label: "SOUS-TRAITANT", bg: "#DDF2EC", bgRow: "#DDF2EC" },
};

const BUDGET_COLUMNS = [
  // Colonnes communes (pas de section)
  { key: "actif",       label: "Actif",       group: null, defaultWidth: 44,  minWidth: 60 },
  { key: "section",     label: "Section",     group: null, defaultWidth: 90,  minWidth: 60 },
  { key: "description", label: "Description", group: null, defaultWidth: 200, minWidth: 100 },
  { key: "qte",         label: "Qté",         group: null, defaultWidth: 70,  minWidth: 50 },
  { key: "unite",       label: "Unité",       group: null, defaultWidth: 90,  minWidth: 60 },
  // Section MATÉRIAUX
  { key: "prix",        label: "Coût unit.",  group: "materiaux",  defaultWidth: 90,  minWidth: 60 },
  { key: "ajustMat",    label: "Ajust %",     group: "materiaux",  defaultWidth: 70,  minWidth: 50 },
  { key: "stMat",       label: "S/T mat.",    group: "materiaux",  defaultWidth: 100, minWidth: 70, readOnly: true },
  // Section MAIN-D'ŒUVRE
  { key: "heures",      label: "Heures",      group: "mainOeuvre", defaultWidth: 70,  minWidth: 50 },
  { key: "tauxHoraire", label: "Taux $",      group: "mainOeuvre", defaultWidth: 75,  minWidth: 50 },
  { key: "ajustMo",     label: "Ajust %",     group: "mainOeuvre", defaultWidth: 70,  minWidth: 50 },
  { key: "stMo",        label: "S/T M-O",     group: "mainOeuvre", defaultWidth: 100, minWidth: 70, readOnly: true },
  // Section SOUS-TRAITANT — 5 colonnes (4 spec + nom autocomplete préservé).
  { key: "stType",      label: "Type",          group: "sousTraitant", defaultWidth: 110, minWidth: 80 },
  { key: "stNom",       label: "Sous-traitant", group: "sousTraitant", defaultWidth: 150, minWidth: 100 },
  { key: "stMontant",   label: "Montant",       group: "sousTraitant", defaultWidth: 100, minWidth: 70 },
  { key: "ajustSt",     label: "Ajust %",       group: "sousTraitant", defaultWidth: 70,  minWidth: 50 },
  { key: "stSt",        label: "S/T s-tr.",     group: "sousTraitant", defaultWidth: 100, minWidth: 70, readOnly: true },
  // Colonnes communes (droite)
  { key: "total",       label: "Total ligne", group: null, defaultWidth: 110, minWidth: 80, readOnly: true },
  { key: "note",        label: "Note",        group: null, defaultWidth: 180, minWidth: 100 },
  { key: "actions",     label: "Actions",     group: null, defaultWidth: 100, minWidth: 60 },
];

const SOUS_TRAITANT_TYPES = ["Budget", "Soumission", "BSDQ", "Allocation"];

// Style des bordures qui marquent les frontières entre les 3 sections —
// posé sur le borderLeft de la première colonne d'une nouvelle zone (qu'elle
// soit une section ou la zone commune après les sections).
const SECTION_BORDER = "3px solid #475569";

function isSectionBoundary(col, prevCol) {
  // Frontière dès que le group change. Couvre :
  //   null → section, section → autre section, section → null.
  // Avec sections cachées : si la section M-O est masquée, la frontière entre
  //   matériaux et S-T s'affiche à la jonction Matériaux / S-T (une seule).
  if (!prevCol) return false;
  return (col.group ?? null) !== (prevCol.group ?? null);
}

// Presets pour le toggle de visibilité des colonnes. Toutes les colonnes
// restent en BD ; on ne fait que masquer/afficher leur cellule.
const COL_PRESETS = {
  complete: {
    label: "Vue complète",
    keys: BUDGET_COLUMNS.map((c) => c.key),
  },
  materiauxOnly: {
    label: "Matériaux seulement",
    keys: ["actif", "section", "description", "qte", "unite",
           "prix", "ajustMat", "stMat", "total", "note", "actions"],
  },
  moOnly: {
    label: "Main-d'œuvre seulement",
    keys: ["actif", "section", "description", "qte", "unite",
           "heures", "tauxHoraire", "ajustMo", "stMo", "total", "note", "actions"],
  },
  stOnly: {
    label: "Sous-traitant seulement",
    keys: ["actif", "section", "description", "qte", "unite",
           "stType", "stNom", "stMontant", "ajustSt", "stSt", "total", "note", "actions"],
  },
  minimale: {
    label: "Vue minimale",
    keys: ["description", "qte", "unite", "total", "note"],
  },
};

const BUDGET_GROUPS = [
  { key: "conditions", label: "Conditions générales", pctField: "pct_admin_conditions",
    matches: (n) => n === 1 },
  { key: "architecture", label: "Architecture", pctField: "pct_admin_architecture",
    matches: (n) => n >= 2 && n <= 14 },
  { key: "mecanique", label: "Mécanique", pctField: "pct_admin_mecanique",
    matches: (n) => n >= 20 && n <= 28 },
  { key: "excavation", label: "Excavation", pctField: "pct_admin_excavation",
    matches: (n) => n === 31 },
];

const PDF_COLUMNS = [
  { key: "section", label: "Section" },
  { key: "description", label: "Description" },
  { key: "qte", label: "Qté" },
  { key: "unite", label: "Unité" },
  { key: "prix_unitaire", label: "Coût u." },
  { key: "ajust_materiaux", label: "Aj. mat." },
  { key: "heures", label: "Heures" },
  { key: "taux_horaire", label: "Taux $" },
  { key: "ajust_main_oeuvre", label: "Aj. M-O" },
  { key: "sous_traitant_type", label: "Type S-T" },
  { key: "sous_traitant_nom", label: "Sous-traitant" },
  { key: "sous_traitant_montant", label: "Mt S-T" },
  { key: "ajust_sous_traitant", label: "Aj. S-T" },
  { key: "sous_total", label: "Sous-total" },
  { key: "ajustement_pct", label: "Ajust. %" },
  { key: "total", label: "Total" },
  { key: "note", label: "Note" },
];

const SURFACE_PLANCHER_TERMS = ["nettoyage", "revêtement de sol", "revetement de sol"];
const SURFACE_MUR_TERMS = ["cloisons système intérieur", "cloisons systeme interieur"];
const SURFACE_GYPSE_TERMS = ["plâtrage", "platrage", "peinture", "papier peint"];

const AUTOSAVE_DELAY = 3000;

// Taxes Québec — taux fixes hardcodés
const TPS_RATE = 0.05;
const TVQ_RATE = 0.09975;

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = {
  app: {
    fontFamily: "\"Helvetica Neue\", Helvetica, Arial, sans-serif",
    background: "#f8fafc",
    minHeight: "100vh",
    color: "#0f172a",
  },
  // loginPage est encore utilisé comme arrière-plan de l'écran de chargement
  // SSO (avant que /auth/me ait répondu). Les anciens styles loginCard /
  // loginLogo / etc. ont été retirés avec le composant Login local.
  loginPage: {
    display: "flex", alignItems: "center", justifyContent: "center",
    minHeight: "100vh", background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
  },
  nav: {
    background: "#1e3a8a", padding: "0 28px", display: "flex",
    alignItems: "center", justifyContent: "space-between", height: 56,
  },
  navLogo: {
    color: "#fff", fontWeight: 700, fontSize: 20, letterSpacing: "-0.3px",
    display: "flex", alignItems: "center", gap: 10,
  },
  navUser: { color: "#93c5fd", fontSize: 13, display: "flex", alignItems: "center", gap: 14 },
  navLogout: {
    background: "transparent", border: "1px solid #3b82f6", color: "#93c5fd",
    padding: "5px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer",
  },
  page: { padding: "32px 32px" },
  pageTitle: { fontSize: 28, fontWeight: 700, color: "#0f172a", marginBottom: 28, letterSpacing: "-0.5px" },
  projetsGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 20, marginBottom: 28,
  },
  projetCard: {
    background: "#ffffff", borderRadius: 8, boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
    padding: "20px", cursor: "pointer", border: "1px solid #e2e8f0",
  },
  projetCardTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 8 },
  projetCardInfo: { fontSize: 13, color: "#64748b", marginBottom: 4 },
  projetCardStatut: {
    display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, marginTop: 10,
  },
  newProjetCard: {
    background: "#eef4ff", border: "2px dashed #c7d7f5", borderRadius: 8, padding: "20px",
    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", minHeight: 130, color: "#1e3a8a", fontWeight: 600, fontSize: 14,
  },
  card: {
    background: "#ffffff", borderRadius: 8, boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
    border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: 24,
  },
  cardHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 24px", borderBottom: "1px solid #e2e8f0", background: "#ffffff",
  },
  cardTitle: {
    fontSize: 13, fontWeight: 600, color: "#1e3a8a", margin: 0,
    textTransform: "uppercase", letterSpacing: "0.5px",
  },
  cardBody: { padding: "24px" },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  formRow: { display: "flex", gap: 14 },
  formGroup: { display: "flex", flexDirection: "column", flex: 1 },
  formLabel: {
    fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase",
    letterSpacing: "1px", marginBottom: 6,
  },
  formInput: { padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14, color: "#0f172a", background: "#ffffff", outline: "none" },
  formSelect: { padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14, color: "#0f172a", background: "#ffffff", outline: "none" },
  btnPrimary: {
    padding: "7px 18px", background: "#2563eb", color: "#fff", border: "none",
    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  btnSecondary: {
    padding: "7px 18px", background: "#ffffff", color: "#1e3a8a", border: "1px solid #c7d7f5",
    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  btnBack: {
    padding: "5px 12px", background: "transparent", color: "#2563eb", border: "1px solid #2563eb",
    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16,
  },
  btnDelete: {
    padding: "4px 8px", background: "transparent", color: "#ef4444",
    border: "none", borderRadius: 4, fontSize: 14, fontWeight: 700, cursor: "pointer",
  },
  btnAddRow: {
    padding: "5px 10px", background: "#ffffff", color: "#10b981",
    border: "1px solid #10b981", borderRadius: 6, fontSize: 11, fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap", marginRight: 4,
  },
  btnToggleActive: {
    padding: "4px 8px", background: "#10b981", color: "#fff", border: "none",
    borderRadius: 5, fontSize: 13, fontWeight: 700, cursor: "pointer", minWidth: 34,
  },
  btnToggleInactive: {
    padding: "4px 8px", background: "#cbd5e1", color: "#64748b", border: "none",
    borderRadius: 5, fontSize: 13, fontWeight: 700, cursor: "pointer", minWidth: 34,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "12px 12px", textAlign: "left", background: "#1e3a8a", color: "#fff",
    fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap",
  },
  td: { padding: "8px 12px", borderBottom: "1px solid #e2e8f0", verticalAlign: "middle" },
  trEven: { background: "#f8fafc" },
  trOdd: { background: "#ffffff" },
  trInactive: { background: "#f1f5f9", opacity: 0.5 },
  trGroup: { background: "#1e3a8a", cursor: "pointer", userSelect: "none" },
  tdGroup: { padding: "12px 16px", fontWeight: 700, fontSize: 12, color: "#fff", letterSpacing: "0.3px" },
  tdGroupTotal: { padding: "12px 16px", fontWeight: 700, fontSize: 12, color: "#fff", textAlign: "right", whiteSpace: "nowrap" },
  input: {
    padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13,
    width: "100%", boxSizing: "border-box", color: "#0f172a", background: "#ffffff", outline: "none",
  },
  inputDisabled: {
    padding: "4px 7px", border: "1px solid #e2e8f0", borderRadius: 5, fontSize: 12,
    width: "100%", boxSizing: "border-box", background: "#f1f5f9", color: "#94a3b8",
  },
  select: {
    padding: "4px 8px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 13,
    minWidth: 80, width: "100%", color: "#0f172a", background: "#ffffff",
    outline: "none", boxSizing: "border-box",
  },
  totalRow: {
    textAlign: "right", padding: "18px 24px", fontSize: 18, fontWeight: 700,
    color: "#ffffff", background: "#1e3a8a", letterSpacing: "0.3px",
  },
  amountStrong: { fontWeight: 700, color: "#1e3a8a" },
  emptyMsg: { padding: 24, textAlign: "center", color: "#94a3b8", fontStyle: "italic" },
  loading: { padding: 32, textAlign: "center", color: "#64748b", fontStyle: "italic" },
  autosaveStatus: { fontSize: 12, fontStyle: "italic" },
  paramsBar: {
    display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 24, background: "#ffffff",
    padding: "16px 24px", borderRadius: 8, border: "1px solid #e2e8f0",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)", alignItems: "center",
  },
  paramLabel: {
    display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontWeight: 600,
    color: "#64748b", textTransform: "uppercase", letterSpacing: "1px",
  },
  paramInput: { padding: "5px 8px", border: "1px solid #dbe3f0", borderRadius: 6, fontSize: 13, width: 90, background: "#ffffff", outline: "none" },
  statBadge: {
    background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8,
    padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#1d4ed8",
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(",", ".");
  const number = parseFloat(cleaned);
  return Number.isNaN(number) ? 0 : number;
}

function getPrefix(section) {
  const s = (section || "").trim();
  const match = s.match(/^(\d+)/);
  if (match) return match[1].substring(0, 2).padStart(2, "0");
  return "Divers";
}

function getLineGroupKey(section) {
  const prefix = getPrefix(section);
  const n = parseInt(prefix, 10);
  if (isNaN(n)) return null;
  for (const g of BUDGET_GROUPS) {
    if (g.matches(n)) return g.key;
  }
  return null;
}

function getPrefixLabel(prefix) {
  return prefix === "Divers" ? "Divers" : `Section ${prefix}`;
}

function groupByPrefix(items) {
  const groups = {};
  for (const item of items) {
    const prefix = getPrefix(item.section);
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(item);
  }
  return Object.entries(groups).sort((a, b) => {
    if (a[0] === "Divers") return 1;
    if (b[0] === "Divers") return -1;
    const na = parseInt(a[0], 10);
    const nb = parseInt(b[0], 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a[0].localeCompare(b[0]);
  });
}

function statutColor(statut) {
  if (statut === "en cours") return { background: "#dbeafe", color: "#1d4ed8" };
  if (statut === "complété") return { background: "#d1fae5", color: "#10b981" };
  return { background: "#f1f5f9", color: "#64748b" };
}

// ─── App ───────────────────────────────────────────────────────────────────

export default function App() {
  // SSO bootstrap : on capture ?token=, on valide via /auth/me, sinon
  // redirection vers le dashboard. Tant que l'auth n'est pas résolue,
  // on reste en authStatus="loading" et on n'affiche rien.
  const [authStatus, setAuthStatus] = useState("loading"); // "loading" | "ready"
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("projets");
  const [projets, setProjets] = useState([]);
  const [projetActif, setProjetActif] = useState(null);
  const [lignes, setLignes] = useState([]);
  // Toast minimaliste (top-right, auto-dismiss 4s) — utilisé pour le retour
  // de l'auto-open du deep-link ?projet= et autres feedbacks ponctuels.
  const [toast, setToast] = useState(null);
  function showToast(message, kind = "info") {
    setToast({ id: Date.now(), message, kind });
    setTimeout(() => setToast((t) => (t && t.message === message ? null : t)), 4000);
  }
  // Cible du deep-link ?projet=<id> capturée au tout début du bootstrap, AVANT
  // tout strip d'URL. Consommée une fois après loadProjets.
  const pendingProjetIdRef = useRef(null);
  const [edits, setEdits] = useState({});
  const [activeItems, setActiveItems] = useState(new Set());
  const [saving, setSaving] = useState(new Set());
  const [autosaveStatus, setAutosaveStatus] = useState("");
  const [collapsedBudget, setCollapsedBudget] = useState(new Set());
  const autosaveTimers = useRef({});
  const [notes, setNotes] = useState("");
  const notesTimer = useRef(null);
  const [pctEdits, setPctEdits] = useState({});
  const pctTimers = useRef({});
  // Largeurs et visibilité des colonnes — namespacées par user pour que
  // chaque utilisateur ait sa propre config, persistée entre sessions.
  // Clés : adbud_col_widths_<userId> et adbud_col_visibility_<userId>.
  // Tant que user n'est pas chargé (?), on lit/écrit sous "anon" — les
  // valeurs sont rechargées dans l'effet ci-dessous quand user.id arrive.
  const colWidthsDefault = useMemo(
    () => Object.fromEntries(BUDGET_COLUMNS.map((c) => [c.key, c.defaultWidth])),
    [],
  );
  const colVisibilityDefault = useMemo(
    () => Object.fromEntries(BUDGET_COLUMNS.map((c) => [c.key, true])),
    [],
  );
  const [colWidths, setColWidths] = useState(colWidthsDefault);
  const [colVisibility, setColVisibility] = useState(colVisibilityDefault);
  const widthsKey = `adbud_col_widths_${user?.id ?? "anon"}`;
  const visibilityKey = `adbud_col_visibility_${user?.id ?? "anon"}`;
  const notesVisibleKey = `adbud_notes_visible_${user?.id ?? "anon"}`;

  // Visibilité de la zone Notes du projet (textarea cachable). Le titre
  // "Notes du projet" reste toujours affiché pour servir de point de
  // ré-ouverture.
  const [notesVisible, setNotesVisible] = useState(true);

  // (Re)charge largeurs + visibilité quand l'user change (login).
  useEffect(() => {
    try {
      const w = localStorage.getItem(widthsKey);
      setColWidths(w ? { ...colWidthsDefault, ...JSON.parse(w) } : colWidthsDefault);
    } catch { setColWidths(colWidthsDefault); }
    try {
      const v = localStorage.getItem(visibilityKey);
      setColVisibility(v ? { ...colVisibilityDefault, ...JSON.parse(v) } : colVisibilityDefault);
    } catch { setColVisibility(colVisibilityDefault); }
    try {
      const n = localStorage.getItem(notesVisibleKey);
      setNotesVisible(n === null ? true : n === "true");
    } catch { setNotesVisible(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    try { localStorage.setItem(widthsKey, JSON.stringify(colWidths)); } catch {}
  }, [colWidths, widthsKey]);
  useEffect(() => {
    try { localStorage.setItem(visibilityKey, JSON.stringify(colVisibility)); } catch {}
  }, [colVisibility, visibilityKey]);
  useEffect(() => {
    try { localStorage.setItem(notesVisibleKey, String(notesVisible)); } catch {}
  }, [notesVisible, notesVisibleKey]);

  function startColResize(e, key) {
    e.preventDefault();
    e.stopPropagation();
    const colSpec = BUDGET_COLUMNS.find((c) => c.key === key);
    const minW = colSpec?.minWidth ?? 60;
    const startX = e.clientX;
    const startW = colWidths[key];
    const onMove = (ev) => {
      const newW = Math.max(minW, startW + (ev.clientX - startX));
      setColWidths((prev) => ({ ...prev, [key]: newW }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function applyColPreset(presetKey) {
    const preset = COL_PRESETS[presetKey];
    if (!preset) return;
    const visible = new Set(preset.keys);
    setColVisibility(Object.fromEntries(BUDGET_COLUMNS.map((c) => [c.key, visible.has(c.key)])));
  }
  function toggleColVisibility(key) {
    setColVisibility((prev) => {
      const willBeVisible = !prev[key];
      if (!willBeVisible) {
        // Refuse de cacher la dernière colonne visible. Garde-fou : sans ça
        // l'user perd tout repère et doit forcément passer par le menu.
        const remaining = BUDGET_COLUMNS.filter((c) => c.key !== key && prev[c.key]);
        if (remaining.length === 0) {
          setAutosaveStatus("Au moins une colonne doit rester visible");
          setTimeout(() => setAutosaveStatus(""), 2500);
          return prev;
        }
      }
      return { ...prev, [key]: willBeVisible };
    });
  }
  function resetColWidths() {
    setColWidths(colWidthsDefault);
  }
  // Menu déroulant 👁 Colonnes — ouvert/fermé.
  const [colsMenuOpen, setColsMenuOpen] = useState(false);

  // Helpers visibilité par section : la rangée header de section MATÉRIAUX/
  // M-O/S-T disparaît si toutes ses colonnes sont cachées.
  const visibleColumns = useMemo(
    () => BUDGET_COLUMNS.filter((c) => colVisibility[c.key]),
    [colVisibility],
  );
  const sectionVisible = useMemo(() => {
    const out = {};
    for (const sk of Object.keys(BUDGET_SECTIONS)) {
      out[sk] = BUDGET_COLUMNS.some((c) => c.group === sk && colVisibility[c.key]);
    }
    return out;
  }, [colVisibility]);

  const [totalsVisibility, setTotalsVisibility] = useState(() => {
    const defaults = {
      ...Object.fromEntries(BUDGET_GROUPS.map((g) => [g.key, { sousTotal: true, adminProfit: true }])),
      sousTotalAvantTaxes: true,
      tps: true,
      tvq: true,
    };
    try {
      const stored = localStorage.getItem("ad_bud_totaux_visibles");
      if (stored) {
        const parsed = JSON.parse(stored);
        const merged = { ...defaults };
        for (const g of BUDGET_GROUPS) {
          if (parsed[g.key]) merged[g.key] = { ...defaults[g.key], ...parsed[g.key] };
        }
        for (const k of ["sousTotalAvantTaxes", "tps", "tvq"]) {
          if (typeof parsed[k] === "boolean") merged[k] = parsed[k];
        }
        return merged;
      }
    } catch {}
    return defaults;
  });
  useEffect(() => {
    try {
      localStorage.setItem("ad_bud_totaux_visibles", JSON.stringify(totalsVisibility));
    } catch {}
  }, [totalsVisibility]);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoEdits, setInfoEdits] = useState({});
  const [infoSaving, setInfoSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nouveauProjet, setNouveauProjet] = useState({
    nom: "", adresse: "", description: "", statut: "en cours",
    nom_client: "", contact_client: "", email_client: "", telephone_client: "",
    numero_projet: "", date_debut: "", date_fin: "",
    contact_entrepreneur: "", email_entrepreneur: "", telephone_entrepreneur: "",
    logo_base64: "",
  });
  const [globalParams, setGlobalParams] = useState({
    mobilisation: "", surfacePlancher: "", hauteurCloisons: "", longueurCloisons: "",
  });
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfFilters, setPdfFilters] = useState({
    inactifs: false, avecPrix: true,
    sections: new Set(), colonnes: new Set(),
    sousTotaux: new Set(), adminProfits: new Set(),
    avecSousTotalAvantTaxes: true, avecTps: true, avecTvq: true,
    orientation: "portrait",
  });
  const [adminItems, setAdminItems] = useState([]);
  const [adminEdits, setAdminEdits] = useState({});
  const adminTimers = useRef({});

  // Autocomplete sous-traitant : liste DISTINCT chargée à l'ouverture d'un projet
  // (cf. ouvrirProjet). `subOpenId` = id de la ligne dont le dropdown est visible.
  const [sousTraitantSuggestions, setSousTraitantSuggestions] = useState([]);
  const [subOpenId, setSubOpenId] = useState(null);

  const surfaceMur = useMemo(() => {
    return normalizeNumber(globalParams.hauteurCloisons) * normalizeNumber(globalParams.longueurCloisons);
  }, [globalParams.hauteurCloisons, globalParams.longueurCloisons]);
  const surfaceGypse = surfaceMur * 2;

  const uniqueSections = useMemo(() => {
    const set = new Set();
    lignes.forEach((l) => l.section && set.add(l.section));
    return [...set].sort();
  }, [lignes]);

  const surfaceMurRef = useRef(surfaceMur);
  const surfaceGypseRef = useRef(surfaceGypse);
  useEffect(() => {
    surfaceMurRef.current = surfaceMur;
    surfaceGypseRef.current = surfaceGypse;
  }, [surfaceMur, surfaceGypse]);

  // ── Auth SSO ─────────────────────────────────────────────────────────────
  // Au load : on capture ?token= dans l'URL (issu du dashboard), on valide
  // côté backend via /auth/me, et on récupère le user local ad_budget.users
  // (auto-provisionné si premier login SSO). Pas de JWT ou JWT invalide →
  // redirection vers le dashboard /login.

  useEffect(() => {
    let cancelled = false;
    // Capture ?projet=<id> AVANT que captureTokenFromUrl strip ?token=, et
    // strip soi-même le param pour qu'un F5 ne ré-ouvre pas le projet en boucle.
    try {
      const params = new URLSearchParams(window.location.search);
      const projetId = params.get("projet");
      if (projetId && /^\d+$/.test(projetId)) {
        pendingProjetIdRef.current = parseInt(projetId, 10);
        params.delete("projet");
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
        window.history.replaceState({}, "", newUrl);
      }
    } catch { /* ignore */ }

    async function bootstrap() {
      captureTokenFromUrl();
      const token = getJwt();
      if (!token) {
        redirectToLogin();
        return;
      }
      try {
        // authFetch ajoute automatiquement Authorization: Bearer <token>
        // et redirige vers le dashboard sur 401 (JWT invalide / expiré).
        const res = await authFetch(`${API_URL}/auth/me`);
        if (!res.ok) {
          // 403 = JWT valide mais pas de module ad_bud, ou autre refus.
          clearJwt();
          redirectToLogin();
          return;
        }
        const me = await res.json();
        if (cancelled) return;
        setUser(me);
        setAuthStatus("ready");
        // Premier chargement des projets dès qu'on a le user.
        try { await loadProjets(me.id); } catch { /* l'UI affichera vide */ }
        // Deep-link : si l'URL contenait ?projet=<id>, l'ouvrir maintenant.
        const targetId = pendingProjetIdRef.current;
        if (targetId != null) {
          pendingProjetIdRef.current = null;
          try {
            const projetRes = await authFetch(`${API_URL}/budget/projets/${targetId}`);
            if (projetRes.status === 404 || projetRes.status === 403) {
              showToast("Projet introuvable", "error");
            } else if (projetRes.ok) {
              const projet = await projetRes.json();
              if (!cancelled) await ouvrirProjet(projet);
            } else {
              showToast("Impossible d'ouvrir le projet", "error");
            }
          } catch {
            showToast("Impossible d'ouvrir le projet", "error");
          }
        }
      } catch {
        // Erreur réseau : on reste en loading, l'utilisateur peut retry.
        // Pas de redirection brutale (le backend peut juste être down 2s).
        if (!cancelled) setAuthStatus("error");
      }
    }
    bootstrap();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogout() {
    redirectToLogout();
  }

  // ── Projets ──────────────────────────────────────────────────────────────

  async function loadProjets(userId) {
    const res = await authFetch(`${API_URL}/budget/projets?user_id=${userId}`);
    setProjets(await res.json());
  }

  useEffect(() => {
    if (page === "admin" && user?.email) loadAdminItems();
  }, [page]);

  async function creerProjet() {
    if (!nouveauProjet.nom.trim()) { alert("Le nom du projet est requis."); return; }
    const res = await authFetch(`${API_URL}/budget/projets`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...nouveauProjet, user_id: user.id }),
    });
    const data = await res.json();
    setNouveauProjet({ nom: "", client: "", adresse: "", description: "", statut: "en cours" });
    await ouvrirProjet(data.projet);
  }

  async function ouvrirProjet(projet) {
    setProjetActif(projet);
    setNotes(projet.notes ?? "");
    setPctEdits({});
    Object.values(pctTimers.current).forEach((t) => clearTimeout(t));
    pctTimers.current = {};
    setLoading(true);
    setEdits({});
    setActiveItems(new Set());
    try {
      const lignesRes = await authFetch(`${API_URL}/budget/projets/${projet.id}/lignes`);
      const lignesData = await lignesRes.json();
      setLignes(lignesData);
      setActiveItems(new Set(lignesData.filter((l) => l.actif !== false).map((l) => l.id)));
      // Précharge la liste des sous-traitants déjà saisis (autocomplétion).
      // Échec silencieux : l'autocomplete ne fonctionnera juste pas, l'user
      // peut toujours taper un nouveau nom.
      try {
        const subRes = await authFetch(`${API_URL}/budget/sous-traitants/suggestions`);
        if (subRes.ok) {
          const subs = await subRes.json();
          setSousTraitantSuggestions(Array.isArray(subs) ? subs : []);
        }
      } catch { /* ignore */ }
    } catch {
      alert("Erreur lors du chargement.");
    } finally {
      setLoading(false);
      setPage("budget");
    }
  }

  // ── Budget ────────────────────────────────────────────────────────────────

  function getRow(ligne) {
    const edit = edits[ligne.id] || {};
    const description = edit.description ?? ligne.description ?? "";
    const section = edit.section ?? ligne.section ?? "";
    const unite = edit.unite ?? ligne.unite ?? "global";
    const descLower = description.toLowerCase();

    const isSurfacePlancher = SURFACE_PLANCHER_TERMS.some((t) => descLower.includes(t));
    const isSurfaceMur = SURFACE_MUR_TERMS.some((t) => descLower.includes(t));
    const isSurfaceGypse = SURFACE_GYPSE_TERMS.some((t) => descLower.includes(t));
    const isAutoQte = isSurfacePlancher || isSurfaceMur || isSurfaceGypse || unite === "sem";

    const qte = isSurfacePlancher ? normalizeNumber(globalParams.surfacePlancher)
      : isSurfaceMur ? surfaceMur
      : isSurfaceGypse ? surfaceGypse
      : unite === "sem" ? normalizeNumber(globalParams.mobilisation)
      : normalizeNumber(edit.qte ?? ligne.qte ?? 0);

    const prixUnitaire = normalizeNumber(edit.prixUnitaire ?? ligne.prix_unitaire ?? 0);
    // ajustementPct (ancien ajust global) gardé pour rétro-compat ; n'est plus
    // posé par la nouvelle UI mais reste appliqué si une ligne historique en a.
    const ajustementPct = normalizeNumber(edit.ajustementPct ?? ligne.ajustement_pct ?? 0);
    // Refonte 3 sections : ajustement % par section + sous-totaux séparés.
    const ajustMat = normalizeNumber(edit.ajustMat ?? ligne.ajust_materiaux ?? 0);
    const heures = normalizeNumber(edit.heures ?? ligne.heures ?? 0);
    const tauxHoraire = normalizeNumber(edit.tauxHoraire ?? ligne.taux_horaire ?? 0);
    const ajustMo = normalizeNumber(edit.ajustMo ?? ligne.ajust_main_oeuvre ?? 0);
    const stType = edit.stType ?? ligne.sous_traitant_type ?? "";
    const stNom = edit.stNom ?? ligne.sous_traitant_nom ?? "";
    // sous_traitant_montant remplace cout_sous_traitant ; on lit l'ancien si
    // le nouveau est 0 (compat avec une ligne sauvée avant la migration data).
    const stMontant = normalizeNumber(
      edit.stMontant ?? ligne.sous_traitant_montant
        ?? ligne.cout_sous_traitant ?? 0,
    );
    const ajustSt = normalizeNumber(edit.ajustSt ?? ligne.ajust_sous_traitant ?? 0);
    // Formules — M-O et S-T NE sont PAS multipliés par qte (conforme au spec).
    const stMatVal = qte * prixUnitaire * (1 + ajustMat / 100);
    const stMoVal = heures * tauxHoraire * (1 + ajustMo / 100);
    const stStVal = stMontant * (1 + ajustSt / 100);
    const totalLigne = stMatVal + stMoVal + stStVal;
    // total = totalLigne avec l'ajustement global historique appliqué (no-op
    // pour les nouvelles lignes où ajustementPct=0).
    const total = totalLigne * (1 + ajustementPct / 100);
    // sousTotal exposé pour rétro-compat — somme des 3 sous-totaux par section.
    const sousTotal = totalLigne;

    return {
      ...ligne, section, description, unite, qte, prixUnitaire, ajustementPct,
      ajustMat, heures, tauxHoraire, ajustMo,
      stType, stNom, stMontant, ajustSt,
      stMatVal, stMoVal, stStVal,
      sousTotal, total, totalLigne, isAutoQte,
    };
  }

  function getQteDisplay(ligne) {
    const edit = edits[ligne.id] || {};
    const desc = (edit.description ?? ligne.description ?? "").toLowerCase();
    const unite = edit.unite ?? ligne.unite ?? "global";
    if (SURFACE_PLANCHER_TERMS.some((t) => desc.includes(t))) return String(globalParams.surfacePlancher ?? "");
    if (SURFACE_MUR_TERMS.some((t) => desc.includes(t))) return surfaceMur.toFixed(2);
    if (SURFACE_GYPSE_TERMS.some((t) => desc.includes(t))) return surfaceGypse.toFixed(2);
    if (unite === "sem") return String(globalParams.mobilisation ?? "");
    return String(edit.qte ?? ligne.qte ?? "");
  }

  function updateEdit(id, field, value) {
    const cleanedValue = [
      "qte", "prixUnitaire", "ajustementPct",
      "heures", "tauxHoraire",
      "ajustMat", "ajustMo", "ajustSt", "stMontant",
    ].includes(field)
      ? String(value).replace(",", ".") : value;
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: cleanedValue } }));
    if (autosaveTimers.current[id]) clearTimeout(autosaveTimers.current[id]);
    setAutosaveStatus("en attente de sauvegarde…");
    autosaveTimers.current[id] = setTimeout(() => autoSaveLigne(id), AUTOSAVE_DELAY);
  }

  function updateNotes(value) {
    setNotes(value);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    setAutosaveStatus("en attente de sauvegarde…");
    notesTimer.current = setTimeout(() => saveNotes(value), AUTOSAVE_DELAY);
  }

  async function saveNotes(value) {
    if (!projetActif) return;
    try {
      await authFetch(`${API_URL}/budget/projets/${projetActif.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      });
      setAutosaveStatus("sauvegardé ✓");
      setTimeout(() => setAutosaveStatus(""), 2000);
    } catch {
      setAutosaveStatus("erreur ✗");
    }
  }

  function pctVal(field) {
    if (field in pctEdits) return pctEdits[field];
    const v = projetActif?.[field];
    if (v == null) return "0";
    return String(parseFloat(v));
  }

  function updatePctField(field, value) {
    setPctEdits((prev) => ({ ...prev, [field]: value }));
    if (pctTimers.current[field]) clearTimeout(pctTimers.current[field]);
    setAutosaveStatus("en attente de sauvegarde…");
    pctTimers.current[field] = setTimeout(() => savePctField(field, value), AUTOSAVE_DELAY);
  }

  async function savePctField(field, rawValue) {
    if (!projetActif) return;
    const num = normalizeNumber(rawValue);
    try {
      const res = await authFetch(`${API_URL}/budget/projets/${projetActif.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: num }),
      });
      if (!res.ok) throw new Error();
      setProjetActif((prev) => (prev ? { ...prev, [field]: num } : prev));
      setPctEdits((prev) => { const next = { ...prev }; delete next[field]; return next; });
      setAutosaveStatus("sauvegardé ✓");
      setTimeout(() => setAutosaveStatus(""), 2000);
    } catch {
      setAutosaveStatus("erreur ✗");
    }
  }

  function toggleTotalSousTotal(key) {
    setTotalsVisibility((prev) => {
      const cur = prev[key] || { sousTotal: true, adminProfit: true };
      if (cur.sousTotal) {
        return { ...prev, [key]: { sousTotal: false, adminProfit: false } };
      }
      return { ...prev, [key]: { ...cur, sousTotal: true } };
    });
  }

  function toggleTotalAdminProfit(key) {
    setTotalsVisibility((prev) => {
      const cur = prev[key] || { sousTotal: true, adminProfit: true };
      if (!cur.sousTotal) return prev;
      return { ...prev, [key]: { ...cur, adminProfit: !cur.adminProfit } };
    });
  }

  function toggleTotalsFlag(key) {
    setTotalsVisibility((prev) => ({ ...prev, [key]: prev[key] === false ? true : false }));
  }

  const INFO_FIELDS = [
    "nom",
    "nom_client", "contact_client", "email_client", "telephone_client",
    "numero_projet", "date_debut", "date_fin",
    "contact_entrepreneur", "email_entrepreneur", "telephone_entrepreneur",
    "logo_base64",
  ];

  function openInfoModal() {
    if (!projetActif) return;
    const init = {};
    for (const f of INFO_FIELDS) {
      const v = projetActif[f];
      if (f === "date_debut" || f === "date_fin") {
        init[f] = v ? String(v).slice(0, 10) : "";
      } else {
        init[f] = v == null ? "" : v;
      }
    }
    setInfoEdits(init);
    setInfoSaving(false);
    setShowInfoModal(true);
  }

  function setInfoField(field, value) {
    setInfoEdits((prev) => ({ ...prev, [field]: value }));
  }

  async function saveInfoModal() {
    if (!projetActif) return;
    setInfoSaving(true);
    try {
      const res = await authFetch(`${API_URL}/budget/projets/${projetActif.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(infoEdits),
      });
      if (!res.ok) throw new Error();
      setProjetActif((prev) => (prev ? { ...prev, ...infoEdits } : prev));
      setShowInfoModal(false);
    } catch {
      alert("Erreur lors de la sauvegarde des informations.");
    } finally {
      setInfoSaving(false);
    }
  }

  function openPdfModal() {
    const sousTotauxInit = new Set();
    const adminProfitsInit = new Set();
    for (const g of BUDGET_GROUPS) {
      const vis = totalsVisibility[g.key] || { sousTotal: true, adminProfit: true };
      if (vis.sousTotal) sousTotauxInit.add(g.key);
      if (vis.adminProfit) adminProfitsInit.add(g.key);
    }
    setPdfFilters({
      inactifs: false,
      avecPrix: true,
      sections: new Set(uniqueSections),
      colonnes: new Set(PDF_COLUMNS.map((c) => c.key)),
      sousTotaux: sousTotauxInit,
      adminProfits: adminProfitsInit,
      avecSousTotalAvantTaxes: totalsVisibility.sousTotalAvantTaxes !== false,
      avecTps: totalsVisibility.tps !== false,
      avecTvq: totalsVisibility.tvq !== false,
      orientation: "portrait",
    });
    setShowPdfModal(true);
  }

  function togglePdfSection(sec) {
    setPdfFilters((prev) => {
      const next = new Set(prev.sections);
      if (next.has(sec)) next.delete(sec);
      else next.add(sec);
      return { ...prev, sections: next };
    });
  }

  function togglePdfColumn(col) {
    setPdfFilters((prev) => {
      const next = new Set(prev.colonnes);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return { ...prev, colonnes: next };
    });
  }

  function togglePdfSousTotal(key) {
    setPdfFilters((prev) => {
      const sousTotaux = new Set(prev.sousTotaux);
      const adminProfits = new Set(prev.adminProfits);
      if (sousTotaux.has(key)) {
        sousTotaux.delete(key);
        adminProfits.delete(key);
      } else {
        sousTotaux.add(key);
      }
      return { ...prev, sousTotaux, adminProfits };
    });
  }

  function togglePdfAdminProfit(key) {
    setPdfFilters((prev) => {
      const adminProfits = new Set(prev.adminProfits);
      if (adminProfits.has(key)) adminProfits.delete(key);
      else adminProfits.add(key);
      return { ...prev, adminProfits };
    });
  }

  function generatePdf() {
    if (!projetActif) return;
    const params = new URLSearchParams();
    params.set("actifs_seulement", String(!pdfFilters.inactifs));
    params.set("avec_prix", String(pdfFilters.avecPrix));
    params.set("avec_sous_total_avant_taxes", String(pdfFilters.avecSousTotalAvantTaxes));
    params.set("avec_tps", String(pdfFilters.avecTps));
    params.set("avec_tvq", String(pdfFilters.avecTvq));
    params.set("orientation", pdfFilters.orientation);
    const allSectionsSelected = pdfFilters.sections.size === uniqueSections.length;
    if (!allSectionsSelected && pdfFilters.sections.size > 0) {
      params.set("sections", [...pdfFilters.sections].join(","));
    }
    const allColsSelected = pdfFilters.colonnes.size === PDF_COLUMNS.length;
    if (!allColsSelected && pdfFilters.colonnes.size > 0) {
      const ordered = PDF_COLUMNS.filter((c) => pdfFilters.colonnes.has(c.key)).map((c) => c.key);
      params.set("colonnes", ordered.join(","));
    }
    const allSousSelected = pdfFilters.sousTotaux.size === BUDGET_GROUPS.length;
    if (!allSousSelected) {
      const ordered = BUDGET_GROUPS.filter((g) => pdfFilters.sousTotaux.has(g.key)).map((g) => g.key);
      params.set("sous_totaux", ordered.join(","));
    }
    const allAdminSelected = pdfFilters.adminProfits.size === BUDGET_GROUPS.length;
    if (!allAdminSelected) {
      const ordered = BUDGET_GROUPS.filter((g) => pdfFilters.adminProfits.has(g.key)).map((g) => g.key);
      params.set("admin_profits", ordered.join(","));
    }
    if (globalParams.mobilisation) params.set("mobilisation", globalParams.mobilisation);
    if (globalParams.surfacePlancher) params.set("surface_plancher", globalParams.surfacePlancher);
    if (globalParams.hauteurCloisons) params.set("hauteur_cloisons", globalParams.hauteurCloisons);
    if (globalParams.longueurCloisons) params.set("longueur_cloisons", globalParams.longueurCloisons);
    // GET avec téléchargement → on peut pas mettre le JWT en header sur
    // window.open. On le passe en query (?token=) ; le backend accepte
    // header OU query pour les endpoints GET de download.
    const token = getJwt();
    if (token) params.set("token", token);
    window.open(`${API_URL}/budget/projets/${projetActif.id}/pdf?${params}`, "_blank");
    setShowPdfModal(false);
  }

  async function loadAdminItems() {
    if (!user?.email) return;
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/budget/admin/items`);
      if (res.status === 403) {
        alert("Accès admin requis. Contacte l'administrateur pour obtenir le rôle.");
        setPage("projets");
        return;
      }
      const data = await res.json();
      setAdminItems(Array.isArray(data) ? data : []);
      setAdminEdits({});
    } catch {
      alert("Erreur lors du chargement de la BD maître.");
    } finally {
      setLoading(false);
    }
  }

  function adminUpdateEdit(id, field, value) {
    const cleaned = field === "prix_unitaire" ? String(value).replace(",", ".") : value;
    setAdminEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: cleaned } }));
    if (adminTimers.current[id]) clearTimeout(adminTimers.current[id]);
    setAutosaveStatus("en attente de sauvegarde…");
    adminTimers.current[id] = setTimeout(() => adminSaveItem(id), AUTOSAVE_DELAY);
  }

  async function adminSaveItem(id) {
    const item = adminItems.find((i) => i.id === id);
    if (!item) return;
    const edit = adminEdits[id] || {};
    const payload = {};
    for (const f of ["section", "division", "description", "unite", "note"]) {
      if (f in edit) payload[f] = edit[f];
    }
    if ("prix_unitaire" in edit) {
      payload.prix_unitaire = normalizeNumber(edit.prix_unitaire);
    }
    if (Object.keys(payload).length === 0) return;
    try {
      const res = await authFetch(
        `${API_URL}/budget/admin/items/${id}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      if (!res.ok) throw new Error("Erreur");
      setAdminItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...payload } : i)));
      setAdminEdits((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setAutosaveStatus("sauvegardé ✓");
      setTimeout(() => setAutosaveStatus(""), 2000);
    } catch {
      setAutosaveStatus("erreur ✗");
    }
  }

  async function adminCreateItem() {
    try {
      const res = await authFetch(
        `${API_URL}/budget/admin/items`,
        {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: "Divers", description: "Nouvel item",
                                 unite: "global", prix_unitaire: 0 }),
        },
      );
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setAdminItems((prev) => [data.item, ...prev]);
    } catch {
      alert("Erreur lors de la création.");
    }
  }

  async function adminDeleteItem(id, label) {
    if (!confirm(`Supprimer l'item "${label}" de la BD maître ?\n\nCette action est irréversible et n'affecte pas les projets existants.`)) return;
    try {
      const res = await authFetch(
        `${API_URL}/budget/admin/items/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Erreur");
      setAdminItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      alert("Erreur lors de la suppression.");
    }
  }

  async function autoSaveLigne(id) {
    const ligne = lignes.find((l) => l.id === id);
    if (!ligne) return;
    setEdits((currentEdits) => { saveLigneData(ligne, currentEdits); return currentEdits; });
  }

  async function saveLigneData(ligne, currentEdits) {
    const edit = (currentEdits || edits)[ligne.id] || {};
    const desc = (edit.description ?? ligne.description ?? "").toLowerCase();
    const unite = edit.unite ?? ligne.unite ?? "global";
    const isSurfacePlancher = SURFACE_PLANCHER_TERMS.some((t) => desc.includes(t));
    const isSurfaceMur = SURFACE_MUR_TERMS.some((t) => desc.includes(t));
    const isSurfaceGypse = SURFACE_GYPSE_TERMS.some((t) => desc.includes(t));
    const qte = isSurfacePlancher ? normalizeNumber(globalParams.surfacePlancher)
      : isSurfaceMur ? surfaceMurRef.current
      : isSurfaceGypse ? surfaceGypseRef.current
      : unite === "sem" ? normalizeNumber(globalParams.mobilisation)
      : normalizeNumber(edit.qte ?? ligne.qte ?? 0);

    setSaving((prev) => new Set(prev).add(ligne.id));
    try {
      await authFetch(`${API_URL}/budget/projets/${projetActif.id}/lignes/${ligne.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: edit.section ?? ligne.section,
          description: edit.description ?? ligne.description,
          unite: edit.unite ?? ligne.unite,
          prix_unitaire: normalizeNumber(edit.prixUnitaire ?? ligne.prix_unitaire ?? 0),
          qte,
          ajustement_pct: normalizeNumber(edit.ajustementPct ?? ligne.ajustement_pct ?? 0),
          note: edit.note ?? ligne.note ?? "",
          heures: normalizeNumber(edit.heures ?? ligne.heures ?? 0),
          taux_horaire: normalizeNumber(edit.tauxHoraire ?? ligne.taux_horaire ?? 0),
          // Refonte 3 sections : ajust % par section + S-T type/montant.
          // sous_traitant_nom conserve sa colonne historique (autocomplete).
          ajust_materiaux: normalizeNumber(edit.ajustMat ?? ligne.ajust_materiaux ?? 0),
          ajust_main_oeuvre: normalizeNumber(edit.ajustMo ?? ligne.ajust_main_oeuvre ?? 0),
          ajust_sous_traitant: normalizeNumber(edit.ajustSt ?? ligne.ajust_sous_traitant ?? 0),
          sous_traitant_type: (edit.stType ?? ligne.sous_traitant_type ?? "") || null,
          sous_traitant_montant: normalizeNumber(edit.stMontant ?? ligne.sous_traitant_montant ?? 0),
          sous_traitant_nom: edit.stNom ?? ligne.sous_traitant_nom ?? "",
        }),
      });
      setAutosaveStatus("sauvegardé ✓");
      setTimeout(() => setAutosaveStatus(""), 2000);
    } catch {
      setAutosaveStatus("erreur ✗");
    } finally {
      setSaving((prev) => { const next = new Set(prev); next.delete(ligne.id); return next; });
    }
  }

  // Ajoute une ligne vide juste après la ligne référencée
  async function ajouterLigneApres(ligneRef) {
    const res = await authFetch(`${API_URL}/budget/projets/${projetActif.id}/lignes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section: ligneRef.section,
        description: "Nouvel élément",
        unite: "global",
        prix_unitaire: 0,
      }),
    });
    const data = await res.json();
    setLignes((prev) => {
      const idx = prev.findIndex((l) => l.id === ligneRef.id);
      const next = [...prev];
      next.splice(idx + 1, 0, data.ligne);
      return next;
    });
    setActiveItems((prev) => new Set(prev).add(data.ligne.id));
  }

  async function supprimerLigne(id) {
    if (!confirm("Supprimer cet élément ?")) return;
    if (autosaveTimers.current[id]) clearTimeout(autosaveTimers.current[id]);
    await authFetch(`${API_URL}/budget/projets/${projetActif.id}/lignes/${id}`, { method: "DELETE" });
    setLignes((prev) => prev.filter((l) => l.id !== id));
    setActiveItems((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  async function toggleActive(id) {
    if (!projetActif) return;
    const wasActive = activeItems.has(id);
    const newActif = !wasActive;
    // Optimistic UI update
    setActiveItems((prev) => {
      const next = new Set(prev);
      newActif ? next.add(id) : next.delete(id);
      return next;
    });
    try {
      const res = await authFetch(
        `${API_URL}/budget/projets/${projetActif.id}/lignes/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actif: newActif }),
        },
      );
      if (!res.ok) throw new Error();
      setLignes((prev) => prev.map((l) => (l.id === id ? { ...l, actif: newActif } : l)));
    } catch {
      // Rollback
      setActiveItems((prev) => {
        const next = new Set(prev);
        wasActive ? next.add(id) : next.delete(id);
        return next;
      });
      setAutosaveStatus("erreur ✗");
      setTimeout(() => setAutosaveStatus(""), 2000);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const budgetLignes = useMemo(() => {
    return lignes
      .filter((l) => activeItems.has(l.id))
      .map((l) => getRow(l))
      // On garde les lignes qui contribuent à au moins une des 3 sections
      // (matériaux nécessite qte ET prix ; M-O nécessite heures et taux ;
      // S-T nécessite un montant). Ça permet à une ligne pure sous-traitant
      // (qte=0) d'apparaître dans le total et le breakdown.
      .filter((l) => l.stMatVal > 0 || l.stMoVal > 0 || l.stStVal > 0);
  }, [lignes, edits, globalParams, activeItems, surfaceMur, surfaceGypse]);

  const grandTotal = budgetLignes.reduce((sum, l) => sum + l.total, 0);
  const lignesByPrefix = useMemo(() => groupByPrefix(lignes), [lignes]);

  // Ventilation 3 sections (post-ajust % par section, pré-taxes). Calculée
  // sur les lignes actives — cohérent avec le total général affiché.
  const breakdownTotals = useMemo(() => {
    let materiaux = 0, mo = 0, st = 0;
    for (const l of budgetLignes) {
      materiaux += l.stMatVal || 0;
      mo += l.stMoVal || 0;
      st += l.stStVal || 0;
    }
    return { materiaux, mo, st };
  }, [budgetLignes]);

  const groupTotals = useMemo(() => {
    const result = BUDGET_GROUPS.map((g) => ({ ...g, subtotal: 0 }));
    for (const l of budgetLignes) {
      const prefix = getPrefix(l.section);
      const n = parseInt(prefix, 10);
      if (isNaN(n)) continue;
      for (const g of result) {
        if (g.matches(n)) { g.subtotal += l.total; break; }
      }
    }
    return result;
  }, [budgetLignes]);

  const sousTotalAvantTaxes = useMemo(() => {
    let t = grandTotal;
    for (const g of groupTotals) {
      const raw = (g.pctField in pctEdits) ? pctEdits[g.pctField] : (projetActif?.[g.pctField] ?? 0);
      const pct = normalizeNumber(raw) || 0;
      t += g.subtotal * pct / 100;
    }
    return t;
  }, [grandTotal, groupTotals, pctEdits, projetActif]);

  const tpsAmount = sousTotalAvantTaxes * TPS_RATE;
  const tvqAmount = sousTotalAvantTaxes * TVQ_RATE;

  const totalGeneral = useMemo(() => {
    let t = sousTotalAvantTaxes;
    if (totalsVisibility.tps !== false) t += tpsAmount;
    if (totalsVisibility.tvq !== false) t += tvqAmount;
    return t;
  }, [sousTotalAvantTaxes, tpsAmount, tvqAmount, totalsVisibility]);

  // Multiplicateur d'affichage par regroupement : si admin & profit décoché et
  // sous-total coché, le total des lignes du regroupement est gonflé pour afficher
  // la part d'admin & profit distribuée pro rata. Display-only : aucune écriture en BD.
  const groupAdminFactors = useMemo(() => {
    const factors = {};
    for (const g of BUDGET_GROUPS) {
      const vis = totalsVisibility[g.key] || { sousTotal: true, adminProfit: true };
      if (vis.sousTotal && !vis.adminProfit) {
        const raw = (g.pctField in pctEdits) ? pctEdits[g.pctField] : (projetActif?.[g.pctField] ?? 0);
        const pct = normalizeNumber(raw) || 0;
        factors[g.key] = 1 + pct / 100;
      } else {
        factors[g.key] = 1;
      }
    }
    return factors;
  }, [totalsVisibility, pctEdits, projetActif]);

  function toggleCollapsedBudget(prefix) {
    setCollapsedBudget((prev) => {
      const next = new Set(prev);
      next.has(prefix) ? next.delete(prefix) : next.add(prefix);
      return next;
    });
  }

  // ── Nav ──────────────────────────────────────────────────────────────────

  const LogoUpload = ({ value, setter }) => {
    const hasCustom = !!value;
    return (
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12,
                    background: "#fff", textAlign: "center", width: 200 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#475569",
                      marginBottom: 8, textTransform: "uppercase",
                      letterSpacing: 0.5 }}>Logo du projet</div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center",
                      height: 80, marginBottom: 8 }}>
          <img src={hasCustom ? value : DEFAULT_LOGO_URL} alt="Logo"
            style={{ maxWidth: "100%", maxHeight: 80, objectFit: "contain" }} />
        </div>
        {!hasCustom && (
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, fontStyle: "italic" }}>
            Logo par défaut Adision
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <label className="ad-btn-secondary" style={{ ...styles.btnSecondary, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>
            Téléverser
            <input type="file" accept="image/png,image/jpeg"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const result = await processLogoFile(file);
                if (result) setter(result);
                e.target.value = "";
              }}
              style={{ display: "none" }} />
          </label>
          {hasCustom && (
            <button className="ad-btn-secondary" onClick={() => setter("")}
              style={{ ...styles.btnSecondary, padding: "5px 10px", fontSize: 12, color: "#ef4444" }}>
              Retirer
            </button>
          )}
        </div>
      </div>
    );
  };

  const Nav = () => (
    <nav style={styles.nav}>
      <ModuleSwitcher modules={user?.modules || []} currentModule="ad_bud" />
      <div style={styles.navUser}>
        <span>👤 {user?.nom || user?.email}</span>
        {user?.role === "admin" && page !== "admin" && (
          <button className="adision-nav-btn" style={styles.navLogout} onClick={() => setPage("admin")}>🛠️ Admin</button>
        )}
        <button className="adision-nav-btn" style={styles.navLogout} onClick={handleLogout}>Déconnexion</button>
      </div>
    </nav>
  );

  // ── Pages ─────────────────────────────────────────────────────────────────

  // L'auth SSO est encore en cours de bootstrap (validation /auth/me) :
  // on évite de flasher un écran vide ou un état non authentifié.
  if (authStatus !== "ready") {
    return (
      <div style={styles.loginPage}>
        <div style={{ color: "#fff", fontSize: 14, opacity: 0.85 }}>
          {authStatus === "error" ? "Connexion au serveur impossible…" : "Chargement…"}
        </div>
      </div>
    );
  }

  const toastBanner = toast ? (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed", top: 24, right: 24, zIndex: 1200,
        background: toast.kind === "error" ? "#fef2f2" : "#ecfdf5",
        color: toast.kind === "error" ? "#991b1b" : "#065f46",
        border: `1px solid ${toast.kind === "error" ? "#fecaca" : "#6ee7b7"}`,
        padding: "12px 16px", borderRadius: 8,
        fontSize: 14, fontWeight: 500,
        boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
        maxWidth: 420,
      }}
    >
      {toast.message}
    </div>
  ) : null;

  if (page === "projets") {
    return (
      <div style={styles.app}>
        {toastBanner}
        <Nav />
        <div style={styles.page}>
          <h1 style={styles.pageTitle}>Mes projets</h1>
          <div style={styles.projetsGrid}>
            {projets.map((p) => (
              <div key={p.id} className="adision-projet-card"
                style={{ ...styles.projetCard, position: "relative" }} onClick={() => ouvrirProjet(p)}>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const res = await authFetch(`${API_URL}/budget/projets/${p.id}/duplicate`, { method: "POST" });
                      if (!res.ok) throw new Error("Erreur");
                      await loadProjets(user.id);
                    } catch (err) {
                      alert("Erreur lors de la duplication.");
                    }
                  }}
                  style={{
                    position: "absolute", top: 8, right: 36,
                    background: "transparent", border: "none",
                    cursor: "pointer", fontSize: 16, color: "#94a3b8",
                    padding: 4, lineHeight: 1, borderRadius: 4
                  }}
                  title="Dupliquer ce projet"
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#2563eb"; e.currentTarget.style.background = "#dbeafe"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "transparent"; }}
                >📋</button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Supprimer le projet "${p.nom}" ?\n\nCette action est irréversible.`)) return;
                    try {
                      const res = await authFetch(`${API_URL}/budget/projets/${p.id}`, { method: "DELETE" });
                      if (!res.ok) throw new Error("Erreur");
                      setProjets(projets.filter(x => x.id !== p.id));
                    } catch (err) {
                      alert("Erreur lors de la suppression.");
                    }
                  }}
                  style={{
                    position: "absolute", top: 8, right: 8,
                    background: "transparent", border: "none",
                    cursor: "pointer", fontSize: 16, color: "#94a3b8",
                    padding: 4, lineHeight: 1, borderRadius: 4
                  }}
                  title="Supprimer ce projet"
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#fee2e2"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "transparent"; }}
                >🗑️</button>
                <div style={styles.projetCardTitle}>{p.nom}</div>
                {(p.nom_client || p.client) && <div style={styles.projetCardInfo}>👤 {p.nom_client || p.client}</div>}
                {p.adresse && <div style={styles.projetCardInfo}>📍 {p.adresse}</div>}
                <span style={{ ...styles.projetCardStatut, ...statutColor(p.statut) }}>{p.statut}</span>
              </div>
            ))}
            <div style={styles.newProjetCard} onClick={() => setPage("nouveau-projet")}>
              <span style={{ fontSize: 30, marginBottom: 8 }}>+</span>
              Nouveau projet
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (page === "nouveau-projet") {
    return (
      <div style={styles.app}>
        {toastBanner}
        <Nav />
        <div style={styles.page}>
          <button style={styles.btnBack} onClick={() => setPage("projets")}>← Retour</button>
          <h1 style={styles.pageTitle}>Nouveau projet</h1>
          <div style={styles.card}>
            <div style={styles.cardBody}>
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
                <LogoUpload value={nouveauProjet.logo_base64}
                  setter={(v) => setNouveauProjet((p) => ({ ...p, logo_base64: v }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569",
                                marginBottom: 10, textTransform: "uppercase",
                                letterSpacing: 0.5 }}>Client</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={styles.formLabel}>Nom du projet *</label>
                      <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={nouveauProjet.nom}
                        onChange={(e) => setNouveauProjet((p) => ({ ...p, nom: e.target.value }))}
                        placeholder="Ex: Rénovation bureau 3e étage" />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Nom du client</label>
                      <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={nouveauProjet.nom_client}
                        onChange={(e) => setNouveauProjet((p) => ({ ...p, nom_client: e.target.value }))} />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Adresse</label>
                      <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={nouveauProjet.adresse}
                        onChange={(e) => setNouveauProjet((p) => ({ ...p, adresse: e.target.value }))}
                        placeholder="123 rue Exemple, Montréal" />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Nom du contact</label>
                      <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={nouveauProjet.contact_client}
                        onChange={(e) => setNouveauProjet((p) => ({ ...p, contact_client: e.target.value }))} />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Courriel</label>
                      <input type="email" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={nouveauProjet.email_client}
                        onChange={(e) => setNouveauProjet((p) => ({ ...p, email_client: e.target.value }))} />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Téléphone</label>
                      <input type="tel" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={nouveauProjet.telephone_client}
                        onChange={(e) => setNouveauProjet((p) => ({ ...p, telephone_client: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569",
                                marginBottom: 10, textTransform: "uppercase",
                                letterSpacing: 0.5 }}>Entrepreneur</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={styles.formLabel}>Numéro du projet</label>
                      <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={nouveauProjet.numero_projet}
                        onChange={(e) => setNouveauProjet((p) => ({ ...p, numero_projet: e.target.value }))} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={styles.formLabel}>Date début travaux</label>
                        <input type="date" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                          value={nouveauProjet.date_debut}
                          onChange={(e) => setNouveauProjet((p) => ({ ...p, date_debut: e.target.value }))} />
                      </div>
                      <div>
                        <label style={styles.formLabel}>Date fin travaux</label>
                        <input type="date" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                          value={nouveauProjet.date_fin}
                          onChange={(e) => setNouveauProjet((p) => ({ ...p, date_fin: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label style={styles.formLabel}>Contact entrepreneur</label>
                      <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={nouveauProjet.contact_entrepreneur}
                        onChange={(e) => setNouveauProjet((p) => ({ ...p, contact_entrepreneur: e.target.value }))} />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Courriel</label>
                      <input type="email" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={nouveauProjet.email_entrepreneur}
                        onChange={(e) => setNouveauProjet((p) => ({ ...p, email_entrepreneur: e.target.value }))} />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Téléphone</label>
                      <input type="tel" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={nouveauProjet.telephone_entrepreneur}
                        onChange={(e) => setNouveauProjet((p) => ({ ...p, telephone_entrepreneur: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={styles.formLabel}>Description</label>
                  <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                    value={nouveauProjet.description}
                    onChange={(e) => setNouveauProjet((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Description optionnelle" />
                </div>
                <div>
                  <label style={styles.formLabel}>Statut</label>
                  <select style={{ ...styles.formSelect, width: "100%", boxSizing: "border-box" }}
                    value={nouveauProjet.statut}
                    onChange={(e) => setNouveauProjet((p) => ({ ...p, statut: e.target.value }))}>
                    <option value="en cours">En cours</option>
                    <option value="complété">Complété</option>
                    <option value="archivé">Archivé</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={styles.btnPrimary} onClick={creerProjet}>Créer le projet</button>
                <button className="ad-btn-secondary" style={styles.btnSecondary} onClick={() => setPage("projets")}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Rend une cellule du tableau Budget pour une colonne donnée. Toutes les
  // dépendances (edits, callbacks, suggestions, colWidths…) sont capturées
  // par closure ; permet de garder le markup tbody compact et la liste de
  // colonnes 100% data-driven (toggle visibilité, ordre, etc.).
  function renderBudgetCell({ col, ligne, row, edit, isActive, boundary }) {
    const w = colWidths[col.key] || col.defaultWidth;
    const sectBg = col.group ? BUDGET_SECTIONS[col.group].bgRow : undefined;
    const tdBase = {
      ...styles.td, width: w,
      ...(sectBg ? { background: sectBg } : {}),
      ...(boundary ? { borderLeft: SECTION_BORDER } : {}),
    };
    const numCellStyle = { ...tdBase, color: "#475569", textAlign: "right" };
    switch (col.key) {
      case "actif":
        return (
          <td key={col.key} style={{ ...tdBase, textAlign: "center" }}>
            <button onClick={() => toggleActive(ligne.id)}
              style={isActive ? styles.btnToggleActive : styles.btnToggleInactive}
              title={isActive ? "Actif — cliquer pour désactiver" : "Inactif — cliquer pour activer"}>
              {isActive ? "✓" : "✗"}
            </button>
          </td>
        );
      case "section":
        return (
          <td key={col.key} style={tdBase}>
            <input value={edit.section ?? ligne.section ?? ""}
              onChange={(e) => updateEdit(ligne.id, "section", e.target.value)}
              style={styles.input} />
          </td>
        );
      case "description":
        return (
          <td key={col.key} style={tdBase}>
            <input value={edit.description ?? ligne.description ?? ""}
              onChange={(e) => updateEdit(ligne.id, "description", e.target.value)}
              style={styles.input} />
          </td>
        );
      case "qte":
        return (
          <td key={col.key} style={tdBase}>
            <input type="text" inputMode="decimal"
              value={getQteDisplay(ligne)}
              disabled={row.isAutoQte}
              onChange={(e) => updateEdit(ligne.id, "qte", e.target.value)}
              style={row.isAutoQte ? styles.inputDisabled : styles.input} />
          </td>
        );
      case "unite":
        return (
          <td key={col.key} style={tdBase}>
            <select value={edit.unite ?? ligne.unite ?? "global"}
              onChange={(e) => updateEdit(ligne.id, "unite", e.target.value)}
              style={styles.select}>
              {allowedUnites.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </td>
        );
      case "prix":
        return (
          <td key={col.key} style={tdBase}>
            <input type="text" inputMode="decimal"
              value={edit.prixUnitaire ?? Number(ligne.prix_unitaire || 0).toFixed(2)}
              onChange={(e) => updateEdit(ligne.id, "prixUnitaire", e.target.value)}
              style={styles.input} />
          </td>
        );
      case "ajustMat":
        return (
          <td key={col.key} style={tdBase}>
            <input type="text" inputMode="decimal"
              value={edit.ajustMat ?? String(parseFloat(ligne.ajust_materiaux ?? 0))}
              onChange={(e) => updateEdit(ligne.id, "ajustMat", e.target.value)}
              style={styles.input} />
          </td>
        );
      case "stMat":
        return (
          <td key={col.key} style={numCellStyle}>
            {row.stMatVal.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
          </td>
        );
      case "heures":
        return (
          <td key={col.key} style={tdBase}>
            <input type="text" inputMode="decimal"
              value={edit.heures ?? String(parseFloat(ligne.heures ?? 0))}
              onChange={(e) => updateEdit(ligne.id, "heures", e.target.value)}
              style={styles.input} />
          </td>
        );
      case "tauxHoraire":
        return (
          <td key={col.key} style={tdBase}>
            <input type="text" inputMode="decimal"
              value={edit.tauxHoraire ?? String(parseFloat(ligne.taux_horaire ?? 0))}
              onChange={(e) => updateEdit(ligne.id, "tauxHoraire", e.target.value)}
              style={styles.input} />
          </td>
        );
      case "ajustMo":
        return (
          <td key={col.key} style={tdBase}>
            <input type="text" inputMode="decimal"
              value={edit.ajustMo ?? String(parseFloat(ligne.ajust_main_oeuvre ?? 0))}
              onChange={(e) => updateEdit(ligne.id, "ajustMo", e.target.value)}
              style={styles.input} />
          </td>
        );
      case "stMo":
        return (
          <td key={col.key} style={numCellStyle}>
            {row.stMoVal.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
          </td>
        );
      case "stType": {
        // Warning visuel si type vide ET montant > 0 — bordure jaune discrète.
        const typeVal = edit.stType ?? ligne.sous_traitant_type ?? "";
        const montantVal = normalizeNumber(edit.stMontant ?? ligne.sous_traitant_montant ?? 0);
        const warn = !typeVal && montantVal > 0;
        return (
          <td key={col.key} style={tdBase}>
            <select value={typeVal}
              onChange={(e) => updateEdit(ligne.id, "stType", e.target.value)}
              style={{ ...styles.select, ...(warn ? { borderColor: "#facc15", borderWidth: 2 } : {}) }}
              title={warn ? "Montant saisi sans type — sélectionne un type" : undefined}>
              <option value="">Choisir…</option>
              {SOUS_TRAITANT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </td>
        );
      }
      case "stNom": {
        // Autocomplete préservé : focus = liste filtrée, click = applique.
        const currentVal = edit.stNom ?? ligne.sous_traitant_nom ?? "";
        const isOpen = subOpenId === ligne.id;
        const filtered = isOpen
          ? sousTraitantSuggestions.filter((s) =>
              s && s.toLowerCase().includes(currentVal.toLowerCase()) && s !== currentVal)
          : [];
        return (
          <td key={col.key} style={{ ...tdBase, position: "relative" }}>
            <input value={currentVal}
              onChange={(e) => updateEdit(ligne.id, "stNom", e.target.value)}
              onFocus={() => setSubOpenId(ligne.id)}
              onBlur={() => setTimeout(() => {
                setSubOpenId((cur) => (cur === ligne.id ? null : cur));
              }, 150)}
              style={styles.input}
              placeholder="ex: ABC Plomberie" />
            {isOpen && filtered.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0,
                background: "#fff", border: "1px solid #cbd5e1",
                borderRadius: 6, boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
                maxHeight: 180, overflowY: "auto", zIndex: 50,
              }}>
                {filtered.slice(0, 10).map((s) => (
                  <div key={s}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      updateEdit(ligne.id, "stNom", s);
                      setSubOpenId(null);
                    }}
                    style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer", color: "#0f172a" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    {s}
                  </div>
                ))}
              </div>
            )}
          </td>
        );
      }
      case "stMontant":
        return (
          <td key={col.key} style={tdBase}>
            <input type="text" inputMode="decimal"
              value={edit.stMontant ?? String(parseFloat(ligne.sous_traitant_montant ?? 0))}
              onChange={(e) => updateEdit(ligne.id, "stMontant", e.target.value)}
              style={styles.input} />
          </td>
        );
      case "ajustSt":
        return (
          <td key={col.key} style={tdBase}>
            <input type="text" inputMode="decimal"
              value={edit.ajustSt ?? String(parseFloat(ligne.ajust_sous_traitant ?? 0))}
              onChange={(e) => updateEdit(ligne.id, "ajustSt", e.target.value)}
              style={styles.input} />
          </td>
        );
      case "stSt":
        return (
          <td key={col.key} style={numCellStyle}>
            {row.stStVal.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
          </td>
        );
      case "total":
        return (
          <td key={col.key} style={{ ...tdBase, textAlign: "right" }}>
            <strong style={styles.amountStrong}>
              {row.total.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
            </strong>
          </td>
        );
      case "note":
        return (
          <td key={col.key} style={tdBase}>
            <input value={edit.note ?? ligne.note ?? ""}
              onChange={(e) => updateEdit(ligne.id, "note", e.target.value)}
              style={styles.input} placeholder="Note..." />
          </td>
        );
      case "actions":
        return (
          <td key={col.key} style={{ ...tdBase, whiteSpace: "nowrap" }}>
            <button className="adision-btn-add-line" style={styles.btnAddRow}
              onClick={() => ajouterLigneApres(ligne)}>+ Ligne</button>
            <button className="adision-btn-row-delete" onClick={() => supprimerLigne(ligne.id)}
              style={styles.btnDelete}>✕</button>
          </td>
        );
      default:
        return <td key={col.key} style={tdBase} />;
    }
  }

  if (page === "budget") {
    return (
      <div style={styles.app}>
        {toastBanner}
        <Nav />
        <div style={styles.page}>
          <button style={styles.btnBack} onClick={() => { setPage("projets"); loadProjets(user.id); }}>
            ← Mes projets
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <h1 style={{ ...styles.pageTitle, marginBottom: 2 }}>{projetActif?.nom}</h1>
                {/* Toggle des notes — œil ici (et plus dans la zone Notes
                    elle-même) pour rester accessible quand le bloc Notes
                    est replié. */}
                <span
                  onClick={() => setNotesVisible((v) => !v)}
                  title={notesVisible ? "Cacher les notes" : "Afficher les notes"}
                  style={{
                    cursor: "pointer", fontSize: 18, color: "#991b1b",
                    userSelect: "none", padding: "2px 6px",
                    lineHeight: 1, opacity: 0.85, alignSelf: "center",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                >
                  👁
                </span>
              </div>
              {projetActif?.client && <p style={{ color: "#64748b", margin: 0, fontSize: 13 }}>👤 {projetActif.client}</p>}
              {projetActif?.adresse && <p style={{ color: "#64748b", margin: "2px 0 0", fontSize: 13 }}>📍 {projetActif.adresse}</p>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {autosaveStatus && (
                autosaveStatus.includes("✓") ? (
                  <span className="adision-saved-badge">{autosaveStatus}</span>
                ) : (
                  <span style={{
                    ...styles.autosaveStatus,
                    color: autosaveStatus.includes("✗") ? "#ef4444" : "#64748b",
                  }}>{autosaveStatus}</span>
                )
              )}
              <button
                className="ad-btn-secondary"
                onClick={openInfoModal}
                style={styles.btnSecondary}
                title="Modifier les informations du projet"
              >
                ✏️ Modifier les informations
              </button>
              <button
                className="ad-btn-secondary"
                onClick={openPdfModal}
                style={styles.btnSecondary}
                title="Générer un rapport PDF"
              >
                📄 Rapport PDF
              </button>
              <button
                className="ad-btn-secondary"
                onClick={() => {
                  const t = getJwt();
                  const qs = t ? `?token=${encodeURIComponent(t)}` : "";
                  window.open(`${API_URL}/budget/projets/${projetActif.id}/export${qs}`, "_blank");
                }}
                style={styles.btnSecondary}
                title="Télécharger le budget en Excel"
              >
                📥 Exporter Excel
              </button>
            </div>
          </div>

          {/* Paramètres globaux */}
          <div style={styles.paramsBar}>
            {[
              { label: "Mobilisation (sem)", field: "mobilisation" },
              { label: "Surface plancher (pi²)", field: "surfacePlancher" },
              { label: "Hauteur cloisons", field: "hauteurCloisons" },
              { label: "Longueur cloisons", field: "longueurCloisons" },
            ].map(({ label, field }) => (
              <label key={field} style={styles.paramLabel}>
                {label}
                <input type="text" inputMode="decimal" value={globalParams[field]}
                  onChange={(e) => setGlobalParams((p) => ({ ...p, [field]: e.target.value }))}
                  style={styles.paramInput} />
              </label>
            ))}
            <div style={styles.statBadge}>Surface mur : {surfaceMur.toFixed(2)} pi²</div>
            <div style={styles.statBadge}>Surface gypse : {surfaceGypse.toFixed(2)} pi²</div>
          </div>

          {notesVisible && (
            <div className="adision-card" style={{ padding: "20px 24px", marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600,
                              color: "#1e3a8a", marginBottom: 10,
                              textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Notes du projet
              </label>
              <textarea value={notes} onChange={(e) => updateNotes(e.target.value)}
                placeholder="Notes, contexte, rappels pour ce projet…"
                style={{ width: "100%", minHeight: 80, padding: "12px 14px", fontSize: 14,
                         color: "#0f172a", fontFamily: "inherit", borderRadius: 6,
                         border: "1px solid #e2e8f0", background: "#ffffff",
                         resize: "vertical", boxSizing: "border-box", outline: "none" }} />
            </div>
          )}

          {loading ? <p style={styles.loading}>Chargement…</p> : (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>Budget du projet</h2>
              </div>

              {lignes.length === 0 ? (
                <p style={styles.emptyMsg}>Aucun item dans ce projet.</p>
              ) : (
                <>
                  {/* Bouton 👁 Colonnes : choix des colonnes visibles + presets. */}
                  <div style={{ position: "relative", display: "flex",
                                justifyContent: "flex-end", padding: "8px 16px",
                                borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
                    <button onClick={() => setColsMenuOpen((v) => !v)}
                      className="ad-btn-secondary" style={styles.btnSecondary}
                      title="Choisir les colonnes visibles">
                      👁 Colonnes ({visibleColumns.length}/{BUDGET_COLUMNS.length})
                    </button>
                    {colsMenuOpen && (
                      <>
                        <div onClick={() => setColsMenuOpen(false)}
                          style={{ position: "fixed", inset: 0, zIndex: 49 }} />
                        <div style={{
                          position: "absolute", top: "100%", right: 16, marginTop: 4,
                          background: "#fff", border: "1px solid #cbd5e1",
                          borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
                          padding: 12, minWidth: 280, zIndex: 50, maxHeight: "70vh",
                          overflowY: "auto",
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a8a",
                                        textTransform: "uppercase", letterSpacing: 0.5,
                                        marginBottom: 6 }}>Présets</div>
                          {Object.entries(COL_PRESETS).map(([k, p]) => (
                            <button key={k} onClick={() => applyColPreset(k)}
                              style={{ display: "block", width: "100%", textAlign: "left",
                                       padding: "5px 8px", fontSize: 13, background: "transparent",
                                       border: "none", cursor: "pointer", borderRadius: 4 }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                              {p.label}
                            </button>
                          ))}
                          <div style={{ borderTop: "1px solid #e2e8f0", margin: "8px 0" }} />
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a8a",
                                        textTransform: "uppercase", letterSpacing: 0.5,
                                        marginBottom: 6 }}>Colonnes</div>
                          {BUDGET_COLUMNS.filter((c) => c.group === null).map((col) => (
                            <label key={col.key} style={{ display: "flex", alignItems: "center",
                                                          gap: 8, padding: "3px 0",
                                                          fontSize: 13, cursor: "pointer" }}>
                              <input type="checkbox" checked={!!colVisibility[col.key]}
                                onChange={() => toggleColVisibility(col.key)}
                                style={{ accentColor: "#10b981", cursor: "pointer" }} />
                              {col.label}
                            </label>
                          ))}
                          {Object.entries(BUDGET_SECTIONS).map(([sk, sect]) => (
                            <div key={sk} style={{ marginTop: 6,
                                                   borderTop: "1px dashed #e2e8f0", paddingTop: 6 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#475569",
                                            textTransform: "uppercase", letterSpacing: 0.5,
                                            marginBottom: 4,
                                            display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 10, height: 10, borderRadius: 2,
                                               background: sect.bg }} />
                                {sect.label}
                              </div>
                              {BUDGET_COLUMNS.filter((c) => c.group === sk).map((col) => (
                                <label key={col.key}
                                  style={{ display: "flex", alignItems: "center",
                                           gap: 8, padding: "3px 0", fontSize: 13, cursor: "pointer" }}>
                                  <input type="checkbox" checked={!!colVisibility[col.key]}
                                    onChange={() => toggleColVisibility(col.key)}
                                    style={{ accentColor: "#10b981", cursor: "pointer" }} />
                                  {col.label}
                                </label>
                              ))}
                            </div>
                          ))}
                          <div style={{ borderTop: "1px solid #e2e8f0", margin: "8px 0" }} />
                          <button onClick={resetColWidths}
                            className="ad-btn-secondary"
                            style={{ ...styles.btnSecondary, width: "100%", padding: "5px 8px",
                                     fontSize: 12 }}>
                            Réinitialiser largeurs
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }}>
                    <table style={{
                      ...styles.table,
                      width: visibleColumns.reduce((s, c) => s + (colWidths[c.key] || c.defaultWidth), 0),
                      tableLayout: "fixed",
                    }}>
                      <thead>
                        {/* Rangée 1 : headers de section avec colspan, masquée
                            si toutes les sections sont cachées. */}
                        {(sectionVisible.materiaux || sectionVisible.mainOeuvre || sectionVisible.sousTraitant) && (
                          <tr>
                            {(() => {
                              const cells = [];
                              let i = 0;
                              while (i < visibleColumns.length) {
                                const col = visibleColumns[i];
                                const prev = i > 0 ? visibleColumns[i - 1] : null;
                                const boundary = isSectionBoundary(col, prev);
                                if (col.group === null) {
                                  cells.push(
                                    <th key={`sec-${col.key}`} style={{
                                      ...styles.th, background: "#1e3a8a",
                                      width: colWidths[col.key], position: "sticky", top: 0,
                                      zIndex: 11,
                                      ...(boundary ? { borderLeft: SECTION_BORDER } : {}),
                                    }} />
                                  );
                                  i += 1;
                                } else {
                                  let span = 1;
                                  while (i + span < visibleColumns.length
                                         && visibleColumns[i + span].group === col.group) {
                                    span += 1;
                                  }
                                  const sect = BUDGET_SECTIONS[col.group];
                                  cells.push(
                                    <th key={`sec-${col.group}`} colSpan={span} style={{
                                      ...styles.th,
                                      background: sect.bg, color: "#0f172a",
                                      textAlign: "center",
                                      position: "sticky", top: 0, zIndex: 11,
                                      ...(boundary ? { borderLeft: SECTION_BORDER } : {}),
                                    }}>
                                      {sect.label}
                                    </th>
                                  );
                                  i += span;
                                }
                              }
                              return cells;
                            })()}
                          </tr>
                        )}
                        <tr>
                          {visibleColumns.map((col, idx) => {
                            const sectBg = col.group ? BUDGET_SECTIONS[col.group].bg : undefined;
                            const sectionRowVisible = sectionVisible.materiaux || sectionVisible.mainOeuvre || sectionVisible.sousTraitant;
                            const prev = idx > 0 ? visibleColumns[idx - 1] : null;
                            const boundary = isSectionBoundary(col, prev);
                            const canResize = col.key !== "actif";
                            return (
                              <th key={col.key} style={{
                                ...styles.th,
                                width: colWidths[col.key],
                                position: "sticky",
                                top: sectionRowVisible ? 32 : 0,
                                zIndex: 10,
                                ...(sectBg ? { background: sectBg, color: "#0f172a" } : {}),
                                ...(boundary ? { borderLeft: SECTION_BORDER } : {}),
                              }}>
                                {col.label}
                                {canResize && (
                                  <div onMouseDown={(e) => startColResize(e, col.key)}
                                    style={{
                                      position: "absolute", top: 0, right: 0, height: "100%",
                                      width: 6, cursor: "col-resize", userSelect: "none",
                                      zIndex: 2, transition: "background 0.15s",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(148,163,184,0.6)"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                                    title="Glisser pour redimensionner" />
                                )}
                              </th>
                            );
                          })}
                        </tr>
                        {/* Rangée 3 : œil 👁 par colonne, toutes les colonnes
                            sont cachables (le toggle refuse la dernière). */}
                        <tr>
                          {visibleColumns.map((col, idx) => {
                            const sectionRowVisible = sectionVisible.materiaux || sectionVisible.mainOeuvre || sectionVisible.sousTraitant;
                            const prev = idx > 0 ? visibleColumns[idx - 1] : null;
                            const boundary = isSectionBoundary(col, prev);
                            // Top = rangée labels (32px) + hauteur labels (~30px)
                            // ; recalé à 32 si la rangée sections est cachée.
                            const top = sectionRowVisible ? 62 : 30;
                            // Fond aligné avec la teinte de section (palette
                            // Adision pâle) — gris clair par défaut pour les
                            // colonnes communes.
                            const eyeBg = col.group ? BUDGET_SECTIONS[col.group].bg : "#f8fafc";
                            return (
                              <th key={col.key} style={{
                                width: colWidths[col.key],
                                position: "sticky",
                                top,
                                zIndex: 9,
                                background: eyeBg,
                                borderBottom: "1px solid #e2e8f0",
                                // padding-left identique à styles.th (12px)
                                // pour aligner l'œil avec le début du libellé
                                // de la rangée 2 ; right reste 0 pour pas
                                // décaler quand on redimensionne la colonne.
                                padding: "4px 0 4px 12px",
                                textAlign: "left",
                                fontWeight: "normal",
                                ...(boundary ? { borderLeft: SECTION_BORDER } : {}),
                              }}>
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleColVisibility(col.key);
                                  }}
                                  title="Cacher cette colonne"
                                  style={{
                                    cursor: "pointer", fontSize: 15,
                                    color: "#991b1b", userSelect: "none",
                                    // padding 0 à gauche : le décalage vient
                                    // exclusivement du padding du <th>.
                                    display: "inline-block", padding: "2px 6px 2px 0",
                                    lineHeight: 1, opacity: 0.85,
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                                >
                                  👁
                                </span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {lignesByPrefix.map(([prefix, groupLignes]) => {
                          const isCollapsed = collapsedBudget.has(prefix);
                          const groupTotal = groupLignes.reduce((sum, l) => {
                            const found = budgetLignes.find((b) => b.id === l.id);
                            return sum + (found?.total || 0);
                          }, 0);
                          return (
                            <React.Fragment key={`budget-${prefix}`}>
                              <tr style={styles.trGroup} onClick={() => toggleCollapsedBudget(prefix)}>
                                <td colSpan={Math.max(1, visibleColumns.length - 1)} style={styles.tdGroup}>
                                  {isCollapsed ? "▶" : "▼"}&nbsp;&nbsp;{getPrefixLabel(prefix)}
                                  <span style={{ fontWeight: 400, marginLeft: 10, opacity: 0.8 }}>
                                    ({groupLignes.length} élément{groupLignes.length > 1 ? "s" : ""})
                                  </span>
                                </td>
                                {visibleColumns.length > 1 && (
                                  <td style={styles.tdGroupTotal}>{groupTotal.toFixed(2)} $</td>
                                )}
                              </tr>
                              {!isCollapsed && groupLignes.map((ligne, idx) => {
                                const row = getRow(ligne);
                                const edit = edits[ligne.id] || {};
                                const isActive = activeItems.has(ligne.id);
                                const isSaving = saving.has(ligne.id);
                                const baseRowStyle = {
                                  ...(isActive ? (idx % 2 === 0 ? styles.trEven : styles.trOdd) : styles.trInactive),
                                  outline: isSaving ? "1px solid #93c5fd" : "none",
                                };
                                return (
                                  <tr key={ligne.id} className="adision-budget-row" style={baseRowStyle}>
                                    {visibleColumns.map((col, idx) => renderBudgetCell({
                                      col, ligne, row, edit, isActive,
                                      boundary: isSectionBoundary(col, idx > 0 ? visibleColumns[idx - 1] : null),
                                    }))}
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ background: "#ffffff", borderTop: "1px solid #e2e8f0",
                                padding: "20px 24px 0" }}>
                    {groupTotals.map((g) => {
                      if (g.subtotal <= 0) return null;
                      const pctStr = pctVal(g.pctField);
                      const pct = normalizeNumber(pctStr) || 0;
                      const adminProfit = g.subtotal * pct / 100;
                      const vis = totalsVisibility[g.key] || { sousTotal: true, adminProfit: true };
                      const showAdmin = vis.sousTotal && vis.adminProfit;
                      const distribute = vis.sousTotal && !vis.adminProfit;
                      const displayedSubtotal = distribute ? g.subtotal + adminProfit : g.subtotal;
                      return (
                        <div key={g.key} style={{ borderBottom: "1px dashed #e2e8f0",
                                                  paddingBottom: 8, marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between",
                                        padding: "4px 0", fontSize: 13 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 8,
                                           fontWeight: 600 }}>
                              <input type="checkbox" checked={vis.sousTotal}
                                onChange={() => toggleTotalSousTotal(g.key)}
                                style={{ accentColor: "#10b981", cursor: "pointer", width: 16, height: 16 }}
                                title="Afficher / masquer ce sous-total et son admin & profit" />
                              Sous-total {g.label}
                            </span>
                            <span style={{ fontWeight: 600, color: "#1e3a8a" }}>
                              {vis.sousTotal ? `${displayedSubtotal.toFixed(2)} $` : "—"}
                            </span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between",
                                        alignItems: "center", padding: "4px 0 4px 28px",
                                        fontSize: 13,
                                        opacity: vis.sousTotal ? 1 : 0.5 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input type="checkbox"
                                checked={vis.sousTotal && vis.adminProfit}
                                disabled={!vis.sousTotal}
                                onChange={() => toggleTotalAdminProfit(g.key)}
                                style={{ accentColor: "#10b981",
                                         cursor: vis.sousTotal ? "pointer" : "not-allowed",
                                         width: 16, height: 16 }}
                                title={vis.sousTotal ? "Afficher / masquer cet admin & profit"
                                                     : "Cocher d'abord le sous-total"} />
                              Administration et profit
                              <input type="text" inputMode="decimal" value={pctStr}
                                onChange={(e) => updatePctField(g.pctField, e.target.value)}
                                style={{ width: 60, padding: "2px 6px",
                                         border: "1px solid #cbd5e1", borderRadius: 4,
                                         fontSize: 13, textAlign: "right" }} />
                              %
                            </span>
                            <span style={{ color: "#475569" }}>
                              {showAdmin ? `${adminProfit.toFixed(2)} $` : "—"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {/* Sous-total avant taxes — visuel uniquement */}
                    <div style={{ display: "flex", justifyContent: "space-between",
                                  alignItems: "center", padding: "8px 0 4px",
                                  borderTop: "1px solid #e2e8f0", marginTop: 4,
                                  fontSize: 13 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                        <input type="checkbox" checked={totalsVisibility.sousTotalAvantTaxes !== false}
                          onChange={() => toggleTotalsFlag("sousTotalAvantTaxes")}
                          style={{ accentColor: "#10b981", cursor: "pointer", width: 16, height: 16 }}
                          title="Afficher / masquer la ligne Sous-total avant taxes" />
                        Sous-total avant taxes
                      </span>
                      <span style={{ fontWeight: 600, color: "#1e3a8a" }}>
                        {totalsVisibility.sousTotalAvantTaxes !== false
                          ? `${sousTotalAvantTaxes.toFixed(2)} $`
                          : "—"}
                      </span>
                    </div>
                    {/* TPS — case affecte le total */}
                    <div style={{ display: "flex", justifyContent: "space-between",
                                  alignItems: "center", padding: "4px 0", fontSize: 13 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={totalsVisibility.tps !== false}
                          onChange={() => toggleTotalsFlag("tps")}
                          style={{ accentColor: "#10b981", cursor: "pointer", width: 16, height: 16 }}
                          title="Inclure la TPS dans le TOTAL GÉNÉRAL" />
                        TPS {(TPS_RATE * 100).toFixed(0)}%
                      </span>
                      <span style={{ color: "#475569" }}>
                        {totalsVisibility.tps !== false ? `${tpsAmount.toFixed(2)} $` : "—"}
                      </span>
                    </div>
                    {/* TVQ — case affecte le total */}
                    <div style={{ display: "flex", justifyContent: "space-between",
                                  alignItems: "center", padding: "4px 0 8px", fontSize: 13 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={totalsVisibility.tvq !== false}
                          onChange={() => toggleTotalsFlag("tvq")}
                          style={{ accentColor: "#10b981", cursor: "pointer", width: 16, height: 16 }}
                          title="Inclure la TVQ dans le TOTAL GÉNÉRAL" />
                        TVQ {(TVQ_RATE * 100).toFixed(3).replace(/\.?0+$/, "")}%
                      </span>
                      <span style={{ color: "#475569" }}>
                        {totalsVisibility.tvq !== false ? `${tvqAmount.toFixed(2)} $` : "—"}
                      </span>
                    </div>
                  </div>
                  {/* Ventilation 3 sections : matériaux / M-O / sous-traitant.
                      Utile pour découper un devis et afficher au client le
                      coût par poste. Post-ajust % par section, pré-taxes. */}
                  <div style={{
                    background: "#f8fafc", borderTop: "1px solid #e2e8f0",
                    padding: "12px 24px", fontSize: 13, color: "#475569",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: BUDGET_SECTIONS.materiaux.bg }} />
                        Coût total matériaux
                      </span>
                      <span>{breakdownTotals.materiaux.toLocaleString("fr-CA",
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: BUDGET_SECTIONS.mainOeuvre.bg }} />
                        Coût total main-d'œuvre
                      </span>
                      <span>{breakdownTotals.mo.toLocaleString("fr-CA",
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: BUDGET_SECTIONS.sousTraitant.bg }} />
                        Coût total sous-traitant
                      </span>
                      <span>{breakdownTotals.st.toLocaleString("fr-CA",
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</span>
                    </div>
                  </div>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    background: "#1e3a8a", color: "#ffffff",
                    padding: "18px 24px", fontSize: 18, fontWeight: 700,
                    letterSpacing: "0.3px",
                  }}>
                    <span>TOTAL GÉNÉRAL</span>
                    <span>{totalGeneral.toFixed(2)} $</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {showInfoModal && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(15,23,42,0.5)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000,
          }} onClick={() => !infoSaving && setShowInfoModal(false)}>
            <div onClick={(e) => e.stopPropagation()}
              style={{
                background: "#fff", borderRadius: 12, padding: 24,
                width: 720, maxWidth: "92vw", maxHeight: "85vh",
                overflowY: "auto", boxShadow: "0 20px 40px rgba(15, 23, 42, 0.15)",
              }}>
              <h2 style={{ margin: "0 0 16px", color: "#1e3a8a", fontSize: 18 }}>
                ✏️ Modifier les informations du projet
              </h2>
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
                <LogoUpload value={infoEdits.logo_base64 ?? ""}
                  setter={(v) => setInfoField("logo_base64", v)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569",
                                marginBottom: 10, textTransform: "uppercase",
                                letterSpacing: 0.5 }}>Client</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={styles.formLabel}>Nom du projet</label>
                      <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={infoEdits.nom ?? ""}
                        onChange={(e) => setInfoField("nom", e.target.value)} />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Nom du client</label>
                      <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={infoEdits.nom_client ?? ""}
                        onChange={(e) => setInfoField("nom_client", e.target.value)} />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Nom du contact</label>
                      <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={infoEdits.contact_client ?? ""}
                        onChange={(e) => setInfoField("contact_client", e.target.value)} />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Courriel</label>
                      <input type="email" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={infoEdits.email_client ?? ""}
                        onChange={(e) => setInfoField("email_client", e.target.value)} />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Téléphone</label>
                      <input type="tel" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={infoEdits.telephone_client ?? ""}
                        onChange={(e) => setInfoField("telephone_client", e.target.value)} />
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569",
                                marginBottom: 10, textTransform: "uppercase",
                                letterSpacing: 0.5 }}>Entrepreneur</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={styles.formLabel}>Numéro du projet</label>
                      <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={infoEdits.numero_projet ?? ""}
                        onChange={(e) => setInfoField("numero_projet", e.target.value)} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={styles.formLabel}>Date début</label>
                        <input type="date" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                          value={infoEdits.date_debut ?? ""}
                          onChange={(e) => setInfoField("date_debut", e.target.value)} />
                      </div>
                      <div>
                        <label style={styles.formLabel}>Date fin</label>
                        <input type="date" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                          value={infoEdits.date_fin ?? ""}
                          onChange={(e) => setInfoField("date_fin", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label style={styles.formLabel}>Contact entrepreneur</label>
                      <input style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={infoEdits.contact_entrepreneur ?? ""}
                        onChange={(e) => setInfoField("contact_entrepreneur", e.target.value)} />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Courriel</label>
                      <input type="email" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={infoEdits.email_entrepreneur ?? ""}
                        onChange={(e) => setInfoField("email_entrepreneur", e.target.value)} />
                    </div>
                    <div>
                      <label style={styles.formLabel}>Téléphone</label>
                      <input type="tel" style={{ ...styles.formInput, width: "100%", boxSizing: "border-box" }}
                        value={infoEdits.telephone_entrepreneur ?? ""}
                        onChange={(e) => setInfoField("telephone_entrepreneur", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                {infoSaving && (
                  <span style={{ fontSize: 12, color: "#64748b", fontStyle: "italic", marginRight: 8 }}>
                    Sauvegarde…
                  </span>
                )}
                <button className="ad-btn-secondary" onClick={() => setShowInfoModal(false)} disabled={infoSaving}
                  style={{ ...styles.btnSecondary, opacity: infoSaving ? 0.5 : 1 }}>
                  Annuler
                </button>
                <button onClick={saveInfoModal} disabled={infoSaving}
                  style={{ ...styles.btnPrimary, opacity: infoSaving ? 0.6 : 1 }}>
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        )}
        {showPdfModal && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(15,23,42,0.5)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000,
          }} onClick={() => setShowPdfModal(false)}>
            <div onClick={(e) => e.stopPropagation()}
              style={{
                background: "#fff", borderRadius: 12, padding: 24,
                width: 460, maxWidth: "90vw", maxHeight: "85vh",
                overflowY: "auto", boxShadow: "0 20px 40px rgba(15, 23, 42, 0.15)",
              }}>
              <h2 style={{ margin: "0 0 16px", color: "#1e3a8a", fontSize: 18 }}>
                📄 Générer un rapport PDF
              </h2>
              <label style={{ display: "flex", alignItems: "center", gap: 8,
                              marginBottom: 10, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={pdfFilters.inactifs}
                  onChange={(e) => setPdfFilters((p) => ({ ...p, inactifs: e.target.checked }))} />
                Inclure les lignes inactives
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8,
                              marginBottom: 10, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={pdfFilters.avecPrix}
                  onChange={(e) => setPdfFilters((p) => ({ ...p, avecPrix: e.target.checked }))} />
                Inclure les prix (sinon mode sous-traitant : sans prix ni notes)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8,
                              marginBottom: 10, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={pdfFilters.avecSousTotalAvantTaxes}
                  onChange={(e) => setPdfFilters((p) => ({ ...p, avecSousTotalAvantTaxes: e.target.checked }))} />
                Inclure la ligne « Sous-total avant taxes »
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8,
                              marginBottom: 10, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={pdfFilters.avecTps}
                  onChange={(e) => setPdfFilters((p) => ({ ...p, avecTps: e.target.checked }))} />
                Inclure la TPS ({(TPS_RATE * 100).toFixed(0)}%) — affecte le TOTAL GÉNÉRAL
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8,
                              marginBottom: 14, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={pdfFilters.avecTvq}
                  onChange={(e) => setPdfFilters((p) => ({ ...p, avecTvq: e.target.checked }))} />
                Inclure la TVQ ({(TVQ_RATE * 100).toFixed(3).replace(/\.?0+$/, "")}%) — affecte le TOTAL GÉNÉRAL
              </label>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e3a8a",
                            marginBottom: 6, marginTop: 4 }}>
                Orientation
              </div>
              <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6,
                                fontSize: 13, cursor: "pointer" }}>
                  <input type="radio" name="pdf-orientation" value="portrait"
                    checked={pdfFilters.orientation === "portrait"}
                    onChange={() => setPdfFilters((p) => ({ ...p, orientation: "portrait" }))} />
                  Portrait
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6,
                                fontSize: 13, cursor: "pointer" }}>
                  <input type="radio" name="pdf-orientation" value="paysage"
                    checked={pdfFilters.orientation === "paysage"}
                    onChange={() => setPdfFilters((p) => ({ ...p, orientation: "paysage" }))} />
                  Paysage
                </label>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e3a8a",
                            marginBottom: 6, marginTop: 4 }}>
                Colonnes ({pdfFilters.colonnes.size} / {PDF_COLUMNS.length})
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button className="ad-btn-secondary" onClick={() => setPdfFilters((p) => ({ ...p, colonnes: new Set(PDF_COLUMNS.map((c) => c.key)) }))}
                  style={{ ...styles.btnSecondary, padding: "4px 10px", fontSize: 12 }}>
                  Tout cocher
                </button>
                <button className="ad-btn-secondary" onClick={() => setPdfFilters((p) => ({ ...p, colonnes: new Set() }))}
                  style={{ ...styles.btnSecondary, padding: "4px 10px", fontSize: 12 }}>
                  Tout décocher
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
                            gap: "4px 12px", border: "1px solid #e2e8f0",
                            borderRadius: 6, padding: 8, marginBottom: 16 }}>
                {PDF_COLUMNS.map((c) => (
                  <label key={c.key} style={{ display: "flex", alignItems: "center",
                                              gap: 8, fontSize: 12, padding: "3px 0",
                                              cursor: "pointer" }}>
                    <input type="checkbox" checked={pdfFilters.colonnes.has(c.key)}
                      onChange={() => togglePdfColumn(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e3a8a",
                            marginBottom: 6, marginTop: 4 }}>
                Sous-totaux et administration & profit
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
                            border: "1px solid #e2e8f0", borderRadius: 6,
                            padding: 8, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
                    Sous-totaux
                  </div>
                  {BUDGET_GROUPS.map((g) => (
                    <label key={g.key} style={{ display: "flex", alignItems: "center", gap: 8,
                                                fontSize: 12, padding: "3px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={pdfFilters.sousTotaux.has(g.key)}
                        onChange={() => togglePdfSousTotal(g.key)} />
                      {g.label}
                    </label>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
                    Administration et profit
                  </div>
                  {BUDGET_GROUPS.map((g) => {
                    const stChecked = pdfFilters.sousTotaux.has(g.key);
                    return (
                      <label key={g.key} style={{ display: "flex", alignItems: "center", gap: 8,
                                                  fontSize: 12, padding: "3px 0",
                                                  cursor: stChecked ? "pointer" : "not-allowed",
                                                  opacity: stChecked ? 1 : 0.5 }}>
                        <input type="checkbox"
                          checked={stChecked && pdfFilters.adminProfits.has(g.key)}
                          disabled={!stChecked}
                          onChange={() => togglePdfAdminProfit(g.key)} />
                        {g.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1e3a8a",
                            marginBottom: 6, marginTop: 4 }}>
                Sections à inclure ({pdfFilters.sections.size} / {uniqueSections.length})
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button className="ad-btn-secondary" onClick={() => setPdfFilters((p) => ({ ...p, sections: new Set(uniqueSections) }))}
                  style={{ ...styles.btnSecondary, padding: "4px 10px", fontSize: 12 }}>
                  Tout cocher
                </button>
                <button className="ad-btn-secondary" onClick={() => setPdfFilters((p) => ({ ...p, sections: new Set() }))}
                  style={{ ...styles.btnSecondary, padding: "4px 10px", fontSize: 12 }}>
                  Tout décocher
                </button>
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto",
                            border: "1px solid #e2e8f0", borderRadius: 6,
                            padding: 8, marginBottom: 16 }}>
                {uniqueSections.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#64748b" }}>Aucune section.</div>
                ) : uniqueSections.map((s) => (
                  <label key={s} style={{ display: "flex", alignItems: "center",
                                          gap: 8, fontSize: 12, padding: "3px 0",
                                          cursor: "pointer" }}>
                    <input type="checkbox" checked={pdfFilters.sections.has(s)}
                      onChange={() => togglePdfSection(s)} />
                    {s}
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="ad-btn-secondary" onClick={() => setShowPdfModal(false)} style={styles.btnSecondary}>
                  Annuler
                </button>
                <button onClick={generatePdf}
                  disabled={pdfFilters.sections.size === 0 || pdfFilters.colonnes.size === 0}
                  style={{
                    ...styles.btnPrimary,
                    opacity: (pdfFilters.sections.size === 0 || pdfFilters.colonnes.size === 0) ? 0.5 : 1,
                    cursor: (pdfFilters.sections.size === 0 || pdfFilters.colonnes.size === 0) ? "not-allowed" : "pointer",
                  }}>
                  Générer le PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (page === "admin") {
    const adminVal = (item, field, fallback = "") => {
      const e = adminEdits[item.id];
      return e && field in e ? e[field] : (item[field] ?? fallback);
    };
    return (
      <div style={styles.app}>
        {toastBanner}
        <Nav />
        <div style={styles.page}>
          <button style={styles.btnBack} onClick={() => { setPage("projets"); loadProjets(user.id); }}>
            ← Mes projets
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h1 style={{ ...styles.pageTitle, marginBottom: 0 }}>🛠️ Admin — BD maître</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {autosaveStatus && (
                autosaveStatus.includes("✓") ? (
                  <span className="adision-saved-badge">{autosaveStatus}</span>
                ) : (
                  <span style={{
                    ...styles.autosaveStatus,
                    color: autosaveStatus.includes("✗") ? "#ef4444" : "#64748b",
                  }}>{autosaveStatus}</span>
                )
              )}
              <button style={styles.btnPrimary} onClick={adminCreateItem}>+ Ajouter un item</button>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 0, marginBottom: 12 }}>
            Édition inline sauvegardée 3s après la dernière frappe. Les modifications n'affectent pas les projets existants — uniquement les nouveaux projets créés ensuite.
          </p>
          {loading ? <p style={styles.loading}>Chargement…</p> : (
            <div style={styles.card}>
              {adminItems.length === 0 ? (
                <p style={styles.emptyMsg}>Aucun item dans la BD maître.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ ...styles.table, width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Section</th>
                        <th style={styles.th}>Division</th>
                        <th style={styles.th}>Description</th>
                        <th style={styles.th}>Unité</th>
                        <th style={styles.th}>Prix unit.</th>
                        <th style={styles.th}>Note</th>
                        <th style={{ ...styles.th, width: 50 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminItems.map((item) => (
                        <tr key={item.id}>
                          <td style={{ ...styles.td, width: 100 }}>
                            <input type="text" value={adminVal(item, "section")}
                              onChange={(e) => adminUpdateEdit(item.id, "section", e.target.value)}
                              style={styles.input} />
                          </td>
                          <td style={{ ...styles.td, width: 100 }}>
                            <input type="text" value={adminVal(item, "division")}
                              onChange={(e) => adminUpdateEdit(item.id, "division", e.target.value)}
                              style={styles.input} />
                          </td>
                          <td style={styles.td}>
                            <input type="text" value={adminVal(item, "description")}
                              onChange={(e) => adminUpdateEdit(item.id, "description", e.target.value)}
                              style={styles.input} />
                          </td>
                          <td style={{ ...styles.td, width: 100 }}>
                            <select value={adminVal(item, "unite", "global")}
                              onChange={(e) => adminUpdateEdit(item.id, "unite", e.target.value)}
                              style={styles.select}>
                              {allowedUnites.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td style={{ ...styles.td, width: 105 }}>
                            <input type="text" inputMode="decimal"
                              value={adminEdits[item.id]?.prix_unitaire
                                ?? Number(item.prix_unitaire || 0).toFixed(2)}
                              onChange={(e) => adminUpdateEdit(item.id, "prix_unitaire", e.target.value)}
                              style={styles.input} />
                          </td>
                          <td style={styles.td}>
                            <input type="text" value={adminVal(item, "note")}
                              onChange={(e) => adminUpdateEdit(item.id, "note", e.target.value)}
                              style={styles.input} />
                          </td>
                          <td style={{ ...styles.td, width: 50, textAlign: "center" }}>
                            <button onClick={() => adminDeleteItem(item.id, item.description)}
                              style={{ background: "transparent", border: "none", cursor: "pointer",
                                       fontSize: 14, color: "#94a3b8", padding: 4, borderRadius: 4 }}
                              title="Supprimer cet item"
                              onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#fee2e2"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "transparent"; }}>
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ padding: "12px 16px", color: "#64748b", fontSize: 12 }}>
                {adminItems.length} item(s) dans la BD maître
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
