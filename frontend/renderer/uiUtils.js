// UI Utilities Module

/**
 * Updates an element's style based on a condition
 * @param {HTMLElement} element - The element to update
 * @param {boolean} condition - Condition to check
 * @param {string} trueClass - Class to add if condition is true
 * @param {string} falseClass - Class to add if condition is false
 */
export function toggleElementClass(element, condition, trueClass, falseClass) {
  if (condition) {
    element.classList.add(trueClass);
    element.classList.remove(falseClass);
  } else {
    element.classList.add(falseClass);
    element.classList.remove(trueClass);
  }
}

/**
 * Shows a notification message to the user
 * @param {string} message - Message to display
 * @param {string} type - Message type (info, error, warning, success)
 * @param {number} duration - Duration in milliseconds (0 for persistent)
 */
export function showNotification(message, type = 'info', duration = 3000) {
  // Check if notification container exists, create if not
  let notificationContainer = document.getElementById('notification-container');
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.style.position = 'fixed';
    notificationContainer.style.top = '20px';
    notificationContainer.style.right = '20px';
    notificationContainer.style.zIndex = '9999';
    document.body.appendChild(notificationContainer);
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.backgroundColor = 
    type === 'error' ? 'var(--error-color, #f44336)' : 
    type === 'warning' ? 'var(--warning-color, #ff9800)' : 
    type === 'success' ? 'var(--success-color, #4caf50)' : 
    'var(--info-color, #2196f3)';
  notification.style.color = '#fff';
  notification.style.padding = '10px 20px';
  notification.style.margin = '10px 0';
  notification.style.borderRadius = '4px';
  notification.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
  notification.style.opacity = '0';
  notification.style.transition = 'opacity 0.3s ease-in-out';
  
  // Add close button
  const closeBtn = document.createElement('span');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.float = 'right';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.marginLeft = '10px';
  closeBtn.addEventListener('click', () => {
    notification.style.opacity = '0';
    setTimeout(() => {
      notificationContainer.removeChild(notification);
    }, 300);
  });
  notification.appendChild(closeBtn);
  
  // Add to container
  notificationContainer.appendChild(notification);
  
  // Show with animation
  setTimeout(() => {
    notification.style.opacity = '1';
  }, 10);
  
  // Auto-remove after duration (if not persistent)
  if (duration > 0) {
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        try {
          notificationContainer.removeChild(notification);
        } catch (e) {
          // Element might have been removed already
        }
      }, 300);
    }, duration);
  }
}

/**
 * Creates a loading spinner element
 * @returns {HTMLElement} - The spinner element
 */
export function createSpinner() {
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.style.borderRadius = '50%';
  spinner.style.width = '24px';
  spinner.style.height = '24px';
  spinner.style.border = '3px solid rgba(255, 255, 255, 0.3)';
  spinner.style.borderTopColor = 'var(--accent-color, #2196f3)';
  spinner.style.animation = 'spin 1s linear infinite';
  
  // Add animation keyframes if not already in document
  if (!document.getElementById('spinner-style')) {
    const style = document.createElement('style');
    style.id = 'spinner-style';
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
  
  return spinner;
}

/**
 * Updates the text content of an element with an optional fallback
 * @param {string} selector - CSS selector for the element
 * @param {string} text - Text to set
 * @param {string} fallback - Fallback text if not found
 */
export function updateText(selector, text, fallback = '') {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = text;
  } else {
    console.warn(`Element not found: ${selector}`);
  }
}

/**
 * Formats a byte size into a human-readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} - Formatted string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 