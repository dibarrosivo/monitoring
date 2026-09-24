# Monitoring — Central de monitoreo de alarmas

Software de central de monitoreo: recibe señales de alarma de distintos transmisores, las normaliza y las convierte en una cola de trabajo para operadores, con gestión de clientes, sitios, paneles y zonas.

## Hardware soportado

| Origen | Vía | Estado |
| --- | --- | --- |
| Paneles Hikvision (AX Pro) | SIA DC-09 (ADM-CID) por TCP/UDP directo al servidor | ✅ Fase 1 |
| Tarjetas transmisoras EBM | Contact ID sobre IP (mismo listener DC-09) | ✅ Fase 1 (verificar framing real) |
| Receptor PIMA (RS-232 o TCP) | Puente serie→servidor en la PC de la central (`packages/pima-bridge`) | ✅ Listo, a la espera del receptor real |

> Los paneles Hikvision deben configurarse en formato **ADM-CID**. El cifrado AES de DC-09 está implementado: si el panel cifra, se carga la clave en `DC09_CLAVE_AES` (hexadecimal de 32, 48 o 64 caracteres) y el receptor descifra la trama y responde el ACK también cifrado. Sin clave, las tramas cifradas se rechazan con NAK y quedan registradas en el diario crudo. La marca de tiempo del panel se guarda como referencia; la hora canónica de los eventos es la de recepción en el servidor.
>
> El descifrado está probado de punta a punta contra el simulador (`npm run simulador -- robo --clave <hex>`), pero **todavía no contra un panel real**: si un Hikvision usara otra convención de relleno o de vector inicial, la trama queda íntegra en `senal` y el ajuste es de minutos.

## Arquitectura

```
packages/
  shared/      Tipos canónicos + tabla Contact ID y clasificación
  protocols/   Parsers puros: SIA DC-09 (CRC, ACK/NAK), Contact ID, Sur-Gard
  db/          Esquema Drizzle + migraciones (PostgreSQL)
  engine/      Diario de señales, eventos, apertura de alarmas, vigilante de paneles silenciosos
  receiver/    Daemon: listeners TCP/UDP DC-09 → engine
  api/         Fastify: auth JWT, CRUD, cola de alarmas, WebSocket en tiempo real (todo bajo /api)
  console/     Consola de operador: React + Vite + Tailwind, tema oscuro, cola en vivo con sonido
  pima-bridge/ Puente para la PC de la central: lee el receptor y reenvía las tramas crudas
tools/
  simulator/   Envía tramas DC-09 reales para probar sin hardware
```

### Una sola fuente para lo que tiene que coincidir

Todo lo que el servidor y la consola/app tienen que entender igual vive en `packages/shared` y se
importa desde `@monitoring/shared` en los dos lados (la consola lo consume como dependencia del
monorepo, sin alias). No se copia: una copia se olvida al cambiar la original.

| Qué | Dónde |
| --- | --- |
| Categorías, tipos de señal, nombre y orden de los tipos | `shared/src/tipos.ts`, `shared/src/tiposSenal.ts` |
| Motivos de cierre, desenlaces, resultados de llamada | `shared/src/cierres.ts` |
| Frases de los avisos (push con la app cerrada y WebSocket con la app abierta) | `shared/src/avisos.ts` |
| Preferencias de avisos, franja de silencio, voz | `shared/src/preferencias.ts` |
| Huso horario por defecto, límite de silencio general, canales push, sonido | `shared/src/central.ts` |

Reglas:
- Un valor que el servidor ajusta por variable de entorno (`ZONA_HORARIA_CENTRAL`, `SILENCIO_GENERAL_MIN`)
  tiene su **valor por defecto** en `shared/src/central.ts`; el paquete que lee la variable hace
  `process.env.X ?? X_POR_DEFECTO`. La consola usa el valor por defecto directamente.
- `shared` no importa nada de Node (`fs`, `crypto`, `process`): tiene que correr en el navegador.
- Los tipos que la consola comparte con el servidor se reexportan desde `console/src/tipos.ts`, así
  las pantallas siguen importando de un solo lugar.
- Las clases repetidas de campos y botones de la consola están en `console/src/estilos.ts`
  (`CAMPO`, `BOTON`, `BOTON_MINI`, `BOTON_MINI_ROJO` y las variantes `_APP` para la app del cliente).
- Java no puede importar `shared`: los ids de canal en `AvisosService.java` son la única copia
  permitida y llevan un comentario que apunta a `central.ts`.

Reglas de oro del receptor:
1. Toda trama cruda se persiste en `senal` **antes** de responder ACK (diario legal/auditoría).
2. Si la persistencia falla, se responde NAK y el panel reintenta.
3. El silencio también alarma: un panel supervisado sin señales por 1.5× su intervalo de prueba abre una alarma de sistema.
4. Una cuenta desconocida genera alarma para el operador (alguien transmite y nadie lo mira).

