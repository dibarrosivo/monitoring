import { describe, expect, it } from 'vitest';
import {
  interpretarEstado,
  interpretarEstadoHost,
  interpretarRespuestaControl,
  interpretarRespuestaToken,
  sesionVigente,
  uriControl,
} from '../src/control/hikvision.js';
import { admiteControl, proveedorPara, registrarProveedor, SIN_CONTROL } from '../src/control/proveedor.js';

/**
 * Lo que se puede probar sin red: la selección de proveedor, el armado de las
 * URI, y la lectura de las respuestas, cuyas formas salen de la guía oficial
 * y de respuestas reales capturadas el 13 de septiembre de 2026.
 */

describe('qué equipos admiten control', () => {
  it('los equipos sin proveedor no admiten control', () => {
    // PIMA y los transmisores reportan por vías de un solo sentido
    for (const tipo of ['pima', 'ebs', 'otro']) {
      expect(admiteControl(tipo)).toBe(false);
    }
  });

  it('un tipo sin proveedor devuelve el proveedor nulo, no revienta', () => {
    // Deliberado: el resto del sistema no debe preguntar "¿y si no hay?"
    expect(proveedorPara('pima')).toBe(SIN_CONTROL);
  });

  it('el proveedor nulo rechaza con un motivo legible', async () => {
    const r = await SIN_CONTROL.enviar({ serial: 'X', accion: 'armar', particion: '01' });
    expect(r.aceptado).toBe(false);
    expect(r.detalle).toMatch(/no admite control/i);
  });

  it('registrar un proveedor habilita ese tipo', () => {
    registrarProveedor('marca_prueba', () => ({
      nombre: 'prueba',
      async enviar() {
        return { aceptado: true };
      },
    }));
    expect(admiteControl('marca_prueba')).toBe(true);
    expect(proveedorPara('marca_prueba').nombre).toBe('prueba');
  });
});

describe('sesión contra la nube de Hikvision', () => {
  it('usa el dominio regional que devuelve el servicio, no el de origen', () => {
    // Verificado contra el servicio real: pedir el token a api.hik-partner.com
    // devuelve areaDomain, y llamar al de origen da 404.
    const s = interpretarRespuestaToken({
      data: { accessToken: 'hpc.abc', expireTime: 1789653897003, areaDomain: 'https://apiisa.hik-partner.com' },
    });
    expect(s.base).toBe('https://apiisa.hik-partner.com');
    expect(s.token).toBe('hpc.abc');
  });

  it('el vencimiento es una marca absoluta, no una duración', () => {
    const s = interpretarRespuestaToken({ data: { accessToken: 'x', expireTime: 1789653897003 } });
    expect(s.vence).toBe(1789653897003);
  });

  it('sin token, falla con un motivo claro', () => {
    expect(() => interpretarRespuestaToken({ data: {} })).toThrow(/no devolvió un token/i);
    expect(() => interpretarRespuestaToken({})).toThrow();
  });

  it('quita la barra final del dominio para no armar rutas con doble barra', () => {
    const s = interpretarRespuestaToken({ data: { accessToken: 'x', areaDomain: 'https://a.com/' } });
    expect(s.base).toBe('https://a.com');
  });

  it('una sesión vencida o por vencer no se reutiliza', () => {
    const ahora = 1_000_000;
    expect(sesionVigente({ base: 'x', token: 't', vence: ahora + 300_000 }, ahora)).toBe(true);
    expect(sesionVigente({ base: 'x', token: 't', vence: ahora - 1 }, ahora)).toBe(false);
    // Margen: una que vence en 30 segundos podría expirar durante la llamada
    expect(sesionVigente({ base: 'x', token: 't', vence: ahora + 30_000 }, ahora)).toBe(false);
    expect(sesionVigente(null, ahora)).toBe(false);
  });
});

describe('URI de control por el paso transparente a ISAPI', () => {
  // Salen textualmente del apéndice A.4 de la guía del fabricante
  it('armado total', () => {
    expect(uriControl('armar', 1)).toBe('/ISAPI/SecurityCP/control/arm/1?ways=away&format=json');
  });
  it('armado en casa', () => {
    expect(uriControl('armar_casa', 2)).toBe('/ISAPI/SecurityCP/control/arm/2?ways=stay&format=json');
  });
  it('desarmado no lleva modo', () => {
    expect(uriControl('desarmar', 1)).toBe('/ISAPI/SecurityCP/control/disarm/1?format=json');
  });
});

