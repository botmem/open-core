---
phase: quick-4
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/contacts/contacts.service.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - Contact merge suggestions trigger for obvious name variants (e.g., "AMR", "AMR ESSAM")
    - Device identifiers (owntracks format "amr/iphone") don't appear in the people contact list
    - Device entities still exist in database and graph (just filtered from UI)
  artifacts:
    - path: apps/api/src/contacts/contacts.service.ts
      provides: Improved merge suggestion logic + device identifier filtering
  key_links:
    - from: getSuggestions()
      to: merge suggestion strategies
      pattern: Strategy blocks for name matching
    - from: list()
      to: device identifier filtering
      pattern: entityType filtering logic
---

<objective>
Fix contact merge suggestions for obvious duplicate names and filter device identifiers from the people list.

Purpose: OwnTracks device identifiers (amr/iphone) shouldn't appear as "people" — they're graph entities. Merge suggestions need stronger matching logic to catch name variants like "AMR" → "AMR ESSAM".

Output: Updated contacts.service.ts with:

1. Improved substring matching in getSuggestions() that catches prefixes like "amr" in "amr essam"
2. Device identifier filtering in list() to hide owntracks format identifiers
   </objective>

<execution_context>
@/Users/amr/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@/Users/amr/Projects/botmem/CLAUDE.md — Project conventions (contact model, entity types, connector patterns)
@/Users/amr/Projects/botmem/.planning/STATE.md — Project state: Phase 22 PostgreSQL migration complete
@/Users/amr/Projects/botmem/apps/api/src/contacts/contacts.service.ts — Current implementation with getSuggestions() and list() methods
</context>

<tasks>

<task type="auto">
  <name>Task 1: Improve merge suggestion strategies for name variants</name>
  <files>apps/api/src/contacts/contacts.service.ts</files>
  <action>
Update getSuggestions() method to improve Strategy 2 (substring matching):

1. **Fix substring matching threshold**: Currently checks "shorter >= 4 && shorter/longer >= 0.4". This misses "AMR" (3 chars) matching "AMR ESSAM". Change to:
   - Allow names as short as 3 chars if they're a complete word (split on spaces)
   - If shorter name is a complete first/last word of longer name, suggest merge
   - Example: "amr" matches "amr essam" because "amr" = first word

2. **Improve Strategy 3** (shared first name): Add fallback for 3-char first names that appear in co-occurrence or same connector:
   - Current code skips "firstA.length >= 3 && firstA === firstB" — this is correct
   - But add: if firstA === firstB AND firstA.length === 3 AND coOccurrence.has(pairKey), suggest merge
   - This catches cases like "AMR" + "AMR ESSAM" appearing together in memories

3. **Add Strategy 3.5** (prefix matching for very short names): After Strategy 3, add:
   - If both names are very short (3-5 chars each) and one starts with the other (e.g., "amr" starts with "a", "amr essam" starts with "a"), check co-occurrence or shared non-name identifier
   - This is conservative: only suggests if there's additional signal (co-occurrence or email match)

Implementation notes:

- Use .split(/\s+/) to extract words from displayName
- Normalize to lowercase for comparison (already done: nameA = c1.displayName.toLowerCase().trim())
- Check coOccurrence.has(pairKey) before suggesting (already available)
- Preserve existing exact match and cross-connector strategies
  </action>
  <verify>
  <automated>npm test -- --filter=contacts.service apps/api/src/contacts/**tests**/contacts.service.test.ts</automated>
  </verify>
  <done>Merge suggestions now trigger for "AMR" + "AMR ESSAM" pairs that co-occur or share identifiers. Tests pass.</done>
  </task>

<task type="auto">
  <name>Task 2: Filter device identifiers from people list</name>
  <files>apps/api/src/contacts/contacts.service.ts</files>
  <action>
Update list() method to filter out device-format identifiers from people contacts:

1. **Identify device identifier pattern**: OwnTracks format is "user/device" (e.g., "amr/iphone"). Add helper function:

   ```typescript
   const isDeviceIdentifier = (ident: typeof contactIdentifiers): boolean => {
     const { identifierType, identifierValue } = ident;
     // OwnTracks device: type='device' or 'handle', value matches 'user/device' format
     if (identifierType === 'device' && identifierValue.includes('/')) return true;
     // Also check owntracks-specific patterns if stored as handle: 'connector_user/device'
     if (identifierType === 'handle' && identifierValue.match(/^[\w]+\/[\w]+$/)) {
       // Could be device format — check if it's from owntracks connector
       return true;
     }
     return false;
   };
   ```

2. **Filter in list() method**: After building identsByContact map (line ~393), add:
   - For each contact in the people list with entityType === null or 'person'
   - Check all its identifiers
   - If ALL identifiers are device identifiers, exclude from results
   - If SOME are device identifiers, keep the contact (it has real people identifiers too)

3. **Update total count**: If filtering out contacts, the count needs adjustment:
   - Option A (simpler): Recompute count after filtering — count(total) - count(filtered)
   - Option B (better): Add WHERE clause to exclude device-only contacts in initial count query
   - Use Option B: Modify the count query to exclude device-only contacts. This requires a subquery or CTE.

4. **Alternative approach** (recommended): Add isDeviceOnlyContact flag during contact fetch:
   - Check if a contact has NO non-device identifiers
   - Filter these out before returning
   - This is cleaner than subqueries

Implementation notes:

- Device identifier types: likely 'device', 'handle', or 'owntracks_device'
- Device format: 'user/device' or 'connector:user/device'
- Keep the contact in the graph/database — only hide from people list
- Preserve pagination: if page 1 has 45 people (after filtering), return 45 items, update total

  </action>
  <verify>
    <automated>npm test -- --filter=contacts.service apps/api/src/contacts/__tests__/contacts.service.test.ts</automated>
  </verify>
  <done>Device identifiers (amr/iphone format) are excluded from the people list. Total count is accurate. Device contacts still exist in database.</done>
</task>

</tasks>

<verification>
After both tasks complete:

1. **Merge suggestions**: Run `curl -X GET http://localhost:12412/api/people/suggestions` (after creating test contacts "AMR" and "AMR ESSAM" that co-occur)
   - Should return suggestion with reason like "Display names match..." or "Share first name 'amr'..."

2. **Device filtering**: Run `curl -X GET http://localhost:12412/api/people`
   - Should NOT include contacts with only "amr/iphone" type identifiers
   - Should include contacts that have email + device identifiers

3. **Database consistency**: Verify device contacts still exist in DB:
   - `SELECT COUNT(*) FROM contacts WHERE display_name LIKE '%iphone%' OR id IN (SELECT contact_id FROM contact_identifiers WHERE identifier_value LIKE '%/%')`
   - Should return > 0 (devices still in DB)
     </verification>

<success_criteria>

- Merge suggestions trigger for "AMR" + "AMR ESSAM" pairs with co-occurrence or shared identifiers
- Device contacts (owntracks format) don't appear in GET /api/people results
- Device contacts still exist in database and can be queried via graph endpoints
- All existing tests pass
  </success_criteria>

<output>
After completion, create `.planning/quick/4-fix-contact-merge-suggestions-for-duplic/4-SUMMARY.md`
</output>
