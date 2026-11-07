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

## Deploy automatico su Cloudflare Workers Builds

Questa è una app **Cloudflare Workers + Static Assets + D1**, non un progetto Pages.
Il repository è collegato a **Cloudflare Workers Builds**: ogni push su `main` avvia un nuovo deploy automatico.
La GitHub Action `Deploy Terrazza da Bomber` rimane disponibile solo per l'esecuzione manuale di emergenza, per evitare doppie pubblicazioni.

In **Cloudflare → Workers & Pages → terrazzadabomber → Settings → Build**, imposta:

| Campo | Valore |
| --- | --- |
| Git branch | `main` |
| Root directory | `/` |
| Build command | `npm test && npm run photos` |
| Deploy command | `npm run prepare:cloudflare && npm run migrate:remote && npm run deploy && node scripts/set-secrets.mjs` |
| Build output directory | **Nessuna**: non è Pages |

Cloudflare installa automaticamente le dipendenze prima del build.
In **Build variables and secrets** configura le seguenti variabili **come segreti di build**, non nel repository:

1. `CLOUDFLARE_API_TOKEN`: token Cloudflare con permessi per Workers Scripts e **D1 Edit** nell'account corretto.
2. `CLOUDFLARE_ACCOUNT_ID`: ID dell'account Cloudflare.
3. `ADMIN_PASSWORD`: password amministratore robusta di **almeno 14 caratteri**.

La sequenza automatica verifica i test, prova a copiare le fotografie, crea o riutilizza `terrazzadabomber-db`, esegue le migration, pubblica il Worker e imposta la password admin e le chiavi Web Push. Se il vecchio sito non risponde, la copia delle foto avvisa ma **non blocca più il build**. Per vedere subito il sito su `*.workers.dev` non serve connettere il dominio del cliente.

### Importante: salvare le foto autentiche prima di cambiare DNS

Le fotografie del cliente si trovano su `https://terrazzadabomber.it/assets/img/`. Se Cloudflare non riesce a scaricarle, sul sito si prova temporaneamente a mostrarle dal vecchio dominio. **Dopo aver sostituito i DNS questa soluzione non è più affidabile.** Scarica le 10 foto originali e aggiungile alla cartella `public/assets/img/` su GitHub (ora non è più ignorata da `.gitignore`). Il deploy successivo le renderà disponibili permanentemente.

Per riprovare il backup da un computer che raggiunge il sito originale: `npm run photos`, poi committa le immagini. Se vuoi obbligare il build a interrompersi quando mancano foto, imposta `PHOTOS_REQUIRED=true`, ma **non** farlo nella fase di test.

La connessione finale del dominio resta separata: verifica prima il Worker pubblicato, poi aggiungi il dominio da **Workers → Settings → Domains & Routes → Add Custom Domain**.

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
