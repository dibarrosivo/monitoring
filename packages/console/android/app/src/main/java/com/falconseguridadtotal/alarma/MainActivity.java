package com.falconseguridadtotal.alarma;

import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(PermisosPlugin.class);
        super.onCreate(savedInstanceState);

        /*
         * Desde Android 15, con targetSdk 35 o más, el sistema obliga a dibujar
         * de borde a borde: el contenido queda DEBAJO de la barra de estado y
         * de la de navegación. En SDK 36 ya no hay forma de optar por no
         * hacerlo, y el WebView de Android no informa env(safe-area-inset-*)
         * como iOS, así que no alcanza con CSS. Al subir a SDK 36 para Google
         * Play (1.6.0, 08-10-2026), la cabecera de la consola quedó tapada por
         * la barra de estado.
         *
         * La salida, la misma que usa TrueTracker: descontar las barras del
         * sistema y el notch como relleno del contenedor raíz. El WebView vuelve
         * a ocupar solo el área segura y todas las pantallas quedan bien.
         */
        final View contenido = getWindow().getDecorView().findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(contenido, (vista, insets) -> {
            final Insets seguro = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            vista.setPadding(seguro.left, seguro.top, seguro.right, seguro.bottom);
            // No se consumen: el teclado (Type.ime()) lo sigue manejando Capacitor
            return insets;
        });
        // Hasta que la consola avise su tema (PermisosPlugin.barras), el de por defecto: oscuro
        contenido.setBackgroundColor(0xFF0A1626);
    }

    /** Con la app a la vista, los avisos los dice la propia app (tiempo real); si no, AvisosService. */
    public static volatile boolean enPrimerPlano = false;

    @Override
    public void onResume() {
        super.onResume();
        enPrimerPlano = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        enPrimerPlano = false;
    }
}
