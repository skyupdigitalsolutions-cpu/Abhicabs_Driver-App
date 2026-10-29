// @ts-nocheck
/**
 * src/store/notificationsSlice.js
 *
 * FIX: MainTabs.jsx's BellButton does `useSelector((s) => s.notifications.unreadCount)`,
 * and NotificationsScreen.jsx reads from the same slice — but this slice never
 * existed and was never registered in store.js. `state.notifications` was
 * `undefined`, so `.unreadCount` threw the instant the tab header rendered,
 * crashing the app on the way into MainTabs.
 *
 * The backend has no notifications HTTP API (only a background job with no
 * route), so per the "don't invent a backend endpoint" rule this is NOT a
 * fetch-from-API slice. Instead it's a local, in-memory feed populated from
 * the driver app's EXISTING Socket.IO events (offer:new, trip:status) as they
 * already arrive in HomeScreen — no second realtime system, no mock data.
 * Entries only exist because a real event was actually received.
 */
import { createSlice } from '@reduxjs/toolkit';

let nextId = 1;

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: {
    items: [],        // { id, type, title, body, createdAt, read }
    unreadCount: 0,
    status: 'idle',    // kept for NotificationsScreen's loading-state check
  },
  reducers: {
    addNotification: {
      reducer(state, action) {
        state.items.unshift(action.payload);
        state.unreadCount += 1;
        // Keep this a lightweight recent-activity feed, not an unbounded log.
        if (state.items.length > 50) state.items.length = 50;
      },
      prepare({ type, title, body }) {
        return {
          payload: {
            id: nextId++,
            type: type || 'INFO',
            title,
            body: body || null,
            createdAt: new Date().toISOString(),
            read: false,
          },
        };
      },
    },
    markRead(state, action) {
      const item = state.items.find((n) => n.id === action.payload);
      if (item && !item.read) {
        item.read = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },
    markAllRead(state) {
      state.items.forEach((n) => { n.read = true; });
      state.unreadCount = 0;
    },
  },
});

export const { addNotification, markRead, markAllRead } = notificationsSlice.actions;
export default notificationsSlice.reducer;
