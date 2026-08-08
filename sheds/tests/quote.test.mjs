import { test } from 'node:test';
import assert from 'node:assert/strict';

import { looksSuspect } from '../api/quote.ts';

const lead = (over) => ({
    name: 'Dale Hoffman', phone: '(570) 555-0134', email: 'dale@example.com', ...over,
});

test('a normal enquiry is not flagged', () => {
    assert.equal(looksSuspect(lead()), false);
});

test('phone numbers are read past their punctuation', () => {
    // People type numbers however they like, and every one of these is a real
    // customer. Counting digits rather than matching a format is the only way
    // that does not flag half of them.
    for (const phone of ['570-555-0134', '5705550134', '+1 570 555 0134', '(570) 555 0134 ext 2']) {
        assert.equal(looksSuspect(lead({ phone })), false, `flagged a real number: ${phone}`);
    }
});

test('too few digits to call back is flagged', () => {
    assert.equal(looksSuspect(lead({ phone: '555' })), true);
});

test('an unusable email is flagged', () => {
    assert.equal(looksSuspect(lead({ email: 'dale at example dot com' })), true);
    assert.equal(looksSuspect(lead({ email: 'dale@example' })), true);
});

test('a URL in the name field is flagged', () => {
    // The signature of a bot filling in every input on the page.
    assert.equal(looksSuspect(lead({ name: 'buy now https://spam.example' })), true);
});

test('flagging is advisory — it never decides whether a lead is kept', () => {
    // The handler stores the lead either way and this only sets a column. The
    // assertion is here so that a later change making this a rejection test
    // has to delete a test that says, in words, not to.
    assert.equal(typeof looksSuspect(lead({ phone: '1' })), 'boolean');
});
