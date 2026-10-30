const crypto  = require('crypto');
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

function emailGala({ nombre, disciplinas, tipoPago, pagado, saldo }) {
  const fmt = n => `$${Number(n).toLocaleString('es-CL')} CLP`;
  const lista = (items) => items.map(t => `<tr><td style="padding:3px 0;color:#e0e0e0;font-size:14px;">&#9670;&nbsp; ${t}</td></tr>`).join('');
  const filas = disciplinas.map(d => `<tr><td style="padding:3px 0;color:#fff;font-size:15px;font-weight:700;">${d}</td></tr>`).join('');
  const modalidad = tipoPago === 'completo' ? 'Pago completo' : 'Pago en 2 partes';
  const saldoBloque = saldo > 0
    ? `<tr><td style="padding:10px 0 0;color:#ffd98a;font-size:14px;">Saldo pendiente: <strong>${fmt(saldo)}</strong> &middot; segunda cuota el <strong>5 de diciembre de 2026</strong></td></tr>`
    : '';
  const waUrl = 'https://wa.me/56982688479?text=' + encodeURIComponent(`Hola DSM, soy ${nombre} y tengo una consulta sobre mi inscripcion a la gala.`);

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b0414;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0414;padding:40px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#150727;border-radius:20px;overflow:hidden;border:1px solid rgba(230,195,106,0.4);">
        <tr>
          <td style="background:linear-gradient(135deg,#3b146e 0%,#7b2cbf 55%,#d11aa8 100%);padding:40px 28px 34px;text-align:center;">
            <p style="margin:0 0 8px;font-size:11px;color:#e6c36a;letter-spacing:4px;text-transform:uppercase;font-weight:700;">Dance Studio Melipilla</p>
            <h1 style="margin:0 0 8px;font-size:30px;font-weight:900;color:#ffe9a0;letter-spacing:1px;">THE CIRCUS DANCE</h1>
            <p style="margin:0;font-size:16px;color:#fff;">Tu inscripci&oacute;n est&aacute; confirmada</p>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 28px 6px;">
            <p style="margin:0 0 20px;font-size:16px;color:#e8dcff;line-height:1.6;">
              Hola <strong style="color:#ffe9a0;">${nombre}</strong>, recibimos tu pago y ya eres parte del espect&aacute;culo.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(230,195,106,0.07);border:1px solid rgba(230,195,106,0.3);border-radius:14px;margin:0 0 22px;">
              <tr><td style="padding:18px 20px;">
                <p style="margin:0 0 8px;font-size:11px;color:#e6c36a;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Disciplinas inscritas</p>
                <table cellpadding="0" cellspacing="0">${filas}</table>
                <p style="margin:16px 0 6px;font-size:11px;color:#e6c36a;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Pago</p>
                <table cellpadding="0" cellspacing="0">
                  <tr><td style="padding:2px 0;color:#e0e0e0;font-size:14px;">${modalidad}</td></tr>
                  <tr><td style="padding:2px 0;color:#fff;font-size:17px;font-weight:800;">Pagado: ${fmt(pagado)}</td></tr>
                  ${saldoBloque}
                </table>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 8px;">
            <p style="margin:0 0 8px;font-size:11px;color:#e6c36a;letter-spacing:2px;text-transform:uppercase;font-weight:700;">La inscripci&oacute;n incluye</p>
            <table cellpadding="0" cellspacing="0">${lista([
              'Participaci&oacute;n en la gala',
              'Reconocimientos',
              'Fotos y video generales de cada disciplina',
              'Fotos individuales o grupales en alfombra roja',
              'Ensayo general',
            ])}</table>
            <p style="margin:16px 0 8px;font-size:11px;color:#ff9aab;letter-spacing:2px;text-transform:uppercase;font-weight:700;">No incluye</p>
            <table cellpadding="0" cellspacing="0">${lista(['Vestuario', 'Clases'])}</table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px 8px;">
            <p style="margin:0;font-size:13px;color:#b9a8d6;line-height:1.6;">
              Fecha l&iacute;mite de devoluci&oacute;n: <strong style="color:#fff;">9 de noviembre de 2026</strong>. Despu&eacute;s de esta fecha no hay reembolsos por retiro voluntario del alumno.
              Te contactaremos por WhatsApp para coordinar los detalles del show.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 28px 34px;text-align:center;">
            <table cellpadding="0" cellspacing="0" align="center"><tr><td>
              <a href="${waUrl}" style="display:inline-block;background:linear-gradient(135deg,#ff2bd6,#7b2cbf);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 30px;border-radius:999px;">
                Escribirnos por WhatsApp
              </a>
            </td></tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;">
            <p style="margin:0;font-size:12px;color:#7d6c99;">Dance Studio Melipilla &middot; Melipilla, Regi&oacute;n Metropolitana &middot; dancestudiomelipilla.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ────────────────────────────────────────────────────────────
   GALA THE CIRCUS DANCE
   Nada se guarda hasta que Mercado Pago aprueba el pago:
   - /crear-preferencia solo valida y crea la preferencia (los datos viajan en external_reference).
   - /webhook-mp crea la inscripción y toma el cupo cuando el pago está aprobado.
   ──────────────────────────────────────────────────────────── */
const GALA_OPEN_AT    = Date.parse('2026-10-29T01:30:00Z'); // 28/10/2026 22:30 Chile
const GALA_CUPOS_MAX  = 20;
const GALA_PRECIOS    = { completo: 15000, parcial: 7500 };
// El orden es parte del trato: el webhook usa la posición. Solo agregar disciplinas AL FINAL.
const GALA_DISCIPLINAS = [
  { id: 'urban_kids',  nombre: 'Urban Kids',      min: 5,  max: 8 },
  { id: 'urban_dance', nombre: 'Urban Dance',     min: 9,  max: 13 },
  { id: 'reggaeton',   nombre: 'Reggaeton',       min: 12, max: null },
  { id: 'danza_arabe', nombre: 'Danza Árabe',     min: 12, max: null },
  { id: 'folklore',    nombre: 'Folklore',        min: 12, max: null },
  { id: 'heels',       nombre: 'Heels',           min: 12, max: null },
  { id: 'kpop',        nombre: 'K-POP',           min: 12, max: null },
  { id: 'ballet',      nombre: 'Ballet Infantil', min: 5,  max: 9 },
  { id: 'jazz_fusion', nombre: 'Jazz Fusión',     min: 12, max: null },
];

async function crearPreferenciaGala(req, res) {
  const { nombre, edad, whatsapp, tipo_pago, disciplinas_ids, descripcion, email } = req.body;

  if (Date.now() < GALA_OPEN_AT) {
    return res.status(403).json({ error: 'inscripciones_cerradas' });
  }

  const monto = GALA_PRECIOS[tipo_pago];
  const nombreOk = String(nombre || '').trim();
  const edadN = Number(edad);
  const wa = String(whatsapp || '').replace(/\D/g, '');
  const correo = String(email || '').trim();
  const idx = Array.isArray(disciplinas_ids)
    ? [...new Set(disciplinas_ids)].map(id => GALA_DISCIPLINAS.findIndex(d => d.id === id))
    : [];

  if (!monto || !nombreOk || !(edadN >= 4 && edadN <= 70) || !/^569\d{8}$/.test(wa) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo) || correo.length > 60 || idx.length === 0 || idx.includes(-1)) {
    return res.status(400).json({ error: 'datos_invalidos' });
  }

  // Cupos: si alguna disciplina ya está llena, no se crea el pago.
  const cupos = await db.getAll(...idx.map(i => db.collection('gala_disciplinas_cupos').doc(GALA_DISCIPLINAS[i].id)));
  const llena = cupos.findIndex(c => c.exists && (c.data().cupos_tomados || 0) >= GALA_CUPOS_MAX);
  if (llena !== -1) {
    return res.status(409).json({ error: 'cupo_completo', disciplina: GALA_DISCIPLINAS[idx[llena]].nombre });
  }

  const docId = crypto.randomBytes(10).toString('hex');
  const frontendUrl = process.env.FRONTEND_URL || 'https://www.dancestudiomelipilla.com';
  const notifUrl    = (process.env.RAILWAY_URL  || 'https://mydsm-backend-web-production.up.railway.app') + '/webhook-mp';

  // external_reference admite 256 caracteres: claves cortas y disciplinas por posición.
  const externalReference = JSON.stringify({
    g: 1,
    d: docId,
    p: tipo_pago === 'completo' ? 'c' : 'p',
    i: idx.join(','),
    e: edadN,
    w: wa,
    m: correo,
    n: nombreOk.slice(0, 70),
  });

  const preference = {
    items: [{
      id:          `DSM-GALA-${docId}`,
      title:       descripcion || 'Gala The Circus Dance',
      description: 'Inscripción gala The Circus Dance',
      category_id: 'services',
      quantity:    1,
      unit_price:  monto,
      currency_id: 'CLP',
    }],
    payer: { email: correo, name: nombreOk },
    external_reference: externalReference,
    back_urls: {
      success: `${frontendUrl}/inscripcion-gala?pago=aprobado`,
      failure: `${frontendUrl}/inscripcion-gala?pago=fallido`,
      pending: `${frontendUrl}/inscripcion-gala?pago=pendiente`,
    },
    auto_return:          'approved',
    notification_url:     notifUrl,
    statement_descriptor: 'DANCE STUDIO',
  };

  const mpRes = await axios.post(
    'https://api.mercadopago.com/checkout/preferences',
    preference,
    { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
  );

  const { id: preferenceId, init_point, sandbox_init_point } = mpRes.data;
  console.log(`[gala] preferencia ${preferenceId} (sin guardar nada hasta que se pague)`);
  return res.json({ init_point, sandbox_init_point, preferenceId });
}

// Crea la inscripción SOLO con pago aprobado. Es idempotente: Mercado Pago puede avisar varias veces.
async function registrarInscripcionGala(meta, paymentId) {
  const disciplinas = String(meta.i || '').split(',').map(n => GALA_DISCIPLINAS[Number(n)]).filter(Boolean);
  if (!meta.d || disciplinas.length === 0) {
    console.warn('[gala] referencia incompleta, no se registró:', JSON.stringify(meta));
    return;
  }

  const tipoPago = meta.p === 'c' ? 'completo' : 'parcial';
  const edad = Number(meta.e);
  const fuera = disciplinas.filter(d => edad < d.min || (d.max !== null && edad > d.max));
  const ref = db.collection('gala_inscripciones').doc(meta.d);
  const cupoRefs = disciplinas.map(d => db.collection('gala_disciplinas_cupos').doc(d.id));

  const resultado = await db.runTransaction(async (tx) => {
    const [ya, ...cupos] = await tx.getAll(ref, ...cupoRefs);
    if (ya.exists) return 'ya-registrada';

    const sobrecupo = [];
    cupoRefs.forEach((cRef, k) => {
      const tomados = cupos[k].exists ? (cupos[k].data().cupos_tomados || 0) : 0;
      if (tomados >= GALA_CUPOS_MAX) sobrecupo.push(disciplinas[k].id);
      tx.set(cRef, { nombre: disciplinas[k].nombre, cupos_tomados: tomados + 1, cupos_max: GALA_CUPOS_MAX }, { merge: true });
    });

    tx.set(ref, {
      nombre:                    meta.n,
      edad,
      disciplinas:               disciplinas.map(d => d.nombre),
      disciplinas_ids:           disciplinas.map(d => d.id),
      disciplina:                disciplinas[0].id,
      whatsapp:                  meta.w,
      email:                     meta.m || null,
      refund_policy_accepted:    true,
      refund_policy_accepted_at: admin.firestore.FieldValue.serverTimestamp(),
      refund_policy_version:     '1.0-2026',
      age_warning:               fuera.length > 0,
      age_warning_disciplinas:   fuera.map(d => d.id),
      tipo_pago:                 tipoPago,
      monto:                     GALA_PRECIOS[tipoPago],
      status:                    tipoPago === 'parcial' ? 'partial_payment' : 'paid',
      paymentId:                 String(paymentId),
      mpStatus:                  'approved',
      paidAt:                    admin.firestore.FieldValue.serverTimestamp(),
      createdAt:                 admin.firestore.FieldValue.serverTimestamp(),
      ...(sobrecupo.length ? { sobrecupo_disciplinas: sobrecupo } : {}),
    });
    return sobrecupo.length ? `registrada-con-sobrecupo:${sobrecupo.join(',')}` : 'registrada';
  });

  console.log(`[gala] ${meta.d} (${meta.n}) → ${resultado}`);

  // Correo de confirmación: solo la primera vez que se registra (no si Mercado Pago avisa de nuevo).
  if (meta.m && resultado.startsWith('registrada')) {
    const monto = GALA_PRECIOS[tipoPago];
    await sendBrevoEmail({
      toEmail: meta.m,
      toName:  meta.n,
      subject: 'Tu inscripción a THE CIRCUS DANCE está confirmada',
      htmlContent: emailGala({
        nombre:      meta.n,
        disciplinas: disciplinas.map(d => d.nombre),
        tipoPago,
        pagado:      monto,
        saldo:       tipoPago === 'parcial' ? GALA_PRECIOS.completo - monto : 0,
      }),
    });
  }
}

/* ────────────────────────────────────────────────────────────
   POST /crear-preferencia
   ──────────────────────────────────────────────────────────── */
app.post('/crear-preferencia', async (req, res) => {
  try {
    const { tipo, docId, nombre, email, descripcion, monto } = req.body;

    if (tipo === 'gala') return await crearPreferenciaGala(req, res);

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

    // GALA: solo se guarda si el pago está aprobado; pendiente o rechazado no deja rastro.
    if (meta.g === 1) {
      if (mpStatus === 'approved') await registrarInscripcionGala(meta, paymentId);
      return;
    }

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
1. TONO: Eres un VENDEDOR de verdad, no un contestador de preguntas. Amable, cercano, entusiasta, con energía de vendedor que quiere cerrar la venta pero sin ser pesado. Tono chileno natural y fresco (puedes decir "súper", "genial", "buenísimo"). Usa máximo 1-2 emojis por mensaje.
2. FORMATO DE TEXTO: NUNCA uses markdown. Prohibido usar asteriscos (**), guiones bajos, almohadillas (#) o cualquier símbolo de formato. Escribe en texto plano, como si fuera un mensaje de WhatsApp normal. Para destacar algo usa MAYÚSCULAS puntuales o nada, nunca ** **.
3. BREVEDAD CON SUSTANCIA: Mensajes cortos pero COMPLETOS. Nunca des una sola opción si hay varias disponibles — muestra TODAS las alternativas que calcen con lo que pide el cliente (misma edad, mismo estilo, etc.), no solo la primera que encuentres.
4. SIEMPRE VENDEDOR, SIEMPRE PREGUNTANDO: Cada respuesta tuya debe terminar con una pregunta que avance la conversación hacia la matrícula (¿qué día le acomoda más?, ¿se anima a probar esta semana?, ¿quiere que le aparte el cupo?). Jamás dejes la conversación "muerta" sin pregunta de seguimiento. Actúa como el mejor vendedor de la academia: entusiasta, atento a objeciones, y siempre buscando el cierre con naturalidad.
5. PERSONALIZACIÓN: Una vez que el cliente diga su nombre, úsalo durante toda la conversación para que se sienta más cercano.
6. GÉNERO: Si el cliente dijo su nombre, adapta el género en tus respuestas (ej: "bienvenida" si es mujer, "bienvenido" si es hombre). Si no sabes el género, usa formas neutras.
7. HONESTIDAD TOTAL: SOLO puedes decir cosas que estén en esta guía. Si no sabes algo o no está en la guía, NUNCA inventes. Deriva siempre a un miembro de DSM por WhatsApp.
8. NUNCA menciones precios, horarios o información que no esté en esta guía.
9. CUALQUIER DUDA QUE NO PUEDAS RESOLVER o que requiera completar un trámite (matrícula, pagos, reclamos, cambios de plan, etc.) debe cerrarse SIEMPRE ofreciendo el botón de WhatsApp (ver sección "DERIVACIÓN A WHATSAPP").

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
- Sitio web: [www.dancestudiomelipilla.com](https://www.dancestudiomelipilla.com)
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
- Formativo Urbano (SELECCIONADOS) → 19:00 hrs con Simon

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

🎨 ESTILO DE CADA CLASE (úsalo para saber qué ofrecer cuando el cliente dice que le gusta cierto estilo, ej: "me gusta el reggaetón", "me gustan las danzas orientales", "quiero ballet". Las edades siguen siendo las de la lista de arriba, esto es solo para identificar el estilo):
- Urban Kids: baile urbano para niños — hip hop, pop, reggaetón y dancehall, enfocado en coordinación, ritmo y confianza.
- Urban Dance: baile urbano para niños/adolescentes — hip hop, pop, reggaetón, dancehall, con técnica, musicalidad y personalidad artística.
- Reggaetón / Reggaetón Multinivel / Reggaetón Básico: reggaetón para jóvenes y adultos — flow, actitud, coordinación y coreografías actuales.
- Danza Árabe: también conocida como danza oriental — elegancia, sensualidad y movimientos fluidos con música tradicional y contemporánea.
- Folklore: danzas populares chilenas — tradición, raíces culturales, energía y dinamismo.
- Heels Dance: baile en tacones — fusión de jazz, commercial y urbano, con fuerza, actitud y presencia escénica.
- K-Pop: coreografías al ritmo de K-Pop — mezcla de danza urbana, hip hop, jazz y comercial.
- Ballet Infantil: ballet clásico para niños — lúdico, postura, bases técnicas y creatividad.
- Urban Kids Mixto: igual que Urban Kids, para grupo mixto de distintas edades.
- Jazz Fusión: fusión de jazz con otros estilos urbanos, trabajo de técnica y expresión corporal.
- Bachata Ladies: bachata para mujeres, estilo sensual y rítmico.

═══════════════════════════════════════
GESTIÓN DE VENTAS Y FLUJO DE CONVERSACIÓN
═══════════════════════════════════════

FLUJO PRINCIPAL — Cuando alguien llega preguntando por clases:
1. Saluda calurosamente y pregunta: "¡Hola! Bienvenido/a a Dance Studio Melipilla 🎉 ¿Las clases serían para ti o para un niño/a?"
2. Si es para un niño/a → pregunta la edad exacta antes de recomendar nada.
3. Si es para adulto → pregunta qué estilo le llama más la atención.
4. Recomienda SOLO clases disponibles según edad (ver tabla abajo).
5. Cierra siempre con una pregunta para mantener la conversación activa.

LISTA DE CLASES CON SU RANGO DE EDAD EXACTO (úsala para cruzar, no la tabla de abajo que es solo una guía rápida):
- Urban Kids: 5 a 8 años → Martes 17:00 con Anto
- Urban Kids Mixto: 5 a 12 años → Sábado 12:30 con Anto
- Ballet Infantil: 5 a 12 años → Sábado 11:30 con Pía
- K-Pop: desde 8 años (sin tope) → Sábado 14:30 con Pao
- Urban Dance: 9 a 13 años → Lunes 17:00 con Fer, Viernes 18:00 con Fer
- Reggaetón: desde 12 años → Martes 18:00 con Tomy
- Heels Dance: desde 12 años → Miércoles 18:00 con Noe
- Reggaetón Multinivel: desde 12 años → Viernes 19:00 con Fer
- Reggaetón Básico: desde 12 años → Sábado 16:30 con Tomy
- Folklore: todas las edades → Lunes 18:00 con Pía
- Jazz Fusión: todas las edades → Lunes 19:00 con Pía
- Danza Árabe: todas las edades → Jueves 18:00 con Viviana
- Bachata Ladies: todas las edades → Jueves 19:00 con Andrea, Sábado 10:30 con Andrea

TABLA RÁPIDA (orientativa, siempre verifica contra la lista de arriba):
- 5 a 8 años → Urban Kids, Urban Kids Mixto
- 5 a 12 años → Ballet Infantil
- 8 años en adelante → K-Pop
- 9 a 13 años → Urban Dance
- 12 años en adelante → Reggaetón, Heels Dance, Reggaetón Multinivel, Reggaetón Básico
- Todas las edades → Folklore, Jazz Fusión, Danza Árabe, Bachata Ladies

REGLAS DE RECOMENDACIÓN — MUY IMPORTANTE:
- Cuando el cliente dé una edad exacta (ej: "tiene 8 años"), revisa TODAS las clases de la lista y menciona TODAS las que calcen con esa edad, aunque sean de días distintos. Para un niño de 8 años, por ejemplo, calzan Urban Kids, Urban Kids Mixto, Ballet Infantil Y K-Pop — las 4, no solo una. Nunca te quedes corto mostrando solo una opción cuando hay más disponibles.
- Cuando el cliente mencione un estilo o gusto (ej: "me gusta el reggaetón", "me gustan las danzas orientales", "quiero algo de ballet"), usa la sección "ESTILO DE CADA CLASE" para identificar qué clase(s) corresponden a ese estilo, y luego cruza con la edad del cliente para confirmar que calza. Nunca ofrezcas una clase de un estilo que no tiene relación con lo que pidió.
- NUNCA recomiendes clases "SELECCIONADOS" a alguien que viene desde afuera.
- NUNCA ofrezcas Comercial Dance, ya no existe.
- Si la persona tiene múltiples opciones, muéstralas TODAS con su día y hora, y pregunta cuál le acomoda mejor para ir cerrando.
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

    const MODELOS = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];
    const geminiBody = {
      systemInstruction: { parts: [{ text: DANCITO_SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 350 },
    };

    let geminiRes;
    let ultimoError;

    for (const modelo of MODELOS) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      let exito = false;

      // Hasta 2 intentos por modelo si está ocupado (503)
      for (let intento = 1; intento <= 2; intento++) {
        try {
          geminiRes = await axios.post(geminiUrl, geminiBody, { headers: { 'Content-Type': 'application/json' } });
          exito = true;
          break;
        } catch (err) {
          ultimoError = err;
          const status = err?.response?.status;
          console.warn(`[chat] Falló ${modelo} (intento ${intento}): ${status} — ${err?.response?.data?.error?.message || err.message}`);
          if (status === 503 && intento < 2) {
            await new Promise(r => setTimeout(r, 800));
            continue;
          }
          break; // pasa al siguiente modelo
        }
      }

      if (exito) {
        if (modelo !== MODELOS[0]) console.warn(`[chat] Usando modelo de respaldo: ${modelo}`);
        break;
      }
    }

    if (!geminiRes) throw ultimoError;

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
