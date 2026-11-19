/*
 * הוספת פרויקט: העתיקי אובייקט והחליפי את הנתונים.
 * כל פרויקט יוצר אוטומטית צורה חדשה במגרש המשחקים.
 * website, github ו-research הם שדות אופציונליים.
 * color יכול להיות כל צבע CSS. העדיפי צבעים מהפלטה.
 * icon: שם אייקון מתוך https://tabler.io/icons (למשל shopping-cart).
 */
window.PROJECTS = [
  {
    id: "sharedcarty",
    title: "Shared Cart",
    subtitle: "סל שיתופי",
    description: "מקום מסודר לכל הרשימות סופר שלכם עם המשפחה/שותפים",
    technologies: ["PHP","SQL"],
    github: "https://github.com/HBLCODE28/SharedCart",
    website: "https://sharedcart.h1la.com/",
    color: "#D88180",
    icon: "shopping-cart"
  },
  {
    id: "dpsac",
    title: "DPSAC",
    subtitle: "מוזיקה, AI וטעם אישי",
    description: "מערכת המלצות מוזיקה אישית שפיתחתי, שלומדת את הטעם המוזיקלי של המשתמש בעזרת YAMNet ולמידת העברה - ומנבאת אילו שירים חדשים הוא או היא יאהבו, גם ללא היסטוריית האזנה. במבחן עיוור על שירים חדשים המודל הגיע ל-93% דיוק.",
    technologies: ["Python", "TensorFlow", "YAMNet", "Machine Learning"],
    research: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6168227",
    github:"https://github.com/HBLCODE28/HighSchool/tree/main/AIProject",
    color: "#CAD182",
    icon: "headphones"
  },
  {
        id: "taeroti",
        title: "Taer Oti",
        subtitle: "משחק לערב חברים",
        description: "כמה אתם טובים לתאר את חברכם במילה אחת?",
        technologies: ["PHP", "JS", "CSS"],
        website: "https://taeroti.h1la.com/",
        github: "https://github.com/HBLCODE28/TaerOti",
        color: "#A46229",
        icon: "device-gamepad-2"
    }
];
