/**
 * src/types.ts — Shared type definitions for the ABHI CABS Driver app.
 *
 * These types document the shapes already flowing through the app. They were
 * added as part of the JS → TS conversion and change zero runtime behaviour.
 */

// ── API layer ─────────────────────────────────────────────────────────────────

export interface ApiErrorOptions {
  code?: string;
  status?: number;
  fields?: Record<string, string>;
}

export interface TokenPair {
  accessToken?: string | null;
  refreshToken?: string | null;
}

// ── Booking / Trip ────────────────────────────────────────────────────────────

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'ALLOCATED'
  | 'EN_ROUTE'
  | 'REACHED'
  | 'ONGOING'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type TripType = 'ONE_WAY' | 'ROUND_TRIP' | 'AIRPORT' | 'HOURLY';

export interface Address {
  address?: string;
  lat?: number;
  lng?: number;
}

export interface Customer {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  user?: { name?: string; phone?: string; email?: string };
}

export interface Booking {
  id: string;
  status: BookingStatus;
  tripType?: TripType;
  vehicleClass?: string;
  pickup?: Address;
  drop?: Address;
  pickupAddress?: Address | string;
  dropAddress?: Address | string;
  pickupAt?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropLat?: number;
  dropLng?: number;
  customer?: Customer;
  distanceKm?: number;
  estimatedKm?: number;
  estimatedFare?: number;
  finalFare?: number;
  totalFare?: number;
  balanceDue?: number;
  paymentMode?: string;
  parentBookingId?: string;
}

// ── Onboarding / Session ──────────────────────────────────────────────────────

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';
export type DriverStatus = 'loading' | 'pending' | 'approved' | 'unauthenticated';

export interface VehicleInfo {
  id?: string;
  registrationNumber?: string;
  vehicleClass?: string;
  makeModel?: string;
  seatingCapacity?: number;
  status?: string;
  vehicle?: { id?: string; registrationNumber?: string };
}

export interface OnboardingState {
  isApproved?: boolean;
  hasVehicle?: boolean;
  kycStatus?: string;
  missingVehicleDocs?: string[];
  missingDriverDocs?: string[];
  vehicleFeatureAvailable?: boolean;
  vehicles?: VehicleInfo[];
  steps?: {
    vehicleDocs?: { missing?: string[] };
  };
}

export interface User {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}

export interface SessionState {
  status: SessionStatus;
  driverStatus: DriverStatus;
  user: User | null;
  onboarding: OnboardingState | null;
  vehicleSkipped: boolean;
  assignedVehicle?: VehicleInfo | null;
  refresh: () => void;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
  read: boolean;
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export interface Review {
  id?: string;
  stars: number;
  comment?: string;
  createdAt?: string;
  customer?: { name?: string };
  booking?: { id?: string; ref?: string };
}

export interface ReviewSummary {
  ratingAvg: number | null;
  ratingCount: number;
}

// ── Socket events ─────────────────────────────────────────────────────────────

export interface OfferPayload {
  bookingId: string;
  allocationId: string;
  pickup?: Address;
  drop?: Address;
  at?: string;
}

export interface TripStatusPayload {
  bookingId: string;
  status: BookingStatus;
  at?: string;
}

export interface TripLocationPayload {
  bookingId: string;
  lat: number;
  lng: number;
  at?: string;
}

export interface PaymentPayload {
  bookingId: string;
  amount: number;
  balanceDue: number;
}

// ── Component props ───────────────────────────────────────────────────────────

export interface Coordinates {
  lat: number;
  lng: number;
}

// ── Cloudinary upload ─────────────────────────────────────────────────────────

export interface CloudinaryResult {
  url: string;
  publicId: string;
}

// ── Driver profile ────────────────────────────────────────────────────────────

export interface DriverProfile {
  user?: User;
  licenceNumber?: string;
  kycStatus?: string;
  ratingAvg?: number | null;
  ratingCount?: number;
}
