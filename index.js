process.env.TZ = 'Asia/Kuala_Lumpur';
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

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
Make sure to place your orders before *3:00 PM* if you haven’t yet! 🍕🍔🥤
https://crave2cave.vercel.app/`
};


/* =======================
   DAY LOGIC (STEP 3)
======================= */

function getTodayType() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  // Reminder days
  if (day === 1) return 'TUE_REMINDER'; // Monday
  if (day === 4) return 'FRI_REMINDER'; // Thursday

  // Friday night ONLY (after 9 PM) → Saturday delivery
  if (day === 5 && hour >= 21) return 'SAT_REMINDER';

  // Urgent delivery days
  if (day === 2) return 'TUE_URGENT';   // Tuesday
  if (day === 5 && hour < 15) return 'FRI_URGENT'; // Friday before cutoff
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

let sentFlags = {};

function scheduleDailyMessage(sock) {
  setInterval(async () => {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const minute = now.getMinutes();

    const todayKey = `${day}-${hour}-${minute}`;

    try {
      // 🟢 Monday 10:25 AM → Tuesday delivery
      if (day === 1 && hour === 10 && minute === 25) {
        if (!sentFlags[todayKey]) {
          sentFlags[todayKey] = true;
          const { dayName, dateStr } = getDeliveryInfo(2);
          await sendImageMessage(sock, messages.tueFriReminder(dayName, dateStr));
          console.log('✅ Monday reminder sent');
        }
      }

      // 🟢 Thursday 10:25 AM → Friday delivery
      if (day === 4 && hour === 10 && minute === 25) {
        if (!sentFlags[todayKey]) {
          sentFlags[todayKey] = true;
          const { dayName, dateStr } = getDeliveryInfo(5);
          await sendImageMessage(sock, messages.tueFriReminder(dayName, dateStr));
          console.log('✅ Thursday reminder sent');
        }
      }

      // 🟢 Friday 11:58 PM → Saturday delivery
      if (day === 5 && hour === 23 && minute === 58) {
        if (!sentFlags[todayKey]) {
          sentFlags[todayKey] = true;
          const { dayName, dateStr } = getDeliveryInfo(6);
          await sendImageMessage(sock, messages.tueFriReminder(dayName, dateStr));
          console.log('✅ Friday night reminder sent');
        }
      }

      // 🔴 Urgent reminders (2:00 PM)
      if (
        (day === 2 || day === 5 || day === 6) &&
        hour === 14 &&
        minute >= 0 &&
        minute <= 2
      ) {

        if (!sentFlags[todayKey]) {
          sentFlags[todayKey] = true;
          await sendImageMessage(sock, messages.oneHourLeft());
          console.log('⏰ Urgent reminder sent');
        }
      }

    } catch (err) {
      console.error('❌ Send failed:', err.message);
    }

  }, 60 * 1000); // check every minute
}

/* =======================
   START BOT (STEP 6)
======================= */

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  const sock = makeWASocket({ auth: state });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 Scan QR code:');
      console.log('🔗 QR STRING (copy this):');
      console.log(qr);
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected');
      scheduleDailyMessage(sock);
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






