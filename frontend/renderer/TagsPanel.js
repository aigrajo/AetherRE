// TagsPanel.js - Component for managing function tags

import { getCurrentContext } from './TagNotePanel.js';
import { apiService } from './apiService.js';

// Global reference to tag types and colors (will be loaded from backend)
let TAG_TYPES = {};
let TAG_COLORS = [];

// Current tags state
let currentTags = [];

/**
 * Initialize the tags panel
 */
export async function initTagsPanel() {
  try {
    // Load tag types and colors from backend
    const [typesResponse, colorsResponse] = await Promise.all([
      apiService.getTagTypes(),
      apiService.getTagColors()
    ]);
    
    TAG_TYPES = typesResponse.tag_types;
    TAG_COLORS = colorsResponse.colors;
    
    // Set up the initial panel UI
    setupTagsPanel();
    
    // Set up event listeners
    setupEventListeners();
  } catch (error) {
    console.error('Failed to initialize tags panel:', error);
    // Fallback logic for TAG_TYPES and TAG_COLORS has been removed.
    // The panel might not be fully functional if these are not loaded.
    setupTagsPanel(); // Attempt to setup panel, may be partially initialized
    setupEventListeners(); // Setup listeners regardless
  }
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
      <div class="new-tag-inputs">
        <div class="new-tag-input-group">
          <input type="text" class="new-tag-input" id="new-tag-input" placeholder="Enter tag value...">
          <select class="new-tag-type" id="new-tag-type">
            ${Object.keys(TAG_TYPES).map(type => `<option value="${type}">${type}</option>`).join('')}
          </select>
        </div>
        <div class="tag-color-selector">
          <div class="color-preview" id="color-preview"></div>
          <div class="color-options" id="color-options">
            ${TAG_COLORS.map(color => 
              `<div class="color-option" style="background-color: ${color}" data-color="${color}"></div>`
            ).join('')}
          </div>
        </div>
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
  
  // Setup color picker
  setupColorPicker();
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
 * Setup color picker functionality
 */
function setupColorPicker() {
  const colorPreview = document.getElementById('color-preview');
  const colorOptions = document.getElementById('color-options');
  const colorSelectors = document.querySelectorAll('.color-option');
  
  if (!colorPreview || !colorOptions) return;
  
  // Set default color
  let selectedColor = TAG_COLORS[0];
  colorPreview.style.backgroundColor = selectedColor;
  
  // Show/hide color options when preview is clicked
  colorPreview.addEventListener('click', () => {
    colorOptions.classList.toggle('visible');
  });
  
  // Select color when clicked
  colorSelectors.forEach(selector => {
    selector.addEventListener('click', () => {
      selectedColor = selector.getAttribute('data-color');
      colorPreview.style.backgroundColor = selectedColor;
      colorOptions.classList.remove('visible');
    });
  });
}

/**
 * Setup new tag form functionality
 */
function setupNewTagForm() {
  const addButton = document.getElementById('new-tag-submit');
  const tagInput = document.getElementById('new-tag-input');
  const tagType = document.getElementById('new-tag-type');
  const colorPreview = document.getElementById('color-preview');
  
  if (!addButton || !tagInput || !tagType || !colorPreview) return;
  
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
 * Add a new tag
 */
async function addNewTag() {
  const tagInput = document.getElementById('new-tag-input');
  const tagValue = tagInput.value.trim();
  
  if (!tagValue) {
    alert('Please enter a tag value');
    return;
  }
  
  const selectedType = getCurrentTagType();
  const selectedColor = getCurrentTagColor();
  
  if (!selectedType) {
    alert('Please select a tag type');
    return;
  }
  
  try {
    const context = await getCurrentContext();
    if (!context || !context.binaryName || !context.functionId) {
      alert('No function selected');
      return;
    }
    
    // Use backend API to add the tag with validation
    const result = await apiService.addTag(
      context.binaryName,
      context.functionId,
      selectedType,
      tagValue,
      rgbToHex(selectedColor), // Convert RGB to hex
      true // include in AI by default
    );
    
    if (result.success) {
      // Clear form
      tagInput.value = '';
      
      // Reload tags to show the new one
      await loadCurrentTags();
    } else {
      alert(result.message || 'Failed to add tag');
    }
  } catch (error) {
    console.error('Error adding tag:', error);
    alert('Error adding tag: ' + error.message);
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
  
  // Setup document click listener to close color picker when clicking outside
  document.addEventListener('click', (e) => {
    const colorOptions = document.getElementById('color-options');
    const colorPreview = document.getElementById('color-preview');
    
    if (colorOptions && colorOptions.classList.contains('visible') && 
        !e.target.closest('.color-options') && e.target !== colorPreview) {
      colorOptions.classList.remove('visible');
    }
  });
}

/**
 * Handle loading tags
 * @param {CustomEvent} event - The load-tags event
 */
async function handleLoadTags(event) {
  const { binaryName, functionId } = event.detail;
  
  try {
    // Load tags from backend using API service
    const response = await apiService.getTags(binaryName, functionId);
    
    // Update state
    currentTags = response.tags || [];
    
    // Removed frontend logic for assigning default colors.
    // Backend is now expected to provide colors for all tags.
    
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
      tagsHTML = `<div class="tag-list">` + 
      tagsByType[type].map(tag => `
        <div class="tag-item ${tag.includeInAI ? 'active' : ''}" 
             data-type="${tag.type}" 
             data-value="${tag.value}"
             style="color: ${tag.color}; border-color: ${tag.color};">
          <div class="tag-name">${tag.value}</div>
        </div>
      `).join('') + 
      `</div>`;
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
  // Left click to toggle AI inclusion
  document.querySelectorAll('.tag-item').forEach(tagItem => {
    // Left click - toggle AI inclusion
    tagItem.addEventListener('click', handleTagClick);
    
    // Right click - delete tag
    tagItem.addEventListener('contextmenu', handleTagRightClick);
  });
}

/**
 * Handle left-clicking on a tag (toggle AI inclusion)
 * @param {Event} event - The click event
 */
async function handleTagClick(event) {
  event.preventDefault();
  const tagItem = event.currentTarget;
  
  if (!tagItem) return;
  
  const type = tagItem.getAttribute('data-type');
  const value = tagItem.getAttribute('data-value');
  
  // Toggle AI inclusion using backend API
  await toggleTagAiInclusion(type, value);
}

/**
 * Handle right-clicking on a tag (delete tag)
 * @param {Event} event - The click event
 */
async function handleTagRightClick(event) {
  event.preventDefault();
  const tagItem = event.currentTarget;
  
  if (!tagItem) return;
  
  const type = tagItem.getAttribute('data-type');
  const value = tagItem.getAttribute('data-value');
  
  try {
    // Use custom modal dialog for confirmation
    await window.showInfoModal(`Delete tag '${value}'?`, "Confirm Delete");
    
    // If we get here, user confirmed deletion
    await removeTag(type, value);
  } catch (error) {
    // Modal was dismissed/cancelled, do nothing
    console.log('Tag deletion cancelled');
  }
}

/**
 * Save current tags to the backend
 */
async function saveCurrentTags() {
  try {
    const context = await getCurrentContext();
    if (!context || !context.binaryName || !context.functionId) {
      console.warn('No context available for saving tags');
      return;
    }
    
    await apiService.saveTags(context.binaryName, context.functionId, currentTags);
    console.log('Tags saved successfully');
  } catch (error) {
    console.error('Error saving tags:', error);
  }
}

/**
 * Get current tags for the project manager
 * @returns {Array} Current tags array
 */
export function getCurrentTags() {
  return currentTags;
}

/**
 * Set current tags directly (used by project loading)
 * @param {Array} tags - Array of tag objects to set
 */
export function setCurrentTags(tags) {
  currentTags = tags || [];
  
  // Removed frontend logic for assigning default colors and includeInAI status.
  // Backend/project file is now expected to provide these for all tags.
  
  // Re-render the tags display
  renderTags();
  
  console.log(`Set ${currentTags.length} tags in TagsPanel`);
}

/**
 * Remove a tag
 * @param {string} tagType - The type of tag to remove
 * @param {string} tagValue - The value of tag to remove
 */
async function removeTag(tagType, tagValue) {
  try {
    const context = await getCurrentContext();
    if (!context || !context.binaryName || !context.functionId) {
      alert('No function selected');
      return;
    }
    
    const result = await apiService.removeTag(
      context.binaryName,
      context.functionId,
      tagType,
      tagValue
    );
    
    if (result.success) {
      // Reload tags to update the display
      await loadCurrentTags();
    } else {
      alert(result.message || 'Failed to remove tag');
    }
  } catch (error) {
    console.error('Error removing tag:', error);
    alert('Error removing tag: ' + error.message);
  }
}

/**
 * Toggle AI inclusion for a tag
 * @param {string} tagType - The type of tag
 * @param {string} tagValue - The value of tag
 */
async function toggleTagAiInclusion(tagType, tagValue) {
  try {
    console.log(`toggleTagAiInclusion called with type: ${tagType}, value: ${tagValue}`);
    
    const context = await getCurrentContext();
    console.log('Context for toggle operation:', context);
    
    if (!context || !context.binaryName || !context.functionId) {
      console.warn('No context available for toggling AI inclusion');
      console.warn('Context details:', {
        hasContext: !!context,
        binaryName: context?.binaryName,
        functionId: context?.functionId
      });
      return;
    }
    
    console.log(`Calling API to toggle AI inclusion for ${context.binaryName}/${context.functionId} - ${tagType}:${tagValue}`);
    
    const result = await apiService.toggleAiInclusion(
      context.binaryName,
      context.functionId,
      tagType,
      tagValue
    );
    
    console.log('Toggle AI inclusion result:', result);
    
    if (result.success) {
      console.log('Toggle successful, reloading tags...');
      // Reload tags to update the display
      await loadCurrentTags();
    } else {
      console.error('Failed to toggle AI inclusion:', result.message);
      alert(`Failed to toggle AI inclusion: ${result.message}`);
    }
  } catch (error) {
    console.error('Error toggling AI inclusion:', error);
    alert(`Error toggling AI inclusion: ${error.message}`);
  }
}

/**
 * Load tags for current context
 */
async function loadCurrentTags() {
  try {
    const context = await getCurrentContext();
    if (!context || !context.binaryName || !context.functionId) {
      console.warn('No context available for loading tags');
      currentTags = [];
      renderTags();
      return;
    }
    
    const response = await apiService.getTags(context.binaryName, context.functionId);
    currentTags = response.tags || [];
    
    // Removed frontend logic for assigning default colors.
    // Backend is now expected to provide colors for all tags.
    
    renderTags();
  } catch (error) {
    console.error('Error loading tags:', error);
    currentTags = [];
    renderTags();
  }
}

// Utility function to convert RGB color to hex
function rgbToHex(rgb) {
  if (rgb.startsWith('#')) return rgb;
  
  const result = rgb.match(/\d+/g);
  if (!result || result.length < 3) return '#000000';
  
  return '#' + ((1 << 24) + (parseInt(result[0]) << 16) + (parseInt(result[1]) << 8) + parseInt(result[2])).toString(16).slice(1);
}

/**
 * Get currently selected tag type
 */
function getCurrentTagType() {
  const tagTypeSelect = document.getElementById('new-tag-type');
  return tagTypeSelect ? tagTypeSelect.value : null;
}

/**
 * Get currently selected tag color
 */
function getCurrentTagColor() {
  const colorPreview = document.getElementById('color-preview');
  return colorPreview ? colorPreview.style.backgroundColor : TAG_COLORS[0];
} 