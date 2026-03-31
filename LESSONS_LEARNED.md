# Antigravity Lessons Learned: White Rock Judo Club

This document contains critical technical findings and common pitfalls discovered during development to ensure future updates are robust.

## ⚠️ Critical: Firestore "Undefined" Error
**Problem**: Google Firestore throws a fatal error if you attempt to add or set a document where any field has a value of `undefined`.
```javascript
// This will crash if locationId is missing from the record object
const attendance = {
    locationId: record.locationId, 
    ...
};
await db.collection('attendance').add(attendance);
```

**Solution**: Always ensure that optional fields have a fallback value (like an empty string or `null`) before passing the object to Firestore.
```javascript
// Correct pattern implemented in js/db.js
const attendance = {
    locationId: record.locationId || '',
    locationName: record.locationName || '',
    ...
};
```

**Context**: This issue was discovered when simplifying `js/screens/signin.js`. The caller omitted the location fields, which caused `db.js` to pass `undefined` to Firestore, breaking the sign-in functionality.

## 🔄 Netlify Deployment on Windows
**Environment**: On some Windows systems, PowerShell execution policies may block standard `netlify` or `npx netlify` commands because they are `.ps1` scripts.
**Workaround**: Use `cmd.exe /c` to bypass the PowerShell script restriction.
```powershell
cmd.exe /c "npx netlify deploy --prod --dir=."
```

## 🧹 Code Integrity
- **escapeHTML**: Reverted to a DOM-based implementation (`document.createElement('div').textContent`) as it is the club's "original" preferred version, even though regex-based alternatives might be slightly faster.
- **Attendance Mapping**: Keep `js/db.js` as the defensive layer for mapping API requests to Firestore documents.
