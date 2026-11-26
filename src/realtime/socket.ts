// @ts-nocheck
/**
 * src/realtime/socket.ts
 *
 * One Socket.IO connection for the whole app.
 *
 * FIXES (vs. the previous version):
 *   • Handlers live in a module-level registry and are attached to whatever
 *     socket currently exists. Before, `onTripStatus()` etc. did
 *     `socket?.on(...)` — a screen that subscribed while the driver was
 *     offline (socket === null) silently got nothing, forever, even after the
 *     driver went online. TripScreen hit this every time it was opened first.
 *   • Booking rooms are re-joined on every (re)connect. Rooms are per
 *     connection server-side, so after any network blip the driver used to
 *     stop receiving trip:status / payment:received for the trip in progress.
 *   • The auth token is read fresh on each connection attempt. It used to be
 *     captured once, so after an access-token refresh every reconnect was
 *     rejected with the expired token.
 *   • connectSocket() no longer creates a second socket while the first is
 *     still connecting (`socket?.connected` was false during the handshake),
 *     which doubled every event.
 *   • Handlers are only registered by HomeScreen/TripScreen effects and are
 *     removed by their cleanups — no more piling up a fresh set of handlers
 *     on every Go Online tap.
 */
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config';
import { getItem } from '../lib/secureStorage';

let socket = null;
const handlers = new Map();      // event -> Set<handler>
const watchedBookings = new Set();

function emitWatch(bookingId) {
  socket?.emit('booking:watch', bookingId, (ack) => {
    if (ack?.error) console.warn('[socket] booking:watch rejected:', ack.error);
  });
}

export async function connectSocket() {
  if (socket) {
    if (!socket.connected && !socket.active) socket.connect();
    return socket;
  }
  const s = io(SOCKET_URL, {
    // Function form: evaluated on every connect / reconnect attempt.
    auth: (cb) => {
      getItem('accessToken')
        .then((token) => cb({ token }))
        .catch(() => cb({}));
    },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 15000,
  });
  socket = s;

  handlers.forEach((set, event) => set.forEach((h) => s.on(event, h)));
  s.on('connect', () => watchedBookings.forEach(emitWatch));
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  watchedBookings.clear();
}

export function isSocketConnected() {
  return !!socket?.connected;
}

/**
 * Join the booking room so trip:status / trip:location / payment:received
 * reach this driver (B-8). Safe to call while offline or connecting: the room
 * is remembered and joined as soon as the socket connects, and re-joined
 * after every reconnect.
 */
export function watchBooking(bookingId) {
  if (!bookingId) return;
  watchedBookings.add(bookingId);
  if (socket?.connected) emitWatch(bookingId);
}

export function unwatchBooking(bookingId) {
  if (!bookingId) return;
  watchedBookings.delete(bookingId);
  socket?.emit('booking:unwatch', bookingId);
}

function subscribe(event, handler) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(handler);
  socket?.on(event, handler);
  return () => {
    handlers.get(event)?.delete(handler);
    socket?.off(event, handler);
  };
}

/** offer:new — "you have been assigned this trip". { bookingId, allocationId, pickup, drop, at } */
export const onOfferNew        = (h) => subscribe('offer:new', h);
/** trip:status — { bookingId, status, at }. Read payload.bookingId, not payload.id. */
export const onTripStatus      = (h) => subscribe('trip:status', h);
/** trip:location — { bookingId, lat, lng, at } */
export const onTripLocation    = (h) => subscribe('trip:location', h);
/** payment:received — { bookingId, amount, balanceDue } */
export const onPaymentReceived = (h) => subscribe('payment:received', h);
