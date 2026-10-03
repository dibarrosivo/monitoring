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

### El canal directo NO se retira antes del testing: se congela en 1.5.7

**Cambio de plan del 03-10-2026.** Lo de retirarlo antes del testing venía
copiado de TrueTracker, que no tenía usuarios reales. FST sí los tiene, y con
la firma de abajo los dos canales pueden convivir: retirarlo antes dejaría sin
forma de instalar a los clientes nuevos mientras la ficha todavía no es pública.

La regla que hace falta, a cambio: **desde que exista la primera versión en
Play, no se publica ningún APK directo más.** Con la misma llave, un APK directo
de versionCode mayor se instala encima de la versión de Play, y los dos canales
se pisan. El enlace queda solo para instalar, no para actualizar.

Para mover a la tienda a los que siguen en el canal directo no hace falta un
APK nuevo: se edita `/opt/monitoring/app/version.json` con una versión mayor y
`url` apuntando a la ficha de Play, y el aviso de «versión nueva» que ya traen
los 1.5.7 los manda solos.

```json
{ "version": "1.6.0", "url": "https://play.google.com/store/apps/details?id=com.falconseguridadtotal.alarma",
  "notas": "La app ahora se actualiza desde Google Play." }
```

Cuando ya estén todos en Play, recién ahí se desmonta: `/opt/monitoring/app/`,
el bloque `handle_path /app/*` de Caddy, el volumen `./app` del compose, y
`ActualizacionApp.tsx` con la bandera `__CANAL_DIRECTO__`.

## La firma — la única decisión que casi no se deshace

Al subir el primer AAB, Play pregunta con qué llave firmar la app. La opción
que viene marcada es **que la genere Google: NO hay que aceptarla.** Hay que
elegir **«Exportar y subir una llave desde un almacén de claves Java»** y subir
la llave existente con la herramienta PEPK que da el propio Console.

Por qué, verificado el 03-10-2026:

| | |
|---|---|
| APK 1.5.7 que tienen instalado los clientes (versionCode 22) | firmado con `d71691da…2b39c2` |
| `~/dev/monitoring-secretos/falcon-alarma.keystore` | `d71691da…2b39c2` — **la misma** |
| Vigencia de la llave | hasta 2056 |
| Algoritmo | RSA 2048 |

Con esta llave la versión de Play se instala encima de la que ya tienen, sin
desinstalar y sin perder el registro de los avisos push. Con una llave nueva,
cada cliente tendría que borrar la app y volver a entrar.

**La prueba de que salió bien:** en *Integridad de la app → Firma de apps de
Play*, el certificado de la llave de firma tiene que ser

```
SHA-256  D7:16:91:DA:BE:2D:26:97:1A:89:D8:04:8B:D1:23:3F:E5:42:F4:DB:F9:4C:55:82:DF:3C:92:70:1D:2B:39:C2
```

Si dice otra cosa, no se publica nada: mientras no haya una versión publicada
todavía se puede corregir.

La misma llave sirve de llave de subida, que es como ya compila
`empaquetar-android.sh`. Google recomienda una de subida aparte; es opcional y
se agrega después sin drama, porque cambiar la de subida sí es un trámite
común. La que no se cambia es la de firma.

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

**Categoría**: Herramientas. (TrueTracker usa Empresa, pero los clientes de FST
son casas y comercios, no empresas con flota; Casa y hogar también calza.)
**Correo de contacto**: soporte@falconseguridadtotal.com
**Sitio web**: vacío por ahora. `monitoreo.` es la consola de operadores, no un
sitio para clientes; se completa cuando se publique la landing.
**Teléfono**: opcional y público.
**Política de privacidad**: https://monitoreo.falconseguridadtotal.com/privacidad/

## Formulario Data Safety (respuestas)

Revisado contra el manifiesto real del AAB el 03-10-2026: no pide ubicación,
cámara, micrófono, contactos del teléfono, SMS ni ID de publicidad.

