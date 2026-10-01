#!/usr/bin/env python3
"""
Arma los recursos gráficos de la ficha de Google Play a partir del icono de la
app y de las capturas crudas del harness.

No se ejecuta solo: lo llama scripts/capturas-play.sh, que es quien saca las
capturas con el navegador. Las capturas salen del harness, o sea con datos
inventados: en la ficha de una tienda pública no puede aparecer ningún cliente
real (nombres, cuentas, direcciones ni teléfonos).

Medidas que exige Play: icono 512x512, gráfico destacado 1024x500 y capturas de
teléfono con los dos lados entre 320 y 3840 px y el lado largo no más del doble
del corto. Se usa 1080x1920, que es 16:9 justo y no deja lugar a dudas.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

VERDE = (31, 61, 43)        # el fondo del icono de la app
VERDE_CLARO = (34, 133, 90)  # el acento de los avisos
BLANCO = (255, 255, 255)
TENUE = (168, 196, 181)

RAIZ = Path(__file__).resolve().parent.parent
ICONO = RAIZ / 'packages/console/resources/icon.png'
DESTINO = RAIZ / 'packages/console/assets/play'
CRUDAS = DESTINO / 'crudas'

NEGRITA = '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf'
NORMAL = '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'

# Cada captura con el texto que la explica en la tienda
PANTALLAS = [
    ('inicio.png', 'Sus alarmas, en una pantalla', 'Si están armadas y cuándo reportaron por última vez'),
    ('avisos.png', 'Le avisa cuando pasa algo', 'Con sirena y en voz alta, aunque el teléfono esté en silencio'),
    ('panel.png', 'Arme y desarme desde el teléfono', 'En los paneles que lo permiten, y queda registrado'),
    ('cuenta.png', 'Su lista de llamadas y su cuenta', 'A quién llamamos, en qué orden, y cómo va su mensualidad'),
]


def fuente(ruta, tam):
    return ImageFont.truetype(ruta, tam)


def centrar(d, y, texto, f, color, ancho):
    caja = d.textbbox((0, 0), texto, font=f)
    d.text(((ancho - (caja[2] - caja[0])) / 2, y), texto, font=f, fill=color)
    return caja[3] - caja[1]


def esquinas(img, radio):
    """Redondea las esquinas de la captura, para que parezca una pantalla."""
    mascara = Image.new('L', img.size, 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radio, fill=255)
    salida = img.convert('RGBA')
    salida.putalpha(mascara)
    return salida


def icono_tienda():
    img = Image.open(ICONO).convert('RGB').resize((512, 512), Image.LANCZOS)
    img.save(DESTINO / 'play-icono-512.png')
    print('✔ play-icono-512.png')


def grafico_destacado():
    """1024x500. Sobrio: la marca, una frase y nada de capturas apretadas."""
    img = Image.new('RGB', (1024, 500), VERDE)
    d = ImageDraw.Draw(img)
    # Una banda de acento abajo, para que no sea un rectángulo plano
    d.rectangle([0, 494, 1024, 500], fill=VERDE_CLARO)

    # Google recorta este gráfico según dónde lo muestre, así que el conjunto
    # va centrado y no pegado a un borde
    f_tit, f_sub = fuente(NEGRITA, 62), fuente(NORMAL, 31)
    lineas = [('FST Alarma', f_tit), ('Monitoreo de alarmas 24 horas', f_sub), ('Falcón Seguridad Total · Coro', f_sub)]
    texto = max(d.textbbox((0, 0), t, font=f)[2] for t, f in lineas)
    marca_px, hueco = 150, 40
    x = (1024 - (marca_px + hueco + texto)) // 2

    marca = Image.open(ICONO).convert('RGBA').resize((marca_px, marca_px), Image.LANCZOS)
    img.paste(marca, (x, 175), marca)

    xt = x + marca_px + hueco
    d.text((xt, 150), 'FST Alarma', font=f_tit, fill=BLANCO)
    d.text((xt + 2, 232), 'Monitoreo de alarmas 24 horas', font=f_sub, fill=TENUE)
    d.text((xt + 2, 276), 'Falcón Seguridad Total · Coro', font=f_sub, fill=TENUE)
    img.save(DESTINO / 'play-grafico-1024x500.png')
    print('✔ play-grafico-1024x500.png')


def pantalla(archivo, titulo, bajada, n):
    cruda = CRUDAS / archivo
    if not cruda.exists():
        print(f'… falta {cruda.name}: corra scripts/capturas-play.sh')
        return
    lienzo = Image.new('RGB', (1080, 1920), VERDE)
    d = ImageDraw.Draw(lienzo)

    centrar(d, 96, titulo, fuente(NEGRITA, 52), BLANCO, 1080)
    centrar(d, 176, bajada, fuente(NORMAL, 30), TENUE, 1080)

    captura = Image.open(cruda).convert('RGB')
    ancho = 860
    alto = round(captura.size[1] * ancho / captura.size[0])
    captura = esquinas(captura.resize((ancho, alto), Image.LANCZOS), 28)

    x, y = (1080 - ancho) // 2, 300
    d.rounded_rectangle([x - 3, y - 3, x + ancho + 2, y + alto + 2], 31, outline=(70, 110, 88), width=3)
    lienzo.paste(captura, (x, y), captura)

    salida = DESTINO / f'play-captura-{n}.png'
    lienzo.save(salida)
    print(f'✔ {salida.name}')


def main():
    DESTINO.mkdir(parents=True, exist_ok=True)
    icono_tienda()
    grafico_destacado()
    for i, (archivo, titulo, bajada) in enumerate(PANTALLAS, start=1):
        pantalla(archivo, titulo, bajada, i)
    return 0


if __name__ == '__main__':
    sys.exit(main())
