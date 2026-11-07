-- Le prenotazioni iniziano come RICHIESTE, non conferme di un tavolo fittizio.
-- Una richiesta senza tavolo assegnato compare in agenda e richiede conferma dello staff.
INSERT OR IGNORE INTO settings(key,value) VALUES ('booking_mode','request');
UPDATE settings SET value='true' WHERE key='booking_enabled' AND value='false';
