// ======================================================
// Server Chat Minimalis untuk Album Khirza - V4.0 (SUPABASE + GROQ AI)
// ======================================================

require('dotenv').config();
const Groq = require("groq-sdk");
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path'); 

// --- SUPABASE CLIENT ---
const { createClient } = require('@supabase/supabase-js');

// PENTING: Menggunakan variabel lingkungan yang aman (Service Role Key)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; 

// Menginisialisasi Supabase dengan Service Key yang aman
if (!SUPABASE_KEY || !SUPABASE_URL) {
    console.warn("PERINGATAN: Kunci atau URL Supabase belum disetel di .env. Fitur Chat akan berjalan, tetapi RIWAYAT TIDAK AKAN TERSIMPAN.");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


// Inisialisasi Groq (dari file .env)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
const server = http.createServer(app);

// Konfigurasi CORS
const io = socketIo(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Data akun statis
const USER_ACCOUNTS = {
    'zaza': { id: 'zaza', password: 'zaza', name: 'Zaza', isVerified: true, avatar: 'ZA', role: 'Software Engineer', bio: 'Mengejar mimpi dan cinta.', isOnline: false, lastSeen: null },
    'khirza': { id: 'khirza', password: 'cantik', name: 'Khirza', isVerified: false, avatar: 'KH', role: 'Mahasiswa', bio: 'Selalu semangat dan tersenyum.', isOnline: false, lastSeen: null },
    'anomali1': { id: 'anomali1', password: 'anomali1', name: 'Anomali 1', isVerified: false, avatar: '1', role: 'Pengguna', bio: 'Saya adalah anomali pertama.', isOnline: false, lastSeen: null },
    'anomali2': { id: 'anomali2', password: 'anomali2', name: 'Anomali 2', isVerified: false, avatar: '2', role: 'Pengguna', bio: 'Saya adalah anomali kedua.', isOnline: false, lastSeen: null },
    'anomali3': { id: 'anomali3', password: 'anomali3', name: 'Anomali 3', isVerified: false, avatar: '3', role: 'Pengguna', bio: 'Saya adalah anomali ketiga.', isOnline: false, lastSeen: null }
};

const onlineUsers = {};

// =======================================================
// === Fungsi Zaza AI ===
// =======================================================
async function getGroqResponse(prompt) {
    const systemMessage = "Anda adalah Zaza AI, asisten virtual yang ramah dan penuh kasih untuk Album Digital Celz. Jawablah dengan nada manis, singkat, dan relevan dengan album digital, Khirza, atau percintaan. Batasi jawaban maksimal 3 kalimat.";

    try {
        const completion = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "system", content: systemMessage }, { role: "user", content: prompt }],
            temperature: 0.8,
            max_tokens: 150,
        });
        return completion.choices[0].message.content.trim();
    } catch (error) {
        console.error("Error saat memanggil Groq API:", error);
        return "Zaza AI lagi ngelamun sebentar... coba kirim lagi nanti ya 💭";
    }
}

