// Adhkar shown in the popup and in reminders. Religious content: do not
// paraphrase, retranslate or retype any of it.
//
// Qur'an entries are copied byte for byte from api.quran.com (Imlaei text)
// with the Saheeh International English. Hadith entries carry the wording of
// the sunnah.com hadith they name, in this file's own spelling conventions;
// for the takbir and the salawat the named hadith is the one giving the
// virtue. A quoted virtue is copied byte for byte from that sunnah.com page,
// English and Arabic. virtue.fr exists only where the French line matches
// the source; otherwise the English line is shown.

export const dhikrCollection = [
  {
    arabic: 'سُبْحَانَ اللَّهِ',
    transliteration: 'Subhan Allah',
    english: 'Glory be to Allah',
    source: { collection: 'muslim', number: '223' }
  },
  {
    arabic: 'الْحَمْدُ لِلَّهِ',
    transliteration: 'Alhamdulillah',
    english: 'Praise be to Allah',
    source: { collection: 'muslim', number: '223' },
    virtue: {
      en: 'al-Hamdu Lillah (all praise and gratitude is for Allah alone) fills the scale',
      ar: 'الْحَمْدُ لِلَّهِ تَمْلأُ الْمِيزَانَ',
      quoted: true
    }
  },
  {
    arabic: 'اللَّهُ أَكْبَرُ',
    transliteration: 'Allahu Akbar',
    english: 'Allah is the Greatest',
    source: { collection: 'tirmidhi', number: '3519' },
    virtue: {
      en: 'Fills what is between heaven and earth',
      ar: 'تملأ ما بين السماء والأرض',
      fr: 'Remplit ce qui se trouve entre le ciel et la terre'
    }
  },
  {
    arabic: 'لَا إِلَٰهَ إِلَّا اللَّهُ',
    transliteration: 'La ilaha illa Allah',
    english: 'There is no god but Allah',
    source: { collection: 'tirmidhi', number: '3383' },
    virtue: {
      en: 'The best remembrance is: ‘there is none worthy of worship except Allah (Lā ilāha illallāh)’',
      ar: 'أَفْضَلُ الذِّكْرِ لاَ إِلَهَ إِلاَّ اللَّهُ',
      quoted: true
    }
  },
  {
    arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',
    transliteration: 'Subhan Allahi wa bihamdihi',
    english: 'Glory be to Allah and praise be to Him',
    source: { collection: 'bukhari', number: '6405' },
    virtue: {
      en: 'Whoever says, \'Subhan Allah wa bihamdihi,\' one hundred times a day, will be forgiven all his sins even if they were as much as the foam of the sea.',
      ar: 'مَنْ قَالَ سُبْحَانَ اللَّهِ وَبِحَمْدِهِ‏.‏ فِي يَوْمٍ مِائَةَ مَرَّةٍ حُطَّتْ خَطَايَاهُ، وَإِنْ كَانَتْ مِثْلَ زَبَدِ الْبَحْرِ',
      quoted: true
    }
  },
  {
    arabic: 'سُبْحَانَ اللَّهِ الْعَظِيمِ وَبِحَمْدِهِ',
    transliteration: 'Subhan Allahil-Azeem wa bihamdihi',
    english: 'Glory be to Allah the Magnificent and praise be to Him',
    source: { collection: 'tirmidhi', number: '3464' }
  },
  {
    arabic: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',
    transliteration: 'La hawla wa la quwwata illa billah',
    english: 'There is no power except with Allah',
    source: { collection: 'bukhari', number: '6384' },
    virtue: {
      en: 'A treasure from the treasures of Paradise',
      ar: 'كنز من كنوز الجنة',
      fr: 'Un trésor parmi les trésors du Paradis'
    }
  },
  {
    arabic: 'أَسْتَغْفِرُ اللَّهَ',
    transliteration: 'Astaghfirullah',
    english: 'I seek forgiveness from Allah',
    source: { collection: 'muslim', number: '591' }
  },
  {
    arabic: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ',
    transliteration: 'Allahumma salli ala Muhammad',
    english: 'O Allah, send blessings upon Muhammad ﷺ',
    source: { collection: 'muslim', number: '408' },
    virtue: {
      en: 'Allah sends 10 blessings for each one sent',
      ar: 'يُصلي الله عليه عشرًا بكل صلاة',
      fr: 'Allah envoie 10 bénédictions pour chacune envoyée'
    }
  },
  {
    arabic: 'رَبِّ اغْفِرْ لِي',
    transliteration: 'Rabbighfir li',
    english: 'My Lord, forgive me',
    source: { collection: 'abudawud', number: '874' }
  },
  {
    arabic: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ',
    transliteration: 'Allahumma a\'inni ala dhikrika wa shukrika wa husni ibadatik',
    english: 'O Allah, help me to remember You, thank You, and worship You excellently',
    source: { collection: 'abudawud', number: '1522' }
  },
  {
    arabic: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ',
    transliteration: 'Hasbunallahu wa ni\'mal-wakeel',
    english: 'Sufficient for us is Allāh, and [He is] the best Disposer of affairs.',
    source: { quran: '3:173', translation: 'Saheeh International' }
  },
  {
    arabic: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ',
    transliteration: 'Rabbana atina fi\'d-dunya hasanatan wa fi\'l-akhirati hasanatan wa qina adhab an-nar',
    english: 'Our Lord, give us in this world [that which is] good and in the Hereafter [that which is] good and protect us from the punishment of the Fire.',
    source: { quran: '2:201', translation: 'Saheeh International' }
  },
  {
    arabic: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى وَالْعَفَافَ وَالْغِنَى',
    transliteration: 'Allahumma inni as\'aluka\'l-huda wa\'t-tuqa wa\'l-\'afafa wa\'l-ghina',
    english: 'O Allah, I ask You for guidance, piety, chastity and contentment',
    source: { collection: 'muslim', number: '2721a' }
  },
  {
    arabic: 'رَضِيتُ بِاللَّهِ رَبًّا وَبِالْإِسْلَامِ دِينًا وَبِمُحَمَّدٍ رَسُولًا',
    transliteration: 'Radeetu billahi rabban wa bil-Islami deenan wa bi Muhammadin rasoolan',
    english: 'I am pleased with Allah as my Lord, Islam as my religion, and Muhammad ﷺ as my Messenger',
    source: { collection: 'abudawud', number: '1529' },
    virtue: { en: 'Paradise will be his due.', ar: 'وَجَبَتْ لَهُ الْجَنَّةُ', quoted: true }
  },
  {
    arabic: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ خَلَقْتَنِي وَأَنَا عَبْدُكَ',
    transliteration: 'Allahumma anta rabbi la ilaha illa anta khalaqtani wa ana \'abduk',
    english: 'O Allah, You are my Lord, there is no god but You. You created me and I am Your servant',
    source: { collection: 'bukhari', number: '6306' },
    virtue: {
      en: 'Beginning of Sayyid al-Istighfar - master of seeking forgiveness',
      ar: 'بداية سيد الاستغفار',
      fr: 'Début de Sayyid al-Istighfar - le maître de la demande de pardon'
    }
  },
  {
    arabic: 'يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ',
    transliteration: 'Ya Hayyu Ya Qayyum bi-rahmatika astaghith',
    english: 'O Ever-Living, O Self-Sustaining, by Your mercy I seek help',
    source: { collection: 'tirmidhi', number: '3524' }
  },
  {
    arabic: 'اللَّهُمَّ اهْدِنِي فِيمَنْ هَدَيْتَ',
    transliteration: 'Allahumma\'hdini fiman hadayt',
    english: 'O Allah, guide me among those You have guided',
    source: { collection: 'abudawud', number: '1425' }
  },
  {
    arabic: 'رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ',
    transliteration: 'Rabbi awzi\'ni an ashkura ni\'matak',
    english: 'My Lord, enable me to be grateful for Your favor',
    source: { quran: '27:19', translation: 'Saheeh International' }
  },
  {
    arabic: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    transliteration: 'La ilaha illallahu wahdahu la sharika lah, lahul mulk wa lahul hamd, wa huwa ala kulli shay\'in qadir',
    english: 'There is no god except Allah, alone without partner; His is the dominion and His is the praise and He is over all things capable',
    source: { collection: 'bukhari', number: '3293' },
    virtue: {
      en: 'If one says one-hundred times in one day … one will get the reward of manumitting ten slaves, and one-hundred good deeds will be written in his account, and one-hundred bad deeds will be wiped off or erased from his account, and on that day he will be protected from the morning till evening from Satan',
      ar: 'فِي يَوْمٍ مِائَةَ مَرَّةٍ، كَانَتْ لَهُ عَدْلَ عَشْرِ رِقَابٍ، وَكُتِبَتْ لَهُ مِائَةُ حَسَنَةٍ، وَمُحِيَتْ عَنْهُ مِائَةُ سَيِّئَةٍ، وَكَانَتْ لَهُ حِرْزًا مِنَ الشَّيْطَانِ يَوْمَهُ ذَلِكَ حَتَّى يُمْسِيَ',
      quoted: true
    }
  },
  {
    arabic: 'سُبْحَانَ اللَّهِ وَالْحَمْدُ لِلَّهِ وَلَا إِلَٰهَ إِلَّا اللَّهُ وَاللَّهُ أَكْبَرُ',
    transliteration: 'Subhan Allah, walhamdulillah, wa la ilaha illallah, wallahu akbar',
    english: 'Glory be to Allah, praise be to Allah, there is no god but Allah, Allah is the Greatest',
    source: { collection: 'muslim', number: '2695' },
    virtue: {
      en: 'More beloved to the Prophet ﷺ than all the world and what it contains',
      ar: 'أحب إلى النبي ﷺ مما طلعت عليه الشمس'
    }
  },
  {
    arabic: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
    transliteration: 'A\'udhu bi kalimatillahi at-tammati min sharri ma khalaq',
    english: 'I seek refuge in the perfect words of Allah from the evil of what He has created',
    source: { collection: 'muslim', number: '2708a' },
    virtue: {
      en: 'When anyone lands at a place, and then says … nothing would harm him until he marches from that stopping place.',
      ar: 'مَنْ نَزَلَ مَنْزِلاً ثُمَّ قَالَ … لَمْ يَضُرُّهُ شَىْءٌ حَتَّى يَرْتَحِلَ مِنْ مَنْزِلِهِ ذَلِكَ',
      quoted: true
    }
  },
  {
    arabic: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',
    transliteration: 'Bismillahi alladhi la yadurru ma\'a ismihi shay\'un fil-ardi wa la fis-sama\'i wa huwa as-sami\'u al-alim',
    english: 'In the name of Allah with whose name nothing is harmed on earth or in the heavens, and He is the All-Hearing, the All-Knowing',
    source: { collection: 'tirmidhi', number: '3388' },
    virtue: {
      en: 'Nothing will harm the one who says it three times in morning and evening',
      ar: 'لا يضره شيء إذا قالها ثلاثًا صباحًا ومساءً',
      fr: 'Rien ne nuira à celui qui le dit trois fois matin et soir'
    }
  },
  {
    arabic: 'حَسْبِيَ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ ۖ عَلَيْهِ تَوَكَّلْتُ ۖ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ',
    transliteration: 'Hasbiyallahu la ilaha illa Huwa, alayhi tawakkaltu wa Huwa Rabbul-Arsh il-Azeem',
    english: 'Sufficient for me is Allāh; there is no deity except Him. On Him I have relied, and He is the Lord of the Great Throne.',
    source: { quran: '9:129', translation: 'Saheeh International' }
  },
  {
    arabic: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي',
    transliteration: 'Rabbi shrah li sadri wa yassir li amri',
    english: 'My Lord, expand [i.e., relax] for me my breast [with assurance] And ease for me my task',
    source: { quran: '20:25-26', translation: 'Saheeh International' }
  },
  {
    arabic: 'رَّبِّ اغْفِرْ لِي وَلِوَالِدَيَّ',
    transliteration: 'Rabbi ighfir li waliwalidayya',
    english: 'My Lord, forgive me and my parents',
    source: { quran: '71:28', translation: 'Saheeh International' }
  },
  {
    arabic: 'رَّبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا',
    transliteration: 'Rabbi irhamhuma kama rabbayanee sagheera',
    english: 'My Lord, have mercy upon them as they brought me up [when I was] small.',
    source: { quran: '17:24', translation: 'Saheeh International' }
  },
  {
    arabic: 'اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي',
    transliteration: 'Allahumma innaka ’afuwwun tuhibbul-’afwa fa’fu ’anni',
    english: 'O Allah, You are Most Forgiving and You love forgiveness, so forgive me',
    source: { collection: 'ibnmajah', number: '3850' },
    virtue: {
      en: 'O Messenger of Allah, what do you think I should say in my supplication, if I come upon Laylatul-Qadr?',
      ar: 'يَا رَسُولَ اللَّهِ أَرَأَيْتَ إِنْ وَافَقْتُ لَيْلَةَ الْقَدْرِ مَا أَدْعُو',
      quoted: true
    }
  }
];

// Shown in the hadith section, labelled as the shahada, when no hadith loads.
export const SHAHADA = {
  ar: 'لَا إِلَٰهَ إِلَّا اللَّهُ',
  en: 'There is no god but Allah',
  fr: 'Il n\'y a de divinité qu\'Allah'
};

export function randomDhikrIndex() {
  return Math.floor(Math.random() * dhikrCollection.length);
}

// The virtue line for the UI language. Arabic uses the Arabic line, French
// its own line where one exists; everything else falls back to English.
export function virtueFor(dhikr, lang) {
  const v = dhikr.virtue;
  if (!v) return null;
  if (lang === 'ar') return { text: v.ar, lang: 'ar', quoted: v.quoted === true };
  if (lang === 'fr' && v.fr) return { text: v.fr, lang: 'fr', quoted: false };
  return { text: v.en, lang: 'en', quoted: v.quoted === true };
}
