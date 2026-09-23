import { describe, expect, it } from 'vitest';
import { mensajeParaEvento, quiereRecibir } from './avisos.js';

const base = { eventoId: 1, panelId: 5, prioridad: 2, descripcion: '', sitioNombre: 'Geralds Café' };

describe('mensajeParaEvento', () => {
  it('emergencia y alarma van por el canal fuerte y no tienen grupo (no se apagan)', () => {
    const e = mensajeParaEvento({ ...base, categoria: 'alarma', codigo: 'E120', descripcion: 'Pánico', prioridad: 1 }, true)!;
    expect(e.titulo).toBe('EMERGENCIA');
    expect(e.cuerpo).toBe('pánico en Geralds Café');
    expect(e.canal).toBe('alarmas');
    expect(e.grupo).toBeNull();
    const a = mensajeParaEvento({ ...base, categoria: 'alarma', codigo: 'E130', descripcion: 'Robo: Robo perímetro', zona: '005', zonaDescripcion: 'Puerta trasera MAG' }, false)!;
    expect(a.cuerpo).toBe('Alarma en zona 5, Puerta trasera MAG');
  });
  it('armados y desarmados nombran a la persona y van al grupo que se puede apagar', () => {
    const c = mensajeParaEvento({ ...base, categoria: 'cierre', codigo: 'R401', descripcion: 'Cierre (armado): Apertura/Cierre por usuario — Ana Pérez (cód. 1)' }, false)!;
    expect(c.titulo).toBe('Sistema armado');
    expect(c.cuerpo).toBe('Armado por Ana Pérez');
    expect(c.grupo).toBe('armadoDesarmado');
    expect(c.canal).toBe('avisos');
  });
  it('las pruebas periódicas no avisan', () => {
    expect(mensajeParaEvento({ ...base, categoria: 'prueba', codigo: 'E602', descripcion: 'Prueba periódica' }, false)).toBeNull();
  });
});

describe('quiereRecibir', () => {
  const prefs = { armadoDesarmado: false, averias: true, sistema: true, silencioDesde: null, silencioHasta: null };
  it('respeta el grupo apagado y deja pasar lo que no tiene grupo', () => {
    expect(quiereRecibir(prefs, 'armadoDesarmado')).toBe(false);
    expect(quiereRecibir(prefs, 'averias')).toBe(true);
    expect(quiereRecibir(prefs, null)).toBe(true);
  });
  it('la franja de silencio se evalúa en hora de la central', () => {
    const noche = { ...prefs, armadoDesarmado: true, silencioDesde: '22:00', silencioHasta: '07:00' };
    // 03:00 UTC = 23:00 en Caracas: en silencio
    expect(quiereRecibir(noche, 'armadoDesarmado', new Date('2026-09-23T03:00:00Z'))).toBe(false);
    // 15:00 UTC = 11:00 en Caracas: pasa
    expect(quiereRecibir(noche, 'armadoDesarmado', new Date('2026-09-23T15:00:00Z'))).toBe(true);
  });
});
