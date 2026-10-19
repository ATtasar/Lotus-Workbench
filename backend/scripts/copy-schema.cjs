const fs = require('node:fs');
fs.copyFileSync('src/schema.sql', 'dist/backend/src/schema.sql');
