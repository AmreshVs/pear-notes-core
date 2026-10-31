import test from 'brittle'

import {
  detectTextLanguage,
  getTranslationModelNames,
  getTranslationSteps,
  normalizeLanguageCode,
  pickTranslationTarget
} from '../store/services/localAiLanguage.js'
import {
  TRANSLATION_LANGUAGES,
  TRANSLATION_REGISTRY_MODELS
} from '../store/services/localAiTranslationModels.js'

const SAMPLES = {
  en: 'Hello, how are you? Today we are going to the beach with friends and then having dinner together.',
  es: 'Hola, ¿cómo estás? Hoy vamos a la playa con mis amigos y luego cenamos juntos.',
  fr: 'Bonjour, comment allez-vous? Nous allons à la plage avec des amis puis nous dînons ensemble.',
  de: 'Hallo, wie geht es dir? Wir gehen heute mit Freunden an den Strand und essen danach zusammen.',
  it: 'Ciao, come stai? Oggi andiamo in spiaggia con gli amici e poi ceniamo insieme.',
  pt: 'Olá, como vai? Hoje vamos à praia com amigos e depois jantamos juntos.',
  nl: 'Hallo, hoe gaat het? Vandaag gaan we met vrienden naar het strand en eten we daarna samen.',
  pl: 'Cześć, jak się masz? Dzisiaj idziemy na plażę z przyjaciółmi, a potem jemy razem kolację.',
  ru: 'Привет, как дела? Сегодня мы идем на пляж с друзьями, а потом ужинаем вместе.',
  uk: 'Привіт, як справи? Сьогодні ми йдемо на пляж з друзями, а потім вечеряємо разом.',
  zh: '你好，你好吗？今天我们和朋友一起去海滩，然后一起吃晚饭。',
  ja: 'こんにちは、お元気ですか？今日は友達と海に行って、それから一緒に夕食を食べます。',
  ko: '안녕하세요, 잘 지내세요? 오늘 친구들과 바다에 가고 나서 같이 저녁을 먹습니다.',
  hi: 'नमस्ते, आप कैसे हैं? आज हम दोस्तों के साथ समुद्र तट जा रहे हैं और फिर साथ में खाना खाएंगे।',
  ar: 'مرحبا، كيف حالك؟ اليوم نذهب إلى الشاطئ مع الأصدقاء ثم نتناول العشاء معا.',
  tr: 'Merhaba, nasılsın? Bugün arkadaşlarla sahile gidiyoruz ve sonra birlikte akşam yemeği yiyoruz.',
  sv: 'Hej, hur mår du? Idag går vi till stranden med vänner och sedan äter vi middag tillsammans.',
  vi: 'Xin chào, bạn khỏe không? Hôm nay chúng tôi đi biển với bạn bè rồi cùng nhau ăn tối.',
  id: 'Halo, apa kabar? Hari ini kami pergi ke pantai bersama teman-teman lalu makan malam bersama.',
  el: 'Γεια σου, τι κάνεις; Σήμερα πάμε στην παραλία με φίλους και μετά τρώμε μαζί.',
  he: 'שלום, מה שלומך? היום אנחנו הולכים לים עם חברים ואחר כך אוכלים ארוחת ערב ביחד.',
  th: 'สวัสดี สบายดีไหม วันนี้เราจะไปทะเลกับเพื่อนแล้วกินข้าวเย็นด้วยกัน',
  fa: 'سلام، حالت چطور است؟ امروز با دوستان به ساحل می‌رویم و بعد با هم شام می‌خوریم.',
  bn: 'নমস্কার, আপনি কেমন আছেন? আজ আমরা বন্ধুদের সাথে সমুদ্র সৈকতে যাচ্ছি।',
  ta: 'வணக்கம், எப்படி இருக்கிறீர்கள்? இன்று நண்பர்களுடன் கடற்கரைக்குச் செல்கிறோம்.',
  bg: 'Здравей, как си? Днес отиваме на плажа с приятели и след това вечеряме заедно, нали съм тук.',
  sr: 'Здраво, како си? Данас идемо на плажу са пријатељима и онда вечерамо заједно.',
  cs: 'Ahoj, jak se máš? Dnes jdeme s přáteli na pláž a potom spolu večeříme.',
  hu: 'Szia, hogy vagy? Ma a barátokkal a strandra megyünk, és aztán együtt vacsorázunk, mert jó.',
  ro: 'Bună, ce mai faci? Astăzi mergem la plajă cu prietenii și apoi luăm cina împreună.',
  fi: 'Hei, mitä kuuluu? Tänään menemme rannalle ystävien kanssa ja sitten syömme yhdessä illallista.',
  az: 'Salam, necəsən? Bu gün dostlarla sahilə gedirik və sonra birlikdə şam yeməyi yeyirik.'
}

test('detectTextLanguage recognizes every supported language', (t) => {
  for (const [language, sample] of Object.entries(SAMPLES)) {
    t.is(detectTextLanguage(sample), language, language)
  }
})

test('detectTextLanguage returns null for text too short to judge', (t) => {
  t.is(detectTextLanguage('Buy milk'), null)
  t.is(detectTextLanguage(''), null)
})

test('detectTextLanguage keeps English notes with a few foreign words', (t) => {
  t.is(
    detectTextLanguage('Meeting notes for the launch. We agreed to ship the café menu on Friday.'),
    'en'
  )
})

test('getTranslationSteps pivots through English between two other languages', (t) => {
  t.alike(getTranslationSteps('en', 'es'), [['en', 'es']])
  t.alike(getTranslationSteps('fr', 'en'), [['fr', 'en']])
  t.alike(getTranslationSteps('fr', 'de'), [
    ['fr', 'en'],
    ['en', 'de']
  ])
  t.alike(getTranslationSteps('en', 'en'), [])
  t.alike(getTranslationSteps('en', 'xx'), [])
})

test('getTranslationModelNames lists one registry model per step', (t) => {
  t.alike(getTranslationModelNames('en', 'es'), ['BERGAMOT_EN_ES'])
  t.alike(getTranslationModelNames('ja', 'fr'), ['BERGAMOT_JA_EN', 'BERGAMOT_EN_FR'])
  t.alike(getTranslationModelNames('en', 'nb'), ['BERGAMOT_EN_NB'])
  t.is(normalizeLanguageCode('no-NO'), 'nb')
})

test('translation registry only lists models the SDK registry exports', (t) => {
  const names = Object.keys(TRANSLATION_REGISTRY_MODELS)
  t.is(names.length, TRANSLATION_LANGUAGES.length * 2)
  t.absent(names.some((name) => /_(VOCAB|SRCVOCAB|TRGVOCAB|LEX)$/.test(name)))
})

test('pickTranslationTarget prefers English, then last used, then device language', (t) => {
  t.is(pickTranslationTarget({ source: 'fr', lastTarget: 'de', deviceLanguage: 'es' }), 'en')
  t.is(pickTranslationTarget({ source: 'en', lastTarget: 'de', deviceLanguage: 'es' }), 'de')
  t.is(pickTranslationTarget({ source: 'en', lastTarget: null, deviceLanguage: 'es' }), 'es')
  t.is(pickTranslationTarget({ source: 'en', lastTarget: 'en', deviceLanguage: 'en' }), null)
})

test('normalizeLanguageCode maps locales to supported codes', (t) => {
  t.is(normalizeLanguageCode('pt-BR'), 'pt')
  t.is(normalizeLanguageCode('zh_Hans'), 'zh')
  t.is(normalizeLanguageCode('fi'), 'fi')
  t.is(normalizeLanguageCode('xh'), null)
})
