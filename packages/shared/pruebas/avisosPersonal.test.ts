import { describe, expect, it } from 'vitest';
import { fraseParaPersonal, type CargaAviso } from '@monitoring/shared';

type Carga = CargaAviso & { numeroCuenta?: string | null; prefijo?: string | null };
const base: Carga = { eventoId: 1, panelId: 5, prioridad: 2, descripcion: '', numeroCuenta: '7075', prefijo: 'AL', sitioNombre: 'Panadería K3' };

describe('avisos al personal de la central', () => {
  it('las emergencias llevan cuenta, sitio y qué pasó, por el canal fuerte', () => {
    const panico = { ...base, categoria: 'alarma' as const, codigo: 'E120', descripcion: 'Pánico', prioridad: 1 };
    expect(fraseParaPersonal(panico)).toMatchObject({
      titulo: 'EMERGENCIA',
      cuerpo: 'AL-7075 Panadería K3: pánico',
      canal: 'alarmas',
      persistente: true,
      grupo: null,
    });
  });

  it('un robo común NO interrumpe al personal: se ve en la cola', () => {
    const robo = { ...base, categoria: 'alarma' as const, codigo: 'E130', descripcion: 'Robo: Robo perímetro', zona: '005', zonaDescripcion: 'Puerta trasera' };
    expect(fraseParaPersonal(robo)).toBeNull();
  });

  it('nada de aperturas, cierres, averías ni pruebas', () => {
    expect(fraseParaPersonal({ ...base, categoria: 'apertura', codigo: 'E401', descripcion: 'Apertura' })).toBeNull();
    expect(fraseParaPersonal({ ...base, categoria: 'averia', codigo: 'E302', descripcion: 'Batería baja' })).toBeNull();
    expect(fraseParaPersonal({ ...base, categoria: 'prueba', codigo: 'E602', descripcion: 'Prueba periódica' })).toBeNull();
  });

  it('las fallas de la propia central son lo más grave: central muda y puente caído', () => {
    const muda = { ...base, categoria: 'sistema' as const, codigo: 'SIS-GEN', descripcion: 'SIN SEÑALES EN LA CENTRAL: ningún receptor recibió nada hace más de 20 min', prioridad: 1, numeroCuenta: null, panelId: null };
    expect(fraseParaPersonal(muda)).toMatchObject({ titulo: 'CENTRAL MUDA', canal: 'alarmas', persistente: true });
    const puente = { ...base, categoria: 'sistema' as const, codigo: 'BRIDGE', descripcion: 'PUENTE CAÍDO: puente-pima-central no reporta hace más de 180 segundos', prioridad: 2, numeroCuenta: null, panelId: null };
    expect(fraseParaPersonal(puente)).toMatchObject({ titulo: 'PUENTE CAÍDO', canal: 'alarmas' });
  });

  it('la vuelta del puente se avisa, pero sin despertar a nadie', () => {
    const vuelve = { ...base, categoria: 'restauracion' as const, codigo: 'BRIDGE-R', descripcion: 'PUENTE RESTABLECIDO: puente-pima-central volvió a reportar tras 2 h 15 min sin latido', prioridad: 3, numeroCuenta: null, panelId: null };
    expect(fraseParaPersonal(vuelve)).toMatchObject({ titulo: 'Puente restablecido', canal: 'avisos', persistente: false, tono: 'bien' });
  });

  it('el panel silencioso de un cliente llega como aviso, no como alarma', () => {
    const mudo = { ...base, categoria: 'sistema' as const, codigo: 'SIS', descripcion: 'Panel silencioso: cuenta 7075 sin señales por más de 2160 minutos' };
    expect(fraseParaPersonal(mudo)).toMatchObject({ titulo: 'Panel silencioso', canal: 'avisos' });
  });
});
