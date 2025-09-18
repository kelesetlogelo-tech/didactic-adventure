class CardCarousel {
    constructor(containerId, questions, onAnswerChange) {
        this.container = document.getElementById(containerId);
        this.questions = questions;
        this.onAnswerChange = onAnswerChange;
        this.currentIndex = 0;
        this.answers = new Array(questions.length).fill('');
        
        this.init();
    }
    
    init() {
        // Create carousel container
        this.carousel = document.createElement('div');
        this.carousel.className = 'card-carousel';
        this.container.appendChild(this.carousel);
        
        // Create navigation
        this.createNavigation();
        
        // Create cards
        this.createCards();
        
        // Show first card
        this.showCard(0);
    }
    
    createNavigation() {
        this.navContainer = document.createElement('div');
        this.navContainer.className = 'carousel-navigation';
        
        this.prevButton = document.createElement('button');
        this.prevButton.className = 'nav-button prev';
        this.prevButton.innerHTML = '&larr; Previous';
        this.prevButton.disabled = true;
        
        this.progress = document.createElement('span');
        this.progress.className = 'progress-indicator';
        this.updateProgress();
        
        this.nextButton = document.createElement('button');
        this.nextButton.className = 'nav-button next';
        this.nextButton.innerHTML = 'Next &rarr;';
        
        this.navContainer.appendChild(this.prevButton);
        this.navContainer.appendChild(this.progress);
        this.navContainer.appendChild(this.nextButton);
        this.container.appendChild(this.navContainer);
        
        // Add event listeners
        this.prevButton.addEventListener('click', () => this.prevCard());
        this.nextButton.addEventListener('click', () => this.nextCard());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') this.prevCard();
            if (e.key === 'ArrowRight') this.nextCard();
        });
    }
    
    createCards() {
        this.cards = [];
        this.questions.forEach((question, index) => {
            const card = this.createCard(question, index);
            this.carousel.appendChild(card);
            this.cards.push(card);
        });
    }
    
    createCard(question, index) {
        const card = document.createElement('div');
        card.className = 'question-card';
        card.dataset.index = index;
        
        const questionNumber = index + 1;
        
        card.innerHTML = `
            <div class="card-inner">
                <div class="card-front">
                    <h3 class="question-text">${questionNumber}. ${question.text}</h3>
                    <div class="options">
                        ${question.options.map((option, i) => `
                            <label class="option">
                                <input type="radio" name="q${index}" value="${option}" 
                                    ${this.answers[index] === option ? 'checked' : ''}>
                                <span>${option}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners to radio buttons
        const radioButtons = card.querySelectorAll('input[type="radio"]');
        radioButtons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.answers[index] = e.target.value;
                    this.onAnswerChange && this.onAnswerChange(index, e.target.value);
                    this.updateProgress();
                }
            });
        });
        
        return card;
    }
    
    showCard(index) {
        if (index < 0 || index >= this.questions.length) return;
        
        // Hide current card
        if (this.currentIndex >= 0 && this.currentIndex < this.cards.length) {
            this.cards[this.currentIndex].classList.remove('active');
        }
        
        // Show new card
        this.currentIndex = index;
        this.cards[index].classList.add('active');
        
        // Update navigation buttons
        this.prevButton.disabled = index === 0;
        this.nextButton.disabled = index === this.questions.length - 1;
        
        // Update progress
        this.updateProgress();
    }
    
    nextCard() {
        if (this.currentIndex < this.questions.length - 1) {
            this.showCard(this.currentIndex + 1);
        }
    }
    
    prevCard() {
        if (this.currentIndex > 0) {
            this.showCard(this.currentIndex - 1);
        }
    }
    
    updateProgress() {
        const answered = this.answers.filter(a => a).length;
        this.progress.textContent = `Question ${this.currentIndex + 1} of ${this.questions.length} (${answered}/${this.questions.length} answered)`;
    }
    
    getAnswers() {
        return this.answers;
    }
    
    getAllQuestionsAnswered() {
        return this.answers.every(answer => answer !== '');
    }
}
