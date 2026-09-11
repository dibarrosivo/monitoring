# Duplicar el puerto serie de la central

Cómo hacer que el receptor PIMA entregue sus señales **a los dos sistemas a la
vez**: al que está en producción hoy (`shareport.exe`, que reporta a 365) y al
nuestro, sin interrumpir el servicio.

## El problema

Un puerto COM lo abre **un solo programa a la vez**. Es una restricción del
sistema operativo, no de los programas. Hoy `shareport.exe` tiene tomado COM1,
así que nuestro puente no puede leerlo.

La solución es interponer `hub4com`: abre el puerto real y copia el flujo hacia
dos puertos virtuales, uno para cada sistema.

```
receptor PIMA ─COM1─→ hub4com ─┬─→ COM10 ═ COM11 ─→ puente nuestro (solo lee)
                               └─→ COM12 ═ COM13 ─→ shareport (lee y responde ACK)
                     ←──────────────────────────────┘  el ACK vuelve por aquí
```

## Antes de empezar: dos datos que hay que averiguar

**1. La configuración serie actual.** `hub4com` tiene que abrir COM1 con los
mismos parámetros que usa `shareport` hoy: velocidad, bits de datos, paridad y
bits de parada. Si no coinciden, las tramas llegan como basura. El dato está en
la configuración de `shareport` o en el manual del receptor.

**2. Que el puerto de `shareport` sea configurable.** Después de este cambio
tendrá que leer COM13 en lugar de COM1. Si su puerto está fijo en el código y no
se puede cambiar, este camino no sirve y hay que ir por el cable derivador.

## Instalación

Descargar **com0com**, que incluye `hub4com`, desde su sitio oficial. En Windows
de 64 bits hace falta la versión **firmada** (`com0com-3.0.0.0-i386-and-x64-signed`),
porque el sistema rechaza controladores sin firmar.

Crear dos pares de puertos virtuales desde el "Setup Command Prompt" de com0com:

```
install PortName=COM10 PortName=COM11
install PortName=COM12 PortName=COM13
```

Cada par funciona como un cable: lo que se escribe en COM10 aparece en COM11.

## Arrancar el duplicador

Con `shareport` **detenido**, para que COM1 quede libre:

```
hub4com --baud=9600 --octs=off --route=0:1,2 --route=2:0 \
        \\.\COM1 \\.\COM10 \\.\COM12
```

Ajustar `--baud` al valor real averiguado antes.

Las dos rutas dicen todo lo importante:

- `--route=0:1,2` copia lo que entra por COM1 hacia los dos puertos virtuales.
- `--route=2:0` devuelve al receptor **solo** lo que escribe `shareport`.

No existe una ruta de vuelta desde el puerto de nuestro puente. Eso significa
que **el cableado mismo hace imposible que interfiramos**, sin depender de que
la configuración esté bien puesta. Aun así el puente va en modo pasivo
(`BRIDGE_ACK=no`), de manera que hay dos barreras independientes.

## Reconfigurar los dos programas

`shareport` pasa a leer **COM13**.

Nuestro puente lee **COM11**, con `BRIDGE_ACK=no` en su archivo `.env`.

## Verificar, en este orden

1. Arrancar `hub4com`.
2. Arrancar `shareport` y confirmar en 365 que **siguen llegando señales**. Si
   no llegan, detener todo y volver atrás: la prioridad es que el sistema en
   producción no se quede sin recibir.
3. Recién entonces arrancar `puente.exe` y mirar la consola: debería imprimir
   las mismas tramas que muestra `shareport`.
4. Confirmar en nuestra central que las señales aparecen identificadas con el
   nombre del cliente.

## Para que arranque solo con Windows

`hub4com` y el puente tienen que quedar como servicios, o se caen al cerrar
sesión. Con [NSSM](https://nssm.cc):

```
nssm install Hub4Com    C:\ruta\hub4com.exe  <argumentos>
nssm install PuenteMonitoreo C:\PuenteMonitoreo\puente.exe
```

El orden importa: `hub4com` tiene que levantar antes que los otros dos, porque
es quien crea el flujo que ambos leen.

## Si algo sale mal

Volver atrás es sencillo: detener `hub4com` y nuestro puente, y devolver
`shareport` a COM1. El sistema queda exactamente como estaba.
