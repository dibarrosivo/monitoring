/**
 * Puente PIMA → central de monitoreo.
 *
 * Corre en la PC de la central conectada al receptor. Lee las tramas del puerto
 * serie (o de una salida TCP), las guarda en disco, le responde ACK al receptor
 * y las reenvía al servidor. No interpreta nada: el parseo vive en el servidor,
 * así un cambio de formato no obliga a tocar esta máquina.
 *
 * Uso:
 *   puente.exe             (con un .env al lado)
 *   npm run dev
 */
import { ColaEnDisco } from './cola.js';
import { leerConfig } from './config.js';
import { Enviador, VERSION } from './enviador.js';
import { abrirFuenteSerie, abrirFuenteTcp, listarPuertosSerie, type Fuente } from './fuentes.js';
import { configurarRegistro, registrar } from './registro.js';

const ACK = 0x06;

/** Muestra los puertos serie de la PC: el primer paso al instalar el puente. */
async function mostrarPuertos(): Promise<void> {
  try {
    const puertos = await listarPuertosSerie();
    if (puertos.length === 0) {
      console.log('No se detectó ningún puerto serie en esta PC.');
      console.log('Revise que el adaptador USB-serie esté conectado y con su driver instalado.');
      return;
    }
    console.log('Puertos serie detectados:\n');
    for (const p of puertos) console.log(`  ${p.puerto.padEnd(10)} ${p.descripcion || '(sin descripción)'}`);
    console.log('\nAnote el que corresponde al receptor y póngalo en BRIDGE_PUERTO_SERIE del archivo .env');
  } catch (err) {
    console.error('No se pudieron listar los puertos:', err instanceof Error ? err.message : String(err));
  }
}

async function arrancar(): Promise<void> {
  // Modo ayuda: listar los puertos de la PC y salir
  if (process.argv.includes('--puertos') || process.argv.includes('--listar-puertos')) {
    await mostrarPuertos();
    return;
  }

  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables del entorno
  }

  const config = leerConfig();
  configurarRegistro(config.nivelLog);

  if (!config.token) {
    registrar('error', 'Falta BRIDGE_TOKEN: el servidor rechazaría todo. Revise el archivo .env');
    process.exit(1);
  }

  registrar('info', `Puente ${config.nombre} v${VERSION} iniciando`, {
    fuente: config.fuente,
    servidor: config.servidor,
    origen: config.fuente === 'serie' ? config.puertoSerie : `${config.tcpHost}:${config.tcpPuerto}`,
  });

  const cola = new ColaEnDisco(config.archivoCola);
  if (cola.cantidad > 0) registrar('info', 'Tramas pendientes de envíos anteriores', { pendientes: cola.cantidad });

  const enviador = new Enviador(config, cola);
  let fuente: Fuente;

  /**
   * Regla de oro: primero se guarda la trama en disco, después se le responde
   * ACK al receptor. Si el ACK saliera antes, un corte entre medio perdería la
   * señal y el receptor la daría por entregada.
   */
  function alRecibirLinea(linea: string): void {
    cola.agregar({ cruda: linea, leidaEn: new Date().toISOString() });
    if (config.responderAck) fuente.responder(ACK);
    registrar('debug', 'Trama recibida', { cruda: linea });
    enviador.despertar();
  }

  if (config.fuente === 'serie') {
    try {
      fuente = await abrirFuenteSerie(config, alRecibirLinea);
    } catch (err) {
      registrar('error', 'No se pudo abrir el puerto serie', {
        puerto: config.puertoSerie,
        error: err instanceof Error ? err.message : String(err),
      });
      // En vez de dejarlo adivinando, se le muestran los puertos que sí existen
      console.log('');
      await mostrarPuertos();
      console.log('\nTambién puede ocurrir que el puerto esté tomado por otro programa:');
      console.log('cierre el software viejo de monitoreo antes de arrancar el puente.');
      process.exit(1);
    }
  } else {
    fuente = abrirFuenteTcp(config, alRecibirLinea);
  }

  // Vaciar lo que haya quedado de la sesión anterior y latir desde el arranque
  enviador.despertar();
  void enviador.latir();
  const latido = setInterval(() => void enviador.latir(), config.intervaloLatidoSeg * 1000);

  function apagar(senal: string): void {
    registrar('info', 'Apagando el puente', { senal, pendientes: cola.cantidad });
    clearInterval(latido);
    fuente.cerrar();
    process.exit(0);
  }

  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('SIGTERM', () => apagar('SIGTERM'));
}

arrancar().catch((err) => {
  registrar('error', 'Falla al arrancar el puente', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
