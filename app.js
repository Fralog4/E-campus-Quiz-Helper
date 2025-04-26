const pdfFile = document.getElementById("pdfFile");
const skipButton=document.getElementById("skipButton");
let questions = [];
let currentIndex = 0;

pdfFile.addEventListener("change", readPdf);

function readPdf(event) {

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
            const strings = content.items.map(item => item.str);
            text += strings.join("\n") + "\n";
        }

        questions = parseQuestion(text);
        currentIndex = 0;

        if (questions.length > 0) {
            displayQuestion(currentIndex);
        }
    };

    reader.readAsArrayBuffer(file);
}




function parseQuestion(text) {
    const lines = text.split("\n").map(line => line.trim()).filter(line => line !== "");

    const questions = [];
    let currentQuestion = null;
    let expectingQuestionText = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const isQuestionNumber = line.match(/^(\d{1,2})\.$/);
        if (isQuestionNumber) {
            expectingQuestionText = true;
            continue;
        }

        if (expectingQuestionText) {
            currentQuestion = {
                question: line,
                options: []
            };
            expectingQuestionText = false;
            continue;
        }

        //very poor check to detect a possible answer
        if (line.startsWith("è") || line.startsWith("La") || line.startsWith("Il") || line.startsWith("Un") || line.startsWith("una") || line.startsWith("un")) {
            if (currentQuestion) {
                currentQuestion.options.push(line);
            }
        }

        // Se abbiamo 4 opzioni, passiamo alla prossima domanda
        if (currentQuestion && currentQuestion.options.length === 4) {
            questions.push(currentQuestion);
            currentQuestion = null;
        }
    }

    return questions;
}

function displayQuestion(index) {
    const question = questions[index];
    const container = document.getElementById("quizContainer");

    container.innerHTML = "";

    const title = document.createElement("h2");
    title.textContent = question.question;
    title.classList.add("title", "is-4", "mb-4", "has-text-weight-bold", "has-text-black");
    container.appendChild(title);

    question.options.forEach(option => {
        const button = document.createElement("button");
        button.classList.add("button", "is-primary", "m-2", "is-fullwidth");
        button.textContent = option;
        button.addEventListener("click", function () {
            nextQuestion();
        });
        container.appendChild(button);
    });
}
 
function nextQuestion() {
    currentIndex++;
    if (currentIndex < questions.length) {
        displayQuestion(currentIndex);
    } else {
        showCompletion();
    }
}

skipButton.addEventListener("click",function skipQuestion(){
    currentIndex++;
    if (currentIndex < questions.length) {
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
