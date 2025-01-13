const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');

// Konfigurasi bot sederhana
const config = {
    name: 'WA Bot',
    owner: ['6281246497753@s.whatsapp.net'],
    prefix: '!'
};

// Message Handler sederhana
async function handleMessage(sock, msg) {
    try {
        if (!msg.message) return;

        const messageType = Object.keys(msg.message)[0];
        if (!messageType) return;

        const from = msg.key.remoteJid;
        const body = messageType === 'conversation' ? msg.message.conversation :
                    messageType === 'extendedTextMessage' ? msg.message.extendedTextMessage.text : '';

        if (!body) return;
        if (!body.startsWith(config.prefix)) return;

        const command = body.slice(1).trim().split(' ')[0].toLowerCase();

        console.log(`Command received: ${command}`);

        switch (command) {
            case 'ping':
                await sock.sendMessage(from, { text: 'Pong! 🏓\nBot aktif!' });
                break;
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
}

// Main function
async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

        const sock = makeWASocket({
            printQRInTerminal: true,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['WA Bot', 'Chrome', '1.0.0']
        });

        // Handle connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed due to:', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
                
                if (shouldReconnect) {
                    connectToWhatsApp();
                }
            } else if (connection === 'connecting') {
                console.log('Connecting to WhatsApp...');
            } else if (connection === 'open') {
                console.log('Bot successfully connected! ✅');
                // Kirim pesan ke owner bot
                sock.sendMessage(config.owner[0], { text: '✅ Bot telah aktif dan siap digunakan!' });
            }
        });

        // Handle messages
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                if (msg.key.fromMe) return;
                await handleMessage(sock, msg);
            }
        });

        // Save credentials
        sock.ev.on('creds.update', saveCreds);

        return sock;
    } catch (error) {
        console.error('Error in connectToWhatsApp:', error);
        setTimeout(connectToWhatsApp, 5000);
    }
}

// Error handlers
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

// Start the bot
console.log('Starting WhatsApp Bot...');
connectToWhatsApp();