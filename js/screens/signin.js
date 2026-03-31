/**
 * Sign-In Screen — Main kiosk view for member sign-in
 */

const SignInScreen = (() => {
    let pendingMember = null;
    let lastSignInRecord = null;
    let lastSignInTimeout = null;

    // FIX: Cache today's attendance records for the session.
    // Re-fetched only after a sign-in or undo, not on every search keystroke.
    let _todayAttendanceCache = null;

    async function getTodayAttendance() {
        if (_todayAttendanceCache) return _todayAttendanceCache;
        const today = Utils.todayStr();
        _todayAttendanceCache = await DB.Attendance.getByDate(today);
        return _todayAttendanceCache;
    }

    function invalidateTodayAttendance() {
        _todayAttendanceCache = null;
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

            const now = new Date();

            // Always show all locations on the sign-in screen
            const todayClasses = Utils.getTodayClasses(allSchedules, null, now);
            const currentClass = Utils.detectCurrentClass(allSchedules, now);
            const nextClass = Utils.detectNextClass(allSchedules, currentClass, now);
            const isHighlighting = !!currentClass || !!nextClass;

            const todayAttendance = await getTodayAttendance();
            const todayCount = todayAttendance.length;

            if (pendingMember) {
                await renderMemberSelected(container, pendingMember, todayClasses, isHighlighting, currentClass, nextClass, todayAttendance);
            } else {
                await renderSearchView(container, todayClasses, isHighlighting, currentClass, nextClass, todayCount);
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


    async function renderSearchView(container, todayClasses, isHighlighting, currentClass, nextClass, todayCount) {
        container.innerHTML = `
            <div class="screen" id="signin-screen">
                <div class="signin-stats">
                    <div class="stat-card">
                        <div class="stat-number">${todayCount}</div>
                        <div class="stat-label">Today's Sign-Ins</div>
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

                <div style="margin-top: 20px;">
                    ${renderClassCards(todayClasses, currentClass, nextClass, isHighlighting)}
                </div>
            </div>
        `;

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


    async function renderMemberSelected(container, member, todayClasses, isHighlighting, currentClass, nextClass, todayAttendance) {
        const memberToday = todayAttendance.filter(a => a.memberId === member.id);
        const signedInClassIds = new Set(memberToday.map(a => a.classScheduleId));

        container.innerHTML = `
            <div class="screen" id="signin-screen">
                <div class="member-selected-header" style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px; padding: 16px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid rgba(220,186,105,0.3);">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 20px; font-weight: 700; color: var(--text-primary);">${Utils.escapeHTML(member.firstName)} ${Utils.escapeHTML(member.lastName)}</div>
                        <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">${member.belt ? Utils.escapeHTML(member.belt) + ' Belt' : 'Select a class below'}</div>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="SignInScreen.cancelPending()">Cancel</button>
                </div>

                <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 12px; text-align: center;">Select a class to sign in:</p>

                ${renderClassCards(todayClasses, currentClass, nextClass, isHighlighting, signedInClassIds)}
            </div>
        `;

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


    function renderClassCards(todayClasses, currentClass, nextClass, isHighlighting, signedInClassIds = new Set()) {
        if (!todayClasses || todayClasses.length === 0) {
            return `
                <div class="class-banner">
                    <div class="class-banner-info">
                        <span class="class-banner-label">Today</span>
                        <span class="class-banner-name">No Classes Scheduled</span>
                        <span class="class-banner-time">No classes found for today at this location</span>
                    </div>
                </div>
            `;
        }

        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();
        let html = '<div class="class-cards-list">';

        todayClasses.forEach(c => {
            const isCurrent = currentClass && currentClass.id === c.id;
            const isNext = nextClass && nextClass.id === c.id;
            const isLastSignedIn = lastSignInRecord && lastSignInRecord.classScheduleId === c.id;
            const isAlreadySignedIn = signedInClassIds.has(c.id);

            let badgeHtml = '';
            let styleClass = '';
            let innerHtml = '';
            let windowMessage = '';

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

                // Time window limiting (±1 hour)
                const isWithinLimit = Utils.isWithinSignInWindow(c, now);
                if (!isWithinLimit) {
                    styleClass = 'class-card-disabled';
                    const [cH, cM] = c.startTime.split(':').map(Number);
                    if ((cH * 60 + cM) < nowMins) {
                        windowMessage = '<div style="font-size: 11px; color: var(--text-secondary); margin-top: 8px; font-style: italic;">Sign-in closed. Please let the Sensei know if you forgot to sign in.</div>';
                    }
                }

                innerHtml = `
                    <div class="class-card-name">${Utils.escapeHTML(c.name)}</div>
                    <div class="class-card-time" style="display: flex; justify-content: space-between;">
                        <span>${Utils.formatTime(c.startTime)} → ${Utils.formatTime(c.endTime)}</span>
                        <span style="font-weight: 700; color: var(--accent-gold);">${Utils.escapeHTML(c.locationName || '')}</span>
                    </div>
                    ${windowMessage}
                `;
            }

            const canClick = !isLastSignedIn && !isAlreadySignedIn && (isHighlighting || Utils.isWithinSignInWindow(c, now));

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

        // FIX: Use the cached today's attendance instead of re-fetching on every keystroke
        const todayAttendance = await getTodayAttendance();

        resultsContainer.innerHTML = results.map((member, index) => {
            const staggerClass = index < 8 ? `anim-stagger-${index + 1}` : '';
            const memberToday = todayAttendance.filter(a => a.memberId === member.id);
            const signedInHtml = memberToday.length > 0
                ? `<div style="color: var(--accent-green); font-size: 11px; font-weight: 700; margin-top: 4px;">✅ Signed into ${Utils.escapeHTML(memberToday[0].className)}</div>`
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
        try {
            // FIX: pendingMember is already loaded — reuse it instead of fetching again.
            // Only fall back to a DB fetch if called from a path that doesn't set pendingMember.
            const member = (pendingMember && pendingMember.id === memberId)
                ? pendingMember
                : await DB.Members.getById(memberId);

            const schedule = await DB.Schedules.getById(classId);
            if (!member || !schedule) return;


            if (!Utils.isWithinSignInWindow(schedule)) {
                alert(`Sign-in for this class is currently closed.`);
                return;
            }

            const today = Utils.todayStr();
            // FIX: Use the cache — avoids a redundant Firestore read
            const todayAttendance = await getTodayAttendance();
            const memberToday = todayAttendance.filter(a => a.memberId === member.id);
            if (memberToday.some(a => a.classScheduleId === schedule.id)) {
                alert(`${member.firstName} is already signed into this class!`);
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
                date: today,
                signInTime: new Date().toISOString()
            });

            // Increment attendance count to match manual sign-in behaviour
            await DB.Members.incrementAttendance(member.id);

            // Invalidate cache so the new record shows on next render
            invalidateTodayAttendance();

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
        }
    }


    async function undoSignIn() {
        if (!lastSignInRecord) return;
        await DB.Attendance.remove(lastSignInRecord.id);
        lastSignInRecord = null;
        if (lastSignInTimeout) clearTimeout(lastSignInTimeout);
        // Invalidate cache after removal
        invalidateTodayAttendance();
        await render();
    }


    return {
        render,
        selectPendingMember,
        cancelPending,
        undoSignIn
    };
})();
