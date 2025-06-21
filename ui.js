// UI Logic for AI Design Co-Pilot Figma Plugin
// Handles user interactions and communication with the plugin backend
// DOM Elements
const apiKeyInput = document.getElementById('api-key');
const saveKeyButton = document.getElementById('save-key');
const analyzeButton = document.getElementById('analyze-component');
const statusDiv = document.getElementById('status');
// State management
let apiKeySaved = false;
// Initialize UI event listeners
function initializeUI() {
    // Save API Key button click handler
    saveKeyButton.addEventListener('click', handleSaveApiKey);
    // Analyze Component button click handler
    analyzeButton.addEventListener('click', handleAnalyzeComponent);
    // API Key input change handler - enable/disable analyze button
    apiKeyInput.addEventListener('input', handleApiKeyChange);
    // Listen for messages from the plugin backend
    window.addEventListener('message', handlePluginMessage);
    // Request current API key status from backend
    sendMessageToPlugin('check-api-key', {});
}
// Handle API key input changes
function handleApiKeyChange() {
    const hasApiKey = apiKeyInput.value.trim().length > 0;
    updateAnalyzeButtonState(hasApiKey && apiKeySaved);
}
// Handle Save API Key button click
function handleSaveApiKey() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        updateStatus('Please enter an API key', 'error');
        return;
    }
    // Disable save button during processing
    saveKeyButton.disabled = true;
    updateStatus('Saving API key...', 'info');
    // Send API key to plugin backend
    sendMessageToPlugin('save-api-key', { apiKey });
}
// Handle Analyze Component button click
function handleAnalyzeComponent() {
    if (!apiKeySaved) {
        updateStatus('Please save API key first', 'error');
        return;
    }
    // Disable analyze button during processing
    analyzeButton.disabled = true;
    updateStatus('Analyzing selected component...', 'info');
    // Send analyze request to plugin backend
    sendMessageToPlugin('analyze', {});
}
// Handle messages from the plugin backend
function handlePluginMessage(event) {
    const { type, data } = event.data.pluginMessage || {};
    switch (type) {
        case 'api-key-saved':
            handleApiKeySaved(data.success);
            break;
        case 'api-key-status':
            handleApiKeyStatus(data.hasKey);
            break;
        case 'analysis-complete':
            handleAnalysisComplete(data.success, data.message);
            break;
        case 'analysis-error':
            handleAnalysisError(data.error);
            break;
        default:
            console.log('Unknown message type:', type);
    }
}
// Handle API key save response
function handleApiKeySaved(success) {
    saveKeyButton.disabled = false;
    if (success) {
        apiKeySaved = true;
        updateStatus('API key saved successfully!', 'success');
        updateAnalyzeButtonState(true);
        // Clear the input field for security
        apiKeyInput.value = '';
    }
    else {
        updateStatus('Failed to save API key', 'error');
    }
}
// Handle API key status response
function handleApiKeyStatus(hasKey) {
    apiKeySaved = hasKey;
    if (hasKey) {
        updateStatus('API key is configured', 'success');
        updateAnalyzeButtonState(true);
    }
    else {
        updateStatus('Enter API key to get started', 'info');
        updateAnalyzeButtonState(false);
    }
}
// Handle analysis completion
function handleAnalysisComplete(success, message) {
    analyzeButton.disabled = false;
    if (success) {
        updateStatus('Analysis complete! Check Figma notifications.', 'success');
    }
    else {
        updateStatus(`Analysis failed: ${message}`, 'error');
    }
}
// Handle analysis error
function handleAnalysisError(error) {
    analyzeButton.disabled = false;
    updateStatus(`Error: ${error}`, 'error');
}
// Update the analyze button state
function updateAnalyzeButtonState(enabled) {
    analyzeButton.disabled = !enabled;
}
// Update status message with different types
function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    // Remove existing type classes
    statusDiv.classList.remove('status-info', 'status-success', 'status-error');
    // Add new type class
    statusDiv.classList.add(`status-${type}`);
}
// Send message to plugin backend
function sendMessageToPlugin(type, data) {
    parent.postMessage({
        pluginMessage: { type, data }
    }, '*');
}
// Initialize the UI when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeUI);
// Export for potential future use
export { initializeUI };
