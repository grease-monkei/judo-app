/**
 * White Rock Judo Club — Seed Data
 * Scraped from https://whiterockjudoclub.com/schedule/
 * Auto-loads on first app launch if no locations exist.
 */

const SeedData = (() => {

    const LOCATIONS = [
        { name: 'Gateway Dojo', address: 'White Rock, BC' },
        { name: 'Centennial Park Leisure Centre', address: 'White Rock, BC' }
    ];

    // Helper: parse "5:15pm" or "7:00pm" or "9:30am" to "HH:MM" 24-hr
    function parseTime(str) {
        str = str.trim().toLowerCase();
        const match = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)/);
        if (!match) return '00:00';
        let h = parseInt(match[1]);
        const m = match[2];
        const period = match[3];
        if (period === 'pm' && h !== 12) h += 12;
        if (period === 'am' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${m}`;
    }

    // dayOfWeek: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    function buildSchedules(gatewayId, centennialId) {
        return [
            // ===== MONDAY (1) =====
            { locationId: gatewayId, name: 'Kids Beginner 1 & 2', dayOfWeek: 1, startTime: parseTime('5:15pm'), endTime: parseTime('6:20pm') },
            { locationId: gatewayId, name: 'Kids Advanced', dayOfWeek: 1, startTime: parseTime('6:30pm'), endTime: parseTime('8:00pm') },

            // ===== TUESDAY (2) =====
            { locationId: gatewayId, name: 'Adults Class', dayOfWeek: 2, startTime: parseTime('7:00pm'), endTime: parseTime('8:30pm') },
            { locationId: centennialId, name: 'Kids Beginner 1 & 2', dayOfWeek: 2, startTime: parseTime('5:10pm'), endTime: parseTime('5:55pm') },
            { locationId: centennialId, name: 'Kids Advanced', dayOfWeek: 2, startTime: parseTime('6:00pm'), endTime: parseTime('6:55pm') },
            { locationId: centennialId, name: 'HP Class (U14, U16, U18)', dayOfWeek: 2, startTime: parseTime('7:00pm'), endTime: parseTime('8:50pm') },

            // ===== WEDNESDAY (3) =====
            { locationId: gatewayId, name: 'Pre Judo + Kids Beginner 1', dayOfWeek: 3, startTime: parseTime('5:15pm'), endTime: parseTime('6:10pm') },
            { locationId: gatewayId, name: 'Adults Class', dayOfWeek: 3, startTime: parseTime('7:00pm'), endTime: parseTime('8:30pm') },

            // ===== THURSDAY (4) =====
            { locationId: gatewayId, name: 'Adults Recreational', dayOfWeek: 4, startTime: parseTime('7:20pm'), endTime: parseTime('8:30pm') },
            { locationId: centennialId, name: 'Kids Beginner 1 & 2', dayOfWeek: 4, startTime: parseTime('5:10pm'), endTime: parseTime('5:55pm') },
            { locationId: centennialId, name: 'Kids Advanced', dayOfWeek: 4, startTime: parseTime('6:00pm'), endTime: parseTime('6:55pm') },
            { locationId: centennialId, name: 'HP Class (U14, U16, U18)', dayOfWeek: 4, startTime: parseTime('7:00pm'), endTime: parseTime('8:50pm') },

            // ===== FRIDAY (5) =====
            { locationId: gatewayId, name: 'Pre Judo + Kids Beginner 1', dayOfWeek: 5, startTime: parseTime('5:15pm'), endTime: parseTime('6:00pm') },
            { locationId: gatewayId, name: 'Kids Advanced', dayOfWeek: 5, startTime: parseTime('6:15pm'), endTime: parseTime('7:30pm') },
            { locationId: gatewayId, name: 'Adults Class', dayOfWeek: 5, startTime: parseTime('7:45pm'), endTime: parseTime('9:00pm') },

            // ===== SATURDAY (6) =====
            { locationId: gatewayId, name: 'Kata Class', dayOfWeek: 6, startTime: parseTime('4:30pm'), endTime: parseTime('5:20pm') },
            { locationId: gatewayId, name: 'Kids Beginner 2 + Advanced', dayOfWeek: 6, startTime: parseTime('5:30pm'), endTime: parseTime('6:45pm') },

            // ===== SUNDAY (0) =====
            { locationId: gatewayId, name: 'Pre Judo + Kids Beginner 1', dayOfWeek: 0, startTime: parseTime('9:30am'), endTime: parseTime('10:15am') },
            { locationId: gatewayId, name: 'Kids Beginner 2 + Kids Advanced', dayOfWeek: 0, startTime: parseTime('10:30am'), endTime: parseTime('11:45am') },
            { locationId: gatewayId, name: 'Adults Open Mats', dayOfWeek: 0, startTime: parseTime('12:00pm'), endTime: parseTime('1:30pm') },
        ];
    }

    async function seedIfEmpty() {
        const existingLocations = await DB.Locations.getAll();
        if (existingLocations.length > 0) {
            // Data already exists, skip seeding
            return false;
        }

        console.log('🥋 Seeding White Rock Judo Club data...');

        // Create locations with deterministic IDs
        const gatewayId = 'loc-gateway-dojo';
        const centennialId = 'loc-centennial-park';

        await DB.Locations.add(LOCATIONS[0], gatewayId);
        await DB.Locations.add(LOCATIONS[1], centennialId);

        // Create schedules with deterministic IDs
        const schedules = buildSchedules(gatewayId, centennialId);
        for (const sched of schedules) {
            const timeSlug = sched.startTime.replace(':', '');
            const scheduleId = `sch-${sched.locationId.replace('loc-', '')}-${sched.dayOfWeek}-${timeSlug}`;
            await DB.Schedules.add(sched, scheduleId);
        }

        // Set Gateway Dojo as default location
        await DB.Settings.setCurrentLocationId(gatewayId);

        console.log(`✅ Seeded ${LOCATIONS.length} locations and ${schedules.length} class schedules`);
        return true;
    }

    return { seedIfEmpty };
})();
