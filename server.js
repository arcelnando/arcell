// ======================================================
// Server Chat Minimalis untuk Album Khirza - V3.4 (GROQ AI)
// ======================================================

require('dotenv').config();
const Groq = require("groq-sdk");
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Inisialisasi Groq dengan API Key dari file .env
// Pastikan variabel lingkungan GROQ_API_KEY sudah terisi di file .env
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Konfigurasi CORS
const io = socketIo(server, {
    cors: {
        // Mengizinkan semua origin untuk akses dari browser (http://localhost:port_html)
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Data akun statis (harus match dengan HTML)
const USER_ACCOUNTS = {
    'zaza': {
        id: 'zaza',
        password: 'zaza',
        name: 'Zaza',
        isVerified: true,
        avatar: 'ZA'
    },
    'khirza': {
        id: 'khirza',
        password: 'cantik',
        name: 'Khirza',
        isVerified: false,
        avatar: 'KH'
    }
};

const onlineUsers = {};
const chatHistory = []; // Untuk menyimpan history chat biasa

// =======================================================
// === Fungsi Zaza AI (pakai Groq) ===
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
// === Socket.IO Logika Chat ===
// =======================================================
io.on('connection', (socket) => {
    console.log(`[CONN] Pengguna terhubung: ${socket.id}`);

    // --- LOGIN USER ---
    socket.on('user_login', (userId) => {
        // Hapus socket ID lama jika ada
        for (const id in onlineUsers) {
            if (onlineUsers[id] === socket.id) delete onlineUsers[id];
        }

        onlineUsers[userId] = socket.id;
        socket.userId = userId;
        console.log(`[ONLINE] ${userId} sekarang online.`);

        // Kirim data awal ke user yang baru login
        socket.emit('load_history', chatHistory);
        socket.emit('load_users', USER_ACCOUNTS);
        
        // Broadcast status online ke semua
        io.emit('user_status_update', Object.keys(onlineUsers));
    });
    
    // --- LOGOUT USER ---
    socket.on('user_logout', (userId) => {
        if (onlineUsers[userId]) {
            delete onlineUsers[userId];
            socket.userId = null;
            console.log(`[OFFLINE] ${userId} logged out.`);
            io.emit('user_status_update', Object.keys(onlineUsers));
        }
    });


    // --- CHAT BIASA (Diperbaiki agar status dan recipient ID sesuai HTML) ---
    socket.on('send_message', (data) => {
        // Data yang diterima: { senderId, recipientId, message, media, timestamp, status }
        const { senderId, recipientId, message, media, timestamp } = data;
        const opponentId = recipientId; // Lawan bicara adalah recipientId

        // Generate ID unik untuk persistence di client
        const messageId = Date.now() + Math.random().toFixed(0);

        const messageData = {
            id: messageId,
            senderId,
            recipientId, // Tambahkan recipientId ke data pesan
            senderName: USER_ACCOUNTS[senderId].name,
            message,
            media, // Tambahkan media
            timestamp,
            status: 'sent' // Status awal di server
        };

        chatHistory.push(messageData);
        console.log(`[MESSAGE] Dari ${senderId} ke ${recipientId}: ${message || '[MEDIA]'}`);


        // 1. Kirim pesan kembali ke pengirim (untuk persistence/tampilan)
        io.to(onlineUsers[senderId]).emit('receive_message', messageData);

        // 2. Kirim pesan ke penerima
        const receiverSocketId = onlineUsers[opponentId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('receive_message', messageData);
            
            // Simulasikan status 'read' setelah 1.5 detik
            setTimeout(() => {
                const readStatusData = { ...messageData, status: 'read' };
                // Kirim update status 'read' hanya ke pengirim
                io.to(onlineUsers[senderId]).emit('update_status', readStatusData);
            }, 1500);
        } else {
            // Jika penerima offline, status tetap 'sent'
            const sentStatusData = { ...messageData, status: 'sent' };
            io.to(onlineUsers[senderId]).emit('update_status', sentStatusData);
        }
    });

    // --- CHAT DENGAN ZAZA AI (Diubah ke event yang dipanggil dari HTML) ---
    socket.on('send_ai_message', async (data) => {
        const { prompt } = data; // Data yang diterima: { prompt }

        try {
            const aiResponseText = await getGroqResponse(prompt);

            const responseData = {
                sender: 'zaza',
                message: aiResponseText,
                timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            };
            
            // Kirim balasan kembali ke pengirim (client)
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
        if (socket.userId && onlineUsers[socket.userId]) {
            delete onlineUsers[socket.userId];
            console.log(`[OFFLINE] ${socket.userId} terputus.`);
            io.emit('user_status_update', Object.keys(onlineUsers));
        }
    });
});

// =======================================================
// === Jalankan Server ===
// =======================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server Chat & Album Berjalan di http://localhost:${PORT}`);
    console.log(`Buka file index.html atau akses server di port ini.`);
});