Retención del diario crudo: `senal` crece sin parar (los latidos solos son miles por día). Con
`RETENCION_SENALES_DIAS` el receptor depura una vez por día las tramas más viejas que ese plazo, y
`npm run db:depurar -- 365` hace lo mismo a mano (pensado para cron en el VPS). Los eventos y las
alarmas **nunca** se depuran: al borrar una señal, su evento conserva todo lo decodificado y solo
pierde el enlace a la trama.

Un equipo puede declarar una **cuenta secundaria**: el segundo número con el que reporta cuando usa
otra vía de comunicación (línea telefónica frente a IP/GPRS). Sin ella esas señales entrarían como
cuenta desconocida. Ninguna cuenta —principal o secundaria— puede repetirse en dos equipos: la API
responde 409, porque una señal repetida no tendría dueño único.

Cada sitio puede fijar su **zona horaria**; vacío significa la del servidor. La supervisión de
horarios evalúa cada sitio con su hora local, así un cliente en otra franja no dispara falsos
avisos de apertura tarde.

Los planes y las cuotas están en **dólares**; a bolívares se convierte al consultar, con la tasa
oficial. La API lee la portada del BCV cada `TASA_BCV_CADA_HORAS` (12 por defecto) y guarda una fila
por fecha de valor en `tasa_cambio`; una lectura con un salto mayor al 25 % no se guarda y queda en
el log. `GET /api/tasa` devuelve la vigente (cualquier sesión) y `POST /api/tasa` la carga a mano
(administrador) si el BCV no responde. Nunca se guarda un monto en bolívares.

**Cobros** (control interno, no facturación fiscal): cada dispositivo tiene un plan (precio en
dólares y frecuencia) o un monto propio, y una fecha de inicio del próximo período. La API genera la
cuota cuando llega esa fecha (corrida al arrancar y cada `COBROS_CADA_HORAS`, 6 por defecto), la
cuota vence `COBROS_DIAS_PARA_PAGAR` días después (5) y se le avisa al cliente por push al crearse y
al vencer. Los pagos se registran por cliente, en dólares o en bolívares con la tasa del día, y se
aplican a las cuotas más viejas primero; lo que sobra queda a favor y cubre la siguiente. Un cliente o un dispositivo marcado **exonerado** no genera cuotas (el monitoreo sigue igual). La mora
solo se marca y se avisa: **nunca corta el monitoreo**. Vista "Cobros" en la consola (admin y
supervisor), sección "Mi plan y mis pagos" en la app.

Marca, modelo e instalador se completan con **sugerencias de lo ya cargado**. El catálogo se
alimenta solo: al guardar un equipo con un valor nuevo, queda disponible para el siguiente. Evita
que convivan "Bosch", "BOSCH" y "bosh" sin obligar a mantener listas a mano.

Supervisión de horarios (por panel, opcional): con un horario cargado, el sistema abre alarmas de
sistema ante **apertura tarde** (`HOR-AT`), **falta de cierre** (`HOR-SC`) y **apertura fuera de
horario** (`HOR-AF`, prioridad alta: alguien entró con código válido cuando el sitio debía estar
cerrado). Sin horario cargado no se supervisa.

## Desarrollo

```bash
npm install
docker compose up -d          # PostgreSQL local
npm run db:migrar             # aplica migraciones
npm run db:seed               # admin@monitoring.local / admin123 + cliente demo (cuenta 1234)

npm run receiver              # daemon receptor (DC-09 en :9999)
npm run api                   # API en :3000 (rutas bajo /api)
npm run console               # consola de operador (Vite, proxy /api → :3000)

# En otra terminal: disparar señales de prueba
npm run simulador -- escenario
npm run simulador -- robo --cuenta 1234 --zona 015
npm run simulador -- desconocida

npm test                      # pruebas unitarias (parsers, cifrado, motor, clasificación)
npm run test:integracion      # pruebas de la API contra PostgreSQL (base monitoring_test aparte)
npm run test:todo             # unitarias + integración
npm run typecheck
```

## Puente PIMA (la PC de la central)

`packages/pima-bridge` es un programa aparte que corre en la máquina conectada al receptor. Lee las
tramas del **puerto serie** (o de una **salida TCP**), las guarda en disco, le responde **ACK (0x06)**
al receptor y las reenvía al servidor. **No interpreta nada**: todo el parseo Sur-Gard vive en el
servidor, así un formato inesperado se corrige sin volver a pisar esa máquina.

Garantías, probadas de punta a punta contra un receptor simulado:

