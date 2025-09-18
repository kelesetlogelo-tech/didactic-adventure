class MultiplayerIfIWereGame {
    constructor() {
        // Initialize Firebase first
        this.initFirebase();
        
        this.gameState = {
            phase: 'initial-setup',
            roomCode: null,
            isHost: false,
            playerName: '',
            maxPlayers: 2,
            players: [],
            currentAnswerer: 0,
            currentGuesser: 0,
            currentTarget: 0,
            playerAnswers: {},
            scores: {},
            gameStarted: false
        };
        
        this.questions = [
            { id: 'q1', text: 'If I were a sound effect, I\'d be:', options: ['Ka-ching!', 'Dramatic gasp', 'Boing!', 'Evil laugh'] },
            { id: 'q2', text: 'If I were a weather forecast, I\'d be:', options: ['100% chill', 'Partly dramatic with a chance of chaos!', 'Heatwave vibes', 'Sudden tornado of opinions'] },
            { id: 'q3', text: 'If I were a breakfast cereal, I\'d be:', options: ['Jungle Oats', 'WeetBix', 'Rice Krispies'] }
        ];
        
        this.gameRef = null;
        this.initializeEventListeners();
    }

    initFirebase() {
        // Your Firebase config
        const firebaseConfig = {
            apiKey: "AIzaSyB2iwPzTZZC8dVj6zA0rpICzL8Zyo0djZ4",
            authDomain: "game-concept-71436.firebaseapp.com",
            databaseURL: "https://game-concept-71436-default-rtdb.firebaseio.com",
            projectId: "game-concept-71436",
            storageBucket: "game-concept-71436.firebasestorage.app",
            messagingSenderId: "568655295728",
            appId: "1:568655295728:web:51a0632ffd4b8205d67e35"
        };
        
        try {
            firebase.initializeApp(firebaseConfig);
            this.database = firebase.database();
            this.firebaseReady = true;
            console.log('Firebase initialized successfully');
            
            // Test Firebase connection
            this.database.ref('.info/connected').on('value', (snapshot) => {
                if (snapshot.val() === true) {
                    console.log('✅ Firebase connected');
                } else {
                    console.log('❌ Firebase disconnected');
                }
            });
            
        } catch (error) {
            console.warn('Firebase failed, using localStorage fallback:', error);
            this.firebaseReady = false;
        }
    }

    initializeEventListeners() {
        // Initial setup
        document.getElementById('create-room').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room').addEventListener('click', () => this.joinRoom());
        
        // Waiting room
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        document.getElementById('copy-code').addEventListener('click', () => this.copyRoomCode());
        
        // Game phases
        document.getElementById('submit-answers').addEventListener('click', () => this.submitAnswers());
        document.getElementById('submit-guesses').addEventListener('click', () => this.submitGuesses());
        
        // Results
        document.getElementById('play-again').addEventListener('click', () => this.playAgain());
        document.getElementById('leave-game').addEventListener('click', () => this.leaveGame());
        
        // Error handling
        document.getElementById('close-error').addEventListener('click', () => this.closeError());
    }

    generateRoomCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async createRoom() {
        const hostName = document.getElementById('host-name').value.trim();
        const playerCount = parseInt(document.getElementById('player-count').value);
        
        if (!hostName) {
            this.showError('Please enter your name');
            return;
        }
        
        this.gameState.roomCode = this.generateRoomCode();
        this.gameState.isHost = true;
        this.gameState.playerName = hostName;
        this.gameState.maxPlayers = playerCount;
        this.gameState.players = [{ name: hostName, isHost: true }];
        this.gameState.scores = { [hostName]: 0 };
        // Ensure the game is in waiting-room phase so host UI updates on player joins
        this.gameState.phase = 'waiting-room';
        
        await this.saveGameState();
        this.showWaitingRoom();
        this.setupGameListener();
        this.showGameInstructions();
    }

    showGameInstructions() {
        const instructions = `
🎮 GAME CREATED SUCCESSFULLY!

📋 Room Code: ${this.gameState.roomCode}

📱 SHARE WITH PLAYERS:
Just give them the room code: ${this.gameState.roomCode}

📝 INSTRUCTIONS FOR PLAYERS:
1. Go to the same website
2. Enter room code: ${this.gameState.roomCode}
3. Enter their name
4. Click "Join Game"

✅ Works across all devices!
        `;
        
        alert(instructions);
    }

    async joinRoom() {
        const roomCode = document.getElementById('room-code').value.trim();
        const playerName = document.getElementById('player-name').value.trim();
        
        if (!roomCode || roomCode.length !== 6) {
            this.showError('Please enter a valid 6-digit room code');
            return;
        }
        
        if (!playerName) {
            this.showError('Please enter your name');
            return;
        }
        
        try {
            const existingState = await this.loadGameState(roomCode);
            
            if (!existingState) {
                this.showError(`Room ${roomCode} not found. Make sure:\n1. The room code is correct\n2. The host has created the room`);
                return;
            }
            
            // Check if room is full
            if (existingState.players.length >= existingState.maxPlayers) {
                this.showError('This room is full');
                return;
            }
            
            // Check if name is already taken
            if (existingState.players.some(p => p.name === playerName)) {
                this.showError('This name is already taken. Please choose a different name.');
                return;
            }
            
            // Join the room
            this.gameState = existingState;
            this.gameState.playerName = playerName;
            this.gameState.isHost = false;
            this.gameState.players.push({ name: playerName, isHost: false });
            this.gameState.scores[playerName] = 0;
            // Normalize phase to waiting-room so all clients update UI consistently
            this.gameState.phase = 'waiting-room';
            
            await this.saveGameState();
            this.setupGameListener();
            this.showWaitingRoom();
            
        } catch (error) {
            this.showError(`Failed to join room: ${error.message}`);
        }
    }

    setupGameListener() {
        if (!this.firebaseReady || !this.gameState.roomCode) {
            console.log('⚠️ Firebase not ready or no room code, setting up polling fallback');
            this.setupPollingFallback();
            return;
        }
        
        this.gameRef = this.database.ref(`games/${this.gameState.roomCode}`);
        
        // Listen for real-time updates
        this.gameRef.on('value', (snapshot) => {
            const newState = snapshot.val();
            console.log('🔥 Firebase update received:', newState);
            
            if (newState) {
                const oldPlayerCount = this.gameState.players.length;
                
                // CRITICAL: Don't skip updates for host - they need to see player joins too
                console.log('🔄 Updating game state for:', this.gameState.isHost ? 'HOST' : 'PLAYER');
                
                // Update game state for both host and players
                this.gameState.players = newState.players || this.gameState.players;
                this.gameState.playerAnswers = newState.playerAnswers || {};
                this.gameState.phase = newState.phase || this.gameState.phase;
                this.gameState.maxPlayers = newState.maxPlayers || this.gameState.maxPlayers;
                
                console.log(`👥 Player count: ${oldPlayerCount} -> ${this.gameState.players.length}`);
                console.log('👑 Is host:', this.gameState.isHost);
                console.log('📋 Current players:', this.gameState.players.map(p => p.name));
                
                // Update UI based on current phase - ALWAYS update for everyone
                if (this.gameState.phase === 'waiting-room') {
                    console.log('🏠 Updating waiting room UI');
                    this.updateWaitingRoom();
                } else if (this.gameState.phase === 'answering') {
                    // Important: switch to the Answer phase view first, then update its contents
                    console.log('📝 Switching to Answer phase (via listener)');
                    this.showAnswerPhase();
                } else if (this.gameState.phase === 'guessing') {
                    this.showGuessingPhase();
                }
            } else {
                console.log('❌ No state received from Firebase');
            }
        });
        
        // Also set up polling as backup
        this.setupPollingFallback();
    }
    
    setupPollingFallback() {
        // Poll for updates every 2 seconds as backup
        if (this.pollInterval) clearInterval(this.pollInterval);
        
        this.pollInterval = setInterval(async () => {
            if (this.gameState.roomCode && this.gameState.phase === 'waiting-room') {
                console.log('🔄 Polling for game state updates...');
                try {
                    const latestState = await this.loadGameState(this.gameState.roomCode);
                    if (latestState && latestState.players.length !== this.gameState.players.length) {
                        console.log('📊 Polling detected player count change');
                        this.gameState.players = latestState.players;
                        this.updateWaitingRoom();
                    }
                } catch (error) {
                    console.log('⚠️ Polling failed:', error);
                }
            }
        }, 2000);
    }

    showWaitingRoom() {
        this.showPhase('waiting-room');
        this.updateWaitingRoom();
        
        // Show appropriate controls
        if (this.gameState.isHost) {
            document.getElementById('host-controls').style.display = 'block';
            document.getElementById('player-waiting').style.display = 'none';
        } else {
            document.getElementById('host-controls').style.display = 'none';
            document.getElementById('player-waiting').style.display = 'block';
        }
    }

    updateWaitingRoom() {
        document.getElementById('display-room-code').textContent = this.gameState.roomCode;
        document.getElementById('share-room-code').textContent = this.gameState.roomCode;
        document.getElementById('joined-count').textContent = this.gameState.players.length;
        document.getElementById('total-count').textContent = this.gameState.maxPlayers;
        
        // Update progress bar
        const progress = (this.gameState.players.length / this.gameState.maxPlayers) * 100;
        document.getElementById('progress-fill').style.width = progress + '%';
        
        // Update players list
        const playersList = document.getElementById('waiting-players-list');
        playersList.innerHTML = '';
        this.gameState.players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.name + (player.isHost ? ' (Host)' : '');
            playersList.appendChild(li);
        });
        
        // Show start button if room is full and user is host
        const startButton = document.getElementById('start-game');
        const hostNote = document.querySelector('.host-note');
        
        console.log(`🎯 UpdateWaitingRoom: isHost=${this.gameState.isHost}, players=${this.gameState.players.length}, maxPlayers=${this.gameState.maxPlayers}`);
        console.log(`🔍 Start button element exists:`, !!startButton);
        console.log(`🔍 Host note element exists:`, !!hostNote);
        
        if (this.gameState.isHost) {
            const playersNeeded = this.gameState.maxPlayers - this.gameState.players.length;
            
            if (playersNeeded === 0) {
                // Room is full - show start button
                if (startButton) {
                    startButton.style.display = 'block';
                    startButton.style.visibility = 'visible';
                    console.log('✅ Start button shown - room is full!');
                } else {
                    console.log('❌ Start button element not found!');
                }
                if (hostNote) {
                    hostNote.textContent = 'All players joined! Ready to start.';
                }
            } else {
                // Still waiting for players
                if (startButton) {
                    startButton.style.display = 'none';
                }
                if (hostNote) {
                    hostNote.textContent = `Waiting for ${playersNeeded} more player(s)...`;
                }
                console.log(`⏳ Still waiting for ${playersNeeded} more players`);
            }
        }
    }

    copyRoomCode() {
        const textToCopy = `Join my "If I Were..." game!\n\n🎮 Room Code: ${this.gameState.roomCode}\n\n📱 Instructions:\n1. Go to: ${window.location.origin}${window.location.pathname}\n2. Enter room code: ${this.gameState.roomCode}\n3. Enter your name and join!\n\n✅ Works on any device!`;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const copyBtn = document.getElementById('copy-code');
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        }).catch(() => {
            prompt('Copy this text and share with players:', textToCopy);
        });
    }

    async startGame() {
        if (!this.gameState.isHost) return;
        
        this.gameState.gameStarted = true;
        this.gameState.phase = 'answering';
        // Remove currentAnswerer - all players answer simultaneously
        
        await this.saveGameState();
        this.showAnswerPhase();
    }

    showAnswerPhase() {
        this.showPhase('answer-phase');
        this.updateAnswerPhase();
    }

    updateAnswerPhase() {
        // Check if current player has already answered
        const hasAnswered = this.gameState.playerAnswers[this.gameState.playerName];
        
        if (hasAnswered) {
            // Player has already submitted answers
            document.getElementById('turn-indicator').textContent = 'Waiting for other players...';
            document.getElementById('current-answerer').textContent = 'All Players';
            document.getElementById('submit-answers').style.display = 'none';
            document.getElementById('waiting-for-others').style.display = 'block';
        } else {
            // Player hasn't answered yet - show form
            document.getElementById('turn-indicator').textContent = 'Answer the questions!';
            document.getElementById('current-answerer').textContent = 'Everyone';
            document.getElementById('submit-answers').style.display = 'block';
            document.getElementById('waiting-for-others').style.display = 'none';
        }
        
        // Update progress
        const answeredCount = Object.keys(this.gameState.playerAnswers).length;
        document.getElementById('answers-progress').textContent = `${answeredCount}/${this.gameState.players.length} players have answered`;
    }

    async submitAnswers() {
        const answers = {};
        this.questions.forEach(question => {
            const selected = document.querySelector(`input[name="${question.id}"]:checked`);
            if (selected) {
                answers[question.id] = selected.value;
            }
        });
        
        if (Object.keys(answers).length !== this.questions.length) {
            this.showError('Please answer all questions before submitting.');
            return;
        }
        
        // Save answers
        this.gameState.playerAnswers[this.gameState.playerName] = answers;
        
        // Check if all players have answered
        if (Object.keys(this.gameState.playerAnswers).length === this.gameState.players.length) {
            // All players have answered, move to guessing phase
            this.gameState.phase = 'guessing';
            this.gameState.currentGuesser = 0;
            this.gameState.currentTarget = 1; // Skip self
        }
        
        await this.saveGameState();
        
        if (this.gameState.phase === 'guessing') {
            this.showGuessingPhase();
        } else {
            this.updateAnswerPhase();
        }
    }

    showGuessingPhase() {
        this.showPhase('guessing-phase');
        this.updateGuessingPhase();
    }

    updateGuessingPhase() {
        const currentGuesser = this.gameState.players[this.gameState.currentGuesser];
        const targetPlayer = this.gameState.players[this.gameState.currentTarget];
        const isMyTurn = currentGuesser.name === this.gameState.playerName;
        
        document.getElementById('target-player-name').textContent = targetPlayer.name;
        document.getElementById('current-score').textContent = this.gameState.scores[this.gameState.playerName] || 0;
        
        if (isMyTurn) {
            document.getElementById('guess-turn-indicator').textContent = 'Your turn to guess!';
            document.getElementById('submit-guesses').style.display = 'block';
            document.getElementById('waiting-for-guesses').style.display = 'none';
        } else {
            document.getElementById('guess-turn-indicator').textContent = `${currentGuesser.name} is guessing...`;
            document.getElementById('submit-guesses').style.display = 'none';
            document.getElementById('waiting-for-guesses').style.display = 'block';
        }
    }

    async submitGuesses() {
        const guesses = {};
        this.questions.forEach((question, index) => {
            const selected = document.querySelector(`input[name="guess${index + 1}"]:checked`);
            if (selected) {
                guesses[question.id] = selected.value;
            }
        });
        
        if (Object.keys(guesses).length !== this.questions.length) {
            this.showError('Please make all guesses before submitting.');
            return;
        }
        
        // Calculate score
        const targetPlayer = this.gameState.players[this.gameState.currentTarget];
        const targetAnswers = this.gameState.playerAnswers[targetPlayer.name];
        let correctGuesses = 0;
        
        this.questions.forEach(question => {
            if (guesses[question.id] === targetAnswers[question.id]) {
                correctGuesses++;
            }
        });
        
        // Update score
        const scoreChange = correctGuesses - (this.questions.length - correctGuesses);
        this.gameState.scores[this.gameState.playerName] += scoreChange;
        
        // Move to next guess
        this.moveToNextGuess();
        
        await this.saveGameState();
        
        if (this.gameState.phase === 'results') {
            this.showResults();
        } else {
            this.updateGuessingPhase();
        }
    }

    moveToNextGuess() {
        this.gameState.currentTarget++;
        
        if (this.gameState.currentTarget === this.gameState.currentGuesser) {
            this.gameState.currentTarget++;
        }
        
        if (this.gameState.currentTarget >= this.gameState.players.length) {
            this.gameState.currentGuesser++;
            this.gameState.currentTarget = 0;
            
            if (this.gameState.currentTarget === this.gameState.currentGuesser) {
                this.gameState.currentTarget++;
            }
        }
        
        if (this.gameState.currentGuesser >= this.gameState.players.length) {
            this.gameState.phase = 'results';
        }
    }

    showResults() {
        this.showPhase('results-phase');
        this.displayResults();
    }

    displayResults() {
        let maxScore = Math.max(...Object.values(this.gameState.scores));
        let winners = Object.entries(this.gameState.scores)
            .filter(([name, score]) => score === maxScore)
            .map(([name]) => name);
        
        const winnerText = winners.length === 1 
            ? `🎉 ${winners[0]} wins with ${maxScore} points!`
            : `🎉 Tie between ${winners.join(' and ')} with ${maxScore} points!`;
        
        document.getElementById('winner-text').textContent = winnerText;
        
        const scoresList = document.getElementById('scores-list');
        scoresList.innerHTML = '';
        
        const sortedScores = Object.entries(this.gameState.scores)
            .sort(([,a], [,b]) => b - a);
        
        sortedScores.forEach(([playerName, score]) => {
            const li = document.createElement('li');
            li.textContent = `${playerName}: ${score} points`;
            if (winners.includes(playerName)) {
                li.style.fontWeight = 'bold';
                li.style.color = '#4CAF50';
            }
            scoresList.appendChild(li);
        });
        
        this.displayAllAnswers();
    }

    displayAllAnswers() {
        const answersContainer = document.getElementById('all-answers');
        answersContainer.innerHTML = '';
        
        this.gameState.players.forEach(player => {
            const answerSet = document.createElement('div');
            answerSet.className = 'answer-set';
            
            const playerName = document.createElement('h4');
            playerName.textContent = `${player.name}'s Answers:`;
            answerSet.appendChild(playerName);
            
            this.questions.forEach((question, index) => {
                const answerP = document.createElement('p');
                answerP.innerHTML = `<strong>${index + 1}.</strong> ${this.gameState.playerAnswers[player.name][question.id]}`;
                answerSet.appendChild(answerP);
            });
            
            answersContainer.appendChild(answerSet);
        });
    }

    async playAgain() {
        if (this.gameState.isHost) {
            this.gameState.phase = 'waiting-room';
            this.gameState.currentAnswerer = 0;
            this.gameState.currentGuesser = 0;
            this.gameState.currentTarget = 0;
            this.gameState.playerAnswers = {};
            this.gameState.gameStarted = false;
            
            this.gameState.players.forEach(player => {
                this.gameState.scores[player.name] = 0;
            });
            
            await this.saveGameState();
            this.showWaitingRoom();
        }
    }

    leaveGame() {
        this.clearGameState();
        this.showPhase('initial-setup');
        this.gameState = {
            phase: 'initial-setup',
            roomCode: null,
            isHost: false,
            playerName: '',
            maxPlayers: 2,
            players: [],
            currentAnswerer: 0,
            currentGuesser: 0,
            currentTarget: 0,
            playerAnswers: {},
            scores: {},
            gameStarted: false
        };
    }

    showPhase(phaseId) {
        document.querySelectorAll('.game-phase').forEach(phase => {
            phase.classList.remove('active');
        });
        document.getElementById(phaseId).classList.add('active');
    }

    showError(message) {
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-overlay').style.display = 'flex';
    }

    closeError() {
        document.getElementById('error-overlay').style.display = 'none';
    }

    // Firebase-based game state persistence
    async saveGameState() {
        console.log(' Saving game state:', {
            roomCode: this.gameState.roomCode,
            players: this.gameState.players.map(p => p.name),
            playerCount: this.gameState.players.length,
            isHost: this.gameState.isHost
        });
        
        if (this.firebaseReady && this.gameState.roomCode) {
            try {
                await this.database.ref(`games/${this.gameState.roomCode}`).set(this.gameState);
                console.log(' Game state saved to Firebase successfully');
            } catch (error) {
                console.warn(' Failed to save to Firebase:', error);
                localStorage.setItem('gameState', JSON.stringify(this.gameState));
            }
        } else {
            console.log(' Saving to localStorage (Firebase not ready)');
            localStorage.setItem('gameState', JSON.stringify(this.gameState));
        }
    }

    async loadGameState(roomCode) {
        if (this.firebaseReady) {
            try {
                const snapshot = await this.database.ref(`games/${roomCode}`).once('value');
                const state = snapshot.val();
                if (state) return state;
            } catch (error) {
                console.warn('Firebase load failed:', error);
            }
        }
        
        // Fallback to localStorage
        const saved = localStorage.getItem(`game_${roomCode}`);
        return saved ? JSON.parse(saved) : null;
    }

    clearGameState() {
        if (this.gameRef) {
            this.gameRef.off();
            this.gameRef = null;
        }
        
        if (this.firebaseReady && this.gameState.roomCode && this.gameState.isHost) {
            this.database.ref(`games/${this.gameState.roomCode}`).remove();
        }
        
        if (this.gameState.roomCode) {
            localStorage.removeItem(`game_${this.gameState.roomCode}`);
        }
    }

    syncGameState(newState) {
        const oldPhase = this.gameState.phase;
        this.gameState = { ...newState, playerName: this.gameState.playerName, isHost: this.gameState.isHost };
        
        if (oldPhase !== newState.phase) {
            switch (newState.phase) {
                case 'waiting-room':
                    this.showWaitingRoom();
                    break;
                case 'answering':
                    this.showAnswerPhase();
                    break;
                case 'guessing':
                    this.showGuessingPhase();
                    break;
                case 'results':
                    this.showResults();
                    break;
            }
        } else {
            switch (newState.phase) {
                case 'waiting-room':
                    this.updateWaitingRoom();
                    break;
                case 'answering':
                    this.updateAnswerPhase();
                    break;
                case 'guessing':
                    this.updateGuessingPhase();
                    break;
            }
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new MultiplayerIfIWereGame();
});
