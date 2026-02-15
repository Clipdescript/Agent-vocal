class MemoryManager {
    constructor() {
        this.MAX_DOM_MESSAGES = 50;
        this.MAX_LOCAL_STORAGE_MESSAGES = 100;
        this.cleanupInterval = null;
        this.init();
    }
    
    init() {
        this.cleanupInterval = setInterval(() => {
            this.performCleanup();
        }, 2 * 60 * 1000);
        
        this.monitorMemory();
    }
    
    performCleanup() {
        this.cleanLocalStorage();
        this.cleanDOMMessages();
        this.clearUnusedImages();
        
        if (window.gc) {
            window.gc();
        }
        
        console.log('Nettoyage mémoire effectué');
    }
    
    cleanLocalStorage() {
        try {
            const stored = localStorage.getItem('chat-messages-local');
            if (stored) {
                let messages = JSON.parse(stored);
                
                if (messages.length > this.MAX_LOCAL_STORAGE_MESSAGES) {
                    messages = messages.slice(-this.MAX_LOCAL_STORAGE_MESSAGES);
                    localStorage.setItem('chat-messages-local', JSON.stringify(messages));
                }
                
                const now = Date.now();
                const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
                messages = messages.filter(m => m.timestamp > sevenDaysAgo);
                localStorage.setItem('chat-messages-local', JSON.stringify(messages));
            }
        } catch (e) {
            console.warn('Erreur nettoyage localStorage:', e);
            if (e.name === 'QuotaExceededError') {
                this.emergencyCleanup();
            }
        }
    }
    
    cleanDOMMessages() {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return;
        
        const allMessages = messagesContainer.querySelectorAll('li');
        
        if (allMessages.length > this.MAX_DOM_MESSAGES) {
            const toRemove = allMessages.length - this.MAX_DOM_MESSAGES;
            
            for (let i = 0; i < toRemove; i++) {
                const msg = allMessages[i];
                const imgs = msg.querySelectorAll('img');
                imgs.forEach(img => {
                    img.src = '';
                    img.remove();
                });
                
                const audios = msg.querySelectorAll('audio');
                audios.forEach(audio => {
                    audio.pause();
                    audio.src = '';
                    audio.load();
                    audio.remove();
                });
                
                msg.remove();
            }
        }
    }
    
    clearUnusedImages() {
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            if (!img.isConnected) {
                img.src = '';
            }
        });
    }
    
    emergencyCleanup() {
        console.warn('Nettoyage d\'urgence - Mémoire saturée');
        
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('chat-messages-local')) {
                    const stored = localStorage.getItem(key);
                    if (stored) {
                        let messages = JSON.parse(stored);
                        messages = messages.slice(-30);
                        localStorage.setItem(key, JSON.stringify(messages));
                    }
                }
            });
        } catch (e) {
            console.error('Échec nettoyage d\'urgence:', e);
            localStorage.clear();
            location.reload();
        }
    }
    
    monitorMemory() {
        if (performance.memory) {
            setInterval(() => {
                const usedMB = performance.memory.usedJSHeapSize / 1048576;
                const limitMB = performance.memory.jsHeapSizeLimit / 1048576;
                const percentage = (usedMB / limitMB) * 100;
                
                if (percentage > 80) {
                    console.warn(`Mémoire élevée: ${percentage.toFixed(2)}%`);
                    this.performCleanup();
                }
                
                if (percentage > 90) {
                    console.error('Mémoire critique - Nettoyage forcé');
                    this.emergencyCleanup();
                }
            }, 30000);
        }
    }
    
    lazyLoadMessages(container) {
        if (!container) return;
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target.querySelector('img[data-src]');
                    if (img) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                }
            });
        }, {
            rootMargin: '50px'
        });
        
        container.querySelectorAll('li').forEach(li => {
            observer.observe(li);
        });
        
        return observer;
    }
    
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

window.memoryManager = new MemoryManager();
