/* ============================================================
   المكتبة — حرس الأمان (فحص الملفات قبل الرفع)
   ------------------------------------------------------------
   فحص دفاعي فوري داخل المتصفح يمنع:
     • الملفات التنفيذية/البرامج المتخفّية بأي امتداد (exe/elf/script/Office ماكرو).
     • الملفات متعدّدة الصيغ (polyglot) التي يُلحَق بها أرشيف ZIP داخل صورة/PDF.
     • ملفات PDF التي تحتوي أكواداً أو ملفات مضمّنة (JavaScript/Launch/EmbeddedFile/RichMedia).
     • أسماء الملفات المخادعة (امتداد مزدوج أو أحرف تحكّم مخفية).

   تنبيه: هذه طبقة حماية فورية تمنع الحالات الخطرة الشائعة،
   وليست بديلاً عن محرّك مضاد فيروسات خارجي (يُفعَّل بشكل منفصل).
   ============================================================ */

window.MaktabetGuard = (function () {
  'use strict';

  var MAX_SCAN = 12 * 1024 * 1024; // نفحص حتى 12MB من محتوى الملف

  // بصمات رؤوس الملفات (Magic bytes)
  var HEAD_SIGS = [
    { kind: 'pdf', sig: [0x25, 0x50, 0x44, 0x46] }, // %PDF
    { kind: 'jpg', sig: [0xff, 0xd8, 0xff] },
    { kind: 'png', sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { kind: 'zip', sig: [0x50, 0x4b, 0x03, 0x04] },
    { kind: 'zip', sig: [0x50, 0x4b, 0x05, 0x06] },
    { kind: 'gzip', sig: [0x1f, 0x8b] },
    { kind: 'rar', sig: [0x52, 0x61, 0x72, 0x21] }, // Rar!
    { kind: '7z', sig: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
    { kind: 'exe', sig: [0x4d, 0x5a] }, // MZ
    { kind: 'elf', sig: [0x7f, 0x45, 0x4c, 0x46] }, // ELF
    { kind: 'ole', sig: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // Office قديم (ماكرو)
    { kind: 'script', sig: [0x23, 0x21] }, // #!
  ];

  var KIND_LABEL = {
    pdf: 'PDF', jpg: 'JPEG', png: 'PNG', zip: 'أرشيف ZIP', gzip: 'أرشيف GZIP',
    rar: 'أرشيف RAR', '7z': 'أرشيف 7-Zip', exe: 'برنامج تنفيذي (EXE/DLL)',
    elf: 'برنامج تنفيذي (Linux/ELF)', ole: 'مستند Office قديم (ماكرو)',
    script: 'سكربت تنفيذي',
  };

  // مؤشّرات الأكواد الخطرة داخل ملفات PDF
  var PDF_ACTIVE = [
    { re: /\/JavaScript\b/, why: 'كود JavaScript مضمّن' },
    { re: /\/JS[\s(/\[]/, why: 'كود JavaScript مضمّن' },
    { re: /\/Launch\b/, why: 'أمر تشغيل برنامج خارجي' },
    { re: /\/EmbeddedFile\b/, why: 'ملف مضمّن داخل المستند' },
    { re: /\/RichMedia\b/, why: 'وسائط تفاعلية/Flash' },
  ];

  function matches(bytes, sig, at) {
    at = at || 0;
    if (bytes.length < at + sig.length) return false;
    for (var i = 0; i < sig.length; i++) {
      if (bytes[at + i] !== sig[i]) return false;
    }
    return true;
  }

  function sniff(bytes) {
    for (var i = 0; i < HEAD_SIGS.length; i++) {
      if (matches(bytes, HEAD_SIGS[i].sig, 0)) return HEAD_SIGS[i].kind;
    }
    return null;
  }

  function extOf(name) {
    var m = /\.([a-z0-9]+)\s*$/i.exec(String(name || '').trim());
    return m ? m[1].toLowerCase() : '';
  }

  function expectedKind(ext) {
    if (ext === 'pdf') return 'pdf';
    if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
    if (ext === 'png') return 'png';
    return null;
  }

  function label(kind) {
    return KIND_LABEL[kind] || String(kind || 'غير معروف').toUpperCase();
  }

  function bad(reason) {
    return { ok: false, reason: reason };
  }

  function checkName(name) {
    name = String(name || '');
    if (/[\u202a-\u202e\u2066-\u2069]/.test(name)) {
      return 'اسم الملف يحتوي أحرف تحكّم مخفية (خدعة امتداد) — أعد تسميته.';
    }
    if (/[\u0000-\u001f]/.test(name)) {
      return 'اسم الملف يحتوي رموزاً غير صالحة — أعد تسميته.';
    }
    if (/\.(pdf|jpe?g|png)\.[a-z0-9]{2,6}$/i.test(name)) {
      return 'اسم الملف يحتوي امتداداً مزدوجاً مخادعاً (مثال: file.pdf.exe) — أعد تسميته.';
    }
    return null;
  }

  // يقبل بايتات (Uint8Array) → يفحص الذيل بحثاً عن أرشيف مُلحَق (polyglot)
  function checkTail(tail) {
    var start = Math.max(0, tail.length - 256);
    for (var i = start; i <= tail.length - 4; i++) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
        return 'الملف يحتوي أرشيفاً مضغوطاً مُلحقاً داخله (نمط خطير) — مرفوض.';
      }
    }
    return null;
  }

  function decodeLatin1(bytes) {
    var out = '';
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return out;
  }

  function checkPdf(bytes) {
    var text = decodeLatin1(bytes);
    for (var i = 0; i < PDF_ACTIVE.length; i++) {
      if (PDF_ACTIVE[i].re.test(text)) {
        return 'ملف PDF مرفوض: يحتوي ' + PDF_ACTIVE[i].why + '. أعد إنشاء الملف بصيغة PDF «مسطّحة»/نظيفة.';
      }
    }
    return null;
  }

  function checkImage(bytes, kind) {
    // التحقق من بصمة النهاية لصور JPEG (اختياري لكن يكشف التلف/الدمج)
    if (kind === 'jpg' && bytes.length > 4) {
      var last = bytes[bytes.length - 2];
      var last2 = bytes[bytes.length - 1];
      if (!(last === 0xff && last2 === 0xd9) && bytes.length > 4096) {
        // ليست علامة خطورة، نتجاهلها لتفادي رفض صور سليمة
      }
    }
    return null;
  }

  function readSlice(file, start, end) {
    return file.slice(start, end).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }

  /**
   * فحص ملف كامل قبل الرفع.
   * @returns Promise<{ok:boolean, kind?:string, reason?:string}>
   */
  async function inspect(file) {
    if (!file) return bad('لم يُختَر أي ملف.');

    var nameIssue = checkName(file.name);
    if (nameIssue) return bad(nameIssue);

    var ext = extOf(file.name);
    var want = expectedKind(ext);
    if (!want) {
      return bad('الامتداد غير مسموح: .' + ext + ' — يُسمح فقط بملفات PDF و JPG و PNG.');
    }

    if (!file.size) return bad('الملف فارغ.');

    var head = await readSlice(file, 0, 16);
    var kind = sniff(head);
    if (!kind) {
      return bad('تعذّر التعرّف على نوع الملف — تأكّد أنه PDF أو JPG أو PNG سليم.');
    }
    if (kind !== want) {
      return bad('محتوى الملف لا يطابق امتداده: الملف فعلياً «' + label(kind) + '» ولكن امتداده .' + ext + ' — مرفوض.');
    }

    var scanLen = Math.min(file.size, MAX_SCAN);
    var body = await readSlice(file, 0, scanLen);

    var tailLen = Math.min(file.size, 1024);
    var tail = await readSlice(file, Math.max(0, file.size - tailLen), file.size);
    var tailIssue = checkTail(tail);
    if (tailIssue) return bad(tailIssue);

    if (kind === 'pdf') {
      var pdfIssue = checkPdf(body);
      if (pdfIssue) return bad(pdfIssue);
    } else {
      var imgIssue = checkImage(body, kind);
      if (imgIssue) return bad(imgIssue);
    }

    return { ok: true, kind: kind };
  }

  return {
    version: '1.0.0',
    inspect: inspect,
    sniff: sniff,
    label: label,
  };
})();
