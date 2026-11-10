# Tipiko Ristorante Pizzeria — Sito, ordini online e prenotazioni

Sito ufficiale di **Tipiko Ristorante Pizzeria**, Via S. Bernardino 1, Amantea (CS). Cloudflare Workers + Static Assets + D1.
Il repository e il database (`terrazzadabomber`, `terrazzadabomber-db`) sono stati riconvertiti per Tipiko: **stesso Worker, stesso D1, stesso branch `main`**.

## Cosa fa

- **Menu digitale completo** (148 voci: ristorante, pizzeria, beverage, carta dei vini) con prezzi reali, ricerca, sezioni e categorie.
  Fonte: app ufficiale del locale (novembre 2026), in `scripts/menu-source.txt`.
- **Ordini online asporto e consegna**: carrello, scelta giorno/orario, indirizzo per la consegna, pagamento al ritiro/consegna (contanti o carta). Nessun pagamento online e nessuna commissione.
  I prezzi sono **sempre ricalcolati dal server** dal database; il cliente non può alterarli.
- **Capienza per fascia oraria** (numero massimo di ordini per orario) con inserimento atomico su D1, preavviso minimo, giorni ordinabili in anticipo, ordine minimo e costo di consegna.
- **Pagina di stato dell'ordine** `/ordine/#token`: il cliente segue l'ordine (ricevuto → confermato → in preparazione → pronto/in consegna) e può annullarlo finché non è confermato. Nel DB c'è solo l'hash del token.
- **Prenotazione tavoli** (sistema esistente): calendario, richieste da confermare, link personale `/gestisci/`, chiusure.
- **Gestionale `/admin/`**:
  - *Ordini*: lista del giorno, avviso sonoro e badge per i nuovi ordini, aggiornamento automatico ogni 20 s, cambio stato in un tocco, messaggio WhatsApp precompilato con link di tracciamento, **stampa comanda** (formato scontrino 72 mm) e riepilogo del giorno.
  - *Menu*: modifica piatti, prezzi, descrizioni, etichette (vegano, piccante…), categorie; interruttore "esaurito" che nasconde subito il piatto.
  - *Ordini & locale*: attiva/disattiva ordini, asporto, consegna, carta; costo e minimo consegna; zone; fasce orarie; contatti e orari mostrati sul sito.
  - *Prenotazioni, Tavoli, Orari tavoli e chiusure*: come prima. Le chiusure valgono anche per gli ordini.
- Notifiche push (Web Push/VAPID) per nuovi ordini e prenotazioni, invariate.
- Pulizia automatica di ordini e prenotazioni dopo 90 giorni (cron giornaliero).

## Impostazioni iniziali (migration 0005)

- Orari: pranzo 12:30–14:30, cena 19:00–23:00, **chiuso il martedì** (fonte: Google Maps). Prenotazioni e chiusure del vecchio cliente sono state riallineate.
- Asporto e consegna attivi, **costo consegna 0 € e minimo 0 €**: verificare con il cliente e impostarli da *Ordini & locale*.
- Birre alla spina e filetto a peso sono "solo al tavolo" (non ordinabili online).
- "Crea la tua pizza" dell'app originale non è stata riportata: si può aggiungere come piatto o con le note per piatto.

## Immagini

Logo, foto della sala e della pizza Contadina vengono scaricate durante il build (`npm run photos`) dall'host originale (fw360) in `public/assets/img/`.
Se il download fallisce il sito usa direttamente l'URL originale. Per renderle permanenti, committa i file in `public/assets/img/`.

## Deploy automatico su Cloudflare Workers Builds

Questa è una app **Cloudflare Workers + Static Assets + D1**, non un progetto Pages.
Il repository è collegato a **Cloudflare Workers Builds**: ogni push su `main` avvia un nuovo deploy automatico.
La GitHub Action di deploy rimane disponibile solo per l'esecuzione manuale di emergenza, per evitare doppie pubblicazioni.

In **Cloudflare → Workers & Pages → terrazzadabomber → Settings → Build**, imposta:

| Campo | Valore |
| --- | --- |
| Git branch | `main` |
| Root directory | `/` |
| Build command | `npm test && npm run photos` |
| Deploy command | `npm run prepare:cloudflare && npm run migrate:remote && npm run deploy && node scripts/set-secrets.mjs` |
| Build output directory | **Nessuna**: non è Pages |

Cloudflare installa automaticamente le dipendenze prima del build.
In **Build variables and secrets** configura soltanto le credenziali **di build** (non nel repository):

1. `CLOUDFLARE_API_TOKEN`: token Cloudflare con permessi per Workers Scripts e **D1 Edit** nell'account corretto.
2. `CLOUDFLARE_ACCOUNT_ID`: ID dell'account Cloudflare.

**Non aggiungere `ADMIN_PASSWORD` fra i segreti di build.** La password è già stata impostata dal titolare come secret **runtime** in **Worker → Settings → Variables and Secrets → Production**. La password dev'essere lunga almeno 14 caratteri, e non bisogna ruotarla o cambiarla durante i deploy. I segreti di build non possono leggere i valori runtime.

Il comando `npm run deploy` ora esegue `wrangler deploy --keep-vars`, mantenendo la password admin e le eventuali chiavi Web Push già configurate in Production. Lo script compatibile `set-secrets.mjs` non richiede più `ADMIN_PASSWORD` né modifica alcun secret. Questo risolve l'errore `ADMIN_PASSWORD mancante o più corta di 14 caratteri` che bloccava le pubblicazioni, mentre l'admin continuava a funzionare.

La sequenza automatica verifica i test, prova a copiare le fotografie, crea o riutilizza `terrazzadabomber-db`, esegue le migration e pubblica il Worker **senza toccare i secret Production**. Se il vecchio sito non risponde, la copia delle foto avvisa ma **non blocca più il build**. Per vedere subito il sito su `*.workers.dev` non serve connettere il dominio del cliente.

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