| Pregunta | Respuesta |
|---|---|
| ¿Recolecta datos? | Sí |
| Información personal: nombre y correo | Sí — gestión de la cuenta y funciones de la app. Obligatorio. No se comparte. Las cuentas las crea la central, no hay registro público. |
| Identificadores del dispositivo | Sí — el identificador de notificaciones (token de Firebase) y la plataforma. Solo para entregar los avisos. Obligatorio. No se comparte. |
| Diagnóstico / rendimiento de la app | Sí — en qué etapa quedó el registro de avisos y qué versión corre, para averiguar por qué un aviso no llegó. No se comparte. |
| Información personal: número de teléfono | **Sí** — faltaba en la primera versión: el propietario carga desde la app los nombres y teléfonos de su lista de llamadas. Funciones de la app. No se comparte. |
| Actividad en la app: otras acciones | Sí — armar y desarmar desde la app queda registrado con el nombre de quien lo hizo. Funciones de la app. No se comparte. |
| Ubicación | **No** |
| Fotos, archivos, contactos, micrófono | **No** |
| Información financiera | **No** — la app muestra el estado de la cuota, pero no cobra ni pide datos de pago |
| ¿Datos cifrados en tránsito? | Sí (HTTPS/TLS) |
| ¿El usuario puede pedir la eliminación? | Sí — por `privacidad@falconseguridadtotal.com`. Enlace: https://monitoreo.falconseguridadtotal.com/privacidad/#eliminacion |
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
| Clasificación de contenido (IARC) | No es juego ni red social; No a todo (violencia, sexo, lenguaje, drogas, apuestas, compras, interacción entre usuarios, compartir ubicación) → apto para todo público |
| ID de publicidad | **No** — verificado: el manifiesto no trae `com.google.android.gms.permission.AD_ID` |

### Borrado de cuenta desde la app — decidido no agregarlo (03-10-2026)

Google exige que las apps donde el usuario **crea su propia cuenta** permitan
pedir su eliminación desde la app. En FST el cliente no se registra: la cuenta
la da la central como parte del servicio. El borrado se pide por correo, como
dice `/privacidad/`. Si un revisor lo objeta, se agrega en ese momento un
«Pedir la eliminación de mi cuenta» que solo registre el pedido. TrueTracker
está en la misma situación.

Ojo: que el cliente no se registre **no** significa que la app no maneje datos
personales (nombre, correo, teléfonos de la lista de llamadas, quién armó y
desarmó). Eso se declara en Data Safety igual.

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
| Usuario de la app | `pruebas@falconseguridadtotal.com` · la clave está en `/opt/monitoring/pruebas-credenciales.txt` (600, solo en el servidor) |
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

**La clave nunca va al chat ni a este archivo** (práctica de TrueTracker). La que
estuvo escrita acá se rotó el 03-10-2026.

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

TrueTracker todavía no empezó su prueba cerrada, así que la cuenta no tiene
acceso a producción para compartir. Lo que más tiempo ahorra es **correr las dos
pruebas cerradas en paralelo con los mismos testers**: los dos relojes de 14 días
corren a la vez, y cubre las dos lecturas de la regla (por cuenta o por app).
Ese día hay que encender la cuenta de pruebas.

Cada subida exige un versionCode mayor que **cualquiera ya subido**, aunque esa
versión no se haya publicado (TrueTracker tuvo que pasar a versionCode 2 por
eso). FST arranca en 23.

## Estado al 03-10-2026

| | |
|---|---|
| Cuenta de desarrollador | la misma de TrueTracker |
| Páginas legales | en producción, 200 |
| Correo | `privacidad@` y `soporte@` reciben por reenvío de ImprovMX (MX en GoDaddy, sin mudar el DNS). Falta confirmar con un correo de prueba de punta a punta |
| AAB | `fst-alarma-1.6.0.aab`, versionCode 23, recompilado el 03-10 con el código al día; sin actualizador; firmado con la llave correcta |
| Gráficos | regenerados el 03-10 con el logo alineado |
| Cuenta de pruebas | sembrada y **apagada**; se enciende el día de la prueba cerrada |
| Firma | **decisión al subir el primer AAB: la llave existente** |
| Canal directo | vivo; se congela en 1.5.7 desde la primera versión en Play |
| Borrado de cuenta en la app | decidido no agregarlo; se pide por correo |

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
