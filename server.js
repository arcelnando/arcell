// Server Chat Minimalis untuk Album Khirza - V3.2 Final
// Nama file: server.js
// -----------------------------------------------------

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Konfigurasi CORS: Penting untuk mengizinkan koneksi dari file HTML lokal
const io = socketIo(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Data Akun Statis LENGKAP (Diperbarui dengan 'khirza')
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
        password: 'cantik', // Password diubah menjadi 'cantik'
        name: 'Khirza', 
        isVerified: false, 
        avatar: 'KH'
    }
};

const onlineUsers = {}; // Melacak Socket ID
const chatHistory = []; // Menyimpan riwayat pesan sederhana

io.on('connection', (socket) => {
    console.log(`[CONN] Pengguna terhubung: ${socket.id}`);
    
    // --- 1. IDENTIFIKASI & RIWAYAT ---
    socket.on('user_login', (userId) => {
        // Hapus koneksi lama jika ada (optional, tapi baik untuk kebersihan)
        for (const id in onlineUsers) {
            if (onlineUsers[id] === socket.id) {
                delete onlineUsers[id];
            }
        }

        onlineUsers[userId] = socket.id;
        socket.userId = userId;
        console.log(`[ONLINE] ${userId} sekarang online. Socket: ${socket.id}`);
        
        // Kirim riwayat chat ke klien yang baru login
        socket.emit('load_history', chatHistory); 
        
        // Kirim semua detail akun ke klien
        socket.emit('load_users', USER_ACCOUNTS); 
        
        // Broadcast status
        io.emit('user_status_update', Object.keys(onlineUsers));
    });
    
    // --- 2. LOGIKA CHAT ---
    socket.on('send_message', (data) => {
        const { senderId, message, media, id } = data; // Menerima data lengkap dari frontend
        const opponentId = senderId === 'zaza' ? 'khirza' : 'zaza';
        const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const messageId = id; // Menggunakan ID yang dibuat di frontend

        const messageData = {
            id: messageId,
            senderId: senderId,
            senderName: USER_ACCOUNTS[senderId].name,
            message: message,
            media: media, // Memasukkan media ke data pesan
            timestamp: timestamp,
            status: 'sent'
        };
        
        // Perbarui history (cari dan hapus pesan pending jika ada, lalu tambahkan yang baru)
        const existingIndex = chatHistory.findIndex(msg => msg.id === messageId);
        if (existingIndex !== -1) {
            chatHistory.splice(existingIndex, 1, messageData);
        } else {
            chatHistory.push(messageData);
        }
        

        // Kirim ke Pengirim (untuk update status 'sent')
        io.to(onlineUsers[senderId]).emit('receive_message', messageData); 
        
        const receiverSocketId = onlineUsers[opponentId];
        if (receiverSocketId) {
            // Kirim ke Penerima
            io.to(receiverSocketId).emit('receive_message', messageData);
            
            // Simulasi centang biru (read status)
            setTimeout(() => {
                const readStatusData = {...messageData, status: 'read'};
                // Update pengirim
                io.to(onlineUsers[senderId]).emit('update_status', readStatusData); 
                // Update penerima (optional, untuk menandakan pesan telah dibaca)
                io.to(receiverSocketId).emit('update_status', readStatusData); 
            }, 1500); 
            
        } else {
            // Jika offline, simulasikan centang 1 (sent)
            const sentStatusData = {...messageData, status: 'sent'};
            io.to(onlineUsers[senderId]).emit('update_status', sentStatusData);
        }
    });

    // --- 3. LOGIKA HAPUS UNTUK SEMUA ORANG ---
    socket.on('delete_message_for_everyone', (data) => {
        const { id, senderId } = data;
        const opponentId = senderId === 'zaza' ? 'khirza' : 'zaza';

        const index = chatHistory.findIndex(msg => msg.id == id);
        
        if (index !== -1) {
            // Update data di server history
            chatHistory[index].message = 'Pesan ini telah dihapus oleh pengirim.';
            chatHistory[index].media = null;
            chatHistory[index].deleted = true; 

            // Kirim notifikasi ke lawan bicara agar mereka juga mengupdate tampilan mereka
            const receiverSocketId = onlineUsers[opponentId];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('message_deleted_for_everyone', { id: id, senderId: senderId });
            }
        }
    });

    // --- 4. DISCONNECT ---
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
    console.log(`Server Chat Berjalan di http://localhost:${PORT}`);
});
