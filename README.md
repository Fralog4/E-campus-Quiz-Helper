# E-campus-Quiz-Helper

E-campus-Quiz-Helper è un'applicazione web progettata per creare e testare quiz a partire da file PDF. L'app analizza il contenuto di un file PDF caricato dall'utente, estrae le domande e le opzioni di risposta, e le presenta in un'interfaccia interattiva per il quiz.

## Funzionalità

- **Caricamento di file PDF**: L'utente può caricare un file PDF contenente domande e risposte.
- **Parsing automatico**: Il contenuto del PDF viene analizzato per identificare domande e opzioni di risposta.
- **Interfaccia interattiva**: Le domande vengono mostrate una alla volta, con pulsanti per selezionare le risposte.
- **Navigazione tra le domande**: Include un pulsante "Salta" per passare alla domanda successiva.

## Come funziona

1. **Caricamento del PDF**: L'utente seleziona un file PDF tramite l'input file.
2. **Estrazione del testo**: Il contenuto del PDF viene letto e convertito in testo utilizzando la libreria [PDF.js](https://mozilla.github.io/pdf.js/).
3. **Parsing delle domande**: Il testo viene analizzato per identificare domande e opzioni di risposta, basandosi su pattern specifici.
4. **Visualizzazione del quiz**: Le domande vengono mostrate una alla volta in un contenitore HTML, con pulsanti per selezionare le risposte.

## Requisiti

- Un browser moderno con supporto per JavaScript.
- La libreria [PDF.js](https://mozilla.github.io/pdf.js/) per l'elaborazione dei file PDF.

## Struttura del codice

- **`readPdf`**: Funzione che legge il file PDF caricato e ne estrae il contenuto.
- **`parseQuestion`**: Funzione che analizza il testo estratto per identificare domande e opzioni.
- **`displayQuestion`**: Funzione che mostra una domanda e le sue opzioni nell'interfaccia utente.
- **`nextQuestion`**: Funzione per passare alla domanda successiva.

## Come utilizzare l'app

1. Apri l'applicazione in un browser.
2. Carica un file PDF Set Domande E-campus.
3. Inizia il quiz rispondendo alle domande o saltandole con il pulsante "Salta".

## Limitazioni

- Il parsing delle domande si basa su pattern semplici e potrebbe non funzionare correttamente con PDF complessi o formattati in modo inconsueto.
- Ogni domanda deve avere esattamente 4 opzioni per essere riconosciuta.
- Disegnato su modello Set Domande E-campus

## Contributi

Se vuoi contribuire al progetto, sentiti libero di inviare una pull request o segnalare problemi nella sezione delle issue.