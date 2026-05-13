const express    = require('express');
const cors       = require('cors');
const axios      = require('axios');
const admin      = require('firebase-admin');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ══════════════════════════════════════
   FIREBASE ADMIN — inicializar con env
══════════════════════════════════════ */
const serviceAccount = {
  type:                        'service_account',
  project_id:                  process.env.FIREBASE_PROJECT_ID,
  private_key_id:              process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key:                 (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  client_email:                process.env.FIREBASE_CLIENT_EMAIL,
  client_id:                   process.env.FIREBASE_CLIENT_ID,
  auth_uri:                    'https://accounts.google.com/o/oauth2/auth',
  token_uri:                   'https://oauth2.googleapis.com/token',
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/* ══════════════════════════════════════
   MIDDLEWARES
══════════════════════════════════════ */
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = [
      'https://dancestudiomelipilla.com',
      'https://www.dancestudiomelipilla.com',
      'https://mydsm-backend-web-production.up.railway.app',
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://127.0.0.1:3000',
    ];
    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('[CORS] Origen bloqueado:', origin);
      callback(new Error('No permitido por CORS: ' + origin));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.options('*', cors());
app.use(express.json());

/* ══════════════════════════════════════
   HEALTH CHECK
══════════════════════════════════════ */
app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'DSM Backend', ts: new Date().toISOString() });
});

