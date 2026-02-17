const FLUSH_CHARS = new Set([' ', '\n', '\r', '.', ',', '!', '?', ';', ':', '-', '_', '(', ')', '[', ']', '{', '}', '"', "'", '`'])

interface StreamRenderer {
  write(chunk: string): void
  end(): void
  isFirstToken(): boolean
}

function clearLine() {
  process.stdout.write('\r\x1b[K')
}

function createWordBuffer(): StreamRenderer {
  let buffer = ""
  let isFirstToken = true
  let inCodeBlock = false
  let codeFence = ""

  const flush = (force = false) => {
    if (buffer.length === 0) return

    const shouldFlush = force || 
      buffer.length > 50 || 
      (buffer.length > 0 && FLUSH_CHARS.has(buffer[buffer.length - 1]))

    if (shouldFlush) {
      process.stdout.write(buffer)
      buffer = ""
    }
  }

  return {
    write(chunk: string) {
      if (!chunk) return

      if (isFirstToken) {
        isFirstToken = false
        clearLine()
      }

      const codeFenceMatch = chunk.match(/^(```+|`)/)
      if (codeFenceMatch) {
        flush(true)
        codeFence = codeFenceMatch[1]
        inCodeBlock = !inCodeBlock
        process.stdout.write(chunk)
        return
      }

      if (inCodeBlock) {
        const closingFenceIndex = chunk.indexOf(codeFence)
        if (closingFenceIndex >= 0) {
          process.stdout.write(chunk.slice(0, closingFenceIndex + codeFence.length))
          inCodeBlock = false
          codeFence = ""
          if (chunk.length > closingFenceIndex + codeFence.length) {
            buffer = chunk.slice(closingFenceIndex + codeFence.length)
            flush()
          }
          return
        }
        process.stdout.write(chunk)
        return
      }

      buffer += chunk

      let flushIndex = -1
      for (let i = buffer.length - 1; i >= 0; i--) {
        if (FLUSH_CHARS.has(buffer[i])) {
          flushIndex = i
          break
        }
        if (buffer[i] === '\n' || buffer[i] === ' ') {
          flushIndex = i
          break
        }
      }

      if (flushIndex >= 0) {
        const toFlush = buffer.slice(0, flushIndex + 1)
        buffer = buffer.slice(flushIndex + 1)
        if (toFlush) process.stdout.write(toFlush)
      }

      if (buffer.length > 40) {
        flush(true)
      }
    },

    end() {
      flush(true)
    },

    isFirstToken: () => isFirstToken,
  }
}

export function createOpenCodeStreamRenderer() {
  return createWordBuffer()
}

export function createSimpleStreamRenderer() {
  return createWordBuffer()
}
