// @ts-nocheck
/**
 * src/store/tripsSlice.js
 *
 * CHANGES:
 *   • fetchTrips  → GET /driver/bookings (driver-scoped, never leaks other customers)
 *   • fetchActiveTrip → GET /driver/bookings/active (single active booking or null)
 *   • Removed parentBookingId filter (field doesn't exist on backend BOOKING_SELECT)
 *   • Field mapping: estimatedKm → distanceKm, totalFare → finalFare ?? estimatedFare
 *   • ACTIVE_STATUSES includes REACHED (it's a real non-terminal state — B-6)
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { driverTrips, unwrapBooking, TERMINAL_STATUSES } from '../api/driverTrips';

const PAGE_SIZE = 10;

/**
 * Paginated trip history. Uses GET /driver/bookings (B-3f/B-4 — driver-scoped).
 * Drivers can never see another customer's booking through this path.
 */
export const fetchTrips = createAsyncThunk(
  'trips/fetchTrips',
  async ({ page = 1, replace = false } = {}, { rejectWithValue }) => {
    try {
      const data = await driverTrips.list(page, PAGE_SIZE);

      let items = [];
      let total = 0;
      let hasMore = false;

      if (data?.items) {
        items   = data.items;
        total   = data.pagination?.total ?? items.length;
        hasMore = page * PAGE_SIZE < total;
      } else if (Array.isArray(data)) {
        items   = data;
        total   = items.length;
        hasMore = false;
      }

      return { items, total, page, hasMore, replace };
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to load trips');
    }
  },
  {
    // onEndReached fires several times in a row; without this guard each
    // call fetched the same next page and the list filled with duplicates.
    condition: ({ replace = false } = {}, { getState }) => {
      const { status } = getState().trips;
      if (!replace && (status === 'loading' || status === 'loadingMore')) return false;
      return true;
    },
  }
);

/**
 * Cold-start active trip lookup.
 * Uses GET /driver/bookings/active (returns null when driver is idle).
 * Socket keeps activeTrip live during a session; this is only the initial check.
 */
export const fetchActiveTrip = createAsyncThunk(
  'trips/fetchActiveTrip',
  async (_, { rejectWithValue }) => {
    try {
      // { booking } | { booking: null } | null — see unwrapBooking()
      return unwrapBooking(await driverTrips.active());
    } catch (err) {
      return rejectWithValue(err?.message ?? null);
    }
  }
);

const tripsSlice = createSlice({
  name: 'trips',
  initialState: {
    items:            [],
    page:             1,
    total:            0,
    hasMore:          false,
    status:           'idle',   // idle | loading | loadingMore | succeeded | failed
    error:            null,
    activeTrip:       null,
    activeTripStatus: 'idle',
  },
  reducers: {
    clearTrips(state) {
      state.items   = [];
      state.page    = 1;
      state.total   = 0;
      state.hasMore = false;
      state.status  = 'idle';
      state.error   = null;
    },
    setActiveTrip(state, action) {
      const b = action.payload;
      state.activeTrip = b?.id && !TERMINAL_STATUSES.includes(b.status) ? b : null;
    },
    /**
     * updateTripStatus — keyed by bookingId (not id) per Document C §11.
     * trip:status payload: { bookingId, status, at }
     */
    updateTripStatus(state, action) {
      const { bookingId, status } = action.payload;
      if (!bookingId || !status) return;
      const trip = state.items.find((t) => t.id === bookingId);
      if (trip) trip.status = status;
      if (state.activeTrip?.id === bookingId) {
        // A finished trip is no longer "active" — previously it stayed on the
        // Home screen as an ACTIVE TRIP card showing COMPLETED/CANCELLED.
        if (TERMINAL_STATUSES.includes(status)) state.activeTrip = null;
        else state.activeTrip.status = status;
      }
    },
    /** Merge a freshly fetched booking into the list and (if it's the live trip) activeTrip. */
    upsertTrip(state, action) {
      const b = action.payload;
      if (!b?.id) return;
      const idx = state.items.findIndex((t) => t.id === b.id);
      if (idx >= 0) state.items[idx] = { ...state.items[idx], ...b };
      if (state.activeTrip?.id === b.id) {
        state.activeTrip = TERMINAL_STATUSES.includes(b.status) ? null : { ...state.activeTrip, ...b };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTrips.pending, (state, action) => {
        state.status = action.meta.arg?.replace ? 'loading' : 'loadingMore';
        state.error  = null;
      })
      .addCase(fetchTrips.fulfilled, (state, action) => {
        const { items, total, page, hasMore, replace } = action.payload;
        if (replace) {
          state.items = items;
        } else {
          const seen = new Set(state.items.map((t) => t.id));
          state.items = [...state.items, ...items.filter((t) => !seen.has(t.id))];
        }
        state.page    = page;
        state.total   = total;
        state.hasMore = hasMore;
        state.status  = 'succeeded';
      })
      .addCase(fetchTrips.rejected, (state, action) => {
        state.status = 'failed';
        state.error  = action.payload;
      })
      .addCase(fetchActiveTrip.pending, (state) => {
        state.activeTripStatus = 'loading';
      })
      .addCase(fetchActiveTrip.fulfilled, (state, action) => {
        state.activeTrip       = action.payload;
        state.activeTripStatus = 'succeeded';
      })
      .addCase(fetchActiveTrip.rejected, (state) => {
        // A failed request (offline, timeout) says nothing about whether the
        // driver has a trip. Keep what we already knew instead of wiping a
        // live trip off the Home screen on every network hiccup.
        state.activeTripStatus = 'succeeded';
      });
  },
});

export const { clearTrips, setActiveTrip, updateTripStatus, upsertTrip } = tripsSlice.actions;
export default tripsSlice.reducer;
