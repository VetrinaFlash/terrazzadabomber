-- Tipiko Ristorante Pizzeria: menu digitale e ordini online (asporto / consegna).
-- Migrazione solo additiva: nessuna tabella o prenotazione esistente viene eliminata.

CREATE TABLE IF NOT EXISTS menu_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL DEFAULT 'Menu',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents BETWEEN 0 AND 100000),
  allergens TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0,1)),
  orderable INTEGER NOT NULL DEFAULT 1 CHECK (orderable IN (0,1)),
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id, position);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  order_type TEXT NOT NULL CHECK (order_type IN ('takeaway','delivery')),
  service_date TEXT NOT NULL,
  service_time TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','card')),
  subtotal_cents INTEGER NOT NULL,
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','out_for_delivery','completed','cancelled','rejected')),
  track_token_hash TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_date_time ON orders(service_date, service_time, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_track_token ON orders(track_token_hash) WHERE track_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER,
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('customer','staff')),
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_order_activity_order ON order_activity(order_id, created_at DESC);

-- Impostazioni ordini e dati del locale, tutte modificabili dal pannello admin.
INSERT OR IGNORE INTO settings(key,value) VALUES
 ('ordering_enabled','true'),
 ('takeaway_enabled','true'),
 ('delivery_enabled','true'),
 ('order_slots','["12:45","13:00","13:15","13:30","13:45","14:00","14:15","19:15","19:30","19:45","20:00","20:15","20:30","20:45","21:00","21:15","21:30","21:45","22:00","22:15","22:30","22:45"]'),
 ('order_slot_capacity','5'),
 ('order_lead_minutes','30'),
 ('order_days_ahead','2'),
 ('delivery_fee_cents','0'),
 ('delivery_min_cents','0'),
 ('delivery_area','Amantea e dintorni'),
 ('card_payment_enabled','true'),
 ('site_name','Tipiko'),
 ('site_tagline','Ristorante Pizzeria · Cucina a km zero'),
 ('site_address','Via S. Bernardino, 1'),
 ('site_city','87032 Amantea (CS)'),
 ('site_phone','+39 329 667 1439'),
 ('site_whatsapp','+39 329 667 1439'),
 ('site_email','tipiko.amantea@gmail.com'),
 ('site_hours','Pranzo 12:30 – 14:30 · Cena 19:00 – 23:00 · Chiuso il martedì'),
 ('site_instagram','https://www.instagram.com/tipiko_ristorante_pizzeria/'),
 ('site_facebook','https://www.facebook.com/TipikoRistorantePizzeria'),
 ('site_maps_url','https://www.google.com/maps/place/Ristorante+Pizzeria+Tipiko/@39.1343078,16.079319,17z');

-- Il database era configurato per il cliente precedente: allinea orari e chiusure
-- delle prenotazioni a Tipiko (pranzo 12:30-14:30, cena 19:00-23:00, chiuso il martedì).
UPDATE settings SET value='["12:30","13:00","13:30","19:30","20:00","20:30","21:00","21:30","22:00"]' WHERE key='booking_slots';
UPDATE settings SET value='[2]' WHERE key='closed_weekdays';
UPDATE settings SET value='[]' WHERE key='closed_dates';
UPDATE settings SET value='[]' WHERE key='closed_periods';
UPDATE settings SET value='12' WHERE key='max_guests';
UPDATE settings SET value='request' WHERE key='booking_mode';

