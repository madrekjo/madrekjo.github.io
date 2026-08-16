import { runGenerate } from './generator.js';
import { cmdPause, cmdResume, cmdExtract, cmdScan, cmdValidate } from './run.js';
import { printStatus } from './status.js';

const HELP = `
Question Factory — توليد أسئلة المنهج من كتب PDF

الأوامر:
  scan                     فحص الكتب والبنية المستخرجة
  extract                  استخراج نصوص الكتب من PDF (يعيد الاستخراج)
  generate                 تشغيل المعالجة على قائمة المهام
  generate -- --test       وضع الاختبار (كتاب واحد، وحدة واحدة، درس واحد، 10 أسئلة)
  generate -- --mock       توليد محلي تجريبي بدون API (للاختبار فقط)
  status                   عرض حالة النظام
  validate                 فحص سلامة ملفات الأسئلة
  pause                    إيقاف مؤقت (يحفظ التقدم)
  resume                   استئناف بعد الإيقاف
`;

function args() {
  const argv = process.argv.slice(2);
  return {
    command: argv.find((a) => !a.startsWith('--')) || '',
    test: argv.includes('--test'),
    mock: argv.includes('--mock'),
    force: argv.includes('--force')
  };
}

async function main() {
  const { command, test, mock, force } = args();

  switch (command) {
    case 'scan':
      await cmdScan();
      break;
    case 'extract':
      await cmdExtract();
      break;
    case 'generate':
      await runGenerate({ testMode: test, mock });
      break;
    case 'status':
      printStatus();
      break;
    case 'validate':
      cmdValidate();
      break;
    case 'pause':
      cmdPause();
      break;
    case 'resume':
      cmdResume();
      break;
    default:
      console.log(HELP);
      if (command) console.log('أمر غير معروف: ' + command);
  }
}

main().catch((err) => {
  console.error('خطأ غير متوقع: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
