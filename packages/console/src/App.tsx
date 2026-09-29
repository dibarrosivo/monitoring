import { useState } from 'react';
import { impersonando, usuarioGuardado, vistaPreferida } from './api.js';
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
  /*
   * Personal de la central que además es cliente de sí mismo (el dueño): abre
   * en su propia alarma, que es lo que mira todos los días, y desde ahí pasa a
   * la consola cuando la necesita. Los avisos le llegan igual en las dos.
   */
  if (usuario.tieneAcceso && vistaPreferida() === 'cliente') return <PantallaCliente usuario={usuario} conConsola />;
  return <Consola usuario={usuario} />;
}