-- Menu reale di Tipiko (app ufficiale, novembre 2026). Generato da scripts/menu-source.txt.
-- Le voci "orderable=0" (spina, carne a peso) sono visibili ma si ordinano solo al tavolo.
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(1,'Ristorante','Antipasti dal Mediterraneo','Il pescato del nostro mare',1);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(2,'Ristorante','Antipasti del territorio','Il meglio della Calabria',2);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(3,'Ristorante','Primi dal Mediterraneo','',3);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(4,'Ristorante','Primi del territorio','',4);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(5,'Ristorante','Secondi dal Mediterraneo','',5);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(6,'Ristorante','Secondi del territorio','',6);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(7,'Ristorante','Contorni','',7);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(8,'Ristorante','Frutta','',8);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(9,'Ristorante','Dolci','Fatti in casa',9);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(10,'Pizzeria','Stuzzicheria','',10);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(11,'Pizzeria','I Coccoli di Tipiko','Impasto della pizza fritto, condito al momento',11);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(12,'Pizzeria','Pizze stagionali','Le proposte del momento',12);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(13,'Pizzeria','Pizze classiche','',13);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(14,'Beverage','Birre artigianali','Birrificio calabrese',14);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(15,'Beverage','Bibite','',15);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(16,'Beverage','Birre alla spina','Disponibili al tavolo',16);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(17,'Carta dei vini','Cirò Vumbaca','',17);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(18,'Carta dei vini','Berlucchi','',18);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(19,'Carta dei vini','Cantine Benvenuto','',19);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(20,'Carta dei vini','Caparra & Siciliani','',20);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(21,'Carta dei vini','Cantine Ceraudo','',21);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(22,'Carta dei vini','Magna Graecia','',22);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(23,'Carta dei vini','Masseria Falvo','',23);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(24,'Carta dei vini','Cantine De Mare','',24);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(25,'Carta dei vini','Russo & Longo','',25);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(26,'Carta dei vini','Giraldi & Giraldi','',26);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(27,'Carta dei vini','Serracavallo','',27);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(28,'Carta dei vini','Serre di Pederiva','',28);
INSERT OR IGNORE INTO menu_categories(id,section,name,description,position) VALUES(29,'Carta dei vini','Cantine Santa Venere','',29);
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 1,'Alici ripiene (3 pz)','',600,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=1 AND name='Alici ripiene (3 pz)');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 1,'Insalata di mare','Calamari, gamberi, seppia, cozze, sedano e carote',1200,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=1 AND name='Insalata di mare');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 1,'Cruditè','In base al pescato del giorno',2400,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=1 AND name='Cruditè');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 1,'"U pignatiallu"','Zuppetta di calamaretti in crosta di pane',1100,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=1 AND name='"U pignatiallu"');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 1,'Il polpo brasato','Polpo brasato alla birra su crema di zucca e funghi porcini',1600,'senza-glutine',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=1 AND name='Il polpo brasato');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 1,'Tris di crudo','Tagliatella di seppia al limone, tartare di tonno agli agrumi, tartare di gambero rosso e fragole',1800,'',1,6 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=1 AND name='Tris di crudo');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 2,'Tagliere di formaggi','Selezione di formaggi caprini e pecorini del territorio, accompagnati da marmellate di nostra produzione',1200,'vegetariano',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=2 AND name='Tagliere di formaggi');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 2,'Buona Calabria','Selezione di salumi, formaggi e prodotti esclusivamente del territorio calabrese',1400,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=2 AND name='Buona Calabria');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 2,'Tartare di manzo Podolica','Tartare di manzo podolica, capperi, olive, acciughe e olio EVO',1600,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=2 AND name='Tartare di manzo Podolica');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 3,'Stroncatura alle sarde, pomodori secchi, capperi e pane profumato','',1400,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=3 AND name='Stroncatura alle sarde, pomodori secchi, capperi e pane profumato');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 3,'Tonnarelli agli scampi, datterino giallo, zafferano e stracciatella','',2000,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=3 AND name='Tonnarelli agli scampi, datterino giallo, zafferano e stracciatella');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 3,'Calamarata al gambero rosso e zest di limone','',1800,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=3 AND name='Calamarata al gambero rosso e zest di limone');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 3,'Linguina al ragù di ricciola e basilico','',1600,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=3 AND name='Linguina al ragù di ricciola e basilico');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 3,'Cavatelli alle cozze, ''nduja e pane tostato','',1600,'',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=3 AND name='Cavatelli alle cozze, ''nduja e pane tostato');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 4,'Spaghettone al ragù con polpette di mamma "Carmela"','',1200,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=4 AND name='Spaghettone al ragù con polpette di mamma "Carmela"');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 4,'Calamarata con crema di peperoni, guanciale e ricotta affumicata','',1400,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=4 AND name='Calamarata con crema di peperoni, guanciale e ricotta affumicata');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 4,'Ravioli di manzo al burro tartufato e salvia','',1500,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=4 AND name='Ravioli di manzo al burro tartufato e salvia');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 5,'Frittura di calamari','',1800,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=5 AND name='Frittura di calamari');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 5,'Frittura mista','',2200,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=5 AND name='Frittura mista');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 5,'Parmigiana di spada su crema di peperone giallo','',1800,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=5 AND name='Parmigiana di spada su crema di peperone giallo');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 5,'Grigliata mista','In base al pescato del giorno',2600,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=5 AND name='Grigliata mista');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 5,'Pepata di cozze','',1300,'',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=5 AND name='Pepata di cozze');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 6,'Tagliata di manzo con patate al forno','250/300 g',1800,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=6 AND name='Tagliata di manzo con patate al forno');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 6,'Filetto di maialino nero di Calabria','Avvolto nel guanciale su crema di patate e verdura di stagione',1800,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=6 AND name='Filetto di maialino nero di Calabria');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 6,'Cime di rape e salsiccia','',900,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=6 AND name='Cime di rape e salsiccia');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 6,'Filetto di manzo e crostone di caciocavallo','Prezzo per 100 g di prodotto (9 € l''etto): ordinabile solo al tavolo',900,'',0,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=6 AND name='Filetto di manzo e crostone di caciocavallo');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 7,'Patate fritte','',450,'vegano',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=7 AND name='Patate fritte');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 7,'Patate "mbacchiuse"','',500,'vegano',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=7 AND name='Patate "mbacchiuse"');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 7,'Insalata mista','Lattuga, radicchio, rucola, carote, cetrioli',500,'vegano',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=7 AND name='Insalata mista');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 7,'Insalata verde','',400,'vegano',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=7 AND name='Insalata verde');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 7,'Insalata di stagione','Finocchio, arancia, olive nere, olio EVO',500,'vegano',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=7 AND name='Insalata di stagione');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 7,'Verdure grigliate','',500,'vegano',1,6 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=7 AND name='Verdure grigliate');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 8,'Frutta di stagione','',500,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=8 AND name='Frutta di stagione');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 8,'Sorbetto','',300,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=8 AND name='Sorbetto');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 9,'Cheesecake','',550,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=9 AND name='Cheesecake');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 9,'Tiramisù','',550,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=9 AND name='Tiramisù');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 9,'Tortino al "bocconotto di Amantea"','',550,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=9 AND name='Tortino al "bocconotto di Amantea"');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 9,'Dolce del giorno','In base alla fantasia dello chef',550,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=9 AND name='Dolce del giorno');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 9,'Tartufo gelato','Gusti: nocciola, pistacchio, mandorla & pistacchio',550,'',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=9 AND name='Tartufo gelato');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 10,'Crocchè di patate (3 pz)','',500,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=10 AND name='Crocchè di patate (3 pz)');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 10,'Polpette','Melanzane, ''nduja, salsiccia',500,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=10 AND name='Polpette');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 11,'Coccoli classici','Pomodorini, olive verdi schiacciate, scaglie di parmigiano, origano, olio EVO, basilico',900,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=11 AND name='Coccoli classici');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 11,'Coccoli crudaioli','Prosciutto crudo nero di Calabria, cubetti di fiordilatte, origano, olio EVO, basilico',900,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=11 AND name='Coccoli crudaioli');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 11,'Coccoli bufalotti','Mozzarella di bufala, acciughe, olive nere, origano, olio EVO, basilico',900,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=11 AND name='Coccoli bufalotti');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 11,'Coccoli al profumo di mare','Ragù di moscardino, olive nere, olio EVO e basilico',1200,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=11 AND name='Coccoli al profumo di mare');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 11,'Coccoli al pistacchio','Crema di pistacchio, zucchero a velo, granella di nocciole',1000,'dolce',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=11 AND name='Coccoli al pistacchio');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 11,'Coccoli alla Nutella','Nutella, zucchero a velo, granella di nocciole',1000,'dolce',1,6 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=11 AND name='Coccoli alla Nutella');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 12,'La Fresca','Pomodorino pachino IGP, fiordilatte, pesto di basilico, scaglie di grana, pancetta, olio EVO, basilico',1000,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=12 AND name='La Fresca');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 12,'Alla zucca','Fiordilatte, crema di zucca, salsiccia stagionata, ricotta affumicata, basilico e olio EVO',900,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=12 AND name='Alla zucca');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 12,'Contadina','Fiordilatte, cime di rape "da Mantia", salsiccia fresca sbriciolata di suino, olio EVO, basilico',1200,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=12 AND name='Contadina');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 12,'Pinna Gialla','Fiordilatte, datterino giallo, filetti di tonno, stracciatella e cipolla in agrodolce',1400,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=12 AND name='Pinna Gialla');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 12,'Frutti di mare','Pomodoro, calamari, cozze, gamberi, seppie, scampi',1800,'',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=12 AND name='Frutti di mare');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 12,'Pizza d''Ottobre','Mozzarella fiordilatte, pomodoro pachino, scarola, acciughe e pane profumato',1200,'',1,6 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=12 AND name='Pizza d''Ottobre');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 12,'"Mò mi scialu"','Mozzarella di bufala, pancetta, ricotta affumicata e melanzana fritta',1400,'',1,7 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=12 AND name='"Mò mi scialu"');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Focaccia','Olio extravergine d''oliva e origano',300,'vegano',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Focaccia');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Marinara','Passata di pomodoro, origano, aglio, olio EVO, basilico',450,'vegano',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Marinara');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Marinara 2.0','Passata di pomodoro, origano, aglio, acciughe da ''Mantia, olive nere infornate, olio EVO, basilico',800,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Marinara 2.0');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Regina margherita','Passata di pomodoro, fiordilatte, olio EVO, basilico',600,'vegetariano',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Regina margherita');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Golosa','Fiordilatte, pomodoro secco, stracciatella e pepe nero, olio EVO, basilico',900,'vegetariano',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Golosa');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Reginella','Passata di pomodoro, stracciatella di bufala, olio EVO, basilico',900,'vegetariano',1,6 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Reginella');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Napoletana','Passata di pomodoro, fiordilatte, acciughe, capperi, olio EVO, origano, basilico',900,'',1,7 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Napoletana');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Tonno e cipolla','Passata di pomodoro, fiordilatte, tonno, cipolla di Tropea, olio EVO, basilico',900,'',1,8 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Tonno e cipolla');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Quattro stagioni','Passata di pomodoro, fiordilatte, prosciutto cotto, carciofi, funghi e olive verdi, olio EVO, basilico',1000,'',1,9 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Quattro stagioni');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Quattro formaggi','Fiordilatte, caciocavallo, gorgonzola, scamorza affumicata, riccioli di ricotta salata, erborinato, olio EVO, basilico',1000,'vegetariano',1,10 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Quattro formaggi');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Tipiko','Pomodorini pachino IGP, fiordilatte, caciocavallo, pesto di rucola, prosciutto crudo nero di Calabria, olio EVO, basilico',1200,'',1,11 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Tipiko');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Alla rucola','Pomodorini pachino IGP, fiordilatte, rucola, scaglie di ricotta salata, olio EVO, basilico',1000,'vegetariano',1,12 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Alla rucola');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Bufalina','Passata di pomodoro, mozzarella di bufala, olio EVO, basilico',900,'vegetariano',1,13 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Bufalina');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Verace','Pomodoro pachino IGP, bocconcini di bufala, acciughe, olive nere, olio EVO, basilico',1000,'',1,14 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Verace');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'KM zero','Fiordilatte, verdure miste di stagione (chiedi al personale)',800,'vegetariano',1,15 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='KM zero');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Cardinale','Passata di pomodoro, fiordilatte, prosciutto cotto e funghi champignon, olio EVO, basilico',900,'',1,16 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Cardinale');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Calabra','Passata di pomodoro, fiordilatte, ''nduja, salame dolce, olio EVO, basilico',900,'piccante',1,17 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Calabra');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Chiazzitana','Passata di pomodoro, fiordilatte, melanzane fritte, ricotta affumicata, olio EVO, basilico',900,'vegetariano',1,18 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Chiazzitana');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Americana','Passata di pomodoro, fiordilatte, patatine fritte, wurstel, olio EVO',800,'',1,19 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Americana');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Sfiziosa','Fiordilatte, prosciutto cotto, crocchè sbriciolata, olio EVO, basilico',900,'',1,20 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Sfiziosa');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Silana','Fiordilatte, patate silane, pancetta affumicata, caciocavallo, origano, olio EVO, basilico',900,'',1,21 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Silana');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Montanara','Passata di pomodoro, fiordilatte, pancetta affumicata, funghi champignon, riccioli di ricotta affumicata, olio EVO, basilico',1000,'',1,22 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Montanara');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Deliziosa','Passata di pomodoro, fiordilatte, prosciutto cotto, ricotta fresca, olio EVO, basilico',900,'',1,23 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Deliziosa');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 13,'Alla mollica','Fiordilatte, pane profumato, acciughe "da ''Mantia", olio EVO, basilico',900,'',1,24 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=13 AND name='Alla mollica');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 14,'CALA "Passione" Lager','4,8% vol · 33 cl',500,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=14 AND name='CALA "Passione" Lager');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 14,'CALA "Euforia" American IPA','6,7% vol · 33 cl',550,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=14 AND name='CALA "Euforia" American IPA');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 14,'CALA "Delirio" Bock','7,2% vol · 33 cl',550,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=14 AND name='CALA "Delirio" Bock');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 14,'CALA "Nirvana" Weizen','4,5% vol · 33 cl',550,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=14 AND name='CALA "Nirvana" Weizen');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 14,'CALA "Citrusina" Blanche al cedro','4,6% vol · 33 cl',550,'',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=14 AND name='CALA "Citrusina" Blanche al cedro');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 14,'CALA "IGA Statti" Greco nero','9% vol · 33 cl',800,'',1,6 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=14 AND name='CALA "IGA Statti" Greco nero');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 14,'MAGNA GRECIA "Beta" Blond Ale','4,9% vol · 75 cl',1800,'',1,7 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=14 AND name='MAGNA GRECIA "Beta" Blond Ale');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 14,'MAGNA GRECIA "Gaglioppa" IGA','6,9% vol · 75 cl',1800,'',1,8 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=14 AND name='MAGNA GRECIA "Gaglioppa" IGA');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 15,'MoleCola','Vetro 0,33 l',300,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=15 AND name='MoleCola');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 15,'MoleCola Zero','Vetro 0,33 l',300,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=15 AND name='MoleCola Zero');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 15,'Aranciata','Bio San Bernardo 0,26 l',250,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=15 AND name='Aranciata');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 15,'Gassosa','Bio San Bernardo 0,26 l',250,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=15 AND name='Gassosa');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 15,'Acqua minerale naturale','Bottiglia in vetro 0,75 l',200,'',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=15 AND name='Acqua minerale naturale');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 15,'Acqua minerale gassata','Bottiglia in vetro 0,75 l',200,'',1,6 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=15 AND name='Acqua minerale gassata');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 15,'Acqua Ferrarelle','Bottiglia in vetro 0,75 l',200,'',1,7 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=15 AND name='Acqua Ferrarelle');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 15,'San Pellegrino','Bottiglia in vetro 0,33 l',300,'',1,8 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=15 AND name='San Pellegrino');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 16,'Angelo Poretti 4 Luppoli Originale piccola','5,5% vol · 0,20 l',300,'',0,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=16 AND name='Angelo Poretti 4 Luppoli Originale piccola');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 16,'Angelo Poretti 4 Luppoli Originale media','5,5% vol · 0,40 l',450,'',0,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=16 AND name='Angelo Poretti 4 Luppoli Originale media');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 16,'Angelo Poretti 9 Luppoli American IPA piccola','5,9% vol · 0,20 l',350,'',0,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=16 AND name='Angelo Poretti 9 Luppoli American IPA piccola');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 16,'Angelo Poretti 9 Luppoli American IPA media','5,9% vol · 0,40 l',550,'',0,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=16 AND name='Angelo Poretti 9 Luppoli American IPA media');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 17,'Cirò rosso superiore','Gaglioppo',2200,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=17 AND name='Cirò rosso superiore');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 17,'Cirò rosato','Gaglioppo',2200,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=17 AND name='Cirò rosato');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 17,'Cirò bianco','Greco bianco',2200,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=17 AND name='Cirò bianco');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 18,'Satèn','Chardonnay',3500,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=18 AND name='Satèn');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 18,'Rosè','Pinot nero 70%, Chardonnay 30%',3500,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=18 AND name='Rosè');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 19,'Celeste','Calabrese · 13%',2600,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=19 AND name='Celeste');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 19,'Terra','Magliocco, Greco nero · 14%',2600,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=19 AND name='Terra');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 19,'Mare','Zibibbo, Malvasia · 12,5%',2600,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=19 AND name='Mare');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 19,'Zibibbo','Zibibbo · 13%',3000,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=19 AND name='Zibibbo');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 19,'Orange','Zibibbo · 13%',2600,'',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=19 AND name='Orange');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 19,'Mishalai (Brut)','Zibibbo, Malvasia · 12%',2400,'',1,6 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=19 AND name='Mishalai (Brut)');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 20,'Chardonnay','Chardonnay · 13%',2200,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=20 AND name='Chardonnay');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 20,'Pecorello','Pecorello · 12,5%',2200,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=20 AND name='Pecorello');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 21,'Petelia','Greco bianco, Montonico · 13,5%',2600,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=21 AND name='Petelia');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 21,'Grayasusi Rame','Gaglioppo · 13%',2600,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=21 AND name='Grayasusi Rame');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 21,'Nanà','Gaglioppo, Magliocco · 13%',2600,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=21 AND name='Nanà');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 22,'Bianco Gaudio','Pecorello, Chardonnay · 14%',2500,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=22 AND name='Bianco Gaudio');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 22,'Rosato Gaudio','Magliocco, Merlot · 14%',2500,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=22 AND name='Rosato Gaudio');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 22,'Rosso Gaudio','Magliocco, Merlot · 14,5%',2500,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=22 AND name='Rosso Gaudio');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 22,'Bianco Baronè','Pecorello · 14%',3000,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=22 AND name='Bianco Baronè');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 22,'Rosso Baronè','Guarnaccia nera · 14,5%',3000,'',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=22 AND name='Rosso Baronè');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 23,'Pircoca','Guarnaccia, Riesling, Traminer, Moscato, Malvasia · 14%',2200,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=23 AND name='Pircoca');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 23,'Donna Filomena','Guarnaccia bianca · 14%',2400,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=23 AND name='Donna Filomena');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 23,'Cyviz','Magliocco dolce · 13%',2200,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=23 AND name='Cyviz');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 23,'Yumi','Pecorello · 14%',2200,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=23 AND name='Yumi');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 23,'Cirés','Magliocco dolce · 14%',2200,'',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=23 AND name='Cirés');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 23,'Orange','Pecorello',2400,'',1,6 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=23 AND name='Orange');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 24,'Pecorello matto','Pecorello · 14%',2400,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=24 AND name='Pecorello matto');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 24,'Due dita','Magliocco 90%, Greco nero 10%',2600,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=24 AND name='Due dita');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 24,'Amarillo','Gaglioppo · 13%',2600,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=24 AND name='Amarillo');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 25,'Ois','Pecorello · 13%',2600,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=25 AND name='Ois');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 25,'Malvasia e Sauvignon','Malvasia, Sauvignon · 13%',2400,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=25 AND name='Malvasia e Sauvignon');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 25,'Balhoo','Greco bianco · 11%',2200,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=25 AND name='Balhoo');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 25,'Colli di Ginestra','Gaglioppo · 12,5%',2200,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=25 AND name='Colli di Ginestra');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 25,'Virgani','Gaglioppo, Magliocco · 13,5%',2200,'',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=25 AND name='Virgani');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 25,'Alma Risa','Gaglioppo · 12,5%',2400,'',1,6 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=25 AND name='Alma Risa');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 26,'Donna Giuliana','Magliocco dolce, Greco nero · 13%',2000,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=26 AND name='Donna Giuliana');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 26,'Monaci','Magliocco · 14,5%',2000,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=26 AND name='Monaci');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 26,'Arinthia','Greco bianco, Chardonnay · 12,5%',2000,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=26 AND name='Arinthia');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 26,'Don Onofrio','Magliocco, Cabernet Sauvignon · 14,5%',2800,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=26 AND name='Don Onofrio');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 27,'Settechiese','Magliocco dolce 60%, Cabernet Sauvignon 30%, Merlot 10% · 13,5%',2000,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=27 AND name='Settechiese');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 27,'Petramola','Pecorello 50%, Chardonnay 50% · 14,5%',2400,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=27 AND name='Petramola');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 27,'Don Filì','Magliocco dolce · 13%',2400,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=27 AND name='Don Filì');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 27,'Quattro lustri','Magliocco dolce · 14%',2400,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=27 AND name='Quattro lustri');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 27,'Filovento','Greco bianco, Pecorello, Riesling · 12,5%',2600,'',1,5 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=27 AND name='Filovento');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 28,'Tribus (frizzante)','Glera · 10,5%',2200,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=28 AND name='Tribus (frizzante)');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 29,'Vescovado','Guardiavalle · 13%',2400,'',1,1 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=29 AND name='Vescovado');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 29,'Scassabarile','Marsigliana nera · 12,5%',2500,'',1,2 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=29 AND name='Scassabarile');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 29,'Vurgadà','Nerello Cappuccio · 14,5%',2600,'',1,3 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=29 AND name='Vurgadà');
INSERT INTO menu_items(category_id,name,description,price_cents,tags,orderable,position) SELECT 29,'Speziale','Marsigliana nera · 12,5%',2500,'',1,4 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id=29 AND name='Speziale');
