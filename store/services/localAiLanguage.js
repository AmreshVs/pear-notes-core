import {
  getTranslationModelName,
  TRANSLATION_ENGINE,
  TRANSLATION_LANGUAGES,
  TRANSLATION_REGISTRY_MODELS,
  TRANSLATION_SOURCE_LANGUAGE
} from './localAiTranslationModels.js'

export const TRANSLATION_ALL_LANGUAGES = [TRANSLATION_SOURCE_LANGUAGE, ...TRANSLATION_LANGUAGES]

export const LANGUAGE_ENGLISH_NAMES = {
  ar: 'Arabic',
  az: 'Azerbaijani',
  bg: 'Bulgarian',
  bn: 'Bengali',
  bs: 'Bosnian',
  ca: 'Catalan',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  es: 'Spanish',
  et: 'Estonian',
  fa: 'Persian',
  fi: 'Finnish',
  fr: 'French',
  gu: 'Gujarati',
  he: 'Hebrew',
  hi: 'Hindi',
  hr: 'Croatian',
  hu: 'Hungarian',
  id: 'Indonesian',
  is: 'Icelandic',
  it: 'Italian',
  ja: 'Japanese',
  kn: 'Kannada',
  ko: 'Korean',
  lt: 'Lithuanian',
  lv: 'Latvian',
  ml: 'Malayalam',
  ms: 'Malay',
  nb: 'Norwegian',
  nl: 'Dutch',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sk: 'Slovak',
  sl: 'Slovenian',
  sq: 'Albanian',
  sr: 'Serbian',
  sv: 'Swedish',
  ta: 'Tamil',
  te: 'Telugu',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
  zh: 'Chinese'
}

const MIN_LETTERS = 12
const SAMPLE_CHARS = 4000
const LETTER_WEIGHT = 3

const SCRIPTS = [
  ['ko', /[가-힯ᄀ-ᇿ㄰-㆏]/g],
  ['kana', /[぀-ヿ]/g],
  ['han', /[一-鿿㐀-䶿]/g],
  ['hi', /[ऀ-ॿ]/g],
  ['bn', /[ঀ-৿]/g],
  ['gu', /[઀-૿]/g],
  ['ta', /[஀-௿]/g],
  ['te', /[ఀ-౿]/g],
  ['kn', /[ಀ-೿]/g],
  ['ml', /[ഀ-ൿ]/g],
  ['th', /[฀-๿]/g],
  ['he', /[֐-׿]/g],
  ['el', /[Ͱ-Ͽἀ-῿]/g],
  ['arabic', /[؀-ۿݐ-ݿ]/g],
  ['cyrillic', /[Ѐ-ӿ]/g]
]
const LATIN_LETTERS = /[a-zÀ-ɏḀ-ỿ]/gi
const UKRAINIAN_LETTERS = /[іїєґ]/gi
const SERBIAN_LETTERS = /[ђћџљњј]/gi
const BULGARIAN_LETTERS = /ъ/gi
const RUSSIAN_ONLY_LETTERS = /[ыэё]/gi
const PERSIAN_LETTERS = /[پچژگکی]/g
const NORWEGIAN_ALIASES = { no: 'nb', nn: 'nb' }
const WORD_SPLIT = /[^a-zÀ-ɏḀ-ỿ]+/i

