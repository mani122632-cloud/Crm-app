// scripts/copy-www.js — copies web assets into www/ for Capacitor (no bundler needed)
// Full list kept in sync with the <script>/<link> tags in index.html.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dest = path.join(root, 'www');
const files = [
  'index.html', 'manifest.json',
  'style.css', 'ui-redesign.css',
  'db.js', 'repo.js', 'services.js', 'extensions.js', 'app.js',
  'features.js', 'customer360.js', 'dashboard.js', 'advanced-filters.js',
  'safe-backup.js', 'help.js', 'native.js', 'contacts-auto.js', 'notif-fix.js'
];
if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
let ok = 0;
for (const f of files) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) { console.error('MISSING: ' + f + ' (build stopped)'); process.exit(1); }
  fs.copyFileSync(src, path.join(dest, f));
  ok++;
}
console.log('www/ ready: ' + ok + ' files copied.');