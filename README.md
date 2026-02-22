# E-campus Quiz Helper 📝

**E-campus Quiz Helper** è un'applicazione web moderna e performante progettata per trasformare i file PDF dei "Set Domande" E-campus in quiz interattivi.

Attraverso un parsing intelligente, l'app estrae domande e opzioni, permettendoti di esercitarti ovunque con un feedback immediato, punteggio in tempo reale e una UI curata nei minimi dettagli.

![Anteprima App](https://fralog4.github.io/E-campus-Quiz-Helper/screenshot.png) <!-- Assicurati di aggiungere uno screenshot se possibile -->

## ✨ Nuove Funzionalità (Refactor v3)

- **Design Moderno**: Interfaccia "Glassmorphism" con Dark Mode, animazioni fluide e layout responsive.
- **Parsing Intelligente ed Evasione Offuscamento**: 
  - Bypass dei font criptati/offuscati di E-campus con un algoritmo euristico (`unscrambleLine`).
  - Salto automatico di prefazione e indici (inizia dalla prima "Lezione").
  - Supporto per domande e opzioni multilinea scritte sulla stessa riga del numero domanda.
- **Modalità Studio Pratica**:
  - Non essendoci modo di conoscere la risposta corretta dai PDF, il quiz è diventato un compagno di studio.
  - **Singolo clic**: Seleziona temporaneamente un'opzione per testare te stesso.
  - **Doppio clic**: Conferma e blocca l'opzione come corretta. Da quel momento diverrà verde e le altre verranno disabilitate, memorizzando la tua scelta.
- **Esperienza Utente Migliorata**:
  - **Barra di Progresso** animata e tracciamento delle domande salvate.
  - **Drag & Drop**: Trascina il PDF direttamente nell'area di caricamento.

## 🚀 Come Funziona

1. **Caricamento**: Trascina o seleziona un PDF "Set Domande" scaricato dal portale E-campus.
2. **Estrazione e Decodifica**: L'app usa [PDF.js](https://mozilla.github.io/pdf.js/) per leggere il testo e applica un avanzato algoritmo di decifrazione ASCII per ovviare ai classici font "scrambled" di E-campus.
3. **Ripasso e Memorizzazione**: Usa il singolo clic per testare una risposta. Controlla sulle tue dispense se è giusta, quindi fai **doppio clic** per fissarla in verde. La risposta sarà memorizzata per tutta la sessione.
4. **Risultati**: Al termine, visualizza un riepilogo con il totale delle risposte che hai confermato e studiato.

## 🛠️ Architettura Tecnica

Il progetto è stato riscritto con un'architettura modulare in Vanilla JavaScript:

- **`PdfParser`**: Gestisce l'estrazione del testo grezzo.
- **`QuestionParser`**: Decodifica i caratteri sfasati (`unscrambleLine`), isola i numeri delle domande (`QUESTION_NUM_RE`), raggruppa opzioni multilinea e pulisce il rumore.
- **`QuizEngine`**: Gestisce lo stato globale (selezione temporanea vs selezione bloccata-doppio clic).
- **`QuizUI`**: Gestisce il rendering del DOM, interazioni single/double click e le animazioni.

## 💻 Requisiti

- Browser moderno (Chrome, Firefox, Edge, Safari).
- Nessuna installazione richiesta: l'app gira interamente nel tuo browser (privacy garantita, i tuoi PDF non vengono mai inviati a un server).

---

Sviluppato con ❤️ per facilitare lo studio degli studenti E-campus.  
[**Inizia subito a esercitarti!**](https://fralog4.github.io/E-campus-Quiz-Helper/)
