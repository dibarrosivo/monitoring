package com.falconseguridadtotal.alarma;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;

/**
 * Dice el aviso en voz alta desde un servicio en primer plano. Con la app
 * cerrada, algunos Android (Xiaomi sobre todo) matan el proceso apenas se
 * muestra la notificación, antes de que el motor de voz arranque; en primer
 * plano el sistema lo deja terminar. Vive unos segundos y se apaga solo.
 */
public class VozService extends Service {
    private static final String CANAL = "voz-servicio";
    private static final int ID = 7001;
    private static final long MAX_MS = 25_000;
    private final Handler reloj = new Handler(Looper.getMainLooper());

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String texto = intent != null ? intent.getStringExtra("habla") : null;
        boolean alarma = intent != null && intent.getBooleanExtra("alarma", false);
        String eco = intent != null ? intent.getStringExtra("eco") : null;
        Notification n = notificacionSilenciosa();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(ID, n, Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE : ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(ID, n);
        }
        if (texto != null && !texto.isEmpty()) AvisosService.hablar(getApplicationContext(), texto, alarma, eco);
        // Se apaga cuando la voz terminó o, a más tardar, en 25 s
        reloj.removeCallbacksAndMessages(null);
        reloj.postDelayed(this::terminar, alarma ? MAX_MS : 15_000);
        AvisosService.alTerminarVoz(() -> reloj.postDelayed(this::terminar, 600));
        return START_NOT_STICKY;
    }

    private void terminar() {
        stopForeground(true);
        stopSelf();
    }

    /** Notificación mínima y muda que exige el primer plano; el aviso real ya está en la bandeja. */
    private Notification notificacionSilenciosa() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel c = new NotificationChannel(CANAL, "Voz de los avisos", NotificationManager.IMPORTANCE_MIN);
            c.setDescription("Mientras la app dice un aviso en voz alta.");
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
        }
        return new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setContentTitle("Diciendo el aviso…")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .setOngoing(true)
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
