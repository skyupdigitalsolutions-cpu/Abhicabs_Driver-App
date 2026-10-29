// @ts-nocheck
/**
 * src/store/driverStatusSlice.js
 *
 * Whether the driver is online. Previously this lived only as local state
 * inside HomeScreen (`useState(false)`), so nothing else in the app could
 * see it. Lifted into Redux so MainTabs can gate the other tabs behind it —
 * see MainTabs.jsx.
 */
import { createSlice } from '@reduxjs/toolkit';

const driverStatusSlice = createSlice({
  name: 'driverStatus',
  initialState: {
    isOnline: false,
  },
  reducers: {
    setOnline(state, action) {
      state.isOnline = action.payload;
    },
  },
});

export const { setOnline } = driverStatusSlice.actions;
export default driverStatusSlice.reducer;
