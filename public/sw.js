self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'reply' && event.reply) {
        const replyText = event.reply;
        
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                const client = clientList.find(c => c.url.includes('/Groupe.html'));
                if (client) {
                    client.postMessage({
                        type: 'REPLY_MSG',
                        text: replyText
                    });
                    return client.focus();
                } else {
                    // Si la page n'est pas ouverte, on ne peut pas envoyer via socket facilement
                    // On ouvre la page au moins
                    return clients.openWindow('/Groupe.html');
                }
            })
        );
    } else {
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes('/Groupe.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow('/Groupe.html');
                }
            })
        );
    }
});
