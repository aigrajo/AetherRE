export class PanelResizer {
    constructor() {
        this.init();
    }

    init() {
        // Add resize handles to panels
        this.addResizeHandles();
        
        // Initialize resize functionality
        this.initResizeHandlers();
    }

    addResizeHandles() {
        // Add resize handle between sidebar and content
        const sidebar = document.querySelector('.sidebar');
        const contentArea = document.querySelector('.content-area');
        const chatSidebar = document.querySelector('.chat-sidebar');

        if (sidebar) {
            sidebar.classList.add('resizable');
            const leftHandle = document.createElement('div');
            leftHandle.className = 'resize-handle left';
            sidebar.appendChild(leftHandle);
        }

        if (chatSidebar) {
            chatSidebar.classList.add('resizable');
            const rightHandle = document.createElement('div');
            rightHandle.className = 'resize-handle right';
            chatSidebar.appendChild(rightHandle);
        }
    }

    initResizeHandlers() {
        const handles = document.querySelectorAll('.resize-handle');
        
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => this.startResize(e, handle));
        });

        // Add global mouse event listeners
        document.addEventListener('mousemove', (e) => this.resize(e));
        document.addEventListener('mouseup', () => this.stopResize());
    }

    startResize(e, handle) {
        e.preventDefault();
        handle.classList.add('dragging');
        
        const panel = handle.parentElement;
        const startX = e.clientX;
        const startWidth = panel.offsetWidth;
        
        this.currentResize = {
            handle,
            panel,
            startX,
            startWidth
        };
    }

    resize(e) {
        if (!this.currentResize) return;

        const { handle, panel, startX, startWidth } = this.currentResize;
        const deltaX = e.clientX - startX;
        
        // Calculate new width based on handle position
        let newWidth;
        if (handle.classList.contains('left')) {
            newWidth = startWidth + deltaX;
        } else {
            newWidth = startWidth - deltaX;
        }

        // Apply min/max constraints
        const minWidth = parseInt(getComputedStyle(panel).minWidth);
        const maxWidth = parseInt(getComputedStyle(panel).maxWidth);
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        // Update panel width
        panel.style.width = `${newWidth}px`;

        // Update grid layout
        this.updateGridLayout();
    }

    stopResize() {
        if (this.currentResize) {
            this.currentResize.handle.classList.remove('dragging');
            this.currentResize = null;
        }
    }

    updateGridLayout() {
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;

        const sidebar = document.querySelector('.sidebar');
        const chatSidebar = document.querySelector('.chat-sidebar');
        
        if (sidebar && chatSidebar) {
            const sidebarWidth = sidebar.offsetWidth;
            const chatWidth = chatSidebar.offsetWidth;
            
            mainContent.style.gridTemplateColumns = `${sidebarWidth}px 1fr ${chatWidth}px`;
        }
    }
} 