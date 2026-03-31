/**
 * Settings Screen — PIN-protected admin settings
 */

const SettingsScreen = (() => {
    let isAuthenticated = false;

    // FIX: Track when the user last authenticated so we can expire the session.
    // After 10 minutes of inactivity the next visit to Settings will re-prompt.
    let authTimestamp = null;
    const AUTH_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

    function isAuthValid() {
        if (!isAuthenticated) return false;
        if (!authTimestamp) return false;
        return (Date.now() - authTimestamp) < AUTH_TIMEOUT_MS;
    }

    function setAuthenticated(value) {
        isAuthenticated = value;
        authTimestamp = value ? Date.now() : null;
    }

    // Called whenever the user interacts with Settings to refresh the idle timer
    function touchAuth() {
        if (isAuthenticated) {
            authTimestamp = Date.now();
        }
    }


    async function render() {
        const container = document.getElementById('main-content');
        const hasPin = await DB.Settings.getPin();

        // FIX: Use isAuthValid() instead of bare isAuthenticated to enforce the timeout
        if (hasPin && !isAuthValid()) {
            setAuthenticated(false);
            showPinModal(() => {
                setAuthenticated(true);
                render();
            });
            // Show locked state while modal is open
            container.innerHTML = `
                <div class="screen">
                    <div class="empty-state">
                        <span class="empty-state-icon">🔒</span>
                        <h3 class="empty-state-title">Settings Locked</h3>
                        <p class="empty-state-desc">Enter your PIN to access settings</p>
                        <button class="btn btn-gold mt-16" onclick="SettingsScreen.promptPin()">Enter PIN</button>
                    </div>
                </div>
            `;
            return;
        }

        // Refresh idle timer on each full render
        touchAuth();

        const currentLocId = await DB.Settings.getCurrentLocationId();
        const locations = await DB.Locations.getAll();
        const schedules = await DB.Schedules.getAll();
        const currentLoc = currentLocId ? locations.find(l => String(l.id) === String(currentLocId)) : null;
        const appPassword = await DB.Settings.get('appPassword');

        container.innerHTML = `
            <div class="screen" id="settings-screen">
                <!-- Location Selection -->
                <div class="settings-section">
                    <div class="settings-section-title">📍 Current Location</div>
                    <div class="card">
                        <div class="form-group" style="margin-bottom: 0;">
                            <select class="form-select" id="settings-location-select">
                                <option value="all" ${String(currentLocId) === 'all' || !currentLocId ? 'selected' : ''}>All Locations (Default)</option>
                                ${locations.map(l => `
                                    <option value="${l.id}" ${String(l.id) === String(currentLocId) ? 'selected' : ''}>${Utils.escapeHTML(l.name)}</option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Locations Management -->
                <div class="settings-section">
                    <div class="settings-section-title" style="display: flex; justify-content: space-between; align-items: center;">
                        🏢 Locations
                        <button class="btn btn-sm btn-secondary" id="add-location-btn">+ Add</button>
                    </div>
                    <div id="locations-list">
                        ${locations.length === 0 ? `
                            <div class="empty-state" style="padding: 20px;">
                                <p class="empty-state-desc">No locations yet. Add one to get started.</p>
                            </div>
                        ` : locations.map(loc => `
                            <div class="schedule-item">
                                <div class="schedule-info">
                                    <span class="schedule-name">${Utils.escapeHTML(loc.name)}</span>
                                    <span class="schedule-detail">${Utils.escapeHTML(loc.address || 'No address')}</span>
                                </div>
                                <div class="schedule-actions">
                                    <button class="btn-icon" onclick="SettingsScreen.editLocation('${loc.id}')" title="Edit">✏️</button>
                                    <button class="btn-icon" onclick="SettingsScreen.deleteLocation('${loc.id}')" title="Delete" style="color: var(--accent-red);">🗑</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Class Schedules -->
                <div class="settings-section">
                    <div class="settings-section-title" style="display: flex; justify-content: space-between; align-items: center;">
                        📅 Class Schedules
                        <button class="btn btn-sm btn-secondary" id="add-schedule-btn">+ Add</button>
                    </div>
                    <div id="schedules-list">
                        ${schedules.length === 0 ? `
                            <div class="empty-state" style="padding: 20px;">
                                <p class="empty-state-desc">No class schedules yet. Add a location first, then add classes.</p>
                            </div>
                        ` : renderSchedulesList(schedules, locations)}
                    </div>
                </div>

                <!-- PIN Settings -->
                <div class="settings-section">
                    <div class="settings-section-title">🔐 Security</div>
                    <div class="settings-item" onclick="SettingsScreen.changePin()">
                        <div class="settings-item-left">
                            <span class="settings-item-title">${hasPin ? 'Change PIN' : 'Set PIN'}</span>
                            <span class="settings-item-subtitle">${hasPin ? 'Update your 4-digit settings PIN' : 'Protect settings with a PIN'}</span>
                        </div>
                        <div class="settings-item-right">›</div>
                    </div>
                    ${hasPin ? `
                        <div class="settings-item" onclick="SettingsScreen.removePin()">
                            <div class="settings-item-left">
                                <span class="settings-item-title" style="color: var(--accent-red);">Remove PIN</span>
                            </div>
                        </div>
                    ` : ''}
                    <div class="settings-item" onclick="SettingsScreen.changeAppPassword()">
                        <div class="settings-item-left">
                            <span class="settings-item-title">${appPassword ? 'Change App Password' : 'Set App Password'}</span>
                            <span class="settings-item-subtitle">Full-screen lock when the app opens</span>
                        </div>
                        <div class="settings-item-right">›</div>
                    </div>
                    ${appPassword ? `
                        <div class="settings-item" onclick="SettingsScreen.removeAppPassword()">
                            <div class="settings-item-left">
                                <span class="settings-item-title" style="color: var(--accent-red);">Remove App Password</span>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Data Management -->
                <div class="settings-section">
                    <div class="settings-section-title">💾 Data</div>
                    <div class="settings-item" onclick="SettingsScreen.exportData()">
                        <div class="settings-item-left">
                            <span class="settings-item-title">Export All Data</span>
                            <span class="settings-item-subtitle">Download a JSON backup of everything</span>
                        </div>
                        <div class="settings-item-right">›</div>
                    </div>
                    <div class="settings-item">
                        <div class="settings-item-left">
                            <span class="settings-item-title">Import Data</span>
                            <span class="settings-item-subtitle">Restore from a JSON backup</span>
                        </div>
                        <label style="cursor: pointer;">
                            <span class="btn btn-secondary btn-sm">Choose File</span>
                            <input type="file" accept=".json" style="display: none;" onchange="SettingsScreen.importData(event)">
                        </label>
                    </div>
                </div>
            </div>
        `;

        // Wire up location select change
        document.getElementById('settings-location-select')?.addEventListener('change', async (e) => {
            touchAuth();
            await DB.Settings.setCurrentLocationId(e.target.value);
            // Update header
            const locName = e.target.options[e.target.selectedIndex].text;
            const headerEl = document.getElementById('header-location-name');
            if (headerEl) headerEl.textContent = locName === 'All Locations (Default)' ? 'All Locations' : locName;
        });

        document.getElementById('add-location-btn')?.addEventListener('click', () => {
            touchAuth();
            showLocationForm();
        });

        document.getElementById('add-schedule-btn')?.addEventListener('click', () => {
            touchAuth();
            showScheduleForm(locations);
        });
    }


    function renderSchedulesList(schedules, locations) {
        const locationMap = {};
        for (const l of locations) locationMap[String(l.id)] = l.name;

        const byDay = {};
        for (const s of schedules) {
            const day = s.dayOfWeek;
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push(s);
        }

        const displayOrder = [1, 2, 3, 4, 5, 6, 0];
        let html = '';

        for (const dayIndex of displayOrder) {
            if (!byDay[dayIndex] || byDay[dayIndex].length === 0) continue;
            const sorted = byDay[dayIndex].sort((a, b) => {
                const [aH, aM] = a.startTime.split(':').map(Number);
                const [bH, bM] = b.startTime.split(':').map(Number);
                return (aH * 60 + aM) - (bH * 60 + bM);
            });

            html += `<div style="margin-bottom: 8px; font-size: 12px; font-weight: 700; color: var(--accent-gold); text-transform: uppercase; letter-spacing: 1px; padding: 4px 0;">${Utils.DAY_NAMES[dayIndex]}</div>`;

            for (const s of sorted) {
                html += `
                    <div class="schedule-item">
                        <div class="schedule-info">
                            <span class="schedule-name">${Utils.escapeHTML(s.name)}</span>
                            <span class="schedule-detail">${Utils.formatTime(s.startTime)} – ${Utils.formatTime(s.endTime)} · ${Utils.escapeHTML(locationMap[String(s.locationId)] || 'Unknown')}</span>
                        </div>
                        <div class="schedule-actions">
                            <button class="btn-icon" onclick="SettingsScreen.editSchedule('${s.id}')" title="Edit">✏️</button>
                            <button class="btn-icon" onclick="SettingsScreen.deleteSchedule('${s.id}')" title="Delete" style="color: var(--accent-red);">🗑</button>
                        </div>
                    </div>
                `;
            }
        }

        return html;
    }


    // ===== PIN Modal =====
    function showPinModal(onSuccess, onCancel) {
        const modal = document.getElementById('pin-modal');
        const display = document.getElementById('pin-display');
        const errorEl = document.getElementById('pin-error');
        const cancelBtn = document.getElementById('pin-cancel-btn');

        if (!modal) return;

        let entered = '';

        function updateDisplay() {
            const dots = display.querySelectorAll('.pin-dot');
            dots.forEach((dot, i) => {
                dot.classList.toggle('filled', i < entered.length);
            });
        }

        function resetError() {
            if (errorEl) errorEl.classList.add('hidden');
        }

        async function handleKey(key) {
            if (key === 'clear') {
                entered = '';
            } else if (key === 'back') {
                entered = entered.slice(0, -1);
            } else if (entered.length < 4) {
                entered += key;
            }

            updateDisplay();
            resetError();

            if (entered.length === 4) {
                const storedPin = await DB.Settings.getPin();
                if (entered === storedPin) {
                    modal.classList.add('hidden');
                    cleanupListeners();
                    onSuccess();
                } else {
                    entered = '';
                    updateDisplay();
                    if (errorEl) errorEl.classList.remove('hidden');
                }
            }
        }

        function onPadClick(e) {
            const key = e.target.closest('[data-key]')?.dataset.key;
            if (key) handleKey(key);
        }

        function onCancelClick() {
            modal.classList.add('hidden');
            cleanupListeners();
            if (onCancel) onCancel();
        }

        function cleanupListeners() {
            modal.querySelector('.pin-pad')?.removeEventListener('click', onPadClick);
            cancelBtn?.removeEventListener('click', onCancelClick);
        }

        modal.classList.remove('hidden');
        entered = '';
        updateDisplay();
        resetError();

        modal.querySelector('.pin-pad')?.addEventListener('click', onPadClick);
        cancelBtn?.addEventListener('click', onCancelClick);
    }


    function promptPin() {
        showPinModal(() => {
            setAuthenticated(true);
            render();
        });
    }


    async function checkAndPromptPin(onSuccess, onCancel) {
        const hasPin = await DB.Settings.getPin();
        // FIX: Use isAuthValid() to respect the session timeout
        if (!hasPin || isAuthValid()) {
            touchAuth();
            onSuccess();
        } else {
            showPinModal(() => {
                setAuthenticated(true);
                onSuccess();
            }, onCancel);
        }
    }


    async function changePin() {
        touchAuth();
        // Simple two-step PIN change: enter new PIN, confirm it
        const newPin = prompt('Enter a new 4-digit PIN (leave blank to cancel):');
        if (!newPin) return;
        if (!/^\d{4}$/.test(newPin)) {
            alert('PIN must be exactly 4 digits.');
            return;
        }
        const confirm = prompt('Confirm your new PIN:');
        if (newPin !== confirm) {
            alert('PINs do not match. Please try again.');
            return;
        }
        await DB.Settings.setPin(newPin);
        alert('PIN updated successfully.');
        await render();
    }


    async function removePin() {
        touchAuth();
        if (!confirm('Remove the settings PIN? Settings will be accessible to anyone.')) return;
        await DB.Settings.remove('pin');
        setAuthenticated(false);
        await render();
    }


    async function changeAppPassword() {
        touchAuth();
        const newPw = prompt('Enter a new app password (leave blank to cancel):');
        if (!newPw) return;
        await DB.Settings.set('appPassword', newPw);
        alert('App password updated. It will take effect on the next app launch.');
        await render();
    }


    async function removeAppPassword() {
        touchAuth();
        if (!confirm('Remove the app password?')) return;
        await DB.Settings.remove('appPassword');
        await render();
    }


    // ===== Location CRUD =====
    function showLocationForm(existingLoc = null) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card" style="max-width: 400px; width: 95vw;">
                <h2 style="font-size: 18px; margin-bottom: 16px;">${existingLoc ? 'Edit Location' : 'Add Location'}</h2>
                <div class="form-group">
                    <label class="form-label">Name *</label>
                    <input type="text" class="form-input" id="loc-name" value="${Utils.escapeHTML(existingLoc?.name || '')}" placeholder="e.g. Gateway Dojo">
                </div>
                <div class="form-group">
                    <label class="form-label">Address</label>
                    <input type="text" class="form-input" id="loc-address" value="${Utils.escapeHTML(existingLoc?.address || '')}" placeholder="Optional">
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button class="btn btn-gold" style="flex:1;" onclick="SettingsScreen.saveLocation('${existingLoc?.id || ''}')">Save</button>
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        setTimeout(() => document.getElementById('loc-name')?.focus(), 100);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    }


    async function saveLocation(locId) {
        const name = document.getElementById('loc-name')?.value.trim();
        const address = document.getElementById('loc-address')?.value.trim();
        if (!name) { alert('Location name is required.'); return; }

        if (locId) {
            const existing = await DB.Locations.getById(locId);
            await DB.Locations.update({ ...existing, name, address });
        } else {
            await DB.Locations.add({ name, address });
        }

        document.querySelector('.modal-overlay')?.remove();
        touchAuth();
        await render();
    }


    async function editLocation(locId) {
        touchAuth();
        const loc = await DB.Locations.getById(locId);
        if (loc) showLocationForm(loc);
    }


    async function deleteLocation(locId) {
        touchAuth();
        if (!confirm('Delete this location? Classes assigned to it will also be removed.')) return;
        await DB.Locations.remove(locId);
        await render();
    }


    // ===== Schedule CRUD =====
    async function showScheduleForm(locations, existingSched = null) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card" style="max-width: 420px; width: 95vw;">
                <h2 style="font-size: 18px; margin-bottom: 16px;">${existingSched ? 'Edit Class' : 'Add Class'}</h2>
                <div class="form-group">
                    <label class="form-label">Class Name *</label>
                    <input type="text" class="form-input" id="sched-name" value="${Utils.escapeHTML(existingSched?.name || '')}" placeholder="e.g. Kids Beginner">
                </div>
                <div class="form-group">
                    <label class="form-label">Location *</label>
                    <select class="form-select" id="sched-location">
                        ${locations.map(l => `<option value="${l.id}" ${existingSched?.locationId === l.id ? 'selected' : ''}>${Utils.escapeHTML(l.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Day of Week *</label>
                    <select class="form-select" id="sched-day">
                        ${Utils.DAY_NAMES.map((d, i) => `<option value="${i}" ${existingSched?.dayOfWeek === i ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Start Time *</label>
                    <input type="time" class="form-input" id="sched-start" value="${existingSched?.startTime || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">End Time *</label>
                    <input type="time" class="form-input" id="sched-end" value="${existingSched?.endTime || ''}">
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button class="btn btn-gold" style="flex:1;" onclick="SettingsScreen.saveSchedule('${existingSched?.id || ''}')">Save</button>
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    }


    async function saveSchedule(schedId) {
        const name = document.getElementById('sched-name')?.value.trim();
        const locationId = document.getElementById('sched-location')?.value;
        const dayOfWeek = parseInt(document.getElementById('sched-day')?.value);
        const startTime = document.getElementById('sched-start')?.value;
        const endTime = document.getElementById('sched-end')?.value;

        if (!name || !locationId || !startTime || !endTime) {
            alert('Please fill in all required fields.');
            return;
        }

        const location = await DB.Locations.getById(locationId);
        const data = { name, locationId, locationName: location?.name || '', dayOfWeek, startTime, endTime, isActive: true };

        if (schedId) {
            const existing = await DB.Schedules.getById(schedId);
            await DB.Schedules.update({ ...existing, ...data });
        } else {
            await DB.Schedules.add(data);
        }

        document.querySelector('.modal-overlay')?.remove();
        touchAuth();
        await render();
    }


    async function editSchedule(schedId) {
        touchAuth();
        const locations = await DB.Locations.getAll();
        const sched = await DB.Schedules.getById(schedId);
        if (sched) showScheduleForm(locations, sched);
    }


    async function deleteSchedule(schedId) {
        touchAuth();
        if (!confirm('Delete this class schedule?')) return;
        await DB.Schedules.remove(schedId);
        await render();
    }


    // ===== Data Export / Import =====
    async function exportData() {
        touchAuth();
        const data = await DB.DataIO.exportAll();
        Utils.downloadJSON(data, `judo-backup-${Utils.todayStr()}.json`);
    }


    async function importData(event) {
        touchAuth();
        const file = event.target.files[0];
        if (!file) return;

        if (!confirm('This will REPLACE all current data with the backup. Are you sure?')) {
            event.target.value = '';
            return;
        }

        try {
            const text = await Utils.readFileAsText(file);
            const data = JSON.parse(text);
            await DB.DataIO.importAll(data);
            alert('Data imported successfully. The app will now reload.');
            window.location.reload();
        } catch (err) {
            alert('Error importing data: ' + err.message);
        }

        event.target.value = '';
    }


    return {
        render,
        promptPin,
        checkAndPromptPin,
        changePin,
        removePin,
        changeAppPassword,
        removeAppPassword,
        showLocationForm,
        saveLocation,
        editLocation,
        deleteLocation,
        showScheduleForm,
        saveSchedule,
        editSchedule,
        deleteSchedule,
        exportData,
        importData
    };
})();
