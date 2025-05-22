// NoteEditor.js - CodeMirror-based note editor component

import { getCurrentContext } from './TagNotePanel.js';

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
 * Set up event listeners for note loading/saving
 */
function setupEventListeners() {
  // Listen for load note event
  document.addEventListener('load-note', handleLoadNote);
  
  // Listen for clear note event
  document.addEventListener('clear-note', handleClearNote);
}

/**
 * Handle note change and schedule autosave
 */
function handleNoteChange() {
  if (!editor) return;
  
  const newContent = editor.value;
  currentNote = newContent;
  
  // Clear previous timeout if it exists
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  // Set new timeout for autosave (3 seconds after last change)
  saveTimeout = setTimeout(() => {
    saveNote();
  }, 3000);
}

/**
 * Save the current note
 */
async function saveNote() {
  if (!editor) {
    console.error('No editor instance found when trying to save');
    return;
  }
  
  // Get current context
  const { binaryName, functionId } = getCurrentContext();
  if (!binaryName || !functionId) {
    console.error('Missing context for saving note:', { binaryName, functionId });
    return;
  }
  
  // Get current note content
  const content = editor.value;
  
  // Don't save if nothing has changed
  if (content === lastSavedNote) return;
  
  // Clean binary name (remove special characters and spaces)
  const cleanBinaryName = binaryName.replace(/[^\w\d]/g, '_');
  
  console.log(`Saving note for ${cleanBinaryName}/${functionId}`, { contentLength: content.length });
  
  try {
    // Construct URL for API endpoint
    const url = `http://localhost:8000/api/notes/${cleanBinaryName}/${functionId}`;
    console.log(`POST Request to: ${url}`);
    
    // Save note to backend
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to save note: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Failed to save note: ${response.statusText}`);
    }
    
    // Log the response
    const responseData = await response.json();
    console.log(`Save note response:`, responseData);
    
    // Update last saved state
    lastSavedNote = content;
    lastSaveTime = new Date();
    
    console.log(`Successfully saved note for ${cleanBinaryName}/${functionId}`);
    
    // Update status
    updateSaveStatus();
  } catch (error) {
    console.error('Error saving note:', error);
  }
}

/**
 * Update the save status display
 */
function updateSaveStatus() {
  const statusElement = document.getElementById('note-status');
  if (!statusElement) return;
  
  if (!lastSaveTime) {
    statusElement.textContent = 'Last saved: Never';
    return;
  }
  
  const now = new Date();
  const diff = now - lastSaveTime;
  
  let timeText;
  if (diff < 60000) {
    timeText = 'Just now';
  } else if (diff < 3600000) {
    timeText = `${Math.floor(diff / 60000)} minutes ago`;
  } else {
    timeText = `${Math.floor(diff / 3600000)} hours ago`;
  }
  
  statusElement.textContent = `Last saved: ${timeText}`;
}

/**
 * Handle loading a note
 * @param {CustomEvent} event - The load-note event
 */
async function handleLoadNote(event) {
  if (!editor) {
    console.error('No editor instance found when trying to load note');
    return;
  }
  
  const { binaryName, functionId } = event.detail;
  if (!binaryName || !functionId) {
    console.error('Missing details for loading note:', event.detail);
    return;
  }
  
  // Clean binary name (remove special characters and spaces)
  const cleanBinaryName = binaryName.replace(/[^\w\d]/g, '_');
  
  console.log(`Loading note for ${cleanBinaryName}/${functionId}`);
  
  try {
    // Load note from backend
    const url = `http://localhost:8000/api/notes/${cleanBinaryName}/${functionId}`;
    console.log(`Fetching note from ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to load note: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Failed to load note: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Received note data:`, { hasContent: !!data.content, contentLength: data.content ? data.content.length : 0 });
    
    // Set editor content
    editor.value = data.content || '';
    
    // Update state
    lastSavedNote = data.content || '';
    currentNote = data.content || '';
    
    // Set last save time if note exists
    if (data.content) {
      lastSaveTime = new Date();
    } else {
      lastSaveTime = null;
    }
    
    // Update status
    updateSaveStatus();
  } catch (error) {
    console.error('Error loading note:', error);
    editor.value = '';
    lastSavedNote = '';
    currentNote = '';
    lastSaveTime = null;
    updateSaveStatus();
  }
}

/**
 * Handle clearing the note
 */
function handleClearNote() {
  if (!editor) return;
  
  // Clear editor content
  editor.value = '';
  lastSavedNote = '';
  currentNote = '';
  lastSaveTime = null;
  updateSaveStatus();
}