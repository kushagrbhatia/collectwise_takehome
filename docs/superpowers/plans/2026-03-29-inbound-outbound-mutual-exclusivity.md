# Inbound/Outbound Mutual Exclusivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a validation hard error when both `inbound` and `outbound` are 1, since a call cannot be both inbound and outbound simultaneously.

**Architecture:** One change to `scripts/validate.js` — add mutual exclusivity check after `inbound`/`outbound` are parsed. One new test in `tests/validate.test.js`. No other files change.

**Tech Stack:** Node.js, Jest

---

## File Map

| File | Change |
|------|--------|
| `scripts/validate.js` | Add mutual exclusivity error after line 47 |
| `tests/validate.test.js` | Add 1 new test for the mutual exclusivity error |

---

### Task 1: Enforce inbound/outbound mutual exclusivity

**Files:**
- Modify: `scripts/validate.js:47`
- Modify: `tests/validate.test.js`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/validate.test.js` inside the `describe('validateRow', ...)` block, after the existing `'missing outbound defaults to 0'` test:

```javascript
test('both inbound and outbound set to 1 is a hard error', () => {
  const row = baseRow();
  row.inbound = '1';
  row.outbound = '1';
  const result = validateRow(row, 2);
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.errors.some(e => /inbound/i.test(e) && /outbound/i.test(e))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest tests/validate.test.js --no-coverage
```

Expected: 14 pass, 1 FAIL — `both inbound and outbound set to 1 is a hard error`

- [ ] **Step 3: Add mutual exclusivity check to scripts/validate.js**

After line 47 (`const outbound = ...`), add:

```javascript
  // Mutual exclusivity — a call cannot be both inbound and outbound
  if (inbound === 1 && outbound === 1) {
    errors.push(`${loc()}: inbound and outbound cannot both be 1`);
  }
```

The file section around lines 45–50 should now look like:

```javascript
  // inbound / outbound — default 0 if missing or not exactly 0/1
  const inbound = (row.inbound === '1' || row.inbound === 1) ? 1 : 0;
  const outbound = (row.outbound === '1' || row.outbound === 1) ? 1 : 0;

  // Mutual exclusivity — a call cannot be both inbound and outbound
  if (inbound === 1 && outbound === 1) {
    errors.push(`${loc()}: inbound and outbound cannot both be 1`);
  }
```

- [ ] **Step 4: Run all tests**

```bash
npx jest --no-coverage
```

Expected: 32 passed, 0 failed (31 existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add scripts/validate.js tests/validate.test.js
git commit -m "feat: hard error when inbound and outbound are both 1"
```
