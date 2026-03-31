/**
 * Weekly Schedule Screen — Displays all classes organized by day of the week
 */

const ScheduleScreen = (() => {

    const DAYS_OF_WEEK = [
        'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
    ];

    async function render() {
        const container = document.getElementById('main-content');
        
        // Fetch all schedules and locations
        const allSchedules = await DB.Schedules.getAll();
        const allLocations = await DB.Locations.getAll();
        
        // Create a map of location IDs to location names for easy lookup
        const locationMap = {};
        for (const loc of allLocations) {
            locationMap[loc.id] = loc.name;
        }

        // Group schedules by day of the week
        const grouped = {
            1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] // Mon - Sun
        };
        
        for (const s of allSchedules) {
            if (grouped[s.dayOfWeek] !== undefined) {
                grouped[s.dayOfWeek].push(s);
            }
        }

        // Sort each day's classes chronologically
        for (const day in grouped) {
            grouped[day].sort((a, b) => {
                const aMins = parseInt(a.startTime.split(':')[0]) * 60 + parseInt(a.startTime.split(':')[1]);
                const bMins = parseInt(b.startTime.split(':')[0]) * 60 + parseInt(b.startTime.split(':')[1]);
                return aMins - bMins;
            });
        }

        // Render HTML
        let html = `
            <div class="screen" id="schedule-screen">
                <div class="section-header" style="margin-bottom: 24px; text-align: center;">
                    <h2 class="section-title" style="font-size: 24px; margin-bottom: 4px;">Weekly Schedule</h2>
                    <p style="color: var(--text-secondary); font-size: 14px;">Classes for all locations</p>
                </div>
                
                <div class="schedule-list">
        `;

        // Loop through Monday(1) to Sunday(0)
        const displayOrder = [1, 2, 3, 4, 5, 6, 0];
        
        for (const dayIndex of displayOrder) {
            const classesToday = grouped[dayIndex];
            
            if (classesToday.length === 0) continue; // Skip days with no classes
            
            html += `
                <div class="schedule-day-group" style="margin-bottom: 32px;">
                    <h3 style="color: var(--accent-gold); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 16px; font-size: 18px;">
                        ${DAYS_OF_WEEK[dayIndex]}
                    </h3>
                    <div class="class-cards-list">
            `;

            for (const c of classesToday) {
                const locName = locationMap[String(c.locationId)] || 'Unknown Location';
                
                html += `
                    <div class="class-card" style="border-left: 4px solid var(--accent-blue); display: flex; flex-direction: column; cursor: default;">
                        <div style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">
                            ${Utils.escapeHTML(c.name)}
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <div style="font-size: 13px; color: var(--accent-silver); display: flex; align-items: center; gap: 4px;">
                                <span>⏱️</span> ${Utils.formatTime(c.startTime)} – ${Utils.formatTime(c.endTime)}
                            </div>
                            <div style="font-size: 12px; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">
                                📍 ${Utils.escapeHTML(locName)}
                            </div>
                        </div>
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }
        
        if (allSchedules.length === 0) {
            html += `
                <div class="empty-state">
                    <span class="empty-state-icon">🗓️</span>
                    <p class="empty-state-desc">No schedule configured. Please add classes in the Settings tab.</p>
                </div>
            `;
        }

        html += `
                </div>
                
                <div style="text-align: center; margin-top: 40px; margin-bottom: 20px;">
                    <button class="btn btn-secondary" onclick="App.navigate('signin')" style="width: 100%; max-width: 300px; margin: 0 auto; display: block;">
                        ← Back to Sign In
                    </button>
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    return { render };
})();
