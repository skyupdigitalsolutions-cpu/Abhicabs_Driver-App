// @ts-nocheck
/**
 * src/store/store.ts
 *
 * FIX: the store is now wiped on logout / session expiry (resetStore()).
 * Previously Redux outlived the session, so the next driver to log in on the
 * same phone saw the previous driver's trips and notifications, and the app
 * still believed it was "online" (isOnline: true) with no socket or GPS
 * pinger running.
 */
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import tripsReducer from './tripsSlice';
import notificationsReducer from './notificationsSlice';
import driverStatusReducer from './driverStatusSlice';

const RESET = 'app/reset';

const appReducer = combineReducers({
  trips: tripsReducer,
  notifications: notificationsReducer,
  driverStatus: driverStatusReducer,
});

function rootReducer(state, action) {
  return appReducer(action.type === RESET ? undefined : state, action);
}

export const store = configureStore({ reducer: rootReducer });

export function resetStore() {
  store.dispatch({ type: RESET });
}
