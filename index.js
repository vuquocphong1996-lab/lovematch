const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { createClient } = require('@supabase/supabase-js');

// --- CẤU HÌNH SUPABASE ---
const SUPABASE_URL = 'https://viqncwqlrwkdxfeglwcy.supabase.co'; // Điền lại nhé
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpcW5jd3FscndrZHhmZWdsd2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTk4ODksImV4cCI6MjA5MjA5NTg4OX0.qy9bW-BLuePq7Y0HFQTgKTSgzaLP1HvHdOpfUrjI87k'; // Điền lại nhé
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.static('public'));

let waitingList = [];
let totalOnline = 0; // Biến đếm tổng số người đang online

io.on('connection', (socket) => {
    // 1. KHI CÓ NGƯỜI VÀO: Tăng số lượng và báo cho mọi người
    totalOnline++;
    io.emit('update-online', totalOnline);
    console.log('User kết nối. Tổng số:', totalOnline);

    socket.on('start-match', (userData) => {
        socket.userData = userData;
        
        const partnerIndex = waitingList.findIndex(user => 
            (userData.findGender === 'Both' || user.userData.gender === userData.findGender) &&
            (user.userData.findGender === 'Both' || userData.gender === user.userData.findGender)
        );

        if (partnerIndex !== -1) {
            const partner = waitingList.splice(partnerIndex, 1)[0];
            const roomName = `love-room-${partner.id}-${socket.id}`;
            
            socket.join(roomName);
            partner.join(roomName);
            socket.currentRoom = roomName;
            partner.currentRoom = roomName;

            socket.emit('matched', { partnerName: partner.userData.name, roomName: roomName });
            partner.emit('matched', { partnerName: socket.userData.name, roomName: roomName });
        } else {
            waitingList.push(socket);
            socket.emit('waiting', 'Đang tìm một nửa phù hợp...');
        }
    });

    socket.on('send-message', async (data) => {
        if (!data.room) return;
        
        // Gửi tin nhắn và kèm theo ID để check "Đã đọc"
        socket.to(data.room).emit('receive-message', { 
            msgId: data.msgId, // Gửi ID tin nhắn đi
            msg: data.msg, 
            isImage: data.isImage || false 
        });

        // Lưu vào Supabase
        await supabase.from('messages').insert([{ 
            room: data.room, 
            sender: socket.userData.name, 
            content: data.isImage ? "[Hình ảnh]" : data.msg 
        }]);
    });

    // 3. XỬ LÝ TRẠNG THÁI "ĐÃ ĐỌC"
    socket.on('mark-read', (data) => {
        socket.to(data.room).emit('message-read', data.msgId);
    });

    socket.on('typing', (data) => {
        socket.to(data.room).emit('display-typing', data.isTyping);
    });

    socket.on('send-heart', (data) => {
        socket.to(data.room).emit('receive-heart');
    });

    socket.on('leave-room', () => {
        if (socket.currentRoom) {
            io.to(socket.currentRoom).emit('force-leave');
            socket.leave(socket.currentRoom);
            socket.currentRoom = null;
        }
    });

    // KHI CÓ NGƯỜI THOÁT: Giảm số lượng và báo lại
    socket.on('disconnect', () => {
        totalOnline--;
        io.emit('update-online', totalOnline);
        waitingList = waitingList.filter(s => s.id !== socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log('LoveMatch đang chạy tại cổng: ' + PORT);
});