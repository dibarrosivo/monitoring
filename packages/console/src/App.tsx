import { useState } from 'react';
import { usuarioGuardado } from './api.js';
import type { Usuario } from './tipos.js';
import { Login } from './Login.js';
import { Consola } from './Consola.js';

export function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(usuarioGuardado());

  if (!usuario) return <Login alIngresar={setUsuario} />;
  return <Consola usuario={usuario} />;
}
