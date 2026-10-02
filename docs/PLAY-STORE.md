# FST Alarma en Google Play — kit de publicación

Todo lo que se puede preparar sin la cuenta de Play está hecho. Lo que falta son
decisiones del dueño y trámites en el navegador, listados al final.

Este documento sigue el mismo camino que `docs/PLAY-STORE.md` de TrueTracker, que
es el que se está recorriendo ahora mismo con esa app.

## Requisitos técnicos

| Pieza | Estado |
|---|---|
| `targetSdk` 36 (lo que Play exige desde el 31-08-2026) | ✔ subido el 01-10-2026 desde el 34; AGP 8.13.0 y Gradle 8.14.3 |
| AAB firmado | ✔ `bash scripts/empaquetar-android.sh` |
| Clave de firma | ✔ `~/dev/monitoring-secretos/firma.properties` (fuera del repositorio) |
| Sin actualizador por fuera de la tienda | ✔ bandera `__CANAL_DIRECTO__`: el build de Play no lo lleva |
| Política de privacidad | ✔ `/privacidad/` — falta desplegarla |
| Términos | ✔ `/terminos/` — falta desplegarla |
| Ícono, gráfico destacado y capturas | ✔ `packages/console/assets/play/` |
| Permisos acotados | ✔ internet, notificaciones, servicio breve en primer plano y excepción de ahorro de batería. Sin ubicación, cámara, micrófono ni contactos |
| Botón atrás de Android | ✔ `src/cliente/atras.ts` |

Recordatorio: cada subida exige un `versionCode` mayor. Hoy va en **23 / "1.6.0"**
(`packages/console/android/app/build.gradle` y `packages/console/package.json`,
que tienen que coincidir).

## Los dos canales de la app

La política de Google Play (Device and Network Abuse) prohíbe que una app
distribuida por la tienda se actualice bajando un APK por fuera. FST Alarma se
viene distribuyendo justamente así, por el enlace `/app/` del servidor de la
central, con un aviso de versión nueva dentro de la app.

Desde el 01-10-2026 los dos destinos se compilan por separado:

```bash
bash scripts/empaquetar-android.sh           # los dos
bash scripts/empaquetar-android.sh tienda    # solo el AAB de Play
bash scripts/empaquetar-android.sh directo   # solo el APK de instalación a mano
```

El build de la tienda define `__CANAL_DIRECTO__` en `false` y el componente del
aviso de versión **se cae entero del paquete** — está verificado: la cadena
`version.json` no aparece en el JavaScript compilado. Así no se puede subir por
descuido una app que incumpla.

### Retirar el canal directo — ANTES de empezar el testing con Google

Mientras el enlace siga vivo existe un canal paralelo de actualización. Hay que
desmontarlo cuando se empiece el testing, en este orden:

1. Publicar un último APK directo cuyo aviso diga que a partir de ahí la app se
   actualiza desde Google Play, con el enlace de la tienda. Es el puente para
   los que ya la tienen instalada.
2. Borrar `/opt/monitoring/app/` del VPS (el APK, `version.json` y la página).
3. Quitar el bloque `handle_path /app/*` de `infra/caddy/Caddyfile`.
4. Quitar el volumen `./app:/srv/app:ro` de `docker-compose.produccion.yml`.
5. Borrar `packages/console/src/cliente/ActualizacionApp.tsx`, su uso en
   `PantallaCliente.tsx`, la bandera `__CANAL_DIRECTO__` y el script
   `build:directo`.

Los pasos 1 y 2 se pueden hacer el mismo día; del 3 al 5 conviene esperar a que
la app esté publicada y la gente haya migrado.

## Textos de la ficha (copiar y pegar)

**Título** (27 de 30):
```
FST Alarma — Monitoreo 24 h
```

**Descripción corta** (69 de 80):
```
Su alarma en el teléfono: avisos al instante y el estado de su panel.
```

