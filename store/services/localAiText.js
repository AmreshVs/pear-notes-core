const LINE_OVERLAP_RATIO = 0.5

function toPositioned(block, index) {
  if (!Array.isArray(block.bbox) || block.bbox.length < 4) {
    return { text: block.text, left: 0, top: index, height: 1 }
  }
  const [x, y, , fourth] = block.bbox
  const height = fourth > y ? fourth - y : fourth
  return { text: block.text, left: x, top: y, height: Math.max(height, 1) }
}

export function formatOcrBlocks(blocks) {
  const positioned = (Array.isArray(blocks) ? blocks : [])
    .filter((block) => typeof block?.text === 'string' && block.text.trim().length > 0)
    .map(toPositioned)
    .sort((a, b) => a.top - b.top || a.left - b.left)

  const lines = []
  for (const block of positioned) {
    const line = lines[lines.length - 1]
    const anchor = line?.[0]
    const sameLine =
      anchor &&
      Math.abs(block.top - anchor.top) < Math.min(anchor.height, block.height) * LINE_OVERLAP_RATIO
    if (sameLine) line.push(block)
    else lines.push([block])
  }

  return lines
    .map((line) =>
      line
        .sort((a, b) => a.left - b.left)
        .map((block) => block.text.trim())
        .join(' ')
    )
    .join('\n')
    .trim()
}