/* ══════════════════════════════════════════════════════
   POST /crear-preferencia
   Body: { uid, tipo, planNombre, monto, compraId?,
           payerEmail?, payerName? }
══════════════════════════════════════════════════════ */
app.post('/crear-preferencia', async (req, res) => {
  try {
    const { uid, tipo, planNombre, monto, compraId, payerEmail, payerName } = req.body;

    if (!uid || !tipo || !monto) {
      return res.status(400).json({ error: 'Faltan parámetros: uid, tipo, monto' });
    }

    // ── Título del pago ──────────────────────────────
    const titulo = tipo === 'matricula'
      ? `Matrícula + ${planNombre || 'Plan'} — Dance Studio Melipilla`
      : `${planNombre || 'Plan'} — Dance Studio Melipilla`;

    // ── ID y descripción del ítem ────────────────────
    // FIX 1: Agregar id, description y category_id
    // Esto reduce rechazos por el motor antifraude de MP
    const itemId = tipo === 'matricula' ? 'MAT-DSM-001' : `PLAN-DSM-${(planNombre || 'plan').replace(/\s+/g, '-').toUpperCase()}`;
    const itemDescription = tipo === 'matricula'
      ? `Matrícula de inscripción más plan ${planNombre || ''} en Dance Studio Melipilla, Melipilla`.trim()
      : `Plan de clases ${planNombre || ''} en Dance Studio Melipilla, Melipilla`.trim();

    // ── Metadata para el webhook ─────────────────────
    const external_reference = JSON.stringify({
      uid,
      tipo,
      planNombre: planNombre || '',
      compraId:   compraId   || '',
    });

    // ── URL de notificación — nunca vacía ────────────
    // FIX 2: Fallback explícito si RAILWAY_URL no está definida
    const notifUrl = (process.env.RAILWAY_URL || 'https://mydsm-backend-web-production.up.railway.app') + '/webhook-mp';

    // ── Datos del comprador ──────────────────────────
    // FIX 3: Enviar payer para que MP valide contra fraude
    // Si el front no los manda, los buscamos en Firestore
    let payer = {};
    try {
      const snap = await db.collection('alumnos').doc(uid).get();
      const alumno = snap.data() || {};
      const email = payerEmail || alumno.email || '';
      const nombre = payerName || alumno.nombre || '';
      const apellido = alumno.apellido || '';
      if (email) {
        payer = {
          email,
          ...(nombre && { name: nombre }),
          ...(apellido && { surname: apellido }),
        };
      }
    } catch (e) {
      console.warn('[crear-preferencia] No se pudo leer payer desde Firestore:', e.message);
    }

    // ── Armar preferencia completa ───────────────────
    const preference = {
      items: [{
        id:          itemId,           // ← FIX 1a: requerido por MP antifraude
        title:       titulo,
        description: itemDescription,  // ← FIX 1b: mejora tasa de aprobación
        category_id: 'services',       // ← FIX 1c: categoría (services = servicios)
        quantity:    1,
        unit_price:  Number(monto),
        currency_id: 'CLP',
      }],
      ...(Object.keys(payer).length > 0 && { payer }), // ← FIX 3: datos del comprador
      external_reference,
      back_urls: {
        success: 'https://www.dancestudiomelipilla.com?pago=aprobado',
        failure: 'https://www.dancestudiomelipilla.com?pago=rechazado',
        pending: 'https://www.dancestudiomelipilla.com?pago=pendiente',
      },
      auto_return:          'approved',
      notification_url:     notifUrl,  // ← FIX 2: nunca vacía
      statement_descriptor: 'DANCE STUDIO MELIPILLA',
    };

    const mpRes = await axios.post(
      'https://api.mercadopago.com/checkout/preferences',
      preference,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const { id: preferenceId, init_point, sandbox_init_point } = mpRes.data;

    // Guardar preferenceId en Firestore
    if (tipo === 'matricula') {
      await db.collection('alumnos').doc(uid).set(
        { preferenceId, estadoPago: 'pendiente' },
        { merge: true }
      );
    } else if (compraId) {
      await db.collection('compras').doc(compraId).set(
        { preferenceId, estadoPago: 'pendiente' },
        { merge: true }
      );
    }

    res.json({ init_point, sandbox_init_point, preferenceId });

  } catch (err) {
    console.error('[crear-preferencia]', err?.response?.data || err.message);
    res.status(500).json({ error: 'Error al crear preferencia en Mercado Pago' });
  }
});

/* ══════════════════════════════════════════════════════
   POST /webhook-mp
   Mercado Pago llama aquí cuando hay un pago
══════════════════════════════════════════════════════ */
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

    const pago   = mpRes.data;
    const estado = pago.status;

    console.log(`[webhook-mp] payment ${paymentId} → ${estado}`);

    let meta = {};
    try { meta = JSON.parse(pago.external_reference || '{}'); } catch (_) {}

    const { uid, tipo, planNombre, compraId } = meta;
    if (!uid) {
      console.warn('[webhook-mp] Sin uid en external_reference');
      return;
    }

    const estadoFinal = estado === 'approved' ? 'aprobado'
                      : estado === 'rejected'  ? 'rechazado'
                      : 'pendiente';

    const ahora = admin.firestore.FieldValue.serverTimestamp();

    /* ── Matrícula ── */
    if (tipo === 'matricula') {
      const updateAlumno = {
        estadoPago:        estadoFinal,
        pagoId:            String(paymentId),
        fechaPago:         ahora,
        matriculaCompleta: estadoFinal === 'aprobado',
      };
      if (estadoFinal === 'aprobado' && planNombre) {
        updateAlumno.planActivo = { nombre: planNombre, activadoEn: ahora };
      }
      await db.collection('alumnos').doc(uid).set(updateAlumno, { merge: true });
      console.log(`[webhook-mp] Matrícula ${uid} → ${estadoFinal}`);
    }

    /* ── Compra de plan ── */
    if (tipo === 'plan' && compraId) {
      await db.collection('compras').doc(compraId).set({
        estadoPago: estadoFinal,
        pagoId:     String(paymentId),
        fechaPago:  ahora,
      }, { merge: true });

      if (estadoFinal === 'aprobado') {
        const vence = new Date();
        vence.setDate(vence.getDate() + 30);
        await db.collection('alumnos').doc(uid).set({
          planActivo: {
            nombre:   planNombre,
            compraId,
            vence:    admin.firestore.Timestamp.fromDate(vence),
          },
          planPendiente: admin.firestore.FieldValue.delete(),
        }, { merge: true });
      }
      console.log(`[webhook-mp] Compra ${compraId} (uid ${uid}) → ${estadoFinal}`);
    }

  } catch (err) {
    console.error('[webhook-mp] Error:', err?.response?.data || err.message);
  }
});

/* ══════════════════════════════════════════════════════
   GET /estado-pago?uid=xxx
══════════════════════════════════════════════════════ */
app.get('/estado-pago', async (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: 'Falta uid' });
  try {
    const snap = await db.collection('alumnos').doc(uid).get();
    if (!snap.exists) return res.json({ estadoPago: 'no_encontrado' });
    const { estadoPago, matriculaCompleta, planActivo } = snap.data();
    res.json({ estadoPago, matriculaCompleta, planActivo: planActivo || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`🚀 DSM Backend corriendo en puerto ${PORT}`);
});