const LATIN_HINTS = {
  en: {
    words:
      'the and is are to of in that it with for you this was have not on we be at they will your from',
    letters: ''
  },
  es: {
    words:
      'el la los las de que y en un una es por con para no se del como pero hoy vamos muy más está estás',
    letters: 'ñ¿¡'
  },
  fr: {
    words:
      'le la les de des et est un une que pour dans pas nous vous avec sur du au ce il elle sont',
    letters: 'çœèêëàâîôûù'
  },
  de: {
    words:
      'der die das und ist nicht ich ein eine zu mit den wir auf für sie es dem wie heute auch sich',
    letters: 'ßäöü'
  },
  it: {
    words: 'il di che è un una per non con sono del della gli ma oggi come poi ciao anche questo',
    letters: 'ìò'
  },
  pt: {
    words:
      'o os e à de que do da em um uma para não com se por mais hoje você muito depois são vai olá',
    letters: 'ãõ'
  },
  nl: {
    words: 'de het een en van is dat niet op te met zijn voor we naar ik ook hoe gaat vandaag',
    letters: 'ĳ'
  },
  pl: {
    words: 'i w nie na się z że to jest do jak ale co od po tak dzisiaj potem',
    letters: 'łąęśźżńć'
  },
  tr: {
    words: 've bir bu da için ile çok ne ama gibi var daha ben sen biz bugün sonra',
    letters: 'ışğ'
  },
  sv: {
    words: 'och att det är som en på för med inte jag har till av vi den hur du idag sedan',
    letters: 'å'
  },
  vi: {
    words: 'và của là có không một những được cho người này với các đi chúng tôi bạn rồi hôm nay',
    letters: 'ăơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ'
  },
  id: {
    words:
      'yang dan di ini itu dengan untuk tidak dari ke akan kami kita ada saya juga bersama apa hari lalu',
    letters: ''
  },
  ms: {
    words:
      'yang dan di ini itu dengan untuk tidak dari kami ada saya boleh sahaja kerana daripada anda sangat',
    letters: ''
  },
  ca: {
    words: 'el la els les de i que és un una per amb no del als com però avui molt també això anem',
    letters: 'ŀ'
  },
  cs: {
    words: 'a je se na že to v s z do jak ale jsem není pro tak by jsme dnes potom jdeme',
    letters: 'ěřů'
  },
  sk: {
    words: 'a je sa na že to v s z do ako ale som nie pre tak by sme dnes potom ideme',
    letters: 'ľĺŕô'
  },
  da: {
    words: 'og det er en af ikke jeg har til den hvad mig dig nu meget med vi i dag bagefter',
    letters: 'æø'
  },
  nb: {
    words: 'og det er en av ikke jeg har til den hva meg deg nå mye med vi i dag etter',
    letters: 'æø'
  },
  fi: {
    words: 'ja on ei se että hän mutta kun niin me te he tämä oli ovat myös tänään sitten',
    letters: 'äö'
  },
  et: {
    words: 'ja on ei et see ta mis kui aga ma sa me nad oli täna ka siis',
    letters: 'õäöü'
  },
  hu: {
    words: 'a az és hogy nem egy is van ez de meg csak mint már aztán mert vagy együtt',
    letters: 'őűöü'
  },
  ro: {
    words: 'și în de la cu nu că o un pe este pentru mai ce sunt azi apoi',
    letters: 'șță'
  },
  hr: {
    words: 'i je u na da se su za od ne ali što kako sam danas onda idemo',
    letters: 'ćđ'
  },
  sl: {
    words: 'in je v na da se so za od ne ampak kaj kako sem danes potem gremo',
    letters: 'čšž'
  },
  lt: {
    words: 'ir yra kad ne tai su į iš bet kaip aš mes jūs šiandien paskui',
    letters: 'ėįųū'
  },
  lv: {
    words: 'un ir ka ne tas ar uz no bet kā es mēs jūs šodien pēc tam',
    letters: 'āēīģķļņ'
  },
  is: {
    words: 'og að er það ekki ég en um á til við hann hún í dag svo',
    letters: 'þð'
  },
  sq: {
    words: 'dhe në të një që për me nuk është si por ai ajo ne sot pastaj',
    letters: 'ë'
  },
  az: {
    words: 've bir bu da üçün ilə çox nə amma kimi var daha mən sən biz sonra',
    letters: 'ə'
  }
}

const LATIN_WORDS = Object.fromEntries(
  Object.entries(LATIN_HINTS).map(([language, hint]) => [language, new Set(hint.words.split(' '))])
)

