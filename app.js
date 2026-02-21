/* ==========================================================================
   E-campus Quiz Helper — app.js
   Modular architecture: PdfParser → QuestionParser → QuizEngine → QuizUI
   ========================================================================== */

"use strict";

/* ---------- PdfParser ----------
   Extracts raw text from a PDF, skipping cover/index pages.
   Returns an array of { lesson, lines } objects.
   ------------------------------------------------------------------ */
const PdfParser = (() => {

  /**
   * Read a PDF File and return extracted text blocks grouped by lesson.
   * @param {File} file
   * @returns {Promise<string>} full text with lessons
   */
  async function extractText(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(new Uint8Array(buffer)).promise;

    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // Join items preserving line breaks by checking the Y position
      const lines = [];
      let lastY = null;
      let currentLine = "";

      for (const item of content.items) {
        const y = Math.round(item.transform[5]); // Y position
        if (lastY !== null && Math.abs(y - lastY) > 5) {
          // New line detected — push previous
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = item.str;
        } else {
          currentLine += item.str;
        }
        lastY = y;
      }
      // Push last line
      if (currentLine.trim()) lines.push(currentLine.trim());

      fullText += lines.join("\n") + "\n";
    }

    return fullText;
  }

  /**
   * Remove everything before the first "Lezione" header.
   * This skips covers, index pages, preambles, etc.
   */
  function skipPreamble(text) {
    const match = text.match(/^(Lezione\s+\d+)/m);
    if (match) {
      return text.substring(match.index);
    }
    // Fallback: return the whole text
    return text;
  }

  return { extractText, skipPreamble };
})();


/* ---------- QuestionParser ----------
   Parses cleaned text into structured question objects.
   ------------------------------------------------------------------ */
