const fs = require('fs'), path = require('path'), vm = require('vm');
const files = ['../store.js', '../cloud.js', 'harness.js', 'store.test.js', 'cloud.test.js'];
for (const f of files) {
  const p = path.join(__dirname, f);
  if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: f });
}
const { failed } = runTests(console.log);
process.exit(failed ? 1 : 0);
