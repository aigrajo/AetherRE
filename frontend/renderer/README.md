# AetherRE Modular Architecture

This directory contains the modular version of the AetherRE frontend renderer. The code has been restructured into logical modules to improve maintainability and organization.

## Module Structure

- **core.js**: Contains global state, initialization functions, and helper utilities used across the application
- **editor.js**: Monaco editor initialization and management
- **fileHandler.js**: File loading, analysis, and processing
- **functionManager.js**: Function list rendering, filtering, and selection
- **tabManager.js**: Tab switching logic and content updates
- **cfgVisualizer.js**: Control flow graph visualization
- **chat.js**: Chat session management and messaging
- **variableManager.js**: Variable renaming and editing functionality
- **xrefs.js**: Cross-reference handling and display
- **renderer.js**: Main entry point that imports and initializes all modules

## Dependency Graph

```
core.js
├── editor.js
├── fileHandler.js
├── functionManager.js
├── tabManager.js
├── cfgVisualizer.js
├── chat.js
├── variableManager.js
└── xrefs.js
```

## Usage

The modular system is designed to maintain full compatibility with the original implementation. To use it:

1. Import the modular renderer in your main renderer.js file:
   ```javascript
   import './renderer/renderer.js';
   ```

2. Make sure your HTML includes the script with the type="module" attribute:
   ```html
   <script type="module" src="renderer.js"></script>
   ```

3. All global variables from the original implementation are still accessible through the state object in core.js and are also exposed as global variables for backward compatibility.

## Extending the System

To add new functionality:

1. Create a new module in the `frontend/renderer/` directory
2. Import any dependencies from other modules
3. Export your functions and objects
4. Import your module in renderer.js and initialize it in the `initApp()` function

## Testing

You can test the modular system using the test-modular.html file in the frontend directory.

## Compatibility

The modular system is fully compatible with the original implementation. No changes are required to preload.js, main.js, or other parts of the application. 