// @ts-nocheck
/**
 * src/api/reviews.js
 *
 * Driver-scoped review API. Two directions exist server-side:
 *   CUSTOMER_TO_DRIVER — what makes up the driver's rating. The driver only
 *                        READS these (myReviews). They're written by the
 *                        customer app after a trip.
 *   DRIVER_TO_CUSTOMER — the driver rating the customer after the trip ends.
 *                        Internal to dispatch; not shown back to the customer.
 *
 * Contract (matches the backend drop-in files):
 *   GET  /driver/me/reviews?page=&limit=
 *        → { items:[{ id, stars, comment, createdAt, booking:{ id, ref },
 *                     customer:{ name } }],
 *            pagination:{ page, limit, total, totalPages },
 *            summary:{ ratingAvg, ratingCount } }
 *   GET  /driver/bookings/:id/review
 *        → { review } | { review: null }   (the driver's own rating of that trip)
 *   POST /driver/bookings/:id/review  { stars, comment? }
 *        → { review }                       (create driver→customer rating)
 */
import { api } from './client';

export const reviewsApi = {
  /** Customer→driver reviews this driver has received, newest first, + summary. */
  async myReviews(page = 1, limit = 20) {
    const data = await api.get(`/driver/me/reviews?page=${page}&limit=${limit}`);
    return {
      items: Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []),
      pagination: data?.pagination ?? { page, limit, total: 0, totalPages: 1 },
      summary: data?.summary ?? { ratingAvg: null, ratingCount: 0 },
    };
  },

  /**
   * Whether the driver has already rated this trip's customer.
   * Returns the review object or null. Tolerates a 404 (treated as "not rated").
   */
  async getBookingReview(bookingId) {
    try {
      const data = await api.get(`/driver/bookings/${bookingId}/review`);
      return data?.review ?? (data && data.stars ? data : null);
    } catch (err) {
      if (err?.status === 404) return null;
      throw err;
    }
  },

  /** Driver rates the customer after the trip. One per booking (409 if repeated). */
  async rateCustomer(bookingId, { stars, comment }) {
    const body = { stars: Number(stars) };
    const text = (comment ?? '').trim();
    if (text) body.comment = text;
    return api.post(`/driver/bookings/${bookingId}/review`, body);
  },
};
