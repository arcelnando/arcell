// ======================================================
// Server Chat Minimalis untuk Album Khirza - V3.4 (GROQ AI)
// ======================================================

require('dotenv').config();
const Groq = require("groq-sdk");
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Inisialisasi Groq dengan API Key dari file .env
// Pastikan variabel lingkungan GROQ_API_KEY sudah terisi di file .env
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
const server = http.createServer(app);

// Konfigurasi CORS
const io = socketIo(server, {
    cors: {
        // Mengizinkan semua origin untuk akses dari browser (http://localhost:port_html)
        // Jika di-deploy ke Render, ini harus disetel ke URL Vercel/frontend Anda
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Data akun statis (HARUS MATCH DENGAN DEFAULT DI HTML)
const USER_ACCOUNTS = {
    'zaza': {
        id: 'zaza',
        password: 'zaza',
        name: 'Zaza',
        isVerified: true,
        avatar: 'ZA',
        role: 'Software Engineer', 
        bio: 'Mengejar mimpi dan cinta.',
        isOnline: false, // Tambahkan status awal
        lastSeen: null
    },
    'khirza': {
        id: 'khirza',
        password: 'cantik',
        name: 'Khirza',
        isVerified: false,
        avatar: 'KH',
        role: 'Mahasiswa', 
        bio: 'Selalu semangat dan tersenyum.',
        isOnline: false,
        lastSeen: null
    },
    'anomali1': {
        id: 'anomali1',
        password: 'anomali1',
        name: 'Anomali 1',
        isVerified: false,
        avatar: '1',
        role: 'Pengguna', 
        bio: 'Saya adalah anomali pertama.',
        isOnline: false,
        lastSeen: null
    },
    'anomali2': {
        id: 'anomali2',
        password: 'anomali2',
        name: 'Anomali 2',
        isVerified: false,
        avatar: '2',
        role: 'Pengguna', 
        bio: 'Saya adalah anomali kedua.',
        isOnline: false,
        lastSeen: null
    },
    'anomali3': {
        id: 'anomali3',
        password: 'anomali3',
        name: 'Anomali 3',
        isVerified: false,
        avatar: '3',
        role: 'Pengguna', 
        bio: 'Saya adalah anomali ketiga.',
        isOnline: false,
        lastSeen: null
    }
};

const onlineUsers = {};

// =======================================================
// === Fungsi Zaza AI (Model: llama-3.1-8b-instant) ===
// =======================================================
async function getGroqResponse(prompt) {
    const systemMessage = "Anda adalah Zaza AI, asisten virtual yang ramah dan penuh kasih untuk Album Digital Celz. Jawablah dengan nada manis, singkat, dan relevan dengan album digital, Khirza, atau percintaan. Batasi jawaban maksimal 3 kalimat.";

    try {
        const completion = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: prompt }
            ],
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

    // --- UTILITY UNTUK UPDATE STATUS PENGGUNA (FIX LOGIKA LAST SEEN) ---
    const sendUserStatusUpdate = () => {
        const usersData = {};
        
        // Kumpulkan data terbaru untuk broadcast
        Object.keys(USER_ACCOUNTS).forEach(userId => {
            usersData[userId] = {
                isOnline: USER_ACCOUNTS[userId].isOnline,
                lastSeen: USER_ACCOUNTS[userId].lastSeen
            };
        });
        // Kirim update status ke semua klien
        io.emit('user_status_update', usersData);
    };

    // --- LOGIN USER ---
    socket.on('user_login', (userId) => {
        // Logika untuk menangani koneksi duplikat (opsional tapi bagus)
        if (onlineUsers[userId] && onlineUsers[userId] !== socket.id) {
            io.to(onlineUsers[userId]).emit('duplicate_login', { message: 'Anda login di tempat lain.' });
        }
        
        onlineUsers[userId] = socket.id;
        socket.userId = userId;
        socket.join(userId); // Bergabung ke "room" sendiri

        USER_ACCOUNTS[userId].isOnline = true;
        USER_ACCOUNTS[userId].lastSeen = null; // Reset lastSeen saat login
        
        console.log(`[ONLINE] ${userId} sekarang online.`);

        // Kirim semua detail akun default (termasuk lastSeen/isOnline) ke client
        // FIX: Kirim seluruh objek USERS_ACCOUNTS agar client dapat memuat semua profile.
        io.emit('load_users', USER_ACCOUNTS); 
        
        // Broadcast status online/offline ke semua
        sendUserStatusUpdate();
    });
    
    // --- LOGOUT USER ---
    socket.on('user_logout', (userId) => {
        if (onlineUsers[userId]) {
            delete onlineUsers[userId];
            socket.userId = null;
            
            USER_ACCOUNTS[userId].isOnline = false;
            USER_ACCOUNTS[userId].lastSeen = Date.now(); // Set lastSeen
            
            console.log(`[OFFLINE] ${userId} logged out.`);
            sendUserStatusUpdate();
        }
    });


    // --- CHAT BIASA (FIX: MENGATASI DOUBLE CHAT DAN STATUS) ---
    socket.on('send_message', (data) => {
        const { senderId, recipientId } = data;
        
        const senderDetails = USER_ACCOUNTS[senderId] || { name: 'Unknown' };

        // Server yang memberikan ID unik dan status 'sent'
        const messageId = Date.now() + Math.floor(Math.random() * 1000);
        
        const messageData = {
            ...data,
            id: messageId,
            senderName: senderDetails.name, 
            timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            status: 'sent' // Status awal dari server adalah 'sent'
        };

        console.log(`[MESSAGE] Dari ${senderId} ke ${recipientId}: ${messageData.message || '[MEDIA]'}`);

        // 1. Kirim pesan kembali ke PENGIRIM (untuk render dengan ID dan status 'sent' yang benar)
        // Ini menggantikan pesan 'schedule' yang dibuat sementara di frontend.
        io.to(onlineUsers[senderId]).emit('receive_message', messageData);

        // 2. Kirim pesan ke PENERIMA
        const receiverSocketId = onlineUsers[recipientId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('receive_message', messageData);
        } else {
            // Jika penerima offline, tidak perlu bertindak. Status tetap 'sent'.
        }
    });

    // --- STATUS PESAN 'READ' DARI PENERIMA (FIX: MENGUBAH STATUS DI PENGIRIM) ---
    socket.on('message_read', ({ id, senderId, recipientId }) => {
        const senderSocketId = onlineUsers[senderId];
        
        if (senderSocketId) {
             console.log(`[STATUS] Pesan ${id} dibaca oleh ${recipientId}.`);
             const readStatusData = { 
                 id: id, 
                 status: 'read', 
                 senderId: recipientId, // Penerima adalah yang membaca
                 recipientId: senderId  // Pengirim adalah yang menerima update status
             };
             
             // Kirim status 'read' ke Pengirim
             io.to(senderSocketId).emit('update_status', readStatusData);
             
             // Opsional: Kirim status 'read' ke Penerima itu sendiri agar dia tahu pesan tersebut telah diproses.
             // io.to(onlineUsers[recipientId]).emit('update_status', readStatusData);
        }
    });
    
    // --- STATUS STORIES BARU ---
    socket.on('status_created', (data) => {
        console.log(`[STATUS] Status baru dibuat oleh: ${data.senderId}. Broadcasting update.`);
        
        // Kirim sinyal ke SEMUA klien KECUALI pengirim.
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

// Express akan mencari file statis (HTML, CSS, JS) di root folder
app.use(express.static(__dirname)); 

// Mengarahkan ke index.html
app.get('/', (req, res) => {
    // Jika Anda hosting di Render, tidak perlu index.html karena Vercel sudah menangani frontend.
    // Tetapi jika menjalankan secara lokal:
    res.sendFile(path.join(__dirname, 'index.html'));
});

// FIX: Gunakan variabel lingkungan PORT untuk kompatibilitas hosting
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server Chat & Album Berjalan di port ${PORT}`);
    console.log(`URL Eksternal: Jika ini di-deploy, gunakan URL publik Render Anda.`);
});
