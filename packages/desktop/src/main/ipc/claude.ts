import { spawn, type ChildProcess } from 'child_process'
import { ipcMain, type WebContents } from 'electron'
import log from 'electron-log'

interface TerminalSession {
  process: ChildProcess
  sender: WebContents
}

const activeSessions = new Map<string, TerminalSession>()

const sendIfAlive = (sender: WebContents | null | undefined, channel: string, ...args: unknown[]): void => {
  try {
    if (sender && !sender.isDestroyed()) sender.send(channel, ...args)
  } catch {
    /* sender destroyed mid-send */
  }
}

export const registerClaudeHandlers = (): void => {
  // Run claude -p non-interactively and return the full response text.
  ipcMain.handle('mt::claude::explain', async(_event, selectedText: string, docContent: string): Promise<string> => {
    const prompt = [
      'Explain the following selected text from a markdown document.',
      'Be concise and helpful. Use plain text, not markdown formatting.',
      '',
      '<selected_text>',
      selectedText,
      '</selected_text>',
      '',
      '<document_context>',
      docContent.slice(0, 8000),
      '</document_context>'
    ].join('\n')

    return new Promise<string>((resolve, reject) => {
      // Pass the prompt as a single -p argument; spawn avoids shell escaping issues.
      const proc = spawn('claude', ['-p', prompt], {
        env: { ...process.env }
      })

      let output = ''
      let errorOutput = ''

      proc.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
      proc.stderr?.on('data', (chunk: Buffer) => { errorOutput += chunk.toString() })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim())
        } else {
          const msg = errorOutput.trim() || `claude exited with code ${code}`
          log.warn('mt::claude::explain failed:', msg)
          reject(new Error(msg))
        }
      })

      proc.on('error', (err) => {
        log.error('Failed to spawn claude:', err)
        reject(new Error(
          `Failed to start 'claude': ${err.message}. ` +
          'Make sure the Claude Code CLI is installed and available in PATH.'
        ))
      })
    })
  })

  // Start an interactive claude session. Output is streamed back as IPC events.
  ipcMain.handle('mt::claude::terminal-start', async(event, terminalId: string): Promise<void> => {
    if (activeSessions.has(terminalId)) return

    const proc = spawn('claude', [], {
      env: { ...process.env, TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const sender = event.sender
    activeSessions.set(terminalId, { process: proc, sender })

    const cleanupAtSenderDestroy = (): void => {
      const session = activeSessions.get(terminalId)
      if (session) {
        session.process.kill()
        activeSessions.delete(terminalId)
      }
    }
    sender.once('destroyed', cleanupAtSenderDestroy)

    proc.stdout?.on('data', (chunk: Buffer) => {
      sendIfAlive(sender, 'mt::claude::terminal-output', terminalId, chunk.toString())
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      sendIfAlive(sender, 'mt::claude::terminal-output', terminalId, chunk.toString())
    })

    proc.on('close', (code) => {
      sendIfAlive(sender, 'mt::claude::terminal-exit', terminalId, code ?? 0)
      activeSessions.delete(terminalId)
    })

    proc.on('error', (err) => {
      log.error('claude terminal spawn error:', err)
      sendIfAlive(sender, 'mt::claude::terminal-output', terminalId,
        `Error: ${err.message}\nMake sure the Claude Code CLI is installed.\n`)
      sendIfAlive(sender, 'mt::claude::terminal-exit', terminalId, 1)
      activeSessions.delete(terminalId)
    })
  })

  ipcMain.on('mt::claude::terminal-input', (_event, terminalId: string, data: string) => {
    const session = activeSessions.get(terminalId)
    if (session?.process.stdin) {
      session.process.stdin.write(data)
    }
  })

  ipcMain.on('mt::claude::terminal-kill', (_event, terminalId: string) => {
    const session = activeSessions.get(terminalId)
    if (session) {
      session.process.kill()
      activeSessions.delete(terminalId)
    }
  })
}
