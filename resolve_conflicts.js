const fs = require('fs');
const content = fs.readFileSync('content.js', 'utf8');
// Regex to match conflict block and capture remote part
// <<<<<<< HEAD ... ======= (group 1) >>>>>>> ...
const newContent = content.replace(/<<<<<<< HEAD[\s\S]*?=======([\s\S]*?)>>>>>>> [^\r\n]*/g, '$1');
fs.writeFileSync('content.js', newContent, 'utf8');
console.log('Done');
