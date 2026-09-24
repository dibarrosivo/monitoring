package com.falconseguridadtotal.alarma;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lo que Android no deja hacer solo pero sí deja pedir: correr en segundo
 * plano sin ahorro de batería, y el "inicio automático" de los fabricantes
 * que matan apps (Xiaomi, Huawei, Oppo, Vivo, Samsung). Este plugin dice en
 * qué estado está cada cosa y abre la pantalla exacta para activarla.
 */
@CapacitorPlugin(name = "Permisos")
public class PermisosPlugin extends Plugin {

    private static final String[] FABRICANTES_QUE_MATAN = { "xiaomi", "redmi", "poco", "huawei", "honor", "oppo", "realme", "oneplus", "vivo", "iqoo", "samsung" };

    @PluginMethod
    public void estado(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        String fab = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase();
        r.put("fabricante", Build.MANUFACTURER);
        r.put("modelo", Build.MODEL);
        boolean mata = false;
        for (String f : FABRICANTES_QUE_MATAN) if (fab.contains(f)) mata = true;
        r.put("necesitaInicioAutomatico", mata);
        r.put("notificaciones", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        boolean bateria = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            bateria = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        r.put("bateriaSinRestriccion", bateria);
        call.resolve(r);
    }

    /** Diálogo del sistema: "¿Permitir que la app se ejecute en segundo plano?" */
    @PluginMethod
    public void pedirBateria(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) {
            abrirAjustesApp(call);
        }
    }

    /** La pantalla de inicio automático del fabricante; si no existe, los ajustes de la app. */
    @PluginMethod
    public void abrirInicioAutomatico(PluginCall call) {
        String[][] candidatos = {
            { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
            { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
            { "com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity" },
            { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
            { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
            { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" },
            { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
            { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager" },
            { "com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity" },
            { "com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity" },
            { "com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity" },
        };
        for (String[] c : candidatos) {
            try {
                Intent i = new Intent();
                i.setClassName(c[0], c[1]);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (getContext().getPackageManager().resolveActivity(i, 0) != null) {
                    getActivity().startActivity(i);
                    JSObject r = new JSObject();
                    r.put("abierto", c[0]);
                    call.resolve(r);
                    return;
                }
            } catch (Exception ignored) {}
        }
        abrirAjustesApp(call);
    }

    @PluginMethod
    public void abrirAjustesApp(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            JSObject r = new JSObject();
            r.put("abierto", "ajustes");
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No se pudo abrir los ajustes");
        }
    }
}
