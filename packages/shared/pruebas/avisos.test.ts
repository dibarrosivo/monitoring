import { describe, expect, it } from 'vitest';
import { fraseParaEvento, type CargaAviso } from '@monitoring/shared';

function evento(parcial: Partial<CargaAviso>): CargaAviso {
  return { eventoId: 1, panelId: 5, prioridad: 4, descripcion: '', sitioNombre: 'Panadería K3', ...parcial };
}

const unSitio = { nombrarSitio: false };
const variosSitios = { nombrarSitio: true };

describe('lo que dice la app y el push (misma redacción)', () => {
  it('armado y desarmado, con quién lo hizo si se sabe', () => {
    const cierre = evento({ categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre (armado): Apertura/Cierre por usuario — Ana (cód. 3)' });
    expect(fraseParaEvento(cierre, unSitio)).toMatchObject({ texto: 'Sistema armado por Ana', titulo: 'Sistema armado', cuerpo: 'Armado por Ana', canal: 'avisos', grupo: 'armadoDesarmado' });
    const apertura = evento({ categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura (desarmado): Apertura/Cierre por usuario' });
    expect(fraseParaEvento(apertura, unSitio)).toMatchObject({ texto: 'Sistema desarmado', titulo: 'Sistema desarmado', cuerpo: 'Desarmado' });
  });

  it('armado en casa se distingue', () => {
    const e = evento({ categoria: 'cierre', codigo: 'R441', descripcion: 'Cierre (armado): Armado en modo presente' });
    expect(fraseParaEvento(e, unSitio)).toMatchObject({ texto: 'Sistema armado en casa', cuerpo: 'Armado en casa' });
  });

  it('con varios sitios se nombra el lugar', () => {
    const e = evento({ categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre (armado): x' });
    expect(fraseParaEvento(e, variosSitios)?.texto).toBe('Sistema armado en Panadería K3');
  });

  it('la alarma dice la zona por su nombre, y si no hay zona, qué fue', () => {
    const e = evento({ categoria: 'alarma', codigo: 'E130', descripcion: 'Robo: Robo perímetro', prioridad: 2, zona: '005', zonaDescripcion: 'Puerta trasera MAG' });
    expect(fraseParaEvento(e, variosSitios)).toMatchObject({ texto: 'Alarma en zona 5, Puerta trasera MAG en Panadería K3', titulo: 'ALARMA', tono: 'alarma', persistente: true, canal: 'alarmas', grupo: null });
    const sinZona = evento({ categoria: 'alarma', codigo: 'E140', descripcion: 'Alarma: Alarma general', prioridad: 2 });
    expect(fraseParaEvento(sinZona, unSitio)?.texto).toBe('Alarma: Alarma general');
  });

  it('las emergencias tienen nombre propio y no se apagan', () => {
    const panico = evento({ categoria: 'alarma', codigo: 'E120', descripcion: 'Pánico', prioridad: 1 });
    expect(fraseParaEvento(panico, variosSitios)).toMatchObject({ texto: 'Emergencia: pánico en Panadería K3', titulo: 'EMERGENCIA', cuerpo: 'pánico en Panadería K3', tono: 'emergencia', persistente: true, canal: 'alarmas', grupo: null });
    expect(fraseParaEvento(evento({ categoria: 'alarma', codigo: 'E110', descripcion: 'Incendio', prioridad: 1 }), unSitio)?.texto).toBe('Emergencia: incendio');
    expect(fraseParaEvento(evento({ categoria: 'alarma', codigo: 'E121', descripcion: 'Coacción', prioridad: 1 }), unSitio)?.texto).toBe('Emergencia: coacción');
    // Prioridad máxima sin nombre propio: se usa la descripción
    expect(fraseParaEvento(evento({ categoria: 'alarma', codigo: 'E199', descripcion: 'Alarma: Sensor especial', prioridad: 1 }), unSitio)?.texto).toBe('Emergencia: sensor especial');
  });

  it('el pánico desde la app nombra a quien lo mandó', () => {
    const e = evento({ categoria: 'alarma', codigo: 'E120', descripcion: 'Pánico', prioridad: 1 });
    expect(fraseParaEvento(e, unSitio)?.texto).toBe('Emergencia: pánico');
  });

  it('averías y restauraciones van al grupo que se puede apagar', () => {
    const bateria = evento({ categoria: 'averia', codigo: 'E302', descripcion: 'Batería baja' });
    expect(fraseParaEvento(bateria, unSitio)).toMatchObject({ texto: 'Aviso: Batería baja', titulo: 'Aviso', cuerpo: 'Batería baja', tono: 'aviso', persistente: false, grupo: 'averias' });
    const vuelve = evento({ categoria: 'restauracion', codigo: 'R301', descripcion: 'Restauración: Falla de red eléctrica' });
    expect(fraseParaEvento(vuelve, unSitio)).toMatchObject({ texto: 'Restablecido: Falla de red eléctrica', titulo: 'Restablecido', tono: 'bien' });
    const natural = evento({ categoria: 'restauracion', codigo: 'R301', descripcion: 'Restauración de electricidad' });
    expect(fraseParaEvento(natural, variosSitios)).toMatchObject({ texto: 'Restauración de electricidad en Panadería K3', titulo: 'Restauración de electricidad' });
  });

  it('las averías no nombran zona: en las de sistema ese campo es la vía o el módulo', () => {
    const comunicacion = evento({ categoria: 'averia', codigo: 'E354', descripcion: 'No pudo comunicar un evento a la central', zona: '001' });
    expect(fraseParaEvento(comunicacion, unSitio)?.texto).toBe('Aviso: No pudo comunicar un evento a la central');
    const sensor = evento({ categoria: 'averia', codigo: 'E380', descripcion: 'Avería de sensor', zona: '096', zonaDescripcion: 'Depósito' });
    expect(fraseParaEvento(sensor, variosSitios)?.texto).toBe('Aviso: Avería de sensor en Panadería K3');
    const vuelve = evento({ categoria: 'restauracion', codigo: 'R350', descripcion: 'Restauración de comunicación con la central', zona: '002' });
    expect(fraseParaEvento(vuelve, unSitio)?.texto).toBe('Restauración de comunicación con la central');
    // La restauración de una alarma sí dice la zona: es la que se disparó
    const robo = evento({ categoria: 'restauracion', codigo: 'R130', descripcion: 'Restauración: Robo', zona: '005', zonaDescripcion: 'Puerta trasera' });
    expect(fraseParaEvento(robo, unSitio)?.texto).toBe('Restablecido: Robo en zona 5, Puerta trasera');
  });

  it('las pruebas periódicas y los latidos no dicen nada', () => {
    expect(fraseParaEvento(evento({ categoria: 'prueba', codigo: 'E602', descripcion: 'Prueba periódica' }), unSitio)).toBeNull();
    expect(fraseParaEvento(evento({ categoria: 'prueba', codigo: 'PIMA-01', descripcion: 'Estado interno' }), unSitio)).toBeNull();
    expect(fraseParaEvento(evento({ codigo: 'E602', descripcion: 'x' }), unSitio)).toBeNull();
  });

  it('los avisos graves del sistema suenan como alarma y no se apagan', () => {
    const mudo = evento({ categoria: 'sistema', codigo: 'SYS-SILENCIO', descripcion: 'Panel mudo', prioridad: 1 });
    expect(fraseParaEvento(mudo, unSitio)).toMatchObject({ texto: 'Aviso de la central: Panel mudo', tono: 'alarma', canal: 'alarmas', grupo: null });
    const leve = evento({ categoria: 'sistema', codigo: 'SYS-X', descripcion: 'Actualización', prioridad: 3 });
    expect(fraseParaEvento(leve, unSitio)).toMatchObject({ tono: 'aviso', canal: 'avisos', grupo: 'sistema', persistente: false });
  });
});
