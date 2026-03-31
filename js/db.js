/**
 * Judo Club Sign-In — Database Layer (Cloud Firestore)
 * Real-time sync across all devices via Firebase Cloud Firestore.
 * Offline-first: works without internet, syncs when reconnected.
 * 
 * API surface is identical to the original IndexedDB version —
 * all other code (screens, utils, seed) works unchanged.
 */

const DB = (() => {
    const db = firestore; // from firebase-config.js

    // ===== Compatibility: open() is a no-op for Firestore =====
    function open() {
        return Promise.resolve();
    }

    // ===== Generic Firestore Helpers =====
    async function getAll(collectionName) {
        try {
            const snapshot = await db.collection(collectionName).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`DB Error: Failed to getAll from ${collectionName}`, error);
            return [];
        }
    }

    async function getById(collectionName, id) {
        if (!id) return undefined;
        try {
            const doc = await db.collection(collectionName).doc(String(id)).get();
            return doc.exists ? { id: doc.id, ...doc.data() } : undefined;
        } catch (error) {
            console.error(`DB Error: Failed to getById from ${collectionName} (ID: ${id})`, error);
            return undefined;
        }
    }

    async function addDoc(collectionName, record) {
        try {
            const docRef = await db.collection(collectionName).add(record);
            return { ...record, id: docRef.id };
        } catch (error) {
            console.error(`DB Error: Failed to addDoc to ${collectionName}`, error);
            throw error; // Re-throw for caller to handle UI feedback
        }
    }

    async function setDoc(collectionName, record) {
        try {
            const { id, ...data } = record;
            await db.collection(collectionName).doc(String(id)).set(data);
            return record;
        } catch (error) {
            console.error(`DB Error: Failed to setDoc in ${collectionName} (ID: ${record.id})`, error);
            throw error;
        }
    }

    async function removeDoc(collectionName, id) {
        try {
            await db.collection(collectionName).doc(String(id)).delete();
        } catch (error) {
            console.error(`DB Error: Failed to removeDoc from ${collectionName} (ID: ${id})`, error);
            throw error;
        }
    }

    async function queryByField(collectionName, fieldName, value) {
        try {
            const snapshot = await db.collection(collectionName)
                .where(fieldName, '==', value).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`DB Error: Failed to queryByField in ${collectionName} (${fieldName} == ${value})`, error);
            return [];
        }
    }

    async function clearCollection(collectionName) {
        const snapshot = await db.collection(collectionName).get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }

    // ===== Members API =====
    const Members = {
        async getAll() {
            return getAll('members');
        },
        async getActive() {
            const all = await getAll('members');
            return all.filter(m => m.isActive !== false);
        },
        async getById(id) {
            return getById('members', id);
        },
        async add(member) {
            const record = {
                firstName: member.firstName.trim(),
                lastName: member.lastName.trim(),
                email: member.email || '',
                phone: member.phone || '',
                belt: member.belt || '',
                birthday: member.birthday || null,
                isActive: true,
                attendanceCount: 0,
                createdAt: new Date().toISOString(),
                primaryLocationId: member.primaryLocationId || null
            };
            return addDoc('members', record);
        },
        async update(member) {
            return setDoc('members', member);
        },
        async remove(id) {
            return removeDoc('members', id);
        },
        async incrementAttendance(id) {
            const docRef = db.collection('members').doc(String(id));
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();
                await docRef.update({
                    attendanceCount: (data.attendanceCount || 0) + 1
                });
            }
        },
        async decrementAttendance(id) {
            const docRef = db.collection('members').doc(String(id));
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();
                await docRef.update({
                    attendanceCount: Math.max(0, (data.attendanceCount || 0) - 1)
                });
            }
        },
        /**
         * Search members by name, ranked by attendance frequency.
         * Exact first-name matches first, then starts-with, then contains.
         */
        async search(query) {
            if (!query || query.trim().length === 0) return [];
            const q = query.trim().toLowerCase();
            const all = await this.getActive();

            // Score each member
            const scored = all.map(m => {
                const first = m.firstName.toLowerCase();
                const last = m.lastName.toLowerCase();
                const full = `${first} ${last}`;

                let relevance = 0;
                if (first === q || last === q) {
                    relevance = 100; // Exact match
                } else if (full === q) {
                    relevance = 95;
                } else if (first.startsWith(q) || last.startsWith(q)) {
                    relevance = 80; // Starts with
                } else if (full.startsWith(q)) {
                    relevance = 75;
                } else if (full.includes(q)) {
                    relevance = 50; // Contains
                } else {
                    relevance = 0; // No match
                }

                return { ...m, relevance };
            });

            const filtered = scored.filter(m => m.relevance > 0);
            
            // Deduplicate search results by name and birthday to hide redundant entries
            const unique = [];
            const seen = new Set();
            filtered.forEach(m => {
                const key = `${m.firstName.toLowerCase()}|${m.lastName.toLowerCase()}|${m.birthday || ''}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(m);
                } else {
                    // If we see it again, keep the one with the most attendance
                    const existing = unique.find(u => `${u.firstName.toLowerCase()}|${u.lastName.toLowerCase()}|${u.birthday || ''}` === key);
                    if (existing && (m.attendanceCount || 0) > (existing.attendanceCount || 0)) {
                        Object.assign(existing, m);
                    }
                }
            });

            return unique.sort((a, b) => {
                // Primary: relevance. Secondary: attendance count.
                if (b.relevance !== a.relevance) return b.relevance - a.relevance;
                return (b.attendanceCount || 0) - (a.attendanceCount || 0);
            });
        },
        /**
         * Maintenance: Merge duplicate members with identical name/birthday.
         * Combines attendance counts and deletes the redundant copies.
         */
        async deduplicate() {
            const all = await this.getAll();
            const groups = {};
            
            all.forEach(m => {
                const key = `${m.firstName.toLowerCase()}|${m.lastName.toLowerCase()}|${m.birthday || ''}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(m);
            });

            let mergedCount = 0;
            const batch = db.batch();

            for (const key in groups) {
                const list = groups[key];
                if (list.length > 1) {
                    // Pick the strongest one as master
                    list.sort((a, b) => (b.attendanceCount || 0) - (a.attendanceCount || 0));
                    const master = list[0];
                    let totalAttendance = master.attendanceCount || 0;

                    // Merge others into master
                    for (let i = 1; i < list.length; i++) {
                        const duplicate = list[i];
                        totalAttendance += (duplicate.attendanceCount || 0);
                        batch.delete(db.collection('members').doc(String(duplicate.id)));
                        mergedCount++;
                    }

                    // Update master
                    batch.update(db.collection('members').doc(String(master.id)), {
                        attendanceCount: totalAttendance
                    });
                }
            }

            if (mergedCount > 0) {
                await batch.commit();
            }
            return mergedCount;
        }
    };

    // ===== Locations API =====
    const Locations = {
        async getAll() {
            return getAll('locations');
        },
        async getById(id) {
            return getById('locations', id);
        },
        async add(location, id = null) {
            const record = {
                name: location.name.trim(),
                address: location.address || ''
            };
            if (id) {
                return setDoc('locations', { ...record, id });
            }
            return addDoc('locations', record);
        },
        async update(location) {
            return setDoc('locations', location);
        },
        async remove(id) {
            return removeDoc('locations', id);
        },
        async deduplicate() {
            const all = await this.getAll();
            const groups = {};
            
            all.forEach(l => {
                const key = l.name.toLowerCase().trim();
                if (!groups[key]) groups[key] = [];
                groups[key].push(l);
            });

            let mergedCount = 0;
            const batch = db.batch();

            for (const key in groups) {
                const list = groups[key];
                if (list.length > 1) {
                    // Keep the first one as master
                    const master = list[0];
                    for (let i = 1; i < list.length; i++) {
                        const duplicate = list[i];
                        
                        // FIX: Before deleting the duplicate, update all schedules pointing to it
                        const affectedSchedules = await db.collection('schedules')
                            .where('locationId', '==', duplicate.id).get();
                        
                        affectedSchedules.docs.forEach(doc => {
                            batch.update(doc.ref, { 
                                locationId: master.id,
                                locationName: master.name 
                            });
                        });

                        batch.delete(db.collection('locations').doc(String(duplicate.id)));
                        mergedCount++;
                    }
                }
            }

            if (mergedCount > 0) {
                await batch.commit();
            }
            return mergedCount;
        }
    };

    // ===== Schedules API =====
    const Schedules = {
        async getAll() {
            return getAll('schedules');
        },
        async getByLocation(locationId) {
            return queryByField('schedules', 'locationId', locationId);
        },
        async getById(id) {
            return getById('schedules', id);
        },
        async add(schedule, id = null) {
            const record = {
                locationId: schedule.locationId,
                name: schedule.name.trim(),
                dayOfWeek: schedule.dayOfWeek,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                isActive: true
            };
            if (id) {
                return setDoc('schedules', { ...record, id });
            }
            return addDoc('schedules', record);
        },
        async update(schedule) {
            return setDoc('schedules', schedule);
        },
        async remove(id) {
            return removeDoc('schedules', id);
        },
        async deduplicate() {
            const all = await this.getAll();
            const groups = {};
            
            all.forEach(s => {
                const key = `${s.locationId}|${s.name.toLowerCase()}|${s.dayOfWeek}|${s.startTime}|${s.endTime}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(s);
            });

            let mergedCount = 0;
            const batch = db.batch();

            for (const key in groups) {
                const list = groups[key];
                if (list.length > 1) {
                    const master = list[0];
                    for (let i = 1; i < list.length; i++) {
                        const duplicate = list[i];

                        // FIX: Before deleting the duplicate, update all attendance records pointing to it
                        const affectedAttendance = await db.collection('attendance')
                            .where('classScheduleId', '==', String(duplicate.id)).get();
                        
                        affectedAttendance.docs.forEach(doc => {
                            batch.update(doc.ref, { 
                                classScheduleId: String(master.id),
                                className: master.name
                            });
                        });

                        batch.delete(db.collection('schedules').doc(String(duplicate.id)));
                        mergedCount++;
                    }
                }
            }

            if (mergedCount > 0) {
                await batch.commit();
            }
            return mergedCount;
        }
    };

    // ===== Attendance API =====
    const Attendance = {
        async getAll() {
            return getAll('attendance');
        },
        async getByDate(date) {
            return queryByField('attendance', 'date', date);
        },
        async getByDateRange(startDate, endDate) {
            const snapshot = await db.collection('attendance')
                .where('date', '>=', startDate)
                .where('date', '<=', endDate)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        },
        async getByMember(memberId) {
            return queryByField('attendance', 'memberId', memberId);
        },
        async getById(id) {
            return getById('attendance', id);
        },
        async add(record) {
            const attendance = {
                memberId: record.memberId,
                memberName: record.memberName,
                className: record.className,
                classScheduleId: record.classScheduleId,
                locationId: record.locationId || '',
                locationName: record.locationName || '',
                signInTime: record.signInTime || new Date().toISOString(),
                date: record.date || Utils.todayStr()
            };
            
            if (record.id) {
                return setDoc('attendance', { ...attendance, id: record.id });
            }
            return addDoc('attendance', attendance);
        },
        async remove(id) {
            return removeDoc('attendance', id);
        },
        async getTodayForClass(classScheduleId, date) {
            const today = date || Utils.todayStr();
            const snapshot = await db.collection('attendance')
                .where('date', '==', today)
                .where('classScheduleId', '==', classScheduleId)
                .get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
    };

    // ===== Settings API =====
    const Settings = {
        async get(key) {
            const doc = await db.collection('settings').doc(key).get();
            return doc.exists ? doc.data().value : null;
        },
        async set(key, value) {
            await db.collection('settings').doc(key).set({ key, value });
        },
        async getPin() {
            return this.get('pin');
        },
        async setPin(pin) {
            return this.set('pin', pin);
        },
        async getCurrentLocationId() {
            return this.get('currentLocationId');
        },
        async setCurrentLocationId(id) {
            return this.set('currentLocationId', id);
        },
        async remove(key) {
            await db.collection('settings').doc(key).delete();
        }
    };

    // ===== Export / Import =====
    const DataIO = {
        async exportAll() {
            const data = {
                members: await getAll('members'),
                locations: await getAll('locations'),
                schedules: await getAll('schedules'),
                attendance: await getAll('attendance'),
                exportedAt: new Date().toISOString(),
                version: 1
            };
            return data;
        },
        async importAll(data) {
            // Clear existing data
            await clearCollection('members');
            await clearCollection('locations');
            await clearCollection('schedules');
            await clearCollection('attendance');

            // Import each record (preserve IDs if present)
            for (const m of (data.members || [])) {
                if (m.id) {
                    await setDoc('members', m);
                } else {
                    await addDoc('members', m);
                }
            }
            for (const l of (data.locations || [])) {
                if (l.id) {
                    await setDoc('locations', l);
                } else {
                    await addDoc('locations', l);
                }
            }
            for (const s of (data.schedules || [])) {
                if (s.id) {
                    await setDoc('schedules', s);
                } else {
                    await addDoc('schedules', s);
                }
            }
            for (const a of (data.attendance || [])) {
                if (a.id) {
                    await setDoc('attendance', a);
                } else {
                    await addDoc('attendance', a);
                }
            }
        }
    };

    // ===== Maintenance & Data Integrity =====
    const Maintenance = {
        /**
         * Finds and repairs schedules pointing to non-existent locations.
         * Attempts to link by name if possible, otherwise logs the orphan.
         */
        async repairOrphanedSchedules() {
            // Deprecated in favor of fullSyncWithSeed for more robust repair
            return this.fullSyncWithSeed();
        },

        /**
         * Resets all locations and schedules to match the official SeedData exactly.
         * Uses deterministic IDs to repair broken links in attendance records.
         */
        async fullSyncWithSeed() {
            console.log('🔄 Performing deep sync with official club schedule...');
            
            // 1. Get official seed data
            if (typeof SeedData === 'undefined') {
                console.error('SeedData not found');
                return 0;
            }

            const LOCS = [
                { id: 'loc-gateway-dojo', name: 'Gateway Dojo', address: 'White Rock, BC' },
                { id: 'loc-centennial-park', name: 'Centennial Park Leisure Centre', address: 'White Rock, BC' }
            ];

            // 2. Wipe existing schedules and locations to ensure no duplicates survive
            // Use batches to handle potentially large collections safely
            const [oldSchedules, oldLocations] = await Promise.all([
                db.collection('schedules').get(),
                db.collection('locations').get()
            ]);

            const wipeBatch = db.batch();
            oldSchedules.docs.forEach(doc => wipeBatch.delete(doc.ref));
            oldLocations.docs.forEach(doc => wipeBatch.delete(doc.ref));
            await wipeBatch.commit();
            console.log('🗑️ Legacy data wiped.');

            // 3. Sync from scratch
            const syncBatch = db.batch();
            
            // Re-seed Locations
            for (const loc of LOCS) {
                const { id, ...data } = loc;
                syncBatch.set(db.collection('locations').doc(id), data);
            }

            const gatewayId = 'loc-gateway-dojo';
            const centennialId = 'loc-centennial-park';
            
            const helper = {
                parseTime(str) {
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
            };

            const officialSchedules = [
                { locationId: gatewayId, name: 'Kids Beginner 1 & 2', dayOfWeek: 1, startTime: helper.parseTime('5:15pm'), endTime: helper.parseTime('6:20pm') },
                { locationId: gatewayId, name: 'Kids Advanced', dayOfWeek: 1, startTime: helper.parseTime('6:30pm'), endTime: helper.parseTime('8:00pm') },
                { locationId: gatewayId, name: 'Adults Class', dayOfWeek: 2, startTime: helper.parseTime('7:00pm'), endTime: helper.parseTime('8:30pm') },
                { locationId: centennialId, name: 'Kids Beginner 1 & 2', dayOfWeek: 2, startTime: helper.parseTime('5:10pm'), endTime: helper.parseTime('5:55pm') },
                { locationId: centennialId, name: 'Kids Advanced', dayOfWeek: 2, startTime: helper.parseTime('6:00pm'), endTime: helper.parseTime('6:55pm') },
                { locationId: centennialId, name: 'HP Class (U14, U16, U18)', dayOfWeek: 2, startTime: helper.parseTime('7:00pm'), endTime: helper.parseTime('8:50pm') },
                { locationId: gatewayId, name: 'Pre Judo + Kids Beginner 1', dayOfWeek: 3, startTime: helper.parseTime('5:15pm'), endTime: helper.parseTime('6:10pm') },
                { locationId: gatewayId, name: 'Adults Class', dayOfWeek: 3, startTime: helper.parseTime('7:00pm'), endTime: helper.parseTime('8:30pm') },
                { locationId: gatewayId, name: 'Adults Recreational', dayOfWeek: 4, startTime: helper.parseTime('7:20pm'), endTime: helper.parseTime('8:30pm') },
                { locationId: centennialId, name: 'Kids Beginner 1 & 2', dayOfWeek: 4, startTime: helper.parseTime('5:10pm'), endTime: helper.parseTime('5:55pm') },
                { locationId: centennialId, name: 'Kids Advanced', dayOfWeek: 4, startTime: helper.parseTime('6:00pm'), endTime: helper.parseTime('6:55pm') },
                { locationId: centennialId, name: 'HP Class (U14, U16, U18)', dayOfWeek: 4, startTime: helper.parseTime('7:00pm'), endTime: helper.parseTime('8:50pm') },
                { locationId: gatewayId, name: 'Pre Judo + Kids Beginner 1', dayOfWeek: 5, startTime: helper.parseTime('5:15pm'), endTime: helper.parseTime('6:00pm') },
                { locationId: gatewayId, name: 'Kids Advanced', dayOfWeek: 5, startTime: helper.parseTime('6:15pm'), endTime: helper.parseTime('7:30pm') },
                { locationId: gatewayId, name: 'Adults Class', dayOfWeek: 5, startTime: helper.parseTime('7:30pm'), endTime: helper.parseTime('9:00pm') },
                { locationId: gatewayId, name: 'Kata Class', dayOfWeek: 6, startTime: helper.parseTime('4:30pm'), endTime: helper.parseTime('5:20pm') },
                { locationId: gatewayId, name: 'Kids Beginner 2 + Advanced', dayOfWeek: 6, startTime: helper.parseTime('5:30pm'), endTime: helper.parseTime('6:45pm') },
                { locationId: gatewayId, name: 'Pre Judo + Kids Beginner 1', dayOfWeek: 0, startTime: helper.parseTime('9:30am'), endTime: helper.parseTime('10:15am') },
                { locationId: gatewayId, name: 'Kids Beginner 2 + Kids Advanced', dayOfWeek: 0, startTime: helper.parseTime('10:30am'), endTime: helper.parseTime('11:45am') },
                { locationId: gatewayId, name: 'Adults Open Mats', dayOfWeek: 0, startTime: helper.parseTime('12:00pm'), endTime: helper.parseTime('1:30pm') }
            ];

            for (const s of officialSchedules) {
                const timeSlug = s.startTime.replace(':', '');
                const scheduleId = `sch-${s.locationId.replace('loc-', '')}-${s.dayOfWeek}-${timeSlug}`;
                const locationName = s.locationId === gatewayId ? 'Gateway Dojo' : 'Centennial Park Leisure Centre';
                
                syncBatch.set(db.collection('schedules').doc(scheduleId), { 
                    ...s, 
                    locationName,
                    isActive: true 
                });
            }

            await syncBatch.commit();
            console.log('✅ Official schedule synced successfully.');
            return officialSchedules.length;
        },

        // Helper to get raw docs including IDs for maintenance
        async getAllSchedulesRaw() {
            const snapshot = await db.collection('schedules').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
    };

    return {
        open,
        Members,
        Locations,
        Schedules,
        Attendance,
        Settings,
        Maintenance,
        DataIO
    };
})();
