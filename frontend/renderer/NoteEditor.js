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
function saveNote(contentOrEvent) {
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
  const context = getCurrentContext();
  
  // Save the note
  // This would normally call a backend API
  console.log('Saving note:', newContent);
  console.log('Context:', context);
  
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
    undo: () => {
      // Restore the old note content if we're on the same context
      const currentContext = getCurrentContext();
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
    redo: () => {
      // Restore the new note content if we're on the same context
      const currentContext = getCurrentContext();
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
  
  // Update saved state
  currentNote = content || '';
  lastSavedNote = content || '';
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Nothing to do here for now
}

/**
 * Get the current note content
 */
export function getNoteContent() {
  if (!editor) return '';
  return editor.value;
}