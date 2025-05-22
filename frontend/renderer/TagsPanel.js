// TagsPanel.js - Component for managing function tags

import { getCurrentContext } from './TagNotePanel.js';

// Tag type definitions
const TAG_TYPES = {
  Behavioral: {
    description: "Describes what the function does",
    examples: ["decryptor", "c2_handler", "keygen", "network_comm"]
  },
  Structural: {
    description: "Describes how the function fits into the program architecture",
    examples: ["entrypoint", "syscall_wrapper", "helper_function"]
  },
  Workflow: {
    description: "Describes the analyst's workflow state",
    examples: ["needs_review", "stumped", "false_positive", "suspicious"]
  }
};

// Current tags state
let currentTags = [];

/**
 * Initialize the tags panel
 */
export function initTagsPanel() {
  // Set up the initial panel UI
  setupTagsPanel();
  
  // Set up event listeners
  setupEventListeners();
}

/**
 * Set up the tags panel UI
 */
function setupTagsPanel() {
  const tagsPanel = document.getElementById('tags-panel');
  if (!tagsPanel) return;
  
  // Create tag type sections
  const panelHTML = `
    <div class="tags-content">
      ${Object.keys(TAG_TYPES).map(type => createTagTypeSection(type)).join('')}
    </div>
    
    <div class="new-tag-form">
      <div class="new-tag-heading">Add New Tag</div>
      <div class="new-tag-input-group">
        <input type="text" class="new-tag-input" id="new-tag-input" placeholder="Enter tag value...">
        <select class="new-tag-type" id="new-tag-type">
          ${Object.keys(TAG_TYPES).map(type => `<option value="${type}">${type}</option>`).join('')}
        </select>
        <button class="new-tag-submit" id="new-tag-submit">Add</button>
      </div>
    </div>
  `;
  
  tagsPanel.innerHTML = panelHTML;
  
  // Setup collapsible behavior
  setupCollapsibleGroups();
  
  // Setup tooltips
  setupTagTooltips();
  
  // Setup new tag functionality
  setupNewTagForm();
}

/**
 * Create HTML for a tag type section
 * @param {string} type - The tag type name
 * @returns {string} HTML for the tag type section
 */
function createTagTypeSection(type) {
  return `
    <div class="tags-group" data-type="${type}">
      <div class="tags-group-header" title="${TAG_TYPES[type].description}">
        <div class="tags-group-toggle">▼</div>
        <div class="tags-group-name">${type}</div>
      </div>
      <div class="tags-group-content"></div>
    </div>
  `;
}

/**
 * Setup collapsible behavior for tag groups
 */
function setupCollapsibleGroups() {
  const headers = document.querySelectorAll('.tags-group-header');
  
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const group = header.closest('.tags-group');
      group.classList.toggle('collapsed');
    });
  });
}

/**
 * Setup tooltips for tag types
 */
function setupTagTooltips() {
  const headers = document.querySelectorAll('.tags-group-header');
  
  headers.forEach(header => {
    const type = header.closest('.tags-group').getAttribute('data-type');
    if (type && TAG_TYPES[type]) {
      const description = TAG_TYPES[type].description;
      const examples = TAG_TYPES[type].examples.join(', ');
      header.setAttribute('title', `${description}\nExamples: ${examples}`);
    }
  });
}

/**
 * Setup new tag form functionality
 */
function setupNewTagForm() {
  const addButton = document.getElementById('new-tag-submit');
  const tagInput = document.getElementById('new-tag-input');
  const tagType = document.getElementById('new-tag-type');
  
  if (!addButton || !tagInput || !tagType) return;
  
  addButton.addEventListener('click', () => {
    addNewTag();
  });
  
  tagInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addNewTag();
    }
  });
}

/**
 * Add a new tag based on form input
 */
function addNewTag() {
  const tagInput = document.getElementById('new-tag-input');
  const tagType = document.getElementById('new-tag-type');
  
  if (!tagInput || !tagType) return;
  
  const tagValue = tagInput.value.trim();
  const tagTypeName = tagType.value;
  
  if (!tagValue) return;
  
  // Create new tag object
  const newTag = {
    type: tagTypeName,
    value: tagValue,
    includeInAI: true
  };
  
  // Add to current tags if not already present
  const exists = currentTags.some(tag => 
    tag.type === newTag.type && tag.value === newTag.value
  );
  
  if (!exists) {
    currentTags.push(newTag);
    
    // Update UI
    renderTags();
    
    // Save tags
    saveCurrentTags();
    
    // Clear input
    tagInput.value = '';
  }
}