**Descripción larga**:
```
FST Alarma es la aplicación para los clientes de Falcón Seguridad Total, la
central de monitoreo de alarmas de Santa Ana de Coro.

Si su alarma está conectada a nuestra central, esta app le muestra lo que pasa
en su sitio y le avisa en el momento, sin tener que llamar a nadie.

AVISOS QUE SE OYEN
• La alarma de su sitio suena en el teléfono con sirena y se lee en voz alta,
  aunque el teléfono esté en silencio
• Pánico, incendio, coacción y emergencia médica entran como aviso prioritario
• Armado y desarmado, cortes de electricidad, batería baja y fallas de
  comunicación, cada cosa en su canal
• Usted elige qué avisos quiere recibir y cuáles no

SUS ALARMAS, DE UN VISTAZO
• Todos sus sitios en una pantalla: cuáles están armados y cuáles no
• Cuándo fue la última señal de cada panel y quién armó o desarmó
• El historial de lo que pasó, día por día

CONTROL DEL PANEL
• En los equipos que lo permiten, arme y desarme desde el teléfono
• Modo ausente y modo casa, con el estado de cada zona
• Toda orden queda registrada con su nombre y la hora

SU LISTA DE LLAMADAS
• A quién llamamos si entra una alarma, y en qué orden
• Agregue, cambie o quite contactos usted mismo; la central lo ve al instante
• Quién de ellos está autorizado a cancelar una alarma

BOTÓN DE PÁNICO
• Un botón que abre una emergencia en la central, con confirmación para que no
  se dispare sin querer

SU CUENTA
• El estado de su mensualidad y hasta cuándo está cubierto
• Las personas que usted autorizó a ver la alarma, y su acceso

La app no reemplaza al servicio de monitoreo: quien atiende una alarma, llama a
su lista de contactos y coordina con las autoridades es el personal de la
central, las 24 horas, según su contrato.

FST Alarma requiere una cuenta que crea la central. Si su alarma todavía no está
conectada a Falcón Seguridad Total, escríbanos y le decimos cómo hacerlo.

La app no usa la ubicación del teléfono, ni la cámara, ni el micrófono, ni sus
contactos.
```

**Categoría**: Empresa (Business).
**Etiquetas**: seguridad, alarma, monitoreo.
**Sitio web**: https://monitoreo.falconseguridadtotal.com
**Política de privacidad**: https://monitoreo.falconseguridadtotal.com/privacidad/
**Correo de contacto**: por definir (ver «Decisiones pendientes»).

## Formulario Data Safety (respuestas)

La app manda al servidor tres cosas y nada más, lo que hace este formulario
corto y fácil de defender.

| Pregunta | Respuesta |
|---|---|
| ¿Recolecta datos? | Sí |
| Información personal: nombre y correo | Sí — gestión de la cuenta y funciones de la app. Obligatorio. No se comparte. Las cuentas las crea la central, no hay registro público. |
| Identificadores del dispositivo | Sí — el identificador de notificaciones (token de Firebase) y la plataforma. Solo para entregar los avisos. Obligatorio. No se comparte. |
| Diagnóstico / rendimiento de la app | Sí — en qué etapa quedó el registro de avisos y qué versión corre, para averiguar por qué un aviso no llegó. No se comparte. |
| Ubicación | **No** |
| Fotos, archivos, contactos, micrófono | **No** |
| Información financiera | **No** — la app muestra el estado de la cuota, pero no cobra ni pide datos de pago |
| ¿Datos cifrados en tránsito? | Sí (HTTPS/TLS) |
| ¿El usuario puede pedir la eliminación? | Sí — por el correo de privacidad, igual que dice `/privacidad/` |
| ¿Se venden o comparten con terceros? | No |

Nota: las señales de los paneles de alarma las manda el equipo instalado en el
sitio, no el teléfono. En Data Safety solo se declara lo que recoge la APP del
dispositivo.

## Otras declaraciones del Play Console

| Formulario | Respuesta |
|---|---|
| Acceso a la app | **Requiere credenciales.** Hay que cargar un usuario y una clave de prueba (ver abajo), si no el revisor rechaza por «no se puede evaluar» |
| Servicios en primer plano | Sí, tipo `shortService`: leer el aviso de una alarma en voz alta durante los segundos que dura |
| Anuncios | No |
| Público objetivo | Adultos (18+) |
| Contenido generado por usuarios | No |
| App de noticias / finanzas / salud / gobierno | No |
| Clasificación de contenido (IARC) | App de negocios, sin contenido sensible → apto para todo público |

### Riesgo conocido: el permiso de ahorro de batería

