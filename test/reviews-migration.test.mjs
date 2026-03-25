import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getReviewMigrationStatus,
  migrateReviewMediaFromOrders
} from '../src/controllers/reviews.js';

function createEnv(overrides = {}) {
  return {
    DB: {
      prepare(sql) {
        return {
          async first() {
            if (/from reviews/i.test(sql)) {
              return {
                total_reviews: overrides.total_reviews ?? 12,
                reviews_with_videos: overrides.reviews_with_videos ?? 7,
                reviews_without_videos: overrides.reviews_without_videos ?? 5,
                reviews_with_orders: overrides.reviews_with_orders ?? 9,
                eligible_for_migration: overrides.eligible_for_migration ?? 4
              };
            }
            return null;
          },
          async run() {
            return { meta: { changes: overrides.rowsUpdated ?? 4 } };
          }
        };
      }
    }
  };
}

test('getReviewMigrationStatus returns normalized admin counts', async () => {
  const response = await getReviewMigrationStatus(createEnv({
    total_reviews: 20,
    reviews_with_videos: 11,
    reviews_without_videos: 9,
    reviews_with_orders: 15,
    eligible_for_migration: 6
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    success: true,
    stats: {
      totalReviews: 20,
      reviewsWithVideos: 11,
      reviewsWithoutVideos: 9,
      reviewsWithOrders: 15,
      eligibleForMigration: 6
    }
  });
});

test('migrateReviewMediaFromOrders returns updated row count', async () => {
  const response = await migrateReviewMediaFromOrders(createEnv({ rowsUpdated: 3 }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    success: true,
    rowsUpdated: 3
  });
});
