const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const admin   = require('firebase-admin');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Firebase Admin ───────────────────────────────────────── */
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

/* ── CORS ─────────────────────────────────────────────────── */
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = [
      'https://dancestudiomelipilla.com',
      'https://www.dancestudiomelipilla.com',
      'https://mydsm-backend-web-production.up.railway.app',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];
    if (allowed.includes(origin)) return callback(null, true);
    console.warn('[CORS] Bloqueado:', origin);
    callback(new Error('No permitido por CORS: ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.options('*', cors());
app.use(express.json());

/* ── Health check ─────────────────────────────────────────── */
app.get('/', (_req, res) => {
  res.json({ status: 'ok', app: 'DSM Backend', ts: new Date().toISOString() });
});

/* ────────────────────────────────────────────────────────────
   BREVO — envío de email transaccional
   ──────────────────────────────────────────────────────────── */
async function sendBrevoEmail({ toEmail, toName, subject, htmlContent }) {
  if (!process.env.BREVO_API_KEY) {
    console.warn('[brevo] BREVO_API_KEY no configurada — email no enviado');
    return;
  }
  try {
    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender:      { name: 'Dance Studio Melipilla', email: 'dancestudiomelipilla@gmail.com' },
        to:          [{ email: toEmail, name: toName || toEmail }],
        subject,
        htmlContent,
      },
      {
        headers: {
          'api-key':      process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[brevo] Email enviado a ${toEmail} — "${subject}"`);
  } catch (err) {
    console.error('[brevo] Error al enviar email:', err?.response?.data || err.message);
  }
}

/* Plantillas HTML ─────────────────────────────────────────── */
function emailMatricula({ nombre, planName, total }) {
  const planLine = planName
    ? `<tr><td style="padding:4px 0;color:#d4b0ff;font-size:14px;">📚 Plan incluido: <strong>${planName}</strong></td></tr>`
    : '';
  const totalStr = total ? `$${Number(total).toLocaleString('es-CL')} CLP` : '';
  const waMsg    = encodeURIComponent(`¡Hola DSM! Ya me registré en la app. Mi nombre es ${nombre} 🎉`);
  const waUrl    = `https://wa.me/56982688479?text=${waMsg}`;

  const step = (num, icon, title, body) => `
    <tr>
      <td style="padding:0 0 14px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid rgba(160,0,255,0.2);border-radius:14px;overflow:hidden;">
          <tr>
            <td width="64" style="background:rgba(160,0,255,0.15);padding:18px 0;text-align:center;vertical-align:middle;">
              <span style="font-size:22px;font-weight:900;color:#b060ff;font-family:'Segoe UI',Arial,sans-serif;">${num}</span>
            </td>
            <td width="1" style="background:rgba(160,0,255,0.2);padding:0;"></td>
            <td width="52" style="padding:18px 0;text-align:center;vertical-align:middle;">
              <span style="font-size:22px;line-height:1;">${icon}</span>
            </td>
            <td style="padding:14px 18px 14px 4px;vertical-align:middle;">
              <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#fff;">${title}</p>
              <p style="margin:0;font-size:13px;color:#aaa;line-height:1.5;">${body}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#141414;border-radius:20px;overflow:hidden;border:1px solid rgba(160,0,255,0.25);">
        <tr>
          <td style="background:linear-gradient(135deg,#6600cc 0%,#a000ff 50%,#cc00aa 100%);padding:44px 32px 36px;text-align:center;">
            <p style="margin:0 0 6px;font-size:11px;color:rgba(255,255,255,0.65);letter-spacing:3px;text-transform:uppercase;font-weight:600;">Dance Studio Melipilla</p>
            <h1 style="margin:0 0 10px;font-size:32px;font-weight:900;color:#fff;line-height:1.15;">¡Matrícula confirmada! 🎉</h1>
            <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.8);">Tu pago fue aprobado — ¡bienvenid@ a la familia!</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 0;">
            <p style="margin:0 0 24px;font-size:16px;color:#e0e0e0;line-height:1.65;">
              Hola <strong style="color:#c880ff;">${nombre}</strong>, tu inscripción quedó registrada oficialmente. A continuación te contamos los pasos que debes seguir:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(160,0,255,0.08);border:1px solid rgba(160,0,255,0.22);border-radius:14px;margin:0 0 28px;">
              <tr><td style="padding:18px 22px;">
                <p style="margin:0 0 10px;font-size:11px;color:#9955ff;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Resumen de tu inscripción</p>
                <table cellpadding="0" cellspacing="0">
                  <tr><td style="padding:3px 0;color:#e0e0e0;font-size:14px;">✅ Matrícula 2do Semestre 2026</td></tr>
                  ${planLine}
                  ${totalStr ? `<tr><td style="padding:10px 0 0;color:#fff;font-size:17px;font-weight:800;">Total pagado: ${totalStr}</td></tr>` : ''}
                </table>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 16px;">
            <p style="margin:0;font-size:11px;color:#9955ff;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Paso a paso — ¿Qué sigue ahora?</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${step('01','✅','Tu pago está confirmado','No necesitas hacer nada más con el pago. ¡Ya quedaste inscrit@!')}
              ${step('02','📲','Descarga la app de alumn@s','Entra a dancestudiomelipilla.app y descarga la aplicación.')}
              ${step('03','👤','Regístrate con tus datos','Crea tu cuenta usando los mismos datos con los que te matriculaste.')}
              ${step('04','💬','Avisanos cuando te hayas registrado','Escríbenos por WhatsApp una vez que hayas creado tu cuenta en la app.')}
              ${step('05','🏆','¡Listo! Accede a tu plan','Aceptaremos tu ingreso y podrás ver tu plan y tus clases reflejadas.')}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 36px;text-align:center;">
            <p style="margin:0 0 18px;font-size:14px;color:#999;">¿Tienes alguna duda? Estamos disponibles para ayudarte.</p>
            <table cellpadding="0" cellspacing="0" align="center"><tr><td>
              <a href="${waUrl}" style="display:inline-block;background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:15px 32px;border-radius:999px;letter-spacing:0.3px;">
                💬 Escribirnos por WhatsApp
              </a>
            </td></tr></table>
            <p style="margin:14px 0 0;font-size:12px;color:#555;">Se abrirá un chat con un mensaje listo para enviar.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(160,0,255,0.3),transparent);"></div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;text-align:center;">
            <p style="margin:0 0 4px;font-size:13px;color:#a060ff;font-style:italic;">¡Gracias por ser parte de Dance Studio Melipilla! 🩷</p>
            <p style="margin:6px 0 0;font-size:11px;color:#444;">dancestudiomelipilla.com · Melipilla, Región Metropolitana</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function emailPromo({ nombre, promoTitle, price }) {
  const priceStr = price ? `$${Number(price).toLocaleString('es-CL')} CLP` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#141414;border-radius:20px;overflow:hidden;border:1px solid rgba(160,0,255,0.25);">
        <tr>
          <td style="background:linear-gradient(135deg,#a000ff,#ff00cc);padding:40px 32px;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.75);letter-spacing:2px;text-transform:uppercase;">Dance Studio Melipilla</p>
            <h1 style="margin:0;font-size:28px;font-weight:900;color:#fff;line-height:1.2;">¡Inscripción confirmada! 🔥</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px;">
            <p style="margin:0 0 20px;font-size:16px;color:#e0e0e0;line-height:1.6;">
              Hola <strong style="color:#fff;">${nombre}</strong>,<br>
              tu pago fue aprobado y quedaste inscrit@ en la promoción. ¡Nos alegra tenerte con nosotros!
            </p>
            <div style="background:rgba(255,0,204,0.07);border:1px solid rgba(255,0,204,0.2);border-radius:14px;padding:20px 24px;margin:0 0 24px;">
              <p style="margin:0 0 10px;font-size:12px;color:#ff66dd;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Detalle de tu promoción</p>
              <p style="margin:0 0 6px;color:#e0e0e0;font-size:16px;font-weight:700;">🎯 ${promoTitle}</p>
              ${priceStr ? `<p style="margin:10px 0 0;color:#fff;font-size:18px;font-weight:800;">Total pagado: ${priceStr}</p>` : ''}
            </div>
            <p style="margin:0 0 12px;font-size:15px;color:#c0c0c0;line-height:1.6;">
              Pronto nos comunicaremos contigo para coordinar los detalles de inicio.
            </p>
            <p style="margin:0 0 28px;font-size:15px;color:#c0c0c0;line-height:1.6;">
              ¿Tienes alguna pregunta? Escríbenos por WhatsApp y te respondemos al tiro.
            </p>
            <table cellpadding="0" cellspacing="0"><tr><td>
              <a href="https://wa.me/56982688479" style="display:inline-block;background:linear-gradient(135deg,#a000ff,#ff00cc);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;">
                Escribirnos por WhatsApp
              </a>
            </td></tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
            <p style="margin:0;font-size:12px;color:#555;">Dance Studio Melipilla · Melipilla, Región Metropolitana</p>
            <p style="margin:6px 0 0;font-size:12px;color:#555;">dancestudiomelipilla.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ────────────────────────────────────────────────────────────
   POST /crear-preferencia
   ──────────────────────────────────────────────────────────── */
app.post('/crear-preferencia', async (req, res) => {
  try {
    const { tipo, docId, nombre, email, descripcion, monto } = req.body;

    if (!tipo || !docId || !monto) {
      return res.status(400).json({ error: 'Faltan campos: tipo, docId, monto' });
    }

    const colMap = {
      enrollment: 'enrollments',
      lead:       'leads',
      matricula:  'enrollments',
      plan:       'enrollments',
    };
    const coleccion = colMap[tipo] || 'enrollments';

    const frontendUrl = process.env.FRONTEND_URL || 'https://www.dancestudiomelipilla.com';
    const notifUrl    = (process.env.RAILWAY_URL  || 'https://mydsm-backend-web-production.up.railway.app') + '/webhook-mp';

    const preference = {
      items: [{
        id:          `DSM-${tipo.toUpperCase()}-${docId}`,
        title:       descripcion || 'Dance Studio Melipilla',
        description: 'Inscripción en Dance Studio Melipilla',
        category_id: 'services',
        quantity:    1,
        unit_price:  Number(monto),
        currency_id: 'CLP',
      }],
      ...(email ? { payer: { email, ...(nombre ? { name: nombre } : {}) } } : {}),
      external_reference: JSON.stringify({ tipo, docId, coleccion }),
      back_urls: {
        success: `${frontendUrl}/pago-exitoso`,
        failure: `${frontendUrl}/pago-fallido`,
        pending: `${frontendUrl}/pago-pendiente`,
      },
      auto_return:          'approved',
      notification_url:     notifUrl,
      statement_descriptor: 'DANCE STUDIO',
    };

    const mpRes = await axios.post(
      'https://api.mercadopago.com/checkout/preferences',
      preference,
      {
        headers: {
          Authorization:  `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const { id: preferenceId, init_point, sandbox_init_point } = mpRes.data;

    await db.collection(coleccion).doc(docId).update({ preferenceId, status: 'pending' });

    console.log(`[crear-preferencia] ${coleccion}/${docId} → ${preferenceId}`);
    res.json({ init_point, sandbox_init_point, preferenceId });

  } catch (err) {
    console.error('[crear-preferencia]', err?.response?.data || err.message);
    res.status(500).json({ error: 'Error al crear preferencia en Mercado Pago' });
  }
});

/* ────────────────────────────────────────────────────────────
   POST /webhook-mp
   ──────────────────────────────────────────────────────────── */
app.post('/webhook-mp', async (req, res) => {
  res.sendStatus(200);

  try {
    const { type, data } = req.body;
    if (type !== 'payment') return;

    const paymentId = data?.id;
    if (!paymentId) return;

    const mpRes = await axios.get(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    );

    const { status: mpStatus, external_reference } = mpRes.data;
    console.log(`[webhook-mp] payment ${paymentId} → ${mpStatus}`);

    let meta = {};
    try { meta = JSON.parse(external_reference || '{}'); } catch (_) {}

    const { coleccion, docId } = meta;
    if (!coleccion || !docId) {
      console.warn('[webhook-mp] Sin coleccion/docId en metadata');
      return;
    }

    const statusMap = {
      approved:   'paid',
      rejected:   'rejected',
      pending:    'pending',
      in_process: 'pending',
    };

    await db.collection(coleccion).doc(docId).update({
      status:    statusMap[mpStatus] || mpStatus,
      paymentId: String(paymentId),
      mpStatus,
      paidAt:    mpStatus === 'approved' ? admin.firestore.FieldValue.serverTimestamp() : null,
    });

    console.log(`[webhook-mp] ${coleccion}/${docId} → ${statusMap[mpStatus]}`);

    if (mpStatus === 'approved') {
      const snap = await db.collection(coleccion).doc(docId).get();
      const doc  = snap.data() || {};

      const toEmail = doc.email;
      const toName  = doc.name || doc.nombre || '';

      if (toEmail) {
        if (coleccion === 'enrollments') {
          await sendBrevoEmail({
            toEmail,
            toName,
            subject: '¡Tu matrícula en Dance Studio Melipilla está confirmada! 🎉',
            htmlContent: emailMatricula({
              nombre:   toName || 'alumno/a',
              planName: doc.planName || null,
              total:    doc.total   || null,
            }),
          });
        } else if (coleccion === 'leads') {
          await sendBrevoEmail({
            toEmail,
            toName,
            subject: `¡Tu inscripción en "${doc.promoTitle || 'la promoción'}" está confirmada! 🔥`,
            htmlContent: emailPromo({
              nombre:     toName || 'alumno/a',
              promoTitle: doc.promoTitle || 'Promoción DSM',
              price:      doc.price     || null,
            }),
          });
        }
      } else {
        console.warn(`[webhook-mp] Doc ${coleccion}/${docId} no tiene email — no se envió correo`);
      }
    }

  } catch (err) {
    console.error('[webhook-mp]', err?.response?.data || err.message);
  }
});

/* ────────────────────────────────────────────────────────────
   DANCITO — Chatbot con Gemini
   ──────────────────────────────────────────────────────────── */
const DANCITO_SYSTEM_PROMPT = `
═══════════════════════════════════════
IDENTIDAD
═══════════════════════════════════════
- Tu nombre es Dancito, el asistente de Dance Studio Melipilla (DSM).
- NUNCA digas que eres una IA, un bot o un asistente virtual. Eres Dancito.
- Habla siempre en primera persona: "Yo te puedo ayudar con eso", "Te cuento que...".

═══════════════════════════════════════
REGLAS DE COMUNICACIÓN
═══════════════════════════════════════
1. TONO: Amable, cercano, entusiasta y profesional. Usa un tono chileno natural y fresco (puedes decir "súper", "genial", "buenísimo"). Usa máximo 1-2 emojis por mensaje.
2. BREVEDAD: Mensajes cortos y directos. Máximo 3-4 líneas por párrafo. Usa viñetas cuando listes cosas.
3. PERSONALIZACIÓN: Una vez que el cliente diga su nombre, úsalo durante toda la conversación para que se sienta más cercano.
4. GÉNERO: Si el cliente dijo su nombre, adapta el género en tus respuestas (ej: "bienvenida" si es mujer, "bienvenido" si es hombre). Si no sabes el género, usa formas neutras.
5. HONESTIDAD TOTAL: SOLO puedes decir cosas que estén en esta guía. Si no sabes algo o no está en la guía, NUNCA inventes. Deriva siempre a un miembro de DSM por WhatsApp.
6. NUNCA menciones precios, horarios o información que no esté en esta guía.
7. CUALQUIER DUDA QUE NO PUEDAS RESOLVER o que requiera completar un trámite (matrícula, pagos, reclamos, cambios de plan, etc.) debe cerrarse SIEMPRE ofreciendo el botón de WhatsApp (ver sección "DERIVACIÓN A WHATSAPP").

═══════════════════════════════════════
FLUJO DE BIENVENIDA (primera vez que escribe)
═══════════════════════════════════════
Cuando alguien escribe por primera vez, saluda así:
"¡Hola! Soy Dancito 🎵, el asistente oficial de Dance Studio Melipilla. ¡Bienvenido/a! ¿Con quién tengo el gusto de hablar?"

Cuando el cliente responda con su nombre (ej: "María"):
"¡Qué gusto [nombre]! 😊 ¿Estás buscando clases para ti o para un niño/a?"

Y de ahí sigue el flujo normal según su respuesta.

═══════════════════════════════════════
BASE DE CONOCIMIENTO COMPLETA
═══════════════════════════════════════

📍 UBICACIÓN Y CONTACTO:
- Dirección: Ortúzar 34, Melipilla
- Sitio web: www.dancestudiomelipilla.com
- Instagram: @dancestudiomelipilla

💳 MATRÍCULA:
- Valor matrícula anual: $10.000 (se paga UNA sola vez al año)
- Al estar matriculado se accede a valor preferencial en los planes
- Después de la matrícula, solo se paga el plan mensual elegido

🔥 OFERTA COMBO — Matrícula + Plan Básico:
- Matrícula + Plan Básico (4 clases al mes) por $25.000 en total
- Es más conveniente que pagar matrícula y plan por separado ($10.000 + $17.000 = $27.000)
- Ofrece este combo cuando alguien pregunte por matricularse o por precios, si le interesa el Plan Básico

💰 CLASES SUELTAS (sin plan):
- Con matrícula: $5.000 por clase
- Sin matrícula: $6.000 por clase
- Nota: Pagar un plan mensual sale MUCHO más económico que pagar clases sueltas

📦 PLANES MENSUALES 2026:
- Plan Básico: $17.000/mes → 4 clases (1 clase/semana)
- Plan Pro: $31.000/mes → 8 clases (2 clases/semana)
- Plan Full: $45.000/mes → Clases ilimitadas (3+ clases/semana)
- IMPORTANTE: Los planes duran exactamente 1 mes desde la fecha de compra, NO por mes calendario
- Todas las clases duran 1 hora desde su inicio

🏢 ARRIENDO DE SALA:
- Valor: $10.000 por hora

💵 MÉTODOS DE PAGO (solo presencial):
- Efectivo
- Transferencia bancaria
- Tarjeta de débito / crédito

👕 UNIFORMES Y BUZOS:
- Se hacen por encargo en fechas específicas definidas por la administración
- Los detalles de fechas, valores y pedidos se informan SOLO por el grupo oficial de WhatsApp
- Si preguntan por uniformes: "Los buzos se hacen por encargo en fechas específicas. Toda la info se coordina por nuestro grupo oficial de WhatsApp. ¿Quieres que un agente te agregue al grupo?" (y ofrece el botón de WhatsApp)

📅 HORARIO COMPLETO 2026:

LUNES:
- Urban Dance (9 a 13 años) → 17:00 hrs con Fer
- Folklore (todas las edades) → 18:00 hrs con Pía
- Jazz Fusión (todas las edades) → 19:00 hrs con Pía

MARTES:
- Urban Kids (5 a 8 años) → 17:00 hrs con Anto
- Reggaetón (desde 12 años) → 18:00 hrs con Tomy
- Crew Pre Juvenil (SELECCIONADOS) → 19:00 hrs con Fer

MIÉRCOLES:
- Heels Dance (desde 12 años) → 18:00 hrs con Noe
- Formativo Urbano (desde 12 años) → 19:00 hrs con Simon

JUEVES:
- Danza Árabe (todas las edades) → 18:00 hrs con Viviana
- Bachata Ladies (todas las edades) → 19:00 hrs con Andrea

VIERNES:
- Crew Infantil (SELECCIONADOS) → 17:00 hrs con Fer
- Urban Dance (9 a 13 años) → 18:00 hrs con Fer
- Reggaetón Multinivel (desde 12 años) → 19:00 hrs con Fer

SÁBADO:
- Bachata Ladies (todas las edades) → 10:30 hrs con Andrea
- Ballet Infantil (5 a 12 años) → 11:30 hrs con Pía
- Urban Kids Mixto (5 a 12 años) → 12:30 hrs con Anto
- K-Pop Competencia (SELECCIONADOS) → 13:30 hrs con Pao
- K-Pop (desde 8 años) → 14:30 hrs con Pao
- Crew Juvenil I (SELECCIONADOS) → 15:30 hrs con Noe
- Reggaetón Básico (desde 12 años) → 16:30 hrs con Tomy
- Clase de Coreográfico (SELECCIONADOS) → 17:30 hrs con Chio

⚠️ CLASES "SELECCIONADOS": Son exclusivas para alumnos ya inscritos que fueron seleccionados por los profesores. NO se puede inscribir directamente en ellas desde afuera.

⚠️ Comercial Dance ya NO está disponible — no ofrezcas esta clase bajo ninguna circunstancia.

═══════════════════════════════════════
GESTIÓN DE VENTAS Y FLUJO DE CONVERSACIÓN
═══════════════════════════════════════

FLUJO PRINCIPAL — Cuando alguien llega preguntando por clases:
1. Saluda calurosamente y pregunta: "¡Hola! Bienvenido/a a Dance Studio Melipilla 🎉 ¿Las clases serían para ti o para un niño/a?"
2. Si es para un niño/a → pregunta la edad exacta antes de recomendar nada.
3. Si es para adulto → pregunta qué estilo le llama más la atención.
4. Recomienda SOLO clases disponibles según edad (ver tabla abajo).
5. Cierra siempre con una pregunta para mantener la conversación activa.

TABLA DE RECOMENDACIÓN POR EDAD:
- 5 a 8 años → Urban Kids (Mar 17hrs con Anto), Urban Kids Mixto (Sáb 12:30hrs)
- 5 a 12 años → Ballet Infantil (Sáb 11:30hrs)
- 8 años en adelante → K-Pop (Sáb 14:30hrs)
- 9 a 13 años → Urban Dance (Lun 17hrs, Vie 18hrs)
- 12 años en adelante → Reggaetón (Mar), Formativo Urbano (Mié), Heels Dance (Mié), Reggaetón Multinivel (Vie), Reggaetón Básico (Sáb)
- Todas las edades → Folklore (Lun 18hrs), Jazz Fusión (Lun 19hrs), Danza Árabe (Jue 18hrs), Bachata Ladies (Jue 19hrs con Andrea, Sáb 10:30hrs con Andrea)

REGLAS DE RECOMENDACIÓN:
- NUNCA recomiendes clases "SELECCIONADOS" a alguien que viene desde afuera.
- NUNCA ofrezcas Comercial Dance, ya no existe.
- Si la persona tiene múltiples opciones, muéstralas todas y pregunta cuál horario le acomoda mejor.
- Si la persona no encaja en ninguna clase disponible (ej: niño de 3 años), dile amablemente: "Por el momento nuestras clases parten desde los 5 años. ¡Pero si quieres te aviso cuando abramos algo para esa edad! ¿Te gustaría que un agente te contacte?" (y ofrece el botón de WhatsApp)
- Si preguntan por un estilo específico que no está en el horario, di que no tienes ese estilo disponible actualmente y ofrece alternativas similares.

FLUJO DE PRECIOS:
- Si preguntan solo por precio, da los planes y luego pregunta: "¿Para qué edad sería? Así te digo exactamente qué clases puedes tomar con ese plan 😊"
- Siempre recuerda mencionar que el plan mensual es mucho más económico que pagar clases sueltas.
- Recuerda que la matrícula es anual ($10.000) y se paga solo una vez al año.
- Si el interés apunta al Plan Básico, SIEMPRE menciona el combo de Matrícula + Plan Básico por $25.000 — es una mejor oferta que pagarlos por separado.

CIERRE DE VENTA Y MATRÍCULA:

IMPORTANTE — No lances el link de matrícula de inmediato. Mucha gente dice "quiero matricularme" sin saber exactamente qué es la matrícula. Primero asegúrate de que entiendan bien qué están comprando.

FLUJO CORRECTO cuando alguien menciona matrícula o inscripción por primera vez:
1. Confirma que entiende qué incluye: "¡Genial [nombre]! La matrícula es anual, vale $10.000 y se paga solo una vez al año. Con ella accedes a valor preferencial en todos los planes mensuales 😊 ¿Ya tienes claro qué clases te interesan?"
2. Si aún no sabe qué clases quiere → guíalo primero por el horario y edad.
3. Si ya sabe qué clases quiere y confirma que quiere matricularse → ahí sí envía el link de matrícula (ver abajo) o, si prefiere coordinarlo directamente, ofrece el botón de WhatsApp.

SEÑALES DE QUE ESTÁ LISTO/A para recibir el link:
- Confirma la clase o plan que quiere
- Pregunta cómo pagar o cómo concretar
- Dice algo como "dale", "ok me inscribo", "cómo lo hago", "quiero empezar"

Cuando esté listo/a, envía este mensaje:
"¡Perfecto [nombre]! Puedes hacer tu matrícula directamente aquí 👉 https://www.dancestudiomelipilla.com/#matricula — o si prefieres, también puedes venir a Ortúzar 34 con efectivo, transferencia o tarjeta. ¡Te esperamos! 🎉"

Si dudan por precio: recuérdales que el plan mensual sale mucho más conveniente que pagar clases sueltas, que la matrícula se paga solo una vez al año, y que existe el combo Matrícula + Plan Básico por $25.000.

═══════════════════════════════════════
DERIVACIÓN A WHATSAPP
═══════════════════════════════════════
Ofrece el botón de WhatsApp (nunca inventes un número, siempre usa el oficial registrado) en estos casos:
- No sabes la respuesta o no está en esta guía.
- El cliente necesita completar un trámite que tú no puedes resolver directamente (ej: matrícula ya en curso, pagos con problemas, cambios de plan, cambios de horario, reclamos).
- El cliente pide hablar con una persona.
- Cualquier tema de la sección "TEMAS FUERA DE TU ALCANCE".

Frase para ofrecer el botón: "Te dejo el botón para que hables directo con nuestro equipo por WhatsApp y te ayuden con eso 👇"

═══════════════════════════════════════
TEMAS FUERA DE TU ALCANCE
═══════════════════════════════════════
No respondas ni inventes información sobre:
- Convenios o descuentos con otras empresas
- Clases de prueba gratuitas (a menos que DSM lo indique)
- Descuentos especiales distintos al combo Matrícula + Plan Básico
- Información de profesores más allá de su nombre
- Cualquier otra cosa no listada aquí

En esos casos, responde adaptando el género si conoces el nombre, y SIEMPRE ofrece el botón de WhatsApp:
- Si es mujer: "¡Buena pregunta [nombre]! Eso no lo manejo yo directamente, pero no te preocupes — te dejo el botón para que hables con un miembro de DSM por WhatsApp y te ayude con eso 😊"
- Si es hombre: "¡Buena pregunta [nombre]! Eso no lo manejo yo directamente, pero no te preocupes — te dejo el botón para que hables con un miembro de DSM por WhatsApp y te ayude con eso 😊"
- Si no sabes el nombre/género: "¡Buena pregunta! Eso no lo manejo yo directamente, pero no te preocupes — te dejo el botón para que hables con un miembro de DSM por WhatsApp y te ayude con eso 😊"

═══════════════════════════════════════
PROTOCOLO HUMANO DIRECTO
═══════════════════════════════════════
Si el cliente pide hablar con una persona, tiene un reclamo o problema con su cuenta, responde adaptando el género y SIEMPRE ofrece el botón de WhatsApp:
- Si es mujer: "Entiendo perfectamente [nombre]. Te dejo el botón para que hables directo con nuestro equipo por WhatsApp. ¡Te van a ayudar enseguida! 😊"
- Si es hombre: "Entiendo perfectamente [nombre]. Te dejo el botón para que hables directo con nuestro equipo por WhatsApp. ¡Te van a ayudar enseguida! 😊"
- Si no sabes: "Entiendo perfectamente. Te dejo el botón para que hables directo con nuestro equipo por WhatsApp. ¡Te van a ayudar enseguida! 😊"
`;

app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Falta el campo messages' });
    }

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));

    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        systemInstruction: { parts: [{ text: DANCITO_SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 350 },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const reply = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Perdona, no te entendí bien. ¿Puedes reformular tu pregunta?';

    res.json({ reply });

  } catch (err) {
    console.error('[chat] status:', err?.response?.status);
    console.error('[chat] data:', JSON.stringify(err?.response?.data));
    console.error('[chat] message:', err.message);
    res.status(500).json({ error: 'Error al procesar el mensaje' });
  }
});

/* ── Start ────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`🚀 DSM Backend corriendo en puerto ${PORT}`);
});