const QuestionParser = (() => {

  // Matches question numbers: "01." or "1." or "123." and captures any trailing text
  const QUESTION_NUM_RE = /^(\d{1,3})\.\s*(.*)$/;

  // Matches lesson headers: "Lezione 005", "Lezione 12"
  const LESSON_RE = /^Lezione\s+(\d+)/;

  // Lines to skip (headers, footers, metadata)
  const SKIP_PATTERNS = [
    /^Set Domande:/i,
    /^©/,
    /Università/i,
    /Data Stampa/i,
    /^\d+\/\d+$/,           // Page numbers "1/50"
    /^Docente:/i,
    /^Indice$/i,
    /^Indice Lezioni$/i,
    /^\s*p\.\s*\d+/,        // "p. 2" page references
  ];

  function shouldSkipLine(line) {
    return SKIP_PATTERNS.some(re => re.test(line));
  }

  function unscrambleLine(line) {
    let ctrlCount = 0;
    for (let i = 0; i < line.length; i++) {
      let code = line.charCodeAt(i);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) ctrlCount++;
    }

    let isScrambled = (ctrlCount > 0);

    if (!isScrambled) {
      if (line.length <= 10 && !line.includes(' ')) {
        let s29 = shiftString(line, 29);
        if (/^\d{1,3}\.$/.test(s29)) return s29;
      }
      return line;
    }

    let freqs = {};
    for (let i = 0; i < line.length; i++) {
      let code = line.charCodeAt(i);
      if (code < 32) {
        freqs[code] = (freqs[code] || 0) + 1;
      }
    }

    let bestSpaceCode = -1;
    let maxCount = 0;
    for (const [code, count] of Object.entries(freqs)) {
      if (count > maxCount) {
        maxCount = count;
        bestSpaceCode = parseInt(code);
      }
    }

    if (bestSpaceCode !== -1 && bestSpaceCode >= 2 && bestSpaceCode <= 10) {
      let shift = 32 - bestSpaceCode;
      let shifted = shiftString(line, shift);
      if (getReadabilityScore(shifted) > line.length * 0.7) {
        return shifted;
      }
    }

    let bestShift = 0;
    let bestScore = -1;
    let bestStr = line;

    for (let shift = 25; shift <= 32; shift++) {
      let shifted = shiftString(line, shift);
      let score = getReadabilityScore(shifted);
      if (score > bestScore) {
        bestScore = score;
        bestShift = shift;
        bestStr = shifted;
      }
    }

    if (bestScore > line.length * 0.7) {
      return bestStr;
    }

    return line;
  }

  function shiftString(str, amount) {
    let res = "";
    for (let i = 0; i < str.length; i++) {
      res += String.fromCharCode(str.charCodeAt(i) + amount);
    }
    return res;
  }

  function getReadabilityScore(str) {
    let score = 0;
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if ((code >= 32 && code <= 126) || code === 224 || code === 232 || code === 233 || code === 236 || code === 242 || code === 249) {
        score++;
        if (
          (code >= 97 && code <= 122) ||
          (code >= 65 && code <= 90) ||
          (code >= 48 && code <= 57) ||
          code === 32
        ) {
          score += 0.5;
        }
      }
    }
    return score;
  }

  /**
   * Parse text into an array of question objects.
   * @param {string} text - Cleaned text (preamble already removed)
   * @returns {Array<{number: string, question: string, options: string[], lesson: string}>}
   */
  function parse(text) {
    console.log("🚀 [DEBUG] Inizio parsing. Lunghezza testo:", text.length);
    const rawLines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    // Unscramble e logga le prime righe problematiche
    const lines = rawLines.map((line, idx) => {
      let unscrambled = unscrambleLine(line);
      if (idx > 70 && idx < 95) {
        console.log(`🔎 [DEBUG Riga ${idx}] Originale:`, line);
        console.log(`🔎 [DEBUG Riga ${idx}] Decodificata:`, unscrambled);
      }
      return unscrambled;
    });

    console.log(`📝 [DEBUG] Trovate ${lines.length} righe non vuote.`);

    const questions = [];
    let currentLesson = "";

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Update current lesson
      const lessonMatch = line.match(LESSON_RE);
      if (lessonMatch) {
        currentLesson = `Lezione ${lessonMatch[1]}`;
        console.log(`📚 [DEBUG] Trovata ${currentLesson} alla riga: ${i}`);
        i++;
        continue;
      }

      // Skip noise lines
      if (shouldSkipLine(line)) {
        i++;
        continue;
      }

      // Skip all-uppercase lines (headers like course name)
      if (line === line.toUpperCase() && line.length > 3 && !QUESTION_NUM_RE.test(line)) {
        i++;
        continue;
      }

      // Check for question number
      const qMatch = line.match(QUESTION_NUM_RE);
      if (qMatch) {
        const questionNumber = qMatch[1];
        const questionTextOnSameLine = qMatch[2] ? qMatch[2].trim() : "";
        console.log(`❓ [DEBUG] Trovata domanda ${questionNumber} alla riga ${i}`);

        // First, scan ahead to find the next question number to know our boundary.
        i++;
        let boundary = lines.length;
        for (let j = i; j < lines.length; j++) {
          if (QUESTION_NUM_RE.test(lines[j]) || LESSON_RE.test(lines[j])) {
            boundary = j;
            break;
          }
        }

        let blockLines = lines.slice(i, boundary);
        if (questionTextOnSameLine) {
          blockLines.unshift(questionTextOnSameLine);
        }

        if (blockLines.length === 0) {
          console.log(`⚠️ [DEBUG] Nessun contenuto per la domanda ${questionNumber}`);
          i = boundary;
          continue;
        }

        console.log(`📦 [DEBUG] Righe blocco domanda ${questionNumber}:`, blockLines);
        i = boundary; // advance

        if (blockLines.length < 2) {
          console.log(`⚠️ [DEBUG] Righe insufficienti per la domanda ${questionNumber}`);
          // Need at least question + 1 option — skip
          continue;
        }

        // Strategy: try splitting so that line 0 is question, lines 1+ are options.
        let bestSplit = findBestSplit(blockLines);

        if (bestSplit) {
          console.log(`✅ [DEBUG] Domanda ${questionNumber} parsata con successo`);
          questions.push({
            number: questionNumber,
            question: bestSplit.question,
            options: bestSplit.options,
            lesson: currentLesson,
          });
        } else {
          console.log(`❌ [DEBUG] Impossibile dividere domanda ${questionNumber}`);
        }

        continue;
      }

      // Not a question number, not a lesson header — skip
      i++;
    }

    console.log(`🏁 [DEBUG] Fine parsing. Domande trovate: ${questions.length}`);
    return questions;
  }

  /**
   * Try to determine the best split of block lines into question + options.
   * Returns {question, options} or null if invalid.
   */
  function findBestSplit(blockLines) {
    // Attempt 1: first line = question, rest = options
    let qText = blockLines[0];
    let optLines = blockLines.slice(1);
    let options = mergeMultilineOptions(optLines);

    if (options.length >= 2) {
      return { question: qText, options };
    }

    // Attempt 2: first two lines = question (multiline), rest = options
    if (blockLines.length >= 4) {
      qText = blockLines[0] + " " + blockLines[1];
      optLines = blockLines.slice(2);
      options = mergeMultilineOptions(optLines);

      if (options.length >= 2) {
        return { question: qText, options };
      }
    }

    // Attempt 3: treat each line as an option (question is first line)
    // This is the most lenient approach
    qText = blockLines[0];
    options = blockLines.slice(1);
    if (options.length >= 2) {
      return { question: qText, options };
    }

    return null;
  }

  /**
   * Merge option lines that might be split across multiple lines.
   * An option is typically a self-contained phrase. Continuation lines
   * are usually much shorter or start with lowercase/articles.
   */
  function mergeMultilineOptions(lines) {
    if (lines.length === 0) return [];

    const options = [];
    let current = lines[0];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // If line starts with a lowercase letter, it's likely a continuation
      if (isContinuation(line, current)) {
        current += " " + line;
      } else {
        options.push(current);
        current = line;
      }
    }
    options.push(current);

    return options;
  }

  /**
   * Determine if a line is a continuation of the previous option.
   */
  function isContinuation(line, prevLine) {
    // Starts with lowercase (continuation of previous sentence)
    if (/^[a-zàèéìòù]/.test(line)) return true;

    // Very short fragment mid-sentence (articles, prepositions)
    if (line.length < 8 && /^(del|il|lo|la|i|gli|le|un|uno|una|di|da|in|con|su|per|tra|fra|che|e|o|a)\s/i.test(line)) {
      return true;
    }

    // Previous line doesn't end with sentence-ending punctuation but is very short
    if (prevLine && !prevLine.match(/[.?!,;:]$/) && prevLine.length < 25 && line.length < 25) {
      return true;
    }

    return false;
  }

  return { parse };
})();


