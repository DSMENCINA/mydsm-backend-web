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
   POST /crear-preferencia
   Body: {
     tipo      : 'enrollment' | 'lead' | 'matricula' | 'plan'
     docId     : ID del documento Firestore ya guardado
     nombre    : nombre del alumno
     email     : email del alumno
     descripcion : texto del ítem en MP
     monto     : número en CLP
   }
   ──────────────────────────────────────────────────────────── */
app.post('/crear-preferencia', async (req, res) => {
  try {
    const { tipo, docId, nombre, email, descripcion, monto } = req.body;

    if (!tipo || !docId || !monto) {
      return res.status(400).json({ error: 'Faltan campos: tipo, docId, monto' });
    }

    // Qué colección de Firestore corresponde
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

    // Guardar preferenceId en Firestore
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
   MercadoPago notifica aquí cuando cambia el estado de un pago.
   ──────────────────────────────────────────────────────────── */
app.post('/webhook-mp', async (req, res) => {
  res.sendStatus(200); // MP necesita 200 inmediato

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

  } catch (err) {
    console.error('[webhook-mp]', err?.response?.data || err.message);
  }
});

/* ── Start ────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`🚀 DSM Backend corriendo en puerto ${PORT}`);
});
