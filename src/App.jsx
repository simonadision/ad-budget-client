import React, { useEffect, useMemo, useRef, useState } from "react";

const API_URL = "https://web-production-3381d.up.railway.app";

const allowedUnites = [
  "pi²", "m²", "pi", "plin", "mlin", "unité", "global", "sem", "/1000$", "m³",
];

const SURFACE_PLANCHER_TERMS = ["nettoyage", "revêtement de sol", "revetement de sol"];
const SURFACE_MUR_TERMS = ["cloisons système intérieur", "cloisons systeme interieur"];
const SURFACE_GYPSE_TERMS = ["plâtrage", "platrage", "peinture", "papier peint"];

const AUTOSAVE_DELAY = 3000;

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = {
  app: {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    background: "#f5f6fa",
    minHeight: "100vh",
    color: "#1a1a2e",
  },
  loginPage: {
    display: "flex", alignItems: "center", justifyContent: "center",
    minHeight: "100vh", background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
  },
  loginCard: {
    background: "#fff", borderRadius: 16, padding: "40px 48px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)", width: 380, textAlign: "center",
  },
  loginLogo: { fontSize: 32, fontWeight: 800, color: "#1e3a8a", marginBottom: 8 },
  loginSubtitle: { color: "#64748b", fontSize: 14, marginBottom: 32 },
  loginLabel: {
    display: "block", textAlign: "left", fontSize: 12, fontWeight: 600,
    color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6,
  },
  loginInput: {
    width: "100%", padding: "10px 14px", border: "1px solid #cbd5e1",
    borderRadius: 8, fontSize: 14, marginBottom: 16, boxSizing: "border-box", outline: "none",
  },
  loginBtn: {
    width: "100%", padding: "12px", background: "#2563eb", color: "#fff",
    border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 8,
  },
  loginError: { color: "#ef4444", fontSize: 13, marginTop: 8 },
  nav: {
    background: "#1e3a8a", padding: "0 24px", display: "flex",
    alignItems: "center", justifyContent: "space-between", height: 52,
  },
  navLogo: { color: "#fff", fontWeight: 800, fontSize: 18 },
  navUser: { color: "#93c5fd", fontSize: 13, display: "flex", alignItems: "center", gap: 12 },
  navLogout: {
    background: "transparent", border: "1px solid #3b82f6", color: "#93c5fd",
    padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
  },
  page: { padding: "20px 24px" },
  pageTitle: { fontSize: 22, fontWeight: 700, color: "#1e3a8a", marginBottom: 20 },
  projetsGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 16, marginBottom: 24,
  },
  projetCard: {
    background: "#fff", borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    padding: "18px", cursor: "pointer", border: "2px solid transparent", transition: "border-color 0.2s",
  },
  projetCardTitle: { fontSize: 15, fontWeight: 700, color: "#1e3a8a", marginBottom: 6 },
  projetCardInfo: { fontSize: 13, color: "#64748b", marginBottom: 4 },
  projetCardStatut: {
    display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, marginTop: 8,
  },
  newProjetCard: {
    background: "#eff6ff", border: "2px dashed #93c5fd", borderRadius: 10, padding: "18px",
    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", minHeight: 110, color: "#2563eb", fontWeight: 600, fontSize: 14,
  },
  card: {
    background: "#fff", borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    overflow: "hidden", marginBottom: 20,
  },
  cardHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc",
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#1e3a8a", margin: 0 },
  cardBody: { padding: "20px" },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  formRow: { display: "flex", gap: 14 },
  formGroup: { display: "flex", flexDirection: "column", flex: 1 },
  formLabel: {
    fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase",
    letterSpacing: "0.05em", marginBottom: 6,
  },
  formInput: { padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, outline: "none" },
  formSelect: { padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 14, background: "#fff", outline: "none" },
  btnPrimary: {
    padding: "7px 18px", background: "#2563eb", color: "#fff", border: "none",
    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  btnSecondary: {
    padding: "7px 18px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1",
    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  btnBack: {
    padding: "5px 12px", background: "transparent", color: "#2563eb", border: "1px solid #2563eb",
    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16,
  },
  btnDelete: {
    padding: "4px 8px", background: "#ef4444", color: "#fff", border: "none",
    borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  btnAddRow: {
    padding: "4px 8px", background: "#f0fdf4", color: "#16a34a",
    border: "1px solid #86efac", borderRadius: 5, fontSize: 11, fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap", marginRight: 4,
  },
  btnToggleActive: {
    padding: "4px 8px", background: "#16a34a", color: "#fff", border: "none",
    borderRadius: 5, fontSize: 13, fontWeight: 700, cursor: "pointer", minWidth: 34,
  },
  btnToggleInactive: {
    padding: "4px 8px", background: "#cbd5e1", color: "#64748b", border: "none",
    borderRadius: 5, fontSize: 13, fontWeight: 700, cursor: "pointer", minWidth: 34,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "9px 10px", textAlign: "left", background: "#1e3a8a", color: "#fff",
    fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
  },
  td: { padding: "7px 10px", borderBottom: "1px solid #e2e8f0", verticalAlign: "middle" },
  trEven: { background: "#f8fafc" },
  trOdd: { background: "#fff" },
  trInactive: { background: "#f1f5f9", opacity: 0.5 },
  trGroup: { background: "#1e3a8a", cursor: "pointer", userSelect: "none" },
  tdGroup: { padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#fff" },
  tdGroupTotal: { padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#fff", textAlign: "right", whiteSpace: "nowrap" },
  input: {
    padding: "4px 7px", border: "1px solid #cbd5e1", borderRadius: 5, fontSize: 12,
    width: "100%", boxSizing: "border-box", outline: "none",
  },
  inputDisabled: {
    padding: "4px 7px", border: "1px solid #e2e8f0", borderRadius: 5, fontSize: 12,
    width: "100%", boxSizing: "border-box", background: "#f1f5f9", color: "#94a3b8",
  },
  select: {
    padding: "4px 7px", border: "1px solid #cbd5e1", borderRadius: 5, fontSize: 12,
    width: "100%", background: "#fff", outline: "none",
  },
  totalRow: {
    textAlign: "right", padding: "14px 20px", fontSize: 15, fontWeight: 700,
    color: "#1e3a8a", borderTop: "2px solid #2563eb", background: "#eff6ff",
  },
  amountStrong: { fontWeight: 700, color: "#1e3a8a" },
  emptyMsg: { padding: 24, textAlign: "center", color: "#94a3b8", fontStyle: "italic" },
  loading: { padding: 32, textAlign: "center", color: "#64748b", fontStyle: "italic" },
  autosaveStatus: { fontSize: 12, fontStyle: "italic" },
  paramsBar: {
    display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, background: "#fff",
    padding: "12px 20px", borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", alignItems: "center",
  },
  paramLabel: {
    display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600,
    color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em",
  },
  paramInput: { padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, width: 90, outline: "none" },
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
  if (statut === "complété") return { background: "#dcfce7", color: "#16a34a" };
  return { background: "#f1f5f9", color: "#64748b" };
}

// ─── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState(() => localStorage.getItem("ad_budget_user") ? "projets" : "login");
  const [user, setUser] = useState(() => {
    const s = localStorage.getItem("ad_budget_user");
    return s ? JSON.parse(s) : null;
  });
  const [projets, setProjets] = useState([]);
  const [projetActif, setProjetActif] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [edits, setEdits] = useState({});
  const [activeItems, setActiveItems] = useState(new Set());
  const [saving, setSaving] = useState(new Set());
  const [autosaveStatus, setAutosaveStatus] = useState("");
  const [collapsedBudget, setCollapsedBudget] = useState(new Set());
  const autosaveTimers = useRef({});
  const [notes, setNotes] = useState("");
  const notesTimer = useRef(null);
  const [loading, setLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginNom, setLoginNom] = useState("");
  const [loginError, setLoginError] = useState("");
  const [nouveauProjet, setNouveauProjet] = useState({
    nom: "", client: "", adresse: "", description: "", statut: "en cours",
  });
  const [globalParams, setGlobalParams] = useState({
    mobilisation: "", surfacePlancher: "", hauteurCloisons: "", longueurCloisons: "",
  });

  const surfaceMur = useMemo(() => {
    return normalizeNumber(globalParams.hauteurCloisons) * normalizeNumber(globalParams.longueurCloisons);
  }, [globalParams.hauteurCloisons, globalParams.longueurCloisons]);
  const surfaceGypse = surfaceMur * 2;

  const surfaceMurRef = useRef(surfaceMur);
  const surfaceGypseRef = useRef(surfaceGypse);
  useEffect(() => {
    surfaceMurRef.current = surfaceMur;
    surfaceGypseRef.current = surfaceGypse;
  }, [surfaceMur, surfaceGypse]);

  // ── Login ────────────────────────────────────────────────────────────────

  async function handleLogin() {
    if (!loginEmail.trim()) { setLoginError("Email requis."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/budget/users`);
      const users = await res.json();
      const found = users.find((u) => u.email.toLowerCase() === loginEmail.trim().toLowerCase());
      if (found) {
        setUser(found);
        localStorage.setItem("ad_budget_user", JSON.stringify(found));
        await loadProjets(found.id);
        setPage("projets");
      } else {
        if (!loginNom.trim()) {
          setLoginError("Utilisateur non trouvé. Entre ton nom pour créer un compte.");
          setLoading(false);
          return;
        }
       const createRes = await fetch(`${API_URL}/budget/users`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nom: loginNom, email: loginEmail, role: "user" }),
        });
        if (!createRes.ok) {
          const err = await createRes.json();
          setLoginError(err.detail || "Acces refuse. Email non autorise.");
          setLoading(false);
          return;
        }
        const created = await createRes.json();
        setUser(created);
        localStorage.setItem("ad_budget_user", JSON.stringify(created));
        setProjets([]);
        setPage("projets");
      }
    } catch {
      setLoginError("Erreur de connexion à l'API.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setUser(null);
    localStorage.removeItem("ad_budget_user");
    setPage("login");
    setLoginEmail("");
    setLoginNom("");
  }

  // ── Projets ──────────────────────────────────────────────────────────────

  async function loadProjets(userId) {
    const res = await fetch(`${API_URL}/budget/projets?user_id=${userId}`);
    setProjets(await res.json());
  }

  useEffect(() => {
    if (user && page === "projets") loadProjets(user.id);
  }, []);

  async function creerProjet() {
    if (!nouveauProjet.nom.trim()) { alert("Le nom du projet est requis."); return; }
    const res = await fetch(`${API_URL}/budget/projets`, {
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
    setLoading(true);
    setEdits({});
    setActiveItems(new Set());
    try {
      const lignesRes = await fetch(`${API_URL}/budget/projets/${projet.id}/lignes`);
      const lignesData = await lignesRes.json();
      setLignes(lignesData);
      setActiveItems(new Set(lignesData.map((l) => l.id)));
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
    const ajustementPct = normalizeNumber(edit.ajustementPct ?? ligne.ajustement_pct ?? 0);
    const sousTotal = qte * prixUnitaire;
    const total = sousTotal * (1 + ajustementPct / 100);

    return { ...ligne, section, description, unite, qte, prixUnitaire, ajustementPct, sousTotal, total, isAutoQte };
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
    const cleanedValue = ["qte", "prixUnitaire", "ajustementPct"].includes(field)
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
      await fetch(`${API_URL}/budget/projets/${projetActif.id}/notes`, {
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
      await fetch(`${API_URL}/budget/projets/${projetActif.id}/lignes/${ligne.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: edit.section ?? ligne.section,
          description: edit.description ?? ligne.description,
          unite: edit.unite ?? ligne.unite,
          prix_unitaire: normalizeNumber(edit.prixUnitaire ?? ligne.prix_unitaire ?? 0),
          qte,
          ajustement_pct: normalizeNumber(edit.ajustementPct ?? ligne.ajustement_pct ?? 0),
          note: edit.note ?? ligne.note ?? "",
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
    const res = await fetch(`${API_URL}/budget/projets/${projetActif.id}/lignes`, {
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
    await fetch(`${API_URL}/budget/projets/${projetActif.id}/lignes/${id}`, { method: "DELETE" });
    setLignes((prev) => prev.filter((l) => l.id !== id));
    setActiveItems((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  function toggleActive(id) {
    setActiveItems((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const budgetLignes = useMemo(() => {
    return lignes
      .filter((l) => activeItems.has(l.id))
      .map((l) => getRow(l))
      .filter((l) => l.qte > 0);
  }, [lignes, edits, globalParams, activeItems, surfaceMur, surfaceGypse]);

  const grandTotal = budgetLignes.reduce((sum, l) => sum + l.total, 0);
  const lignesByPrefix = useMemo(() => groupByPrefix(lignes), [lignes]);

  function toggleCollapsedBudget(prefix) {
    setCollapsedBudget((prev) => {
      const next = new Set(prev);
      next.has(prefix) ? next.delete(prefix) : next.add(prefix);
      return next;
    });
  }

  // ── Nav ──────────────────────────────────────────────────────────────────

  const Nav = () => (
    <nav style={styles.nav}>
      <div style={styles.navLogo}>Ad BUD</div>
      <div style={styles.navUser}>
        <span>👤 {user?.nom}</span>
        <button style={styles.navLogout} onClick={handleLogout}>Déconnexion</button>
      </div>
    </nav>
  );

  // ── Pages ─────────────────────────────────────────────────────────────────

  if (page === "login") {
    return (
      <div style={styles.loginPage}>
        <div style={styles.loginCard}>
          <div style={styles.loginLogo}>Ad BUD</div>
          <p style={styles.loginSubtitle}>Outil de budgétisation de construction</p>
          <label style={styles.loginLabel}>Email</label>
          <input type="email" placeholder="ton@email.com" value={loginEmail}
            onChange={(e) => { setLoginEmail(e.target.value); setLoginError(""); }}
            style={styles.loginInput} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
          <label style={styles.loginLabel}>Nom (si nouveau compte)</label>
          <input type="text" placeholder="Ton nom" value={loginNom}
            onChange={(e) => setLoginNom(e.target.value)}
            style={styles.loginInput} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
          {loginError && <p style={styles.loginError}>{loginError}</p>}
          <button onClick={handleLogin} style={styles.loginBtn} disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </div>
      </div>
    );
  }

  if (page === "projets") {
    return (
      <div style={styles.app}>
        <Nav />
        <div style={styles.page}>
          <h1 style={styles.pageTitle}>Mes projets</h1>
          <div style={styles.projetsGrid}>
            {projets.map((p) => (
              <div key={p.id} style={{ ...styles.projetCard, position: "relative" }} onClick={() => ouvrirProjet(p)}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "#2563eb"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "transparent"}>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const res = await fetch(`${API_URL}/budget/projets/${p.id}/duplicate`, { method: "POST" });
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
                      const res = await fetch(`${API_URL}/budget/projets/${p.id}`, { method: "DELETE" });
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
                {p.client && <div style={styles.projetCardInfo}>👤 {p.client}</div>}
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
        <Nav />
        <div style={styles.page}>
          <button style={styles.btnBack} onClick={() => setPage("projets")}>← Retour</button>
          <h1 style={styles.pageTitle}>Nouveau projet</h1>
          <div style={styles.card}>
            <div style={styles.cardBody}>
              <div style={styles.form}>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Nom du projet *</label>
                    <input style={styles.formInput} value={nouveauProjet.nom}
                      onChange={(e) => setNouveauProjet((p) => ({ ...p, nom: e.target.value }))}
                      placeholder="Ex: Rénovation bureau 3e étage" />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Client</label>
                    <input style={styles.formInput} value={nouveauProjet.client}
                      onChange={(e) => setNouveauProjet((p) => ({ ...p, client: e.target.value }))}
                      placeholder="Nom du client" />
                  </div>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Adresse</label>
                  <input style={styles.formInput} value={nouveauProjet.adresse}
                    onChange={(e) => setNouveauProjet((p) => ({ ...p, adresse: e.target.value }))}
                    placeholder="123 rue Exemple, Montréal" />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Description</label>
                  <input style={styles.formInput} value={nouveauProjet.description}
                    onChange={(e) => setNouveauProjet((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Description optionnelle" />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Statut</label>
                  <select style={styles.formSelect} value={nouveauProjet.statut}
                    onChange={(e) => setNouveauProjet((p) => ({ ...p, statut: e.target.value }))}>
                    <option value="en cours">En cours</option>
                    <option value="complété">Complété</option>
                    <option value="archivé">Archivé</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button style={styles.btnPrimary} onClick={creerProjet}>Créer le projet</button>
                  <button style={styles.btnSecondary} onClick={() => setPage("projets")}>Annuler</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (page === "budget") {
    return (
      <div style={styles.app}>
        <Nav />
        <div style={styles.page}>
          <button style={styles.btnBack} onClick={() => { setPage("projets"); loadProjets(user.id); }}>
            ← Mes projets
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <h1 style={{ ...styles.pageTitle, marginBottom: 2 }}>{projetActif?.nom}</h1>
              {projetActif?.client && <p style={{ color: "#64748b", margin: 0, fontSize: 13 }}>👤 {projetActif.client}</p>}
              {projetActif?.adresse && <p style={{ color: "#64748b", margin: "2px 0 0", fontSize: 13 }}>📍 {projetActif.adresse}</p>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {autosaveStatus && (
                <span style={{
                  ...styles.autosaveStatus,
                  color: autosaveStatus.includes("✓") ? "#16a34a"
                    : autosaveStatus.includes("✗") ? "#ef4444" : "#64748b",
                }}>
                  {autosaveStatus}
                </span>
              )}
              <button
                onClick={() => window.open(`${API_URL}/budget/projets/${projetActif.id}/export`, "_blank")}
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

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600,
                            color: "#1e3a8a", marginBottom: 6 }}>
              Notes du projet
            </label>
            <textarea value={notes} onChange={(e) => updateNotes(e.target.value)}
              placeholder="Notes, contexte, rappels pour ce projet…"
              style={{ width: "100%", minHeight: 80, padding: 10, fontSize: 13,
                       fontFamily: "inherit", borderRadius: 8,
                       border: "1px solid #cbd5e1", resize: "vertical",
                       boxSizing: "border-box" }} />
          </div>

          {loading ? <p style={styles.loading}>Chargement…</p> : (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardTitle}>Budget du projet</h2>
              </div>

              {lignes.length === 0 ? (
                <p style={styles.emptyMsg}>Aucun item dans ce projet.</p>
              ) : (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ ...styles.table, width: "100%" }}>
                      <thead>
                        <tr>
                          {["Actif", "Section", "Description", "Qté", "Unité",
                            "Prix unitaire", "Sous-total", "Ajust. %", "Total", "Note", "Actions"].map((col, i) => (
                            <th key={i} style={styles.th}>{col}</th>
                          ))}
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
                                <td colSpan={10} style={styles.tdGroup}>
                                  {isCollapsed ? "▶" : "▼"}&nbsp;&nbsp;{getPrefixLabel(prefix)}
                                  <span style={{ fontWeight: 400, marginLeft: 10, opacity: 0.8 }}>
                                    ({groupLignes.length} élément{groupLignes.length > 1 ? "s" : ""})
                                  </span>
                                </td>
                                <td style={styles.tdGroupTotal}>{groupTotal.toFixed(2)} $</td>
                              </tr>
                              {!isCollapsed && groupLignes.map((ligne, idx) => {
                                const row = getRow(ligne);
                                const edit = edits[ligne.id] || {};
                                const isActive = activeItems.has(ligne.id);
                                const isSaving = saving.has(ligne.id);
                                const peutSupprimer = true;

                                return (
                                  <tr key={ligne.id} style={{
                                    ...(isActive ? (idx % 2 === 0 ? styles.trEven : styles.trOdd) : styles.trInactive),
                                    outline: isSaving ? "1px solid #93c5fd" : "none",
                                  }}>
                                    {/* Toggle actif */}
                                    <td style={{ ...styles.td, width: 44, textAlign: "center" }}>
                                      <button onClick={() => toggleActive(ligne.id)}
                                        style={isActive ? styles.btnToggleActive : styles.btnToggleInactive}
                                        title={isActive ? "Actif — cliquer pour désactiver" : "Inactif — cliquer pour activer"}>
                                        {isActive ? "✓" : "✗"}
                                      </button>
                                    </td>
                                    {/* Section */}
                                    <td style={{ ...styles.td, width: 100 }}>
                                      <input value={edit.section ?? ligne.section ?? ""}
                                        onChange={(e) => updateEdit(ligne.id, "section", e.target.value)}
                                        style={styles.input} />
                                    </td>
                                    {/* Description */}
                                    <td style={{ ...styles.td, minWidth: 200 }}>
                                      <input value={edit.description ?? ligne.description ?? ""}
                                        onChange={(e) => updateEdit(ligne.id, "description", e.target.value)}
                                        style={styles.input} />
                                    </td>
                                    {/* Qté */}
                                    <td style={{ ...styles.td, width: 80 }}>
                                      <input type="text" inputMode="decimal"
                                        value={getQteDisplay(ligne)}
                                        disabled={row.isAutoQte}
                                        onChange={(e) => updateEdit(ligne.id, "qte", e.target.value)}
                                        style={row.isAutoQte ? styles.inputDisabled : styles.input} />
                                    </td>
                                    {/* Unité */}
                                    <td style={{ ...styles.td, width: 90 }}>
                                      <select value={edit.unite ?? ligne.unite ?? "global"}
                                        onChange={(e) => updateEdit(ligne.id, "unite", e.target.value)}
                                        style={styles.select}>
                                        {allowedUnites.map((u) => <option key={u} value={u}>{u}</option>)}
                                      </select>
                                    </td>
                                    {/* Prix unitaire */}
                                    <td style={{ ...styles.td, width: 105 }}>
                                      <input type="text" inputMode="decimal"
                                        value={edit.prixUnitaire ?? Number(ligne.prix_unitaire || 0).toFixed(2)}
                                        onChange={(e) => updateEdit(ligne.id, "prixUnitaire", e.target.value)}
                                        style={styles.input} />
                                    </td>
                                    {/* Sous-total */}
                                    <td style={{ ...styles.td, width: 100, color: "#475569" }}>
                                      {row.sousTotal.toFixed(2)} $
                                    </td>
                                    {/* Ajustement */}
                                    <td style={{ ...styles.td, width: 85 }}>
                                      <input type="text" inputMode="decimal"
                                        value={edit.ajustementPct ?? String(ligne.ajustement_pct ?? "")}
                                        onChange={(e) => updateEdit(ligne.id, "ajustementPct", e.target.value)}
                                        style={styles.input} />
                                    </td>
                                    {/* Total */}
                                    <td style={{ ...styles.td, width: 100 }}>
                                      <strong style={styles.amountStrong}>{row.total.toFixed(2)} $</strong>
                                    </td>
                                    {/* Note */}
                                    <td style={{ ...styles.td, minWidth: 150 }}>
                                      <input value={edit.note ?? ligne.note ?? ""}
                                        onChange={(e) => updateEdit(ligne.id, "note", e.target.value)}
                                        style={styles.input} placeholder="Note..." />
                                    </td>
                                    {/* Actions */}
                                    <td style={{ ...styles.td, width: 120, whiteSpace: "nowrap" }}>
                                      <button style={styles.btnAddRow} onClick={() => ajouterLigneApres(ligne)}>
                                        + Ligne
                                      </button>
                                      {peutSupprimer && (
                                        <button onClick={() => supprimerLigne(ligne.id)} style={styles.btnDelete}>
                                          ✕
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={styles.totalRow}>
                    Total budget : {grandTotal.toFixed(2)} $
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
