<template>
  <div class="claude-panel">
    <div class="claude-panel__header">
      <span class="claude-panel__title">Claude</span>
      <div class="claude-panel__header-actions">
        <button
          class="claude-panel__icon-btn"
          :class="{ active: activeTab === 'terminal' }"
          title="Open Claude terminal"
          @click="switchToTerminal"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="4 17 10 11 4 5" />
            <line
              x1="12"
              y1="19"
              x2="20"
              y2="19"
            />
          </svg>
        </button>
        <button
          class="claude-panel__icon-btn"
          title="Close panel"
          @click="layoutStore.TOGGLE_CLAUDE_PANEL()"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line
              x1="18"
              y1="6"
              x2="6"
              y2="18"
            />
            <line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- Explain tab -->
    <div
      v-if="activeTab === 'explain'"
      class="claude-panel__body"
    >
      <div class="claude-panel__explain-controls">
        <div class="claude-panel__selection-preview">
          <span
            v-if="selectedText"
            class="claude-panel__selection-text"
          >
            "{{ truncated }}"
          </span>
          <span
            v-else
            class="claude-panel__no-selection"
          >
            Select text in the editor to explain it
          </span>
        </div>
        <button
          class="claude-panel__explain-btn"
          :disabled="!selectedText || isLoading"
          @click="runExplain"
        >
          {{ isLoading ? 'Explaining…' : 'Explain selection' }}
        </button>
      </div>

      <div class="claude-panel__result-area">
        <div
          v-if="isLoading"
          class="claude-panel__loading"
        >
          <div class="claude-panel__spinner" />
          <span>Asking Claude…</span>
        </div>
        <div
          v-else-if="error"
          class="claude-panel__error"
        >
          <strong>Error:</strong> {{ error }}
        </div>
        <div
          v-else-if="result"
          class="claude-panel__result-wrapper"
        >
          <pre class="claude-panel__result">{{ result }}</pre>
          <div class="claude-panel__result-actions">
            <button
              class="claude-panel__save-btn"
              :disabled="isSaving"
              :title="`Save to ${notesFileName}`"
              @click="saveToReadme"
            >
              {{ saveStatus || `Save to ${notesFileName}` }}
            </button>
          </div>
        </div>
        <div
          v-else
          class="claude-panel__empty"
        >
          Explanation will appear here
        </div>
      </div>
    </div>

    <!-- Terminal tab -->
    <div
      v-else-if="activeTab === 'terminal'"
      class="claude-panel__body claude-panel__body--terminal"
    >
      <div class="claude-panel__terminal-toolbar">
        <button
          v-if="!terminalRunning"
          class="claude-panel__explain-btn"
          @click="startTerminal"
        >
          Start Claude
        </button>
        <button
          v-else
          class="claude-panel__explain-btn claude-panel__explain-btn--danger"
          @click="killTerminal"
        >
          Stop
        </button>
        <button
          class="claude-panel__icon-btn"
          title="Clear output"
          @click="terminalOutput = ''"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
      <pre
        ref="terminalOutputEl"
        class="claude-panel__terminal-output"
      >{{ terminalOutput }}</pre>
      <div class="claude-panel__terminal-input-row">
        <input
          ref="terminalInputEl"
          v-model="terminalInput"
          class="claude-panel__terminal-input"
          placeholder="Type a message and press Enter…"
          :disabled="!terminalRunning"
          @keydown.enter.prevent="sendTerminalInput"
        >
        <button
          class="claude-panel__send-btn"
          :disabled="!terminalRunning || !terminalInput"
          @click="sendTerminalInput"
        >
          Send
        </button>
      </div>
    </div>

    <!-- Drag handle -->
    <div
      ref="dragHandle"
      class="claude-panel__drag-handle"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useEditorStore } from '@/store/editor'
import { storeToRefs } from 'pinia'

const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const { currentFile } = storeToRefs(editorStore)

const activeTab = ref<'explain' | 'terminal'>('explain')

// ── Explain state ────────────────────────────────────────────────
const selectedText = ref('')
const isLoading = ref(false)
const result = ref('')
const error = ref('')

const truncated = computed(() =>
  selectedText.value.length > 120
    ? selectedText.value.slice(0, 120) + '…'
    : selectedText.value
)

// Track native DOM selection so the panel always reflects what's highlighted
const updateSelection = (): void => {
  const sel = window.getSelection()
  const text = sel?.toString().trim() ?? ''
  if (text) selectedText.value = text
}

onMounted(() => {
  document.addEventListener('selectionchange', updateSelection)
  setupDragHandle()
})

onUnmounted(() => {
  document.removeEventListener('selectionchange', updateSelection)
  if (terminalRunning.value) killTerminal()
  unsubOutput?.()
  unsubExit?.()
})

