import { describe, expect, it } from 'vitest';
import { fraseParaEvento } from './frases.js';
import type { MensajeTiempoReal } from '../tipos.js';

type Carga = MensajeTiempoReal['carga'];

function evento(parcial: Partial<Carga>): Carga {
  return { eventoId: 1, panelId: 5, prioridad: 4, descripcion: '', sitioNombre: 'Panadería K3', ...parcial };
}

const unSitio = { nombrarSitio: false };
const variosSitios = { nombrarSitio: true };

describe('lo que dice la app', () => {
  it('armado y desarmado, con quién lo hizo si se sabe', () => {
    const cierre = evento({ categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre (armado): Apertura/Cierre por usuario — Ana (cód. 3)' });
    expect(fraseParaEvento(cierre, unSitio)?.texto).toBe('Sistema armado por Ana');
    const apertura = evento({ categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura (desarmado): Apertura/Cierre por usuario' });
    expect(fraseParaEvento(apertura, unSitio)?.texto).toBe('Sistema desarmado');
  });

  it('armado en casa se distingue', () => {
    const e = evento({ categoria: 'cierre', codigo: 'R441', descripcion: 'Cierre (armado): Armado en modo presente' });
    expect(fraseParaEvento(e, unSitio)?.texto).toBe('Sistema armado en casa');
  });

  it('con varios sitios se nombra el lugar', () => {
    const e = evento({ categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre (armado): Apertura/Cierre por usuario' });
    expect(fraseParaEvento(e, variosSitios)?.texto).toBe('Sistema armado en Panadería K3');
  });

  it('una alarma de zona dice la zona y su nombre, y se queda en pantalla', () => {
    const e = evento({ categoria: 'alarma', codigo: 'E140', descripcion: 'Alarma en zona 3', zona: '003', zonaDescripcion: 'Cocina', prioridad: 2 });
    const f = fraseParaEvento(e, variosSitios);
    expect(f?.texto).toBe('Alarma en zona 3, Cocina en Panadería K3');
    expect(f?.tono).toBe('alarma');
    expect(f?.persistente).toBe(true);
  });

  it('una alarma sin zona dice qué es', () => {
    const e = evento({ categoria: 'alarma', codigo: 'E140', descripcion: 'Alarma general', prioridad: 2 });
    expect(fraseParaEvento(e, unSitio)?.texto).toBe('Alarma: Alarma general');
  });

  it('las de prioridad máxima son emergencias con nombre', () => {
    const panico = evento({ categoria: 'alarma', codigo: 'E120', descripcion: 'Pánico', prioridad: 1 });
    expect(fraseParaEvento(panico, variosSitios)).toMatchObject({ texto: 'Emergencia: pánico en Panadería K3', tono: 'emergencia', persistente: true });
    const fuego = evento({ categoria: 'alarma', codigo: 'E110', descripcion: 'Incendio', prioridad: 1 });
    expect(fraseParaEvento(fuego, unSitio)?.texto).toBe('Emergencia: incendio');
    const coaccion = evento({ categoria: 'alarma', codigo: 'E121', descripcion: 'Coacción', prioridad: 1 });
    expect(fraseParaEvento(coaccion, unSitio)?.texto).toBe('Emergencia: coacción');
  });

  it('averías y restauraciones se avisan sin alarmar', () => {
    const bateria = evento({ categoria: 'averia', codigo: 'E302', descripcion: 'Batería baja', prioridad: 3 });
    expect(fraseParaEvento(bateria, unSitio)).toMatchObject({ texto: 'Aviso: Batería baja', tono: 'aviso', persistente: false });
    const vuelve = evento({ categoria: 'restauracion', codigo: 'R301', descripcion: 'Restauración: Falla de red eléctrica' });
    expect(fraseParaEvento(vuelve, unSitio)?.texto).toBe('Restablecido: Falla de red eléctrica');
  });

  it('las pruebas y el estado interno del receptor se callan', () => {
    expect(fraseParaEvento(evento({ categoria: 'prueba', codigo: 'E602', descripcion: 'Prueba periódica' }), unSitio)).toBeNull();
    expect(fraseParaEvento(evento({ categoria: 'prueba', codigo: 'PIMA-01', descripcion: 'Estado interno' }), unSitio)).toBeNull();
    expect(fraseParaEvento(evento({ codigo: 'E602', descripcion: 'x' }), unSitio)).toBeNull();
  });

  it('el pánico enviado desde la app se dice como emergencia', () => {
    const e = evento({ categoria: 'alarma', codigo: 'APP-PANICO', descripcion: 'PÁNICO desde la app', prioridad: 1 });
    expect(fraseParaEvento(e, unSitio)?.texto).toBe('Emergencia: pánico desde la app');
  });
});
