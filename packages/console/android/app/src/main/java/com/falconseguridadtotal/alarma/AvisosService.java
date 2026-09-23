package com.falconseguridadtotal.alarma;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.RemoteMessage;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Avisos con la app cerrada. El servidor manda mensajes solo de datos
 * (titulo, cuerpo, habla, canal) y este servicio, que vive aunque la app no
 * esté abierta, arma la notificación y la dice en voz alta con el motor de
 * voz del teléfono: "Sistema armado por Ana Pérez", "Aviso: falla de red
 * eléctrica". Con la app a la vista no hace nada: ya lo dice la app.
 */
public class AvisosService extends com.capacitorjs.plugins.pushnotifications.MessagingService {
    private static final String TAG = "AvisosService";
    private static final String CANAL_ALARMAS = "alarmas-v2";
    private static final String CANAL_AVISOS = "avisos-v2";
    private static TextToSpeech voz;
    private static boolean vozLista = false;
    private static final List<String[]> pendientes = new ArrayList<>();

    @Override
    public void onMessageReceived(@NonNull RemoteMessage mensaje) {
        super.onMessageReceived(mensaje); // la app abierta lo recibe por el plugin como siempre
        Map<String, String> d = mensaje.getData();
        String titulo = d.get("titulo");
        String cuerpo = d.get("cuerpo");
        if (titulo == null || cuerpo == null) return;
        if (MainActivity.enPrimerPlano) return;
        boolean alarma = "alarmas".equals(d.get("canal"));
        String habla = d.get("habla");
        mostrar(titulo, cuerpo, alarma, d.get("eventoId"));
        if (habla != null && !habla.isEmpty()) hablar(getApplicationContext(), habla, alarma);
    }

    private void mostrar(String titulo, String cuerpo, boolean alarma, String eventoId) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        String canal = alarma ? CANAL_ALARMAS : CANAL_AVISOS;
        asegurarCanales(this, nm);
        Intent abrir = new Intent(this, MainActivity.class);
        abrir.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        abrir.putExtra("abrir", "avisos");
        int id = eventoId != null ? Math.abs(eventoId.hashCode()) : (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
        PendingIntent pi = PendingIntent.getActivity(this, id, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, canal)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(titulo)
            .setContentText(cuerpo)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(cuerpo))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(alarma ? NotificationCompat.PRIORITY_MAX : NotificationCompat.PRIORITY_HIGH)
            .setCategory(alarma ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setSound(alarma ? sirena(this) : android.provider.Settings.System.DEFAULT_NOTIFICATION_URI);
            b.setVibrate(new long[] { 0, 300, 150, 300 });
        }
        nm.notify(id, b.build());
    }

    private static Uri sirena(Context ctx) {
        return Uri.parse("android.resource://" + ctx.getPackageName() + "/raw/sirena");
    }

    /** Los mismos canales que crea la app; si ya existen, Android no los toca. */
    static void asegurarCanales(Context ctx, NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        AudioAttributes alarmaAttr = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        NotificationChannel alarmas = new NotificationChannel(CANAL_ALARMAS, "Alarmas y emergencias", NotificationManager.IMPORTANCE_HIGH);
        alarmas.setDescription("Alarmas de su sistema. Suenan con sirena, siempre.");
        alarmas.setSound(sirena(ctx), alarmaAttr);
        alarmas.enableVibration(true);
        alarmas.setBypassDnd(true);
        alarmas.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        NotificationChannel avisos = new NotificationChannel(CANAL_AVISOS, "Avisos", NotificationManager.IMPORTANCE_HIGH);
        avisos.setDescription("Armados, desarmados, fallas y avisos de la central.");
        avisos.enableVibration(true);
        nm.createNotificationChannel(alarmas);
        nm.createNotificationChannel(avisos);
    }

    /** Dice el texto con el motor de voz; si todavía no está listo, lo encola y lo dice al iniciar. */
    static synchronized void hablar(Context ctx, String texto, boolean alarma) {
        if (voz == null) {
            pendientes.add(new String[] { texto, alarma ? "1" : "0" });
            voz = new TextToSpeech(ctx.getApplicationContext(), estado -> {
                synchronized (AvisosService.class) {
                    if (estado != TextToSpeech.SUCCESS) {
                        Log.w(TAG, "Motor de voz no disponible");
                        voz = null;
                        pendientes.clear();
                        return;
                    }
                    int r = voz.setLanguage(new Locale("es", "VE"));
                    if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) voz.setLanguage(new Locale("es", "ES"));
                    voz.setSpeechRate(0.95f);
                    vozLista = true;
                    for (String[] p : pendientes) decir(p[0], "1".equals(p[1]));
                    pendientes.clear();
                }
            });
            return;
        }
        if (!vozLista) {
            pendientes.add(new String[] { texto, alarma ? "1" : "0" });
            return;
        }
        decir(texto, alarma);
    }

    private static void decir(String texto, boolean alarma) {
        Bundle params = new Bundle();
        // Las alarmas salen por el volumen de alarma (suena aunque el teléfono esté en silencio); el resto como notificación
        params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, alarma ? android.media.AudioManager.STREAM_ALARM : android.media.AudioManager.STREAM_NOTIFICATION);
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
        voz.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(alarma ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build());
        // La sirena del canal suena primero; la voz espera un momento para no pisarla
        voz.playSilentUtterance(alarma ? 1500 : 400, TextToSpeech.QUEUE_ADD, "pausa-" + System.nanoTime());
        voz.speak(texto, TextToSpeech.QUEUE_ADD, params, "aviso-" + System.nanoTime());
        if (alarma) {
            voz.playSilentUtterance(700, TextToSpeech.QUEUE_ADD, "pausa2-" + System.nanoTime());
            voz.speak(texto, TextToSpeech.QUEUE_ADD, params, "aviso2-" + System.nanoTime());
        }
    }
}
