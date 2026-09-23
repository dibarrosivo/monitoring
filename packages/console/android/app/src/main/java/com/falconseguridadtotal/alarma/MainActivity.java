package com.falconseguridadtotal.alarma;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
