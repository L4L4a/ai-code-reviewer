export interface DiffLine {
  lineNumber: number
  type: 'added' | 'removed' | 'context'
  content: string
}

export interface FileDiff {
  path: string
  lines: DiffLine[]
}

export function parseDiff(rawDiff: string): FileDiff[] {
  // split into one section per file
  const files = rawDiff.split('diff --git').filter(Boolean)

  return files.map(fileSection => {
    // extract file path from "+++ b/src/index.ts"
    const pathMatch = fileSection.match(/\+\+\+ b\/(.+)/)
    const path = pathMatch ? pathMatch[1].trim() : 'unknown'

    const lines = fileSection.split('\n')
    let currentLine = 0
    const diffLines: DiffLine[] = []

    lines.forEach(line => {
      // @@ lines tell us the starting line number
      if (line.startsWith('@@')) {
        const match = line.match(/\+(\d+)/)
        if (match) currentLine = parseInt(match[1])
        return
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        diffLines.push({ lineNumber: currentLine, type: 'added', content: line.slice(1).trim() })
        currentLine++
        return
      }

      // removals don't increment — they're gone in the new version
      if (line.startsWith('-') && !line.startsWith('---')) {
        diffLines.push({ lineNumber: currentLine, type: 'removed', content: line.slice(1).trim() })
        return
      }

      if (line.length > 0) {
        diffLines.push({ lineNumber: currentLine, type: 'context', content: line.trim() })
        currentLine++
      }
    })

    return { path, lines: diffLines }
  })
}

export function formatDiffForReview(diffs: FileDiff[]): string {
  return diffs.map(file => {
    const changes = file.lines
      .filter(line => line.type === 'added' || line.type === 'removed')
      .map(line => {
        const symbol = line.type === 'added' ? '+' : '-'
        return `  ${symbol} line ${line.lineNumber}: ${line.content}`
      })
      .join('\n')

    return `File: ${file.path}\n${changes}`
  }).join('\n\n')
}