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

    // Validation API calls
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

    // Project API calls
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

    async getGroupedTags(binary, functionId) {
        return this.request(`/api/tags/${binary}/${functionId}/grouped`);
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

    // Notes API calls (existing functionality)
    async getNote(binary, functionId) {
        return this.request(`/api/notes/${binary}/${functionId}`);
    }

    async saveNote(binary, functionId, content) {
        return this.request(`/api/notes/${binary}/${functionId}`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    }

    // Chat API calls (existing functionality)
    async sendChatMessage(message, context = null) {
        return this.request('/api/chat/send', {
            method: 'POST',
            body: JSON.stringify({
                message: message,
                context: context
            })
        });
    }
}

// Export a singleton instance
export const apiService = new ApiService(); 