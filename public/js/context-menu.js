class ContextMenuManager {
    constructor(socket, userId) {
        this.socket = socket;
        this.userId = userId;
        this.selectedMessageId = null;
        this.highlightedMessage = null;
        
        this.elements = {
            contextMenu: document.getElementById('message-context-menu'),
            messageOverlay: document.getElementById('message-overlay'),
            reactionsDetailMenu: document.getElementById('reactions-detail-menu'),
            reactionsDetailList: document.getElementById('reactions-detail-list'),
            shareMenu: document.getElementById('share-menu')
        };
        
        this.initEvents();
    }
    
    initEvents() {
        this.elements.messageOverlay?.addEventListener('click', () => this.hide());
        
        document.addEventListener('click', (e) => {
            if (!this.elements.contextMenu.contains(e.target) && !e.target.closest('.message-main')) {
                this.hide();
            }
        });

        document.addEventListener('touchstart', (e) => {
            if (!this.elements.contextMenu.contains(e.target) && !e.target.closest('.message-main')) {
                this.hide();
            }
        }, { passive: true });
        
        this.elements.contextMenu?.querySelector('.reaction-bar')?.addEventListener('click', (e) => {
            if (e.target.tagName === 'SPAN') {
                const emoji = e.target.textContent;
                this.socket.emit('message reaction', { 
                    timestamp: this.selectedMessageId, 
                    emoji: emoji, 
                    userId: this.userId 
                });
                this.hide();
            }
        });
        
        this.elements.reactionsDetailMenu?.querySelector('.reaction-bar')?.addEventListener('click', (e) => {
            if (e.target.tagName === 'SPAN') {
                const emoji = e.target.textContent;
                this.socket.emit('message reaction', { 
                    timestamp: this.selectedMessageId, 
                    emoji: emoji, 
                    userId: this.userId 
                });
                this.hide();
            }
        });
    }
    
    show(e, msgId, isMe, messageElement) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        this.selectedMessageId = msgId;
        
        if (this.highlightedMessage) {
            this.highlightedMessage.classList.remove('highlighted');
            this.highlightedMessage.style.transform = '';
        }
        this.highlightedMessage = messageElement;
        this.highlightedMessage.classList.add('highlighted');
        
        this.elements.messageOverlay.style.display = 'block';
        this.elements.contextMenu.style.display = 'flex';
        this.elements.contextMenu.classList.add('active');
        
        const rect = messageElement.getBoundingClientRect();
        const reactionBar = this.elements.contextMenu.querySelector('.reaction-bar');
        const menuList = this.elements.contextMenu.querySelector('.context-menu-list');
        
        let translateY = 0;
        const reactionHeight = 60;
        const menuHeight = 320;
        const margin = 20;

        if (rect.top < reactionHeight + margin) {
            translateY = (reactionHeight + margin) - rect.top;
        } else if (rect.bottom > window.innerHeight - menuHeight - margin) {
            translateY = (window.innerHeight - menuHeight - margin) - rect.bottom;
        }

        this.highlightedMessage.style.transform = `scale(1.02) translateY(${translateY}px)`;

        const shiftedRect = {
            top: rect.top + translateY,
            bottom: rect.bottom + translateY,
            left: rect.left,
            right: rect.right
        };

        this.updateReactionSelection(msgId, reactionBar);

        const hasReaction = messageElement.querySelector('.message-reactions');
        const offset = hasReaction ? 25 : 10;
        
        reactionBar.style.position = 'fixed';
        reactionBar.style.bottom = `${window.innerHeight - shiftedRect.top + 10}px`;
        
        menuList.style.position = 'fixed';
        menuList.style.top = `${shiftedRect.bottom + offset}px`;

        if (isMe) {
            menuList.style.right = `${Math.max(10, window.innerWidth - shiftedRect.right)}px`;
            menuList.style.left = 'auto';
            reactionBar.style.right = `${Math.max(10, window.innerWidth - shiftedRect.right)}px`;
            reactionBar.style.left = 'auto';
        } else {
            menuList.style.left = `${Math.max(10, shiftedRect.left)}px`;
            menuList.style.right = 'auto';
            reactionBar.style.left = `${Math.max(10, shiftedRect.left)}px`;
            reactionBar.style.right = 'auto';
        }

        const deleteBtn = document.getElementById('menu-delete');
        if (deleteBtn) deleteBtn.style.display = isMe ? 'flex' : 'none';

        const replyBtn = document.getElementById('menu-reply');
        if (replyBtn) replyBtn.style.display = isMe ? 'none' : 'flex';

        const copyBtn = document.getElementById('menu-copy');
        const isAudio = messageElement.querySelector('.audio-message');
        if (copyBtn) copyBtn.style.display = isAudio ? 'none' : 'flex';
    }
    
    showAllReactions(msgId, messageElement, getLocalMessages) {
        this.selectedMessageId = msgId;
        
        if (this.highlightedMessage) {
            this.highlightedMessage.classList.remove('highlighted');
            this.highlightedMessage.style.transform = '';
        }
        this.highlightedMessage = messageElement;
        this.highlightedMessage.classList.add('highlighted');
        
        this.elements.messageOverlay.style.display = 'block';
        this.elements.reactionsDetailMenu.style.display = 'flex';
        this.elements.reactionsDetailMenu.classList.add('active');
        
        const rect = messageElement.getBoundingClientRect();
        const reactionBar = this.elements.reactionsDetailMenu.querySelector('.reaction-bar');
        
        let translateY = 0;
        const reactionHeight = 60;
        const listHeight = 250;
        const margin = 20;

        if (rect.top < reactionHeight + margin) {
            translateY = (reactionHeight + margin) - rect.top;
        } else if (rect.bottom > window.innerHeight - listHeight - margin) {
            translateY = (window.innerHeight - listHeight - margin) - rect.bottom;
        }

        this.highlightedMessage.style.transform = `scale(1.02) translateY(${translateY}px)`;

        const shiftedRect = {
            top: rect.top + translateY,
            bottom: rect.bottom + translateY,
            left: rect.left,
            right: rect.right
        };

        const msgs = getLocalMessages();
        const currentMsg = msgs.find(m => m.timestamp == msgId);
        let myEmoji = null;
        let allReactions = [];

        if (currentMsg && currentMsg.reactions) {
            try {
                allReactions = JSON.parse(currentMsg.reactions);
                const found = allReactions.find(r => r.userId === this.userId);
                if (found) myEmoji = found.emoji;
            } catch(e) {}
        }

        reactionBar.querySelectorAll('span').forEach(span => {
            if (span.textContent === myEmoji) span.classList.add('selected');
            else span.classList.remove('selected');
        });

        this.elements.reactionsDetailList.innerHTML = '';
        allReactions.forEach(r => {
            const item = document.createElement('div');
            item.className = 'reaction-item';
            
            const userMsg = msgs.find(m => m.userId === r.userId);
            const name = userMsg ? userMsg.username : "Utilisateur";
            const img = userMsg ? userMsg.image : null;
            
            item.innerHTML = `
                <div class="reaction-item-avatar" style="background-color: ${img ? 'transparent' : getColorForUser(name)}">
                    ${img ? `<img src="${img}">` : name.charAt(0).toUpperCase()}
                </div>
                <div class="reaction-item-name">${name} ${r.userId === this.userId ? "(Moi)" : ""}</div>
                <div class="reaction-item-emoji">${r.emoji}</div>
            `;
            this.elements.reactionsDetailList.appendChild(item);
        });

        reactionBar.style.position = 'fixed';
        reactionBar.style.bottom = `${window.innerHeight - shiftedRect.top + 10}px`;
        
        this.elements.reactionsDetailList.style.position = 'fixed';
        this.elements.reactionsDetailList.style.top = `${shiftedRect.bottom + 10}px`;

        const isMe = currentMsg ? currentMsg.userId === this.userId : false;
        if (isMe) {
            this.elements.reactionsDetailList.style.right = `${Math.max(10, window.innerWidth - shiftedRect.right)}px`;
            this.elements.reactionsDetailList.style.left = 'auto';
            reactionBar.style.right = `${Math.max(10, window.innerWidth - shiftedRect.right)}px`;
            reactionBar.style.left = 'auto';
        } else {
            this.elements.reactionsDetailList.style.left = `${Math.max(10, shiftedRect.left)}px`;
            this.elements.reactionsDetailList.style.right = 'auto';
            reactionBar.style.left = `${Math.max(10, shiftedRect.left)}px`;
            reactionBar.style.right = 'auto';
        }
    }
    
    updateReactionSelection(msgId, reactionBar) {
        const msgs = this.getLocalMessages();
        const currentMsg = msgs.find(m => m.timestamp == msgId);
        let myEmoji = null;
        if (currentMsg && currentMsg.reactions) {
            try {
                const reactions = JSON.parse(currentMsg.reactions);
                const found = reactions.find(r => r.userId === this.userId);
                if (found) myEmoji = found.emoji;
            } catch(e) {}
        }

        reactionBar.querySelectorAll('span').forEach(span => {
            if (span.textContent === myEmoji) {
                span.classList.add('selected');
            } else {
                span.classList.remove('selected');
            }
        });
    }
    
    hide() {
        if (!this.elements.contextMenu.classList.contains('active') && 
            !this.elements.reactionsDetailMenu.classList.contains('active') && 
            !this.elements.shareMenu.classList.contains('active')) return;
        
        this.elements.contextMenu.classList.add('closing');
        this.elements.reactionsDetailMenu.classList.add('closing');
        this.elements.shareMenu.classList.add('closing');
        this.elements.messageOverlay.classList.add('closing');
        
        if (this.highlightedMessage) {
            this.highlightedMessage.classList.remove('highlighted');
            this.highlightedMessage.style.transform = '';
        }

        setTimeout(() => {
            this.elements.contextMenu.style.display = 'none';
            this.elements.contextMenu.classList.remove('active', 'closing');
            this.elements.reactionsDetailMenu.style.display = 'none';
            this.elements.reactionsDetailMenu.classList.remove('active', 'closing');
            this.elements.shareMenu.style.display = 'none';
            this.elements.shareMenu.classList.remove('active', 'closing');
            this.elements.messageOverlay.style.display = 'none';
            this.elements.messageOverlay.classList.remove('closing');
            this.highlightedMessage = null;
            this.selectedMessageId = null;
        }, 300);
    }
    
    getSelectedMessageId() {
        return this.selectedMessageId;
    }
    
    setLocalMessagesGetter(getter) {
        this.getLocalMessages = getter;
    }
}
