// Picker de taux horaire — modale de sélection depuis la grille CCQ.
//
// Alimente la cellule "Taux $" de la grille budget Ad BUD : un estimateur
// ouvre cette modale, cherche/parcourt la grille des taux actifs, choisit
// une ligne ; le taux_col17 retenu remonte au parent via onSelect.
//
// Données : GET /budget/taux-horaires (endpoint jwt_user, D4.0). Chargées
// au PREMIER ouvert puis conservées : le composant reste monté en
// permanence (visibilité pilotée par `open`), donc l'état `items` survit
// aux fermetures et sert de cache session — le flag `loaded` empêche tout
// rechargement. Si l'API échoue, la modale affiche un message interne et
// reste fermable : la saisie clavier de la cellule reste l'autre chemin,
// on ne casse jamais la grille.
//
// Pattern modale calqué sur ProjectDashboard.jsx : createPortal,
// role=dialog, Escape, scroll-lock, clic backdrop.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { authFetch } from "../../auth.js";

// Ordre et libellés des sections — aligné sur VALID_GROUPES côté backend.
const GROUPE_ORDER = ["metier", "occupation", "non_syndique"];
const GROUPE_LABELS = {
  metier: "Métiers",
  occupation: "Occupations",
  non_syndique: "Non syndiqué",
};

const S = {
  backdrop: {
    position: "fixed", inset: 0, zIndex: 2000,
    background: "rgba(15,23,42,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16,
  },
  panel: {
    background: "var(--ad-surface)", borderRadius: 12,
    width: "92%", maxWidth: 520, maxHeight: "80vh",
    display: "flex", flexDirection: "column",
    boxShadow: "var(--adision-shadow-modal)", overflow: "hidden",
    fontFamily: "var(--ad-font-family)",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "13px 18px", background: "var(--ad-primary)", color: "#fff",
  },
  title: { fontSize: 15, fontWeight: 700, letterSpacing: "-0.2px" },
  closeBtn: {
    background: "transparent", border: "none", color: "#fff",
    fontSize: 16, lineHeight: 1, cursor: "pointer", padding: 2,
  },
  searchWrap: { padding: "12px 16px", borderBottom: "1px solid var(--ad-border)" },
  searchInput: {
    padding: "7px 10px", border: "1px solid var(--ad-border-strong)",
    borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box",
    color: "var(--ad-text)", background: "var(--ad-surface)", outline: "none",
  },
  body: { overflowY: "auto", padding: "4px 0 8px" },
  msg: {
    padding: 24, textAlign: "center", fontSize: 13,
    color: "var(--ad-text-faint)", fontStyle: "italic",
  },
  errMsg: {
    padding: 24, textAlign: "center", fontSize: 13, color: "var(--ad-error)",
  },
  groupHeader: {
    padding: "8px 16px 4px", fontSize: 11, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.5px",
    color: "var(--ad-text-subtle)", background: "var(--ad-bg-soft)",
  },
  row: {
    display: "flex", alignItems: "baseline", justifyContent: "space-between",
    gap: 12, padding: "7px 16px", cursor: "pointer", fontSize: 13,
  },
  rowMetier: { color: "var(--ad-text)" },
  rowQual: { color: "var(--ad-text-subtle)" },
  rowTaux: { fontWeight: 700, color: "var(--ad-primary)", whiteSpace: "nowrap" },
};

export default function TauxHorairePicker({ open, apiUrl, onSelect, onClose }) {
  // `items` survit aux fermetures (composant toujours monté) -> cache session.
  // `loaded` = grille déjà récupérée, empêche tout rechargement.
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Lazy load au premier ouvert. Tous les setState sont dans le callback
  // async (synchronisation avec une source externe) — pas dans le corps de
  // l'effet, pour éviter les rendus en cascade.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        setLoading(true);
        setError("");
      }
      try {
        const res = await authFetch(`${apiUrl}/budget/taux-horaires`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data.items) ? data.items : [];
        if (cancelled) return;
        setItems(list);
        setLoaded(true);
      } catch {
        // Fallback transparent : pas de grille, mais la cellule reste
        // éditable au clavier. On ne propage aucune erreur.
        if (!cancelled) {
          setError("Grille des taux indisponible — saisie manuelle au clavier.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, loaded, apiUrl]);

  // Escape ferme la modale.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") {
        setSearch("");
        onClose?.();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Scroll-lock du body tant que la modale est ouverte.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  function fermer() {
    setSearch("");
    onClose?.();
  }

  function choisir(taux) {
    onSelect?.(taux);
    fermer();
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter((t) =>
        (t.metier || "").toLowerCase().includes(q) ||
        (t.code || "").toLowerCase().includes(q))
    : items;

  // Regroupe par groupe, dans l'ordre métier / occupation / non syndiqué.
  // Les groupes vides (après filtre) sont masqués.
  const sections = GROUPE_ORDER
    .map((g) => ({ groupe: g, rows: filtered.filter((t) => t.groupe === g) }))
    .filter((s) => s.rows.length > 0);

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choisir un taux horaire"
      onClick={(e) => { if (e.target === e.currentTarget) fermer(); }}
      style={S.backdrop}
    >
      <div style={S.panel}>
        <div style={S.header}>
          <span style={S.title}>Grille des taux horaires</span>
          <button type="button" onClick={fermer} style={S.closeBtn}
            aria-label="Fermer">✕</button>
        </div>

        <div style={S.searchWrap}>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un métier ou un code…"
            style={S.searchInput}
          />
        </div>

        <div style={S.body}>
          {loading && <div style={S.msg}>Chargement de la grille…</div>}
          {!loading && error && <div style={S.errMsg}>{error}</div>}
          {!loading && !error && sections.length === 0 && (
            <div style={S.msg}>Aucun taux ne correspond à la recherche.</div>
          )}
          {!loading && !error && sections.map((sect) => (
            <div key={sect.groupe}>
              <div style={S.groupHeader}>
                {GROUPE_LABELS[sect.groupe] || sect.groupe}
              </div>
              {sect.rows.map((t) => (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  // onMouseDown + preventDefault : pattern repris de la cellule
                  // stNom (sélection sans voler le focus / sans race onBlur).
                  onMouseDown={(e) => { e.preventDefault(); choisir(t); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      choisir(t);
                    }
                  }}
                  style={S.row}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--ad-blue-soft)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span style={S.rowMetier}>
                    {t.metier}
                    {t.qualification
                      ? <span style={S.rowQual}> — {t.qualification}</span>
                      : null}
                  </span>
                  <span style={S.rowTaux}>
                    {Number(t.taux_col17).toLocaleString("fr-CA", {
                      minimumFractionDigits: 2, maximumFractionDigits: 2,
                    })} $
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
