package com.fleboreport.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Notificaciones locales de salida de domicilio. Se programan mientras existe
 * una sesión autenticada, pero pueden mostrarse con la app cerrada o sin red.
 * AlarmManager utiliza alarmas inexactas: el ahorro de batería puede demorarlas.
 * No se almacena información de pacientes ni direcciones.
 */
public final class FleboHomeVisitReminderReceiver extends BroadcastReceiver {
    private static final String STORE = "talcsys_home_reminders_v1";
    private static final String KEY = "alarms";
    private static final String ACTION = "com.fleboreport.app.HOME_REMINDER";
    private static final String WARN_CHANNEL = "flebo_home_departure_v1";
    private static final String URGENT_CHANNEL = "flebo_home_critical_v1";
    private static final long MINUTE = 60000L;
    private static final long MAX_FUTURE = 120L * 24L * 60L * MINUTE;
    private static final String[] TYPES = {"departure_due", "departure_followup", "departure_overdue"};
    private static final long[] OFFSETS = {-30L*MINUTE, -20L*MINUTE, 0L};

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(STORE, Context.MODE_PRIVATE);
    }
    private static JSONArray stored(Context c) {
        try { return new JSONArray(prefs(c).getString(KEY, "[]")); }
        catch (JSONException e) { return new JSONArray(); }
    }
    private static boolean valid(String type) {
        for (String known : TYPES) if (known.equals(type)) return true;
        return false;
    }
    private static PendingIntent intent(Context c, String id, String type, int flags) {
        Intent i = new Intent(c, FleboHomeVisitReminderReceiver.class);
        i.setAction(ACTION);
        i.setData(Uri.parse("talcsys://home-reminder/" + id + "/" + type));
        i.putExtra("visit", id);
        i.putExtra("type", type);
        return PendingIntent.getBroadcast(c, (id + ":" + type).hashCode(),
            i, flags | PendingIntent.FLAG_IMMUTABLE);
    }
    private static void cancel(Context c, JSONObject row) {
        String id = row.optString("id", ""), type = row.optString("type", "");
        if (!id.matches("[0-9a-fA-F-]{36}") || !valid(type)) return;
        PendingIntent p = intent(c, id, type, PendingIntent.FLAG_NO_CREATE);
        if (p == null) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(p);
        p.cancel();
    }
    private static void schedule(Context c, JSONObject row) {
        String id = row.optString("id", ""), type = row.optString("type", "");
        long when = row.optLong("at", 0L);
        if (!id.matches("[0-9a-fA-F-]{36}") || !valid(type)
            || when <= System.currentTimeMillis() + 2500L) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent p = intent(c, id, type, PendingIntent.FLAG_UPDATE_CURRENT);
        if (Build.VERSION.SDK_INT >= 23)
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, p);
        else am.set(AlarmManager.RTC_WAKEUP, when, p);
    }
    public static synchronized int replace(Context c, JSONArray visits) throws JSONException {
        JSONArray previous = stored(c);
        for (int i = 0; i < previous.length(); i++) {
            JSONObject row = previous.optJSONObject(i);
            if (row != null) cancel(c, row);
        }
        JSONArray alarms = new JSONArray();
        long now = System.currentTimeMillis();
        int accepted = 0;
        for (int i = 0; i < visits.length() && accepted < 100; i++) {
            JSONObject v = visits.optJSONObject(i);
            if (v == null) continue;
            String id = v.optString("id", "");
            long at = v.optLong("scheduledAt", 0L);
            if (!id.matches("[0-9a-fA-F-]{36}") || at <= now || at > now + MAX_FUTURE) continue;
            accepted++;
            for (int kind = 0; kind < TYPES.length; kind++) {
                long trigger = at + OFFSETS[kind];
                if (trigger <= now + 2500L) continue;
                JSONObject row = new JSONObject();
                row.put("id", id); row.put("type", TYPES[kind]); row.put("at", trigger);
                alarms.put(row);
            }
        }
        // El receptor valida que la alarma pertenece a la programación vigente.
        prefs(c).edit().putString(KEY, alarms.toString()).apply();
        for (int i = 0; i < alarms.length(); i++) schedule(c, alarms.getJSONObject(i));
        return alarms.length();
    }
    public static synchronized void clear(Context c) {
        JSONArray previous = stored(c);
        for (int i = 0; i < previous.length(); i++) {
            JSONObject row = previous.optJSONObject(i);
            if (row != null) cancel(c, row);
        }
        prefs(c).edit().remove(KEY).apply();
    }
    private static boolean active(Context c, String id, String type, long now) {
        JSONArray rows = stored(c);
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row != null && id.equals(row.optString("id"))
                && type.equals(row.optString("type"))) {
                long at = row.optLong("at", 0L);
                return now >= at - 2L * MINUTE && now <= at + 45L * MINUTE;
            }
        }
        return false;
    }
    private static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager =
            (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (manager.getNotificationChannel(WARN_CHANNEL) == null) {
            NotificationChannel w = new NotificationChannel(WARN_CHANNEL,
                "Salidas de Domicilios", NotificationManager.IMPORTANCE_DEFAULT);
            w.setDescription("Avisos de salida sin datos personales.");
            manager.createNotificationChannel(w);
        }
        if (manager.getNotificationChannel(URGENT_CHANNEL) == null) {
            NotificationChannel h = new NotificationChannel(URGENT_CHANNEL,
                "Alertas críticas de Domicilios", NotificationManager.IMPORTANCE_HIGH);
            h.setDescription("Alertas críticas de desplazamiento sin datos de pacientes.");
            manager.createNotificationChannel(h);
        }
    }
    @Override public void onReceive(Context c, Intent in) {
        if (in == null) return;
        String action = in.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            JSONArray rows = stored(c);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row != null) schedule(c, row);
            }
            return;
        }
        if (!ACTION.equals(action)) return;
        String id = in.getStringExtra("visit"), type = in.getStringExtra("type");
        if (id == null || type == null || !active(c, id, type, System.currentTimeMillis())) return;
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return;
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return;
        channels(c);
        String title, body;
        switch (type) {
            case "departure_due":
                title = "Domicilio: salida próxima";
                body = "Faltan unos 30 minutos. Revisa tu agenda.";
                break;
            case "departure_followup":
                title = "Alerta crítica de domicilio";
                body = "Se aproxima la atención. Comprueba el desplazamiento.";
                break;
            case "departure_overdue":
                title = "Domicilio fuera de hora";
                body = "Revisa si debes iniciar o actualizar el desplazamiento.";
                break;
            default: return;
        }
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open == null) return;
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("flebo_notification_view", "domicilios");
        PendingIntent tap = PendingIntent.getActivity(c, (id + ":" + type).hashCode(),
            open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        boolean urgent = !"departure_due".equals(type);
        Notification n = new NotificationCompat.Builder(c,
                urgent ? URGENT_CHANNEL : WARN_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_fleboreport)
            .setContentTitle(title).setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(urgent ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true).setContentIntent(tap).build();
        try {
            NotificationManagerCompat.from(c).notify("flebo:home:" + id + ":" + type, 1, n);
        } catch (SecurityException ignored) {
            // El usuario puede desactivar los avisos Android desde ajustes del sistema.
        }
    }
}
