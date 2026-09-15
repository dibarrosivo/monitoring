# EBS: cómo recibirlo y cómo dejar de depender del servidor de 365

Investigación hecha el 15 de septiembre de 2026. Estado: **todo resuelto en
nuestro lado, nada tocado en el lado de EBS todavía**. Este documento es el plan
para cuando se decida hacerlo.

## 1. Cómo llega EBS hoy

- Los transmisores EBS (familia **LX**, GPRS) hablan un protocolo propio,
  binario y cifrado, que solo entiende el receptor de EBS: **OSM.Server**.
- OSM.Server corre en el servidor Windows de la central (`C:\EBS\OSM`, servicio
  "Monitoring Receiver OSM.2007", versión 1.5.04.011 STD). Escucha a los
  transmisores en los puertos 5100, 5200 (LX), 5300, 5400, 6730 y 6831, y tiene
  el puerto de comandos 9000.
- OSM reparte cada evento a "analizadores" definidos en `config.xml`. Hoy hay
  tres, los tres a 365 en la misma máquina: `primary` (XML, 7000), `365XML`
  (XML, 6000) y `EBSCID` (Contact ID, 8000). Están en el grupo `ALL` con
  `ackMethod="one"`: un evento se da por entregado cuando **uno** confirma.
- **No hace falta llave de licencia**: el manual dice que hasta 5000 equipos no
  se requiere. La carpeta trae `hasp_windows.dll` pero no se usa.
- Desde el 4 de agosto de 2025 EBS distribuye OSM.Server (1.6.08.006) con una
  **licencia anual gratuita** que hay que activar; las versiones viejas sin
  licencia ya no reciben soporte. Descarga con cuenta en
  https://ebssmart.com/knowledge-zone/software. Soporte:
  support@ebssmart.com, +48 22 103 35 00.

## 2. Qué transmite por EBS

En los últimos 30 días, **una sola cuenta**: la 7037, con prefijo `EBS` en 365
(cliente 646, abonado 452: Unidad Educativa Colegio Matarile, Coro). Detrás del
transmisor hay un panel **DSC PC1832** con 7 zonas cargadas en 365 (1 a 5, 7 y
8). La ficha completa está en 365; no se copia acá porque son datos de un
cliente.

Ese mismo número 7037 es también el panel Hikvision de prueba de la central.
Por eso el sistema admite desde hoy **dos equipos con el mismo número si son
de tipo distinto**, y adjudica cada señal según la vía por la que entra
(`buscarPanelPorCuenta(cuenta, fuente)`). Lo que entre por el receptor EBS va
al equipo de tipo `ebm`; lo que entre por DC-09, al Hikvision.

## 3. Formato que entrega OSM (verificado en la base de 365)

Analizador con `format="CID"` = Sur-Gard MLR2 por TCP con calificador de letra:

```
5011 187037E13001004        cuenta 7037, nuevo evento E130, partición 01, zona 4
5011 187037R30100000        restauración de red eléctrica
1011           @            latido, cada 10 s (MLR2Heartbeat por defecto)
```

Cada trama termina en DC4 (0x14) y OSM espera **ACK (0x06)** por cada una; sin
ACK retransmite cada `retryTime` (15 s). En 365 se vieron hasta seis copias de
la misma trama pegadas en una línea por eso.

## 4. Nuestro lado: listo y en producción

- Escucha `packages/receiver/src/surgardTcp.ts`, variable `PUERTO_SURGARD_TCP`
  (10060), expuesta en el compose y abierta en el firewall del VPS. Confirma
  cada trama con ACK, separa las pegadas, guarda un latido cada 5 minutos.
- El analizador Sur-Gard (`packages/protocols/src/surgard.ts`) entiende la
  forma con letra (E/R/P), que también es la del Hik IP Receiver.
- Verificado el 15-sep: un latido enviado a `37.60.234.77:10060` recibe `0x06`.
- Fuente en el diario: `surgard-tcp`.

## 5. Paso A (reversible): que el OSM actual nos mande una copia

En `C:\EBS\OSM\config.xml`, dentro de `<Analysers>`:

```xml
<Analyser name="MONITOREO" proto="tcp" addr="37.60.234.77" port="10060"
          format="CID" CIDLineLength="1" authLevel="READ"/>
```

y dentro de `<Group name="ALL" ...>`:

```xml
<AnalyserRef name="MONITOREO"/>
```

Después, reiniciar el servicio "Monitoring Receiver OSM.2007" (corte de unos
segundos; los transmisores reintentan solos). Antes: copia de `config.xml`.
Los tres analizadores de 365 no se tocan. Vuelta atrás: restaurar la copia y
reiniciar.

Antes de activar el paso A hay que **dar de alta a Matarile** en nuestro
sistema (cliente, sitio, equipo 7037 tipo EBS, zonas), con los datos de 365.
Si no, sus señales entran como cuenta desconocida.

Detalle a decidir: con `ackMethod="one"`, si nuestro ACK llega antes que el de
365 el evento se da por entregado. OSM igual sigue reintentando a cada
analizador que no confirmó, pero si se quiere que 365 mande siempre, se marca
su analizador como `mandatory="true"` en el grupo.

## 6. Paso B (el objetivo): receptor EBS propio

Opciones, de mejor a peor:

