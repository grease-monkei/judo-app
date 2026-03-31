/**
 * Judo Club Sign-In — Utility Functions
 */

const Utils = (() => {

    // ===== Judo Canada Age Categories =====
    // Shared single source of truth — used by members.js and attendance.js
    // Age is determined as of December 31 of the current competition year.
    // Competition year runs Sep 1 – Aug 31, so we use the ending calendar year.
    function getJudoAgeCategory(birthday) {
        if (!birthday) return '';
        const today = new Date();
        const dob = new Date(birthday);
        // If we're between Sep–Dec, the competition year ends next Dec 31
        // If we're between Jan–Aug, it ends this Dec 31
        const competitionEndYear = today.getMonth() >= 8 ? today.getFullYear() + 1 : today.getFullYear();
        const ageAtEndOfYear = competitionEndYear - dob.getFullYear();
        if (ageAtEndOfYear < 8)  return 'U8';
        if (ageAtEndOfYear < 10) return 'U10';
        if (ageAtEndOfYear < 12) return 'U12';
        if (ageAtEndOfYear < 14) return 'U14';
        if (ageAtEndOfYear < 16) return 'U16';
        if (ageAtEndOfYear < 18) return 'U18';
        if (ageAtEndOfYear < 21) return 'U21';
        return 'Senior';
    }


    // ===== Class Detection =====
    /**
     * Find the current class based on time window:
     * 10 minutes before start → class end time
     */
    function detectCurrentClass(schedules, now = new Date()) {
        const dayOfWeek = now.getDay();
        const todaySchedules = schedules.filter(s => s.dayOfWeek === dayOfWeek && s.isActive !== false);

        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        for (const s of todaySchedules) {
            const [startH, startM] = s.startTime.split(':').map(Number);
            const [endH, endM] = s.endTime.split(':').map(Number);
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;
            const windowStart = startMinutes - 10;
            const windowEnd = endMinutes;

            if (nowMinutes >= windowStart && nowMinutes <= windowEnd) {
                return s;
            }
        }

        return null;
    }


    /**
     * Find the next upcoming class today (after current time or after current class)
     */
    function detectNextClass(schedules, currentClass = null, now = new Date()) {
        const dayOfWeek = now.getDay();
        const todaySchedules = schedules.filter(s => s.dayOfWeek === dayOfWeek && s.isActive !== false);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        const upcoming = todaySchedules
            .filter(s => {
                const [startH, startM] = s.startTime.split(':').map(Number);
                const startMin = startH * 60 + startM;
                // Must start after now, and not be the current class
                return startMin > nowMinutes && (!currentClass || s.id !== currentClass.id);
            })
            .sort((a, b) => {
                const [aH, aM] = a.startTime.split(':').map(Number);
                const [bH, bM] = b.startTime.split(':').map(Number);
                return (aH * 60 + aM) - (bH * 60 + bM);
            });

        return upcoming.length > 0 ? upcoming[0] : null;
    }


    /**
     * Get all classes for today at a specific location
     */
    function getTodayClasses(schedules, locationId, now = new Date()) {
        const dayOfWeek = now.getDay();
        return schedules
            .filter(s => (locationId ? s.locationId === locationId : true) && s.dayOfWeek === dayOfWeek && s.isActive !== false)
            .sort((a, b) => {
                const [aH, aM] = a.startTime.split(':').map(Number);
                const [bH, bM] = b.startTime.split(':').map(Number);
                return (aH * 60 + aM) - (bH * 60 + bM);
            });
    }


    /**
     * Check if a class is within the ±60 minute sign-in window
     */
    function isWithinSignInWindow(schedule, now = new Date()) {
        if (!schedule) return false;
        const nowMins = now.getHours() * 60 + now.getMinutes();

        const [startH, startM] = schedule.startTime.split(':').map(Number);
        const [endH, endM] = schedule.endTime.split(':').map(Number);
        const startMins = startH * 60 + startM;
        const endMins = endH * 60 + endM;

        const windowStart = startMins - 60;
        const windowEnd = endMins + 60;

        return nowMins >= windowStart && nowMins <= windowEnd;
    }


    // ===== CSV Export =====
    function exportCSV(data, columns, filename) {
        const header = columns.map(c => c.label).join(',');
        const rows = data.map(row =>
            columns.map(c => {
                let val = typeof c.value === 'function' ? c.value(row) : row[c.value];
                if (val === undefined || val === null) val = '';
                // Escape CSV values
                val = String(val).replace(/"/g, '""');
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = `"${val}"`;
                }
                return val;
            }).join(',')
        );

        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'export.csv';
        link.click();
        URL.revokeObjectURL(url);
    }


    // ===== CSV Import =====
    // FIX: Strip \r before splitting so Windows line endings don't corrupt the last field
    function parseCSV(text) {
        const lines = text.replace(/\r/g, '').trim().split('\n');
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            const row = {};
            headers.forEach((h, idx) => {
                row[h] = values[idx] || '';
            });
            rows.push(row);
        }
        return rows;
    }


    function parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (inQuotes) {
                if (char === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = false;
                } else {
                    current += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
        }
        values.push(current.trim());
        return values;
    }


    // ===== Formatting =====
    function formatTime(timeStr) {
        if (!timeStr) return '';
        const [h, m] = timeStr.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 || 12;
        return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
    }


    function formatDate(dateStr) {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }


    function formatDateTime(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);

        return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit',
            hour12: true
        });
    }


    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function getDayName(dayOfWeek) {
        return DAY_NAMES[dayOfWeek] || '';
    }

    function getDayShort(dayOfWeek) {
        return DAY_SHORT[dayOfWeek] || '';
    }

    function todayStr() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }


    // ===== JSON Export/Import =====
    function downloadJSON(data, filename) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'data.json';
        link.click();
        URL.revokeObjectURL(url);
    }


    /**
     * Convert attendance records to a CSV string
     */
    function getAttendanceCSV(records) {
        const headers = ['Date', 'Time', 'Member Name', 'Class Name', 'Location'];
        const rows = records.map(r => {
            const date = r.date || '';
            const time = r.signInTime ? new Date(r.signInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const name = `"${(r.memberName || '').replace(/"/g, '""')}"`;
            const className = `"${(r.className || '').replace(/"/g, '""')}"`;
            const location = `"${(r.locationName || '').replace(/"/g, '""')}"`;
            return [date, time, name, className, location].join(',');
        });
        return [headers.join(','), ...rows].join('\n');
    }


    /**
     * Trigger a browser download of a CSV string
     */
    function downloadCSV(csvText, filename) {
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        link.click();
        URL.revokeObjectURL(url);
    }


    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }


    // ===== Debounce =====
    function debounce(fn, delay = 200) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }


    // ===== Sanitize HTML =====
    // FIX: Use a regex-based replace instead of creating a DOM element on every call.
    // This avoids unnecessary DOM churn and is measurably faster.
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }


    /**
     * Convert an ISO string to a local YYYY-MM-DD date string.
     */
    function getLocalDateStr(isoStr) {
        if (!isoStr) return todayStr();
        const d = new Date(isoStr);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

const Clock = (() => {
        let timer;
        function update() {
            const el = document.getElementById('header-clock');
            if (!el) return;
            const now = new Date();
            const h = now.getHours();
            const m = String(now.getMinutes()).padStart(2, '0');
            const period = h >= 12 ? 'PM' : 'AM';
            const hour12 = h % 12 || 12;
            el.textContent = `${hour12}:${m} ${period}`;
        }
        function init() {
            update();
            if (timer) clearInterval(timer);
            timer = setInterval(update, 1000 * 30); // Update every 30s
        }
        return { init, update };
    })();

    return {
        getJudoAgeCategory,
        detectCurrentClass,
        detectNextClass,
        getTodayClasses,
        isWithinSignInWindow,
        exportCSV,
        parseCSV,
        formatTime,
        formatDate,
        formatDateTime,
        getDayName,
        getDayShort,
        todayStr,
        downloadJSON,
        getAttendanceCSV,
        downloadCSV,
        readFileAsText,
        debounce,
        escapeHTML,
        getLocalDateStr,
        DAY_NAMES,
        DAY_SHORT,
        Clock
    };
})();
