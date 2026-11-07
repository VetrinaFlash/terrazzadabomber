CREATE TABLE IF NOT EXISTS dining_tables (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 label TEXT NOT NULL UNIQUE,
 capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 30),
 active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
 position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS reservations (
 id TEXT PRIMARY KEY,
 service_date TEXT NOT NULL,
 service_time TEXT NOT NULL,
 guests INTEGER NOT NULL CHECK (guests BETWEEN 1 AND 30),
 customer_name TEXT NOT NULL,
 phone TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 table_id INTEGER REFERENCES dining_tables(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','seated','cancelled','no_show')),
 source TEXT NOT NULL DEFAULT 'website',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reservations_date_time ON reservations(service_date,service_time,status);
CREATE INDEX IF NOT EXISTS idx_reservations_table ON reservations(table_id,service_date,status);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subscriptions (
 endpoint TEXT PRIMARY KEY,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS request_limits (
 key TEXT PRIMARY KEY,
 hits INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO settings(key,value) VALUES
 ('booking_enabled','false'),
 ('booking_slots','["19:00","19:30","20:00","20:30","21:00","21:30","22:00","22:30"]'),
 ('duration_minutes','120'),
 ('max_guests','10'),
 ('closed_dates','[]');
INSERT OR IGNORE INTO dining_tables(label,capacity,position) VALUES
 ('Tavolo 1',2,1),('Tavolo 2',2,2),('Tavolo 3',4,3),('Tavolo 4',4,4),('Tavolo 5',4,5),('Tavolo 6',6,6),('Tavolo 7',6,7),('Tavolo 8',8,8);
