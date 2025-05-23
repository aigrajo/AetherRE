import { state } from './core.js';

// Add message to chat
export function addMessage(content, isUser = false) {
  const chatMessages = document.getElementById('chat-messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
  
  if (isUser) {
    messageDiv.textContent = content;
  } else {
    // Render markdown for assistant responses, sanitize, and highlight
    if (window.marked && window.DOMPurify) {
      const rawHtml = window.marked.parse(content);
      const cleanHtml = window.DOMPurify.sanitize(rawHtml);
      messageDiv.innerHTML = cleanHtml;
      if (window.hljs) {
        // Highlight code blocks
        messageDiv.querySelectorAll('pre code').forEach((block) => {
          window.hljs.highlightElement(block);
        });
      }
    } else {
      messageDiv.textContent = content;
    }
  }
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
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
      option.textContent = `${displayName} (${date.toLocaleTimeString()})`;
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
    // Get current function context
    const functionName = document.getElementById('function-name').textContent;
    const pseudocode = document.getElementById('toggle-pseudocode').checked ? state.monacoEditor.getValue() : '';
    const address = document.getElementById('function-address').textContent;

    // Initialize context object with required fields
    const context = {
      functionName: functionName,
      address: address
    };

    // Store toggle states locally to determine what to include
    const toggleStates = {};
    const toggles = document.querySelectorAll('.toggle-label input[type="checkbox"]');
    console.log('[Chat] Context toggles:', Array.from(toggles).map(t => `${t.id}: ${t.checked}`));
    toggles.forEach(toggle => {
      const name = toggle.id.replace('toggle-', '');
      toggleStates[name] = toggle.checked;
      // Don't add toggle states to context sent to AI
    });

    // Try to get binary name and function ID for notes and tags
    let localFunctionId = null;
    try {
      const { getCurrentContext } = await import('./TagNotePanel.js');
      const { binaryName, functionId } = getCurrentContext();
      if (binaryName && functionId) {
        console.log(`[Chat] Found binary and function ID: ${binaryName}/${functionId}`);
        // Include binary name but not function ID in the context sent to AI
        context.binaryName = binaryName;
        // Store function ID locally for backend calls but don't include in context
        localFunctionId = functionId;
        
        // Explicitly fetch tags with forAiContext flag
        try {
          const tagsResponse = await fetch(`http://localhost:8000/api/tags/${binaryName}/${functionId}`);
          if (tagsResponse.ok) {
            const tagsData = await tagsResponse.json();
            console.log(`[Chat] Fetched ${tagsData.tags.length} tags for ${binaryName}/${functionId}`, tagsData.tags);
            
            // Filter for tags with includeInAI flag (matching what's in TagsPanel.js)
            const aiContextTags = tagsData.tags.filter(tag => tag.includeInAI === true);
            if (aiContextTags.length > 0) {
              console.log(`[Chat] Found ${aiContextTags.length} tags with includeInAI=true`, aiContextTags);
              // Only include type and value fields for tags
              context.tags = aiContextTags.map(tag => ({
                type: tag.type,
                value: tag.value
              }));
            } else {
              console.log('[Chat] No tags found with includeInAI=true');
            }
          } else {
            console.error('[Chat] Failed to fetch tags:', tagsResponse.status);
          }
        } catch (tagError) {
          console.error('[Chat] Error fetching tags:', tagError);
        }
      }
    } catch (error) {
      console.log('[Chat] Could not get binary/function context:', error);
    }

    // Add pseudocode if enabled
    if (toggleStates.pseudocode) {
      context.pseudocode = pseudocode;
    }

    // Add assembly if enabled
    if (toggleStates.assembly) {
      const assemblyTable = document.querySelector('#assembly-table tbody');
      context.assembly = Array.from(assemblyTable.querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          address: cells[0].textContent,
          offset: cells[1].textContent,
          bytes: cells[2].textContent,
          mnemonic: cells[3].textContent,
          operands: cells[4].textContent
        };
      });
    }

    // Add variables if enabled
    if (toggleStates.variables) {
      const variablesTable = document.querySelector('#variables-table tbody');
      context.variables = Array.from(variablesTable.querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          name: cells[0].textContent,
          type: cells[1].textContent,
          size: cells[2].textContent,
          offset: cells[3].textContent
        };
      });
    }

    // Add xrefs if enabled
    if (toggleStates.xrefs) {
      const incomingXrefs = Array.from(document.querySelector('#incoming-xrefs-table tbody').querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          name: cells[0].textContent,
          address: cells[1].textContent,
          offset: cells[2].textContent,
          context: cells[3].textContent
        };
      });

      const outgoingXrefs = Array.from(document.querySelector('#outgoing-xrefs-table tbody').querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          name: cells[0].textContent,
          address: cells[1].textContent,
          offset: cells[2].textContent,
          context: cells[3].textContent
        };
      });

      context.xrefs = {
        incoming: incomingXrefs,
        outgoing: outgoingXrefs
      };
    }

    // Add strings if enabled
    if (toggleStates.strings) {
      const stringsTable = document.querySelector('#strings-table tbody');
      context.strings = Array.from(stringsTable.querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          address: cells[0].textContent,
          value: cells[1].textContent,
          type: cells[2].textContent
        };
      });
    }

    // Add CFG if enabled - with debug logging
    console.log('[Chat] Debug - functionName:', functionName);
    console.log('[Chat] Debug - global currentFunction:', state.currentFunction);
    console.log('[Chat] Debug - CFG available:', state.currentFunction && state.currentFunction.cfg ? 'Yes' : 'No');
    if (toggleStates.cfg && state.currentFunction && state.currentFunction.cfg) {
      console.log('[Chat] Adding CFG data to context');
      context.cfg = {
        nodes: state.currentFunction.cfg.nodes.map(node => ({
          id: node.id,
          address: node.start_address,
          endAddress: node.end_address,
          instructions: node.instructions.slice(0, 5) // Limit to first 5 instructions to keep context size manageable
        })),
        edges: state.currentFunction.cfg.edges
      };
    } else {
      console.log('[Chat] CFG toggle:', toggleStates.cfg);
      console.log('[Chat] global currentFunction exists:', !!state.currentFunction);
      console.log('[Chat] currentFunction.cfg exists:', !!(state.currentFunction && state.currentFunction.cfg));
    }
    
    // Add notes if enabled
    if (toggleStates.notes && localFunctionId) {
      try {
        const { binaryName } = context;
        if (binaryName && localFunctionId) {
          // Fetch the note from the backend
          const response = await fetch(`http://localhost:8000/api/notes/${binaryName}/${localFunctionId}`);
          if (response.ok) {
            const data = await response.json();
            context.notes = data.content || '';
            console.log('[Chat] Added notes to context');
          }
        }
      } catch (error) {
        console.error('[Chat] Error fetching notes for context:', error);
      }
    }

    // AI Context tags were fetched earlier

    // Create a temporary message div for the generating state
    const chatMessages = document.getElementById('chat-messages');
    const tempMessageDiv = document.createElement('div');
    tempMessageDiv.className = 'message assistant generating';
    tempMessageDiv.textContent = 'Generating...';
    chatMessages.appendChild(tempMessageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    let assistantReply = '';
    // Listen for chat chunks
    const chunkHandler = (event) => {
      if (!assistantReply) {
        // Clear the "Generating..." message on first chunk
        tempMessageDiv.className = 'message assistant';
        tempMessageDiv.textContent = '';
      }
      assistantReply += event.detail.content || event.detail; // Handle both object and string formats
      if (window.marked && window.DOMPurify) {
        const rawHtml = window.marked.parse(assistantReply);
        const cleanHtml = window.DOMPurify.sanitize(rawHtml);
        tempMessageDiv.innerHTML = cleanHtml;
        if (window.hljs) {
          tempMessageDiv.querySelectorAll('pre code').forEach((block) => {
            window.hljs.highlightElement(block);
          });
        }
      } else {
        tempMessageDiv.textContent = assistantReply;
      }
      chatMessages.scrollTop = chatMessages.scrollHeight;
    };
    window.addEventListener('chat-chunk', chunkHandler);

    // Send to backend
    console.log('[Chat] Sending request to backend...');
    const response = await window.electronAPI.sendChatMessage({
      message,
      context,
      session_id: state.currentSessionId
    });

    // Remove the chunk handler
    window.removeEventListener('chat-chunk', chunkHandler);

    console.log('[Chat] Received response from backend:', response);
    console.log('[Chat] Response type:', typeof response);
    console.log('[Chat] Response has reply:', !!response?.reply);
    console.log('[Chat] Response keys:', response ? Object.keys(response) : 'null');

    if (!response) {
      console.error('[Chat] No response received from backend');
      throw new Error('No response received from backend');
    }

    if (!response.hasOwnProperty('reply')) {
      console.error('[Chat] Response missing reply field - response:', response);
      throw new Error('Backend response missing reply field');
    }

    if (response.reply === '' || response.reply == null) {
      console.error('[Chat] Backend returned empty reply - this usually means:');
      console.error('[Chat] 1. OpenAI API key is not configured');
      console.error('[Chat] 2. There was an error during the API call');
      console.error('[Chat] 3. The backend service encountered an error');
      addMessage('⚠️ The AI assistant returned an empty response. This usually means the OpenAI API key is not configured or there was an error during the API call. Please check the backend logs.', false);
      return; // Don't throw error, just show message and return
    }

    // Update current session ID if it's a new session
    if (response.session_id && response.session_id !== state.currentSessionId) {
      state.currentSessionId = response.session_id;
      await refreshChatSessions();
      document.getElementById('chat-sessions-select').value = state.currentSessionId;
    }

    // Refresh chat sessions to get updated names
    await refreshChatSessions();

    // Final update with complete markdown
    if (window.marked && window.DOMPurify) {
      const rawHtml = window.marked.parse(response.reply);
      const cleanHtml = window.DOMPurify.sanitize(rawHtml);
      tempMessageDiv.innerHTML = cleanHtml;
      tempMessageDiv.className = 'message assistant';
      if (window.hljs) {
        tempMessageDiv.querySelectorAll('pre code').forEach((block) => {
          window.hljs.highlightElement(block);
        });
      }
    } else {
      tempMessageDiv.textContent = response.reply;
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

// Setup chat event listeners
export function setupChatEventListeners() {
  const chatInput = document.getElementById('chat-input');
  const newChatBtn = document.getElementById('new-chat-btn');
  const chatSessionsSelect = document.getElementById('chat-sessions-select');
  const deleteChatBtn = document.getElementById('delete-chat-btn');
  
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
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
} 