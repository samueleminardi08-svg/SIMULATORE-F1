/**
 * Gestore Multigiocatore Online P2P con Codice Stanza (Step 10):
 * - Trasporto WebRTC via PeerJS (tra dispositivi diversi online)
 * - Trasporto parallelo BroadcastChannel (zero-latenza tra tab sullo stesso PC)
 * - Architettura Host-Authoritative: i Client inviano gli input e i voti skip Qualifiche,
 *   l'Host simula a 60 Hz e invia gli snapshot di WorldState ai Client.
 */

let cachedPeerClass = null;
let peerLoadPromise = null;

/**
 * Carica PeerJS on-demand solo quando l'utente crea o entra in una stanza online,
 * evitando di includerlo nel bundle di avvio per il gioco offline.
 */
async function loadPeerClass() {
  if (cachedPeerClass) return cachedPeerClass;
  if (typeof window === 'undefined') return null;
  if (!peerLoadPromise) {
    peerLoadPromise = import('peerjs')
      .then((mod) => {
        cachedPeerClass = mod.Peer || mod.default?.Peer || mod.default || null;
        return cachedPeerClass;
      })
      .catch(() => null);
  }
  return peerLoadPromise;
}

export function normalizeRoomCode(raw) {
  const cleaned = String(raw || '')
    .toUpperCase()
    .replace(/^F1-?/, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  if (!cleaned) return '';
  return `F1-${cleaned}`;
}

export function generateRoomCode() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `F1-${num}`;
}

function getBrokerPeerId(roomCode) {
  const clean = normalizeRoomCode(roomCode).replace(/[^A-Z0-9]/g, '').toLowerCase();
  return `gioco-f1-2026-room-${clean}`;
}

export class RoomManager {
  constructor(callbacks = {}) {
    this.onRosterChange = callbacks.onRosterChange || null;
    this.onStatusChange = callbacks.onStatusChange || null;
    this.onSessionStart = callbacks.onSessionStart || null;
    this.onSnapshot = callbacks.onSnapshot || null;
    this.onRemoteSkipVote = callbacks.onRemoteSkipVote || null;

    this.role = 'offline'; // 'offline' | 'host' | 'client'
    this.roomCode = '';
    this.localCarId = 'player_1';
    this.statusMessage = 'Modalità offline';
    this.players = [];
    this.remoteInputs = {};

    this._localPeerTag = `tag_${Math.random().toString(36).slice(2, 10)}`;
    this._nextCarIndex = 2;
    this._peer = null;
    this._hostConn = null; // client -> host PeerJS conn
    this._clientConns = new Map(); // host -> Map<carId, DataConnection>
    this._clientTagToCarId = new Map();
    this._channel = null; // BroadcastChannel fallback
    this._lastSnapshotSentMs = 0;
  }

  isActive() {
    return this.role !== 'offline';
  }

  isHost() {
    return this.role === 'host';
  }

  isClient() {
    return this.role === 'client';
  }

  getLocalCarId() {
    return this.localCarId || 'player_1';
  }

  getPlayers() {
    return this.players;
  }

  getRemoteInputs() {
    return this.remoteInputs;
  }

  _emitStatus(msg) {
    this.statusMessage = msg;
    if (this.onStatusChange) {
      this.onStatusChange(msg, this.role, this.roomCode);
    }
  }

  _emitRoster() {
    if (this.onRosterChange) {
      this.onRosterChange(this.players, this.roomCode, this.role);
    }
  }

