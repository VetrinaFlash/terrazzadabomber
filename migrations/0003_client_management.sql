-- Client self-service and auditable admin operations.
-- Links contain a random bearer token; only its SHA-256 hash is stored in D1.
ALTER TABLE reservations ADD COLUMN manage_token_hash TEXT;
ALTER TABLE reservations ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_manage_token ON reservations(manage_token_hash) WHERE manage_token_hash IS NOT NULL;
CREATE TABLE IF NOT EXISTS booking_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor IN ('customer','staff')),
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_booking_activity_reservation ON booking_activity(reservation_id, created_at DESC);