// =======================================================
// === Socket.IO Logika Chat dan Status ===
// =======================================================
io.on('connection', (socket) => {
    console.log(`[CONN] Pengguna terhubung: ${socket.id}`);

    const sendUserStatusUpdate = () => {
        const usersData = {};
        Object.keys(USER_ACCOUNTS).forEach(userId => {
            usersData[userId] = {
                isOnline: USER_ACCOUNTS[userId].isOnline,
                lastSeen: USER_ACCOUNTS[userId].lastSeen
            };
        });
        io.emit('user_status_update', usersData);
    };

    // --- LOGIN USER ---
    socket.on('user_login', (userId) => {
        if (onlineUsers[userId] && onlineUsers[userId] !== socket.id) {
            io.to(onlineUsers[userId]).emit('duplicate_login', { message: 'Anda login di tempat lain.' });
        }
        onlineUsers[userId] = socket.id;
        socket.userId = userId;
        socket.join(userId);

        USER_ACCOUNTS[userId].isOnline = true;
        USER_ACCOUNTS[userId].lastSeen = null; 
        console.log(`[ONLINE] ${userId} sekarang online.`);
        io.emit('load_users', USER_ACCOUNTS); 
        sendUserStatusUpdate();
    });
    
    // --- LOGOUT USER ---
    socket.on('user_logout', (userId) => {
        if (onlineUsers[userId]) {
            delete onlineUsers[userId];
            socket.userId = null;
            USER_ACCOUNTS[userId].isOnline = false;
            USER_ACCOUNTS[userId].lastSeen = Date.now(); 
            console.log(`[OFFLINE] ${userId} logged out.`);
            sendUserStatusUpdate();
        }
    });


    // --- CHAT BIASA: SIMPAN KE SUPABASE & KIRIM VIA SOCKET ---
    socket.on('send_message', async (data) => {
        const { senderId, recipientId } = data;
        const senderDetails = USER_ACCOUNTS[senderId] || { name: 'Unknown' };
        
        // 1. Persiapkan Data Pesan
        const messageId = Date.now() + Math.floor(Math.random() * 1000);
        const messageData = {
            ...data,
            id: messageId,
            senderName: senderDetails.name, 
            timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            status: 'sent' 
        };

        // 2. SIMPAN KE SUPABASE
        if (SUPABASE_KEY) {
            try {
                const { error } = await supabase
                    .from('messages') 
                    .insert([
                        {
                            sender_id: senderId,
                            recipient_id: recipientId,
                            message_text: data.message,
                            media_url: data.media,
                            status: 'sent' 
                        }
                    ]);

                if (error) {
                    console.error("Gagal menyimpan ke Supabase:", error.message);
                    // Kirim pesan kesalahan kembali ke pengirim
                    io.to(onlineUsers[senderId]).emit('receive_message', {
                        ...messageData,
                        message: `[GAGAL DISIMPAN] ${data.message}`,
                        status: 'error'
                    });
                    return;
                }
                console.log(`[DB] Pesan disimpan. ID Pesan Lokal: ${messageId}`);
            } catch (dbError) {
                console.error("Kesalahan umum koneksi DB:", dbError);
            }
        }
        
        // 3. Kirim via Socket.IO (Real-time)
        console.log(`[MESSAGE] Dari ${senderId} ke ${recipientId}: ${messageData.message || '[MEDIA]'}`);

        // Kirim pesan kembali ke PENGIRIM (menggantikan pesan 'schedule')
        io.to(onlineUsers[senderId]).emit('receive_message', messageData);

        // Kirim pesan ke PENERIMA
        const receiverSocketId = onlineUsers[recipientId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('receive_message', messageData);
        }
    });

    // --- STATUS PESAN 'READ': UPDATE SUPABASE & KIRIM VIA SOCKET ---
    socket.on('message_read', async ({ id, senderId, recipientId }) => {
        const senderSocketId = onlineUsers[senderId];
        
        // 1. Update status di Supabase
        if (SUPABASE_KEY) {
            try {
                // Gunakan update berdasarkan kriteria (sender, recipient, status='sent')
                const { error } = await supabase
                    .from('messages')
                    .update({ status: 'read' })
                    .match({ sender_id: senderId, recipient_id: recipientId, status: 'sent' }); 

                if (error) {
                    console.error("Gagal update status read di Supabase:", error.message);
                } else {
                     console.log(`[DB] Pesan diupdate menjadi 'read' untuk pengirim ${senderId}.`);
                }
            } catch (dbError) {
                 console.error("Kesalahan umum saat update status read:", dbError);
            }
        }

        // 2. Kirim status 'read' via Socket.IO
        if (senderSocketId) {
             const readStatusData = { 
                 id: id, 
                 status: 'read', 
                 senderId: recipientId, 
                 recipientId: senderId  
             };
             io.to(senderSocketId).emit('update_status', readStatusData);
        }
    });
    
    // --- STATUS STORIES BARU ---
    socket.on('status_created', (data) => {
        socket.broadcast.emit('receive_status_update', data.senderId);
    });

    // --- CHAT DENGAN ZAZA AI ---
    socket.on('send_ai_message', async (data) => {
        const { prompt } = data; 
        try {
            const aiResponseText = await getGroqResponse(prompt);
            const responseData = {
                sender: 'zaza',
                message: aiResponseText,
                timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            };
            socket.emit('receive_ai_message', responseData);
        } catch (error) {
            const errorResponse = {
                sender: 'zaza',
                message: "Error Server: Tidak bisa menghubungi Groq API. Periksa kunci dan koneksi Anda.",
                timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            };
            socket.emit('receive_ai_message', errorResponse);
        }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        if (socket.userId && onlineUsers[socket.userId] === socket.id) {
            delete onlineUsers[socket.userId];
            USER_ACCOUNTS[socket.userId].isOnline = false;
            USER_ACCOUNTS[socket.userId].lastSeen = Date.now(); 
            console.log(`[OFFLINE] ${socket.userId} terputus.`);
            sendUserStatusUpdate();
        }
    });
});

// =======================================================
// === Jalankan Server ===
// =======================================================

app.use(express.static(__dirname)); 

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server Chat & Album Berjalan di port ${PORT}`);
    console.log(`URL Eksternal: Jika ini di-deploy, gunakan URL publik Render Anda.`);
});
