import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Car, Check, Globe2, MapPin, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useWelcomePreferences } from "@/lib/welcome-preferences";
import welcomeImage from "@/assets/welcome.jpg";

export const Route = createFileRoute("/welcome")({
  ssr: false,
  head: () => ({ meta: [
    { title: "أهلاً بك | ممنون" },
    { name: "description", content: "اختر لغتك وتعرّف على النقل والخدمات المنزلية وتتبع الطلب في ممنون." },
    { property: "og:title", content: "أهلاً بك | ممنون" },
    { property: "og:description", content: "رحلتك وخدمات بيتك في مكان واحد مع ممنون." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: WelcomePage,
});

const copy = {
  ar: {
    brand: "ممنون", greeting: "أهلاً بيك في ممنون", tagline: "مشاويرك وخدمات بيتك، بمكان واحد.", skip: "تخطي", next: "التالي", start: "يلا نبدأ", back: "السابق", account: "عندك حساب؟", login: "تسجيل الدخول", language: "اختر اللغة", step: "الخطوة",
    slides: [
      { title: "مشوارك يبدأ من هنا", description: "اطلب كابتن تاكسي لموقعك وخلّي مشوارك أسهل.", label: "تاكسي ونقل" },
      { title: "لبيتك، أهل الخبرة", description: "اختار الخدمة اللي تحتاجها، من الصيانة إلى نقل الأثاث، واطلب فني أو خبير مع عمال.", label: "خدمات البيت" },
      { title: "خليك على اطلاع", description: "تابع موقع الكابتن أو الفني بعد قبول الطلب، تواصل وياه، وقيّم الخدمة بعد إكمالها.", label: "تتبع وتواصل" },
    ],
  },
  en: {
    brand: "Mumnun", greeting: "Welcome to Mumnun", tagline: "Your rides and home services, all in one place.", skip: "Skip", next: "Next", start: "Let's get started", back: "Back", account: "Already have an account?", login: "Sign in", language: "Choose language", step: "Step",
    slides: [
      { title: "Your next ride starts here", description: "Request a taxi captain to your location and enjoy an easier journey.", label: "Taxi & transport" },
      { title: "Expert help for your home", description: "From repairs to furniture moving, book a technician or an expert with a team.", label: "Home services" },
      { title: "Stay connected along the way", description: "Track your captain or technician after acceptance, chat with them, and rate the completed service.", label: "Track & connect" },
    ],
  },
};
const icons = [Car, Wrench, MapPin];

function WelcomePage() {
  const { language, save } = useWelcomePreferences();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const text = copy[language];
  const slide = text.slides[step];
  const Forward = language === "ar" ? ArrowLeft : ArrowRight;
  const Backward = language === "ar" ? ArrowRight : ArrowLeft;

  if (!loading && session) return <Navigate to="/" />;
  if (!slide) return null;

  function finish(signIn = false) {
    save(language, true);
    navigate({ to: "/auth", search: { mode: signIn ? "login" : undefined } });
  }

  return (
    <main dir={language === "ar" ? "rtl" : "ltr"} lang={language} className="min-h-dvh bg-surface text-foreground flex flex-col">
      <header className="mx-auto w-full max-w-3xl flex items-center justify-between px-6 pt-6 sm:pt-8">
        <span className="text-2xl font-black text-primary">{text.brand}<span className="text-accent">.</span></span>
        <Button variant="ghost" onClick={() => finish()} className="text-muted-foreground">{text.skip}<Forward /></Button>
      </header>

      <div className="mx-auto w-full max-w-xl flex-1 px-6 pb-8 text-center">
        <div className="mt-6 flex items-center justify-center gap-3" role="group" aria-label={text.language}>
          <Globe2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div className="inline-flex rounded-lg border border-border p-1 bg-background">
            <Button size="sm" variant={language === "ar" ? "default" : "ghost"} aria-pressed={language === "ar"} onClick={() => save("ar")}><span>العربية</span>{language === "ar" && <Check />}</Button>
            <Button size="sm" variant={language === "en" ? "default" : "ghost"} aria-pressed={language === "en"} onClick={() => save("en")}><span>English</span>{language === "en" && <Check />}</Button>
          </div>
        </div>

        <h1 className="mt-7 text-3xl sm:text-4xl leading-tight font-black">{text.greeting}</h1>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground">{text.tagline}</p>
        <img src={welcomeImage} alt={language === "ar" ? "سيارة تاكسي وهاتف لتحديد الموقع وأدوات خدمات منزلية" : "Taxi, location phone and home service tools"} width={1024} height={1024} className="mx-auto mt-5 w-full max-w-[340px] aspect-square object-contain rounded-lg" />

        <section aria-live="polite" aria-atomic="true" className="mt-6 min-h-32">
          <p className="text-xs font-bold text-primary">{slide.label}</p>
          <h2 className="mt-2 text-2xl font-extrabold leading-snug">{slide.title}</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-muted-foreground">{slide.description}</p>
        </section>

        <nav className="mt-5 grid grid-cols-3 gap-2" aria-label={language === "ar" ? "التعريف بالخدمات" : "Service introduction"}>
          {text.slides.map((item, index) => {
            const Icon = icons[index] || Car;
            return <Button key={item.label} variant="ghost" onClick={() => setStep(index)} aria-current={index === step ? "step" : undefined} aria-label={`${text.step} ${index + 1}: ${item.label}`} className={`h-auto min-h-20 whitespace-normal flex-col gap-2 border-b-2 rounded-none px-1 text-xs ${index === step ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground"}`}><Icon className="!size-5" />{item.label}</Button>;
          })}
        </nav>

        <div className="mt-6 flex gap-3">
          {step > 0 && <Button variant="outline" size="icon" onClick={() => setStep(step - 1)} aria-label={text.back} title={text.back} className="h-12 w-12 shrink-0"><Backward /></Button>}
          <Button className="h-12 flex-1 text-base font-bold" onClick={() => step < 2 ? setStep(step + 1) : finish()}>{step < 2 ? text.next : text.start}<Forward /></Button>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">{text.account} <Button variant="link" onClick={() => finish(true)} className="h-auto p-0 font-bold">{text.login}</Button></p>
      </div>
    </main>
  );
}