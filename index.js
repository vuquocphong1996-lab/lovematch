const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { createClient } = require('@supabase/supabase-js');

// --- CẤU HÌNH SUPABASE ---
const SUPABASE_URL = 'https://viqncwqlrwkdxfeglwcy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpcW5jd3FscndrZHhmZWdsd2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTk4ODksImV4cCI6MjA5MjA5NTg4OX0.qy9bW-BLuePq7Y0HFQTgKTSgzaLP1HvHdOpfUrjI87k';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.static('public'));

let waitingList = [];

io.on('connection', (socket) => {
    console.log('User kết nối:', socket.id);

    socket.on('start-match', (userData) => {
        socket.userData = userData;
        
        // Tìm người phù hợp giới tính
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

            // Gửi tên đối phương chính xác cho từng người
            socket.emit('matched', { partnerName: partner.userData.name, roomName: roomName });
            partner.emit('matched', { partnerName: socket.userData.name, roomName: roomName });
        } else {
            waitingList.push(socket);
            socket.emit('waiting', 'Đang tìm một nửa phù hợp...');
        }
    });

    socket.on('send-message', async (data) => {
        if (!data.room) return;
        socket.to(data.room).emit('receive-message', { msg: data.msg, isImage: data.isImage || false });

        // Lưu vào Supabase
        await supabase.from('messages').insert([{ 
            room: data.room, 
            sender: socket.userData.name, 
            content: data.isImage ? "[Hình ảnh]" : data.msg 
        }]);
    });

    socket.on('typing', (data) => {
        socket.to(data.room).emit('display-typing', data.isTyping);
    });

    socket.on('send-heart', (data) => {
        socket.to(data.room).emit('receive-heart');
    });

    // KHI MỘT NGƯỜI THOÁT, CẢ HAI CÙNG THOÁT
    socket.on('leave-room', () => {
        if (socket.currentRoom) {
            io.to(socket.currentRoom).emit('force-leave');
            socket.leave(socket.currentRoom);
            socket.currentRoom = null;
        }
    });

    socket.on('disconnect', () => {
        waitingList = waitingList.filter(s => s.id !== socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log('LoveMatch đang chạy tại cổng: ' + PORT);
});