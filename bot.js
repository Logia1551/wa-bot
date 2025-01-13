const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
 } = require('@whiskeysockets/baileys');
 const pino = require('pino');
 const qrcode = require('qrcode-terminal');
 
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
            printQRInTerminal: false,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['WA Bot', 'Chrome', '1.0.0']
        });

        let qrInterval;

        // Handle connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // Clear interval yang lama jika ada
                if (qrInterval) clearInterval(qrInterval);

                // Fungsi untuk generate QR
                const logQR = () => {
                    console.clear();
                    console.log('\n=========================');
                    console.log('Scan QR code dibawah ini:');
                    console.log('=========================\n');
                    
                    // Ubah konfigurasi QR
                    qrcode.generate(qr, {
                        small: false,  // Ubah ke false agar ukuran normal
                        // Hapus opsi size yang membuat QR jadi tidak persegi
                    });
                    
                    console.log('\n=========================');
                    console.log('QR code akan diperbarui setiap 20 detik');
                    console.log('=========================\n');
                };

                // Generate QR pertama kali
                logQR();
                
                // Perbesar interval refresh ke 20 detik
                qrInterval = setInterval(logQR, 20000);
            }
            
            if (connection === 'close') {
                // Clear interval saat koneksi tertutup
                if (qrInterval) clearInterval(qrInterval);
 
                const shouldReconnect = lastDisconnect?.error?.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed due to:', lastDisconnect?.error);
                console.log('Attempting to reconnect:', shouldReconnect);
                
                if (shouldReconnect) {
                    connectToWhatsApp();
                }
            } else if (connection === 'connecting') {
                console.log('Status: Connecting to WhatsApp...');
            } else if (connection === 'open') {
                // Clear interval saat sudah terkoneksi
                if (qrInterval) clearInterval(qrInterval);
 
                console.log('\n=========================');
                console.log('Status: Bot successfully connected! ✅');
                console.log('Bot is ready to use!');
                console.log('=========================\n');
 
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
 process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
 });
 process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
 });
 
 // Start the bot
 console.log('\n=========================');
 console.log('Starting WhatsApp Bot...');
 console.log('=========================\n');
 connectToWhatsApp();