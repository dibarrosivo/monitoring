import { useState } from 'react';
import { impersonando, usuarioGuardado } from './api.js';
import type { Usuario } from './tipos.js';
import { Login } from './Login.js';
import { Consola } from './Consola.js';
import { PantallaCliente } from './cliente/PantallaCliente.js';

/** Un solo frontend: el rol decide la vista (como en FleetView). */
export function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(usuarioGuardado());
  const imp = impersonando();

  if (!usuario) return <Login alIngresar={setUsuario} />;
  // Un admin viendo la plataforma como un usuario de la app
  if (imp && usuario.rol !== 'cliente') return <PantallaCliente usuario={imp} impersonado />;
  if (usuario.rol === 'cliente') return <PantallaCliente usuario={usuario} />;
  return <Consola usuario={usuario} />;
}