1. **OSM.Server para Linux** en un contenedor del VPS. Existe: el receptor de
   rack que vende EBS corre Linux con este mismo programa, y los comentarios
   del `config.xml` traen rutas de Linux. Lo que no está claro es si lo
   entregan como software. Preguntar a EBS (borrador de correo abajo).
2. **OSM.Server para Windows bajo Wine** en el VPS. Resultado de la prueba:
   ver sección 8.
3. **OSM.Server para Windows en una VM nuestra.** Siempre funciona; sigue
   siendo Windows pero deja de ser el servidor de 365.

Costo de recursos: OSM usa 12 MB de memoria y CPU insignificante en el
servidor actual. Bajo Wine, 100 a 200 MB. El VPS tiene 7 GB libres.

### Apuntar los transmisores al receptor nuevo

Los LX no tienen servidor de respaldo configurable desde OSM: la ventana
"LX Settings" de OSM Tools tiene **Server address, Server port, DNS1, DNS2,
APN, usuario y clave del APN, número SMS**. Es decir, el cambio es un
**corte**: el transmisor deja de reportar al OSM viejo y pasa al nuevo. Se hace
desde OSM Tools (menú de comandos del equipo, "Send configuration") o por SMS
al transmisor, con el número autorizado. Si el transmisor de Matarile fuera
un LX20G-3C, además permite programar el panel DSC a distancia.

Orden sugerido para el corte:

1. OSM nuevo arriba en el VPS, con un analizador `MONITOREO` a `127.0.0.1:10060`
   y, mientras dure la transición, otro analizador CID apuntando al 365
   (`156.67.31.152:8000`) para que 365 siga recibiendo.
2. Abrir en el firewall del VPS el puerto de entrada de los LX (5200/tcp) solo
   para ese uso.
3. Desde OSM Tools del servidor viejo, cambiar en el transmisor `Server
   address` y `Server port` al VPS. Tarda lo que tarde el equipo en
   reconectar.
4. Verificar en `ecs.log` del OSM nuevo la conexión del LX y la entrega a los
   analizadores. Ahí el OSM del servidor de 365 queda sin uso.

Alternativa sin OSM: reemplazar el transmisor por un comunicador que hable
SIA DC-09 (por ejemplo DSC TL280 o TL2803G para el PC1832), apuntado a nuestro
puerto 9999. Un solo cliente, una visita técnica, y EBS desaparece.

## 7. Borrador de correo a EBS

> Asunto: OSM.Server 1.6 – versión para Linux y activación de licencia
>
> Estimados: operamos una central de monitoreo con OSM.Server 1.5.04.011 STD en
> Windows y transmisores LX. Queremos migrar el receptor a un servidor Linux.
> ¿Distribuyen OSM.Server 1.6 para Linux (x86_64), como el que corre en el
> receptor de rack? Si es así, ¿cómo lo obtenemos y cómo se activa la licencia
> anual gratuita? Si solo existe para Windows, ¿está soportado bajo Wine?
> Gracias.

## 8. Prueba de Wine: funciona

Hecha el 15 de septiembre de 2026 en un contenedor local, con una copia de
`C:\EBS\OSM` (sin logs ni búfer), imagen `scottyhardy/docker-wine:stable`,
prefijo de 32 bits. OSM.Server 1.5.04.011 **arranca completo bajo Wine**:

- `ecs.log`: "Monitoring Receiver OSM.Server v1.5.04.011", conversión iconv
  correcta, clave RSA generada, "CommandServer: Listen on 9000 port OK",
  "listening....", y a los 30 s todos los hilos de dispositivos (ag, at, cp,
  fp, lx, px, sd) y de analizadores (primary, 365XML, EBSCID) activos.
- Puertos en escucha dentro del contenedor: 5100, 5200 (LX), 5300, 5400, 6730,
  6831 y 9000. Exactamente los mismos que en el servidor Windows.
- Memoria del proceso: 29 MB. CPU insignificante.
- Único aviso: "Command server: Wrong port number", por
  `encryptedCommandListeningPort="0"` en el `config.xml`; es el mismo valor que
  en producción y no impide nada.

Receta que funcionó (correr como root y **saltar el punto de entrada** de la
imagen, que si no cambia de usuario y no puede escribir en la carpeta):

```bash
docker create --name osm --user root --entrypoint bash scottyhardy/docker-wine:stable \
  -c 'export WINEDEBUG=-all WINEPREFIX=/prefijo WINEARCH=win32; wineboot -i; cd /osm && wine srvD.exe'
docker cp osm/ osm:/osm          # copia de C:\EBS\OSM (ecs.exe, dlls, iconv/, config.xml, devices.xml)
docker start -a osm
```

Para producción faltaría: publicar 5200 (y los demás puertos de transmisores
que se usen) y 9000 solo desde donde corra OSM Tools; montar `config.xml`,
`devices.xml`, `logs/` y `*.buf` en un volumen; `restart: unless-stopped`; y
correr `srvD.exe` (modo consola) en vez del servicio `svc.exe`. Lo que **no**
se probó todavía, porque requiere un transmisor real: que un LX conecte y
entregue eventos por Wine de punta a punta. Es lo primero a verificar el día
del cambio, con el analizador `MONITOREO` apuntando a nuestro 10060.
