const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; } // keep raw body for Paystack webhook
}));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve public config (anon key + paystack public key) to the frontend
app.get('/config.js', (_req, res) => {
  res.type('application/javascript');
  res.send(`
    window.APP_CONFIG = {
      SUPABASE_URL: ${JSON.stringify(process.env.SUPABASE_URL || '')},
      SUPABASE_ANON_KEY: ${JSON.stringify(process.env.SUPABASE_ANON_KEY || '')},
      PAYSTACK_PUBLIC_KEY: ${JSON.stringify(process.env.PAYSTACK_PUBLIC_KEY || '')}
    };
  `);
});

// List products
app.get('/api/products', async (_req, res) => {
  const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Verify a Paystack transaction, save the order, email the customer
app.post('/api/checkout/verify', async (req, res) => {
  try {
    const { reference, items, email } = req.body;
    if (!reference || !items || !email) return res.status(400).json({ error: 'Missing fields' });

    const r = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });
    const verification = await r.json();
    if (!verification.status || verification.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment not successful' });
    }

    const amount = verification.data.amount / 100; // paystack returns kobo
    const { data: order, error } = await supabase.from('orders').insert({
      email, items, amount, reference, status: 'paid'
    }).select().single();
    if (error) throw error;

    await sendOrderEmail(email, order);
    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Paystack webhook (backup confirmation)
app.post('/api/paystack/webhook', async (req, res) => {
  const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(req.rawBody).digest('hex');
  if (hash !== req.headers['x-paystack-signature']) return res.sendStatus(401);
  if (req.body.event === 'charge.success') {
    const { reference } = req.body.data;
    await supabase.from('orders').update({ status: 'paid' }).eq('reference', reference);
  }
  res.sendStatus(200);
});

async function sendOrderEmail(email, order) {
  const itemsHtml = order.items.map(i => `<li>${i.name} × ${i.qty} — ₦${(i.price * i.qty).toLocaleString()}</li>`).join('');
  const form = new URLSearchParams();
  form.append('from', process.env.MAILGUN_FROM);
  form.append('to', email);
  form.append('subject', `Order confirmed #${order.reference}`);
  form.append('html', `<h2>Thanks for your order!</h2><ul>${itemsHtml}</ul><p><b>Total: ₦${order.amount.toLocaleString()}</b></p>`);
  const auth = Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64');
  await fetch(`https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });
}

// Recent orders (admin extra)
app.get('/api/orders', async (_req, res) => {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = app;
