import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Jugadores from '@/pages/Jugadores'
import Login from '@/pages/Login'
import Partido from '@/pages/Partido'
import { leerSesion } from '@/lib/session'
import type { Sesion } from '@/types'

export default function App() {
  const [sesion, setSesion] = useState<Sesion | null>(() => leerSesion())

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
