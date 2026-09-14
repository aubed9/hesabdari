/**
 * Master Test Runner for ARAYESHI ERP
 * Executes Tiers 1–4 test suites using Node.js native test runner
 */

const { run } = require('node:test');
const { spec } = require('node:test/reporters');
const path = require('path');
const fs = require('fs');

function findTestFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results = results.concat(findTestFiles(fullPath));
        } else if (file.endsWith('.test.js')) {
            results.push(fullPath);
        }
    }
    return results;
}

async function runAllTests() {
    console.log('===========================================================');
    console.log('🧪 ARAYESHI Retail ERP — Automated E2E Test Suite (Tiers 1–4)');
    console.log('🔒 Isolated In-Memory SQLite Environment Active');
    console.log('===========================================================\n');

    const testsDir = path.join(__dirname);
    const testFiles = findTestFiles(testsDir);

    if (testFiles.length === 0) {
        console.error('❌ No test files found in tests/');
        process.exit(1);
    }

    console.log(`Discovered ${testFiles.length} test suite files:\n`);
    for (const f of testFiles) {
        console.log(`  • ${path.relative(path.join(__dirname, '..'), f)}`);
    }
    console.log('\n-----------------------------------------------------------\n');

    let hasFailure = false;

    const stream = run({
        files: testFiles,
        concurrency: 1 // Run sequentially to avoid in-memory proxy collisions
    });

    stream.on('test:fail', (data) => {
        hasFailure = true;
    });

    stream.compose(new spec()).pipe(process.stdout);

    await new Promise((resolve) => {
        stream.on('end', resolve);
    });

    if (hasFailure) {
        console.error('\n❌ Test suite completed with FAILURES.');
        process.exit(1);
    } else {
        console.log('\n✅ All tests PASSED successfully with complete database isolation.');
        process.exit(0);
    }
}

runAllTests().catch((err) => {
    console.error('Fatal error running test suite:', err);
    process.exit(1);
});
