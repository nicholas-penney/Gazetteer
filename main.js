if (!('serviceWorker' in navigator)) {
	console.log('Service Worker not supported');
}

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js')
			.then(reg => {
				// This is called in Chrome
				console.log('Registered sw.js from main.js!', reg);
			}).catch(err => {
				console.log('Registration failed: ', err);
			});
	});
}

// Add button user can click to "Install Offline"

var btnInstallOffline = document.getElementById('btnInstallOffline');

// Initial setup
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    // Update UI to notify the user than can add to home screen
    btnInstallOffline.style.display = 'block';
});

// User clicks "Install Offline"
btnInstallOffline.addEventListener('click', (e) => {
    deferredPrompt.prompt();
    // Did user click "Yes" or "No":
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the A2HS prompt'); // Add 2 Home Screen
        }
        // Dispose
        deferredPrompt = null;
    });
});

// Confirming installation. Might not be needed or advisable, just for analytics:
window.addEventListener('appinstalled', (evt) => {
	//app.logEvent('a2hs', 'installed');
	console.log('App has been installed! I think...');
});