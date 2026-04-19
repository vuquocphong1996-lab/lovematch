const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { createClient } = require('@supabase/supabase-js');

// --- CẤU HÌNH SUPABASE ---
const SUPABASE_URL = 'https://viqncwqlrwkdxfeglwcy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iUvjQWKIUkJaD4PqH_WQbA_ygDkUp_5';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.static('public'));

let waitingList = [];

io.on('connection', (socket) => {
    console.log('Người dùng mới đã vào LoveMatch:', socket.id);

    socket.on('start-match', (userData) => {
        socket.userData = userData;
        
        // Lọc người dùng theo giới tính và yêu cầu
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

            io.to(roomName).emit('matched', {
                partnerName: partner.userData.name,
                roomName: roomName
            });
        } else {
            waitingList.push(socket);
            socket.emit('waiting', 'Đang tìm kiếm một nửa phù hợp...');
        }
    });

    socket.on('send-message', async (data) => {
        if (!data.room) return;
        
        socket.to(data.room).emit('receive-message', {
            msg: data.msg,
            isImage: data.isImage || false
        });

        // Lưu lịch sử tin nhắn vào Supabase
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

    socket.on('leave-room', () => {
        if (socket.currentRoom) {
            socket.to(socket.currentRoom).emit('partner-left');
            socket.leave(socket.currentRoom);
            socket.currentRoom = null;
        }
    });

    socket.on('disconnect', () => {
        waitingList = waitingList.filter(s => s.id !== socket.id);
    });
});

// Cấu hình cổng PORT để chạy được trên Render/Heroku
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log('LoveMatch đang chạy tại cổng: ' + PORT);
});