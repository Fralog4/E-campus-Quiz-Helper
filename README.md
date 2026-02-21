# E-campus Quiz Helper 📝

**E-campus Quiz Helper** è un'applicazione web moderna e performante progettata per trasformare i file PDF dei "Set Domande" E-campus in quiz interattivi.

Attraverso un parsing intelligente, l'app estrae domande e opzioni, permettendoti di esercitarti ovunque con un feedback immediato, punteggio in tempo reale e una UI curata nei minimi dettagli.

![Anteprima App](https://fralog4.github.io/E-campus-Quiz-Helper/screenshot.png) <!-- Assicurati di aggiungere uno screenshot se possibile -->

## ✨ Nuove Funzionalità (Refactor v2)

- **Design Moderno**: Interfaccia "Glassmorphism" con Dark Mode, animazioni fluide e layout responsive.
- **Parsing Intelligente**: 
  - Salto automatico di prefazione e indici (inizia dalla prima "Lezione").
  - Supporto per domande e opzioni multilinea.
  - Nessuna restrizione sul numero di opzioni (funziona con 2, 3, 4 o più).
  - Riconoscimento automatico della lezione corrente.
- **Esperienza Utente Migliorata**:
  - **Barra di Progresso** animata.
  - **Contatore Score** (Corrette/Sbagliate) sempre visibile.
  - **Scorciatoie da Tastiera**: Usa i numeri `1-9` per rispondere, `Invio` o `Freccia Destra` per saltare/proseguire.
  - **Drag & Drop**: Trascina il PDF direttamente nell'area di caricamento.
- **Feedback Immediato**: Colori distintivi per risposte corrette (verde) e sbagliate (rosso) con evidenziazione della risposta corretta originale.

## 🚀 Come Funziona

1. **Caricamento**: Trascina o seleziona un PDF "Set Domande" scaricato dal portale E-campus.
2. **Estrazione**: L'app usa [PDF.js](https://mozilla.github.io/pdf.js/) per leggere il testo e un algoritmo custom per strutturare il quiz.
3. **Esercitazione**: Rispondi alle domande. L'app assume che la **prima opzione** elencata nel PDF originale sia quella corretta (standard E-campus per i set domande).
4. **Risultati**: Al termine, visualizza un riepilogo con la tua percentuale di successo.

## 🛠️ Architettura Tecnica

Il progetto è stato riscritto con un'architettura modulare in Vanilla JavaScript:

- **`PdfParser`**: Gestisce l'estrazione del testo grezzo preservando la struttura spaziale delle righe.
- **`QuestionParser`**: Analizza il testo riga per riga, gestisce le euristiche di raggruppamento e pulisce il rumore (intestazioni, numeri di pagina).
- **`QuizEngine`**: Gestisce lo stato globale, lo shuffle delle opzioni e il calcolo del punteggio.
- **`QuizUI`**: Gestisce il rendering del DOM, le animazioni e gli eventi utente.

## 💻 Requisiti

- Browser moderno (Chrome, Firefox, Edge, Safari).
- Nessuna installazione richiesta: l'app gira interamente nel tuo browser (privacy garantita, i tuoi PDF non vengono mai caricati su un server).

---

Sviluppato con ❤️ per facilitare lo studio degli studenti E-campus.  
[**Inizia subito a esercitarti!**](https://fralog4.github.io/E-campus-Quiz-Helper/)
