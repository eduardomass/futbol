import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { cerrarSesion } from '@/lib/api'
import { borrarSesion } from '@/lib/session'
import type { Sesion } from '@/types'

type LayoutProps = {
  sesion: Sesion
  onLogout: () => void
}

const enlaces = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/jugadores', label: 'Jugadores', end: false },
  { to: '/estadisticas', label: 'Estadísticas', end: false },
]

export default function Layout({ sesion, onLogout }: LayoutProps) {
  const navigate = useNavigate()

  async function salir() {
    try {
      await cerrarSesion(sesion.token)
    } catch {
      // si el token ya venció da igual: igual limpiamos del lado del cliente
    }
    borrarSesion()
    onLogout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#05070d]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#05070d]/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="text-2xl" aria-hidden>
            ⚽
          </span>
          <span className="font-bold text-white">Futbol</span>

          <nav className="ml-4 flex gap-1">
            {enlaces.map(e => (
              <NavLink
                key={e.to}
                to={e.to}
                end={e.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm transition ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {e.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-400 sm:inline">{sesion.nombre}</span>
            <button
              onClick={salir}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-300 transition hover:border-white/30 hover:text-white"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