  _openBroadcastChannel(roomCode) {
    if (typeof BroadcastChannel === 'undefined') return;
    if (this._channel) {
      this._channel.close();
    }
    this._channel = new BroadcastChannel(`f1_2026_room_${roomCode}`);
    this._channel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || msg.senderTag === this._localPeerTag) return;
      this._handleIncomingMessage(msg, null);
    };
  }

  _sendToClients(payload) {
    const wrapped = { ...payload, senderTag: this._localPeerTag };
    for (const conn of this._clientConns.values()) {
      if (conn && conn.open) {
        try {
          conn.send(wrapped);
        } catch {
          // Ignore transient send errors on closing channels
        }
      }
    }
    if (this._channel) {
      try {
        this._channel.postMessage(wrapped);
      } catch {
        // Ignore
      }
    }
  }

  _sendToHost(payload) {
    const wrapped = { ...payload, senderTag: this._localPeerTag };
    if (this._hostConn && this._hostConn.open) {
      try {
        this._hostConn.send(wrapped);
      } catch {
        // Ignore
      }
    }
    if (this._channel) {
      try {
        this._channel.postMessage(wrapped);
      } catch {
        // Ignore
      }
    }
  }

  _handleIncomingMessage(msg, peerConn = null) {
    if (!msg || !msg.type) return;

    if (this.role === 'host') {
      if (msg.type === 'join_request') {
        const senderTag = msg.senderTag || `peer_${Math.random().toString(36).slice(2, 7)}`;
        let carId = this._clientTagToCarId.get(senderTag);
        if (!carId) {
          carId = `player_${this._nextCarIndex++}`;
          this._clientTagToCarId.set(senderTag, carId);
        }

        const profile = msg.profile || {};
        const entry = {
          carId,
          playerName: profile.playerName || `Pilota ${carId}`,
          playerCode: profile.playerCode || 'P2X',
          teamId: profile.teamId || 'mclaren',
          customPrimaryColor: profile.customPrimaryColor || null,
          paintRoughness: profile.paintRoughness ?? 0.25,
          paintMetalness: profile.paintMetalness ?? 0.35,
          carSpecs: profile.carSpecs || null,
          isHost: false,
        };

        const existingIdx = this.players.findIndex((p) => p.carId === carId);
        if (existingIdx >= 0) {
          this.players[existingIdx] = entry;
        } else {
          this.players.push(entry);
        }

        if (peerConn) {
          this._clientConns.set(carId, peerConn);
          peerConn.on('close', () => {
            this._removeClient(carId);
          });
        }

        const acceptPayload = {
          type: 'join_accepted',
          targetTag: senderTag,
          assignedCarId: carId,
          roomCode: this.roomCode,
          players: this.players,
          senderTag: this._localPeerTag,
        };
        if (peerConn && peerConn.open) {
          peerConn.send(acceptPayload);
        }
        if (this._channel) {
          this._channel.postMessage(acceptPayload);
        }

        this._sendToClients({
          type: 'roster_update',
          players: this.players,
        });
        this._emitRoster();
        this._emitStatus(`Stanza ${this.roomCode} attiva (${this.players.length} piloti)`);
        return;
      }

      if (msg.type === 'input_state' && msg.carId) {
        this.remoteInputs[msg.carId] = msg.input || {};
        return;
      }

      if (msg.type === 'skip_vote' && msg.carId) {
        if (this.onRemoteSkipVote) {
          this.onRemoteSkipVote(msg.carId, msg.action || 'stage');
        }
        return;
      }

      if (msg.type === 'leave_room' && msg.carId) {
        this._removeClient(msg.carId);
        return;
      }
    }

    if (this.role === 'client') {
      if (msg.type === 'join_accepted') {
        if (msg.targetTag && msg.targetTag !== this._localPeerTag) return;
        this.localCarId = msg.assignedCarId;
        this.players = msg.players || [];
        this._emitRoster();
        this._emitStatus(`Connesso a ${this.roomCode} come #${this.localCarId}`);
        return;
      }

      if (msg.type === 'roster_update') {
        this.players = msg.players || [];
        this._emitRoster();
        return;
      }

      if (msg.type === 'session_start') {
        if (this.onSessionStart) {
          this.onSessionStart(msg.sessionConfig, msg.snapshot);
        }
        return;
      }

      if (msg.type === 'world_snapshot') {
        if (this.onSnapshot && msg.snapshot) {
          this.onSnapshot(msg.snapshot);
        }
        return;
      }

      if (msg.type === 'host_closed') {
        this.leaveRoom();
        this._emitStatus('L\'Host ha chiuso la stanza.');
      }
    }
  }

  _removeClient(carId) {
    this._clientConns.delete(carId);
    delete this.remoteInputs[carId];
    this.players = this.players.filter((p) => p.carId !== carId);
    this._sendToClients({ type: 'roster_update', players: this.players });
    this._emitRoster();
    this._emitStatus(`Stanza ${this.roomCode} (${this.players.length} piloti)`);
  }

  createRoom(localProfile = {}) {
    this.leaveRoom(false);
    this.role = 'host';
    this.roomCode = generateRoomCode();
    this.localCarId = 'player_1';
    this._nextCarIndex = 2;
    this.remoteInputs = {};
    this._clientTagToCarId.clear();

    this.players = [
      {
        carId: 'player_1',
        playerName: localProfile.playerName || 'Host F1',
        playerCode: localProfile.playerCode || 'HST',
        teamId: localProfile.teamId || 'ferrari',
        customPrimaryColor: localProfile.customPrimaryColor || null,
        paintRoughness: localProfile.paintRoughness ?? 0.25,
        paintMetalness: localProfile.paintMetalness ?? 0.35,
        carSpecs: localProfile.carSpecs || null,
        isHost: true,
      },
    ];

    this._openBroadcastChannel(this.roomCode);
    this._emitRoster();
    this._emitStatus(`Creazione stanza ${this.roomCode}...`);

    if (typeof window !== 'undefined') {
      const targetCode = this.roomCode;
      loadPeerClass().then((Peer) => {
        if (this.role !== 'host' || this.roomCode !== targetCode) return;
        if (typeof Peer !== 'function') {
          this._emitStatus(`Stanza ${targetCode} pronta (locale/Broadcast)`);
          return;
        }
        try {
          const peerId = getBrokerPeerId(targetCode);
          this._peer = new Peer(peerId);
          this._peer.on('open', () => {
            this._emitStatus(`Stanza ${targetCode} online (condividi il codice)`);
          });
          this._peer.on('connection', (conn) => {
            conn.on('data', (data) => {
              this._handleIncomingMessage(data, conn);
            });
          });
          this._peer.on('error', () => {
            this._emitStatus(`Stanza ${targetCode} pronta (locale/P2P)`);
          });
        } catch {
          this._emitStatus(`Stanza ${targetCode} pronta (locale/Broadcast)`);
        }
      });
    } else {
      this._emitStatus(`Stanza ${this.roomCode} pronta`);
    }

    return this.roomCode;
  }

  joinRoom(rawCode, localProfile = {}) {
    const code = normalizeRoomCode(rawCode);
    if (!code) {
      this._emitStatus('Inserisci un codice stanza valido (es. F1-4829).');
      return false;
    }

    this.leaveRoom(false);
    this.role = 'client';
    this.roomCode = code;
    this.players = [];
    this.remoteInputs = {};
    this._openBroadcastChannel(code);
    this._emitRoster();
    this._emitStatus(`Connessione alla stanza ${code}...`);

    const joinReq = {
      type: 'join_request',
      profile: localProfile,
      senderTag: this._localPeerTag,
    };

    if (this._channel) {
      this._channel.postMessage(joinReq);
    }

    if (typeof window !== 'undefined') {
      loadPeerClass().then((Peer) => {
        if (this.role !== 'client' || this.roomCode !== code || typeof Peer !== 'function') {
          return;
        }
        try {
          this._peer = new Peer();
          this._peer.on('open', () => {
            const hostPeerId = getBrokerPeerId(code);
            const conn = this._peer.connect(hostPeerId, { reliable: true });
            this._hostConn = conn;
            conn.on('open', () => {
              conn.send(joinReq);
            });
            conn.on('data', (data) => {
              this._handleIncomingMessage(data, conn);
            });
            conn.on('close', () => {
              if (this.role === 'client') {
                this._emitStatus('Disconnesso dalla stanza.');
              }
            });
          });
          this._peer.on('error', () => {
            this._emitStatus(`Ricerca stanza ${code} (P2P / locale)...`);
          });
        } catch {
          // Fallback BroadcastChannel attivo
        }
      });
    }

    return true;
  }

  sendInput(inputSnapshot) {
    if (this.role !== 'client') return;
    this._sendToHost({
      type: 'input_state',
      carId: this.localCarId,
      input: inputSnapshot,
    });
  }

  sendSkipVote(action = 'stage') {
    if (this.role !== 'client') return;
    this._sendToHost({
      type: 'skip_vote',
      carId: this.localCarId,
      action,
    });
  }

  broadcastSessionStart(sessionConfig, initialSnapshot) {
    if (this.role !== 'host') return;
    this._sendToClients({
      type: 'session_start',
      sessionConfig,
      snapshot: initialSnapshot,
    });
  }

  broadcastSnapshot(snapshot, force = false) {
    if (this.role !== 'host' || !snapshot) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!force && now - this._lastSnapshotSentMs < 33) {
      return;
    }
    this._lastSnapshotSentMs = now;
    this._sendToClients({
      type: 'world_snapshot',
      snapshot,
    });
  }

  leaveRoom(notifyStatus = true) {
    if (this.role === 'host') {
      this._sendToClients({ type: 'host_closed' });
    } else if (this.role === 'client') {
      this._sendToHost({ type: 'leave_room', carId: this.localCarId });
    }

    if (this._channel) {
      this._channel.close();
      this._channel = null;
    }
    if (this._hostConn) {
      try {
        this._hostConn.close();
      } catch {
        // Ignore
      }
      this._hostConn = null;
    }
    for (const conn of this._clientConns.values()) {
      try {
        conn.close();
      } catch {
        // Ignore
      }
    }
    this._clientConns.clear();
    if (this._peer) {
      try {
        this._peer.destroy();
      } catch {
        // Ignore
      }
      this._peer = null;
    }

    this.role = 'offline';
    this.roomCode = '';
    this.localCarId = 'player_1';
    this.players = [];
    this.remoteInputs = {};
    if (notifyStatus) {
      this._emitRoster();
      this._emitStatus('Modalità offline');
    }
  }
}
