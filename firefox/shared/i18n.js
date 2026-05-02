// UI string table and translation helper. Keys are stable; values can be
// edited freely to refine wording. Religious content lives in shared/dhikr.js
// and is not edited here.

export const LANG_STORAGE_KEY = 'uiLanguage';

export const I18N = {
  en: {
    appTitle: "Qur'an & Sunnah Companion",
    quran: "Qur'an",
    hadith: "Hadith",
    dhikr: "Dhikr",
    selectSura: "Select Sura...",
    reciterPlaceholder: "Select or type a reciter...",
    play: "Play",
    resume: "Resume",
    pause: "Pause",
    autoplayOn: "Autoplay: ON",
    autoplayOff: "Autoplay: OFF",
    loading: "Loading...",
    nextDhikr: "Next Dhikr",
    notificationsOn: "Notifications: ON",
    notificationsOff: "Notifications: OFF",
    playing: "Playing",
    reminderStyle: "Reminder Style:",
    modeNotification: "Notification",
    modePopup: "Pop-up",
    reminderLabel: "Reminder Interval (seconds):",
    invalidInterval: "Please enter a value between 5 and 3600 seconds.",
    notificationError: "An error occurred. Please try again.",
    clearReciter: "Clear",
    errorNetwork: "Network connection issue. Please check your internet.",
    errorFormat: "Audio format not supported by your browser.",
    errorAutoplay: "Click the play button to start audio (browser autoplay policy).",
    errorTimeout: "Audio loading timed out. Please try again.",
    errorNotFound: "Audio not available for this reciter/surah combination.",
    errorGeneral: "Unable to play audio right now. Please try again.",
    errorLoadingData: "Failed to load content",
    errorOffline: "No internet connection",
    loadingContent: "Loading",
    loadingComplete: "Content loaded successfully",
    loadingAudio: "Loading audio",
    resumingFrom: "Resuming from",
    resuming: "Resuming",
    pausedAt: "Paused at",
    paused: "Paused",
    resumeFailed: "Failed to resume audio",
    audioConnectionLost: "Audio connection lost. Try refreshing if playback stops working.",
    searchSura: "Search a surah by name or number",
    continueAffordance: "Continue {name} from {time}",
    sleepTimerLabel: "Sleep timer",
    sleepTimerOff: "Off",
    sleepTimer15: "15 minutes",
    sleepTimer30: "30 minutes",
    sleepTimer45: "45 minutes",
    sleepTimer60: "60 minutes"
  },
  fr: {
    appTitle: "Compagnon du Coran et de la Sunnah",
    quran: "Coran",
    hadith: "Hadith",
    dhikr: "Dhikr",
    selectSura: "Sélectionner une sourate...",
    reciterPlaceholder: "Sélectionner ou taper un récitateur...",
    play: "Lire",
    resume: "Reprendre",
    pause: "Pause",
    autoplayOn: "Lecture auto : ACTIVÉE",
    autoplayOff: "Lecture auto : DÉSACTIVÉE",
    loading: "Chargement...",
    nextDhikr: "Dhikr suivant",
    notificationsOn: "Notifications : ACTIVÉES",
    notificationsOff: "Notifications : DÉSACTIVÉES",
    playing: "En cours de lecture",
    reminderStyle: "Style de rappel :",
    modeNotification: "Notification système",
    modePopup: "Fenêtre contextuelle",
    reminderLabel: "Intervalle de rappel (secondes) :",
    invalidInterval: "Veuillez entrer une valeur entre 5 et 3600 secondes.",
    notificationError: "Une erreur s'est produite. Veuillez réessayer.",
    clearReciter: "Effacer",
    errorNetwork: "Problème de connexion réseau. Vérifiez votre connexion internet.",
    errorFormat: "Format audio non pris en charge par votre navigateur.",
    errorAutoplay: "Cliquez sur le bouton de lecture pour démarrer l'audio (politique de lecture automatique du navigateur).",
    errorTimeout: "Le chargement de l'audio a expiré. Veuillez réessayer.",
    errorNotFound: "Audio non disponible pour cette combinaison récitateur/sourate.",
    errorGeneral: "Impossible de lire l'audio en ce moment. Veuillez réessayer.",
    errorLoadingData: "Échec du chargement du contenu",
    errorOffline: "Aucune connexion internet",
    loadingContent: "Chargement",
    loadingComplete: "Contenu chargé avec succès",
    loadingAudio: "Chargement de l'audio",
    resumingFrom: "Reprise à partir de",
    resuming: "Reprise",
    pausedAt: "Mis en pause à",
    paused: "En pause",
    resumeFailed: "Échec de la reprise audio",
    audioConnectionLost: "Connexion audio perdue. Essayez de rafraîchir si la lecture s'arrête.",
    searchSura: "Rechercher une sourate par nom ou numéro",
    continueAffordance: "Reprendre {name} à {time}",
    sleepTimerLabel: "Minuteur de veille",
    sleepTimerOff: "Désactivé",
    sleepTimer15: "15 minutes",
    sleepTimer30: "30 minutes",
    sleepTimer45: "45 minutes",
    sleepTimer60: "60 minutes"
  },
  ar: {
    appTitle: "رفيق القرآن والسنة",
    quran: "القرآن",
    hadith: "حديث",
    dhikr: "ذِكر",
    selectSura: "اختر السورة...",
    reciterPlaceholder: "اختر أو اكتب اسم القارئ...",
    play: "تشغيل",
    resume: "استئناف",
    pause: "إيقاف",
    autoplayOn: "التشغيل التلقائي: مفعل",
    autoplayOff: "التشغيل التلقائي: معطل",
    loading: "جارٍ التحميل...",
    nextDhikr: "الذكر التالي",
    notificationsOn: "الإشعارات: مفعلة",
    notificationsOff: "الإشعارات: معطلة",
    playing: "قيد التشغيل",
    reminderStyle: "نوع التذكير:",
    modeNotification: "إشعار",
    modePopup: "نافذة منبثقة",
    reminderLabel: "فاصل التذكير (ثوان):",
    invalidInterval: "يرجى إدخال قيمة بين 5 و 3600 ثانية.",
    notificationError: "حدث خطأ. يرجى المحاولة مرة أخرى.",
    clearReciter: "مسح",
    searchSura: "ابحث عن سورة بالاسم أو الرقم",
    continueAffordance: "متابعة {name} من {time}",
    sleepTimerLabel: "مؤقت النوم",
    sleepTimerOff: "متوقف",
    sleepTimer15: "15 دقيقة",
    sleepTimer30: "30 دقيقة",
    sleepTimer45: "45 دقيقة",
    sleepTimer60: "60 دقيقة"
  }
};

let _currentLang = 'en';

export function setCurrentLang(lang) {
  if (I18N[lang]) {
    _currentLang = lang;
  }
}

export function getCurrentLang() {
  return _currentLang;
}

export function t(key) {
  return (I18N[_currentLang] && I18N[_currentLang][key]) || key;
}