/* ---------- QuizEngine ----------
   Manages quiz state: current question, score, history.
   ------------------------------------------------------------------ */
const QuizEngine = (() => {

  let questions = [];
  let currentIndex = 0;
  let answers = []; // Track user's defined correct answer (locked): string (the option text)
  let selected = []; // Track user's temporary current selection: string

  function init(parsedQuestions) {
    questions = parsedQuestions.map(q => ({
      ...q,
      // Shuffle options but remember them
      shuffledOptions: shuffleArray([...q.options]),
    }));
    currentIndex = 0;
    answers = new Array(questions.length).fill(null);
    selected = new Array(questions.length).fill(null);
  }

  function getCurrent() {
    if (currentIndex < 0 || currentIndex >= questions.length) return null;
    return questions[currentIndex];
  }

  function getIndex() { return currentIndex; }
  function getTotal() { return questions.length; }
  function getAnswer(idx) { return answers[idx]; }
  function getSelected(idx) { return selected[idx]; }

  // Ritorna il numero di domande a cui l'utente ha assegnato una risposta
  function getAnsweredCount() {
    return answers.filter(a => a !== null).length;
  }

  function selectCurrent(selectedOption) {
    if (answers[currentIndex] !== null) return false; // already locked
    selected[currentIndex] = selectedOption; // Allow switching selection
    return true;
  }

  function lockCurrent(selectedOption) {
    if (answers[currentIndex] !== null) return false;
    answers[currentIndex] = selectedOption;
    selected[currentIndex] = selectedOption; // Ensure it's selected as well
    return true;
  }

  function next() {
    if (currentIndex < questions.length - 1) {
      currentIndex++;
      return true;
    }
    return false; // at the end
  }

  function prev() {
    if (currentIndex > 0) {
      currentIndex--;
      return true;
    }
    return false;
  }

  function isComplete() {
    return answers.every(a => a !== null);
  }

  function isAtEnd() {
    return currentIndex >= questions.length - 1;
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return { init, getCurrent, getIndex, getTotal, getAnswer, getSelected, getAnsweredCount, selectCurrent, lockCurrent, next, prev, isComplete, isAtEnd };
})();


/* ---------- QuizUI ----------
   Handles all DOM interactions and user events.
   ------------------------------------------------------------------ */
const QuizUI = (() => {

  // DOM references
  const $ = id => document.getElementById(id);

  const dom = {};

  function cacheDom() {
    dom.uploadSection = $("uploadSection");
    dom.quizSection = $("quizSection");
    dom.resultsSection = $("resultsSection");
    dom.pdfInput = $("pdfInput");
    dom.uploadArea = $("uploadArea");
    dom.fileName = $("fileName");
    dom.loading = $("loading");
    dom.progressBar = $("progressBar");
    dom.progressText = $("progressText");
    // Nascondiamo i vecchi badge score perché il quiz ora è in "modalità studio"
    dom.scoreCorrect = $("scoreCorrect");
    dom.scoreWrong = $("scoreWrong");
    if (dom.scoreCorrect && dom.scoreCorrect.parentElement) dom.scoreCorrect.parentElement.style.display = 'none';
    if (dom.scoreWrong && dom.scoreWrong.parentElement) dom.scoreWrong.parentElement.style.display = 'none';

    dom.lessonBadge = $("lessonBadge");
    dom.questionNumber = $("questionNumber");
    dom.questionText = $("questionText");
    dom.optionsContainer = $("optionsContainer");
    dom.btnPrev = $("btnPrev");
    dom.btnSkip = $("btnSkip");
    dom.btnNext = $("btnNext");
    dom.resultsIcon = $("resultsIcon");
    dom.resultsTitle = $("resultsTitle");
    dom.resultsSubtitle = $("resultsSubtitle");
    dom.resultCorrectCount = $("resultCorrectCount");
    dom.resultWrongCount = $("resultWrongCount");
    dom.resultTotalCount = $("resultTotalCount");
    dom.btnRestart = $("btnRestart");
    dom.btnNewPdf = $("btnNewPdf");
  }

  function init() {
    cacheDom();
    bindEvents();
  }

  function bindEvents() {
    // File input
    dom.pdfInput.addEventListener("change", handleFileSelect);

    // Drag & drop
    dom.uploadArea.addEventListener("dragover", e => {
      e.preventDefault();
      dom.uploadArea.classList.add("upload-area--dragover");
    });
    dom.uploadArea.addEventListener("dragleave", () => {
      dom.uploadArea.classList.remove("upload-area--dragover");
    });
    dom.uploadArea.addEventListener("drop", e => {
      e.preventDefault();
      dom.uploadArea.classList.remove("upload-area--dragover");
      if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type === "application/pdf") {
          processFile(file);
        }
      }
    });

    // Navigation
    dom.btnSkip.addEventListener("click", () => {
      if (QuizEngine.isAtEnd()) {
        showResults();
      } else {
        QuizEngine.next();
        renderQuestion();
      }
    });

    dom.btnPrev.addEventListener("click", () => {
      QuizEngine.prev();
      renderQuestion();
    });

    dom.btnNext.addEventListener("click", () => {
      if (QuizEngine.isAtEnd()) {
        showResults();
      } else {
        QuizEngine.next();
        renderQuestion();
      }
    });

    // Results
    dom.btnRestart.addEventListener("click", () => {
      // Re-init with same questions (re-shuffle)
      const questions = [];
      for (let i = 0; i < QuizEngine.getTotal(); i++) {
        // We need the originals — we'll store them
      }
      // Simpler: just reload the current parsed data
      location.reload();
    });

    dom.btnNewPdf.addEventListener("click", () => {
      showSection("upload");
      dom.fileName.textContent = "";
      dom.pdfInput.value = "";
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", handleKeyboard);
  }

  function handleKeyboard(e) {
    // Only handle when quiz is visible
    if (!dom.quizSection.classList.contains("quiz-section--visible")) return;

    const q = QuizEngine.getCurrent();
    if (!q) return;

    // Number keys 1-9 → select option
    if (e.key >= "1" && e.key <= "9") {
      const idx = parseInt(e.key) - 1;
      if (idx < q.shuffledOptions.length && QuizEngine.getAnswer(QuizEngine.getIndex()) === null) {
        handleAnswer(q.shuffledOptions[idx]);
      }
    }

    // Arrow right or Enter → next/skip
    if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      if (QuizEngine.getAnswer(QuizEngine.getIndex()) !== null) {
        // Already answered → go next
        if (QuizEngine.isAtEnd()) showResults();
        else { QuizEngine.next(); renderQuestion(); }
      } else {
        // Skip
        if (QuizEngine.isAtEnd()) showResults();
        else { QuizEngine.next(); renderQuestion(); }
      }
    }

    // Arrow left → prev
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      QuizEngine.prev();
      renderQuestion();
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
  }

  async function processFile(file) {
    dom.fileName.textContent = file.name;
    dom.loading.classList.add("loading--visible");

    try {
      const rawText = await PdfParser.extractText(file);
      const cleanedText = PdfParser.skipPreamble(rawText);
      const questions = QuestionParser.parse(cleanedText);

      console.log(`✅ Parsed ${questions.length} questions`, questions);

      dom.loading.classList.remove("loading--visible");

      if (questions.length === 0) {
        dom.fileName.textContent = "⚠️ Nessuna domanda trovata. Assicurati che sia un Set Domande E-campus.";
        return;
      }

      QuizEngine.init(questions);
      showSection("quiz");
      renderQuestion();

    } catch (err) {
      console.error("Error processing PDF:", err);
      dom.loading.classList.remove("loading--visible");
      dom.fileName.textContent = "❌ Errore nel caricamento del PDF. Riprova.";
    }
  }

  function showSection(section) {
    dom.uploadSection.style.display = "none";
    dom.uploadSection.classList.remove("upload-section");
    dom.quizSection.classList.remove("quiz-section--visible");
    dom.resultsSection.classList.remove("results-section--visible");

    switch (section) {
      case "upload":
        dom.uploadSection.style.display = "";
        dom.uploadSection.classList.add("upload-section");
        break;
      case "quiz":
        dom.quizSection.classList.add("quiz-section--visible");
        break;
      case "results":
        dom.resultsSection.classList.add("results-section--visible");
        break;
    }
  }

  function renderQuestion() {
    const q = QuizEngine.getCurrent();
    if (!q) return;

    const idx = QuizEngine.getIndex();
    const total = QuizEngine.getTotal();
    const previousLocked = QuizEngine.getAnswer(idx);
    const previousSelected = QuizEngine.getSelected(idx);

    // Progress
    const progress = ((idx + 1) / total) * 100;
    dom.progressBar.style.width = progress + "%";
    dom.progressText.textContent = `Domanda ${idx + 1} di ${total}`;

    // Lesson badge
    if (q.lesson) {
      dom.lessonBadge.textContent = q.lesson;
      dom.lessonBadge.style.display = "";
    } else {
      dom.lessonBadge.style.display = "none";
    }

    // Question
    dom.questionNumber.textContent = `Domanda ${q.number}`;
    dom.questionText.textContent = q.question;

    // Options
    dom.optionsContainer.innerHTML = "";
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    q.shuffledOptions.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "quiz-option";

      // Applico logica disabilitazione e colore
      if (previousLocked !== null) {
        btn.classList.add("quiz-option--disabled");
        if (opt === previousLocked) {
          btn.classList.add("quiz-option--correct"); // Verde: l'utente l'ha fissata
        }
      } else if (previousSelected !== null) {
        // Se c'è una selezione ma non è lockata
        if (opt === previousSelected) {
          btn.style.borderColor = "var(--primary-color, #705DFA)"; // Simula click
          btn.style.boxShadow = "0 0 0 1px var(--primary-color, #705DFA)";
        }
      }

      const letter = document.createElement("span");
      letter.className = "quiz-option__letter";
      letter.textContent = letters[i] || (i + 1);

      const text = document.createElement("span");
      text.className = "quiz-option__text";
      text.textContent = opt;

      btn.appendChild(letter);
      btn.appendChild(text);

      if (previousLocked === null) {
        btn.addEventListener("click", () => handleOptionClick(opt, btn));
      }

      dom.optionsContainer.appendChild(btn);
    });

    // If previously answered wrong, also highlight the wrong one
    // (we need to do this after rendering all options)

    // Navigation buttons
    dom.btnPrev.disabled = idx === 0;

    // Possiamo skippare / andare avanti liberamente ora che il quiz è per studio
    dom.btnSkip.style.display = (previousLocked === null && previousSelected === null) ? "" : "none";
    dom.btnNext.style.display = (previousLocked !== null || previousSelected !== null) ? "" : "none";
    dom.btnNext.disabled = false;
    dom.btnNext.textContent = QuizEngine.isAtEnd() ? "Risultati →" : "Prossima →";

    // Animate
    const card = dom.optionsContainer.closest(".quiz-card");
    card.classList.remove("fade-in");
    void card.offsetWidth; // trigger reflow
    card.classList.add("fade-in");
  }

  function handleOptionClick(optText, btnElem) {
    const isAlreadySelected = QuizEngine.getSelected(QuizEngine.getIndex()) === optText;

    if (isAlreadySelected) {
      // Secondo clic = Lock (corretta)
      const locked = QuizEngine.lockCurrent(optText);
      if (!locked) return;

      const buttons = dom.optionsContainer.querySelectorAll(".quiz-option");
      buttons.forEach(btn => {
        btn.classList.add("quiz-option--disabled");
        // Reset inline styles
        btn.style.borderColor = "";
        btn.style.boxShadow = "";

        if (btn.querySelector(".quiz-option__text").textContent === optText) {
          btn.classList.add("quiz-option--correct");
        }
      });

    } else {
      // Primo clic: seleziona e basta
      const selectedSuccess = QuizEngine.selectCurrent(optText);
      if (!selectedSuccess) {
        // in case it was a different option we were trying to select 
        // (which should be allowed, we just switch the selection before locking)
        QuizEngine.selectCurrent(optText); // we need the engine to be able to switch selection
      }

      const buttons = dom.optionsContainer.querySelectorAll(".quiz-option");
      buttons.forEach(btn => {
        if (btn.querySelector(".quiz-option__text").textContent === optText) {
          btn.style.borderColor = "var(--primary-color, #705DFA)";
          btn.style.boxShadow = "0 0 0 1px var(--primary-color, #705DFA)";
        } else {
          btn.style.borderColor = "";
          btn.style.boxShadow = "";
        }
      });
    }

    // Aggiorna pulsanti navigazione
    dom.btnSkip.style.display = "none";
    dom.btnNext.style.display = "";
    dom.btnNext.textContent = QuizEngine.isAtEnd() ? "Risultati →" : "Prossima →";
  }


  function showResults() {
    const total = QuizEngine.getTotal();
    const answered = QuizEngine.getAnsweredCount();
    const percentage = answered > 0 ? Math.round((answered / total) * 100) : 0;

    // Poiché siamo in modalità ripasso/salvataggio
    let icon = "�";
    let title = "Sessione completata";
    let subtitle = `Hai selezionato la risposta per ${answered} domande su ${total} (${percentage}%).`;

    dom.resultsIcon.textContent = icon;
    dom.resultsTitle.textContent = title;
    dom.resultsSubtitle.textContent = subtitle;

    // Rimuoviamo il dettaglio errori/corrette dai risultati
    if (dom.resultCorrectCount) dom.resultCorrectCount.parentElement.style.display = 'none';
    if (dom.resultWrongCount) dom.resultWrongCount.parentElement.style.display = 'none';
    if (dom.resultTotalCount) dom.resultTotalCount.parentElement.style.display = 'none';

    showSection("results");
  }

  return { init };
})();


/* ---------- Bootstrap ---------- */
document.addEventListener("DOMContentLoaded", () => {
  QuizUI.init();
});