// WebSocket Service for Real-Time Updates
// Uses Socket.IO for bi-directional real-time communication
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

class WebSocketService {
  constructor() {
    this.io = null;
    this.redisClient = null;
    this.connections = new Map(); // userId -> Set of socket IDs
  }

  /**
   * Initialize WebSocket server
   */
  async initialize(httpServer, options = {}) {
    const {
      corsOrigins = ['http://localhost:3000', 'http://localhost:5173', 'https://crm.pandaadmin.com'],
      redisUrl = process.env.REDIS_URL,
    } = options;

    // Create Socket.IO server
    this.io = new Server(httpServer, {
      cors: {
        origin: corsOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Set up Redis adapter for horizontal scaling (if Redis URL provided)
    if (redisUrl) {
      try {
        const pubClient = createClient({ url: redisUrl });
        const subClient = pubClient.duplicate();

        await Promise.all([pubClient.connect(), subClient.connect()]);

        this.io.adapter(createAdapter(pubClient, subClient));
        this.redisClient = pubClient;
        console.log('WebSocket Redis adapter connected');
      } catch (error) {
        console.warn('Redis connection failed, using in-memory adapter:', error.message);
      }
    }

    // Set up connection handling
    this.io.on('connection', (socket) => this.handleConnection(socket));

    console.log('WebSocket server initialized');
    return this.io;
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    const userId = socket.handshake.auth?.userId;
    const token = socket.handshake.auth?.token;

    console.log(`Socket connected: ${socket.id}, User: ${userId || 'anonymous'}`);

    // Join user-specific room
    if (userId) {
      socket.join(`user:${userId}`);
      this.trackConnection(userId, socket.id);
    }

    // Handle room subscriptions
    socket.on('subscribe', (rooms) => {
      if (Array.isArray(rooms)) {
        rooms.forEach(room => {
          if (this.isValidRoom(room)) {
            socket.join(room);
            console.log(`Socket ${socket.id} joined room: ${room}`);
          }
        });
      }
    });

    socket.on('unsubscribe', (rooms) => {
      if (Array.isArray(rooms)) {
        rooms.forEach(room => socket.leave(room));
      }
    });

    // Handle entity subscriptions (e.g., subscribe to opportunity updates)
    socket.on('subscribe:entity', ({ type, id }) => {
      if (type && id) {
        socket.join(`entity:${type}:${id}`);
      }
    });

    socket.on('unsubscribe:entity', ({ type, id }) => {
      if (type && id) {
        socket.leave(`entity:${type}:${id}`);
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id}, Reason: ${reason}`);
      if (userId) {
        this.untrackConnection(userId, socket.id);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error: ${socket.id}`, error);
    });
  }

  /**
   * Track user connections
   */
  trackConnection(userId, socketId) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId).add(socketId);
  }

