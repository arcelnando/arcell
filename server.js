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

// Data Akun Statis LENGKAP (Harus sesuai dengan frontend)
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

const onlineUsers = {}; // Melacak Socket ID (Key: userId, Value: socket.id)
const chatHistory = []; // Menyimpan riwayat pesan sederhana

io.on('connection', (socket) => {
    console.log(`[CONN] Pengguna terhubung: ${socket.id}`);
    
    // --- 1. IDENTIFIKASI & RIWAYAT ---
    socket.on('user_login', (userId) => {
        // Hapus koneksi lama jika ada (Ini perlu karena Socket ID berubah setiap kali koneksi, 
        // tapi kita ingin menjaga userId tetap terikat ke satu koneksi aktif)
        // Kita tidak perlu menghapus secara eksplisit karena kita menimpa di bawah.
        
        onlineUsers[userId] = socket.id;
        socket.userId = userId;
        console.log(`[ONLINE] ${userId} sekarang online. Socket: ${socket.id}`);
        
        // Kirim semua detail akun ke klien
        socket.emit('load_users', USER_ACCOUNTS); 

        // Kirim riwayat chat ke klien yang baru login
        // PENTING: Frontend akan menggunakan data ini untuk mengisi LocalStorage
        socket.emit('receive_history', chatHistory); 
        
        // Broadcast status
        io.emit('user_status_update', Object.keys(onlineUsers));
    });
    
    // --- 2. LOGIKA CHAT ---
    socket.on('send_message', (data) => {
        const { senderId, message, media, id } = data; 
        const opponentId = senderId === 'zaza' ? 'khirza' : 'zaza';
        const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const messageId = id; 
        
        // *Perbaikan 1: Pastikan data pesan menggunakan timestamp server, bukan hanya dari klien (meskipun klien juga mengirim)*
        const messageData = {
            id: messageId,
            senderId: senderId,
            message: message,
            media: media, 
            timestamp: timestamp, // Gunakan timestamp server
            status: 'sent' // Default status setelah dikirim server
        };
        
        // Perbarui history (cari dan ganti/tambahkan pesan)
        const existingIndex = chatHistory.findIndex(msg => msg.id === messageId);
        if (existingIndex !== -1) {
            // Update pesan yang sudah ada (misalnya, jika status berubah dari 'pending' di klien)
            chatHistory.splice(existingIndex, 1, messageData);
        } else {
            // Tambahkan pesan baru
            chatHistory.push(messageData);
        }
        
        // *Perbaikan 2: Kirim kembali ke pengirim untuk mengupdate status dari 'pending' ke 'sent'*
        if (onlineUsers[senderId]) {
            io.to(onlineUsers[senderId]).emit('update_status', { id: messageId, status: 'sent' });
        }


        const receiverSocketId = onlineUsers[opponentId];
        if (receiverSocketId) {
            // Kirim ke Penerima
            io.to(receiverSocketId).emit('receive_message', messageData);
            
            // Simulasi centang biru (read status)
            setTimeout(() => {
                const readStatusData = {id: messageId, status: 'read'};
                
                // *Perbaikan 3: Update status di history server agar bertahan*
                const historyIndex = chatHistory.findIndex(msg => msg.id === messageId);
                if (historyIndex !== -1) {
                    chatHistory[historyIndex].status = 'read';
                }

                // Update pengirim dan penerima
                if (onlineUsers[senderId]) {
                    io.to(onlineUsers[senderId]).emit('update_status', readStatusData); 
                }
                io.to(receiverSocketId).emit('update_status', readStatusData); 
            }, 1500); 
            
        } else {
            // Jika offline, status tetap 'sent' (centang dua abu-abu) - status ini sudah terkirim ke pengirim di P2.
             console.log(`[OFFLINE] ${opponentId} offline. Pesan akan dikirim setelah online.`);
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
            chatHistory[index].status = 'deleted'; // Tambahkan status deleted

            // Kirim notifikasi ke pengirim
            if (onlineUsers[senderId]) {
                 io.to(onlineUsers[senderId]).emit('message_deleted_for_everyone', { id: id, senderId: senderId });
            }

            // Kirim notifikasi ke lawan bicara agar mereka juga mengupdate tampilan mereka
            const receiverSocketId = onlineUsers[opponentId];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('message_deleted_for_everyone', { id: id, senderId: senderId });
            }
            console.log(`[DELETE] Pesan ID ${id} dihapus oleh ${senderId} untuk semua orang.`);
        }
    });

    // --- 4. DISCONNECT ---
    socket.on('disconnect', () => {
        if (socket.userId) {
            // Menghapus hanya user yang terikat dengan socket yang terputus
            if (onlineUsers[socket.userId] === socket.id) {
                delete onlineUsers[socket.userId];
                console.log(`[OFFLINE] ${socket.userId} terputus.`);
                io.emit('user_status_update', Object.keys(onlineUsers));
            }
        }
    });
});

// Jalankan server di port 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server Chat Berjalan di http://localhost:${PORT}`);
});
