const pdfFile = document.getElementById("pdfFile");
const skipButton=document.getElementById("skipButton");
let quiz = [];
let currentIndex = 0;

pdfFile.addEventListener("change", readPdf);

function readPdf(event) {
    // Parole generiche da escludere
    const paroleDaEscludere = ["Docente:", "Indice", "Lezione", "p.", "Descrivere", "Definire", "Fornire"];

    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = async function () {
        const typedarray = new Uint8Array(reader.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;

        let text = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            
            // Filtra le righe in base a pattern strutturali
            const strings = content.items
                .map(item => item.str.trim())
                .filter(line => {
                    // Righe vuote
                    if (line === "") return false;
                    
                    // Esclude parole specifiche
                    if (paroleDaEscludere.some(parola => line.includes(parola))) return false;
                    
                    // Pattern strutturali da escludere
                    if (line.startsWith("Set Domande:")) return false;
                    if (line.startsWith("©")) return false;
                    if (line.includes("Università")) return false;
                    if (line.includes("Data Stampa")) return false;
                    if (line.match(/^\d+\/\d+$/)) return false; // Formato pagina "1/50"
                    
                    // Riconoscimento pattern dell'intestazione (tipicamente tutto in maiuscolo o con poche parole)
                    if (line === line.toUpperCase() && !line.match(/^(\d{1,3})\.$/)) return false;
                    
                    // Se è una riga con nome e cognome (tipicamente 2-3 parole)
                    const words = line.split(/\s+/);
                    if (words.length >= 2 && words.length <= 3 && 
                        words.every(word => word[0] === word[0].toUpperCase())) {
                        return false;
                    }
                    
                    return true;
                });

            text += strings.join("\n") + "\n";
        } 

        quiz = parseQuestionWithMultilineOptions(text);
        console.log("Quiz generato:", quiz);
        currentIndex = 0;

        if (quiz.length > 0) {
            displayQuestion(currentIndex);
        } else {
            document.getElementById("quizContainer").innerHTML = 
                "<div class='notification is-warning'>Nessuna domanda valida trovata nel PDF.</div>";
        }
    }; 

    reader.readAsArrayBuffer(file);
}

