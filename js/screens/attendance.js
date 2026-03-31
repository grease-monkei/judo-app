/**
 * Attendance Screen — View attendance records and export CSV
 */

const AttendanceScreen = (() => {

    // FIX: Module-level member cache. Populated on first load, cleared when
    // a record is deleted so the next search re-fetches fresh data.
    let _memberMapCache = null;

    async function getMemberMap() {
        if (_memberMapCache) return _memberMapCache;
        const members = await DB.Members.getAll();
        const map = {};
        for (const m of members) {
            map[m.id] = m;
        }
        _memberMapCache = map;
        return map;
    }

    function invalidateMemberCache() {
        _memberMapCache = null;
    }


    async function render() {
        const container = document.getElementById('main-content');
        const today = Utils.todayStr();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];


        container.innerHTML = `
            <div class="screen" id="attendance-screen">
                <div class="section-header">
                    <h2 class="section-title">Attendance Records</h2>
                </div>

                <div class="filter-row">
                    <input type="date" class="form-input" id="att-date-start" value="${thirtyDaysAgo}">
                    <input type="date" class="form-input" id="att-date-end" value="${today}">
                </div>

                <div class="filter-row">
                    <select class="form-select" id="att-filter-class">
                        <option value="">All Classes</option>
                    </select>
                    <select class="form-select" id="att-filter-location">
                        <option value="">All Locations</option>
                    </select>
                </div>

                <div class="filter-row">
                    <select class="form-select" id="att-filter-age-group">
                        <option value="">All Age Groups</option>
                        <option value="U8">U8</option>
                        <option value="U10">U10</option>
                        <option value="U12">U12</option>
                        <option value="U14">U14</option>
                        <option value="U16">U16</option>
                        <option value="U18">U18</option>
                        <option value="U21">U21</option>
                        <option value="Senior">Senior</option>
                    </select>
                </div>

                <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
                    <button class="btn btn-gold btn-sm" id="att-search-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        Search
                    </button>
                    <button class="btn btn-secondary btn-sm" id="att-export-btn">
                        📥 Export CSV
                    </button>
                </div>

                <div id="att-summary" class="card mb-16" style="display:none;">
                    <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                        <div>
                            <div class="stat-number" id="att-total" style="font-size: 20px;">0</div>
                            <div class="stat-label">Total Sign-Ins</div>
                        </div>
                        <div>
                            <div class="stat-number" id="att-unique" style="font-size: 20px;">0</div>
                            <div class="stat-label">Unique Members</div>
                        </div>
                    </div>
                </div>

                <div id="att-table-container">
                    <div class="empty-state" style="padding: 32px 16px;">
                        <span class="empty-state-icon">📋</span>
                        <p class="empty-state-desc">Select a date range and click Search to view attendance records</p>
                    </div>
                </div>
            </div>
        `;


        // Populate filter dropdowns
        await populateFilters();

        // Wire up buttons
        document.getElementById('att-search-btn').addEventListener('click', loadRecords);
        document.getElementById('att-export-btn').addEventListener('click', exportRecords);

        // Auto-load
        await loadRecords();
    }


    async function populateFilters() {
        const schedules = await DB.Schedules.getAll();
        const locations = await DB.Locations.getAll();

        const classSelect = document.getElementById('att-filter-class');
        const uniqueNames = [...new Set(schedules.map(s => s.name))];
        uniqueNames.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            classSelect.appendChild(opt);
        });

        const locSelect = document.getElementById('att-filter-location');
        locations.forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc.id;
            opt.textContent = loc.name;
            locSelect.appendChild(opt);
        });
    }


    async function getFilteredRecords() {
        const startDate = document.getElementById('att-date-start').value;
        const endDate = document.getElementById('att-date-end').value;
        const filterClass = document.getElementById('att-filter-class').value;
        const filterLocation = document.getElementById('att-filter-location').value;
        const filterAgeGroup = document.getElementById('att-filter-age-group').value;

        let records = await DB.Attendance.getByDateRange(startDate, endDate);

        // FIX: Use cached member map instead of fetching all members on every search
        const memberMap = await getMemberMap();

        // Enrich records with member data
        // FIX: Use Utils.getJudoAgeCategory — single source of truth, not a local copy
        records = records.map(r => {
            const member = memberMap[r.memberId] || {};
            return {
                ...r,
                belt: member.belt || '',
                birthday: member.birthday || null,
                ageGroup: member.birthday ? Utils.getJudoAgeCategory(member.birthday) : ''
            };
        });

        if (filterClass) {
            records = records.filter(r => r.className === filterClass);
        }
        if (filterLocation) {
            records = records.filter(r => String(r.locationId) === String(filterLocation));
        }
        if (filterAgeGroup) {
            records = records.filter(r => r.ageGroup === filterAgeGroup);
        }

        // Sort by date descending, then time descending
        records.sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return String(b.signInTime).localeCompare(String(a.signInTime));
        });

        return records;
    }


    async function loadRecords() {
        // FIX: Disable search button while the query is running to prevent double-fires
        const searchBtn = document.getElementById('att-search-btn');
        if (searchBtn) {
            searchBtn.disabled = true;
            searchBtn.textContent = 'Searching…';
        }

        try {
            const records = await getFilteredRecords();
            const tableContainer = document.getElementById('att-table-container');
            const summary = document.getElementById('att-summary');

            if (records.length === 0) {
                summary.style.display = 'none';
                tableContainer.innerHTML = `
                    <div class="empty-state" style="padding: 32px 16px;">
                        <span class="empty-state-icon">📭</span>
                        <p class="empty-state-desc">No attendance records found for the selected filters</p>
                    </div>
                `;
                return;
            }

            // Show summary
            summary.style.display = 'block';
            document.getElementById('att-total').textContent = records.length;
            const uniqueMembers = new Set(records.map(r => r.memberId));
            document.getElementById('att-unique').textContent = uniqueMembers.size;

            // Build table
            tableContainer.innerHTML = `
                <div class="attendance-table-wrap">
                    <table class="attendance-table">
                        <thead>
                            <tr>
                                <th style="width: 40px; text-align:center;">Del</th>
                                <th>Date</th>
                                <th>Name</th>
                                <th>Class</th>
                                <th>Belt</th>
                                <th>Age Group</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${records.map(r => `
                                <tr>
                                    <td style="text-align: center;">
                                        <button class="btn-icon" onclick="AttendanceScreen.deleteRecord('${r.id}', '${r.memberId}')" title="Delete Record" style="color: var(--accent-red); padding: 4px;">🗑</button>
                                    </td>
                                    <td>${Utils.formatDate(r.date)}</td>
                                    <td>${Utils.escapeHTML(r.memberName || '')}</td>
                                    <td>${Utils.escapeHTML(r.className || '')}</td>
                                    <td>${Utils.escapeHTML(r.belt || '—')}</td>
                                    <td>${r.ageGroup ? `<span style="font-weight: 700; color: var(--accent-blue);">${r.ageGroup}</span>` : '—'}</td>
                                    <td>${r.signInTime ? new Date(r.signInTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } finally {
            // FIX: Always re-enable search button, even if the query threw
            if (searchBtn) {
                searchBtn.disabled = false;
                searchBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    Search
                `;
            }
        }
    }


    async function exportRecords() {
        const records = await getFilteredRecords();

        if (records.length === 0) {
            alert('No records to export.');
            return;
        }

        const startDate = document.getElementById('att-date-start').value;
        const endDate = document.getElementById('att-date-end').value;
        const filterAgeGroup = document.getElementById('att-filter-age-group').value;
        const filterClass = document.getElementById('att-filter-class').value;

        // Build descriptive filename
        let filename = 'attendance';
        if (filterAgeGroup) filename += `_${filterAgeGroup}`;
        if (filterClass) filename += `_${filterClass.replace(/\s+/g, '-')}`;
        filename += `_${startDate}_to_${endDate}.csv`;

        Utils.exportCSV(records, [
            { label: 'Date', value: 'date' },
            { label: 'First Name', value: r => (r.memberName || '').split(' ')[0] },
            { label: 'Last Name', value: r => (r.memberName || '').split(' ').slice(1).join(' ') },
            { label: 'Class', value: 'className' },
            { label: 'Location', value: 'locationName' },
            { label: 'Belt', value: 'belt' },
            { label: 'Date of Birth', value: 'birthday' },
            { label: 'Age Group', value: 'ageGroup' },
            { label: 'Sign-In Time', value: r => r.signInTime ? new Date(r.signInTime).toLocaleString() : '' }
        ], filename);
    }


    async function deleteRecord(recordId, memberId) {
        if (!confirm('Are you sure you want to delete this attendance record? This cannot be undone.')) {
            return;
        }

        await DB.Attendance.remove(recordId);
        if (memberId) await DB.Members.decrementAttendance(memberId);

        // FIX: Invalidate the member cache after a write so the next search
        // picks up any member data changes that might have occurred.
        invalidateMemberCache();

        await loadRecords();
    }


    return {
        render,
        deleteRecord
    };
})();
