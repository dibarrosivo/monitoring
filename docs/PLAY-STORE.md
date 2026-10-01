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

## Cuenta de prueba (para el revisor de Google y para los testers)

Hace falta **antes** de subir, porque sin credenciales el revisor no puede entrar
y rechaza la app. Se propone replicar lo que se hizo en TrueTracker:

- Un cliente **«Pruebas»** en producción, con un panel y un par de zonas.
- Un usuario `pruebas@falconseguridadtotal.com` con contraseña fija, cargado en
  el formulario «Acceso a la app» del Play Console y entregado a los testers.
- Señales simuladas para que al abrir la app se vea actividad y no una pantalla
  vacía: armado y desarmado un par de veces al día, alguna avería y su
  restauración.
- **Es deuda con fecha de vencimiento**: al terminar el período de pruebas hay
  que borrar el cliente, su panel y sus señales.

No está hecho todavía: toca producción y hay que decidirlo.

## Escalera de publicación

1. **Pruebas internas** (instantáneo, lista de correos): subir el AAB y
   comprobar la instalación real en un teléfono.
2. **Pruebas cerradas**: con una cuenta personal nueva, Google exige **12
   testers que entren y usen la app durante 14 días seguidos**. Conviene tener
   15 o 16 por si alguno se cae. Este es el plazo largo de todo el proceso.
3. **Solicitar producción** → revisión (la primera vez tarda días) → publicar por
   etapas (10 % → 100 %).

## Decisiones pendientes (no las puedo tomar yo)

1. **¿Qué cuenta de desarrollador?** Es lo que más cambia el calendario:
   - *La misma de TrueTracker*: los 12 testers × 14 días son un requisito de la
     CUENTA, no de cada app. Si TrueTracker ya está cumpliendo ese plazo, FST
     Alarma entra después sin volver a esperarlo, y se ahorran los US$ 25. En
     contra: en la ficha aparece el nombre de desarrollador de esa cuenta.
   - *Una cuenta propia de Falcón Seguridad Total*: US$ 25 más y su propio plazo
     de 14 días, pero la app queda a nombre de la empresa desde el primer día,
     que es lo que van a ver sus clientes.
2. **Los correos públicos.** `/privacidad/` y `/terminos/` dicen hoy
   `privacidad@falconseguridadtotal.com` y `soporte@falconseguridadtotal.com`, y
   el Play Console exige un correo de contacto visible. Esos buzones tienen que
   existir y alguien tiene que leerlos. En TrueTracker se resolvió con reenvío
   gratis (Cloudflare Email Routing).
3. **Desplegar las páginas legales.** Están en el repositorio pero no en
   producción: Play no acepta una URL que no responda. Entra en el próximo
   despliegue a `main`.
4. **El cliente «Pruebas»** de la sección anterior.

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
