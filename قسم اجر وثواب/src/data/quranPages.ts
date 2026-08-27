// Quran daily pages
// Verses are fetched from api.alquran.cloud to guarantee complete, unabridged text
// Surah numbers follow the standard Mushaf order

export interface QuranPageMeta {
  page: number;
  surahName: string;
  surahNumber: number;
  startAyah: number;
  endAyah: number;
}

// Pages 1-26 keep the old 10-ayah schedule.
// Page 27 starts the new 15-ayah schedule from Al-Baqarah ayah 258.
export const quranPages: QuranPageMeta[] = [
  { page: 1, surahName: "الفاتحة", surahNumber: 1, startAyah: 1, endAyah: 7 },
  { page: 2, surahName: "البقرة", surahNumber: 2, startAyah: 1, endAyah: 10 },
  { page: 3, surahName: "البقرة", surahNumber: 2, startAyah: 11, endAyah: 20 },
  { page: 4, surahName: "البقرة", surahNumber: 2, startAyah: 21, endAyah: 30 },
  { page: 5, surahName: "البقرة", surahNumber: 2, startAyah: 31, endAyah: 40 },
  { page: 6, surahName: "البقرة", surahNumber: 2, startAyah: 41, endAyah: 50 },
  { page: 7, surahName: "البقرة", surahNumber: 2, startAyah: 51, endAyah: 60 },
  { page: 8, surahName: "البقرة", surahNumber: 2, startAyah: 61, endAyah: 70 },
  { page: 9, surahName: "البقرة", surahNumber: 2, startAyah: 71, endAyah: 80 },
  { page: 10, surahName: "البقرة", surahNumber: 2, startAyah: 81, endAyah: 90 },
  { page: 11, surahName: "البقرة", surahNumber: 2, startAyah: 91, endAyah: 100 },
  { page: 12, surahName: "البقرة", surahNumber: 2, startAyah: 101, endAyah: 110 },
  { page: 13, surahName: "البقرة", surahNumber: 2, startAyah: 111, endAyah: 120 },
  { page: 14, surahName: "البقرة", surahNumber: 2, startAyah: 121, endAyah: 130 },
  { page: 15, surahName: "البقرة", surahNumber: 2, startAyah: 131, endAyah: 140 },
  { page: 16, surahName: "البقرة", surahNumber: 2, startAyah: 141, endAyah: 150 },
  { page: 17, surahName: "البقرة", surahNumber: 2, startAyah: 151, endAyah: 160 },
  { page: 18, surahName: "البقرة", surahNumber: 2, startAyah: 161, endAyah: 170 },
  { page: 19, surahName: "البقرة", surahNumber: 2, startAyah: 171, endAyah: 180 },
  { page: 20, surahName: "البقرة", surahNumber: 2, startAyah: 181, endAyah: 190 },
  { page: 21, surahName: "البقرة", surahNumber: 2, startAyah: 191, endAyah: 200 },
  { page: 22, surahName: "البقرة", surahNumber: 2, startAyah: 201, endAyah: 210 },
  { page: 23, surahName: "البقرة", surahNumber: 2, startAyah: 211, endAyah: 220 },
  { page: 24, surahName: "البقرة", surahNumber: 2, startAyah: 221, endAyah: 230 },
  { page: 25, surahName: "البقرة", surahNumber: 2, startAyah: 231, endAyah: 240 },
  { page: 26, surahName: "البقرة", surahNumber: 2, startAyah: 241, endAyah: 250 },
];

