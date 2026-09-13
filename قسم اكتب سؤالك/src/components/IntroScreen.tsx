import { Flame, Play, Sparkles, Target, Users } from "lucide-react";

export default function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-[95] flex min-h-dvh flex-col bg-paper">
      <div className="reel-backdrop mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8 text-white">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-gold backdrop-blur-sm">
            🎓 مدارك جو
          </span>
          <span className="rounded-full bg-red-600/90 px-3 py-1 text-xs font-extrabold text-white">
            القسم جديد 🔥
          </span>
        </div>

        <div className="mt-8 text-center">
          <div className="text-6xl">✍️</div>
          <h1 className="mt-4 font-serif text-4xl font-bold text-white">
            اكتب سؤالك
          </h1>
          <p className="mt-2 text-sm font-medium leading-6 text-white/70">
            ما عاد السؤال اللي بيحيرك ضايع — خلّيه بطاقة يتفاعل معها كل الطلاب.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold">
              <Users size={20} />
            </span>
            <div>
              <p className="text-sm font-extrabold text-white">شو هو؟</p>
              <p className="mt-1 text-xs font-medium leading-5 text-white/70">
                مكانك في مدارك جو لتطرح سؤالك بلا خجل، من حقلَك ومن كل الحقول،
                وتشوف أسئلة زملائك أمامك بطاقة بطاقة.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/20 text-gold">
              <Target size={20} />
            </span>
            <div>
              <p className="text-sm font-extrabold text-white">شو هدفه؟</p>
              <p className="mt-1 text-xs font-medium leading-5 text-white/70">
                نزرع ثقافة «اسأل بلا خجل»: كل سؤال ينشر يكبر المكتبة التعليمية
                المشتركة، وكل إجابة صحيحة بتسجّل علامة بملفك الشخصي.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/10 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/25 text-gold">
              <Play size={20} />
            </span>
            <div>
              <p className="text-sm font-extrabold text-white">
                النمط الجديد: ريلز تفاعلية
              </p>
              <p className="mt-1 text-xs font-medium leading-5 text-white/70">
                الأسئلة صارت قصص: البطاقة بتطبق قدامك، بتحاوِل والحين بتعرف
                النتيجة، وتحطّ إصبعك وتسحب لبطاقة جديدة. سؤال بعد سؤال —
                تعلّم وهو مسلّي.
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-7 flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-gold">
          <Sparkles size={14} />
          اسمك، لايكاتك، إجاباتك الصحيحة — كلها بتتجمع بملفك
        </div>

        <div className="mt-auto pt-8">
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-white/60">
            <Flame size={13} className="text-gold" />
            اسأل بحرية … أجب بثقة … وشارك بطاقتك مع الكل.
          </div>
          <button
            onClick={onStart}
            className="mt-4 w-full rounded-2xl bg-gold py-4 text-base font-extrabold text-ink shadow-lg transition hover:bg-gold-deep hover:text-white active:scale-[0.98]"
          >
            يلّا ندخل القسم 🚀
          </button>
        </div>
      </div>
    </div>
  );
}