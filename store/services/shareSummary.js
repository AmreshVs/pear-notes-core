import { parseKeyPointsOutput, parseSummaryOutput } from './localAiPrompts.js'
import { findMeaningHits } from './localAiSearch.js'
import { defaultFolderKeys, pickFolderSuggestion } from './noteSuggestions.js'

export const SHARE_SUMMARY_MIN_CHARS = 120
const SHARE_TEXT_MAX_CHARS = 6000
const SHARE_FOLDER_HITS = 20
const URL_PATTERN = /\bhttps?:\/\/\S+/gi

/**
 * What the model reads for a share: shared text, link titles and PDF text.
 * A link's address is never fetched, so a bare link has nothing to summarize.
 */
export function shareSummaryInput(items, { fileTexts = {} } = {}) {
  const parts = []
  for (const item of items ?? []) {
    if (item.kind === 'text') parts.push([item.title, item.text].filter(Boolean).join('\n'))
    else if (item.kind === 'url' && item.title) parts.push(item.title)
    else if (item.kind === 'file' && fileTexts[item.id]) {
      parts.push(`${item.name}\n${fileTexts[item.id]}`)
    }
  }
  return parts.join('\n\n').trim().slice(0, SHARE_TEXT_MAX_CHARS)
}

export const canSummarizeShare = (text) =>
  String(text ?? '')
    .replace(URL_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim().length >= SHARE_SUMMARY_MIN_CHARS

export function parseShareSummary(summaryOutput, keyPointsOutput) {
  return {
    summary: parseSummaryOutput(summaryOutput).summary,
    keyPoints: parseKeyPointsOutput(keyPointsOutput)
  }
}

/** The folder the share's nearest notes share, by the same vote as unfiled notes; null if none. */
export async function suggestShareFolder({ api, embed, text, notes, folderData, feedback = null }) {
  const hits = await findMeaningHits({
    api,
    embed,
    query: text,
    limit: SHARE_FOLDER_HITS,
    minScore: 0
  })
  if (!hits?.length) return null
  const folderKey = pickFolderSuggestion(hits, (key) => notes?.[key]?.folderKey, {
    feedback,
    defaultKeys: defaultFolderKeys(folderData)
  })
  return folderKey && folderData?.[folderKey] ? folderKey : null
}

/** The summary as plain paragraphs, the shape shared items are appended to a note in. */
export function shareSummaryParagraphs(
  { summary, keyPoints },
  { summaryLabel = 'Summary', keyPointsLabel = 'Key points', bullet = '•' } = {}
) {
  const paragraphs = []
  if (summary) paragraphs.push({ text: summaryLabel }, { text: summary })
  if (keyPoints?.length) {
    paragraphs.push({ text: keyPointsLabel })
    for (const point of keyPoints) paragraphs.push({ text: `${bullet} ${point}` })
  }
  return paragraphs
}