// Surahs ayah counts (standard Mushaf order, surahs 1-114)
const SURAH_AYAH_COUNTS: { number: number; name: string; ayahs: number }[] = [
  { number: 1, name: "الفاتحة", ayahs: 7 },
  { number: 2, name: "البقرة", ayahs: 286 },
  { number: 3, name: "آل عمران", ayahs: 200 },
  { number: 4, name: "النساء", ayahs: 176 },
  { number: 5, name: "المائدة", ayahs: 120 },
  { number: 6, name: "الأنعام", ayahs: 165 },
  { number: 7, name: "الأعراف", ayahs: 206 },
  { number: 8, name: "الأنفال", ayahs: 75 },
  { number: 9, name: "التوبة", ayahs: 129 },
  { number: 10, name: "يونس", ayahs: 109 },
  { number: 11, name: "هود", ayahs: 123 },
  { number: 12, name: "يوسف", ayahs: 111 },
  { number: 13, name: "الرعد", ayahs: 43 },
  { number: 14, name: "إبراهيم", ayahs: 52 },
  { number: 15, name: "الحجر", ayahs: 99 },
  { number: 16, name: "النحل", ayahs: 128 },
  { number: 17, name: "الإسراء", ayahs: 111 },
  { number: 18, name: "الكهف", ayahs: 110 },
  { number: 19, name: "مريم", ayahs: 98 },
  { number: 20, name: "طه", ayahs: 135 },
  { number: 21, name: "الأنبياء", ayahs: 112 },
  { number: 22, name: "الحج", ayahs: 78 },
  { number: 23, name: "المؤمنون", ayahs: 118 },
  { number: 24, name: "النور", ayahs: 64 },
  { number: 25, name: "الفرقان", ayahs: 77 },
  { number: 26, name: "الشعراء", ayahs: 227 },
  { number: 27, name: "النمل", ayahs: 93 },
  { number: 28, name: "القصص", ayahs: 88 },
  { number: 29, name: "العنكبوت", ayahs: 69 },
  { number: 30, name: "الروم", ayahs: 60 },
  { number: 31, name: "لقمان", ayahs: 34 },
  { number: 32, name: "السجدة", ayahs: 30 },
  { number: 33, name: "الأحزاب", ayahs: 73 },
  { number: 34, name: "سبأ", ayahs: 54 },
  { number: 35, name: "فاطر", ayahs: 45 },
  { number: 36, name: "يس", ayahs: 83 },
  { number: 37, name: "الصافات", ayahs: 182 },
  { number: 38, name: "ص", ayahs: 88 },
  { number: 39, name: "الزمر", ayahs: 75 },
  { number: 40, name: "غافر", ayahs: 85 },
  { number: 41, name: "فصلت", ayahs: 54 },
  { number: 42, name: "الشورى", ayahs: 53 },
  { number: 43, name: "الزخرف", ayahs: 89 },
  { number: 44, name: "الدخان", ayahs: 59 },
  { number: 45, name: "الجاثية", ayahs: 37 },
  { number: 46, name: "الأحقاف", ayahs: 35 },
  { number: 47, name: "محمد", ayahs: 38 },
  { number: 48, name: "الفتح", ayahs: 29 },
  { number: 49, name: "الحجرات", ayahs: 18 },
  { number: 50, name: "ق", ayahs: 45 },
  { number: 51, name: "الذاريات", ayahs: 60 },
  { number: 52, name: "الطور", ayahs: 49 },
  { number: 53, name: "النجم", ayahs: 62 },
  { number: 54, name: "القمر", ayahs: 55 },
  { number: 55, name: "الرحمن", ayahs: 78 },
  { number: 56, name: "الواقعة", ayahs: 96 },
  { number: 57, name: "الحديد", ayahs: 29 },
  { number: 58, name: "المجادلة", ayahs: 22 },
  { number: 59, name: "الحشر", ayahs: 24 },
  { number: 60, name: "الممتحنة", ayahs: 13 },
  { number: 61, name: "الصف", ayahs: 14 },
  { number: 62, name: "الجمعة", ayahs: 11 },
  { number: 63, name: "المنافقون", ayahs: 11 },
  { number: 64, name: "التغابن", ayahs: 18 },
  { number: 65, name: "الطلاق", ayahs: 12 },
  { number: 66, name: "التحريم", ayahs: 12 },
  { number: 67, name: "الملك", ayahs: 30 },
  { number: 68, name: "القلم", ayahs: 52 },
  { number: 69, name: "الحاقة", ayahs: 52 },
  { number: 70, name: "المعارج", ayahs: 44 },
  { number: 71, name: "نوح", ayahs: 28 },
  { number: 72, name: "الجن", ayahs: 28 },
  { number: 73, name: "المزمل", ayahs: 20 },
  { number: 74, name: "المدثر", ayahs: 56 },
  { number: 75, name: "القيامة", ayahs: 40 },
  { number: 76, name: "الإنسان", ayahs: 31 },
  { number: 77, name: "المرسلات", ayahs: 50 },
  { number: 78, name: "النبأ", ayahs: 40 },
  { number: 79, name: "النازعات", ayahs: 46 },
  { number: 80, name: "عبس", ayahs: 42 },
  { number: 81, name: "التكوير", ayahs: 29 },
  { number: 82, name: "الانفطار", ayahs: 19 },
  { number: 83, name: "المطففين", ayahs: 36 },
  { number: 84, name: "الانشقاق", ayahs: 25 },
  { number: 85, name: "البروج", ayahs: 22 },
  { number: 86, name: "الطارق", ayahs: 17 },
  { number: 87, name: "الأعلى", ayahs: 19 },
  { number: 88, name: "الغاشية", ayahs: 26 },
  { number: 89, name: "الفجر", ayahs: 30 },
  { number: 90, name: "البلد", ayahs: 20 },
  { number: 91, name: "الشمس", ayahs: 15 },
  { number: 92, name: "الليل", ayahs: 21 },
  { number: 93, name: "الضحى", ayahs: 11 },
  { number: 94, name: "الشرح", ayahs: 8 },
  { number: 95, name: "التين", ayahs: 8 },
  { number: 96, name: "العلق", ayahs: 19 },
  { number: 97, name: "القدر", ayahs: 5 },
  { number: 98, name: "البينة", ayahs: 8 },
  { number: 99, name: "الزلزلة", ayahs: 8 },
  { number: 100, name: "العاديات", ayahs: 11 },
  { number: 101, name: "القارعة", ayahs: 11 },
  { number: 102, name: "التكاثر", ayahs: 8 },
  { number: 103, name: "العصر", ayahs: 3 },
  { number: 104, name: "الهمزة", ayahs: 9 },
  { number: 105, name: "الفيل", ayahs: 5 },
  { number: 106, name: "قريش", ayahs: 4 },
  { number: 107, name: "الماعون", ayahs: 7 },
  { number: 108, name: "الكوثر", ayahs: 3 },
  { number: 109, name: "الكافرون", ayahs: 6 },
  { number: 110, name: "النصر", ayahs: 3 },
  { number: 111, name: "المسد", ayahs: 5 },
  { number: 112, name: "الإخلاص", ayahs: 4 },
  { number: 113, name: "الفلق", ayahs: 5 },
  { number: 114, name: "الناس", ayahs: 6 },
];

