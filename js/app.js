/**
 * Judo Club Sign-In — Main App Controller & Router
 */

// PWA: Catch the install prompt globally as early as possible
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
});

const App = (() => {
    let currentScreen = 'signin';

    async function init() {
        // 1. Initialise UI utilities
        Utils.Clock.init();

        // 2. Ensure DB is open first
        await DB.open();

        // 2. Run background tasks & data maintenance
        // Sequential execution to avoid race conditions between deduplication and repair
        await SeedData.seedIfEmpty();
        await MemberImport.importIfNeeded();
        await DB.Members.deduplicate();
        await DB.Locations.deduplicate();
        await DB.Schedules.deduplicate();
        await DB.Maintenance.repairOrphanedSchedules();

        // Check for app password lock
        const appPassword = await DB.Settings.get('appPassword');
        if (appPassword) {
            await showAppLockScreen(appPassword);
        }

        // Set up navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const screen = btn.dataset.screen;
                if (screen) navigate(screen);
            });
        });

        // Load current location into header
        const locId = await DB.Settings.getCurrentLocationId();
        if (locId) {
            const loc = await DB.Locations.getById(locId);
            if (loc) {
                document.getElementById('header-location-name').textContent = loc.name;
            }
        }

        // PWA Install Logic
        const installBtn = document.getElementById('pwa-install-btn');
        const iosModal = document.getElementById('ios-install-modal');
        const iosClose = document.getElementById('ios-install-close');

        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        if (!isStandalone) {
            if (installBtn) installBtn.classList.remove('hidden');

            if (installBtn) {
                installBtn.addEventListener('click', async () => {
                    if (isIOS) {
                        if (iosModal) iosModal.classList.remove('hidden');
                    } else if (deferredPrompt) {
                        deferredPrompt.prompt();
                        const { outcome } = await deferredPrompt.userChoice;
                        if (outcome === 'accepted') {
                            installBtn.classList.add('hidden');
                        }
                        deferredPrompt = null;
                    } else {
                        alert('Your phone is blocking the automatic pop-up right now.\n\nTo install the app manually:\n1. Tap the three dots (⋮) in the top right of your browser.\n2. Tap "Install App" or "Add to Home screen".');
                    }
                });
            }

            if (iosClose) {
                iosClose.addEventListener('click', () => {
                    if (iosModal) iosModal.classList.add('hidden');
                });
            }
        }

        // Navigate to initial screen
        await navigate('signin');

        // 🌊 Performance: Hide splash screen once first render is solid
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            splash.style.opacity = '0';
            splash.style.transform = 'scale(1.05)';
            setTimeout(() => splash.remove(), 400);
        }
    }

    function showAppLockScreen(storedPassword) {
        return new Promise((resolve) => {
            const lockScreen = document.getElementById('app-lock-screen');
            const input = document.getElementById('app-lock-input');
            const submitBtn = document.getElementById('app-lock-submit');
            const errorEl = document.getElementById('app-lock-error');

            lockScreen.classList.remove('hidden');
            setTimeout(() => input.focus(), 200);

            function tryUnlock() {
                const entered = input.value;
                if (entered === storedPassword) {
                    lockScreen.classList.add('hidden');
                    input.value = '';
                    errorEl.classList.add('hidden');
                    resolve();
                } else {
                    errorEl.classList.remove('hidden');
                    input.value = '';
                    input.focus();
                    // Shake animation
                    lockScreen.querySelector('.app-lock-card').style.animation = 'none';
                    requestAnimationFrame(() => {
                        lockScreen.querySelector('.app-lock-card').style.animation = 'shake 0.4s ease';
                    });
                }
            }

            submitBtn.addEventListener('click', tryUnlock);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') tryUnlock();
                errorEl.classList.add('hidden');
            });
        });
    }

    async function navigate(screen) {
        // Prevent re-navigation to the same screen to avoid unnecessary queries
        // but allow initial load
        if (currentScreen === screen && screen !== 'signin') return;

        // Immediately update tab visually for responsiveness
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.screen === screen);
        });

        // Protected routes
        const restricted = ['attendance', 'manual', 'members', 'settings'];
        if (restricted.includes(screen)) {
            // Require PIN logic handles showing UI/resolving
            SettingsScreen.checkAndPromptPin(
                () => performNavigation(screen),
                () => {
                    // On cancel, revert nav UI to actual current screen
                    document.querySelectorAll('.nav-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.screen === currentScreen);
                    });
                }
            );
            return;
        }

        performNavigation(screen);
    }

    async function performNavigation(screen) {
        currentScreen = screen;


        // Render the appropriate screen
        switch (screen) {
            case 'signin':
                await SignInScreen.render();
                break;
            case 'attendance':
                await AttendanceScreen.render();
                break;
            case 'manual':
                await ManualScreen.render();
                break;
            case 'members':
                await MembersScreen.render();
                break;
            case 'settings':
                await SettingsScreen.render();
                break;
            case 'schedule':
                await ScheduleScreen.render();
                break;
        }

        // Scroll to top
        document.getElementById('main-content').scrollTop = 0;

        // Toggle header elements
        const locEl = document.getElementById('header-location');
        const schedBtn = document.getElementById('nav-schedule');
        if (locEl) locEl.style.display = (screen === 'schedule') ? 'none' : 'block';
        if (schedBtn) schedBtn.style.display = (screen === 'schedule') ? 'none' : 'block';
    }

    function getCurrentScreen() {
        return currentScreen;
    }

    return {
        init,
        navigate,
        getCurrentScreen
    };
})();

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