La app declara `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`. Es lo que evita que
Android duerma la app y el aviso de una alarma llegue tarde o mudo, y para una
app de seguridad es un uso defendible. Está pedido como corresponde: nunca solo,
sino con un botón en la pantalla de «Configuración de avisos», con la razón a la
vista y pudiendo negarse.

Si en la revisión lo objetan, la salida es quitarlo: los mensajes de prioridad
alta de Firebase atraviesan el modo de ahorro igual, y lo que se pierde es
margen, no la función. No conviene adelantarse a quitarlo.

## Cuenta de prueba — SEMBRADA EN PRODUCCIÓN el 2026-10-02

| Qué | Dónde |
|---|---|
| Cliente | `Pruebas` (id 93), exonerado de cobro |
| Panel | `AL-5199` (id 93), sin supervisión, 4 zonas |
| Usuario de la app | `pruebas@falconseguridadtotal.com` · clave `pruebas2026` |
| Simulador | servicio `simulador-pruebas`, con `COMPOSE_PROFILES=ebs,pruebas` en el `.env` |

Verificado el día que se sembró: el usuario entra, ve su panel y sus eventos,
y **no** puede listar los clientes de la central ni ver la cola (403 en las
dos). Las diez señales entraron y no abrieron ni una alarma.

El `.env` anterior quedó guardado en `/opt/monitoring/.env.antes-pruebas`.

### APAGADA desde el 2026-10-02 — encenderla antes del testing

Se sembró y se verificó, y después se apagó a pedido del dueño: no tiene
sentido que una cuenta inventada esté viva ni que un simulador meta señales en
producción durante semanas. **No se borró nada**, solo se desactivó.

Para volver a encenderla, el día que arranque el testing con Google:

```bash
# 1. el cliente, el panel y el usuario
docker exec $(docker ps -qf name=postgres) psql -U monitoring -d monitoring -c "
  UPDATE usuario SET activo = true WHERE email = 'pruebas@falconseguridadtotal.com';
  UPDATE panel   SET activo = true WHERE numero_cuenta = '5199';
  UPDATE cliente SET activo = true WHERE nombre = 'Pruebas';"

# 2. el simulador (ojo de no pisar el perfil ebs, que es el receptor de Matarile)
sed -i 's/^COMPOSE_PROFILES=ebs$/COMPOSE_PROFILES=ebs,pruebas/' /opt/monitoring/.env
cd /opt/monitoring && docker compose -f docker-compose.produccion.yml up -d simulador-pruebas
```

Conviene además cebarla de nuevo para que la app no se vea vacía el primer día:

```bash
docker exec -e PRUEBAS_RITMO=rapido -e PRUEBAS_HOST=receptor -e PRUEBAS_CUENTA=5199 \
  monitoring-api-1 npx tsx tools/simulator/src/panelPruebas.ts
```

### Cómo se rehace o se borra

Hace falta **antes** de subir: sin credenciales el revisor de Google no puede
entrar y rechaza la app. Decidido el 01-10-2026, con señales simuladas.

### Sembrarla

```bash
# en el servidor, con el DATABASE_URL de producción
npm run pruebas:sembrar -- --clave <una clave>     # sin --clave, la genera
```

Crea el cliente **«Pruebas»** (exonerado de cobro), el sitio «Local de pruebas»,
el panel **AL-5199** con cuatro zonas y **sin supervisión**, y el usuario
`pruebas@falconseguridadtotal.com` como propietario. Es idempotente: volver a
correrlo no duplica nada, solo cambia la clave.

La clave se imprime una sola vez. Va en el formulario «Acceso a la app» del Play
Console y se le entrega a los testers.

### Darle historial

El panel no existe, así que las señales las manda un simulador: el mismo
protocolo SIA DC-09 que usaría un equipo real, con un día de trabajo creíble
(abre a las 7:40, cierra a las 18:50, prueba periódica cada 6 h, una anulación
de zona y un corte de luz con sus restauraciones).

**A propósito no manda ninguna alarma de robo**: una cuenta de pruebas
disparando alarmas le mete ruido a la cola de los operadores de verdad. Está
verificado que las diez señales entran y no abren ni una alarma.

Se enciende poniendo `pruebas` en `COMPOSE_PROFILES` del `.env` del servidor y
se apaga sacándola de ahí, sin desplegar nada:

```bash
# /opt/monitoring/.env
COMPOSE_PROFILES=pruebas
```