describe('lectura de la respuesta a una orden', () => {
  it('statusCode 1 del panel es "hecho"', () => {
    const r = interpretarRespuestaControl({
      status: 200,
      cuerpo: '{"requestURL":"/ISAPI/SecurityCP/control/arm/1","statusCode":1,"statusString":"OK","subStatusCode":"ok"}',
    });
    expect(r.aceptado).toBe(true);
  });

  it('el panel puede rechazar con 200 de la pasarela: statusCode distinto de 1', () => {
    // Por ejemplo una zona abierta que impide armar
    const r = interpretarRespuestaControl({
      status: 200,
      cuerpo: '{"statusCode":4,"statusString":"Invalid Operation","subStatusCode":"armingFailed","errorCode":1073774592,"errorMsg":"Arming failed."}',
    });
    expect(r.aceptado).toBe(false);
    expect(r.detalle).toMatch(/Arming failed/);
  });

  it('el rechazo de la pasarela viene con errorCode de letras', () => {
    // Capturado en vivo: token vacío
    const r = interpretarRespuestaControl({
      status: 200,
      cuerpo: '{"message":"Token is Empty.{LAP500002}","errorCode":"LAP500002"}',
    });
    expect(r.aceptado).toBe(false);
    expect(r.detalle).toMatch(/Token is Empty/);
  });

  it('el errorCode numérico del panel no se confunde con un rechazo de la pasarela', () => {
    // JSON_ResponseStatus trae errorCode numérico junto a statusCode 1 en algunos equipos
    const r = interpretarRespuestaControl({ status: 200, cuerpo: '{"statusCode":1,"errorCode":1}' });
    expect(r.aceptado).toBe(true);
  });

  it('un 404 de la pasarela se informa con su motivo', () => {
    // Capturado en vivo al probar rutas inexistentes
    const r = interpretarRespuestaControl({
      status: 404,
      cuerpo: '{"timestamp":1789354352905,"status":404,"error":"Not Found","path":"/open/alarm/v1/alarm/arm"}',
    });
    expect(r.aceptado).toBe(false);
    expect(r.detalle).toMatch(/Not Found/);
  });

  it('un cuerpo ilegible no revienta', () => {
    const r = interpretarRespuestaControl({ status: 502, cuerpo: '<html>Bad Gateway</html>' });
    expect(r.aceptado).toBe(false);
    expect(r.detalle).toMatch(/ilegible/);
  });
});

describe('lectura del estado de particiones', () => {
  // Respuesta real del panel 7037, capturada el 13 de septiembre de 2026
  const real = {
    SubSysList: [
      { SubSys: { id: 1, arming: 'disarm', alarm: false, enabled: true, name: 'Bella Nova' } },
      { SubSys: { id: 2, arming: 'disarm', alarm: false, enabled: false, name: 'Area2' } },
    ],
  };

  it('traduce la respuesta real del panel', () => {
    const e = interpretarEstado(real);
    expect(e).toHaveLength(2);
    expect(e[0]).toEqual({ particion: 1, nombre: 'Bella Nova', habilitada: true, estado: 'desarmado', enAlarma: false });
    expect(e[1]!.habilitada).toBe(false);
  });

  it('distingue armado total, en casa y en proceso', () => {
    const e = interpretarEstado({
      SubSysList: [
        { SubSys: { id: 1, arming: 'away' } },
        { SubSys: { id: 2, arming: 'stay' } },
        { SubSys: { id: 3, arming: 'arming' } },
      ],
    });
    expect(e.map((p) => p.estado)).toEqual(['armado', 'armado_casa', 'armando']);
  });

  it('una alarma activa se ve aunque la partición esté armada', () => {
    const e = interpretarEstado({ SubSysList: [{ SubSys: { id: 1, arming: 'away', alarm: true } }] });
    expect(e[0]!.enAlarma).toBe(true);
  });

  it('con una respuesta vacía o rara devuelve lista vacía', () => {
    expect(interpretarEstado({})).toEqual([]);
    expect(interpretarEstado(null)).toEqual([]);
    expect(interpretarEstado({ SubSysList: [{ SubSys: { id: 'x' } }] })).toEqual([]);
  });
});

