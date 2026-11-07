-- Persistent opening/closing calendar; editable after deployment from admin.
INSERT OR IGNORE INTO settings(key,value) VALUES
 ('closed_weekdays','[]'),
 ('closed_periods','[]');
-- Legacy closed_dates remains supported; no existing reservations or preferences are removed.
