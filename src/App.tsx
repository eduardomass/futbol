import { useState } from 'react'
import Login from '@/pages/Login'
import Inicio from '@/pages/Inicio'
import type { Usuario } from '@/types'

export default function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)

  if (!usuario) {
    return <Login onLogin={setUsuario} />
  }

  return <Inicio usuario={usuario} onLogout={() => setUsuario(null)} />
}
