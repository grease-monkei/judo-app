/**
 * Members Screen — View, add, edit, and manage club members
 */

const MembersScreen = (() => {

    // FIX: getJudoAgeCategory removed from here.
    // It now lives exclusively in utils.js as Utils.getJudoAgeCategory.
    // This was a duplicated function — any update to the age rules now only
    // needs to happen in one place.

    // Retained as a local helper (not age category logic) — calculates exact age in years
    function getAge(birthday) {
        const today = new Date();
        const dob = new Date(birthday);
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        return age;
    }


    async function render() {
        await renderList();
    }


    async function renderList() {
        const container = document.getElementById('main-content');
        const members = await DB.Members.getAll();

        const activeMembers = members.filter(m => m.isActive !== false);
        const inactiveMembers = members.filter(m => m.isActive === false);

        container.innerHTML = `
            <div class="screen" id="members-screen">
                <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h2 class="section-title">Members</h2>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-gold btn-sm" onclick="MembersScreen.showMemberForm()">+ Add Member</button>
                    </div>
                </div>

                <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="MembersScreen.exportMembers()">📥 Export CSV</button>
                    <label class="btn btn-secondary btn-sm" style="cursor: pointer;">
                        📤 Import CSV
                        <input type="file" accept=".csv" style="display: none;" onchange="MembersScreen.importMembers(event)">
                    </label>
                </div>

                <div class="signin-stats" style="margin-bottom: 16px;">
                    <div class="stat-card">
                        <div class="stat-number">${activeMembers.length}</div>
                        <div class="stat-label">Active Members</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${members.length}</div>
                        <div class="stat-label">Total Registered</div>
                    </div>
                </div>

                <div id="members-list">
                    ${activeMembers.length === 0 ? `
                        <div class="empty-state" style="padding: 32px 16px;">
                            <span class="empty-state-icon">👥</span>
                            <p class="empty-state-desc">No members yet. Add your first member to get started.</p>
                        </div>
                    ` : activeMembers.map(member => renderMemberCard(member)).join('')}

                    ${inactiveMembers.length > 0 ? `
                        <div style="margin-top: 24px; border-top: 1px solid var(--border-color); padding-top: 16px;">
                            <h3 style="font-size: 14px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Inactive Members (${inactiveMembers.length})</h3>
                            ${inactiveMembers.map(member => renderMemberCard(member, true)).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }


    function renderMemberCard(member, isInactive = false) {
        // FIX: Use Utils.getJudoAgeCategory — the shared, single-source version
        const ageCategory = member.birthday ? Utils.getJudoAgeCategory(member.birthday) : '';
        const age = member.birthday ? getAge(member.birthday) : null;

        return `
            <div class="member-card ${isInactive ? 'opacity-50' : ''}"
                 onclick="MembersScreen.showMemberDetail('${member.id}')"
                 style="cursor: pointer;">
                <div class="member-card-info">
                    <div class="member-card-name">${Utils.escapeHTML(member.firstName)} ${Utils.escapeHTML(member.lastName)}</div>
                    <div class="member-card-detail">
                        ${member.belt ? Utils.escapeHTML(member.belt) + ' Belt' : 'No belt recorded'}
                        ${ageCategory ? ` · ${ageCategory}` : ''}
                        ${age !== null ? ` (age ${age})` : ''}
                    </div>
                </div>
                <div class="member-card-arrow">›</div>
            </div>
        `;
    }


    async function showMemberDetail(memberId) {
        const member = await DB.Members.getById(memberId);
        if (!member) return;

        const container = document.getElementById('main-content');
        // FIX: Use Utils.getJudoAgeCategory
        const ageCategory = member.birthday ? Utils.getJudoAgeCategory(member.birthday) : '';
        const age = member.birthday ? getAge(member.birthday) : null;
        const attendanceHistory = await DB.Attendance.getByMember(memberId);

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card" style="max-width: 480px; width: 95vw; max-height: 85vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="font-size: 20px; margin: 0;">${Utils.escapeHTML(member.firstName)} ${Utils.escapeHTML(member.lastName)}</h2>
                    <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()" style="font-size: 20px;">✕</button>
                </div>

                <div style="display: grid; gap: 12px; margin-bottom: 20px;">
                    ${member.belt ? `<div class="settings-item"><span class="settings-item-title">Belt</span><span style="color: var(--accent-gold);">${Utils.escapeHTML(member.belt)}</span></div>` : ''}
                    ${member.birthday ? `<div class="settings-item"><span class="settings-item-title">Age</span><span>${age} years old (${ageCategory})</span></div>` : ''}
                    ${member.email ? `<div class="settings-item"><span class="settings-item-title">Email</span><a href="mailto:${Utils.escapeHTML(member.email)}" style="color: var(--accent-blue);">${Utils.escapeHTML(member.email)}</a></div>` : ''}
                    ${member.phone ? `<div class="settings-item"><span class="settings-item-title">Phone</span><span>${Utils.escapeHTML(member.phone)}</span></div>` : ''}
                    <div class="settings-item"><span class="settings-item-title">Classes Attended</span><span style="font-weight: 700; color: var(--accent-gold);">${member.attendanceCount || attendanceHistory.length}</span></div>
                    <div class="settings-item"><span class="settings-item-title">Status</span><span style="color: ${member.isActive !== false ? 'var(--accent-green)' : 'var(--text-muted)'};">${member.isActive !== false ? 'Active' : 'Inactive'}</span></div>
                </div>

                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-gold btn-sm" onclick="MembersScreen.showMemberForm('${member.id}'); this.closest('.modal-overlay').remove();">Edit</button>
                    <button class="btn btn-secondary btn-sm" onclick="MembersScreen.toggleMemberActive('${member.id}', ${member.isActive !== false})">
                        ${member.isActive !== false ? 'Mark Inactive' : 'Mark Active'}
                    </button>
                    <button class="btn btn-sm" style="color: var(--accent-red); border-color: var(--accent-red);" onclick="MembersScreen.deleteMember('${member.id}')">Delete</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }


    let onSaveCallback = null;

    async function showMemberForm(memberId = null, onSuccess = null) {
        onSaveCallback = onSuccess;
        const member = memberId ? await DB.Members.getById(memberId) : null;
        const title = member ? 'Edit Member' : 'Add New Member';

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-card" style="max-width: 480px; width: 95vw; max-height: 85vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="font-size: 20px; margin: 0;">${title}</h2>
                    <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()" style="font-size: 20px;">✕</button>
                </div>

                <div class="form-group">
                    <label class="form-label">First Name *</label>
                    <input type="text" class="form-input" id="member-first-name" value="${Utils.escapeHTML(member?.firstName || '')}" autocapitalize="words">
                </div>
                <div class="form-group">
                    <label class="form-label">Last Name *</label>
                    <input type="text" class="form-input" id="member-last-name" value="${Utils.escapeHTML(member?.lastName || '')}" autocapitalize="words">
                </div>
                <div class="form-group">
                    <label class="form-label">Belt Rank</label>
                    <select class="form-select" id="member-belt">
                        ${['', 'White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'].map(b =>
                            `<option value="${b}" ${member?.belt === b ? 'selected' : ''}>${b || 'Select belt…'}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Date of Birth</label>
                    <input type="date" class="form-input" id="member-birthday" value="${member?.birthday || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" class="form-input" id="member-email" value="${Utils.escapeHTML(member?.email || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">Phone</label>
                    <input type="tel" class="form-input" id="member-phone" value="${Utils.escapeHTML(member?.phone || '')}">
                </div>

                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button class="btn btn-gold" style="flex: 1;" onclick="MembersScreen.saveMember('${memberId || ''}')">
                        ${member ? 'Save Changes' : 'Add Member'}
                    </button>
                    <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        setTimeout(() => document.getElementById('member-first-name')?.focus(), 100);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }


    async function saveMember(memberId) {
        const firstName = document.getElementById('member-first-name')?.value.trim();
        const lastName = document.getElementById('member-last-name')?.value.trim();
        const belt = document.getElementById('member-belt')?.value;
        const birthday = document.getElementById('member-birthday')?.value;
        const email = document.getElementById('member-email')?.value.trim();
        const phone = document.getElementById('member-phone')?.value.trim();

        if (!firstName || !lastName) {
            alert('First name and last name are required.');
            return;
        }

        const data = { firstName, lastName, belt, birthday, email, phone };

        if (memberId) {
            const existing = await DB.Members.getById(memberId);
            await DB.Members.update({ ...existing, ...data });
        } else {
            const currentLocationId = await DB.Settings.getCurrentLocationId();
            const newMember = await DB.Members.add({ 
                ...data, 
                isActive: true, 
                attendanceCount: 0,
                primaryLocationId: currentLocationId 
            });
            
            if (onSaveCallback) {
                onSaveCallback(newMember);
                onSaveCallback = null;
            }
        }

        document.querySelector('.modal-overlay')?.remove();
        if (App.getCurrentScreen() === 'members') {
            await renderList();
        }
    }


    async function toggleMemberActive(memberId, currentlyActive) {
        const member = await DB.Members.getById(memberId);
        if (!member) return;
        await DB.Members.update({ ...member, isActive: !currentlyActive });
        document.querySelector('.modal-overlay')?.remove();
        await renderList();
    }


    async function deleteMember(memberId) {
        const member = await DB.Members.getById(memberId);
        if (!member) return;

        if (confirm(`Delete ${member.firstName} ${member.lastName}? This cannot be undone.`)) {
            await DB.Members.remove(member.id);
            document.querySelector('.modal-overlay')?.remove();
            await renderList();
        }
    }


    async function exportMembers() {
        const members = await DB.Members.getAll();
        if (members.length === 0) {
            alert('No members to export.');
            return;
        }

        // FIX: Use Utils.getJudoAgeCategory
        Utils.exportCSV(members, [
            { label: 'First Name', value: 'firstName' },
            { label: 'Last Name', value: 'lastName' },
            { label: 'Email', value: 'email' },
            { label: 'Phone', value: 'phone' },
            { label: 'Belt', value: 'belt' },
            { label: 'Birthday', value: 'birthday' },
            { label: 'Age Category', value: m => m.birthday ? Utils.getJudoAgeCategory(m.birthday) : '' },
            { label: 'Classes Attended', value: 'attendanceCount' },
            { label: 'Active', value: m => m.isActive !== false ? 'Yes' : 'No' }
        ], 'judo_members.csv');
    }


    async function importMembers(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await Utils.readFileAsText(file);
            // FIX: Utils.parseCSV now strips \r before parsing, so Windows CSVs work correctly
            const rows = Utils.parseCSV(text);

            if (rows.length === 0) {
                alert('No data found in CSV file.');
                return;
            }

            let imported = 0;
            for (const row of rows) {
                const firstName = row['First Name'] || row['first_name'] || row['firstName'] || '';
                const lastName = row['Last Name'] || row['last_name'] || row['lastName'] || '';

                if (firstName.trim() && lastName.trim()) {
                    await DB.Members.add({
                        firstName: firstName.trim(),
                        lastName: lastName.trim(),
                        email: row['Email'] || row['email'] || '',
                        phone: row['Phone'] || row['phone'] || '',
                        belt: row['Belt'] || row['belt'] || ''
                    });
                    imported++;
                }
            }

            alert(`Successfully imported ${imported} members.`);
            event.target.value = ''; // Reset file input
            await renderList();
        } catch (err) {
            alert('Error importing CSV: ' + err.message);
        }
    }


    return {
        render,
        showMemberForm,
        showMemberDetail,
        saveMember,
        toggleMemberActive,
        deleteMember,
        exportMembers,
        importMembers
    };
})();
