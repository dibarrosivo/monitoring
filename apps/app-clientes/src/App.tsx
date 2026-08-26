import { useState } from 'react';
import { usuarioGuardado, type UsuarioApp } from './api.js';
import { Ingreso } from './pantallas/Ingreso.js';
import { Principal } from './pantallas/Principal.js';

export function App() {
  const [usuario, setUsuario] = useState<UsuarioApp | null>(usuarioGuardado());

  if (!usuario) return <Ingreso alIngresar={setUsuario} />;
  return <Principal usuario={usuario} />;
}
