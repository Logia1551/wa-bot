const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const schedule = require('node-schedule'); // Tambahkan ini

// Konfigurasi bot
const config = {
    name: 'WA Bot',
    owner: ['6281246497753@s.whatsapp.net'],
    prefix: '!',
    welcomeEnabled: true,  // Fitur welcome message
    reminders: {  // Tambahkan konfigurasi reminder
        morning: {
            time: '09:00',
            message: 'Selamat pagi semua! 🌅\nSemoga hari ini menyenangkan dan produktif!\n\nJangan lupa sarapan ya~ 😊'
        },
        noon: {
            time: '12:00',
            message: 'Selamat siang semuanya! ☀️\nJangan lupa istirahat dan makan siang ya!'
        },
        afternoon: {
            time: '15:00',
            message: 'Selamat sore! 🌤\nSemangat untuk aktivitas sorenya!'
        },
        evening: {
            time: '18:00',
            message: 'Selamat malam! 🌙\nJangan lupa makan malam dan istirahat yang cukup!'
        }
    }
};

// Helper Functions
const isGroup = (jid) => jid.endsWith('@g.us');
const isImage = (type) => type === 'imageMessage';
const isVideo = (type) => type === 'videoMessage';
const isSticker = (type) => type === 'stickerMessage';

const isGroupAdmin = async (sock, groupId, senderId) => {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const participant = groupMetadata.participants.find(p => p.id === senderId);
        return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
};

const isOwner = (sender) => config.owner.includes(sender);

// Fungsi untuk mengirim reminder
async function sendReminder(sock, groupId, reminderMessage) {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const participants = groupMetadata.participants;
        const mentions = participants.map(p => p.id);
        
        await sock.sendMessage(groupId, {
            text: reminderMessage,
            mentions: mentions
        });
    } catch (error) {
        console.error('Error sending reminder:', error);
    }
}

// Fungsi untuk mengatur jadwal reminder
function setupReminders(sock, groupId) {
    // Setup semua reminder yang ada di config
    Object.values(config.reminders).forEach(reminder => {
        const [hour, minute] = reminder.time.split(':');
        
        // Jadwalkan reminder menggunakan node-schedule
        schedule.scheduleJob(`${minute} ${hour} * * *`, async () => {
            await sendReminder(sock, groupId, reminder.message);
        });
    });
}