describe('estado completo del panel (zonas, batería, conexiones)', () => {
  // Recortado de la respuesta real del DS-PHA20-W2P (cuenta 7037), 16 de septiembre de 2026
  const real = {
    AlarmHostStatus: {
      ZoneList: [
        { Zone: { id: 0, name: 'Z1-Pueta E/S', status: 'online', tamperEvident: false, shielded: false, bypassed: false, armed: false, alarm: false, zoneType: 'Delay', signal: 0 } },
        { Zone: { id: 1, name: 'Z2-Sala', status: 'online', tamperEvident: false, shielded: false, bypassed: true, armed: false, alarm: false, zoneType: 'Follow' } },
        { Zone: { id: 2, name: 'Z3-Puerta deposito', status: 'online', tamperEvident: true, bypassed: false, armed: true, alarm: false, zoneType: 'Instant' } },
        { Zone: { id: 3, name: '', status: 'trigger', tamperEvident: false, bypassed: false, armed: true, alarm: true, zoneType: 'Instant' } },
        { Zone: { id: 4, name: 'Zone 5', status: 'notRelated', tamperEvident: false, bypassed: false, armed: false, alarm: false } },
      ],
      SubSysList: [
        { SubSys: { id: 1, arming: 'disarm', alarm: false, enabled: true } },
        { SubSys: { id: 2, arming: 'disarm', alarm: false, enabled: false } },
      ],
      ExDevStatus: {
        SirenList: [
          { Siren: { id: 1, name: 'Sounder 1', status: 'off', tamperEvident: false } },
          { Siren: { id: 2, name: 'Sounder 2', status: 'notRelated', tamperEvident: false } },
        ],
        KeypadList: [{ Keypad: { id: 1, name: 'Keypad 1', status: 'online', tamperEvident: false } }],
        RepeaterList: [{ Repeater: { id: 1, name: 'Repeater 1', status: 'notRelated' } }],
      },
      BatteryList: [{ Battery: { id: 1, status: 'normal', percent: 100, voltage: 4 } }],
      CommuniStatus: { wired: 'break', wifi: 'normal', wifiSignal: 4, cloud: 'normal' },
    },
  };

  it('lista solo las zonas con sensor, numeradas desde 1 y con el nombre del panel', () => {
    const e = interpretarEstadoHost(real);
    expect(e.zonas.map((z) => z.numero)).toEqual([1, 2, 3, 4]);
    expect(e.zonas[0]).toMatchObject({ nombre: 'Z1-Pueta E/S', estado: 'normal', armada: false, tipo: 'Delay' });
    // Sin nombre en el panel se nombra por número
    expect(e.zonas[3]!.nombre).toBe('Zona 4');
  });

  it('distingue anulada, sabotaje y activa', () => {
    const e = interpretarEstadoHost(real);
    expect(e.zonas[1]!.estado).toBe('anulada');
    expect(e.zonas[2]!.estado).toBe('sabotaje');
    expect(e.zonas[3]).toMatchObject({ estado: 'activa', enAlarma: true, armada: true });
  });

  it('trae batería, conexiones y periféricos presentes', () => {
    const e = interpretarEstadoHost(real);
    expect(e.bateria).toEqual({ porcentaje: 100, estado: 'normal' });
    expect(e.comunicaciones).toEqual({ cable: 'break', wifi: 'normal', senalWifi: 4, nube: 'normal' });
    expect(e.perifericos).toEqual([
      { tipo: 'sirena', nombre: 'Sounder 1', estado: 'off', sabotaje: false },
      { tipo: 'teclado', nombre: 'Keypad 1', estado: 'online', sabotaje: false },
    ]);
    expect(e.particiones[0]).toMatchObject({ particion: 1, estado: 'desarmado', habilitada: true });
  });

  it('con una respuesta vacía no revienta', () => {
    const e = interpretarEstadoHost({});
    expect(e.zonas).toEqual([]);
    expect(e.particiones).toEqual([]);
    expect(e.bateria).toBeUndefined();
  });
});
