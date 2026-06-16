require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const sessionManager = require('./automation/sessionManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Pass socket.io to session manager for real-time updates
sessionManager.setIO(io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.use('/api', require('./routes/api'));
app.use('/api/automation', require('./routes/automation'));

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current session state on connect
  socket.emit('sessions_init', sessionManager.getSessions());

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
server.listen(config.port, () => {
  console.log(`\n🚀 OTP Automation Server running on port ${config.port}`);
  console.log(`🌐 Open: http://localhost:${config.port}\n`);
});