// Message Handler
async function handleMessage(sock, msg) {
    try {
        if (!msg.message) return;

        const messageType = Object.keys(msg.message)[0];
        if (!messageType) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const isGroupMsg = isGroup(from);
        const body = messageType === 'conversation' ? msg.message.conversation :
                    messageType === 'extendedTextMessage' ? msg.message.extendedTextMessage.text :
                    messageType === 'imageMessage' ? msg.message.imageMessage.caption :
                    messageType === 'videoMessage' ? msg.message.videoMessage.caption : '';

        if (!body) return;
        if (!body.startsWith(config.prefix)) return;

        const command = body.slice(1).trim().split(' ')[0].toLowerCase();
        const args = body.slice(config.prefix.length + command.length).trim().split(' ').filter(v => v);

        console.log(`Command received: ${command} from ${sender} in ${from}`);

        switch (command) {
            // ... (semua command yang sudah ada tetap sama)

            // Tambahkan command reminder baru
            case 'setreminder':
                if (!isGroupMsg) return;
                if (!(await isGroupAdmin(sock, from, sender))) {
                    await sock.sendMessage(from, { text: '❌ Kamu bukan admin!' });
                    return;
                }
                
                if (args.length < 3) {
                    await sock.sendMessage(from, { 
                        text: `❌ Format salah!\nContoh: !setreminder morning 09:00 Selamat pagi semua!` 
                    });
                    return;
                }
                
                try {
                    const [reminderName, time, ...messageArr] = args;
                    const message = messageArr.join(' ');
                    
                    // Validasi format waktu (HH:mm)
                    if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
                        await sock.sendMessage(from, { 
                            text: '❌ Format waktu salah! Gunakan format HH:mm (contoh: 09:00)' 
                        });
                        return;
                    }
                    
                    // Update config
                    config.reminders[reminderName] = {
                        time: time,
                        message: message
                    };
                    
                    // Atur ulang jadwal untuk grup tersebut
                    setupReminders(sock, from);
                    
                    await sock.sendMessage(from, { 
                        text: `✅ Berhasil mengatur reminder "${reminderName}" pada ${time}` 
                    });
                } catch (error) {
                    console.error('Error setting reminder:', error);
                    await sock.sendMessage(from, { text: '❌ Gagal mengatur reminder' });
                }
                break;

            case 'listreminder':
                if (!isGroupMsg) return;
                try {
                    let reminderList = '*Daftar Reminder*\n\n';
                    Object.entries(config.reminders).forEach(([name, data]) => {
                        reminderList += `${name}\n`;
                        reminderList += `⏰ Waktu: ${data.time}\n`;
                        reminderList += `✉️ Pesan: ${data.message}\n\n`;
                    });
                    
                    await sock.sendMessage(from, { text: reminderList });
                } catch (error) {
                    console.error('Error listing reminders:', error);
                    await sock.sendMessage(from, { text: '❌ Gagal menampilkan daftar reminder' });
                }
                break;

            case 'deletereminder':
                if (!isGroupMsg) return;
                if (!(await isGroupAdmin(sock, from, sender))) {
                    await sock.sendMessage(from, { text: '❌ Kamu bukan admin!' });
                    return;
                }
                
                if (args.length < 1) {
                    await sock.sendMessage(from, { 
                        text: '❌ Masukkan nama reminder yang akan dihapus!' 
                    });
                    return;
                }
                
                try {
                    const reminderName = args[0];
                    
                    if (!config.reminders[reminderName]) {
                        await sock.sendMessage(from, { 
                            text: '❌ Reminder tidak ditemukan!' 
                        });
                        return;
                    }
                    
                    delete config.reminders[reminderName];
                    setupReminders(sock, from); // Atur ulang jadwal
                    
                    await sock.sendMessage(from, { 
                        text: `✅ Berhasil menghapus reminder "${reminderName}"` 
                    });
                } catch (error) {
                    console.error('Error deleting reminder:', error);
                    await sock.sendMessage(from, { text: '❌ Gagal menghapus reminder' });
                }
                break;

            case 'help':
            case 'menu':
                const helpText = `
*${config.name} - Menu Perintah*

*Perintah Reminder:*
!setreminder <nama> <waktu> <pesan> - Atur reminder baru
!listreminder - Lihat daftar reminder
!deletereminder <nama> - Hapus reminder

*Perintah Umum:*
!ping - Test bot
!help - Menu ini
!info - Info grup
!tagall - Tag semua member
!hidetag - Tag semua (hidden)
!sticker - Buat sticker (kirim/balas foto)
!owner - Info owner bot

*Perintah Admin:*
!add 628xx - Tambah member
!kick @user - Kick member
!promote @user - Naikkan jadi admin
!demote @user - Turunkan dari admin
!setname - Ganti nama grup
!setdesc - Ganti deskripsi grup
!link - Ambil link grup
!revoke - Reset link grup
!welcome on/off - Aktifkan/matikan welcome
!closegroup - Tutup grup
!opengroup - Buka grup

*Perintah Owner:*
!broadcast - Broadcast pesan ke semua grup
!listgroup - List semua grup
!leave - Bot leave grup

Note: 
- Reply foto dengan caption !sticker untuk buat sticker
- Command admin hanya untuk admin grup
- Command owner hanya untuk owner bot
`.trim();
                await sock.sendMessage(from, { text: helpText });
                break;

            // ... (semua command yang sudah ada tetap sama)
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
            printQRInTerminal: false, // Matikan QR bawaan
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['WA Bot', 'Chrome', '1.0.0']
        });
        
        // Tambahkan event listener untuk QR
        sock.ev.on('connection.update', ({ qr }) => {
            if (qr) {
                qrcode.generate(qr, {
                    small: false, // Set false untuk ukuran normal
                    width: 40,    // Lebar QR
                    height: 40    // Tinggi QR (opsional, biasanya mengikuti width)
                });
            }
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
                
                // Setup reminder untuk semua grup
                sock.groupFetchAllParticipating().then(groups => {
                    Object.keys(groups).forEach(groupId => {
                        setupReminders(sock, groupId);
                    });
                });
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

        // Handle group participants update
        sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
            if (!config.welcomeEnabled) return;
            
            try {
                const metadata = await sock.groupMetadata(id);
                const formattedParticipants = participants.map(p => '@' + p.split('@')[0]).join(', ');
                
                if (action === 'add') {
                    await sock.sendMessage(id, { 
                        text: `Selamat datang ${formattedParticipants} di grup ${metadata.subject}! 👋\n\nSilakan baca deskripsi dan rules grup ya~`,
                        mentions: participants
                    });
                } else if (action === 'remove') {
                    await sock.sendMessage(id, {
                        text: `Selamat tinggal ${formattedParticipants} 👋`,
                        mentions: participants
                    });
                } else if (action === 'promote') {
                    await sock.sendMessage(id, {
                        text: `Selamat ${formattedParticipants} telah menjadi admin! 🎉`,
                        mentions: participants
                    });
                } else if (action === 'demote') {
                    await sock.sendMessage(id, {
                        text: `${formattedParticipants} telah diturunkan dari admin`,
                        mentions: participants
                    });
                }
            } catch (error) {
                console.error('Error handling group update:', error);
            }
        });

        // Handle group update (subject, description, settings)
        sock.ev.on('groups.update', async (updates) => {
            for (const update of updates) {
                try {
                    if (update.subject) {
                        await sock.sendMessage(update.id, { 
                            text: `Nama grup diubah menjadi: "${update.subject}"` 
                        });
                    }
                    if (update.desc) {
                        await sock.sendMessage(update.id, { 
                            text: 'Deskripsi grup telah diperbarui.'
                        });
                    }
                    if (update.restrict !== undefined) {
                        await sock.sendMessage(update.id, { 
                            text: `Grup telah ${update.restrict ? 'ditutup' : 'dibuka'} untuk member`
                        });
                    }
                    if (update.announce !== undefined) {
                        await sock.sendMessage(update.id, {
                            text: `Grup telah ${update.announce ? 'diatur hanya admin' : 'dibuka untuk semua member'} yang dapat mengirim pesan`
                        });
                    }
                } catch (error) {
                    console.error('Error handling group update:', error);
                }
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