function parseQuestionWithMultilineOptions(text) {
    const lines = text.split("\n").map(line => line.trim()).filter(line => line !== "");
    const quiz = [];
    
    // Pattern per riconoscere un numero di domanda (es. "01.", "1.", "2.")
    const questionNumberPattern = /^(\d{1,3})\.$/;
    
    for (let i = 0; i < lines.length; i++) {
        // Verifica se la linea corrente è un numero di domanda
        if (questionNumberPattern.test(lines[i])) {
            const questionNumber = lines[i];
            
            // Assicurati che ci sia almeno una riga successiva per la domanda
            if (i + 1 >= lines.length) continue;
            
            const questionText = lines[i + 1];
            
            // Cerca le prossime righe per trovare le opzioni
            let remainingLines = lines.slice(i + 2);
            let potentialOptions = [];
            let currentOptionIndex = 0;
            let nextQuestionIndex = -1;
            
            // Trova dove inizia la prossima domanda (se esiste)
            for (let j = 0; j < remainingLines.length; j++) {
                if (questionNumberPattern.test(remainingLines[j])) {
                    nextQuestionIndex = j;
                    break;
                }
            }
            
            // Se non c'è una prossima domanda, considera tutte le righe rimanenti
            if (nextQuestionIndex === -1) {
                nextQuestionIndex = remainingLines.length;
            }
            
            // Prendi tutte le righe fino alla prossima domanda
            let optionLines = remainingLines.slice(0, nextQuestionIndex);
            
            // Algoritmo per raggruppare le opzioni multilnea
            let currentOption = [];
            let options = [];
            
            for (let j = 0; j < optionLines.length; j++) {
                const line = optionLines[j];
                
                // Se la riga è molto breve o sembra un frammento
                if (line.length < 15 || 
                    !line.match(/[.?!]/) || 
                    line.match(/^(del|il|lo|la|i|gli|le|un|uno|una)\s/i) || 
                    line === line.toLowerCase()) {
                    
                    // Se c'è un'opzione corrente in costruzione, aggiungi questa riga
                    if (currentOption.length > 0) {
                        currentOption.push(line);
                    } 
                    // Altrimenti questa potrebbe essere parte di un'opzione successiva
                    else if (j + 1 < optionLines.length) {
                        // Guarda la riga successiva per decidere
                        const nextLine = optionLines[j + 1];
                        if (nextLine.length > 15 || nextLine.match(/[.?!]/)) {
                            // Se la prossima riga sembra un'opzione completa, 
                            // questa è probabilmente un frammento della precedente
                            if (options.length > 0) {
                                options[options.length - 1] += " " + line;
                            } else {
                                // Se non ci sono opzioni precedenti, inizia una nuova
                                currentOption = [line];
                            }
                        } else {
                            // Altrimenti inizia una nuova opzione
                            currentOption = [line];
                        }
                    } else {
                        // Se è l'ultima riga, aggiungiamola all'ultima opzione
                        if (options.length > 0) {
                            options[options.length - 1] += " " + line;
                        } else {
                            currentOption = [line];
                        }
                    }
                } 
                // Se sembra un'opzione completa
                else {
                    // Se c'è un'opzione in costruzione, aggiungila alla lista e iniziane una nuova
                    if (currentOption.length > 0) {
                        options.push(currentOption.join(" "));
                        currentOption = [line];
                    } else {
                        // Altrimenti questa è una nuova opzione
                        currentOption = [line];
                    }
                }
                
                // Se è l'ultima riga e c'è un'opzione in costruzione, aggiungila
                if (j === optionLines.length - 1 && currentOption.length > 0) {
                    options.push(currentOption.join(" "));
                }
            }
            
            // Verifica se abbiamo esattamente 4 opzioni valide
            if (options.length === 4) {
                // Controlla che le opzioni non siano frammentate o non valide
                const validOptions = options.every(opt => opt.length > 10);
                
                if (validOptions) {
                    quiz.push({
                        number: questionNumber,
                        question: questionText,
                        options: options
                    });
                    
                    // Avanza i fino all'inizio della prossima domanda
                    i = i + 2 + nextQuestionIndex - 1;
                } else {
                    console.warn(`Domanda ${questionNumber} ignorata: opzioni non valide`);
                    i = i + 2 + nextQuestionIndex - 1;
                }
            } else {
                console.warn(`Domanda ${questionNumber} ignorata: trovate ${options.length} opzioni invece di 4`);
                i = i + 2 + nextQuestionIndex - 1;
            }
        }
    }
    
    return quiz;
}

function displayQuestion(index) {
    const question = quiz[index]; 
    console.log("Visualizzazione domanda:", question);
    const container = document.getElementById("quizContainer");

    container.innerHTML = "";

    // Mostra il numero della domanda
    const numberElement = document.createElement("h2");
    numberElement.textContent = question.number;
    numberElement.classList.add("title", "is-3", "mb-3");
    container.appendChild(numberElement);

    // Mostra il testo della domanda
    const title = document.createElement("h3");
    title.textContent = question.question;
    title.classList.add("title", "is-4", "mb-4", "has-text-weight-bold", "has-text-black");
    container.appendChild(title);

    // Crea un div per i pulsanti
    const optionsContainer = document.createElement("div");
    optionsContainer.classList.add("buttons");
    container.appendChild(optionsContainer);

    // Mostra le opzioni come pulsanti
    question.options.forEach(option => {
        const button = document.createElement("button");
        button.classList.add("button", "is-primary", "m-2", "is-fullwidth");
        button.textContent = option;
        button.addEventListener("click", function () {
            nextQuestion();
        });
        optionsContainer.appendChild(button);
    });
}

function nextQuestion() {
    currentIndex++;
    if (currentIndex < quiz.length) {
        displayQuestion(currentIndex);
    } else {
        showCompletion();
    }
}

skipButton.addEventListener("click",function skipQuestion(){
    currentIndex++;
    if (currentIndex < quiz.length) {
        displayQuestion(currentIndex);
    } else {
        showCompletion();
    }
});

function showCompletion() {
    alert("Le domande sono terminate! Ripartiamo dalla prima domanda.");
    currentIndex = 0;
    displayQuestion(currentIndex);
}