// Barre de navigation modules — partagée entre dashboard, Ad BUD et Ad VIU.
// Composant dupliqué dans chaque frontend (pas de package npm). Si tu touches
// à la liste/styles, propager les 3 copies (chemins src/ModuleSwitcher.jsx
// dans : adision-app-client / ad-budget-client / adision-viu-client).
//
// Props :
//   modules        : Array<string>        ex. ["ad_bud", "ad_viu"] (issue de /auth/me)
//   currentModule  : string | null        "ad_bud" | "ad_viu" | null (sur le dashboard)

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'adision_jwt'
const DASHBOARD_URL = 'https://app.adision.ca'

const MODULES = [
  { id: 'ad_bud', nom: 'Ad BUD', icone: '📊', url: 'https://bud.adision.ca' },
  { id: 'ad_viu', nom: 'Ad VIU', icone: '📐', url: 'https://viu.adision.ca' },
  { id: 'ad_dig', nom: 'Ad DIG', icone: '📦', url: null, comingSoon: true },
]

function getJwt() {
  try { return localStorage.getItem(STORAGE_KEY) || '' } catch { return '' }
}

function useNarrowViewport(breakpoint = 768) {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < breakpoint
  )
  useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return narrow
}

function AdisionMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="27" y="6"  width="10" height="21" fill="#60a5fa" />
      <rect x="37" y="27" width="21" height="10" fill="#60a5fa" />
      <rect x="27" y="37" width="10" height="21" fill="#ef4444" />
      <rect x="6"  y="27" width="21" height="10" fill="#10b981" />
    </svg>
  )
}

const styles = {
  bar: {
    display: 'flex', alignItems: 'center', gap: 24,
  },
  logoBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#fff', padding: 0, fontFamily: 'inherit',
  },
  wordmark: {
    fontWeight: 700, fontSize: 20, letterSpacing: '-0.3px', color: '#fff',
  },
  btnGroup: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 6,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.18)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
    cursor: 'pointer', transition: 'background 150ms ease, border-color 150ms ease, color 150ms ease',
    whiteSpace: 'nowrap',
  },
  btnActive: {
    background: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.55)',
    color: '#fff', fontWeight: 600,
    cursor: 'default',
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  badge: {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
    textTransform: 'uppercase',
    background: 'rgba(255,255,255,0.18)',
    color: '#fff',
    padding: '2px 6px', borderRadius: 10,
  },
}

// Hover effect via inline JS — on évite d'injecter une feuille de styles
// pour rester self-contained (le composant peut être copié sans rien casser).
function btnHover(e, hover, kind) {
  if (kind === 'active' || kind === 'disabled') return
  e.currentTarget.style.background = hover ? 'rgba(255,255,255,0.10)' : 'transparent'
  e.currentTarget.style.borderColor = hover ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)'
  e.currentTarget.style.color = hover ? '#fff' : 'rgba(255,255,255,0.85)'
}

export default function ModuleSwitcher({ modules = [], currentModule = null }) {
  const narrow = useNarrowViewport()
  const granted = new Set(modules)

  function openDashboard() {
    if (typeof window !== 'undefined' && window.location.origin === DASHBOARD_URL) {
      // Déjà sur le dashboard — pas de full reload.
      return
    }
    window.location.href = DASHBOARD_URL
  }

  function openModule(m) {
    if (!m.url) return
    if (m.id === currentModule) return
    if (!granted.has(m.id)) return
    const token = getJwt()
    const sep = m.url.includes('?') ? '&' : '?'
    window.location.href = token
      ? `${m.url}${sep}token=${encodeURIComponent(token)}`
      : m.url
  }

  return (
    <div style={styles.bar}>
      <button
        type="button"
        onClick={openDashboard}
        style={styles.logoBtn}
        title="Retour au tableau de bord Adision"
      >
        <AdisionMark size={narrow ? 24 : 28} />
        {!narrow && <span style={styles.wordmark}>Adision</span>}
      </button>

      <div style={styles.btnGroup}>
        {MODULES.map((m) => {
          const isActive = m.id === currentModule
          const isComingSoon = !!m.comingSoon
          const isAuthorized = granted.has(m.id)
          const disabled = isComingSoon || (!isAuthorized && !isActive)
          const kind = isActive ? 'active' : disabled ? 'disabled' : 'enabled'

          let style = { ...styles.btn }
          if (isActive) style = { ...style, ...styles.btnActive }
          if (disabled) style = { ...style, ...styles.btnDisabled }

          let title
          if (isActive) title = `Vous êtes sur ${m.nom}`
          else if (isComingSoon) title = `${m.nom} — bientôt disponible`
          else if (!isAuthorized) title = 'Module non inclus dans votre forfait'
          else title = `Ouvrir ${m.nom}`

          return (
            <button
              key={m.id}
              type="button"
              onClick={() => { if (!disabled && !isActive) openModule(m) }}
              disabled={disabled}
              aria-current={isActive ? 'page' : undefined}
              style={style}
              title={title}
              onMouseEnter={(e) => btnHover(e, true, kind)}
              onMouseLeave={(e) => btnHover(e, false, kind)}
            >
              <span aria-hidden="true">{m.icone}</span>
              {!narrow && <span>{m.nom}</span>}
              {isComingSoon && !narrow && <span style={styles.badge}>Bientôt</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
