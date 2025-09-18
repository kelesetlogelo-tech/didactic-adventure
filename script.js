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
            guesses: {},
            reveal: null, // { target, answers, scores, until }
            gameStarted: false
        };
        
        this.questions = [
            { id: 'q1', text: 'If I were a sound effect, I\'d be:', options: ['Ka-ching!', 'Dramatic gasp', 'Boing!', 'Evil laugh'] },
            { id: 'q2', text: 'If I were a weather forecast, I\'d be:', options: ['100% chill', 'Partly dramatic with a chance of chaos!', 'Heatwave vibes', 'Sudden tornado of opinions'] },
            { id: 'q3', text: 'If I were a breakfast cereal, I\'d be:', options: ['Jungle Oats', 'WeetBix', 'Rice Krispies', 'MorVite', 'That weird healthy one no-one eats'] },
            { id: 'q4', text: 'If I were a bedtime excuse, I\'d be...', options: [
                'I need water',
                "There's a spider in my room",
                "I can't sleep without \"Pillow\"",
                'There see shadows outside my window',
                'Just one more episode'
            ] },
            { id: 'q5', text: 'If I were a villain in a movie, I\'d be...', options: [
                'Scarlet Overkill',
                'Grinch',
                'Thanos',
                'A mosquito in your room at night',
                'Darth Vader'
            ] },
            { id: 'q6', text: 'If I were a kitchen appliance, I\'d be...', options: [
                'A blender on high speed with no lid',
                'A toaster that only pops when no one\'s looking',
                'Microwave that screams when it\'s done',
                'A fridge that judges your snack choices'
            ] },
            { id: 'q7', text: 'If I were a dance move, I\'d be...', options: [
                'The awkward shuffle at weddings',
                'Kwasakwasa, Ba-baah!',
                'The "I thought no one was watching" move',
                'The knee-pop followed by a regretful sit-down'
            ] },
            { id: 'q8', text: 'If I were a text message, I\'d be...', options: [
                'A typo-ridden voice-to-text disaster',
                'A three-hour late "LOL"',
                'A group chat gif spammer',
                'A mysterious "K." with no context'
            ] },
            { id: 'q9', text: 'If I were a warning label, I\'d be...', options: [
                'Caution: May spontaneously break into song',
                'Contents may cause uncontrollable giggles',
                'Qaphela: Gevaar/Ingozi',
                'Warning: Will talk your ear off about random facts',
                'May contain traces of impulsive decisions'
            ] },
            { id: 'q10', text: 'If I were a type of chair, I\'d be...', options: [
                'A Phala Phala sofa',
                'A creaky antique that screams when you sit',
                'One of those folding chairs that attack your fingers',
                'A throne made of regrets and snack crumbs'
            ] }
        ];
        
        // Initialize card carousel
        this.cardCarousel = null;
        
        // Initialize the game
        this.initializeEventListeners();
        this.checkForExistingGame();
        
        this.gameRef = null;
        this.firebaseReady = false;
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

    // Schedule auto-advance (host only) when reveal is active. Idempotent per round.
    scheduleAutoAdvanceIfHost() {
        if (!this.gameState.isHost || !this.gameState.reveal) return;
        const key = `${this.gameState.roomCode}-${this.gameState.currentTarget}-${this.gameState.reveal.until}`;
        if (this._advanceKey === key) return; // already scheduled for this round
        this._advanceKey = key;
        const delay = Math.max(0, this.gameState.reveal.until - Date.now());
        if (this._advanceTimer) clearTimeout(this._advanceTimer);
        this._advanceTimer = setTimeout(() => {
            this.advanceToNextRound();
        }, delay);
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
        const continueBtn = document.getElementById('continue-reveal');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => this.advanceToNextRound());
        }
        
        // Results
        document.getElementById('play-again').addEventListener('click', () => this.playAgain());
        document.getElementById('leave-game').addEventListener('click', () => this.leaveGame());
        const copyBtn = document.getElementById('copy-summary');
        if (copyBtn) copyBtn.addEventListener('click', () => this.copyWinnerSummary());
        const muteToggle = document.getElementById('mute-celebrations');
        if (muteToggle) {
            // Load persisted setting
            const persisted = localStorage.getItem('mute_celebrations');
            if (persisted !== null) muteToggle.checked = persisted === 'true';
            muteToggle.addEventListener('change', () => {
                localStorage.setItem('mute_celebrations', String(muteToggle.checked));
            });
        }
        
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
                this.gameState.reveal = newState.reveal || null;
                this.gameState.guesses = newState.guesses || this.gameState.guesses || {};
                if (typeof newState.currentTarget === 'number') this.gameState.currentTarget = newState.currentTarget;
                if (newState.scores) this.gameState.scores = newState.scores;
                
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
                    if (this.gameState.reveal) {
                        this.showRoundOverlay(this.gameState.reveal);
                        // Ensure host schedules auto-advance even if another player triggered the reveal
                        this.scheduleAutoAdvanceIfHost();
                    } else {
                        this.hideRoundOverlay();
                    }
                } else if (this.gameState.phase === 'results') {
                    this.hideRoundOverlay();
                    this.showResults();
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

    // Build accuracy summary by target and render into #accuracy-summary
    renderAccuracySummary() {
        const wrap = document.getElementById('accuracy-summary');
        if (!wrap) return;
        wrap.innerHTML = '';
        const players = this.gameState.players || [];
        const guesses = this.gameState.guesses || {};
        const answers = this.gameState.playerAnswers || {};
        players.forEach(target => {
            const targetName = target.name;
            const targetAnswers = answers[targetName];
            if (!targetAnswers) return;
            const group = document.createElement('div');
            group.className = 'answer-set';
            const h4 = document.createElement('h4');
            h4.textContent = `Accuracy when guessing ${targetName}`;
            group.appendChild(h4);
            const ul = document.createElement('ul');
            ul.style.listStyle = 'none';
            ul.style.padding = '0';
            const targetGuesses = guesses[targetName] || {};
            players.forEach(p => {
                if (p.name === targetName) return; // target doesn't guess
                const g = targetGuesses[p.name];
                let correct = 0;
                if (g) {
                    this.questions.forEach(q => { if (g[q.id] === targetAnswers[q.id]) correct++; });
                }
                const li = document.createElement('li');
                const total = this.questions.length;
                li.textContent = `${p.name}: ${correct}/${total} correct`;
                ul.appendChild(li);
            });
            group.appendChild(ul);
            wrap.appendChild(group);
        });
    }

    // Copy a concise summary of winners and final scores
    async copyWinnerSummary() {
        const scores = Object.entries(this.gameState.scores || {}).sort(([,a], [,b]) => b - a);
        const maxScore = scores.length ? scores[0][1] : 0;
        const winners = scores.filter(([,s]) => s === maxScore).map(([n]) => n);
        const title = winners.length === 1 ? `Winner: ${winners[0]} (${maxScore} points)` : `Tie: ${winners.join(' & ')} (${maxScore} points)`;
        const lines = scores.map(([n,s]) => `- ${n}: ${s}`);
        const text = [`If I Were... Results`, title, ...lines].join('\n');
        try {
            await navigator.clipboard.writeText(text);
            const btn = document.getElementById('copy-summary');
            if (btn) {
                const old = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = old, 1500);
            }
        } catch (_) {
            alert(text);
        }
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
        this.hideAllPhases();
        const answerPhase = document.getElementById('answer-phase');
        answerPhase.style.display = 'block';
        
        // Clear any existing carousel
        const container = document.getElementById('card-carousel-container');
        container.innerHTML = '';
        
        // Initialize card carousel
        this.cardCarousel = new CardCarousel('card-carousel-container', this.questions, (questionIndex, answer) => {
            // Update selected answers when user selects an option
            this.selectedAnswers[questionIndex] = answer;
            
            // Enable/disable submit button based on whether all questions are answered
            const submitButton = document.getElementById('submit-answers');
            submitButton.disabled = !this.cardCarousel.getAllQuestionsAnswered();
        });
        
        // Initialize selected answers array if needed
        if (!this.selectedAnswers || this.selectedAnswers.length !== this.questions.length) {
            this.selectedAnswers = new Array(this.questions.length).fill('');
        }
        
        // Update game state
        this.gameState.gameStarted = true;
        this.gameState.phase = 'answering';
        
        // Update progress counter
        const answeredCount = Object.keys(this.gameState.playerAnswers).length;
        document.getElementById('answers-progress').textContent = 
            `${answeredCount}/${this.gameState.players.length} players have answered`;
            
        // Disable submit button initially
        const submitButton = document.getElementById('submit-answers');
        if (submitButton) {
            submitButton.disabled = true;
            
            // Add event listener for submit button
            submitButton.addEventListener('click', () => this.submitAnswers());
        }
    }
    
    /**
     * Submit the player's answers to the server
     */
    async submitAnswers() {
        try {
            // Get answers from card carousel
            const answers = this.cardCarousel.getAnswers();
            
            // Check if all questions are answered
            if (answers.some(answer => !answer)) {
                alert('Please answer all questions before submitting.');
                return;
            }
            
            // Format the answers for Firebase
            const formattedAnswers = this.questions.map((question, index) => ({
                questionId: question.id,
                answer: answers[index]
            }));
            
            // Disable the submit button to prevent multiple submissions
            const submitButton = document.getElementById('submit-answers');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Submitting...';
            }
            
            // Submit the answers to Firebase
            const playerRef = firebase.database().ref(`games/${this.gameId}/players/${this.playerId}`);
            await playerRef.update({
                answers: formattedAnswers,
                hasAnswered: true
            });
            
            // Show waiting message
            document.getElementById('waiting-for-others').style.display = 'block';
            
        } catch (error) {
            console.error('Error submitting answers:', error);
            alert('There was an error submitting your answers. Please try again.');
            
            // Re-enable the submit button on error
            const submitButton = document.getElementById('submit-answers');
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Submit My Answers';
            }
        }
    }
    
    updateProgress() {
        if (!this.progressIndicator) return;
        
        // Update progress text
        this.progressIndicator.textContent = `Question ${this.currentCardIndex + 1} of ${this.questions.length}`;
        
        // Update submit button state based on whether all questions are answered
        const submitButton = document.getElementById('submit-answers');
        if (submitButton) {
            const allAnswered = this.selectedAnswers && 
                              this.selectedAnswers.length === this.questions.length &&
                              this.selectedAnswers.every(answer => answer !== '');
            submitButton.disabled = !allAnswered;
        }
    }

    startGame() {
        // Hide all game phases first
        this.hideAllPhases();
        
        // Show the waiting room
        this.showWaitingRoom();
        
        // Set up Firebase listeners
        this.setupGameListener();
        
        // Set up polling fallback
        this.setupPollingFallback();
        
        // Initialize UI elements
        this.initializeUI();
        
        // Initialize the question carousel
        this.initializeQuestionCarousel();
        
        // If this is the host, set up the game state
        if (this.isHost) {
            this.initializeGameState();
        }
    }

    showAnswerPhase() {
        this.hideAllPhases();
        document.getElementById('answer-phase').style.display = 'block';
        
        // Reset the current card index and selected answers
        this.currentCardIndex = 0;
        this.currentQuestionIndex = 0;
        this.selectedAnswers = [];
        
        // Initialize the question carousel
        this.initializeQuestionCarousel();
    }

    constructor() {
        // Generate a unique player ID if not exists
        this.playerId = localStorage.getItem('playerId') || this.generateId();
        localStorage.setItem('playerId', this.playerId);
        
        // Get game ID from URL or generate a new one
        this.gameId = this.getGameIdFromUrl();
        this.playerName = '';
        this.isHost = false;
        this.selectedAnswers = [];
        this.gameState = null;
        this.players = [];
        this.answers = [];
        this.guesses = [];
        this.currentPlayerIndex = 0;
        this.playersReady = 0;
        this.playersAnswered = 0;
        this.playersGuessed = 0;
        this.playersReadyForNextRound = 0;
        this.currentQuestionIndex = 0;
        this.currentRevealIndex = 0;
        this.autoAdvanceTimer = null;
        this.answerTimers = {};
        
        // Card carousel state
        this.currentCardIndex = 0;
        this.questions = [
            { 
                id: 'q1', 
                text: "If I were a sound effect, I'd be:", 
                options: ['Ka-ching!', 'Dramatic gasp', 'Boing!', 'Evil laugh'] 
            },
            { 
                id: 'q2', 
                text: "If I were a weather forecast, I'd be:", 
                options: ['100% chill', 'Partly dramatic with a chance of chaos!', 'Heatwave vibes', 'Sudden tornado of opinions'] 
            },
            { 
                id: 'q3', 
                text: "If I were a breakfast cereal, I'd be:", 
                options: ['Jungle Oats', 'WeetBix', 'Rice Krispies', 'MorVite', 'That weird healthy one no-one eats'] 
            },
            { 
                id: 'q4', 
                text: "If I were a bedtime excuse, I'd be...", 
                options: [
                    'I need water',
                    "There's a spider in my room",
                    "I can't sleep without \"Pillow\"",
                    'There see shadows outside my window',
                    'Just one more episode'
                ] 
            },
            { 
                id: 'q5', 
                text: "If I were a villain in a movie, I'd be...", 
                options: [
                    'Scarlet Overkill',
                    'Grinch',
                    'Thanos',
                    'A mosquito in your room at night',
                    'Darth Vader'
                ] 
            },
            { 
                id: 'q6', 
                text: "If I were a kitchen appliance, I'd be...", 
                options: [
                    'A blender on high speed with no lid',
                    "A toaster that only pops when no one's looking",
                    "Microwave that screams when it's done",
                    'A fridge that judges your snack choices'
                ] 
            },
            { 
                id: 'q7', 
                text: "If I were a dance move, I'd be...", 
                options: [
                    'The awkward shuffle at weddings',
                    'Kwasakwasa, Ba-baah!',
                    'The "I thought no one was watching" move',
                    'The knee-pop followed by a regretful sit-down'
                ] 
            },
            { 
                id: 'q8', 
                text: "If I were a text message, I'd be...", 
                options: [
                    'A typo-ridden voice-to-text disaster',
                    'A three-hour late "LOL"',
                    'A group chat gif spammer',
                    'A mysterious "K." with no context'
                ] 
            },
            { 
                id: 'q9', 
                text: "If I were a warning label, I'd be...", 
                options: [
                    'Caution: May spontaneously break into song',
                    'Contents may cause uncontrollable giggles',
                    'Qaphela: Gevaar/Ingozi',
                    'Warning: Will talk your ear off about random facts',
                    'May contain traces of impulsive decisions'
                ] 
            },
            { 
                id: 'q10', 
                text: "If I were a type of chair, I'd be...", 
                options: [
                    'A Phala Phala sofa',
                    'A creaky antique that screams when you sit',
                    'One of those folding chairs that attack your fingers',
                    'A throne made of regrets and snack crumbs'
                ] 
            }
        ];
        this.selectedAnswers = Array(this.questions.length).fill('');
    }

    startGame() {
        // Hide all game phases first
        this.hideAllPhases();
        
        // Show the waiting room
        this.showWaitingRoom();
        
        // Set up Firebase listeners
        this.setupGameListener();
        
        // Set up polling fallback
        this.setupPollingFallback();
        
        // Initialize UI elements
        this.initializeUI();
        
        // Initialize the question carousel
        this.initializeQuestionCarousel();
        
        // If this is the host, set up the game state
        if (this.isHost) {
            this.initializeGameState();
        }
        this.currentCardIndex = 0;
        
        // Reset the current question index
        this.currentQuestionIndex = 0;
        
        // Reset the current reveal index
        this.currentRevealIndex = 0;
        
        // Reset the players answered count
        this.playersAnswered = 0;
        
        // Update the current answerer
        this.updateCurrentAnswerer();
        
        // Rebuild the question carousel
        // Initialize the card carousel if it doesn't exist
        const container = document.getElementById('card-carousel-container');
        if (container && !this.cardCarousel) {
            this.cardCarousel = new CardCarousel('card-carousel-container', this.questions, (questionIndex, answer) => {
                // Update selected answers when user selects an option
                this.selectedAnswers[questionIndex] = answer;
                
                // Enable/disable submit button based on whether all questions are answered
                const submitButton = document.getElementById('submit-answers');
                if (submitButton) {
                    submitButton.disabled = !this.cardCarousel.getAllQuestionsAnswered();
                }
            });
        }
    }
// Initialize the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
    const game = new MultiplayerIfIWereGame();
    
    // Make the game instance globally available for debugging
    window.game = game;
});
