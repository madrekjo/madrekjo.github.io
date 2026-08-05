const fs = require('fs');
const path = require('path');

function stubEl() {
  return {
    style: {}, classList: { add(){}, remove(){}, toggle(){} },
    setAttribute(){}, appendChild(){}, addEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    focus(){}, remove(){}, scrollTop: 0, scrollHeight: 0, textContent: '',
  };
}

const stub = stubEl();
global.window = global;
global.document = {
  readyState: 'complete',
  addEventListener() {},
  currentScript: { src: 'C:/Users/abdal_cw9hjgr/OneDrive/Desktop/مدارك جو موقع جديد/js/chatbot.js' },
  getElementById: () => stubEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { getAttribute: (attr) => (attr === 'data-year' ? '2009' : 'engineering') },
  createElement: () => stubEl(),
  head: { appendChild(){} },
};
global.document.body.appendChild = () => {};

const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'chatbot.js'), 'utf8');
eval(code);
console.log('LOAD OK — chatbot.js ran without errors in stub DOM');
