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

  // Matches standalone question numbers: "01." or "1." or "123."
  const QUESTION_NUM_RE = /^(\d{1,3})\.\s*$/;

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

  /**
   * Parse text into an array of question objects.
   * @param {string} text - Cleaned text (preamble already removed)
   * @returns {Array<{number: string, question: string, options: string[], lesson: string}>}
   */
  function parse(text) {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const questions = [];
    let currentLesson = "";

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Update current lesson
      const lessonMatch = line.match(LESSON_RE);
      if (lessonMatch) {
        currentLesson = `Lezione ${lessonMatch[1]}`;
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

        // Collect the question text (may span multiple lines until first option)
        i++;
        let questionText = "";

        // The question text is the lines between the number and the first option.
        // First, scan ahead to find the next question number to know our boundary.
        let boundary = lines.length;
        for (let j = i; j < lines.length; j++) {
          if (QUESTION_NUM_RE.test(lines[j]) || LESSON_RE.test(lines[j])) {
            boundary = j;
            break;
          }
        }

        // Now within [i, boundary), the first line(s) are the question,
        // and the rest are options. The tricky part is telling where the
        // question ends and options begin.
        //
        // Heuristic: the question is the first run of lines. Since options
        // in E-campus PDFs tend to start uniformly, we take the first line as
        // the question and then check if subsequent lines BEFORE the option block
        // are continuations.
        //
        // Actually the simplest robust approach: the question is the first line,
        // and all subsequent lines up to the boundary are options.
        // Some questions may span multiple lines, but rarely — and when they do,
        // the last "option" would be too few. We handle this below.

        if (i >= boundary) {
          // No content for this question number — skip
          i++;
          continue;
        }

        // Gather all lines in this question block
        const blockLines = lines.slice(i, boundary);
        i = boundary; // advance

        if (blockLines.length < 2) {
          // Need at least question + 1 option — skip
          continue;
        }

        // Strategy: try splitting so that line 0 is question, lines 1+ are options.
        // If that gives < 2 options, try merging the first two lines as question.
        let bestSplit = findBestSplit(blockLines);

        if (bestSplit) {
          questions.push({
            number: questionNumber,
            question: bestSplit.question,
            options: bestSplit.options,
            lesson: currentLesson,
          });
        }

        continue;
      }

      // Not a question number, not a lesson header — skip
      i++;
    }

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
  let score = { correct: 0, wrong: 0 };
  let answers = []; // Track user's answer per question: null | 'correct' | 'wrong'

  function init(parsedQuestions) {
    questions = parsedQuestions.map(q => ({
      ...q,
      // Shuffle options but remember original order (first option = correct in E-campus)
      correctAnswer: q.options[0],
      shuffledOptions: shuffleArray([...q.options]),
    }));
    currentIndex = 0;
    score = { correct: 0, wrong: 0 };
    answers = new Array(questions.length).fill(null);
  }

  function getCurrent() {
    if (currentIndex < 0 || currentIndex >= questions.length) return null;
    return questions[currentIndex];
  }

  function getIndex() { return currentIndex; }
  function getTotal() { return questions.length; }
  function getScore() { return { ...score }; }
  function getAnswer(idx) { return answers[idx]; }

  function answerCurrent(selectedOption) {
    const q = getCurrent();
    if (!q || answers[currentIndex] !== null) return null; // already answered

    const isCorrect = selectedOption === q.correctAnswer;
    answers[currentIndex] = isCorrect ? "correct" : "wrong";
    if (isCorrect) score.correct++;
    else score.wrong++;

    return isCorrect;
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

  return { init, getCurrent, getIndex, getTotal, getScore, getAnswer, answerCurrent, next, prev, isComplete, isAtEnd };
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
    dom.scoreCorrect = $("scoreCorrect");
    dom.scoreWrong = $("scoreWrong");
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
    const score = QuizEngine.getScore();
    const previousAnswer = QuizEngine.getAnswer(idx);

    // Progress
    const progress = ((idx + 1) / total) * 100;
    dom.progressBar.style.width = progress + "%";
    dom.progressText.textContent = `Domanda ${idx + 1} di ${total}`;
    dom.scoreCorrect.textContent = score.correct;
    dom.scoreWrong.textContent = score.wrong;

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

      if (previousAnswer !== null) {
        btn.classList.add("quiz-option--disabled");
        if (opt === q.correctAnswer) {
          btn.classList.add("quiz-option--correct");
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

      if (previousAnswer === null) {
        btn.addEventListener("click", () => handleAnswer(opt));
      }

      dom.optionsContainer.appendChild(btn);
    });

    // If previously answered wrong, also highlight the wrong one
    // (we need to do this after rendering all options)
    if (previousAnswer === "wrong") {
      // Find which button the user clicked — we don't store that,
      // so just show all wrong ones as disabled and correct one as correct
      // That's already handled above.
    }

    // Navigation buttons
    dom.btnPrev.disabled = idx === 0;
    dom.btnSkip.style.display = previousAnswer === null ? "" : "none";
    dom.btnNext.style.display = previousAnswer !== null ? "" : "none";
    dom.btnNext.disabled = false;
    dom.btnNext.textContent = QuizEngine.isAtEnd() ? "Risultati →" : "Prossima →";

    // Animate
    const card = dom.optionsContainer.closest(".quiz-card");
    card.classList.remove("fade-in");
    void card.offsetWidth; // trigger reflow
    card.classList.add("fade-in");
  }

  function handleAnswer(selectedOption) {
    const result = QuizEngine.answerCurrent(selectedOption);
    if (result === null) return; // already answered

    const q = QuizEngine.getCurrent();
    const buttons = dom.optionsContainer.querySelectorAll(".quiz-option");

    buttons.forEach(btn => {
      const optText = btn.querySelector(".quiz-option__text").textContent;
      btn.classList.add("quiz-option--disabled");

      if (optText === q.correctAnswer) {
        btn.classList.add("quiz-option--correct");
      } else if (optText === selectedOption && !result) {
        btn.classList.add("quiz-option--wrong");
      }
    });

    // Update score display
    const score = QuizEngine.getScore();
    dom.scoreCorrect.textContent = score.correct;
    dom.scoreWrong.textContent = score.wrong;

    // Show next button, hide skip
    dom.btnSkip.style.display = "none";
    dom.btnNext.style.display = "";
    dom.btnNext.textContent = QuizEngine.isAtEnd() ? "Risultati →" : "Prossima →";
  }

  function showResults() {
    const score = QuizEngine.getScore();
    const total = QuizEngine.getTotal();
    const answered = score.correct + score.wrong;
    const percentage = answered > 0 ? Math.round((score.correct / answered) * 100) : 0;

    // Choose emoji and message based on score
    let icon, title, subtitle;
    if (percentage >= 80) {
      icon = "🏆";
      title = "Ottimo lavoro!";
      subtitle = `Hai risposto correttamente al ${percentage}% delle domande.`;
    } else if (percentage >= 60) {
      icon = "💪";
      title = "Buon risultato!";
      subtitle = `Hai risposto correttamente al ${percentage}% delle domande. Continua a studiare!`;
    } else if (percentage >= 40) {
      icon = "📚";
      title = "Si può migliorare";
      subtitle = `Hai risposto correttamente al ${percentage}% delle domande. Riprova dopo aver ripassato.`;
    } else {
      icon = "🎯";
      title = "Non arrenderti!";
      subtitle = `Hai risposto correttamente al ${percentage}% delle domande. Ripassa il materiale e ritenta.`;
    }

    dom.resultsIcon.textContent = icon;
    dom.resultsTitle.textContent = title;
    dom.resultsSubtitle.textContent = subtitle;
    dom.resultCorrectCount.textContent = score.correct;
    dom.resultWrongCount.textContent = score.wrong;
    dom.resultTotalCount.textContent = total;

    showSection("results");
  }

  return { init };
})();


/* ---------- Bootstrap ---------- */
document.addEventListener("DOMContentLoaded", () => {
  QuizUI.init();
});