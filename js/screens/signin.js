/**
 * Sign-In Screen — Main kiosk view for member sign-in
 * Supports navigating back up to 7 days for retroactive sign-ins.
 */

const SignInScreen = (() => {
    let pendingMember = null;
    let lastSignInRecord = null;
    let lastSignInTimeout = null;

    // Date offset: 0 = today, -1 = yesterday, ... -7 = 7 days ago
    let _dayOffset = 0;

    // Cache attendance per-date string
    let _attendanceCache = null;
    let _cacheDate = null;

    let isProcessing = false; // Prevent double-clicks

    /**
     * Get the Date object for the currently selected day
     */
    function getSelectedDate() {
        const d = new Date();
        d.setDate(d.getDate() + _dayOffset);
        return d;
    }

    /**
     * Get the YYYY-MM-DD string for the selected day
     */
    function getSelectedDateStr() {
        return Utils.dateStr(getSelectedDate());
    }

    /**
     * Is the user viewing today?
     */
    function isToday() {
        return _dayOffset === 0;
    }

    async function getDateAttendance() {
        const dateStr = getSelectedDateStr();
        if (_cacheDate !== dateStr) {
            _attendanceCache = null;
            _cacheDate = dateStr;
        }
        if (_attendanceCache) return _attendanceCache;
        _attendanceCache = await DB.Attendance.getByDate(dateStr);
        return _attendanceCache;
    }

    function invalidateAttendanceCache() {
        _attendanceCache = null;
    }


    async function render() {
        const container = document.getElementById('main-content');

        try {
            const rawSchedules = await DB.Schedules.getAll();
            const allLocations = await DB.Locations.getAll();
            const locMap = {};
            allLocations.forEach(l => locMap[l.id] = l.name);

            // Enrich schedules with location names for the UI
            const allSchedules = rawSchedules.map(s => ({
                ...s,
                locationName: locMap[s.locationId] || ''
            }));

            const selectedDate = getSelectedDate();
            const now = new Date();

            // Get classes for the selected date's day-of-week
            const dayClasses = Utils.getTodayClasses(allSchedules, null, selectedDate);

            // Only compute current/next class when viewing today
            let currentClass = null;
            let nextClass = null;
            if (isToday()) {
                const nowMins = now.getHours() * 60 + now.getMinutes();
                currentClass = Utils.detectCurrentClass(allSchedules, now);
                nextClass = Utils.detectNextClass(allSchedules, currentClass, now);
                if (nextClass) {
                    const [nH, nM] = nextClass.startTime.split(':').map(Number);
                    if ((nH * 60 + nM) - nowMins > 120) {
                        nextClass = null;
                    }
                }
            }

            const isHighlighting = !!currentClass || !!nextClass;

            const dateAttendance = await getDateAttendance();
            const dateCount = dateAttendance.length;

            if (pendingMember) {
                await renderMemberSelected(container, pendingMember, dayClasses, isHighlighting, currentClass, nextClass, dateAttendance);
            } else {
                await renderSearchView(container, dayClasses, isHighlighting, currentClass, nextClass, dateCount);
            }
        } catch (err) {
            console.error('SignInScreen Render Error:', err);
            container.innerHTML = `
                <div style="padding: 40px; text-align: center; color: var(--accent-red);">
                    <h3>Unable to load Sign-In screen</h3>
                    <p style="font-size: 14px; opacity: 0.8; margin-top: 10px;">${Utils.escapeHTML(err.message)}</p>
                    <button class="btn btn-gold btn-sm" style="margin-top: 20px;" onclick="App.navigate('signin')">Try Again</button>
                </div>
            `;
        }
    }


    /**
     * Build the date navigation bar HTML
     */
    function renderDateNav() {
        const selectedDate = getSelectedDate();
        const dayName = Utils.getDayName(selectedDate.getDay());
        const dateStr = getSelectedDateStr();
        const canGoBack = _dayOffset > -7;
        const canGoForward = _dayOffset < 0;

        // Format display: "Today" or "Mon, Apr 7"
        let displayLabel;
        if (isToday()) {
            displayLabel = 'Today';
        } else if (_dayOffset === -1) {
            displayLabel = 'Yesterday';
        } else {
            displayLabel = selectedDate.toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });
        }

        return `
            <div class="date-nav" id="date-nav">
                <button class="date-nav-arrow ${canGoBack ? '' : 'date-nav-arrow-disabled'}" id="date-nav-prev" title="Previous day">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <div class="date-nav-label">
                    <span class="date-nav-day">${Utils.escapeHTML(displayLabel)}</span>
                    ${!isToday() ? `<span class="date-nav-full">${Utils.escapeHTML(dayName)} · ${Utils.formatDate(dateStr)}</span>` : `<span class="date-nav-full">${Utils.escapeHTML(dayName)}, ${Utils.formatDate(dateStr)}</span>`}
                </div>
                <button class="date-nav-arrow ${canGoForward ? '' : 'date-nav-arrow-disabled'}" id="date-nav-next" title="Next day">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
            </div>
            ${!isToday() ? `<div class="date-nav-past-banner">📋 Retroactive sign-in — viewing a past day</div>` : ''}
        `;
    }

    /**
     * Wire up the date navigation arrow clicks
     */
    function wireUpDateNav() {
        const prevBtn = document.getElementById('date-nav-prev');
        const nextBtn = document.getElementById('date-nav-next');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (_dayOffset > -7) {
                    _dayOffset--;
                    pendingMember = null;
                    lastSignInRecord = null;
                    invalidateAttendanceCache();
                    render();
                }
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (_dayOffset < 0) {
                    _dayOffset++;
                    pendingMember = null;
                    lastSignInRecord = null;
                    invalidateAttendanceCache();
                    render();
                }
            });
        }
    }


    async function renderSearchView(container, dayClasses, isHighlighting, currentClass, nextClass, dateCount) {
        const dateLabel = isToday() ? "Today's Sign-Ins" : `Sign-Ins for ${getSelectedDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

        container.innerHTML = `
            <div class="screen" id="signin-screen">
                ${renderDateNav()}

                <div class="signin-stats" style="grid-template-columns: 1fr;">
                    <div class="stat-card">
                        <div class="stat-number">${dateCount}</div>
                        <div class="stat-label">${Utils.escapeHTML(dateLabel)}</div>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 12px;">
                    <input
                        type="text"
                        id="signin-search"
                        class="form-input"
                        placeholder="Search by name…"
                        autocomplete="off"
                        autocorrect="off"
                        autocapitalize="words"
                        style="font-size: 18px; padding: 14px 16px;"
                    >
                </div>

                <div id="search-results"></div>

                <div style="margin-top: 16px;">
                    <button class="btn btn-gold btn-sm" id="signin-add-member-btn" style="width: 100%; padding: 12px; border-radius: var(--radius-lg); font-weight: 700;">
                        + Create New Member
                    </button>
                </div>

                <div style="margin-top: 20px;">
                    ${renderClassCards(dayClasses, currentClass, nextClass, isHighlighting)}
                </div>
            </div>
        </div>
        `;

        wireUpDateNav();

        // Wire up Create New Member button
        const addMemberBtn = document.getElementById('signin-add-member-btn');
        if (addMemberBtn) {
            addMemberBtn.addEventListener('click', () => {
                MembersScreen.showMemberForm(null, (newMember) => {
                    if (newMember) selectPendingMember(newMember.id);
                });
            });
        }

        // Wire up search with debounce
        const searchInput = document.getElementById('signin-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce(handleSearch, 250));
            searchInput.focus();
        }

        // Wire up class card click delegation
        const screen = document.getElementById('signin-screen');
        if (screen) {
            screen.addEventListener('click', e => {
                const card = e.target.closest('.class-card[data-class-id]');
                if (!card) return;
                const classId = card.dataset.classId;
                if (pendingMember && classId) {
                    executeSignIn(pendingMember.id, classId);
                }
            });
        }
    }


    async function renderMemberSelected(container, member, dayClasses, isHighlighting, currentClass, nextClass, dateAttendance) {
        const memberDateRecords = dateAttendance.filter(a => a.memberId === member.id);
        const signedInClassIds = new Set(memberDateRecords.map(a => a.classScheduleId));

        container.innerHTML = `
            <div class="screen" id="signin-screen">
                ${renderDateNav()}

                <div class="member-selected-header" style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px; padding: 16px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid rgba(220,186,105,0.3);">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 20px; font-weight: 700; color: var(--text-primary);">${Utils.escapeHTML(member.firstName)} ${Utils.escapeHTML(member.lastName)}</div>
                        <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">${member.belt ? Utils.escapeHTML(member.belt) + ' Belt' : 'Select a class below'}</div>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="SignInScreen.cancelPending()">Cancel</button>
                </div>

                <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 12px; text-align: center;">Select a class to sign in:</p>

                ${renderClassCards(dayClasses, currentClass, nextClass, isHighlighting, signedInClassIds)}
            </div>
        `;

        wireUpDateNav();

        // Wire up class card click delegation
        const screen = document.getElementById('signin-screen');
        if (screen) {
            screen.addEventListener('click', e => {
                const card = e.target.closest('.class-card[data-class-id]');
                if (!card) return;
                const classId = card.dataset.classId;
                if (pendingMember && classId && !signedInClassIds.has(classId)) {
                    executeSignIn(pendingMember.id, classId);
                }
            });
        }
    }


    function renderClassCards(dayClasses, currentClass, nextClass, isHighlighting, signedInClassIds = new Set()) {
        if (!dayClasses || dayClasses.length === 0) {
            return `
                <div class="class-banner">
                    <div class="class-banner-info">
                        <span class="class-banner-label">${isToday() ? 'Today' : Utils.getDayName(getSelectedDate().getDay())}</span>
                        <span class="class-banner-name">No Classes Scheduled</span>
                        <span class="class-banner-time">No classes found for this day</span>
                    </div>
                </div>
            `;
        }

        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const viewingToday = isToday();

        let html = '<div class="class-cards-list">';

        dayClasses.forEach(c => {
            const isCurrent = currentClass && currentClass.id === c.id;
            const isNext = nextClass && nextClass.id === c.id;
            const isLastSignedIn = lastSignInRecord && lastSignInRecord.classScheduleId === c.id;
            const isAlreadySignedIn = signedInClassIds.has(c.id);

            let badgeHtml = '';
            let styleClass = '';
            let innerHtml = '';

            if (isLastSignedIn) {
                styleClass = 'class-card-now';
                badgeHtml = '<div class="class-card-badge" style="color: var(--accent-green); font-weight: 800;">✅ SIGNED IN</div>';
                innerHtml = `
                    <div class="class-card-name" style="color: var(--accent-green); font-size: 18px;">
                        ${Utils.escapeHTML(lastSignInRecord.memberName.split(' ')[0])} checked into <br>
                        <span style="font-size: 14px; opacity: 0.9;">${Utils.escapeHTML(lastSignInRecord.className)}</span>
                    </div>
                    <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
                        <button class="class-toast-undo-btn" style="padding: 8px 16px; font-size: 11px;" onclick="event.stopPropagation(); SignInScreen.undoSignIn()">UNDO</button>
                    </div>
                `;
            } else if (isAlreadySignedIn) {
                styleClass = 'class-card-past';
                badgeHtml = '<div class="class-card-badge" style="color: var(--accent-green);">✅ SIGNED IN</div>';
                innerHtml = `
                    <div class="class-card-name">${Utils.escapeHTML(c.name)}</div>
                    <div class="class-card-time">${Utils.formatTime(c.startTime)} → ${Utils.formatTime(c.endTime)}</div>
                `;
            } else {
                // Determine visual styling
                if (viewingToday) {
                    // Today: show current/next/past/future badges
                    if (isCurrent) {
                        badgeHtml = '<div class="class-card-badge class-card-badge-live">⏱ NOW</div>';
                        styleClass = 'class-card-now';
                    } else if (isNext) {
                        badgeHtml = '<div class="class-card-badge class-card-badge-next">NEXT UP</div>';
                        styleClass = 'class-card-next';
                    } else {
                        const [cH, cM] = c.startTime.split(':').map(Number);
                        if ((cH * 60 + cM) < nowMins) {
                            badgeHtml = '<div class="class-card-badge class-card-badge-past">TODAY (ENDED)</div>';
                            styleClass = 'class-card-past';
                        } else {
                            badgeHtml = '<div class="class-card-badge class-card-badge-future">LATER TODAY</div>';
                            styleClass = 'class-card-future';
                        }
                    }
                } else {
                    // Past day: all classes are just neutral / available
                    badgeHtml = '<div class="class-card-badge class-card-badge-past">CLASS</div>';
                    styleClass = 'class-card-past-available';
                }

                innerHtml = `
                    <div class="class-card-name">${Utils.escapeHTML(c.name)}</div>
                    <div class="class-card-time" style="display: flex; justify-content: space-between;">
                        <span>${Utils.formatTime(c.startTime)} → ${Utils.formatTime(c.endTime)}</span>
                        <span style="font-weight: 700; color: var(--accent-gold);">${Utils.escapeHTML(c.locationName || '')}</span>
                    </div>
                `;
            }

            // All classes are clickable (no time window restriction) unless already signed in
            const canClick = !isLastSignedIn && !isAlreadySignedIn;

            html += `
                <div class="class-card ${styleClass} ${isLastSignedIn ? 'anim-pulse-success' : ''}"
                     data-class-id="${c.id}"
                     style="${canClick ? 'cursor: pointer; border-color: var(--accent-gold);' : (isLastSignedIn ? 'cursor: default; border-color: var(--accent-green);' : 'cursor: default;')}">
                    ${badgeHtml}
                    ${innerHtml}
                </div>
            `;
        });

        return html + '</div>';
    }


    async function handleSearch() {
        const input = document.getElementById('signin-search');
        if (!input) return;
        const query = input.value.trim();
        const resultsContainer = document.getElementById('search-results');
        if (!resultsContainer) return;

        if (!query) {
            resultsContainer.innerHTML = '';
            return;
        }

        const results = await DB.Members.search(query);

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-state" style="padding: 16px;">
                    <span class="empty-state-icon" style="font-size: 32px;">🔎</span>
                    <p class="empty-state-desc">No members found matching "${Utils.escapeHTML(query)}"</p>
                </div>
            `;
            return;
        }

        // Use the cached date attendance
        const dateAttendance = await getDateAttendance();

        resultsContainer.innerHTML = results.map((member, index) => {
            const staggerClass = index < 8 ? `anim-stagger-${index + 1}` : '';
            const memberDateRecords = dateAttendance.filter(a => a.memberId === member.id);
            const signedInHtml = memberDateRecords.length > 0
                ? `<div style="color: var(--accent-green); font-size: 11px; font-weight: 700; margin-top: 4px;">✅ Signed into ${Utils.escapeHTML(memberDateRecords[0].className)}</div>`
                : `<div class="member-card-detail">${member.attendanceCount || 0} classes attended${member.belt ? ' · ' + Utils.escapeHTML(member.belt) + ' belt' : ''}</div>`;

            return `
                <div class="member-card ${staggerClass}" data-member-id="${member.id}" onclick="SignInScreen.selectPendingMember('${member.id}')" style="cursor: pointer; border: 1px solid rgba(220,186,105,0.3);">
                    <div class="member-card-info">
                        <div class="member-card-name">${Utils.escapeHTML(member.firstName)} ${Utils.escapeHTML(member.lastName)}</div>
                        ${signedInHtml}
                    </div>
                </div>
            `;
        }).join('');
    }


    async function selectPendingMember(memberId) {
        pendingMember = await DB.Members.getById(memberId);
        await render();
    }


    function cancelPending() {
        pendingMember = null;
        render();
    }


    async function executeSignIn(memberId, classId) {
        if (isProcessing) return;
        isProcessing = true;

        try {
            const member = (pendingMember && pendingMember.id === memberId)
                ? pendingMember
                : await DB.Members.getById(memberId);

            const schedule = await DB.Schedules.getById(classId);
            if (!member || !schedule) {
                isProcessing = false;
                return;
            }

            // Use the selected date, not "today"
            const signInDate = getSelectedDateStr();

            // Check for double-booking on the selected date
            const dateAttendance = await getDateAttendance();
            const memberDateRecords = dateAttendance.filter(a => a.memberId === member.id);
            if (memberDateRecords.some(a => a.classScheduleId === schedule.id)) {
                alert(`${member.firstName} is already signed into this class!`);
                isProcessing = false;
                return;
            }

            // Look up location name for this schedule
            const allLocations = await DB.Locations.getAll();
            const location = allLocations.find(l => l.id === schedule.locationId);

            const record = await DB.Attendance.add({
                memberId: member.id,
                memberName: `${member.firstName} ${member.lastName}`,
                classScheduleId: schedule.id,
                className: schedule.name,
                locationId: schedule.locationId || '',
                locationName: location ? location.name : '',
                date: signInDate,
                signInTime: new Date().toISOString()
            });

            // Increment attendance count
            await DB.Members.incrementAttendance(member.id);

            // Invalidate cache so the new record shows on next render
            invalidateAttendanceCache();

            lastSignInRecord = record;
            pendingMember = null;
            await render();

            if (lastSignInTimeout) clearTimeout(lastSignInTimeout);
            lastSignInTimeout = setTimeout(() => {
                lastSignInRecord = null;
                render();
            }, 6000);
        } catch (err) {
            console.error('Sign-in failed:', err);
            alert('Sign-in failed. Please try again.');
        } finally {
            isProcessing = false;
        }
    }


    async function undoSignIn() {
        if (!lastSignInRecord) return;
        const memberId = lastSignInRecord.memberId;
        await DB.Attendance.remove(lastSignInRecord.id);
        await DB.Members.decrementAttendance(memberId);
        lastSignInRecord = null;
        if (lastSignInTimeout) clearTimeout(lastSignInTimeout);
        invalidateAttendanceCache();
        await render();
    }


    return {
        render,
        selectPendingMember,
        cancelPending,
        undoSignIn
    };
})();
