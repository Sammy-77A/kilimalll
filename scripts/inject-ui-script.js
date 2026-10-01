const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(publicDir);

let updatedCount = 0;

files.forEach(file => {
  if (file.endsWith('.html')) {
    const filePath = path.join(publicDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    if (!content.includes('/js/kilimall-ui.js')) {
      if (content.includes('</body>')) {
        content = content.replace('</body>', '<script src="/js/kilimall-ui.js" defer></script></body>');
        fs.writeFileSync(filePath, content, 'utf8');
        updatedCount++;
        console.log(`✅ Injected kilimall-ui.js into ${file}`);
      }
    }
  }
});

console.log(`Done! Updated ${updatedCount} HTML files.`);
