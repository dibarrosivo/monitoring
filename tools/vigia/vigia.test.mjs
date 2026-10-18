import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidir, duracion } from './vigia.mjs';

const cfg = { objetivo: 'Central FST', fallosParaAvisar: 3, recordarMin: 60 };
const MIN = 60_000;
const falla = [{ chequeo: 'https://monitoreo.falconseguridadtotal.com/api/salud', ok: false, detalle: 'ECONNREFUSED' }];

/** Corre varias vueltas seguidas, una por minuto, y junta los avisos. */
function vueltas(resultados, inicio = 0, estado = {}) {
  const avisos = [];
  resultados.forEach((fallidos, i) => {
    const r = decidir(estado, fallidos, inicio + i * MIN, cfg);
    estado = r.estado;
    if (r.aviso) avisos.push({ minuto: i, ...r.aviso });
  });
  return { estado, avisos };
}

test('un micro corte de uno o dos minutos no despierta a nadie, ni a la ida ni a la vuelta', () => {
  const { avisos } = vueltas([[], falla, falla, [], []]);
  assert.deepEqual(avisos, []);
});

test('al tercer minuto seguido avisa la caída, con la duración y qué falla', () => {
  const { avisos } = vueltas([falla, falla, falla]);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].minuto, 2);
  assert.equal(avisos[0].titulo, 'CENTRAL FST CAÍDO');
  assert.match(avisos[0].cuerpo, /monitoreo\.falconseguridadtotal\.com\/api\/salud \(ECONNREFUSED\)/);
});

test('mientras sigue caído recuerda cada hora, no cada minuto', () => {
  const { avisos } = vueltas(Array(125).fill(falla));
  assert.deepEqual(avisos.map((a) => [a.minuto, a.tipo]), [[2, 'caida'], [62, 'recordatorio'], [122, 'recordatorio']]);
});

test('al volver avisa cuánto duró y deja el estado limpio', () => {
  const { avisos, estado } = vueltas([...Array(24).fill(falla), []]);
  const vuelta = avisos.at(-1);
  assert.equal(vuelta.tipo, 'vuelta');
  assert.equal(vuelta.cuerpo, 'Volvió a responder tras 24 min caído.');
  assert.deepEqual([estado.fallos, estado.caidoDesde, estado.avisadoEn], [0, null, null]);
});

test('duraciones legibles', () => {
  assert.equal(duracion(30_000), '1 min');
  assert.equal(duracion(45 * MIN), '45 min');
  assert.equal(duracion(60 * MIN), '1 h');
  assert.equal(duracion(135 * MIN), '2 h 15 min');
});