1. **Primero disco, después ACK.** La trama se escribe en la cola antes de confirmarle al receptor,
   así un corte entre medio no la pierde.
2. **Servidor caído no pierde señales.** Se acumulan en `cola-pendiente.jsonl` con reintentos de
   espera creciente y se entregan solas al volver el servidor. El receptor sigue recibiendo su ACK.
3. **El silencio del puente alarma.** Late cada minuto; si deja de reportar, la central abre una
   alarma `BRIDGE` de prioridad 2 (queda ciega a todo un receptor, es de las peores fallas posibles).

### Ejecutable para Windows (sin instalar nada en la PC de la central)

```bash
npm run puente:exe        # genera packages/pima-bridge/dist/win/
```

Usa el empaquetador oficial de Node 22 (SEA): junta el código con esbuild, arma el blob y lo inyecta
en el `node.exe` oficial que baja de nodejs.org. El `.exe` se construye desde Linux sin necesidad de
una máquina Windows.

Queda una carpeta lista para copiar tal cual (~82 MB):

```
dist/win/
  puente.exe        el programa, con Node adentro
  node_modules/     serialport y su binario nativo (win32-x64)
  .env.ejemplo      configuración a completar
  LEEME.txt         instrucciones para quien lo instale
```

En la PC de la central: copiar la carpeta, renombrar `.env.ejemplo` a `.env`, completar
`BRIDGE_SERVIDOR`, `BRIDGE_TOKEN` y `BRIDGE_PUERTO_SERIE` (COM1, COM3…), y doble clic en
`puente.exe`. **No hace falta instalar Node.**

Para averiguar el puerto: `puente.exe --puertos` los lista con su descripción (el receptor suele
estar en el adaptador USB-serie). Si el puerto configurado no abre, el programa muestra esa misma
lista al arrancar en vez de dejar al técnico adivinando. Para que arranque solo con Windows:
`nssm install PuenteMonitoreo C:\PuenteMonitoreo\puente.exe`.

Dos detalles del empaquetado:

- El módulo del puerto serie es código nativo y no puede ir dentro del ejecutable: viaja en
  `node_modules` al lado y el puente lo carga desde ahí al arrancar (`createRequire(process.execPath)`).
- Inyectar el blob invalida la firma Authenticode del `node.exe` original, así que Windows puede
  mostrar el aviso de SmartScreen la primera vez ("Más información → Ejecutar de todas formas"). Se
  evita firmando el ejecutable con un certificado propio (`signtool`).

El servidor exige `BRIDGE_TOKEN` (el mismo valor en su `.env` y en el del puente).

### Convivir con el sistema de monitoreo actual

**Un puerto COM lo abre un solo proceso a la vez**: es una restricción del sistema operativo, no del
programa. El puente no puede leer el mismo puerto que ya está usando el software viejo. Para recibir
en los dos sistemas a la vez —lo recomendable durante la migración, para comparar antes de cambiar—
hay tres caminos, de mejor a peor:

1. **Segunda salida del receptor.** Muchos receptores traen dos puertos de automatización. Si el PIMA
   tiene uno libre, los dos sistemas quedan independientes y no hace falta nada más.
2. **Duplicar el puerto por software** con [com0com + hub4com](https://sourceforge.net/projects/com0com/)
   (gratis): `hub4com` lee el puerto real y copia el flujo a dos puertos virtuales; el software viejo
   lee uno y el puente el otro.
3. **Cable derivador RS-232**, con la línea de transmisión conectada a un solo equipo.

En los casos 2 y 3 el ACK lo tiene que mandar **un solo** programa. Se deja que lo siga mandando el
sistema actual y el puente va en **modo pasivo**:

```
BRIDGE_ACK=no
```

Así escucha y reenvía sin escribir una sola vez en el puerto, sin interferir con el sistema en
producción. Verificado: con `BRIDGE_ACK=no` el puente recibe y entrega las tramas sin emitir ningún
ACK hacia el receptor.

Prueba sin hardware, con un receptor simulado:

```bash
npm run simulador:pima -- --evento robo --cuenta 7002   # receptor falso en TCP :10001
npm run puente                                          # con BRIDGE_FUENTE=tcp en el .env
```

## Flujo de trabajo

- Ramas: `dev` (trabajo diario) y `main` (**push a `main` = despliegue a producción**, siempre con confirmación previa).
- CI en GitHub Actions: typecheck + pruebas como compuerta obligatoria.
- Configuración de producción: `keys.json` en el VPS → genera `.env` en cada despliegue (mismo esquema que FleetView).
- El puerto DC-09 del receptor se expone directo en el VPS (los paneles hablan TCP/UDP crudo, no pasan por Cloudflare/Caddy); la consola y la API sí van detrás de Caddy + Cloudflare.
