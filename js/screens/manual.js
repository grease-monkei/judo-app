/**
 * Manual Sign-In Screen — Bulk manual entry for senseis
 */

const ManualScreen = (() => {
    let selectedDate = Utils.todayStr();
    let selectedClassId = '';
    let pendingMembers = []; // Array of member objects
    let searchQuery = '';

    async function render() {
        const container = document.getElementById('main-content');
        
        // Update header
        const headerLocationName = document.getElementById('header-location-name');
        if (headerLocationName) {
            headerLocationName.textContent = 'Manual Entry (Sensei)';
        }

        const schedules = await DB.Schedules.getAll();
        const locations = await DB.Locations.getAll();
        const locMap = {};
        locations.forEach(l => locMap[l.id] = l.name);

        // Filter schedules by the selected date's day of week
        const dateObj = new Date(selectedDate + 'T12:00:00'); // Use noon to avoid TZ shift
        const dayOfWeek = dateObj.getDay();
        const filteredSchedules = schedules.filter(s => s.dayOfWeek === dayOfWeek && s.isActive !== false);

        // Sort filtered schedules by time
        filteredSchedules.sort((a, b) => a.startTime.localeCompare(b.startTime));

        // If the selected class isn't in the new list, clear it
        if (selectedClassId && !filteredSchedules.find(s => s.id === selectedClassId)) {
            selectedClassId = '';
        }

        container.innerHTML = `
            <div class="screen" id="manual-screen">
                <div class="manual-config-card card mb-24">
                    <div class="form-group">
                        <label class="form-label">Step 1: Pick Date</label>
                        <input type="date" class="form-input" id="manual-date" value="${selectedDate}">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Step 2: Pick Class (${Utils.getDayName(dayOfWeek)})</label>
                        <select class="form-select" id="manual-class-select">
                            <option value="">-- Choose Class --</option>
                            ${filteredSchedules.map(s => `
                                <option value="${s.id}" ${selectedClassId === s.id ? 'selected' : ''}>
                                    ${Utils.escapeHTML(s.name)} (${Utils.formatTime(s.startTime)}) - ${Utils.escapeHTML(locMap[s.locationId] || 'Unknown')}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <div class="manual-search-section mb-24">
                    <label class="form-label">Step 3: Search & Add Members</label>
                    <div class="search-container" style="margin-bottom: 12px;">
                        <input 
                            type="text" 
                            class="search-input" 
                            id="manual-member-search" 
                            placeholder="Type name to add to list..."
                            value="${Utils.escapeHTML(searchQuery)}"
                            autocomplete="off"
                        >
                    </div>
                    <div id="manual-search-results" class="manual-results-dropdown hidden"></div>
                </div>

                <div class="manual-bucket-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <label class="form-label" style="margin-bottom:0;">Currently Picked (${pendingMembers.length})</label>
                        ${pendingMembers.length > 0 ? `<button class="btn-link" onclick="ManualScreen.clearBucket()" style="color: var(--accent-red); font-size: 12px;">Clear All</button>` : ''}
                    </div>
                    
                    <div class="manual-bucket-list" id="manual-bucket-list">
                        ${pendingMembers.length === 0 ? `
                            <div class="empty-state-small">
                                <p>No members added yet. Search above to start your list.</p>
                            </div>
                        ` : pendingMembers.map(m => `
                            <div class="bucket-item anim-pop-in">
                                <span class="bucket-item-name">${Utils.escapeHTML(m.firstName)} ${Utils.escapeHTML(m.lastName)}</span>
                                <button class="bucket-item-remove" onclick="ManualScreen.removeFromBucket('${m.id}')">✕</button>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="manual-actions" style="margin-top: 32px;">
                    <button class="btn btn-gold btn-lg w-100" id="manual-submit-btn" ${pendingMembers.length === 0 || !selectedClassId ? 'disabled' : ''} style="display: flex; justify-content: center; align-items: center; gap: 8px;">
                        Confirm Sign-In for ${pendingMembers.length} Student${pendingMembers.length === 1 ? '' : 's'}
                    </button>
                </div>
            </div>
        `;

        // Wire up listeners
        document.getElementById('manual-date').addEventListener('change', (e) => {
            selectedDate = e.target.value;
            render();
        });

        document.getElementById('manual-class-select').addEventListener('change', (e) => {
            selectedClassId = e.target.value;
            render(); // Refresh specifically to toggle button state
        });

        const searchInput = document.getElementById('manual-member-search');
        searchInput.addEventListener('input', Utils.debounce(e => {
            searchQuery = e.target.value;
            handleSearch();
        }, 150));

        // Focus search after render if we were searching
        if (searchQuery) {
            searchInput.focus();
            searchInput.setSelectionRange(searchQuery.length, searchQuery.length);
        }

        document.getElementById('manual-submit-btn').addEventListener('click', bulkSubmit);
    }

    async function handleSearch() {
        const resultsContainer = document.getElementById('manual-search-results');
        if (!searchQuery.trim()) {
            resultsContainer.innerHTML = '';
            resultsContainer.classList.add('hidden');
            return;
        }

        const results = await DB.Members.search(searchQuery);
        
        // Fetch current attendance for this class/date to prevent duplicates
        const existingAttendance = selectedClassId ? await DB.Attendance.getTodayForClass(selectedClassId, selectedDate) : [];
        const alreadySignedIds = new Set(existingAttendance.map(a => a.memberId));

        // Filter out those already in the "Pending" bucket
        const filtered = results.filter(r => !pendingMembers.some(p => p.id === r.id));

        if (filtered.length === 0) {
            resultsContainer.innerHTML = '<div style="padding: 12px; font-size: 13px; color: var(--text-muted);">No matching members available</div>';
        } else {
            resultsContainer.innerHTML = filtered.slice(0, 5).map(m => {
                const isAlreadyPresent = alreadySignedIds.has(m.id);
                return `
                    <div class="manual-result-item ${isAlreadyPresent ? 'result-disabled' : ''}" 
                         ${isAlreadyPresent ? '' : `onclick="ManualScreen.addToBucket('${m.id}')"`}>
                        <div style="display: flex; flex-direction: column;">
                            <span>${Utils.escapeHTML(m.firstName)} ${Utils.escapeHTML(m.lastName)}</span>
                            ${isAlreadyPresent ? '<span style="color: var(--accent-green); font-size: 10px; font-weight: 700;">✓ Already Signed In</span>' : ''}
                        </div>
                        ${isAlreadyPresent ? '' : '<span class="plus-icon">+</span>'}
                    </div>
                `;
            }).join('');
        }
        resultsContainer.classList.remove('hidden');
    }

    async function addToBucket(memberId) {
        const member = await DB.Members.getById(memberId);
        if (member && !pendingMembers.some(p => p.id === member.id)) {
            pendingMembers.push(member);
            searchQuery = ''; // Clear search after adding
            render();
        }
    }

    function removeFromBucket(memberId) {
        pendingMembers = pendingMembers.filter(p => p.id !== memberId);
        render();
    }

    function clearBucket() {
        if (confirm('Clear the entire list?')) {
            pendingMembers = [];
            render();
        }
    }

    async function bulkSubmit() {
        if (pendingMembers.length === 0 || !selectedClassId) return;

        const schedule = await DB.Schedules.getById(selectedClassId);
        if (!schedule) return;

        const location = schedule.locationId ? await DB.Locations.getById(schedule.locationId) : null;
        const submitBtn = document.getElementById('manual-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-mini"></span> Saving...';

        try {
            // Process all sign-ins
            for (const member of pendingMembers) {
                await DB.Attendance.add({
                    memberId: member.id,
                    memberName: `${member.firstName} ${member.lastName}`,
                    className: schedule.name,
                    classScheduleId: schedule.id,
                    locationId: schedule.locationId || '',
                    locationName: location ? location.name : '',
                    date: selectedDate,
                    signInTime: new Date().toISOString()
                });
                await DB.Members.incrementAttendance(member.id);
            }

            alert(`Successfully signed in ${pendingMembers.length} members!`);
            
            // Success reset
            pendingMembers = [];
            searchQuery = '';
            render();
        } catch (err) {
            console.error('Manual sign-in error:', err);
            alert('Something went wrong during bulk sign-in.');
            submitBtn.disabled = false;
            submitBtn.textContent = `Confirm Sign-In for ${pendingMembers.length} Students`;
        }
    }

    return {
        render,
        addToBucket,
        removeFromBucket,
        clearBucket
    };
})();
