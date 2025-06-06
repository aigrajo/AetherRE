// Centralized API service for backend communication
export class ApiService {
    constructor() {
        this.baseUrl = 'http://localhost:8000';
    }

    // Generic fetch wrapper with error handling
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const config = { ...defaultOptions, ...options };
        
        try {
            console.log(`Making API request to: ${url}`);
            console.log(`Request config:`, config);
            
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`API Error ${response.status}: ${errorText}`);
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }
            
            const result = await response.json();
            console.log(`API response:`, result);
            return result;
        } catch (error) {
            console.error(`API request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    // Enhanced validation API calls
    async validateFunctionName(oldName, newName, functionsData, currentFunctionId, pseudocode) {
        return this.request('/api/validation/function-name', {
            method: 'POST',
            body: JSON.stringify({
                old_name: oldName,
                new_name: newName,
                functions_data: functionsData,
                current_function_id: currentFunctionId,
                pseudocode: pseudocode
            })
        });
    }

    async validateVariableName(oldName, newName, localVariables, pseudocode) {
        return this.request('/api/validation/variable-name', {
            method: 'POST',
            body: JSON.stringify({
                old_name: oldName,
                new_name: newName,
                local_variables: localVariables,
                pseudocode: pseudocode
            })
        });
    }

    async validateTagValue(tagValue, tagType, existingTags) {
        return this.request('/api/validation/tag-value', {
            method: 'POST',
            body: JSON.stringify({
                tag_value: tagValue,
                tag_type: tagType,
                existing_tags: existingTags
            })
        });
    }

    async validateNameFormat(name) {
        return this.request('/api/validation/name-format', {
            method: 'POST',
            body: JSON.stringify({ name })
        });
    }

    async validateAgainstKeywords(name) {
        return this.request('/api/validation/keywords', {
            method: 'POST',
            body: JSON.stringify({ name })
        });
    }

    async validatePseudocodeConflicts(name, pseudocode, oldName = null) {
        return this.request('/api/validation/pseudocode-conflicts', {
            method: 'POST',
            body: JSON.stringify({
                name: name,
                pseudocode: pseudocode,
                old_name: oldName
            })
        });
    }

    // Batch validation API calls
    async batchValidateFunctionNames(renameOperations, functionsData) {
        return this.request('/api/validation/batch/function-names', {
            method: 'POST',
            body: JSON.stringify({
                rename_operations: renameOperations,
                functions_data: functionsData
            })
        });
    }

    async batchValidateVariableNames(renameOperations, localVariables) {
        return this.request('/api/validation/batch/variable-names', {
            method: 'POST',
            body: JSON.stringify({
                rename_operations: renameOperations,
                local_variables: localVariables
            })
        });
    }

    // Enhanced project API calls
    async collectProjectData(projectName, binaryName, binaryPath, functionsData) {
        return this.request('/api/projects/collect-data', {
            method: 'POST',
            body: JSON.stringify({
                project_name: projectName,
                binary_name: binaryName,
                binary_path: binaryPath,
                functions_data: functionsData
            })
        });
    }

    async verifyProjectCompatibility(projectData, currentBinaryPath) {
        return this.request('/api/projects/verify-compatibility', {
            method: 'POST',
            body: JSON.stringify({
                project_data: projectData,
                current_binary_path: currentBinaryPath
            })
        });
    }

    async applyCustomizations(functionsData, functionNames = null, variableNames = null) {
        return this.request('/api/projects/apply-customizations', {
            method: 'POST',
            body: JSON.stringify({
                functions_data: functionsData,
                function_names: functionNames,
                variable_names: variableNames
            })
        });
    }

    async batchApplyCustomizations(functionsData, customizations) {
        return this.request('/api/projects/batch-apply', {
            method: 'POST',
            body: JSON.stringify({
                functions_data: functionsData,
                customizations: customizations
            })
        });
    }

    async applyCompleteProject(functionsData, projectData, binaryPath, binaryName) {
        return this.request('/api/projects/complete-project-application', {
            method: 'POST',
            body: JSON.stringify({
                functions_data: functionsData,
                project_data: projectData,
                binary_path: binaryPath,
                binary_name: binaryName
            })
        });
    }

    async getCurrentProjectState(binaryName, functionsData) {
        return this.request('/api/projects/state/current', {
            method: 'POST',
            body: JSON.stringify({
                binary_name: binaryName,
                functions_data: functionsData
            })
        });
    }

    async validateProjectState(binaryName, functionsData) {
        return this.request('/api/projects/state/validate', {
            method: 'POST',
            body: JSON.stringify({
                binary_name: binaryName,
                functions_data: functionsData
            })
        });
    }

    async calculateBinaryHash(filePath) {
        return this.request('/api/projects/calculate-hash', {
            method: 'POST',
            body: JSON.stringify({ file_path: filePath })
        });
    }

    async cleanBinaryName(name) {
        return this.request('/api/projects/clean-name', {
            method: 'POST',
            body: JSON.stringify({ name })
        });
    }

    async collectCustomFunctionNames(functionsData) {
        return this.request('/api/projects/collect-function-names', {
            method: 'POST',
            body: JSON.stringify(functionsData)
        });
    }

    async collectCustomVariableNames(functionsData) {
        return this.request('/api/projects/collect-variable-names', {
            method: 'POST',
            body: JSON.stringify(functionsData)
        });
    }

    // Tag API calls
    async getTags(binary, functionId) {
        return this.request(`/api/tags/${binary}/${functionId}`);
    }

    async saveTags(binary, functionId, tags) {
        return this.request(`/api/tags/${binary}/${functionId}`, {
            method: 'POST',
            body: JSON.stringify({ tags })
        });
    }

    async addTag(binary, functionId, tagType, tagValue, color = null, includeInAi = true) {
        return this.request(`/api/tags/${binary}/${functionId}/add`, {
            method: 'POST',
            body: JSON.stringify({
                tag_type: tagType,
                tag_value: tagValue,
                color: color,
                include_in_ai: includeInAi
            })
        });
    }

    async removeTag(binary, functionId, tagType, tagValue) {
        return this.request(`/api/tags/${binary}/${functionId}/remove`, {
            method: 'DELETE',
            body: JSON.stringify({
                tag_type: tagType,
                tag_value: tagValue
            })
        });
    }

    async toggleAiInclusion(binary, functionId, tagType, tagValue) {
        return this.request(`/api/tags/${binary}/${functionId}/toggle-ai`, {
            method: 'POST',
            body: JSON.stringify({
                tag_type: tagType,
                tag_value: tagValue
            })
        });
    }

    async getAiContextTags(binary, functionId) {
        return this.request(`/api/tags/${binary}/${functionId}/ai-context`);
    }

    async getTagTypes() {
        return this.request('/api/tags/types');
    }

    async getTagColors() {
        return this.request('/api/tags/colors');
    }

    async cleanupTags(binary) {
        return this.request(`/api/tags/${binary}/cleanup`, {
            method: 'POST'
        });
    }

    // Notes API calls
    async getNote(binary, functionId) {
        return this.request(`/api/notes/${binary}/${functionId}`);
    }

    async saveNote(binary, functionId, content) {
        return this.request(`/api/notes/${binary}/${functionId}`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    }

    // Chat API calls
    async sendChatMessage(message, context = null) {
        return this.request('/api/chat/send', {
            method: 'POST',
            body: JSON.stringify({
                message: message,
                context: context
            })
        });
    }

    // Function Operations API calls
    async renameFunction(oldName, newName, currentFunction, functionsData, sessionId = null) {
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (sessionId) {
            headers['x-session-id'] = sessionId;
        }
        
        return this.request('/api/functions/rename', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                old_name: oldName,
                new_name: newName,
                current_function: currentFunction,
                functions_data: functionsData
            })
        });
    }

    async getFunctionHistory(sessionId) {
        return this.request('/api/functions/history', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId
            })
        });
    }

    async undoFunctionOperation(sessionId, operationId) {
        return this.request('/api/functions/undo', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId,
                operation_id: operationId
            })
        });
    }

    async redoFunctionOperation(sessionId, operationId) {
        return this.request('/api/functions/redo', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId,
                operation_id: operationId
            })
        });
    }

    // Variable Operations API calls (mirrors function operations)
    async renameVariable(oldName, newName, currentFunction, sessionId = null) {
        const headers = {
            'Content-Type': 'application/json',
        };
        
        if (sessionId) {
            headers['x-session-id'] = sessionId;
        }
        
        return this.request('/api/functions/rename-variable', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                old_name: oldName,
                new_name: newName,
                current_function: currentFunction
            })
        });
    }

    async undoVariableOperation(sessionId, operationId) {
        return this.request('/api/functions/undo', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId,
                operation_id: operationId
            })
        });
    }

    async redoVariableOperation(sessionId, operationId) {
        return this.request('/api/functions/redo', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId,
                operation_id: operationId
            })
        });
    }

    // Unified History API calls
    async recordOperation(sessionId, operationType, operationData, oldState, newState, metadata = null) {
        return this.request('/api/history/record', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId,
                operation_type: operationType,
                operation_data: operationData,
                old_state: oldState,
                new_state: newState,
                metadata: metadata
            })
        });
    }

    async undoLastOperation(sessionId) {
        return this.request('/api/history/undo', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId
            })
        });
    }

    async redoLastOperation(sessionId) {
        return this.request('/api/history/redo', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId
            })
        });
    }

    async getHistoryState(sessionId) {
        return this.request('/api/history/state', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId
            })
        });
    }

    async clearHistory(sessionId) {
        return this.request('/api/history/clear', {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId
            })
        });
    }
}

// Create and export singleton instance
export const apiService = new ApiService(); 