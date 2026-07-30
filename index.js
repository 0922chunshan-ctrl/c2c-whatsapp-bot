process.env.TZ = 'Asia/Kuala_Lumpur';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs-extra'); // Installed for file operations
const cron = require('node-cron');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const qrcode = require('qrcode-terminal');

// Simple dashboard / health-check for cron-job.org
app.get('/ping', (req, res) => {
  res.status(200).send('Crave 2 Cave Bot is awake!');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

/* =======================
   CONFIG & TEMPLATES
======================= */
const GROUP_ID = '120363419379282205@g.us';
const IMAGE_PATH = path.join(__dirname, 'reminder.jpg');

const messages = {
  tueFriReminder: (day, dateStr) =>
    `Our delivery service will be available again on *${day}* (${dateStr}) 🚚✨\nYou can start placing your orders from now until *3:00 PM* tomorrow for your favourite meals.\n\n*Kind reminders:*\n- Please set your pick-up time between *5:00 PM – 5:15 PM*\n- Collect your delivered food at *KY’s main gate*\n(wait for updates in the group)\n\nhttps://crave2cave.vercel.app/`,

  oneHourLeft: () =>
    `⏰ *1 HOUR LEFT!*\n\nHey everyone! The *C2C system* will be closing in *1 hour* ⏳\nMake sure to place your orders before *3:00 PM* if you haven’t yet! 🍕🍔🥤\nhttps://crave2cave.vercel.app/`
};

/* =======================
   DAY LOGIC & SEND
======================= */
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

async function sendImageMessage(sock, messageText) {
  try {
    await sock.sendMessage(GROUP_ID, {
      image: { url: IMAGE_PATH },
      caption: messageText
    });
    console.log('📤 Image + message sent');
  } catch (err) {
    console.error('❌ Send failed:', err.message);
  }
}

/* =======================
   SCHEDULER
======================= */
let isSchedulerRunning = false;

function scheduleDailyMessage(sock) {
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;
  
  console.log('🗓️ Scheduler initialized');
  const tz = { timezone: "Asia/Kuala_Lumpur" };

  // Monday 10:25 AM -> Tuesday delivery
  cron.schedule('25 10 * * 1', () => {
    const { dayName, dateStr } = getDeliveryInfo(2);
    sendImageMessage(sock, messages.tueFriReminder(dayName, dateStr));
  }, tz);

  // Thursday 10:25 AM -> Friday delivery
  cron.schedule('25 10 * * 4', () => {
    const { dayName, dateStr } = getDeliveryInfo(5);
    sendImageMessage(sock, messages.tueFriReminder(dayName, dateStr));
  }, tz);

  // Friday 11:58 PM -> Saturday delivery
  cron.schedule('58 23 * * 5', () => {
    const { dayName, dateStr } = getDeliveryInfo(6);
    sendImageMessage(sock, messages.tueFriReminder(dayName, dateStr));
  }, tz);

  // Urgent reminders (2:00 PM) on Tue, Fri, Sat
  cron.schedule('0 14 * * 2,5,6', () => {
    sendImageMessage(sock, messages.oneHourLeft());
  }, tz);
}

/* =======================
   SESSION RESTORE HELPER
======================= */
async function restoreSessionFromEnv() {
  const authPath = path.join(__dirname, 'auth');
  const sessionBase64 = process.env.SESSION_DATA;

  // If local auth folder doesn't exist BUT environment variable exists, restore it!
  if (sessionBase64 && !fs.existsSync(authPath)) {
    console.log('📦 Restoring WhatsApp session from Environment Variables...');
    try {
      const jsonString = Buffer.from(sessionBase64, 'base64').toString('utf-8');
      const files = JSON.parse(jsonString);
      
      await fs.ensureDir(authPath);
      for (const [fileName, fileContent] of Object.entries(files)) {
        await fs.writeFile(path.join(authPath, fileName), fileContent);
      }
      console.log('✅ Session restored successfully!');
    } catch (err) {
      console.error('❌ Failed to restore session from env:', err.message);
    }
  }
}

/* =======================
   START BOT
======================= */
async function startBot() {
  // Restore session if available before reading auth
  await restoreSessionFromEnv();

  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({
  auth: state,
  printQRInTerminal: true,
  browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect, qr } = update;

  // Render QR code visually in Render logs
  if (qr) {
    console.log('⚡ SCAN THIS QR CODE WITH WHATSAPP:');
    qrcode.generate(qr, { small: true });
  }

  if (connection === 'open') {
    console.log('✅ WhatsApp connected successfully!');
    scheduleDailyMessage(sock);
  }

  if (connection === 'close') {
    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
    console.log('❌ Disconnected. Reconnecting:', shouldReconnect);
    if (shouldReconnect) {
      setTimeout(() => startBot(), 3000); // 3-second buffer prevents reconnect loops
    }
  }
});
}

startBot();






