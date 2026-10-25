import { CosmosMark } from './CosmosMark'
import { Starfield } from './Starfield'
import { navigate, useRoute } from './router'
import Home from './pages/Home'
import Optimize from './pages/Optimize'
import Check from './pages/Check'
import Guides from './pages/Guides'

const BRAND_URL = 'https://creationofcosmos.com/'

const NAV: { to: string; label: string }[] = [
  { to: '/optimize', label: 'Optimize' },
  { to: '/check', label: 'Check' },
  { to: '/guides', label: 'Guides' },
]

export default function App() {
  const route = useRoute()
  const page = route === '/' ? 'home' : route.split('/')[1]

  return (
    <div className="page">
      <Starfield />
      <header className="topbar">
        <button type="button" className="brand" aria-label="Nova home" onClick={() => navigate('/')}>
          <CosmosMark className="brand-mark" />
          <span className="brand-name">Nova</span>
        </button>
        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.to}
              type="button"
              className={`nav-link ${page === n.to.slice(1) ? 'is-on' : ''}`}
              onClick={() => navigate(n.to)}
            >
              {n.label}
            </button>
          ))}
          <a className="byline" href={BRAND_URL} target="_blank" rel="noreferrer">
            by Creation of Cosmos
          </a>
        </nav>
      </header>

      <main>
        {page === 'home' && <Home />}
        {page === 'optimize' && <Optimize />}
        {page === 'check' && <Check />}
        {page === 'guides' && <Guides />}
      </main>

      <footer className="footer">
        <CosmosMark className="footer-mark" />
        <span>
          Nova is made by{' '}
          <a href={BRAND_URL} target="_blank" rel="noreferrer">
            Creation of Cosmos
          </a>
          , a video editing studio in Makati.
        </span>
      </footer>
    </div>
  )
}