// Auto-generate pages from 27 onward using 15-ayah/day system,
// starting at Al-Baqarah ayah 258, and continuing through the rest of the Quran.
(() => {
  const AYAHS_PER_DAY = 15;
  let surahIdx = SURAH_AYAH_COUNTS.findIndex((s) => s.number === 2);
  let currentAyah = 258;
  let pageNum = 27;

  while (surahIdx < SURAH_AYAH_COUNTS.length) {
    const surah = SURAH_AYAH_COUNTS[surahIdx];
    let remaining = AYAHS_PER_DAY;
    // For simplicity, don't cross surah boundaries within a single page
    const end = Math.min(currentAyah + remaining - 1, surah.ayahs);
    quranPages.push({
      page: pageNum,
      surahName: surah.name,
      surahNumber: surah.number,
      startAyah: currentAyah,
      endAyah: end,
    });
    pageNum++;
    if (end >= surah.ayahs) {
      surahIdx++;
      currentAyah = 1;
    } else {
      currentAyah = end + 1;
    }
  }
})();

export type ReciterSource = "everyayah" | "mp3quran";

export interface Reciter {
  id: string;
  name: string;
  source: ReciterSource;
  path: string;
}

export const reciters: Reciter[] = [
  { id: "afasy", name: "مشاري راشد العفاسي", source: "everyayah", path: "Alafasy_128kbps" },
  { id: "sudais", name: "عبدالرحمن السديس", source: "everyayah", path: "Abdurrahmaan_As-Sudais_192kbps" },
  { id: "husary", name: "محمود خليل الحصري (مرتل)", source: "everyayah", path: "Husary_128kbps" },
  { id: "minshawi", name: "محمد صديق المنشاوي (مرتل)", source: "everyayah", path: "Minshawy_Murattal_128kbps" },
  { id: "ghamdi", name: "سعد الغامدي", source: "everyayah", path: "Ghamadi_40kbps" },
  { id: "shuraim", name: "سعود الشريم", source: "everyayah", path: "Saood_ash-Shuraym_128kbps" },
  { id: "muaiqly", name: "ماهر المعيقلي", source: "everyayah", path: "MaherAlMuaiqly128kbps" },
  { id: "dossari", name: "ياسر الدوسري", source: "everyayah", path: "Yasser_Ad-Dussary_128kbps" },
  { id: "jaber", name: "علي جابر", source: "everyayah", path: "Ali_Jaber_64kbps" },
];

export const buildAyahAudioUrl = (
  reciterFolder: string,
  surahNumber: number,
  ayahNumber: number
): string => {
  const s = String(surahNumber).padStart(3, "0");
  const a = String(ayahNumber).padStart(3, "0");
  return `https://everyayah.com/data/${reciterFolder}/${s}${a}.mp3`;
};

export const buildSurahAudioUrl = (
  serverBase: string,
  surahNumber: number
): string => {
  const s = String(surahNumber).padStart(3, "0");
  return `${serverBase}${s}.mp3`;
};
