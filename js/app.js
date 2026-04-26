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

    /**
     * Race a promise against a timeout. If the promise doesn't settle
     * within `ms`, the returned promise rejects with a timeout error.
     */
    function withTimeout(promise, ms, label = 'Operation') {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s — Firestore may be unreachable or permissions have expired.`)), ms)
            )
        ]);
    }

    async function init() {
        // 🚀 Parallel Start: Clock and DB Open
        const dbOpenPromise = DB.open();
        Utils.Clock.init();

        // 2. Ensure DB is open first
        await dbOpenPromise;

        // 3. Parallel Background Tasks & Data Maintenance
        // Wrapped in try/catch with timeout so Firestore issues don't hang the app
        let appPassword = null;
        let locId = null;
        let initError = null;

        try {
            const maintenancePromise = Promise.all([
                SeedData.seedIfEmpty(),
                MemberImport.importIfNeeded(),
                DB.Members.deduplicate(),
                DB.Locations.deduplicate(),
                DB.Schedules.deduplicate(),
                DB.Settings.get('appPassword'),
                DB.Settings.getCurrentLocationId()
            ]);

            // Give Firestore 15 seconds — if permissions are expired, writes
            // may hang indefinitely with offline persistence enabled
            const results = await withTimeout(maintenancePromise, 15000, 'Database initialization');
            appPassword = results[5];
            locId = results[6];
        } catch (err) {
            console.error('⚠️ App init: Firestore maintenance failed:', err);
            initError = err;
        }

        // 4. Handle App Lock & Header UI in parallel with Navigation
        const setupPromises = [];

        if (appPassword) {
            setupPromises.push(showAppLockScreen(appPassword));
        }

        if (locId) {
            setupPromises.push(DB.Locations.getById(locId).then(loc => {
                if (loc) {
                    const locEl = document.getElementById('header-location-name');
                    if (locEl) locEl.textContent = loc.name;
                }
            }).catch(() => {}));
        }

        // Setup button listeners (Sync)
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const screen = btn.dataset.screen;
                if (screen) navigate(screen);
            });
        });

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

        // Navigate to initial screen (or show error)
        if (initError) {
            showDatabaseError(initError);
        } else {
            await navigate('signin');
        }

        // 🌊 Performance: Hide splash screen once first render is solid
        dismissSplash();
    }

    /**
     * Remove the splash screen with a smooth fade-out.
     */
    function dismissSplash() {
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

    function showDatabaseError(err) {
        const container = document.getElementById('main-content');
        const errMsg = err && err.message ? err.message : String(err);
        const isPermissionError = errMsg.includes('permissions') || errMsg.includes('timed out');
        container.innerHTML = `
            <div style="padding: 40px 20px; text-align: center;">
                <div style="font-size: 64px; margin-bottom: 16px;">🔒</div>
                <h2 style="color: var(--accent-red, #e74c3c); font-size: 22px; margin-bottom: 12px;">Database Connection Error</h2>
                <p style="color: var(--text-secondary, #94a3b8); font-size: 15px; line-height: 1.6; max-width: 400px; margin: 0 auto 20px;">
                    ${isPermissionError
                        ? 'Firebase Firestore security rules have <strong>expired or are misconfigured</strong>. An admin needs to update the rules in the <a href="https://console.firebase.google.com/project/whiterockjudo-b45c0/firestore/rules" target="_blank" style="color: var(--accent-gold, #dcba69);">Firebase Console</a>.'
                        : 'Unable to connect to the database. Please check your internet connection and try again.'}
                </p>
                <p style="color: var(--text-muted, #64748b); font-size: 12px; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; font-family: monospace; word-break: break-all; max-width: 400px; margin: 0 auto 20px;">
                    ${Utils.escapeHTML(errMsg)}
                </p>
                <button class="btn btn-gold" onclick="window.location.reload()" style="padding: 12px 32px; font-size: 16px;">🔄 Retry</button>
            </div>
        `;
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
    // Top-level safety: ensure the app never hangs on the splash screen
    App.init().catch(err => {
        console.error('🔴 Fatal init error:', err);
        // Ensure splash is dismissed even on catastrophic failure
        const splash = document.getElementById('splash-screen');
        if (splash) splash.remove();
        // Show error to user
        const container = document.getElementById('main-content');
        if (container) {
            container.innerHTML = `
                <div style="padding: 40px 20px; text-align: center;">
                    <div style="font-size: 64px; margin-bottom: 16px;">⚠️</div>
                    <h2 style="color: #e74c3c; font-size: 22px; margin-bottom: 12px;">App Failed to Start</h2>
                    <p style="color: #94a3b8; font-size: 14px; max-width: 400px; margin: 0 auto 20px;">${err.message || err}</p>
                    <button onclick="window.location.reload()" style="padding: 12px 32px; font-size: 16px; background: #dcba69; color: #1a1a2e; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">🔄 Retry</button>
                </div>
            `;
        }
    });

    // Fail-safe: if the splash screen is still visible after 20 seconds,
    // force-remove it and show an error. This protects against any edge case
    // where init() hangs on a promise that never resolves.
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            console.error('🔴 Splash screen fail-safe triggered after 20s');
            splash.remove();
            const container = document.getElementById('main-content');
            if (container && !container.innerHTML.trim()) {
                container.innerHTML = `
                    <div style="padding: 40px 20px; text-align: center;">
                        <div style="font-size: 64px; margin-bottom: 16px;">🔒</div>
                        <h2 style="color: #e74c3c; font-size: 22px; margin-bottom: 12px;">Connection Timed Out</h2>
                        <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; max-width: 400px; margin: 0 auto 20px;">
                            The app could not connect to the database. This usually means Firebase Firestore security rules have <strong>expired</strong>.<br><br>
                            An admin needs to update the rules in the <a href="https://console.firebase.google.com/project/whiterockjudo-b45c0/firestore/rules" target="_blank" style="color: #dcba69;">Firebase Console</a>.
                        </p>
                        <button onclick="window.location.reload()" style="padding: 12px 32px; font-size: 16px; background: #dcba69; color: #1a1a2e; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">🔄 Retry</button>
                    </div>
                `;
            }
        }
    }, 20000);
});
