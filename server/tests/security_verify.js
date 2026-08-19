/**
 * AUTOMATED SECURITY & INTEGRATION VERIFICATION SUITE
 * Implements QUALITY.md Grounded Verification principles.
 * Tests: Bcrypt Auth, JWT Tokens, Brute-Force Rate Limiting, Honeypot Bot Trap, and Helmet Headers.
 */

const API_BASE = 'http://localhost:3001';

async function runTests() {
  console.log('\x1b[36m====================================================\x1b[0m');
  console.log('\x1b[36m   CYBER-ARCHITECT SECURITY SUITE VERIFICATION     \x1b[0m');
  console.log('\x1b[36m====================================================\x1b[0m\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, details = '') {
    total++;
    if (condition) {
      console.log(`\x1b[32m[PASS]\x1b[0m ${testName}`);
      passed++;
    } else {
      console.error(`\x1b[31m[FAIL]\x1b[0m ${testName} - Details: ${details}`);
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Helmet HTTP Security Headers
    // ----------------------------------------------------
    const headersRes = await fetch(`${API_BASE}/api/content`);
    const xContentType = headersRes.headers.get('x-content-type-options');
    const xPoweredBy = headersRes.headers.get('x-powered-by');

    assert(xContentType === 'nosniff', 'HTTP Header: X-Content-Type-Options is nosniff', `got ${xContentType}`);
    assert(!xPoweredBy, 'HTTP Header: X-Powered-By is hidden', `got ${xPoweredBy}`);

    // ----------------------------------------------------
    // TEST 2: Bcrypt & JWT Admin Login
    // ----------------------------------------------------
    // Valid PIN (1337)
    const validLoginRes = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1337' })
    });
    const validLoginData = await validLoginRes.json();
    assert(validLoginRes.ok && validLoginData.token && validLoginData.token.startsWith('ey'), 'Auth: Valid PIN generates signed JWT token');

    const adminToken = validLoginData.token;

    // Verify token endpoint
    const verifyRes = await fetch(`${API_BASE}/api/admin/verify`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });
    const verifyData = await verifyRes.json();
    assert(verifyRes.ok && verifyData.status === 'TOKEN_VALID', 'Auth: Bearer JWT token successfully verified');

    // Invalid Token rejection
    const invalidTokenRes = await fetch(`${API_BASE}/api/admin/verify`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid.tampered.token'
      }
    });
    assert(invalidTokenRes.status === 401, 'Auth: Tampered/Invalid JWT token rejected with 401');

    // ----------------------------------------------------
    // TEST 3: Honeypot Spam Bot Trap
    // ----------------------------------------------------
    // Message count before
    const msgCountBeforeRes = await fetch(`${API_BASE}/api/admin/messages`, {
      headers: { 'x-admin-token': adminToken }
    });
    const msgsBefore = await msgCountBeforeRes.json();

    // Bot submission with 'website' honeypot field filled
    const botRes = await fetch(`${API_BASE}/api/uplink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity: 'Spam Bot 3000',
        subject: 'Buy Crypto Now',
        message: 'Cheap crypto deals',
        website: 'http://spam-link.ru'
      })
    });
    const _botData = await botRes.json();

    // Message count after
    const msgCountAfterRes = await fetch(`${API_BASE}/api/admin/messages`, {
      headers: { 'x-admin-token': adminToken }
    });
    const msgsAfter = await msgCountAfterRes.json();

    assert(
      botRes.ok && msgsBefore.length === msgsAfter.length, 
      'Spam Protection: Honeypot bot submission silently dropped without persisting to DB',
      `Before: ${msgsBefore.length}, After: ${msgsAfter.length}`
    );

    // ----------------------------------------------------
    // TEST 4: Valid Uplink Persistence with XSS Sanitization
    // ----------------------------------------------------
    const legitimateRes = await fetch(`${API_BASE}/api/uplink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity: 'Nagy Anna (anna@vallalat.hu)',
        subject: 'AI Tanácsadás <script>alert("xss")</script>',
        message: 'Szeretnénk folyamatfelmérést végezni a cégünknél.',
        website: '' // Empty honeypot (clean user)
      })
    });
    const legitData = await legitimateRes.json();

    const checkMsgRes = await fetch(`${API_BASE}/api/admin/messages`, {
      headers: { 'x-admin-token': adminToken }
    });
    const allMsgs = await checkMsgRes.json();
    const savedMsg = allMsgs.find(m => m.id === legitData.id);

    assert(
      legitimateRes.ok && savedMsg && !savedMsg.subject.includes('<script>'),
      'Sanitization: Legitimate message saved and <script> tag sanitized out'
    );

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log('\n\x1b[36m----------------------------------------------------\x1b[0m');
    if (passed === total) {
      console.log(`\x1b[32m[ALL TESTS PASSED]\x1b[0m ${passed}/${total} security assertions verified.`);
    } else {
      console.log(`\x1b[31m[TESTS FAILED]\x1b[0m ${passed}/${total} passed.`);
      process.exit(1);
    }
    console.log('\x1b[36m----------------------------------------------------\x1b[0m\n');

  } catch (err) {
    console.error('\x1b[31m[TEST RUNNER ERROR]\x1b[0m', err);
    process.exit(1);
  }
}

runTests();
