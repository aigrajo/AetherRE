import { state } from './core.js';

// Global state for context mode
let contextMode = 'manual'; // 'manual' or 'ai'

// Add message to chat
export function addMessage(content, isUser = false) {
  const chatMessages = document.getElementById('chat-messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
  
  if (isUser) {
    messageDiv.textContent = content;
  } else {
    // Create content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content';
    
    // Render markdown for assistant responses, sanitize, and highlight
    if (window.marked && window.DOMPurify) {
      const rawHtml = window.marked.parse(content);
      const cleanHtml = window.DOMPurify.sanitize(rawHtml);
      contentWrapper.innerHTML = cleanHtml;
      if (window.hljs) {
        // Highlight code blocks
        contentWrapper.querySelectorAll('pre code').forEach((block) => {
          window.hljs.highlightElement(block);
        });
      }
    } else {
      contentWrapper.textContent = content;
    }
    
    // Create action buttons container
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    
    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-action-btn copy-btn';
    copyBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" fill="currentColor"/>
      </svg>
      Copy
    `;
    copyBtn.title = 'Copy message to clipboard';
    copyBtn.addEventListener('click', () => copyMessageToClipboard(content, copyBtn));
    
    // Add to note button
    const addToNoteBtn = document.createElement('button');
    addToNoteBtn.className = 'message-action-btn add-to-note-btn';
    addToNoteBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM18 20H6V4H13V9H18V20Z" fill="currentColor"/>
      </svg>
      Add to Note
    `;
    addToNoteBtn.title = 'Add this message to the current function note';
    addToNoteBtn.addEventListener('click', () => addMessageToNote(content, addToNoteBtn));
    
    // Add buttons to actions container
    actionsDiv.appendChild(copyBtn);
    actionsDiv.appendChild(addToNoteBtn);
    
    // Add content and actions to message
    messageDiv.appendChild(contentWrapper);
    messageDiv.appendChild(actionsDiv);
  }
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Copy message content to clipboard
async function copyMessageToClipboard(content, buttonElement) {
  try {
    // Check if clipboard API is available
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(content);
    } else {
      // Fallback for older browsers or when clipboard API is not available
      const textArea = document.createElement('textarea');
      textArea.value = content;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    
    // Provide visual feedback
    const originalText = buttonElement.innerHTML;
    buttonElement.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" fill="currentColor"/>
      </svg>
      Copied!
    `;
    buttonElement.style.color = '#4ade80';
    
    // Revert back after 2 seconds
    setTimeout(() => {
      buttonElement.innerHTML = originalText;
      buttonElement.style.color = '';
    }, 2000);
    
  } catch (error) {
    console.error('[Chat] Error copying to clipboard:', error);
    
    // Show error feedback
    const originalText = buttonElement.innerHTML;
    buttonElement.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
      </svg>
      Failed
    `;
    buttonElement.style.color = '#ef4444';
    
    setTimeout(() => {
      buttonElement.innerHTML = originalText;
      buttonElement.style.color = '';
    }, 2000);
  }
}

// Add message content to the current function's note
async function addMessageToNote(content, buttonElement) {
  try {
    // Import getCurrentContext from TagNotePanel
    const { getCurrentContext } = await import('./TagNotePanel.js');
    const context = await getCurrentContext();
    
    if (!context || !context.binaryName || !context.functionId) {
      // Show error feedback
      const originalText = buttonElement.innerHTML;
      buttonElement.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
        </svg>
        No Function
      `;
      buttonElement.style.color = '#ef4444';
      
      setTimeout(() => {
        buttonElement.innerHTML = originalText;
        buttonElement.style.color = '';
      }, 3000);
      return;
    }
    
    // Convert markdown to plain text
    let plainTextContent;
    if (window.marked && window.DOMPurify) {
      try {
        // Convert markdown to HTML
        const html = window.marked.parse(content);
        const cleanHtml = window.DOMPurify.sanitize(html);
        
        // Create temp element to extract plain text
        const temp = document.createElement('div');
        temp.innerHTML = cleanHtml;
        
        // Extract plain text and clean up excessive whitespace
        plainTextContent = temp.textContent || temp.innerText || '';
        // Clean up multiple newlines and excessive spacing
        plainTextContent = plainTextContent
          .replace(/\n\s*\n\s*\n/g, '\n\n') // Replace 3+ newlines with 2
          .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
          .trim();
      } catch (error) {
        console.warn('[Chat] Error converting markdown to plain text:', error);
        plainTextContent = content; // Fallback to original content
      }
    } else {
      plainTextContent = content; // Fallback if markdown tools aren't available
    }
    
    // Get current note content
    const noteResponse = await fetch(`http://localhost:8000/api/notes/${context.binaryName}/${context.functionId}`);
    if (!noteResponse.ok) {
      throw new Error(`Failed to get current note: ${noteResponse.statusText}`);
    }
    
    const noteData = await noteResponse.json();
    const currentNoteContent = noteData.content || '';
    
    // Prepare the content to append
    const timestamp = new Date().toLocaleString();
    const separator = currentNoteContent ? '\n\n---\n\n' : '';
    const chatContent = `${separator}AI Chat Response (${timestamp}):\n${plainTextContent}`;
    
    // Append to existing note content
    const updatedContent = currentNoteContent + chatContent;
    
    // Save the updated note
    const saveResponse = await fetch(`http://localhost:8000/api/notes/${context.binaryName}/${context.functionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: updatedContent })
    });
    
    if (!saveResponse.ok) {
      throw new Error(`Failed to save note: ${saveResponse.statusText}`);
    }
    
    // Provide visual feedback
    const originalText = buttonElement.innerHTML;
    buttonElement.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" fill="currentColor"/>
      </svg>
      Added!
    `;
    buttonElement.style.color = '#4ade80';
    
    // Trigger note reload in the note editor if it's for the current function
    const loadNoteEvent = new CustomEvent('load-note', {
      detail: {
        binaryName: context.binaryName,
        functionId: context.functionId
      }
    });
    document.dispatchEvent(loadNoteEvent);
    
    // Revert back after 2 seconds
    setTimeout(() => {
      buttonElement.innerHTML = originalText;
      buttonElement.style.color = '';
    }, 2000);
    
  } catch (error) {
    console.error('[Chat] Error adding to note:', error);
    
    // Show error feedback
    const originalText = buttonElement.innerHTML;
    buttonElement.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
      </svg>
      Failed
    `;
    buttonElement.style.color = '#ef4444';
    
    setTimeout(() => {
      buttonElement.innerHTML = originalText;
      buttonElement.style.color = '';
    }, 3000);
  }
}

// Add action buttons to an existing assistant message div
function addActionButtonsToMessageDiv(messageDiv, content) {
  // Skip if buttons already exist or if this is not an assistant message
  if (messageDiv.querySelector('.message-actions') || !messageDiv.classList.contains('assistant')) {
    return;
  }
  
  // Skip thinking, tool-call, and save-offer-prompt messages
  if (messageDiv.classList.contains('thinking') || 
      messageDiv.classList.contains('tool-call') || 
      messageDiv.classList.contains('save-offer-prompt')) {
    return;
  }
  
  // Wrap existing content in content wrapper if not already wrapped
  let contentWrapper = messageDiv.querySelector('.message-content');
  if (!contentWrapper) {
    contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content';
    // Move all existing content to the wrapper
    while (messageDiv.firstChild) {
      contentWrapper.appendChild(messageDiv.firstChild);
    }
    messageDiv.appendChild(contentWrapper);
  }
  
  // Create action buttons container
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'message-actions';
  
  // Copy button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'message-action-btn copy-btn';
  copyBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" fill="currentColor"/>
    </svg>
    Copy
  `;
  copyBtn.title = 'Copy message to clipboard';
  copyBtn.addEventListener('click', () => copyMessageToClipboard(content, copyBtn));
  
  // Add to note button
  const addToNoteBtn = document.createElement('button');
  addToNoteBtn.className = 'message-action-btn add-to-note-btn';
  addToNoteBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM18 20H6V4H13V9H18V20Z" fill="currentColor"/>
    </svg>
    Add to Note
  `;
  addToNoteBtn.title = 'Add this message to the current function note';
  addToNoteBtn.addEventListener('click', () => addMessageToNote(content, addToNoteBtn));
  
  // Add buttons to actions container
  actionsDiv.appendChild(copyBtn);
  actionsDiv.appendChild(addToNoteBtn);
  
  // Add actions to message
  messageDiv.appendChild(actionsDiv);
}

// Initialize chat session
export async function initializeChatSession() {
  try {
    // First, refresh sessions to get all existing ones
    await refreshChatSessions(false); // false means don't select any session
    
    // Then create a new session
    const response = await window.electronAPI.createNewChat();
    state.currentSessionId = response.session_id;
    
    // Clear chat messages for the new session
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';
    
    // Update dropdown to show all sessions plus a default option for the new one
    updateSessionDropdown();
  } catch (error) {
    console.error('[Chat] Error initializing chat session:', error);
  }
}

// Update the sessions dropdown with all sessions plus default option
export function updateSessionDropdown() {
  const chatSessionsSelect = document.getElementById('chat-sessions-select');
  
  // Get all current options (these are the existing sessions)
  const currentOptions = Array.from(chatSessionsSelect.options);
  
  // Clear dropdown
  chatSessionsSelect.innerHTML = '';
  
  // Add default option for new/unsaved session
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Write a prompt to create a chat session';
  chatSessionsSelect.appendChild(defaultOption);
  
  // Add back all the session options
  currentOptions.forEach(option => {
    // Skip the default option if it exists
    if (option.value !== '') {
      chatSessionsSelect.appendChild(option.cloneNode(true));
    }
  });
  
  // Select default option for new session
  chatSessionsSelect.value = '';
}

// Refresh chat sessions list
export async function refreshChatSessions(selectCurrentSession = true) {
  const chatSessionsSelect = document.getElementById('chat-sessions-select');
  
  try {
    const response = await window.electronAPI.listChatSessions();
    const sessions = response.sessions;
    
    // Save current options to check if we need to add the default option
    const hasDefaultOption = chatSessionsSelect.querySelector('option[value=""]') !== null;
    
    // Clear existing options
    chatSessionsSelect.innerHTML = '';
    
    // Add default option if it was there before or if no sessions exist
    if (hasDefaultOption || sessions.length === 0) {
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Write a prompt to create a chat session';
      chatSessionsSelect.appendChild(defaultOption);
    }
    
    // Add session options
    sessions.forEach(session => {
      const option = document.createElement('option');
      option.value = session.session_id;
      const date = new Date(session.last_activity);
      // Use the generated name if available, otherwise use the default format
      const displayName = session.name || `Chat ${session.session_id.slice(0, 8)}`;
      // Add indicator for restored sessions
      if (session.is_restored) {
        option.textContent = `● ${displayName} (${date.toLocaleTimeString()})`;
        option.classList.add('restored-session');
        option.setAttribute('data-restored', 'true');
      } else {
        option.textContent = `${displayName} (${date.toLocaleTimeString()})`;
      }
      chatSessionsSelect.appendChild(option);
    });

    // If we have a current session ID but it's not in the list, clear it
    if (state.currentSessionId && !sessions.some(s => s.session_id === state.currentSessionId)) {
      state.currentSessionId = null;
    }
    
    // Set dropdown value based on current session
    if (selectCurrentSession && state.currentSessionId) {
      chatSessionsSelect.value = state.currentSessionId;
    } else if (!selectCurrentSession && hasDefaultOption) {
      chatSessionsSelect.value = '';
    }
  } catch (error) {
    console.error('[Chat] Error refreshing chat sessions:', error);
  }
}

// Load chat history for a session
export async function loadChatHistory(sessionId) {
  const chatMessages = document.getElementById('chat-messages');
  
  // Clear current chat messages regardless
  chatMessages.innerHTML = '';
  
  // If no sessionId or empty, we're done (new session with no history)
  if (!sessionId) return;
  
  try {
    const response = await window.electronAPI.listChatSessions();
    const session = response.sessions.find(s => s.session_id === sessionId);
    
    if (session && session.messages) {
      // Add each message to the chat
      session.messages.forEach(msg => {
        addMessage(msg.content, msg.role === 'user');
      });
    }
  } catch (error) {
    console.error('[Chat] Error loading chat history:', error);
  }
}

// Get current toggle states
function getToggleStates() {
  const toggleStates = {};
  const toggles = document.querySelectorAll('.toggle-label input[type="checkbox"]');
  toggles.forEach(toggle => {
    const name = toggle.id.replace('toggle-', '');
    toggleStates[name] = toggle.checked;
  });
  
  // Always include tags so backend will check for AI-enabled tags
  // Individual tag AI inclusion is controlled in the TagNotes Panel
  toggleStates.tags = true;
  
  console.log('[Chat] Toggle states:', toggleStates);
  return toggleStates;
}

// Get dynamic content (like current pseudocode)
function getDynamicContent(toggleStates) {
  const dynamicContent = {};
  
  // Include current pseudocode if the toggle is enabled
  if (toggleStates.pseudocode) {
    dynamicContent.pseudocode = state.monacoEditor ? state.monacoEditor.getValue() : '';
  }
  
  return dynamicContent;
}

// Get current function ID
function getCurrentFunctionId() {
  try {
    const address = document.getElementById('function-address').textContent;
    if (address && address !== '0x0') {
      // Remove '0x' prefix if present and convert to lowercase
      return address.replace('0x', '').toLowerCase();
    }
  } catch (error) {
    console.warn('[Chat] Could not get function address:', error);
  }
  return null;
}

// Send a message
export async function sendMessage() {
  const chatInput = document.getElementById('chat-input');
  const message = chatInput.value.trim();
  if (!message) return;

  console.log('[Chat] Sending message:', message);

  // Add user message to chat
  addMessage(message, true);
  chatInput.value = '';

  try {
    let requestData;
    
    if (contextMode === 'manual') {
      // Manual context mode - use toggle states and function context
      const toggleStates = getToggleStates();
      const dynamicContent = getDynamicContent(toggleStates);
      const functionId = getCurrentFunctionId();
      
      console.log('[Chat] Manual mode - Function ID:', functionId);
      console.log('[Chat] Manual mode - Toggle states:', toggleStates);
      console.log('[Chat] Manual mode - Dynamic content keys:', Object.keys(dynamicContent));

      requestData = {
        message: message,
        session_id: state.currentSessionId,
        toggle_states: toggleStates,
        dynamic_content: dynamicContent,
        function_id: functionId
      };
    } else {
      // AI interaction mode - let AI determine what tools to use
      console.log('[Chat] AI mode - Using AI interaction engine');
      
      requestData = {
        message: message,
        session_id: state.currentSessionId,
        use_ai_tools: true,
        function_id: getCurrentFunctionId() // Still provide function ID for AI tools
      };
    }

    // Create a temporary message div for the generating state
    const chatMessages = document.getElementById('chat-messages');
    const tempMessageDiv = document.createElement('div');
    tempMessageDiv.className = 'message assistant generating';
    
    // Set appropriate progress message based on context mode
    if (contextMode === 'manual') {
      tempMessageDiv.textContent = 'Generating...';
    } else {
      tempMessageDiv.textContent = 'Thinking...';
    }
    
    chatMessages.appendChild(tempMessageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    let initialReply = '';
    let summaryReply = '';
    let saveOffer = null;
    let currentThinkingDiv = null; // The current thinking div for the last tool call
    let lastToolCallDiv = null;    // The last tool call div
    let thinkingContent = '';
    let initialResponseDiv = tempMessageDiv; // This div will hold the AI's brief plan
    let summaryDiv = null;          // Final summary div at the very bottom
    let toolCallsStarted = false;   // Becomes true after first tool_call event
    
    // Listen for chat chunks
    const chunkHandler = (event) => {
      const data = event.detail;
      
      if (!toolCallsStarted && !initialReply && !data.type) {
        // First assistant content: convert temp div into normal assistant message
        initialResponseDiv.className = 'message assistant';
        initialResponseDiv.textContent = '';
      }
      
      // Handle thinking events (with or without content)
      if (data.type === 'thinking') {
        if (data.reply) {
          // This is thinking content with actual text
          thinkingContent += data.reply;
          
          // If no thinking div exists, create one
          if (!currentThinkingDiv) {
            currentThinkingDiv = document.createElement('div');
            currentThinkingDiv.className = 'message assistant thinking';
            chatMessages.appendChild(currentThinkingDiv);
          }
          
          // Update the thinking div with accumulated content
          if (window.marked && window.DOMPurify) {
            const rawHtml = window.marked.parse(thinkingContent);
            const cleanHtml = window.DOMPurify.sanitize(rawHtml);
            currentThinkingDiv.innerHTML = cleanHtml;
          } else {
            currentThinkingDiv.textContent = thinkingContent;
          }
        } else {
          // This is just a thinking placeholder (no content)
          if (!currentThinkingDiv) {
            currentThinkingDiv = document.createElement('div');
            currentThinkingDiv.className = 'message assistant thinking';
            currentThinkingDiv.textContent = 'Thinking...';
            chatMessages.appendChild(currentThinkingDiv);
          }
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return; // Don't process further for thinking events
      }
      
      // Handle remove_thinking event
      if (data.type === 'remove_thinking') {
        if (currentThinkingDiv) {
          currentThinkingDiv.remove();
          currentThinkingDiv = null;
          thinkingContent = '';
        }
        return; // Don't process further for remove_thinking events
      }
      
      if (data.reply) {
        if (data.type === 'tool_call') {
          toolCallsStarted = true;
          // On new tool call, remove any previous thinking div
          if (currentThinkingDiv) {
            currentThinkingDiv.remove();
            currentThinkingDiv = null;
            thinkingContent = '';
          }
          // Create a new tool call div
          lastToolCallDiv = document.createElement('div');
          lastToolCallDiv.className = 'message assistant tool-call';
          lastToolCallDiv.textContent = data.reply;
          chatMessages.appendChild(lastToolCallDiv);
        } else {
          // Decide where to place this content
          let targetDiv;
          if (!toolCallsStarted) {
            // Still in initial brief response phase
            targetDiv = initialResponseDiv;
          } else {
            // We are in summary phase
            if (!summaryDiv) {
              summaryDiv = document.createElement('div');
              summaryDiv.className = 'message assistant';
              chatMessages.appendChild(summaryDiv);
            }
            targetDiv = summaryDiv;
          }
          
          // Append content to the chosen div
          if (!toolCallsStarted) {
            initialReply += data.reply;
          } else {
            summaryReply += data.reply;
          }

          const combined = (!toolCallsStarted ? initialReply : summaryReply);

          if (window.marked && window.DOMPurify) {
            const rawHtml = window.marked.parse(combined);
            const cleanHtml = window.DOMPurify.sanitize(rawHtml);
            targetDiv.innerHTML = cleanHtml;
            if (window.hljs) {
              targetDiv.querySelectorAll('pre code').forEach((block) => {
                window.hljs.highlightElement(block);
              });
            }
          } else {
            targetDiv.textContent = combined;
          }
        }
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
      
      // Check for save offer
      if (data.save_offer) {
        saveOffer = data.save_offer;
      }
    };
    window.addEventListener('chat-chunk', chunkHandler);

    // Send request to backend
    console.log('[Chat] Sending request to backend...');
    const response = await window.electronAPI.sendChatMessage(requestData);

    // Remove the chunk handler
    window.removeEventListener('chat-chunk', chunkHandler);

    console.log('[Chat] Received response from backend:', response);
    
    // Add action buttons to completed assistant messages
    if (initialResponseDiv && initialReply) {
      addActionButtonsToMessageDiv(initialResponseDiv, initialReply);
    }
    if (summaryDiv && summaryReply) {
      addActionButtonsToMessageDiv(summaryDiv, summaryReply);
    }
    
    // Update current session ID if it's a new session
    if (response.session_id && response.session_id !== state.currentSessionId) {
      state.currentSessionId = response.session_id;
      await refreshChatSessions();
      document.getElementById('chat-sessions-select').value = state.currentSessionId;
    }

    // Refresh chat sessions to get updated names
    await refreshChatSessions();

    // Show save offer if available
    if (saveOffer) {
      setTimeout(() => {
        addSaveOfferPrompt(saveOffer);
      }, 500);
    }

  } catch (error) {
    console.error('[Chat] Error sending message:', error);
    console.error('[Chat] Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    addMessage('Sorry, there was an error processing your request. Please check the console for details.', false);
  }
}

// Add save offer prompt for AI analysis results
function addSaveOfferPrompt(saveOffer) {
  const chatMessages = document.getElementById('chat-messages');
  const promptDiv = document.createElement('div');
  promptDiv.className = 'message assistant save-offer-prompt';
  
  promptDiv.innerHTML = `
    <div class="save-offer-container">
      <h4>💾 Save Analysis to Notes</h4>
      <p><strong>Title:</strong> ${saveOffer.suggested_title}</p>
      <p><strong>Type:</strong> ${saveOffer.analysis_type.replace('_', ' ')}</p>
      <div class="save-offer-buttons">
        <button class="save-offer-btn save" onclick="saveAnalysisToNotes('${encodeURIComponent(JSON.stringify(saveOffer))}', this)">Save to Notes</button>
        <button class="save-offer-btn dismiss" onclick="dismissSaveOffer(this)">Don't Save</button>
      </div>
    </div>
  `;
  
  chatMessages.appendChild(promptDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Global functions for save offer handling
window.saveAnalysisToNotes = async function(encodedOffer, buttonElement) {
  try {
    const saveOffer = JSON.parse(decodeURIComponent(encodedOffer));
    
    console.log('[Chat] Saving analysis to notes:', saveOffer);
    
    // Call the API to save to notes
    const response = await fetch('http://localhost:8000/api/chat/save-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        analysis_type: saveOffer.analysis_type,
        content: saveOffer.formatted_content,
        metadata: saveOffer.metadata,
        custom_title: saveOffer.suggested_title
      })
    });
    
    const result = await response.json();
    
    const promptDiv = buttonElement.closest('.save-offer-prompt');
    if (result.success) {
      promptDiv.innerHTML = '<p>✅ Analysis saved to notes successfully!</p>';
    } else {
      promptDiv.innerHTML = '<p>❌ Failed to save to notes. Please try again.</p>';
    }
    
    setTimeout(() => {
      promptDiv.remove();
    }, 3000);
    
  } catch (error) {
    console.error('[Chat] Error saving analysis to notes:', error);
    const promptDiv = buttonElement.closest('.save-offer-prompt');
    promptDiv.innerHTML = '<p>❌ Error saving to notes. Please try again.</p>';
    
    setTimeout(() => {
      promptDiv.remove();
    }, 3000);
  }
};

window.dismissSaveOffer = function(buttonElement) {
  const promptDiv = buttonElement.closest('.save-offer-prompt');
  promptDiv.remove();
};

// Setup chat event listeners
export function setupChatEventListeners() {
  const chatInput = document.getElementById('chat-input');
  const newChatBtn = document.getElementById('new-chat-btn');
  const chatSessionsSelect = document.getElementById('chat-sessions-select');
  const deleteChatBtn = document.getElementById('delete-chat-btn');
  
  // Handle keyboard events
  chatInput.addEventListener('keydown', (e) => {
    // Handle Enter key for sending messages
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Auto-resize textarea
  chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    // Toggle at-max-height class for scrollbar
    if (this.scrollHeight >= 144) {
      this.classList.add('at-max-height');
    } else {
      this.classList.remove('at-max-height');
    }
  });
  
  newChatBtn.addEventListener('click', async () => {
    await initializeChatSession();
  });
  
  chatSessionsSelect.addEventListener('change', async () => {
    const newSessionId = chatSessionsSelect.value;
    if (newSessionId !== state.currentSessionId) {
      state.currentSessionId = newSessionId;
      await loadChatHistory(state.currentSessionId);
    }
  });
  
  deleteChatBtn.addEventListener('click', async () => {
    if (!state.currentSessionId) return; // Do nothing if no session
    try {
      await window.electronAPI.deleteChatSession(state.currentSessionId);
      state.currentSessionId = null;
      await refreshChatSessions(false); // Don't select any session
      document.getElementById('chat-messages').innerHTML = '';
      chatSessionsSelect.value = '';
    } catch (error) {
      console.error('[Chat] Error deleting chat session:', error);
      // Optionally show a user-facing error
    }
  });
}

// Function to setup context toggle checkboxes
export function setupContextToggles() {
  // Get all toggle checkboxes
  const toggles = document.querySelectorAll('.toggle-label input[type="checkbox"]');
  
  // Add event listeners to each toggle
  toggles.forEach(toggle => {
    const label = toggle.closest('.toggle-label');
    
    // Apply initial styling based on checked state
    if (toggle.checked) {
      label.style.backgroundColor = 'var(--accent-color)';
      label.style.borderColor = 'var(--accent-color)';
      label.style.color = 'var(--text-primary)';
    } else {
      label.style.backgroundColor = 'var(--bg-tertiary)';
      label.style.borderColor = 'transparent';
      label.style.color = 'var(--text-secondary)';
    }
    
    toggle.addEventListener('change', () => {
      console.log(`Toggle ${toggle.id} changed to ${toggle.checked}`);
      
      // Update visual style based on the checked state
      if (toggle.checked) {
        label.style.backgroundColor = 'var(--accent-color)';
        label.style.borderColor = 'var(--accent-color)';
        label.style.color = 'var(--text-primary)';
      } else {
        label.style.backgroundColor = 'var(--bg-tertiary)';
        label.style.borderColor = 'transparent';
        label.style.color = 'var(--text-secondary)';
      }
    });
  });
  
  // Update visibility based on context mode
  updateContextTogglesVisibility();
}

// Function to setup context mode toggle
export function setupContextModeToggle() {
  const toggleButton = document.getElementById('context-mode-toggle');
  const helpButton = document.getElementById('context-mode-help');
  const loadFileBtn = document.getElementById('load-file-btn');
  
  if (!toggleButton) {
    console.error('[Chat] Context mode toggle button not found');
    return;
  }
  
  toggleButton.addEventListener('click', () => {
    // Toggle between modes
    contextMode = contextMode === 'manual' ? 'ai' : 'manual';
    
    // Update button appearance
    updateToggleButtonAppearance();
    
    // Update context toggles visibility
    updateContextTogglesVisibility();
    
    // Update chat input placeholder
    updateChatInputPlaceholder();
    
    // Update help tooltip
    updateHelpTooltip();
    
    console.log('[Chat] Context mode changed to:', contextMode);
  });
  
  // Setup help button tooltip
  if (helpButton) {
    updateHelpTooltip();
  }
  
  // Initial setup
  updateToggleButtonAppearance();
  updateChatInputPlaceholder();
}

// Function to update toggle button appearance
function updateToggleButtonAppearance() {
  const toggleButton = document.getElementById('context-mode-toggle');
  const toggleText = toggleButton.querySelector('.toggle-text');
  
  if (contextMode === 'manual') {
    toggleButton.setAttribute('data-mode', 'manual');
    toggleText.textContent = 'Manual Context';
  } else {
    toggleButton.setAttribute('data-mode', 'ai');
    toggleText.textContent = 'Auto Context';
  }
}

// Function to update context toggles visibility
function updateContextTogglesVisibility() {
  const contextToggles = document.querySelector('.context-toggles');
  
  if (contextMode === 'manual') {
    contextToggles.style.display = 'block';
    contextToggles.style.opacity = '1';
  } else {
    contextToggles.style.display = 'none';
    contextToggles.style.opacity = '0.5';
  }
}

// Function to update chat input placeholder
function updateChatInputPlaceholder() {
  const chatInput = document.getElementById('chat-input');
  
  if (contextMode === 'manual') {
    chatInput.placeholder = 'Ask about the current function...';
  } else {
    chatInput.placeholder = 'Describe what you want to analyze or search for...';
  }
}

// Function to update help tooltip content
function updateHelpTooltip() {
  const helpButton = document.getElementById('context-mode-help');
  if (!helpButton) return;
  
  let tooltipContent = '';
  
  if (contextMode === 'manual') {
    tooltipContent = `Manual Context Mode:
• You control what information is sent to AI
• Uses context toggles to select data
• Lower API usage and token consumption
• More predictable costs
• Best for focused analysis`;
  } else {
    tooltipContent = `Auto Context Mode:
• AI automatically determines what tools to use
• Iterative analysis with multiple API calls
• ⚠️ WARNING: 5-10x higher token usage
• Significantly increased API costs
• Best for comprehensive exploration

Use with caution - can consume many tokens!`;
  }
  
  helpButton.setAttribute('data-tooltip', tooltipContent);
}

// Function to send current function context to backend for caching
export async function cacheCurrentFunctionContext() {
  try {
    const functionId = getCurrentFunctionId();
    if (!functionId) {
      console.log('[Chat] No function ID available for caching');
      return;
    }

    // Get function name and address
    const functionName = document.getElementById('function-name').textContent || 'Unknown Function';
    const address = document.getElementById('function-address').textContent || '0x0';
    
    // Get binary name if available
    let binaryName = '';
    try {
      const { getCurrentContext } = await import('./TagNotePanel.js');
      const context = await getCurrentContext();
      binaryName = context.binaryName || '';
    } catch (error) {
      console.log('[Chat] Could not get binary name:', error);
    }

    // Collect all the context data from DOM tables
    const contextData = {
      function_name: functionName,
      address: address,
      binary_name: binaryName,
      pseudocode: state.monacoEditor ? state.monacoEditor.getValue() : '',
      assembly: [],
      variables: [],
      xrefs: { incoming: [], outgoing: [] },
      strings: [],
      cfg: state.currentFunction?.cfg || {}
    };

    // Collect assembly data
    try {
      const assemblyTable = document.querySelector('#assembly-table tbody');
      if (assemblyTable) {
        contextData.assembly = Array.from(assemblyTable.querySelectorAll('tr')).map(row => {
          const cells = row.querySelectorAll('td');
          return {
            address: cells[0]?.textContent || '',
            offset: cells[1]?.textContent || '',
            bytes: cells[2]?.textContent || '',
            mnemonic: cells[3]?.textContent || '',
            operands: cells[4]?.textContent || ''
          };
        });
      }
    } catch (error) {
      console.warn('[Chat] Error collecting assembly data:', error);
    }

    // Collect variables data
    try {
      const variablesTable = document.querySelector('#variables-table tbody');
      if (variablesTable) {
        contextData.variables = Array.from(variablesTable.querySelectorAll('tr')).map(row => {
          const cells = row.querySelectorAll('td');
          return {
            name: cells[0]?.textContent || '',
            type: cells[1]?.textContent || '',
            size: cells[2]?.textContent || '',
            offset: cells[3]?.textContent || ''
          };
        });
      }
    } catch (error) {
      console.warn('[Chat] Error collecting variables data:', error);
    }

    // Collect xrefs data
    try {
      const incomingXrefsTable = document.querySelector('#incoming-xrefs-table tbody');
      if (incomingXrefsTable) {
        contextData.xrefs.incoming = Array.from(incomingXrefsTable.querySelectorAll('tr')).map(row => {
          const cells = row.querySelectorAll('td');
          return {
            name: cells[0]?.textContent || '',
            address: cells[1]?.textContent || '',
            offset: cells[2]?.textContent || '',
            context: cells[3]?.textContent || ''
          };
        });
      }

      const outgoingXrefsTable = document.querySelector('#outgoing-xrefs-table tbody');
      if (outgoingXrefsTable) {
        contextData.xrefs.outgoing = Array.from(outgoingXrefsTable.querySelectorAll('tr')).map(row => {
          const cells = row.querySelectorAll('td');
          return {
            name: cells[0]?.textContent || '',
            address: cells[1]?.textContent || '',
            offset: cells[2]?.textContent || '',
            context: cells[3]?.textContent || ''
          };
        });
      }
    } catch (error) {
      console.warn('[Chat] Error collecting xrefs data:', error);
    }

    // Collect strings data
    try {
      const stringsTable = document.querySelector('#strings-table tbody');
      if (stringsTable) {
        contextData.strings = Array.from(stringsTable.querySelectorAll('tr')).map(row => {
          const cells = row.querySelectorAll('td');
          return {
            address: cells[0]?.textContent || '',
            value: cells[1]?.textContent || '',
            type: cells[2]?.textContent || ''
          };
        });
      }
    } catch (error) {
      console.warn('[Chat] Error collecting strings data:', error);
    }

    // Send to backend for caching
    const response = await fetch('http://localhost:8000/api/chat/context', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        function_id: functionId,
        data: contextData
      })
    });

    if (response.ok) {
      console.log(`[Chat] Cached context for function ${functionId}`);
    } else {
      console.error('[Chat] Failed to cache function context:', response.status);
    }

  } catch (error) {
    console.error('[Chat] Error caching function context:', error);
  }
} 