Para probarlo a mano, `PRUEBAS_RITMO=rapido npm run simulador:pruebas` manda el
día entero en un minuto.

### Borrarla al terminar

```bash
npm run pruebas:borrar                # muestra qué borraría, sin tocar nada
npm run pruebas:borrar -- --de-verdad # lo hace
```

El orden de borrado no está escrito a mano: el script lee del propio Postgres
qué tablas apuntan a cliente, sitio, panel y usuario, y borra por pasadas hasta
que no queda nada, todo en una transacción. Así sigue funcionando aunque el
esquema cambie entre hoy y el día en que se corra. Probado de punta a punta
contra una base local: sembrar, mandar señales y borrar no deja ni una fila.

## Escalera de publicación

1. **Pruebas internas** (instantáneo, lista de correos): subir el AAB y
   comprobar la instalación real en un teléfono.
2. **Pruebas cerradas**: con una cuenta personal nueva, Google exige **12
   testers que entren y usen la app durante 14 días seguidos**. Conviene tener
   15 o 16 por si alguno se cae. Este es el plazo largo de todo el proceso.
3. **Solicitar producción** → revisión (la primera vez tarda días) → publicar por
   etapas (10 % → 100 %).

## Decisiones tomadas el 01-10-2026

- **Cuenta de desarrollador: la misma de TrueTracker.** Los 12 testers × 14 días
  son un requisito de la CUENTA, no de cada app: si esa cuenta ya está
  cumpliendo el plazo, FST Alarma entra después sin volver a esperarlo. Más
  adelante se puede transferir la app a una cuenta de Falcón Seguridad Total,
  que es el mismo plan que ya tiene TrueTracker.
  **Antes de crear la app hay que confirmar en el Play Console si esa cuenta ya
  tiene acceso a producción o sigue dentro de los 14 días.**
- **Cliente «Pruebas» con señales simuladas**: hecho, ver la sección anterior.
- **Correos públicos**: reenvío gratis. Ojo con el detalle de abajo.

## Lo que falta, y es trámite

1. **Los buzones de correo.** `/privacidad/` y `/terminos/` dicen
   `privacidad@falconseguridadtotal.com` y `soporte@falconseguridadtotal.com`, y
   el Play Console exige además un correo de contacto visible en la ficha. Hoy
   **el dominio no tiene ningún registro MX**: no recibe correo.

   El DNS de `falconseguridadtotal.com` está en GoDaddy (`domaincontrol.com`),
   no en Cloudflare, así que el camino de TrueTracker (Cloudflare Email Routing)
   obligaría a mudar los nameservers, y de ese dominio todavía cuelga el sitio
   viejo de 365. Sale más barato y más seguro un reenviador que solo pida
   registros MX, como ImprovMX, que se agregan en GoDaddy sin mover nada:
   dos MX y un TXT de verificación. Es una tarea de navegador, no de código.

2. **Desplegar las páginas legales.** Están en el repositorio pero no en
   producción, y Play no acepta una URL que no responda. Entra en el próximo
   despliegue a `main`, que hay que pedir.

3. **Retirar el canal directo** antes de empezar el testing (ver más arriba).

## Cada versión nueva

```bash
# 1. subir versionCode y versionName en los dos archivos
#    packages/console/android/app/build.gradle
#    packages/console/package.json
# 2. empaquetar
bash scripts/empaquetar-android.sh tienda
# 3. subir fst-alarma-X.Y.Z.aab al Play Console con sus notas de versión
```

Las notas de versión van en español neutro, como el resto de la app.

## Recursos gráficos

Están en `packages/console/assets/play/` y se regeneran con:

```bash
cd packages/console && npx vite --port 5199 --strictPort   # en otra terminal
bash scripts/capturas-play.sh
```

| Archivo | Qué es |
|---|---|
| `play-icono-512.png` | Ícono de la ficha, 512×512 |
| `play-grafico-1024x500.png` | Gráfico destacado |
| `play-captura-1..4.png` | Capturas de teléfono, 1080×1920 (16:9 justo) |
| `crudas/` | Las capturas sin marco, por si hay que rearmarlas |

Salen de los harness de la consola, o sea **con datos inventados**: Café del
Faro, Andrés Molina, cuentas 51xx. En una ficha pública no puede aparecer ningún
cliente real.
