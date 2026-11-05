
const animals = [
    { name: "bear", emoji: "🐻" },
    { name: "frog", emoji: "🐸" },
    { name: "panda", emoji: "🐼" },
    { name: "fox", emoji: "🦊" },
    { name: "owl", emoji: "🦉" },
    { name: "bunny", emoji: "🐰" }
];

const levels = {
    easy: 6,
    medium: 8,
    hard: 10
};

const $ = (id) => document.getElementById(id);

const board = $("board");
const difficulty = $("difficulty");
const timerToggle = $("timer-toggle");
const movesDisplay = $("moves");
const pairsDisplay = $("pairs");
const timeDisplay = $("time");
const messageDisplay = $("message");
const winDetails = $("win-details");
const starsDisplay = $("stars");
const finalScore = $("final-score");
const soundButton = $("sound-btn");

let firstCard = null;
let secondCard = null;
let locked = false;
let finished = false;
let started = false;

let moves = 0;
let found = 0;
let seconds = 0;

let timer = null;
let pendingTimeout = null;
let gameGeneration = 0;

let soundEnabled = true;
let audioContext = null;

function shuffleCards(array) {
    const shuffled = [...array];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const randomIndex = Math.floor(Math.random() * (i + 1));

        [shuffled[i], shuffled[randomIndex]] =
            [shuffled[randomIndex], shuffled[i]];
    }

    return shuffled;
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(remainingSeconds).padStart(2, "0")
    );
}

function updateStats() {
    movesDisplay.textContent = moves;
    pairsDisplay.textContent = `${found} / ${levels[difficulty.value]}`;
    timeDisplay.textContent = formatTime(seconds);
}

function stopTimer() {
    if (timer !== null) {
        clearInterval(timer);
    }

    timer = null;
}

function startTimer() {
    if (started || finished || !timerToggle.checked) {
        return;
    }

    started = true;

    timer = setInterval(() => {
        seconds++;
        updateStats();
    }, 1000);
}

function playSound(type) {
    if (!soundEnabled) {
        return;
    }

    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) {
            return;
        }

        if (audioContext === null) {
            audioContext = new AudioContextClass();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume().catch(() => {});
        }

        const soundPatterns = {
            flip: [[480, 0.06]],
            match: [[660, 0.08], [880, 0.12]],
            wrong: [[260, 0.12]],
            win: [
                [523, 0.12],
                [659, 0.12],
                [784, 0.12],
                [1047, 0.20]
            ]
        };

        let offset = 0;

        for (const [frequency, duration] of (soundPatterns[type] || [])) {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            const startTime = audioContext.currentTime + offset;

            oscillator.type = "sine";
            oscillator.frequency.value = frequency;

            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.exponentialRampToValueAtTime(
                0.06,
                startTime + 0.01
            );
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                startTime + duration
            );

            oscillator.connect(gain);
            gain.connect(audioContext.destination);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration + 0.01);

            offset += duration;
        }
    } catch (error) {
        // The game can still run if audio is unavailable.
    }
}

function createCard(item, index) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.dataset.pairId = String(item.id);

    const label = item.variant
        ? `${item.animal.name} ${item.variant}`
        : item.animal.name;

    card.setAttribute(
        "aria-label",
        `Card ${index + 1}, face down`
    );

    const inner = document.createElement("span");
    inner.className = "card-inner";

    const back = document.createElement("span");
    back.className = "face back";
    back.textContent = "✦";
    back.setAttribute("aria-hidden", "true");

    const front = document.createElement("span");
    front.className = "face front";
    front.setAttribute("aria-hidden", "true");

    const img = document.createElement("img");
    img.src = `assets/${item.animal.name}.png`;
    img.alt = "";

    img.addEventListener("error", () => {
        img.remove();

        const emoji = document.createElement("span");
        emoji.className = "animal-fallback";
        emoji.textContent = item.animal.emoji;

        front.prepend(emoji);
    }, { once: true });

    front.appendChild(img);

    if (item.variant) {
        const variantLabel = document.createElement("span");
        variantLabel.className = "variant-label";
        variantLabel.textContent = item.variant;
        front.appendChild(variantLabel);
    }

    inner.appendChild(back);
    inner.appendChild(front);
    card.appendChild(inner);

    card.addEventListener("click", () => {
        flipCard(card, label);
    });

    return card;
}