  /**
   * Untrack user connections
   */
  untrackConnection(userId, socketId) {
    const userSockets = this.connections.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.connections.delete(userId);
      }
    }
  }

  /**
   * Validate room name
   */
  isValidRoom(room) {
    // Only allow specific room patterns
    const validPatterns = [
      /^user:\w+$/,
      /^entity:\w+:\w+$/,
      /^team:\w+$/,
      /^territory:\w+$/,
      /^notifications$/,
      /^attention-queue$/,
    ];
    return validPatterns.some(pattern => pattern.test(room));
  }

  // ==========================================
  // Event Emission Methods
  // ==========================================

  /**
   * Emit event to specific user
   */
  emitToUser(userId, event, data) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  /**
   * Emit event to multiple users
   */
  emitToUsers(userIds, event, data) {
    if (this.io) {
      userIds.forEach(userId => {
        this.io.to(`user:${userId}`).emit(event, data);
      });
    }
  }

  /**
   * Emit entity update
   */
  emitEntityUpdate(type, id, action, data) {
    if (this.io) {
      const room = `entity:${type}:${id}`;
      this.io.to(room).emit('entity:update', {
        type,
        id,
        action, // 'created', 'updated', 'deleted'
        data,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Emit notification to user
   */
  emitNotification(userId, notification) {
    this.emitToUser(userId, 'notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit attention queue update
   */
  emitAttentionUpdate(userId, attentionItem) {
    this.emitToUser(userId, 'attention:update', {
      ...attentionItem,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit team broadcast
   */
  emitToTeam(teamId, event, data) {
    if (this.io) {
      this.io.to(`team:${teamId}`).emit(event, data);
    }
  }

  /**
   * Emit territory broadcast
   */
  emitToTerritory(territoryId, event, data) {
    if (this.io) {
      this.io.to(`territory:${territoryId}`).emit(event, data);
    }
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  // ==========================================
  // Integration Methods (called from services)
  // ==========================================

  /**
   * Notify on record creation
   */
  notifyRecordCreated(type, record, userId) {
    // Emit to entity room
    this.emitEntityUpdate(type, record.id, 'created', record);

    // Emit to creator
    if (userId) {
      this.emitToUser(userId, 'record:created', {
        type,
        id: record.id,
        name: record.name || `${record.firstName} ${record.lastName}`,
      });
    }
  }

  /**
   * Notify on record update
   */
  notifyRecordUpdated(type, record, changes = {}) {
    this.emitEntityUpdate(type, record.id, 'updated', {
      ...record,
      changes,
    });
  }

  /**
   * Notify on record deletion
   */
  notifyRecordDeleted(type, recordId) {
    this.emitEntityUpdate(type, recordId, 'deleted', { id: recordId });
  }

  /**
   * Notify on opportunity stage change
   */
  notifyOpportunityStageChange(opportunity, oldStage, newStage, userId) {
    // Emit to opportunity subscribers
    this.emitEntityUpdate('opportunity', opportunity.id, 'stage_changed', {
      id: opportunity.id,
      name: opportunity.name,
      oldStage,
      newStage,
      amount: opportunity.amount,
    });

    // Emit to owner
    if (opportunity.ownerId) {
      this.emitToUser(opportunity.ownerId, 'opportunity:stage_changed', {
        id: opportunity.id,
        name: opportunity.name,
        oldStage,
        newStage,
      });
    }
  }

  /**
   * Notify on new message (SMS/Email)
   */
  notifyNewMessage(message) {
    // Emit to related entity subscribers
    if (message.opportunityId) {
      this.emitEntityUpdate('opportunity', message.opportunityId, 'new_message', message);
    }
    if (message.accountId) {
      this.emitEntityUpdate('account', message.accountId, 'new_message', message);
    }
    if (message.contactId) {
      this.emitEntityUpdate('contact', message.contactId, 'new_message', message);
    }
  }

  /**
   * Notify on appointment change
   */
  notifyAppointmentChange(appointment, action) {
    // Emit to assigned resource
    if (appointment.resourceId) {
      this.emitToUser(appointment.resourceId, 'appointment:change', {
        action,
        appointment,
      });
    }

    // Emit to opportunity subscribers
    if (appointment.opportunityId) {
      this.emitEntityUpdate('opportunity', appointment.opportunityId, 'appointment_' + action, appointment);
    }
  }

  // ==========================================
  // Status Methods
  // ==========================================

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.io !== null,
      totalConnections: this.io?.engine?.clientsCount || 0,
      uniqueUsers: this.connections.size,
      hasRedis: this.redisClient !== null,
    };
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId) {
    return this.connections.has(userId);
  }

  /**
   * Get online users
   */
  getOnlineUsers() {
    return Array.from(this.connections.keys());
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.io) {
      await new Promise((resolve) => {
        this.io.close(resolve);
      });
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    console.log('WebSocket server shutdown complete');
  }
}

// Singleton instance
export const websocketService = new WebSocketService();
