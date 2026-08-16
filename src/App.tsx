import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Jugadores from '@/pages/Jugadores'
import Login from '@/pages/Login'
import Partido from '@/pages/Partido'
import { sesionActual } from '@/lib/api'
import { borrarSesion, guardarSesion, leerSesion } from '@/lib/session'
import type { Sesion } from '@/types'

export default function App() {
  const [sesion, setSesion] = useState<Sesion | null>(() => leerSesion())
  const [verificando, setVerificando] = useState(() => leerSesion() !== null)

  // La sesión guardada en localStorage puede estar vieja: el token pudo vencer,
  // o los permisos del jugador pudieron cambiar desde el último login. Al
  // arrancar le preguntamos a la base cuál es el estado real.
  useEffect(() => {
    const guardada = leerSesion()
    if (!guardada) return

    let vigente = true
    sesionActual(guardada.token)
      .then(fresca => {
        if (!vigente) return
        if (fresca) {
          guardarSesion(fresca)
          setSesion(fresca)
        } else {
          borrarSesion()
          setSesion(null)
        }
      })
      .catch(() => {
        // Sin conexión o error de red: seguimos con lo que había guardado
        // en vez de echar al usuario.
      })
      .finally(() => {
        if (vigente) setVerificando(false)
      })

    return () => {
      vigente = false
    }
  }, [])

  if (verificando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05070d] text-slate-400">
        Cargando…
      </div>
    )
  }

  // Sin sesión, cualquier URL muestra el login. Al entrar, React Router
  // resuelve la ruta original: por eso un link directo a /partido/7 lleva
  // al partido recién después de validar email y clave.
  if (!sesion) {
    return (
      <Routes>
        <Route path="*" element={<Login onLogin={setSesion} />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout sesion={sesion} onLogout={() => setSesion(null)} />}>
        <Route path="/" element={<Dashboard sesion={sesion} />} />
        <Route path="/jugadores" element={<Jugadores sesion={sesion} />} />
        <Route path="/partido/:id" element={<Partido sesion={sesion} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