function resetSelection() {
    firstCard = null;
    secondCard = null;
    locked = false;
}

function flipCard(card, label) {
    if (
        locked ||
        finished ||
        card.disabled ||
        card === firstCard ||
        card.classList.contains("flipped") ||
        card.classList.contains("matched")
    ) {
        return;
    }

    startTimer();

    card.classList.add("flipped");
    card.setAttribute("aria-label", `Revealed ${label}`);

    playSound("flip");

    if (firstCard === null) {
        firstCard = card;
        messageDisplay.textContent = "Pick one more card!";
        return;
    }

    secondCard = card;
    moves++;
    locked = true;

    updateStats();

    const selectedFirst = firstCard;
    const selectedSecond = secondCard;

    const isMatch =
        selectedFirst.dataset.pairId ===
        selectedSecond.dataset.pairId;

    if (isMatch) {
        selectedFirst.classList.add("matched");
        selectedSecond.classList.add("matched");

        selectedFirst.disabled = true;
        selectedSecond.disabled = true;

        found++;

        playSound("match");
        updateStats();
        resetSelection();

        messageDisplay.textContent = "It's a match! 💚";

        if (found === levels[difficulty.value]) {
            finishGame();
        }
    } else {
        playSound("wrong");
        messageDisplay.textContent = "Not a match — try again!";

        const currentGeneration = gameGeneration;

        pendingTimeout = setTimeout(() => {
            if (currentGeneration !== gameGeneration) {
                return;
            }

            selectedFirst.classList.remove("flipped");
            selectedSecond.classList.remove("flipped");

            selectedFirst.setAttribute(
                "aria-label",
                "Face-down card"
            );

            selectedSecond.setAttribute(
                "aria-label",
                "Face-down card"
            );

            resetSelection();
            pendingTimeout = null;
        }, 850);
    }
}

function calculateStars() {
    const totalPairs = levels[difficulty.value];

    if (moves <= Math.floor(totalPairs * 1.5)) {
        return 3;
    }

    if (moves <= totalPairs * 3) {
        return 2;
    }

    return 1;
}

function finishGame() {
    finished = true;
    stopTimer();

    playSound("win");

    const earnedStars = calculateStars();

    starsDisplay.textContent =
        "★".repeat(earnedStars) +
        "☆".repeat(3 - earnedStars);

    starsDisplay.setAttribute(
        "aria-label",
        `${earnedStars} out of 3 stars`
    );

    let result = `${moves} moves`;

    if (timerToggle.checked) {
        result += ` · ${formatTime(seconds)}`;
    }

    finalScore.textContent = result;
    winDetails.hidden = false;
    messageDisplay.textContent = "";
}

function newGame() {
    gameGeneration++;

    stopTimer();

    if (pendingTimeout !== null) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
    }

    resetSelection();

    moves = 0;
    found = 0;
    seconds = 0;

    started = false;
    finished = false;

    winDetails.hidden = true;
    messageDisplay.textContent = "Flip two cards to find a match!";

    $("time-stat").hidden = !timerToggle.checked;

    const pairCount = levels[difficulty.value];
    const choices = [];

    for (let i = 0; i < pairCount; i++) {
        const animal = animals[i % animals.length];
        const variantNumber = Math.floor(i / animals.length) + 1;
        const variant = i >= animals.length ? String(variantNumber) : "";

        choices.push({
            id: i,
            animal: animal,
            variant: variant
        });
    }

    const deck = shuffleCards([...choices, ...choices]);

    const cards = deck.map((item, index) => {
        return createCard(item, index);
    });

    board.replaceChildren(...cards);

    board.classList.toggle(
        "hard",
        difficulty.value === "hard"
    );

    updateStats();
}

$("new-game").addEventListener("click", newGame);
$("again").addEventListener("click", newGame);
difficulty.addEventListener("change", newGame);

timerToggle.addEventListener("change", newGame);

soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;

    soundButton.setAttribute(
        "aria-pressed",
        String(soundEnabled)
    );

    soundButton.textContent = soundEnabled
        ? "🔊 Sound On"
        : "🔇 Sound Off";

    if (soundEnabled) {
        playSound("flip");
    }
});

newGame();
