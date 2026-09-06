const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const admin   = require('firebase-admin');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Firebase Admin ───────────────────────────────────────── */
admin.initializeApp({
  credential: admin.credential.cert({
    type:           'service_account',
    project_id:     process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key:    (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    client_email:   process.env.FIREBASE_CLIENT_EMAIL,
    client_id:      process.env.FIREBASE_CLIENT_ID,
    auth_uri:       'https://accounts.google.com/o/oauth2/auth',
    token_uri:      'https://oauth2.googleapis.com/token',
  }),
});
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
            <!-- Número -->
            <td width="64" style="background:rgba(160,0,255,0.15);padding:18px 0;text-align:center;vertical-align:middle;">
              <span style="font-size:22px;font-weight:900;color:#b060ff;font-family:'Segoe UI',Arial,sans-serif;">${num}</span>
            </td>
            <!-- Separador -->
            <td width="1" style="background:rgba(160,0,255,0.2);padding:0;"></td>
            <!-- Icono -->
            <td width="52" style="padding:18px 0;text-align:center;vertical-align:middle;">
              <span style="font-size:22px;line-height:1;">${icon}</span>
            </td>
            <!-- Texto -->
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

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:linear-gradient(135deg,#6600cc 0%,#a000ff 50%,#cc00aa 100%);padding:44px 32px 36px;text-align:center;">
            <p style="margin:0 0 6px;font-size:11px;color:rgba(255,255,255,0.65);letter-spacing:3px;text-transform:uppercase;font-weight:600;">Dance Studio Melipilla</p>
            <h1 style="margin:0 0 10px;font-size:32px;font-weight:900;color:#fff;line-height:1.15;">¡Matrícula confirmada! 🎉</h1>
            <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.8);">Tu pago fue aprobado — ¡bienvenid@ a la familia!</p>
          </td>
        </tr>

        <!-- ── SALUDO + RESUMEN ── -->
        <tr>
          <td style="padding:32px 32px 0;">
            <p style="margin:0 0 24px;font-size:16px;color:#e0e0e0;line-height:1.65;">
              Hola <strong style="color:#c880ff;">${nombre}</strong>, tu inscripción quedó registrada oficialmente. A continuación te contamos los pasos que debes seguir:
            </p>

            <!-- Resumen pago -->
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

        <!-- ── TÍTULO PASOS ── -->
        <tr>
          <td style="padding:0 32px 16px;">
            <p style="margin:0;font-size:11px;color:#9955ff;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Paso a paso — ¿Qué sigue ahora?</p>
          </td>
        </tr>

        <!-- ── PASOS ── -->
        <tr>
          <td style="padding:0 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${step('01','✅','Tu pago está confirmado','No necesitas hacer nada más con el pago. ¡Ya quedaste inscrit@!')}
              ${step('02','📲','Descarga la app de alumn@s','Entra a <a href="https://www.dancestudiomelipilla.app" style="color:#b060ff;text-decoration:none;font-weight:600;">www.dancestudiomelipilla.app</a> y descarga la aplicación.')}
              ${step('03','👤','Regístrate con tus datos','Crea tu cuenta usando los mismos datos con los que te matriculaste.')}
              ${step('04','💬','Avisanos cuando te hayas registrado','Escríbenos por WhatsApp una vez que hayas creado tu cuenta en la app.')}
              ${step('05','🏆','¡Listo! Accede a tu plan','Aceptaremos tu ingreso y podrás ver tu plan y tus clases reflejadas.')}
            </table>
          </td>
        </tr>

        <!-- ── CTA WHATSAPP ── -->
        <tr>
          <td style="padding:28px 32px 36px;text-align:center;">
            <p style="margin:0 0 18px;font-size:14px;color:#999;">¿Tienes alguna duda? Estamos disponibles para ayudarte.</p>
            <table cellpadding="0" cellspacing="0" align="center"><tr><td>
              <a href="${waUrl}"
                 style="display:inline-block;background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:15px 32px;border-radius:999px;letter-spacing:0.3px;">
                💬 Escribirnos por WhatsApp
              </a>
            </td></tr></table>
            <p style="margin:14px 0 0;font-size:12px;color:#555;">Se abrirá un chat con un mensaje listo para enviar.</p>
          </td>
        </tr>

        <!-- ── DIVISOR ── -->
        <tr>
          <td style="padding:0 32px;">
            <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(160,0,255,0.3),transparent);"></div>
          </td>
        </tr>

        <!-- ── FOOTER ── -->
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

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#a000ff,#ff00cc);padding:40px 32px;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.75);letter-spacing:2px;text-transform:uppercase;">Dance Studio Melipilla</p>
            <h1 style="margin:0;font-size:28px;font-weight:900;color:#fff;line-height:1.2;">¡Inscripción confirmada! 🔥</h1>
          </td>
        </tr>

        <!-- Contenido -->
        <tr>
          <td style="padding:36px 32px;">
            <p style="margin:0 0 20px;font-size:16px;color:#e0e0e0;line-height:1.6;">
              Hola <strong style="color:#fff;">${nombre}</strong>,<br>
              tu pago fue aprobado y quedaste inscrit@ en la promoción. ¡Nos alegra tenerte con nosotros!
            </p>

            <!-- Resumen -->
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

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0"><tr><td>
              <a href="https://wa.me/56912345678" style="display:inline-block;background:linear-gradient(135deg,#a000ff,#ff00cc);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;">
                Escribirnos por WhatsApp
              </a>
            </td></tr></table>
          </td>
        </tr>

        <!-- Footer -->
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
        description: `Inscripción en Dance Studio Melipilla`,
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

    /* ── Enviar email de confirmación vía Brevo ── */
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

/* ── Start ────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`🚀 DSM Backend corriendo en puerto ${PORT}`);
});
