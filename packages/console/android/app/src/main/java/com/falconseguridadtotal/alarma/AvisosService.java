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
        String eco = d.get("eco");
        // Primero el acuse, en este mismo hilo: si el sistema mata el proceso después, el servidor igual sabe que llegó
        acusarAhora(eco, "recibido");
        mostrar(titulo, cuerpo, alarma, d.get("eventoId"));
        if (habla != null && !habla.isEmpty()) {
            // La voz corre en un servicio en primer plano para que nadie la mate a medio camino
            Intent voz = new Intent(this, VozService.class);
            voz.putExtra("habla", habla);
            voz.putExtra("alarma", alarma);
            voz.putExtra("eco", eco);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(voz);
                else startService(voz);
            } catch (Exception e) {
                // Sin permiso de primer plano en este momento: se intenta igual en el proceso actual
                Log.w(TAG, "No se pudo iniciar el servicio de voz: " + e.getMessage());
                hablar(getApplicationContext(), habla, alarma, eco);
            }
        } else {
            acusar(eco, "sin voz (apagada en preferencias)");
        }
    }

    /** Acuse sincrónico, con tope corto: se usa en el hilo del mensaje, antes de que el proceso pueda morir. */
    static void acusarAhora(String eco, String estado) {
        if (eco == null) return;
        try {
            java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL("https://monitoreo.falconseguridadtotal.com/api/push/eco").openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            c.setConnectTimeout(4000);
            c.setReadTimeout(4000);
            org.json.JSONObject j = new org.json.JSONObject();
            j.put("eco", eco);
            j.put("estado", estado + " | " + Build.MANUFACTURER + " " + Build.MODEL + " Android " + Build.VERSION.RELEASE);
            c.getOutputStream().write(j.toString().getBytes("UTF-8"));
            c.getResponseCode();
            c.disconnect();
        } catch (Exception e) {
            Log.w(TAG, "No se pudo acusar el push: " + e.getMessage());
        }
    }

    private static Runnable alTerminar;

    /** Quien arranca la voz puede pedir aviso cuando termine de hablar. */
    static synchronized void alTerminarVoz(Runnable r) {
        alTerminar = r;
    }

    /** Le cuenta al servidor qué pasó con este aviso: llegó, y si la voz habló o por qué no. */
    static void acusar(String eco, String estado) {
        if (eco == null) return;
        new Thread(() -> {
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL("https://monitoreo.falconseguridadtotal.com/api/push/eco").openConnection();
                c.setRequestMethod("POST");
                c.setRequestProperty("Content-Type", "application/json");
                c.setDoOutput(true);
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                org.json.JSONObject j = new org.json.JSONObject();
                j.put("eco", eco);
                j.put("estado", estado + " | " + Build.MANUFACTURER + " " + Build.MODEL + " Android " + Build.VERSION.RELEASE);
                byte[] cuerpo = j.toString().getBytes("UTF-8");
                c.getOutputStream().write(cuerpo);
                c.getResponseCode();
                c.disconnect();
            } catch (Exception e) {
                Log.w(TAG, "No se pudo acusar el push: " + e.getMessage());
            }
        }).start();
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
    private static String motorInfo = "";
    private static Context appCtx;

    /** Volúmenes actuales del teléfono, para saber si la voz salió por un canal en silencio. */
    private static String volumenes() {
        try {
            android.media.AudioManager am = (android.media.AudioManager) appCtx.getSystemService(Context.AUDIO_SERVICE);
            return "vol(notif=" + am.getStreamVolume(android.media.AudioManager.STREAM_NOTIFICATION) + "/" + am.getStreamMaxVolume(android.media.AudioManager.STREAM_NOTIFICATION)
                + " alarma=" + am.getStreamVolume(android.media.AudioManager.STREAM_ALARM) + "/" + am.getStreamMaxVolume(android.media.AudioManager.STREAM_ALARM)
                + " media=" + am.getStreamVolume(android.media.AudioManager.STREAM_MUSIC) + "/" + am.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC)
                + " modo=" + am.getRingerMode() + ")";
        } catch (Exception e) {
            return "vol=?";
        }
    }

    static synchronized void hablar(Context ctx, String texto, boolean alarma, String eco) {
        appCtx = ctx.getApplicationContext();
        if (voz == null) {
            pendientes.add(new String[] { texto, alarma ? "1" : "0", eco });
            voz = new TextToSpeech(ctx.getApplicationContext(), estado -> {
                synchronized (AvisosService.class) {
                    if (estado != TextToSpeech.SUCCESS) {
                        Log.w(TAG, "Motor de voz no disponible");
                        for (String[] p : pendientes) acusar(p[2], "voz: motor no disponible (estado " + estado + ")");
                        voz = null;
                        pendientes.clear();
                        return;
                    }
                    int r = voz.setLanguage(new Locale("es", "VE"));
                    String idioma = "es-VE=" + r;
                    if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                        r = voz.setLanguage(new Locale("es", "ES"));
                        idioma += " es-ES=" + r;
                        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                            r = voz.setLanguage(new Locale("es"));
                            idioma += " es=" + r;
                        }
                    }
                    String motor = "";
                    try { motor = voz.getDefaultEngine(); } catch (Exception e) { motor = "?"; }
                    motorInfo = "motor=" + motor + " " + idioma;
                    voz.setSpeechRate(0.95f);
                    voz.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
                        @Override public void onStart(String id) {}
                        @Override public void onError(String id) { avisarFin(id); }
                        @Override public void onDone(String id) { avisarFin(id); }
                        private void avisarFin(String id) {
                            if (id != null && id.startsWith("fin-")) {
                                Runnable r;
                                synchronized (AvisosService.class) { r = alTerminar; }
                                if (r != null) r.run();
                            }
                        }
                    });
                    vozLista = true;
                    for (String[] p : pendientes) decir(p[0], "1".equals(p[1]), p[2]);
                    pendientes.clear();
                }
            });
            return;
        }
        if (!vozLista) {
            pendientes.add(new String[] { texto, alarma ? "1" : "0", eco });
            return;
        }
        decir(texto, alarma, eco);
    }

    private static void decir(String texto, boolean alarma, String eco) {
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
        int r = voz.speak(texto, TextToSpeech.QUEUE_ADD, params, (alarma ? "aviso-" : "fin-") + System.nanoTime());
        if (alarma) {
            voz.playSilentUtterance(700, TextToSpeech.QUEUE_ADD, "pausa2-" + System.nanoTime());
            voz.speak(texto, TextToSpeech.QUEUE_ADD, params, "fin-" + System.nanoTime());
        }
        acusar(eco, "voz: speak=" + r + " " + motorInfo + " alarma=" + alarma + " " + volumenes());
    }
}
