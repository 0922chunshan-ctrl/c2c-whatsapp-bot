const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const path = require('path');

/* =======================
   CONFIG
======================= */

const GROUP_ID = '120363419379282205@g.us';
const IMAGE_PATH = path.join(__dirname, 'reminder.jpg');

/* =======================
   MESSAGE TEMPLATES
======================= */

const messages = {
  tueFriReminder: (day, dateStr) =>
`Hello everyone! 👋🏻

Our delivery service will be available again on *${day}* ! 🚚✨
You can start placing your orders from now until *3:00 PM* tomorrow for your favourite meals.

📅 *Delivery date:* ${dateStr}

*Kind reminders:*
- Please set your pick-up time between *5:00 PM – 5:15 PM*
- Collect your delivered food at *KY’s main gate*  
  (wait for admin updates in the WhatsApp group)

Don’t miss out — place your order now! 🍴`,

  oneHourLeft: () =>
`⏰ *1 HOUR LEFT!*

Hey everyone! The *C2C system* will be closing in *1 hour* ⏳  
Make sure to place your orders before *3:00 PM* if you haven’t yet! 🍕🍔🥤`
};


/* =======================
   DAY LOGIC (STEP 3)
======================= */

function getTodayType() {
  const day = new Date().getDay();
  // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat

  if ([6, 0, 1].includes(day)) return 'TUESDAY_REMINDER';
  if (day === 2) return 'TUESDAY_URGENT';
  if ([3, 4].includes(day)) return 'FRIDAY_REMINDER';
  if (day === 5) return 'FRIDAY_URGENT';

  return null;
}

function getDeliveryInfo() {
  const today = new Date();
  const day = today.getDay();

  let deliveryDate = new Date(today);

  // If reminder days → next delivery day
  if ([6, 0, 1].includes(day)) {
    // Sat, Sun, Mon → Tuesday
    deliveryDate.setDate(today.getDate() + ((2 - day + 7) % 7));
  } else if ([3, 4].includes(day)) {
    // Wed, Thu → Friday
    deliveryDate.setDate(today.getDate() + ((5 - day + 7) % 7));
  }

  const dayName = deliveryDate.toLocaleDateString('en-MY', { weekday: 'long' });
  const dateStr = deliveryDate.toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return { dayName, dateStr };
}


/* =======================
   SEND IMAGE + TEXT (STEP 4)
======================= */

async function sendImageMessage(sock, messageText) {
  await sock.sendMessage(GROUP_ID, {
    text: messageText
  });

  console.log('📤 Message sent');
}


/* =======================
   SCHEDULER (STEP 5)
======================= */

function scheduleDailyMessage(sock) {
  const now = new Date();
  const target = new Date();

  let type = getTodayType();

  // Default 9 AM
  target.setHours(9, 0, 0, 0);

  // Urgent messages at 2 PM
  if (type === 'TUESDAY_URGENT' || type === 'FRIDAY_URGENT') {
    target.setHours(14, 0, 0, 0);
  }

  if (now > target) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target - now;

  setTimeout(async () => {
    try {
      const todayType = getTodayType();

      if (todayType === 'TUESDAY_REMINDER') {
        const { dayName, dateStr } = getDeliveryInfo();
      await sendImageMessage(
        sock,
        messages.tueFriReminder(dayName, dateStr)
      );
      }

      if (todayType === 'FRIDAY_REMINDER') {
        const { dayName, dateStr } = getDeliveryInfo();
        await sendImageMessage(
          sock,
          messages.tueFriReminder(dayName, dateStr)
        );
      }

      if (todayType === 'TUESDAY_URGENT' || todayType === 'FRIDAY_URGENT') {
        await sendImageMessage(sock, messages.oneHourLeft());
      }

    } catch (err) {
      console.error('❌ Send failed:', err.message);
    }

    // Schedule next day
    scheduleDailyMessage(sock);

  }, delay);
}

/* =======================
   START BOT (STEP 6)
======================= */

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  const sock = makeWASocket({ auth: state });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 Scan QR code:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected');
      scheduleDailyMessage(sock); // 👈 STEP 6 (CORRECT PLACE)
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log('❌ Disconnected. Reconnect:', shouldReconnect);
      if (shouldReconnect) startBot();
    }
  });
}

startBot();






