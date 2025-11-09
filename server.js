// Server Chat Minimalis untuk Album Khirza - V3.2 Final
// Nama file: server.js
// -----------------------------------------------------

// --- PENAMBAHAN 1: Memuat dotenv dan OpenAI ---
require('dotenv').config(); 
const { OpenAI } = require('openai'); 

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path'); 

const app = express();
const server = http.createServer(app);

// --- PENAMBAHAN 2: Inisialisasi Klien OpenAI ---
// Kunci API diambil dari process.env.OPENAI_API_KEY (dari file .env)
const openai = new OpenAI(); 

// Konfigurasi CORS
const io = socketIo(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// --- PENAMBAHAN FUNGSI PENYAJIAN HTML ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Data Akun Statis LENGKAP (TIDAK BERUBAH)
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
const chatHistory = []; 

// =======================================================
// === FUNGSI LOGIKA ZAZA AI (BARU: Terhubung ke ChatGPT)
// =======================================================

/**
 * Fungsi ini mengirim prompt ke API ChatGPT dan mengembalikan respons teks.
 * System message memberikan konteks/persona pada AI.
 */
async function getChatGPTResponse(prompt) {
    // Definisi persona Zaza AI
    const systemMessage = "Anda adalah Zaza AI, asisten virtual yang ramah dan penuh kasih untuk Album Digital Celz. Jawablah dengan nada yang manis, singkat, dan relevan dengan album digital, Khirza, atau percintaan. Batasi jawaban Anda maksimal 3 kalimat.";

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // Model yang cepat dan efisien
            messages: [
                {"role": "system", "content": systemMessage},
                {"role": "user", "content": prompt}
            ],
            temperature: 0.8, // Sedikit lebih kreatif
            max_tokens: 150, // Batasan token agar respons singkat
        });

        // Cek apakah ada respons
        return completion.choices[0].message.content.trim();
        
    } catch (error) {
        console.error("Error saat memanggil OpenAI API:", error);
        return "Maaf, Zaza AI sedang sibuk memproses kenangan indah. Ada masalah saat menghubungi server AI. Coba lagi sebentar ya.";
    }
}


io.on('connection', (socket) => {
    console.log(`[CONN] Pengguna terhubung: ${socket.id}`);
    
    // --- 1. IDENTIFIKASI & RIWAYAT ---
    socket.on('user_login', (userId) => {
        for (const id in onlineUsers) {
            if (onlineUsers[id] === socket.id) {
                delete onlineUsers[id];
            }
        }

        onlineUsers[userId] = socket.id;
        socket.userId = userId;
        console.log(`[ONLINE] ${userId} sekarang online. Socket: ${socket.id}`);
        
        socket.emit('load_history', chatHistory); 
        socket.emit('load_users', USER_ACCOUNTS); 
        
        io.emit('user_status_update', Object.keys(onlineUsers));
    });

    // --- 2. LOGIKA CHAT BIASA (TIDAK BERUBAH) ---
    socket.on('send_message', (data) => {
        const { senderId, message } = data;
        const opponentId = senderId === 'zaza' ? 'khirza' : 'zaza';
        const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const messageId = Date.now() + Math.random().toFixed(0); 

        const messageData = {
            id: messageId,
            senderId: senderId,
            senderName: USER_ACCOUNTS[senderId].name,
            message: message,
            timestamp: timestamp,
            status: 'sent'
        };
        
        chatHistory.push(messageData);

        io.to(onlineUsers[senderId]).emit('receive_message', messageData); 
        
        const receiverSocketId = onlineUsers[opponentId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('receive_message', messageData);
            
            setTimeout(() => {
                const readStatusData = {...messageData, status: 'read'};
                io.to(onlineUsers[senderId]).emit('update_status', readStatusData);
            }, 1500); 
            
        } else {
            const sentStatusData = {...messageData, status: 'sent'};
            io.to(onlineUsers[senderId]).emit('update_status', sentStatusData);
        }
    });
    
    // =======================================================
    // --- 4. LOGIKA CHAT ZAZA AI (MENGGUNAKAN CHATGPT) ---
    // =======================================================
    socket.on('send_ai_message', async (data) => {
        const { prompt } = data;
        
        try {
            // Panggil fungsi yang terhubung ke ChatGPT API
            const aiResponseText = await getChatGPTResponse(prompt); 
            
            const responseData = {
                sender: 'zaza', // Tetap menggunakan 'zaza' sebagai identitas AI
                message: aiResponseText,
                timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            };
            
            // Kirim respons kembali ke klien yang mengirim pesan
            socket.emit('receive_ai_message', responseData);
            
        } catch (error) {
             const errorResponse = {
                sender: 'zaza', 
                message: "Error Server: Tidak bisa menghubungi ChatGPT API. Periksa kunci dan koneksi Anda.",
                timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            };
            socket.emit('receive_ai_message', errorResponse);
        }
    });
    // =======================================================


    // --- 3. DISCONNECT (TIDAK BERUBAH) ---
    socket.on('disconnect', () => {
        if (socket.userId) {
            delete onlineUsers[socket.userId];
            console.log(`[OFFLINE] ${socket.userId} terputus.`);
            io.emit('user_status_update', Object.keys(onlineUsers));
        }
    });
});

// Jalankan server di port 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server Chat & Album Berjalan di http://localhost:${PORT}`);
    console.log(`Buka http://localhost:${PORT} di browser Anda.`);
});
