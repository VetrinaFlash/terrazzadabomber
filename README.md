# Terrazza da Bomber — Experience & Reservations

Sito premium, motion editorial, gallery fotografica reale e sistema tavoli per **Terrazza da Bomber**, Scalea (CS). Solo prenotazioni: **nessun e-commerce, pagamenti o commissioni WhatsApp**.

## Funzionalità

- Sito mobile-first: hero fotografica, animazioni leggere e rispettose di `prefers-reduced-motion`, sezioni editoriali, gallery, indicazioni e contatti reali.
- Richiesta tavolo con data, numero ospiti, orari realmente disponibili, validazione lato server e consenso privacy.
- Dashboard `/admin/` riservata: agenda per data, filtri, conferma/annullamento, aggiunta manuale, pulsante WhatsApp con testo precompilato (invio manuale), coperti.
- Sala: elenco tavoli modificabili e stato di occupazione per fascia. Impostazioni: attiva/disattiva prenotazioni, orari, durata, gruppi e date di chiusura.
- Database Cloudflare D1 con inserimento atomico del tavolo libero per ridurre doppie assegnazioni anche con richieste contemporanee. Pulizia programmata dei dati delle prenotazioni dopo 90 giorni.
- Notifiche push gratuite tramite Web Push con VAPID, da attivare dal dispositivo dell'amministratore. Il sistema invia soltanto "Nuova prenotazione", senza dati personali nelle notifiche.
- Login protetto con secret Cloudflare, cookie `HttpOnly`, `SameSite=Strict` e firma HMAC; protezione sull'origine, limitazione tentativi di accesso e invio prenotazioni.
- Foto ORIGINALI della versione precedente del sito. La workflow scarica le immagini **prima del cambio di DNS** e le incorpora negli asset statici pubblicati su Cloudflare.

## Pubblicazione automatizzata (una sola configurazione)

Questo progetto usa **Cloudflare Workers + Static Assets + D1**, non Cloudflare Pages. È compatibile con GitHub Actions. Dopo aver collegato GitHub, devi impostare nella repository `Settings → Secrets and variables → Actions` **tre secret**, mai nel codice:

1. `CLOUDFLARE_API_TOKEN` — token di Cloudflare con accesso Workers Scripts Edit e D1 Edit (per l'account).
2. `CLOUDFLARE_ACCOUNT_ID` — ID account Cloudflare (dashboard).
3. `ADMIN_PASSWORD` — password robusta dell'amministratore (almeno 14 caratteri; evita password facili).

Dopo il push su `main` o `Actions → Deploy Terrazza da Bomber → Run workflow`, la pipeline:

1. verifica test automatici e copia le foto originali nel bundle di deploy;
2. crea o riutilizza automaticamente il database D1 `terrazzadabomber-db`;
3. aggiorna `wrangler.json` **solo nella workspace temporanea della pipeline** con l'ID D1 reale, poi applica le migrations;
4. pubblica il Worker `terrazzadabomber` con i file statici;
5. configura `ADMIN_PASSWORD` e una coppia di chiavi VAPID stabili, derivata deterministicamente dalla password tramite SHA-256 e P-256. **Cambiare password invalida anche le sottoscrizioni push** e richiede di riattivarle dal pannello.

Il Worker comparirà su `https://terrazzadabomber.<tuo-subdomain>.workers.dev` (il sottodominio dipende dal tuo account Cloudflare). **La connessione del dominio `terrazzadabomber.it` non è automatica**: in Cloudflare `Workers & Pages → terrazzadabomber → Settings → Domains & Routes → Add Custom Domain` seleziona il dominio dopo avere verificato l'anteprima. Non sostituire i DNS prima di aver conservato le foto originali.

### Primo accesso

- URL admin: `/admin/` sul dominio Workers o su quello personalizzato.
- Password: valore del secret `ADMIN_PASSWORD`, nessun account email necessario.
- **Prima di attivare le prenotazioni**: dal pannello aggiorna il numero effettivo di tavoli, la capienza, le fasce e la durata. I tavoli D1 iniziali sono **solo esempi** (2,2,4,4,4,6,6,8 posti). Poi vai in `Impostazioni → Prenotazioni online` e attiva.
- Per notifiche: clicca `Attiva notifiche` e consenti i permessi del browser. Browser HTTPS richiesto. Su iOS, aggiungi la web app alla schermata Home prima di abilitare le notifiche.

### Come confermare su WhatsApp

`Conferma` cambia lo stato nel gestionale. Il link `WhatsApp` apre il messaggio pronto al numero del cliente: lo staff deve **premere invio**, non è un invio automatico. Le Chat API ufficiali e i template WhatsApp Business non sono necessari per questa modalità, quindi non ci sono costi di messaggistica API.

## Sviluppo locale

Richiede Node 22 o superiore.

```bash
npm install
npm run migrate:local
# Crea .dev.vars con ADMIN_PASSWORD=una-password-lunga-per-test
npm run dev
```

Usa il file di configurazione con UUID D1 placeholder **solo per sviluppo locale**. Per il primo deploy remoto la pipeline lo sostituisce con l'UUID reale. Test: `npm test`.

## Protezione dati

Le prenotazioni e i dati personali sono salvati solo sul D1; la gallery è locale sul Worker dopo la copia. Non utilizzare questo progetto per accettare prenotazioni vere finché il cliente non ha verificato tavoli, orari, informativa privacy, dominio, notifiche e messaggi WhatsApp su dispositivi reali.