const countMatches = (text, pattern) => text.match(pattern)?.length ?? 0

function detectLatinLanguage(sample) {
  const words = sample.split(WORD_SPLIT).filter(Boolean)
  let best = null
  let bestScore = 0
  for (const [language, hint] of Object.entries(LATIN_HINTS)) {
    let score = 0
    for (const word of words) {
      if (LATIN_WORDS[language].has(word)) score += 1
    }
    for (const char of hint.letters) {
      score +=
        sample.split(char).length - 1 > 0 ? (sample.split(char).length - 1) * LETTER_WEIGHT : 0
    }
    if (score > bestScore) {
      best = language
      bestScore = score
    }
  }
  return best
}

function detectCyrillicLanguage(sample) {
  if (countMatches(sample, UKRAINIAN_LETTERS) > 0) return 'uk'
  if (countMatches(sample, SERBIAN_LETTERS) > 0) return 'sr'
  if (
    countMatches(sample, BULGARIAN_LETTERS) > 0 &&
    countMatches(sample, RUSSIAN_ONLY_LETTERS) === 0
  ) {
    return 'bg'
  }
  return 'ru'
}

export function detectTextLanguage(text) {
  const sample = String(text ?? '')
    .slice(0, SAMPLE_CHARS)
    .toLowerCase()
  const latinCount = countMatches(sample, LATIN_LETTERS)
  let dominant = null
  let dominantCount = 0
  for (const [script, pattern] of SCRIPTS) {
    const count = countMatches(sample, pattern)
    if (count > dominantCount) {
      dominant = script
      dominantCount = count
    }
  }
  if (dominant && dominantCount >= latinCount) {
    if (dominant === 'kana') return 'ja'
    if (dominant === 'han') return countMatches(sample, SCRIPTS[1][1]) > 0 ? 'ja' : 'zh'
    if (dominant === 'cyrillic') return detectCyrillicLanguage(sample)
    if (dominant === 'arabic') return countMatches(sample, PERSIAN_LETTERS) > 0 ? 'fa' : 'ar'
    return dominant
  }
  if (latinCount < MIN_LETTERS) return null
  return detectLatinLanguage(sample)
}

export function normalizeLanguageCode(locale) {
  const code = String(locale ?? '')
    .toLowerCase()
    .split(/[-_]/)[0]
  const normalized = NORWEGIAN_ALIASES[code] ?? code
  return TRANSLATION_ALL_LANGUAGES.includes(normalized) ? normalized : null
}

export function getTranslationSteps(from, to) {
  if (!TRANSLATION_ALL_LANGUAGES.includes(from) || !TRANSLATION_ALL_LANGUAGES.includes(to))
    return []
  if (from === to) return []
  if (from === TRANSLATION_SOURCE_LANGUAGE || to === TRANSLATION_SOURCE_LANGUAGE)
    return [[from, to]]
  return [
    [from, TRANSLATION_SOURCE_LANGUAGE],
    [TRANSLATION_SOURCE_LANGUAGE, to]
  ]
}

export function getTranslationModelNames(from, to) {
  return getTranslationSteps(from, to)
    .map(([stepFrom, stepTo]) => getTranslationModelName(stepFrom, stepTo))
    .filter((name) => TRANSLATION_REGISTRY_MODELS[name])
}

export const isTranslationModel = (name) =>
  TRANSLATION_REGISTRY_MODELS[name]?.engine === TRANSLATION_ENGINE

export function pickTranslationTarget({ source, lastTarget, deviceLanguage }) {
  if (source && source !== TRANSLATION_SOURCE_LANGUAGE) return TRANSLATION_SOURCE_LANGUAGE
  for (const candidate of [lastTarget, deviceLanguage]) {
    if (candidate && candidate !== source && TRANSLATION_ALL_LANGUAGES.includes(candidate)) {
      return candidate
    }
  }
  return null
}
