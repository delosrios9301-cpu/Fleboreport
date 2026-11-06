import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-sla-hook-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const reply = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, service, { auth: { persistSession: false } });
const publicVapid = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const privateVapid = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const configuredVapidSubject = (Deno.env.get("VAPID_SUBJECT") || "").trim();
const subject = /^mailto:/i.test(configuredVapidSubject) || /^https:\/\//i.test(configuredVapidSubject)
  ? configuredVapidSubject
  : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredVapidSubject)
    ? "mailto:" + configuredVapidSubject
    : "mailto:soporte@fleboreport.app";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método no permitido" }, 405);

  try {
    const body = await req.json();
    const action = String(body.action || "");
    if (action === "dispatch-sla") {
      const supplied = req.headers.get("x-sla-hook-token") || "";
      const { data: hook, error: hookError } = await admin.from("workflow_sla_push_secrets").select("token").eq("singleton", true).maybeSingle();
      if (hookError) throw hookError;
      if (!hook?.token || supplied !== hook.token) return reply({ error: "No autorizado" }, 401);
      if (!publicVapid || !privateVapid) return reply({ error: "Claves VAPID no configuradas" }, 503);
      const alertId = String(body.alert_id || "");
      if (!alertId) return reply({ error: "Falta alert_id" }, 400);
      const { data: alert, error: alertError } = await admin.from("workflow_sla_alerts").select("id,workspace_id,entity,record_id,recipient_user_id,alert_code,severity,due_at,generated_at,metadata,resolved_at").eq("id", alertId).maybeSingle();
      if (alertError) throw alertError;
      if (!alert || alert.resolved_at) return reply({ ok: true, skipped: "alert_not_active" });
      const { data: subs, error: subsError } = await admin.from("home_visit_push_subscriptions").select("id,endpoint,p256dh,auth_secret").eq("user_id", alert.recipient_user_id).eq("workspace_id", alert.workspace_id).eq("active", true);
      if (subsError) throw subsError;
      const labels: Record<string,string> = { acceptance_pending: "Domicilio pendiente de aceptación: revisa la asignación", departure_due: "Inicia el desplazamiento del domicilio", departure_followup: "Seguimiento: aún no estás en camino", departure_overdue: "Domicilio fuera de hora: inicia el desplazamiento", sample_24h: "Muestra próxima a vencer: quedan 24 horas", sample_20m: "Alerta crítica: quedan 20 minutos para procesar la muestra", sample_overdue: "Muestra fuera del plazo de 72 horas" };
      const title = labels[alert.alert_code] || "Alerta de seguimiento · FleboReport";
      const subjectText = alert.entity === "home_visit" ? "domicilio" : "muestra clínica";
      const bodyText = alert.severity === "overdue" ? "El plazo ya venció. Revisa el seguimiento del " + subjectText + "." : alert.severity === "critical" ? "Atención inmediata. El plazo está por agotarse. Revisa el " + subjectText + "." : "Se aproxima el límite de tiempo. Revisa el " + subjectText + ".";
      webpush.setVapidDetails(subject, publicVapid, privateVapid);
      let sent = 0, failed = 0;
      for (const sub of subs || []) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } }, JSON.stringify({ title, body: bodyText, url: alert.entity === "home_visit" ? "./?view=domicilios" : "./?view=clinical-processing", tag: "fleboreport-sla-" + alert.id }));
          sent++;
        } catch (e) {
          failed++;
          const status = (e as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) await admin.from("home_visit_push_subscriptions").update({ active: false }).eq("id", sub.id);
        }
      }
      return reply({ ok: true, sent, attempted: subs?.length || 0, failed, alert_id: alert.id });
    }

    // Las llamadas internas de pg_net se autentican con el token secreto de SLA
    // validado arriba; las acciones interactivas siguen exigiendo JWT de usuario.
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "");
    if (!token) return reply({ error: "Sesión requerida" }, 401);
    const auth = createClient(url, anon, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false }
    });
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return reply({ error: "Sesión inválida" }, 401);

    const { data: membership, error: membershipError } = await admin
      .from("workspace_members").select("workspace_id,role,active")
      .eq("user_id", user.id).eq("active", true).limit(1).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return reply({ error: "Membresía activa requerida" }, 403);

    if (action === "config-status") {
      if (membership.role !== "admin") return reply({ error: "Solo el administrador puede consultar la configuración de canales." }, 403);
      return reply({ ok: true, push: { public_key_present: !!publicVapid, private_key_present: !!privateVapid, configured: !!(publicVapid && privateVapid) } });
    }

    if (action === "vapid-public") {
      const missing: string[] = [];
      if (!publicVapid) missing.push("VAPID_PUBLIC_KEY");
      if (!privateVapid) missing.push("VAPID_PRIVATE_KEY");
      if (publicVapid && publicVapid.length !== 87) missing.push("VAPID_PUBLIC_KEY tiene longitud inesperada (" + publicVapid.length + ").");
      if (privateVapid && privateVapid.length !== 43) missing.push("VAPID_PRIVATE_KEY tiene longitud inesperada (" + privateVapid.length + ").");
      return reply({ publicKey: publicVapid, configured: missing.length === 0, diagnostic: {
        publicKeyPresent: !!publicVapid, privateKeyPresent: !!privateVapid,
        publicKeyLength: publicVapid.length, privateKeyLength: privateVapid.length, missing
      } });
    }

    if (action === "subscribe") {
      const sub = body.subscription || {};
      if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return reply({ error: "Suscripción Push incompleta" }, 400);
      // Un endpoint del navegador pertenece a una sola cuenta activa. Si el dispositivo
      // cambió de usuario, desactivar su vínculo anterior antes de reasignarlo.
      const { error: previousOwnerError } = await admin.from("home_visit_push_subscriptions")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("endpoint", sub.endpoint).neq("user_id", user.id).eq("active", true);
      if (previousOwnerError) throw previousOwnerError;
      const { error } = await admin.from("home_visit_push_subscriptions").upsert({
        workspace_id: membership.workspace_id, user_id: user.id, endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh, auth_secret: sub.keys.auth,
        user_agent: String(body.user_agent || "").slice(0, 500), active: true, updated_at: new Date().toISOString()
      }, { onConflict: "user_id,endpoint" });
      if (error) throw error;
      return reply({ ok: true });
    }

    if (action === "cancelled") {
      if (!["admin", "clinician", "reception"].includes(membership.role)) return reply({ error: "Solo Agenda puede notificar la cancelación." }, 403);
      const visitId = String(body.visit_id || "");
      if (!visitId) return reply({ error: "Falta visit_id" }, 400);
      const { data: visit, error: visitError } = await admin.from("home_visits").select("id,scheduled_at,status,priority,cancellation_reason,created_by,workspace_id").eq("id", visitId).eq("workspace_id", membership.workspace_id).maybeSingle();
      if (visitError) throw visitError;
      if (!visit || visit.status !== "cancelled") return reply({ error: "La cancelación no está confirmada en la agenda." }, 409);
      const { data: assignments, error: assignmentError } = await admin.from("home_visit_assignments").select("assigned_user_id,status,assigned_at").eq("workspace_id", membership.workspace_id).eq("home_visit_id", visitId).not("assigned_user_id", "is", null).order("assigned_at", { ascending: false }).limit(1);
      if (assignmentError) throw assignmentError;
      const recipients = [...new Set([...(assignments || []).map((row: { assigned_user_id?: string | null }) => row.assigned_user_id).filter(Boolean), visit.created_by].filter((id): id is string => !!id && id !== user.id))];
      if (!recipients.length) return reply({ ok: true, notified: 0, push_sent: 0 });
      const when = visit.scheduled_at ? new Date(visit.scheduled_at).toLocaleString("es-PA", { timeZone: "America/Panama" }) : "Horario por confirmar";
      const reason = String(visit.cancellation_reason || body.reason || "No se indicó motivo adicional").trim().slice(0, 500);
      const priority = visit.priority === "urgent" ? "Urgente" : visit.priority === "high" ? "Prioritario" : "Normal";
      const title = "Domicilio cancelado · " + priority;
      const message = "Prioridad: " + priority + ". La visita programada para " + when + " fue cancelada. Motivo: " + reason + ". No te desplaces ni prepares la toma. Consulta la agenda de FleboReport para verificar la actualización.";
      const metadata = { event: "home_visit_cancelled", visit_id: visitId };
      let inAppSaved = 0, pushSent = 0, pushAttempted = 0, pushFailed = 0;
      for (const recipientId of recipients) {
        const { data: existing, error: lookupError } = await admin.from("home_visit_notifications").select("id").eq("workspace_id", membership.workspace_id).eq("home_visit_id", visitId).eq("recipient_user_id", recipientId).eq("channel", "in_app").contains("metadata", metadata).limit(1);
        if (lookupError) throw lookupError;
        if (!(existing || []).length) {
          const { error } = await admin.from("home_visit_notifications").insert({ workspace_id: membership.workspace_id, home_visit_id: visitId, recipient_user_id: recipientId, channel: "in_app", template_name: "home_visit_cancelled", status: "queued", message_body: title + "\\n" + message, metadata });
          if (error) throw error;
          inAppSaved++;
        }
        if (!publicVapid || !privateVapid) continue;
        const { data: previous, error: previousError } = await admin.from("home_visit_notifications").select("id,status,metadata").eq("workspace_id", membership.workspace_id).eq("home_visit_id", visitId).eq("recipient_user_id", recipientId).eq("channel", "push").contains("metadata", metadata).limit(1);
        if (previousError) throw previousError;
        if ((previous || []).some((row: { status?: string; metadata?: Record<string, unknown> }) => row.status === "sent" || row.metadata?.push_status === "sent")) continue;
        const { data: subs, error: subError } = await admin.from("home_visit_push_subscriptions").select("id,endpoint,p256dh,auth_secret").eq("user_id", recipientId).eq("workspace_id", membership.workspace_id).eq("active", true);
        if (subError) throw subError;
        pushAttempted += subs?.length || 0;
        let sentForUser = 0, sendError: string | null = null;
        if (subs?.length) {
          try { webpush.setVapidDetails(subject, publicVapid, privateVapid); } catch (e) { sendError = e instanceof Error ? e.message : "Configuración VAPID inválida"; }
          for (const sub of subs) {
            if (sendError) break;
            try {
              await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } }, JSON.stringify({ title, body: message, url: "./?view=domicilios", tag: "flebo-cancelled-" + visitId }));
              sentForUser++;
            } catch (e) {
              const status = (e as { statusCode?: number })?.statusCode;
              if (status === 404 || status === 410) await admin.from("home_visit_push_subscriptions").update({ active: false }).eq("id", sub.id);
              sendError = e instanceof Error ? e.message : "Error del proveedor Push";
            }
          }
        }
        pushSent += sentForUser;
        if (sendError || !sentForUser) pushFailed++;
        const { data: pushRows, error: pushLookupError } = await admin.from("home_visit_notifications").select("id").eq("workspace_id", membership.workspace_id).eq("home_visit_id", visitId).eq("recipient_user_id", recipientId).eq("channel", "push").contains("metadata", metadata).limit(1);
        if (pushLookupError) throw pushLookupError;
        const pushRecord = { workspace_id: membership.workspace_id, home_visit_id: visitId, recipient_user_id: recipientId, channel: "push", template_name: "home_visit_cancelled", status: sentForUser > 0 ? "sent" : "failed", message_body: message, sent_at: sentForUser > 0 ? new Date().toISOString() : null, error_code: sendError || (!subs?.length ? "NO_ACTIVE_SUBSCRIPTION" : null), metadata: { ...metadata, attempted: subs?.length || 0, sent: sentForUser, push_status: sentForUser > 0 ? "sent" : "failed" } };
        if ((pushRows || []).length) {
          if (sentForUser > 0) { const { error } = await admin.from("home_visit_notifications").update(pushRecord).eq("workspace_id", membership.workspace_id).eq("home_visit_id", visitId).eq("recipient_user_id", recipientId).eq("channel", "push").contains("metadata", metadata); if (error) throw error; }
        } else { const { error } = await admin.from("home_visit_notifications").insert(pushRecord); if (error) throw error; }
      }
      return reply({ ok: true, notified: recipients.length, in_app_saved: inAppSaved, push_sent: pushSent, push_attempted: pushAttempted, push_failed: pushFailed });
    }
    if (action === "status-update") {
      const visitId = String(body.visit_id || "");
      if (!visitId) return reply({ error: "Falta visit_id" }, 400);
      const { data: assignment, error: assignmentError } = await admin.from("home_visit_assignments")
        .select("id,assigned_user_id,status,assigned_at").eq("workspace_id", membership.workspace_id)
        .eq("home_visit_id", visitId).order("assigned_at", { ascending: false }).limit(1).maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment || assignment.assigned_user_id !== user.id || assignment.status !== "accepted")
        return reply({ error: "Solo el flebotomista que aceptó la asignación vigente puede operar este domicilio." }, 403);

      const { data: visit, error: visitError } = await admin.from("home_visits")
        .select("id,workspace_id,created_by,scheduled_at,priority").eq("id", visitId)
        .eq("workspace_id", membership.workspace_id).maybeSingle();
      if (visitError) throw visitError;
      if (!visit) return reply({ error: "No se encontró el domicilio." }, 404);

      const { data: coordinators, error: coordinatorError } = await admin.from("workspace_members")
        .select("user_id").eq("workspace_id", membership.workspace_id).eq("active", true)
        .in("role", ["admin", "reception", "clinician"]);
      if (coordinatorError) throw coordinatorError;

      const recipients = [...new Set([
        ...(coordinators || []).map((m: { user_id: string }) => m.user_id),
        visit.created_by
      ].filter((id): id is string => !!id && id !== user.id))];
      if (!recipients.length) return reply({ ok: true, notified: 0, push_sent: 0 });

      const eventType = String(body.event_type || body.status || "actualización").trim().slice(0, 100);
      const description = String(body.description || "").trim().slice(0, 500);
      const status = String(body.status || "").trim().slice(0, 100);
      const statusLabels: Record<string,string> = {
        pending: "Pendiente de aceptación", accepted: "Domicilio aceptado",
        en_route: "Flebotomista en camino", at_home: "Flebotomista en el domicilio",
        samples_taken: "Muestras tomadas", patient_absent: "Paciente ausente",
        patient_refused: "Paciente rechazó la atención", not_performed: "Domicilio no realizado",
        completed: "Domicilio completado", cancelled: "Domicilio cancelado"
      };
      const statusText = statusLabels[status] || statusLabels[eventType] || eventType;
      const title = "Actualización de domicilio";
      const message = statusText + (description ? ". " + description : "") +
        ". Revisa el seguimiento del domicilio en FleboReport.";
      const metadata = {
        event: "home_visit_status_changed", visit_id: visitId,
        event_type: eventType, status, description
      };
      const when = new Date().toISOString();
      let inAppSaved = 0, pushSent = 0, pushAttempted = 0, pushFailed = 0;
      for (const recipientId of recipients) {
        const { data: existing, error: lookupError } = await admin.from("home_visit_notifications")
          .select("id").eq("workspace_id", membership.workspace_id).eq("home_visit_id", visitId)
          .eq("recipient_user_id", recipientId).eq("channel", "in_app")
          .contains("metadata", metadata).limit(1);
        if (lookupError) throw lookupError;
        if (!(existing || []).length) {
          const { error } = await admin.from("home_visit_notifications").insert({
            workspace_id: membership.workspace_id, home_visit_id: visitId,
            recipient_user_id: recipientId, channel: "in_app",
            template_name: "home_visit_status_changed", status: "queued",
            message_body: title + "\\n" + message, metadata
          });
          if (error) throw error;
          inAppSaved++;
        }

        if (!publicVapid || !privateVapid) continue;
        const { data: subs, error: subError } = await admin.from("home_visit_push_subscriptions")
          .select("id,endpoint,p256dh,auth_secret").eq("user_id", recipientId)
          .eq("workspace_id", membership.workspace_id).eq("active", true);
        if (subError) throw subError;
        pushAttempted += subs?.length || 0;
        let sentForUser = 0, sendError: string | null = null;
        if (subs?.length) {
          try { webpush.setVapidDetails(subject, publicVapid, privateVapid); }
          catch (e) { sendError = e instanceof Error ? e.message : "Configuración VAPID inválida"; }
          for (const sub of subs) {
            if (sendError) break;
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
                JSON.stringify({
                  title, body: message, url: "./?view=domicilios",
                  tag: "flebo-status-" + visitId + "-" + eventType
                })
              );
              sentForUser++;
            } catch (e) {
              const code = (e as { statusCode?: number })?.statusCode;
              if (code === 404 || code === 410)
                await admin.from("home_visit_push_subscriptions").update({ active: false }).eq("id", sub.id);
              sendError = e instanceof Error ? e.message : "Error del proveedor Push";
            }
          }
        }
        pushSent += sentForUser;
        if (sendError || !sentForUser) pushFailed++;
        const { data: pushRows, error: pushLookupError } = await admin.from("home_visit_notifications")
          .select("id").eq("workspace_id", membership.workspace_id).eq("home_visit_id", visitId)
          .eq("recipient_user_id", recipientId).eq("channel", "push").contains("metadata", metadata).limit(1);
        if (pushLookupError) throw pushLookupError;
        const pushRecord = {
          workspace_id: membership.workspace_id, home_visit_id: visitId,
          recipient_user_id: recipientId, channel: "push", template_name: "home_visit_status_changed",
          status: sentForUser > 0 ? "sent" : "failed", message_body: message,
          sent_at: sentForUser > 0 ? when : null,
          error_code: sendError || (!subs?.length ? "NO_ACTIVE_SUBSCRIPTION" : null),
          metadata: { ...metadata, attempted: subs?.length || 0, sent: sentForUser,
            push_status: sentForUser > 0 ? "sent" : "failed" }
        };
        if ((pushRows || []).length) {
          if (sentForUser > 0) {
            const { error } = await admin.from("home_visit_notifications").update(pushRecord)
              .eq("workspace_id", membership.workspace_id).eq("home_visit_id", visitId)
              .eq("recipient_user_id", recipientId).eq("channel", "push").contains("metadata", metadata);
            if (error) throw error;
          }
        } else {
          const { error } = await admin.from("home_visit_notifications").insert(pushRecord);
          if (error) throw error;
        }
      }
      return reply({ ok: true, notified: recipients.length, in_app_saved: inAppSaved,
        push_sent: pushSent, push_attempted: pushAttempted, push_failed: pushFailed });
    }

    if (action === "test-push") {
      if (!publicVapid || !privateVapid) return reply({ error: "Faltan las claves VAPID del servidor." }, 503);
      try { webpush.setVapidDetails(subject, publicVapid, privateVapid); }
      catch (e) { return reply({ error: "Las claves VAPID no son válidas o no corresponden: " + (e instanceof Error ? e.message : "error de configuración") }, 500); }
      const { data: subs, error } = await admin.from("home_visit_push_subscriptions")
        .select("id,endpoint,p256dh,auth_secret").eq("user_id", user.id)
        .eq("workspace_id", membership.workspace_id).eq("active", true);
      if (error) throw error;
      if (!subs?.length) return reply({ error: "Este usuario no tiene un dispositivo Push registrado." }, 404);
      let sent = 0, failed = 0;
      for (const sub of subs) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
            JSON.stringify({ title: "Prueba de notificaciones · FleboReport", body: "¡Funciona! Este dispositivo está recibiendo notificaciones push.", url: "./?view=domicilios", tag: "fleboreport-push-test" }));
          sent++;
        } catch (e) {
          failed++;
          const status = (e as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) await admin.from("home_visit_push_subscriptions").update({ active: false }).eq("id", sub.id);
        }
      }
      return reply({ ok: sent > 0, sent, attempted: subs.length, failed });
    }

    if (action === "dispatch") {
      if (!["admin", "clinician", "reception"].includes(membership.role))
        return reply({ error: "No tienes permiso para asignar domicilios" }, 403);
      const assignmentId = String(body.assignment_id || "");
      if (!assignmentId) return reply({ error: "Falta assignment_id" }, 400);

      const { data: assignment, error: assignmentError } = await admin.from("home_visit_assignments")
        .select("id,workspace_id,home_visit_id,assigned_user_id,status,home_visits(id,scheduled_at,notes,priority)")
        .eq("id", assignmentId).eq("workspace_id", membership.workspace_id).single();
      if (assignmentError || !assignment || !assignment.assigned_user_id)
        return reply({ error: "No se encontró la asignación con usuario asignado" }, 404);

      const visit = assignment.home_visits as { scheduled_at?: string; notes?: string; priority?: string } | null;
      const when = visit?.scheduled_at
        ? new Date(visit.scheduled_at).toLocaleString("es-PA", { timeZone: "America/Panama" })
        : "Horario por confirmar";
      const priority = visit?.priority === "urgent" ? "Urgente" : visit?.priority === "high" ? "Prioritario" : "Normal";
      const title = (priority === "Urgente" ? "URGENTE · " : priority === "Prioritario" ? "PRIORITARIO · " : "") + "Domicilio pendiente de aprobación";
      const message = "Prioridad: " + priority + ".\\nTienes un nuevo domicilio asignado.\\nFecha y hora: " + when +
        "\\nAbre FleboReport para aceptar o rechazar la asignación. Los datos del paciente, dirección y pruebas se mostrarán después de aceptar.";
      const metadata = { assignment_id: assignment.id, event: "home_visit_assigned", priority: visit?.priority || "normal" };

      // Guardar primero el aviso dentro de FleboReport, aunque Push no esté configurado.
      const { data: existingInApp, error: inAppLookupError } = await admin.from("home_visit_notifications")
        .select("id").eq("workspace_id", membership.workspace_id).eq("home_visit_id", assignment.home_visit_id)
        .eq("recipient_user_id", assignment.assigned_user_id).eq("channel", "in_app")
        .contains("metadata", { assignment_id: assignment.id }).limit(1);
      if (inAppLookupError) throw inAppLookupError;
      let inAppSaved = false;
      let inAppNotificationId = (existingInApp || [])[0]?.id || null;
      if (!inAppNotificationId) {
        const { data: inAppRow, error } = await admin.from("home_visit_notifications").insert({
          workspace_id: membership.workspace_id, home_visit_id: assignment.home_visit_id,
          recipient_user_id: assignment.assigned_user_id, channel: "in_app", status: "queued",
          template_name: "home_visit_assigned", message_body: title + "\\n" + message, metadata
        }).select("id").single();
        if (error) throw error;
        inAppNotificationId = inAppRow?.id || null;
      }
      inAppSaved = !!inAppNotificationId;
      const notificationTag = inAppNotificationId ? "fleboreport-notif-" + inAppNotificationId : "flebo-assignment-" + assignment.id;

      const { data: previousPushRows, error: previousPushError } = await admin.from("home_visit_notifications")
        .select("id,status,metadata").eq("workspace_id", membership.workspace_id)
        .eq("home_visit_id", assignment.home_visit_id).eq("recipient_user_id", assignment.assigned_user_id)
        .eq("channel", "push").contains("metadata", { assignment_id: assignment.id }).limit(1);
      if (previousPushError) throw previousPushError;
      const pushAlreadySent = (previousPushRows || []).some(row =>
        row.status === "sent" || row.metadata?.push_status === "sent"
      );

      let pushSent = 0, pushAttempted = 0, pushStatus = pushAlreadySent ? "sent" : "not_configured", pushError: string | null = null;
      if (!pushAlreadySent && publicVapid && privateVapid) {
        try {
          webpush.setVapidDetails(subject, publicVapid, privateVapid);
          const { data: subs, error } = await admin.from("home_visit_push_subscriptions")
            .select("id,endpoint,p256dh,auth_secret").eq("user_id", assignment.assigned_user_id)
            .eq("workspace_id", membership.workspace_id).eq("active", true);
          if (error) throw error;
          pushAttempted = subs?.length || 0;
          if (!pushAttempted) pushStatus = "no_active_subscription";
          else {
            for (const sub of subs || []) {
              try {
                await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
                  JSON.stringify({ title, body: message, url: "?view=domicilios&visit=" + assignment.home_visit_id, tag: notificationTag }));
                pushSent++;
              } catch (e) {
                const status = (e as { statusCode?: number })?.statusCode;
                if (status === 404 || status === 410)
                  await admin.from("home_visit_push_subscriptions").update({ active: false }).eq("id", sub.id);
                pushError = e instanceof Error ? e.message : "Error del proveedor Push";
              }
            }
            pushStatus = pushSent > 0 ? "sent" : "failed";
          }
        } catch (e) {
          pushStatus = "failed";
          pushError = e instanceof Error ? e.message : "Error de configuración Push";
        }
      }

      // Registrar resultado Push por asignación para auditoría y permitir reintentos de reasignaciones.
      const { data: existingPush, error: pushLookupError } = await admin.from("home_visit_notifications")
        .select("id").eq("workspace_id", membership.workspace_id).eq("home_visit_id", assignment.home_visit_id)
        .eq("recipient_user_id", assignment.assigned_user_id).eq("channel", "push")
        .contains("metadata", { assignment_id: assignment.id }).limit(1);
      if (pushLookupError) throw pushLookupError;
      const pushRow = {
        workspace_id: membership.workspace_id, home_visit_id: assignment.home_visit_id,
        recipient_user_id: assignment.assigned_user_id, channel: "push",
        status: pushStatus === "sent" ? "sent" : "failed", message_body: message,
        sent_at: pushStatus === "sent" ? new Date().toISOString() : null,
        error_code: pushError || (pushStatus === "not_configured" ? "VAPID_NOT_CONFIGURED" : pushStatus === "no_active_subscription" ? "NO_ACTIVE_SUBSCRIPTION" : null),
        metadata: { ...metadata, attempted: pushAttempted, sent: pushSent, push_status: pushStatus }
      };
      if (!(existingPush || []).length) {
        const { error } = await admin.from("home_visit_notifications").insert(pushRow);
        if (error) throw error;
      } else if (!pushAlreadySent && pushStatus === "sent") {
        const { error } = await admin.from("home_visit_notifications").update(pushRow)
          .eq("workspace_id", membership.workspace_id).eq("home_visit_id", assignment.home_visit_id)
          .eq("recipient_user_id", assignment.assigned_user_id).eq("channel", "push")
          .contains("metadata", { assignment_id: assignment.id });
        if (error) throw error;
      }

      return reply({
        ok: true, assignment_saved: true, in_app_saved: inAppSaved,
        push_sent: pushSent, push_attempted: pushAttempted, push_status: pushStatus,
        push_configured: !!(publicVapid && privateVapid),
        message: pushStatus === "sent"
          ? "Asignación guardada y aviso Push enviado."
          : "Asignación guardada. Aviso interno registrado; Push pendiente de configuración o de dispositivo."
      });
    }

    return reply({ error: "Acción no válida" }, 400);
  } catch (e) {
    console.error("[domicilios-notifications]", e);
    return reply({ error: e instanceof Error ? e.message : "Error interno" }, 500);
  }
});