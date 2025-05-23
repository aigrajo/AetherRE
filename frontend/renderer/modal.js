// Modal Dialog Component
// This replaces alert() calls to prevent focus issues in Electron

class ModalDialog {
  constructor() {
    this.overlay = null;
    this.isVisible = false;
  }

  /**
   * Show an error modal dialog
   * @param {string} message - The error message to display
   * @param {string} title - Optional title (defaults to "Error")
   * @returns {Promise} - Resolves when modal is closed
   */
  showError(message, title = "Error") {
    return this.show(message, title, "error");
  }

  /**
   * Show an info modal dialog
   * @param {string} message - The info message to display
   * @param {string} title - Optional title (defaults to "Information")
   * @returns {Promise} - Resolves when modal is closed
   */
  showInfo(message, title = "Information") {
    return this.show(message, title, "info");
  }

  /**
   * Show a modal dialog
   * @param {string} message - The message to display
   * @param {string} title - The dialog title
   * @param {string} type - The dialog type ('error', 'info', etc.)
   * @returns {Promise} - Resolves when modal is closed
   */
  show(message, title, type = "info") {
    return new Promise((resolve) => {
      // Remove any existing modal
      this.hide();

      // Create modal overlay
      this.overlay = document.createElement('div');
      this.overlay.className = 'modal-overlay';
      
      // Create modal dialog
      const dialog = document.createElement('div');
      dialog.className = `modal-dialog ${type}`;
      
      // Create modal content
      dialog.innerHTML = `
        <div class="modal-header">
          <h3 class="modal-title">${this.escapeHtml(title)}</h3>
          <button class="modal-close" type="button">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="modal-message">${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-button primary" type="button">OK</button>
        </div>
      `;

      this.overlay.appendChild(dialog);
      document.body.appendChild(this.overlay);

      // Handle close events
      const closeModal = () => {
        this.hide();
        resolve();
      };

      // Close button in header
      const closeButton = dialog.querySelector('.modal-close');
      closeButton.addEventListener('click', closeModal);

      // OK button in footer
      const okButton = dialog.querySelector('.modal-button.primary');
      okButton.addEventListener('click', closeModal);

      // ESC key
      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', keyHandler);
          closeModal();
        }
      };
      document.addEventListener('keydown', keyHandler);

      // Click outside to close
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          closeModal();
        }
      });

      // Show modal with animation
      requestAnimationFrame(() => {
        this.overlay.classList.add('visible');
        this.isVisible = true;
        
        // Focus the OK button for keyboard navigation
        okButton.focus();
      });
    });
  }

  /**
   * Hide the modal dialog
   */
  hide() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.classList.remove('visible');
      
      // Remove after animation
      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
        this.isVisible = false;
      }, 200);
    }
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Create global modal instance
const modal = new ModalDialog();

// Export functions that can replace alert() calls
export function showError(message, title = "Error") {
  return modal.showError(message, title);
}

export function showInfo(message, title = "Information") {
  return modal.showInfo(message, title);
}

// Also attach to window for global access
window.showErrorModal = showError;
window.showInfoModal = showInfo; 