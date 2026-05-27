require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            unit_amount: 1999,
            product_data: {
              name: 'SMART Productivity Planner',
              description: 'The board-level digital planner built on the SMART framework',
            },
          },
          quantity: 1,
        },
      ],
      success_url: process.env.SUCCESS_URL + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: process.env.CANCEL_URL,
      billing_address_collection: 'auto',
      customer_creation: 'always',
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/verify-session', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id || !session_id.startsWith('cs_')) {
    return res.status(400).json({ valid: false, error: 'Invalid session ID' });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === 'paid') {
      return res.json({
        valid: true,
        email: session.customer_details?.email || '',
        name: session.customer_details?.name || '',
        amount: session.amount_total,
        currency: session.currency,
      });
    }
    res.json({ valid: false, error: 'Payment not completed' });
  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

app.get('/download', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id || !session_id.startsWith('cs_')) {
    return res.status(403).send('Access denied');
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      return res.status(403).send('Payment not confirmed');
    }
    const filePath = path.join(__dirname, 'public', 'downloads', 'smart-productivity-planner.html');
    res.download(filePath, 'SMART-Productivity-Planner.html');
  } catch (err) {
    res.status(500).send('Error verifying purchase');
  }
});

async function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log(`Payment received — ${session.customer_details?.email}`);
  }
  res.json({ received: true });
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