const runExplain = async (): Promise<void> => {
  if (!selectedText.value || isLoading.value) return
  isLoading.value = true
  result.value = ''
  error.value = ''
  saveStatus.value = ''
  try {
    const docContent = currentFile.value?.markdown ?? ''
    result.value = await window.claude.explain(selectedText.value, docContent)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    isLoading.value = false
  }
}

// ── Save to README-build.md ──────────────────────────────────────
const isSaving = ref(false)
const saveStatus = ref('')

const notesFileName = 'README-build.md'

const notesFilePath = computed<string | null>(() => {
  const pathname = currentFile.value?.pathname
  if (!pathname) return null
  return window.path.join(window.path.dirname(pathname), notesFileName)
})

const saveToReadme = async (): Promise<void> => {
  const filePath = notesFilePath.value
  if (!filePath || !result.value) return

  isSaving.value = true
  saveStatus.value = ''
  try {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const excerpt = selectedText.value.length > 80
      ? selectedText.value.slice(0, 80) + '…'
      : selectedText.value

    const entry = [
      `## ${timestamp}`,
      '',
      `> **Selected:** ${excerpt}`,
      '',
      result.value.trim(),
      '',
      '---',
      ''
    ].join('\n')

    const exists = await window.fileUtils.pathExists(filePath)
    if (exists) {
      const current = await window.fileUtils.readFile(filePath) as string
      await window.fileUtils.writeFile(filePath, current + '\n' + entry)
    } else {
      const header = `# Claude Explanations\n\nExplanations generated while reading \`${window.path.basename(currentFile.value?.pathname ?? '')}\`.\n\n---\n\n`
      await window.fileUtils.writeFile(filePath, header + entry)
    }

    saveStatus.value = 'Saved!'
    setTimeout(() => { saveStatus.value = '' }, 2500)
  } catch (err) {
    saveStatus.value = `Error: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    isSaving.value = false
  }
}

// ── Terminal state ───────────────────────────────────────────────
const terminalRunning = ref(false)
const terminalOutput = ref('')
const terminalInput = ref('')
const terminalOutputEl = ref<HTMLPreElement | null>(null)
const terminalInputEl = ref<HTMLInputElement | null>(null)
const terminalId = 'claude-panel-terminal'

let unsubOutput: (() => void) | undefined
let unsubExit: (() => void) | undefined

const scrollTerminalToBottom = (): void => {
  nextTick(() => {
    if (terminalOutputEl.value) {
      terminalOutputEl.value.scrollTop = terminalOutputEl.value.scrollHeight
    }
  })
}

const stripAnsi = (str: string): string =>
  // eslint-disable-next-line no-control-regex
  str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')

const startTerminal = async (): Promise<void> => {
  terminalOutput.value = ''
  terminalRunning.value = true

  unsubOutput = window.claude.onOutput((id, data) => {
    if (id !== terminalId) return
    terminalOutput.value += stripAnsi(data)
    scrollTerminalToBottom()
  })

  unsubExit = window.claude.onExit((id, code) => {
    if (id !== terminalId) return
    terminalRunning.value = false
    terminalOutput.value += `\n[Session ended with code ${code}]\n`
    scrollTerminalToBottom()
  })

  try {
    await window.claude.startTerminal(terminalId)
  } catch (err) {
    terminalOutput.value += `Error: ${err instanceof Error ? err.message : String(err)}\n`
    terminalRunning.value = false
  }

  nextTick(() => terminalInputEl.value?.focus())
}

const killTerminal = (): void => {
  window.claude.killTerminal(terminalId)
  terminalRunning.value = false
  unsubOutput?.()
  unsubExit?.()
  unsubOutput = undefined
  unsubExit = undefined
}

const sendTerminalInput = (): void => {
  if (!terminalRunning.value || !terminalInput.value) return
  window.claude.sendInput(terminalId, terminalInput.value + '\n')
  terminalOutput.value += `> ${terminalInput.value}\n`
  terminalInput.value = ''
  scrollTerminalToBottom()
}

const switchToTerminal = (): void => {
  activeTab.value = activeTab.value === 'terminal' ? 'explain' : 'terminal'
}

// ── Drag-to-resize ────────────────────────────────────────────────
const dragHandle = ref<HTMLDivElement | null>(null)

const setupDragHandle = (): void => {
  const handle = dragHandle.value
  if (!handle) return

  let startX = 0
  let startWidth = 0

  const onMove = (e: MouseEvent): void => {
    const panel = handle.closest('.claude-panel') as HTMLElement | null
    if (!panel) return
    const newWidth = startWidth - (e.clientX - startX)
    panel.style.width = `${Math.max(280, newWidth)}px`
  }

  const onUp = (): void => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    const panel = handle.closest('.claude-panel') as HTMLElement | null
    startX = e.clientX
    startWidth = panel ? panel.offsetWidth : 380
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })
}

// Auto-explain when panel opens and text is already selected
watch(
  () => layoutStore.showClaudePanel,
  (visible) => {
    if (visible) {
      updateSelection()
    }
  }
)
</script>

<style scoped>
.claude-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 380px;
  height: 100vh;
  background: var(--editorBgColor, #1e1e2e);
  border-left: 1px solid var(--itemBgColor, #333);
  position: relative;
  font-size: 13px;
  color: var(--editorColor, #cdd6f4);
}

.claude-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--itemBgColor, #333);
  flex-shrink: 0;
  user-select: none;
}

.claude-panel__title {
  font-weight: 600;
  font-size: 13px;
  color: var(--themeColor, #cba6f7);
  letter-spacing: 0.02em;
}

.claude-panel__header-actions {
  display: flex;
  gap: 4px;
}

.claude-panel__icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
  color: var(--iconColor, #888);
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--selectionBgColor, rgba(255,255,255,0.08));
    color: var(--editorColor, #cdd6f4);
  }

  &.active {
    color: var(--themeColor, #cba6f7);
  }
}

.claude-panel__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  padding: 12px;
  gap: 10px;
}

.claude-panel__body--terminal {
  padding: 8px;
}

/* Explain tab */
.claude-panel__explain-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.claude-panel__selection-preview {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--codeBgColor, rgba(255,255,255,0.05));
  min-height: 36px;
  display: flex;
  align-items: center;
}

.claude-panel__selection-text {
  color: var(--editorColor, #cdd6f4);
  font-style: italic;
  font-size: 12px;
  line-height: 1.4;
  word-break: break-word;
}

.claude-panel__no-selection {
  color: var(--iconColor, #888);
  font-size: 12px;
}

.claude-panel__explain-btn {
  padding: 7px 14px;
  border: 1px solid var(--themeColor, #cba6f7);
  border-radius: 6px;
  background: transparent;
  color: var(--themeColor, #cba6f7);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: background 0.15s, color 0.15s;
  align-self: flex-start;

  &:hover:not(:disabled) {
    background: var(--themeColor, #cba6f7);
    color: var(--editorBgColor, #1e1e2e);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--danger {
    border-color: #f38ba8;
    color: #f38ba8;

    &:hover:not(:disabled) {
      background: #f38ba8;
      color: var(--editorBgColor, #1e1e2e);
    }
  }
}

.claude-panel__result-area {
  flex: 1;
  overflow: auto;
  border-radius: 6px;
  background: var(--codeBgColor, rgba(255,255,255,0.03));
}

.claude-panel__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  color: var(--iconColor, #888);
  font-size: 12px;
}

.claude-panel__spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--itemBgColor, #444);
  border-top-color: var(--themeColor, #cba6f7);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.claude-panel__error {
  padding: 12px;
  color: #f38ba8;
  font-size: 12px;
  line-height: 1.5;
}

.claude-panel__result-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.claude-panel__result-actions {
  flex-shrink: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--itemBgColor, #333);
}

.claude-panel__save-btn {
  width: 100%;
  padding: 7px 14px;
  border: 1px solid var(--itemBgColor, #444);
  border-radius: 6px;
  background: transparent;
  color: var(--editorColor, #cdd6f4);
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s, border-color 0.15s;
  text-align: center;

  &:hover:not(:disabled) {
    border-color: var(--themeColor, #cba6f7);
    color: var(--themeColor, #cba6f7);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.claude-panel__result {
  flex: 1;
  overflow: auto;
  padding: 12px;
  margin: 0;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--editorColor, #cdd6f4);
}

.claude-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--iconColor, #888);
  font-size: 12px;
}

/* Terminal tab */
.claude-panel__terminal-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.claude-panel__terminal-output {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 8px;
  font-family: 'Cascadia Code', 'Fira Mono', 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  background: var(--codeBgColor, rgba(0,0,0,0.3));
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--editorColor, #cdd6f4);
}

.claude-panel__terminal-input-row {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.claude-panel__terminal-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--itemBgColor, #444);
  border-radius: 6px;
  background: var(--codeBgColor, rgba(255,255,255,0.05));
  color: var(--editorColor, #cdd6f4);
  font-size: 12px;
  outline: none;

  &:focus {
    border-color: var(--themeColor, #cba6f7);
  }

  &:disabled {
    opacity: 0.4;
  }
}

.claude-panel__send-btn {
  padding: 6px 12px;
  border: 1px solid var(--itemBgColor, #444);
  border-radius: 6px;
  background: transparent;
  color: var(--editorColor, #cdd6f4);
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;

  &:hover:not(:disabled) {
    background: var(--selectionBgColor, rgba(255,255,255,0.08));
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

/* Drag handle on the left edge */
.claude-panel__drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 3px;
  cursor: col-resize;

  &:hover {
    border-left: 2px solid var(--iconColor, #888);
  }
}
</style>
