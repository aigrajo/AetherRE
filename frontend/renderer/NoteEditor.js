// NoteEditor.js - CodeMirror-based note editor component

import { getCurrentContext } from './TagNotePanel.js';
import { recordAction } from './historyManager.js';

// CodeMirror editor instance
let editor = null;

// Note state
let currentNote = '';
let lastSavedNote = '';
let saveTimeout = null;
let lastSaveTime = null;

/**
 * Initialize the note editor
 */
export function initNoteEditor() {
  setupEditor();
  setupEventListeners();
}

/**
 * Set up the CodeMirror editor
 * Using a simple textarea for now, as CodeMirror 6 needs to be properly configured
 */
function setupEditor() {
  const editorContainer = document.getElementById('note-editor');
  if (!editorContainer) return;
  
  // Create a simple textarea for now
  const textarea = document.createElement('textarea');
  textarea.className = 'simple-editor';
  textarea.style.width = '100%';
  textarea.style.height = '100%';
  textarea.style.resize = 'none';
  textarea.style.padding = '8px';
  textarea.style.border = 'none';
  textarea.style.fontFamily = 'Fira Code, monospace';
  textarea.style.fontSize = '14px';
  textarea.style.backgroundColor = 'var(--bg-input, #1e1e1e)';
  textarea.style.color = 'var(--text-primary, #e0e0e0)';
  
  // Store the textarea as our editor
  editor = textarea;
  
  // Clear the container and add the textarea
  editorContainer.innerHTML = '';
  editorContainer.appendChild(textarea);
  
  // Add event listeners
  textarea.addEventListener('input', handleNoteChange);
  textarea.addEventListener('blur', saveNote);
}

/**
 * Handle note content change
 */
function handleNoteChange() {
  if (!editor) return;

  const newNote = editor.value;
  
  // Schedule a save operation
  scheduleNoteSave(newNote);
}

/**
 * Schedule a note save operation
 */
function scheduleNoteSave(newContent) {
  // Clear any existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  // Set a new timeout
  saveTimeout = setTimeout(() => {
    saveNote(newContent);
  }, 1000); // Save 1 second after typing stops
}

/**
 * Save the note content
 */
async function saveNote(contentOrEvent) {
  // Clear any pending save timeouts
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  
  // If called from an event listener, get content from editor
  let newContent;
  if (contentOrEvent && typeof contentOrEvent === 'object') {
    if (!editor) return;
    newContent = editor.value;
  } else {
    newContent = contentOrEvent;
  }
  
  // Don't save if nothing changed
  if (newContent === lastSavedNote) return;
  
  // Store old content for undo/redo
  const oldContent = lastSavedNote;
  const context = await getCurrentContext();
  
  // Save the note to backend API
  if (context && context.binaryName && context.functionId) {
    try {
      const response = await fetch(`http://localhost:8000/api/notes/${context.binaryName}/${context.functionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: newContent })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save note: ${response.statusText}`);
      }
      
      console.log(`Note saved for ${context.binaryName}/${context.functionId}`);
    } catch (error) {
      console.error('Error saving note:', error);
      updateNoteStatusMessage('Save failed');
      return;
    }
  } else {
    console.warn('Cannot save note: missing context', context);
  }
  
  // Record action for undo/redo
  recordAction({
    type: 'edit_note',
    oldState: {
      content: oldContent,
      context: JSON.parse(JSON.stringify(context))
    },
    newState: {
      content: newContent,
      context: JSON.parse(JSON.stringify(context))
    },
    undo: async () => {
      // Restore the old note content if we're on the same context
      const currentContext = await getCurrentContext();
      if (currentContext && 
          context && 
          currentContext.type === context.type && 
          currentContext.id === context.id) {
        
        if (editor) {
          editor.value = oldContent;
          lastSavedNote = oldContent;
          currentNote = oldContent;
          
          // Update UI elements to show note was restored
          updateNoteStatusMessage('Restored previous note version');
        }
      }
    },
    redo: async () => {
      // Restore the new note content if we're on the same context
      const currentContext = await getCurrentContext();
      if (currentContext && 
          context && 
          currentContext.type === context.type && 
          currentContext.id === context.id) {
        
        if (editor) {
          editor.value = newContent;
          lastSavedNote = newContent;
          currentNote = newContent;
          
          // Update UI elements to show note was restored
          updateNoteStatusMessage('Restored newer note version');
        }
      }
    }
  });
  
  // Update saved note state
  lastSavedNote = newContent;
  lastSaveTime = new Date();
  
  // Update UI
  updateNoteStatusMessage('Saved');
}

/**
 * Update the note status message
 */
function updateNoteStatusMessage(message) {
  const statusElement = document.querySelector('.note-status');
  if (statusElement) {
    statusElement.textContent = message;
    statusElement.style.opacity = '1';
    
    // Fade out after a delay
    setTimeout(() => {
      statusElement.style.opacity = '0';
    }, 2000);
  }
}

/**
 * Set editor content
 */
export function setNoteContent(content) {
  if (!editor) return;
  
  // Set the content
  editor.value = content || '';
  
  // Update saved state - this content is considered "already saved"
  currentNote = content || '';
  lastSavedNote = content || '';
  
  // Clear any pending save timeouts since we're loading fresh content
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  
  console.log(`NoteEditor: Content set to ${(content || '').length} characters`);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Listen for load note event from TagNotePanel
  document.addEventListener('load-note', handleLoadNote);
  
  // Listen for clear note event from TagNotePanel
  document.addEventListener('clear-note', handleClearNote);
}

/**
 * Handle loading a note for a specific function
 * @param {CustomEvent} event - The load-note event containing binary and function info
 */
async function handleLoadNote(event) {
  const { binaryName, functionId } = event.detail;
  
  console.log(`NoteEditor: Loading note for ${binaryName}/${functionId}`);
  
  try {
    // Load note from backend
    const response = await fetch(`http://localhost:8000/api/notes/${binaryName}/${functionId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to load note: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Update editor content
    setNoteContent(data.content || '');
    
    // Update status
    if (data.content && data.content.trim()) {
      updateNoteStatusMessage('Note loaded');
    } else {
      updateNoteStatusMessage('No note for this function');
    }
    
    console.log(`NoteEditor: Note loaded for ${binaryName}/${functionId}`);
  } catch (error) {
    console.error('Error loading note:', error);
    setNoteContent('');
    updateNoteStatusMessage('Failed to load note');
  }
}

/**
 * Handle clearing the note editor
 */
function handleClearNote() {
  console.log('NoteEditor: Clearing note content');
  setNoteContent('');
  updateNoteStatusMessage('Ready');
}

/**
 * Get the current note content
 */
export function getNoteContent() {
  if (!editor) return '';
  return editor.value;
}