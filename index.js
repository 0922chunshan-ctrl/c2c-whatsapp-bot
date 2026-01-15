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
`Our delivery service will be available again on *${day}* (${dateStr}) 🚚✨
You can start placing your orders from now until *3:00 PM* tomorrow for your favourite meals.

*Kind reminders:*
- Please set your pick-up time between *5:00 PM – 5:15 PM*
- Collect your delivered food at *KY’s main gate*  
  (wait for updates in the group)

https://crave2cave.vercel.app/`,

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

  // Reminder days
  if (day === 1) return 'TUE_REMINDER'; // Monday
  if (day === 4) return 'FRI_REMINDER'; // Thursday
  if (day === 5) return 'SAT_REMINDER'; // Friday night handled by scheduler time

  // Urgent delivery days
  if (day === 2) return 'TUE_URGENT';   // Tuesday
  if (day === 5) return 'FRI_URGENT';   // Friday
  if (day === 6) return 'SAT_URGENT';   // Saturday

  return null;
}

function getDeliveryInfo(targetDay) {
  const today = new Date();
  const deliveryDate = new Date(today);

  deliveryDate.setDate(today.getDate() + ((targetDay - today.getDay() + 7) % 7));

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
    image: { url: IMAGE_PATH },
    caption: messageText
  });

  console.log('📤 Image + message sent');
}


/* =======================
   SCHEDULER (STEP 5)
======================= */

function scheduleDailyMessage(sock) {
  const now = new Date();
  const target = new Date();

  let type = getTodayType();

  // Default reminder time → 10:25 AM
target.setHours(24, 0, 0, 0);

// Friday night reminder for Saturday delivery → 9:00 PM
if (type === 'SAT_REMINDER') {
  target.setHours(21, 0, 0, 0);
}

// Urgent reminders → 1:45 PM
if (type === 'TUE_URGENT' || type === 'FRI_URGENT' || type === 'SAT_URGENT') {
  target.setHours(13, 45, 0, 0);
}

  if (now > target) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target - now;

  setTimeout(async () => {
    try {
      const todayType = getTodayType();

      // Monday → Tuesday delivery
      if (todayType === 'TUE_REMINDER') {
        const { dayName, dateStr } = getDeliveryInfo(2);
        await sendImageMessage(sock, messages.tueFriReminder(dayName, dateStr));
      }

      // Thursday → Friday delivery
      if (todayType === 'FRI_REMINDER') {
        const { dayName, dateStr } = getDeliveryInfo(5);
        await sendImageMessage(sock, messages.tueFriReminder(dayName, dateStr));
      }

      // Friday night → Saturday delivery
      if (todayType === 'SAT_REMINDER') {
        const { dayName, dateStr } = getDeliveryInfo(6);
        await sendImageMessage(sock, messages.tueFriReminder(dayName, dateStr));
      }

      // Urgent reminders
      if (
        todayType === 'TUE_URGENT' ||
        todayType === 'FRI_URGENT' ||
        todayType === 'SAT_URGENT'
      ) {
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
      console.log('🔗 QR STRING (copy this):');
      console.log(qr);
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