/**
 * Setup event listeners for tags panel
 */
function setupEventListeners() {
  // Listen for load tags event
  document.addEventListener('load-tags', handleLoadTags);
  
  // Listen for clear tags event
  document.addEventListener('clear-tags', handleClearTags);
}

/**
 * Handle loading tags
 * @param {CustomEvent} event - The load-tags event
 */
async function handleLoadTags(event) {
  const { binaryName, functionId } = event.detail;
  
  try {
    // Load tags from backend
    const response = await fetch(`http://localhost:8000/api/tags/${binaryName}/${functionId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to load tags: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Update state
    currentTags = data.tags || [];
    
    // Render tags
    renderTags();
  } catch (error) {
    console.error('Error loading tags:', error);
    currentTags = [];
    renderTags();
  }
}

/**
 * Handle clearing tags
 */
function handleClearTags() {
  currentTags = [];
  renderTags();
}

/**
 * Render current tags to the UI
 */
function renderTags() {
  // Group tags by type
  const tagsByType = {};
  
  Object.keys(TAG_TYPES).forEach(type => {
    tagsByType[type] = [];
  });
  
  currentTags.forEach(tag => {
    if (tagsByType[tag.type]) {
      tagsByType[tag.type].push(tag);
    }
  });
  
  // Render each type section
  Object.keys(tagsByType).forEach(type => {
    const contentElement = document.querySelector(`.tags-group[data-type="${type}"] .tags-group-content`);
    if (!contentElement) return;
    
    // Build HTML for tags of this type
    let tagsHTML = '';
    
    if (tagsByType[type].length === 0) {
      tagsHTML = '<div class="no-tags-message">No tags of this type</div>';
    } else {
      tagsHTML = tagsByType[type].map(tag => `
        <div class="tag-item" data-type="${tag.type}" data-value="${tag.value}">
          <div class="tag-name">${tag.value}</div>
          <div class="tag-ai-toggle">
            <input type="checkbox" class="tag-ai-checkbox" ${tag.includeInAI ? 'checked' : ''}>
            <span class="tag-ai-toggle-label">AI</span>
            <button class="tag-delete" title="Delete tag">×</button>
          </div>
        </div>
      `).join('');
    }
    
    contentElement.innerHTML = tagsHTML;
  });
  
  // Add event listeners to tags
  setupTagEventListeners();
}

/**
 * Setup event listeners for the rendered tags
 */
function setupTagEventListeners() {
  // AI toggle checkboxes
  document.querySelectorAll('.tag-ai-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleTagAIToggle);
  });
  
  // Delete tag buttons
  document.querySelectorAll('.tag-delete').forEach(button => {
    button.addEventListener('click', handleTagDelete);
  });
}

/**
 * Handle toggling the AI inclusion for a tag
 * @param {Event} event - The change event
 */
function handleTagAIToggle(event) {
  const checkbox = event.target;
  const tagItem = checkbox.closest('.tag-item');
  
  if (!tagItem) return;
  
  const type = tagItem.getAttribute('data-type');
  const value = tagItem.getAttribute('data-value');
  
  // Update tag in current tags
  const tagIndex = currentTags.findIndex(tag => 
    tag.type === type && tag.value === value
  );
  
  if (tagIndex !== -1) {
    currentTags[tagIndex].includeInAI = checkbox.checked;
    
    // Save updated tags
    saveCurrentTags();
  }
}

/**
 * Handle deleting a tag
 * @param {Event} event - The click event
 */
function handleTagDelete(event) {
  const button = event.target;
  const tagItem = button.closest('.tag-item');
  
  if (!tagItem) return;
  
  const type = tagItem.getAttribute('data-type');
  const value = tagItem.getAttribute('data-value');
  
  // Remove tag from current tags
  currentTags = currentTags.filter(tag => 
    !(tag.type === type && tag.value === value)
  );
  
  // Update UI
  renderTags();
  
  // Save updated tags
  saveCurrentTags();
}

/**
 * Save current tags to the backend
 */
async function saveCurrentTags() {
  // Get current context
  const { binaryName, functionId } = getCurrentContext();
  if (!binaryName || !functionId) return;
  
  try {
    // Save tags to backend
    const response = await fetch(`http://localhost:8000/api/tags/${binaryName}/${functionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tags: currentTags })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save tags: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error saving tags:', error);
  }
} 