/**
 * Web Guide Extension - Background Service Worker
 * 
 * Handles:
 * - Extension lifecycle events
 * - Cross-tab communication
 * - Context menu integration (future)
 * - Keyboard shortcuts (future)
 */

// ============================================
// EXTENSION LIFECYCLE
// ============================================

chrome.runtime.onInstalled.addListener((details) => {
    console.log('Web Guide extension installed:', details.reason);
    
    if (details.reason === 'install') {
        // First time installation
        console.log('Welcome to Web Guide! Your virtual tour guide for the web.');
        
        // Set default settings
        chrome.storage.local.set({
            settings: {
                voiceInput: true,
                voiceOutput: true,
                visualArrows: true,
                autoSummarize: false,
            },
            stats: {
                pagesAnalyzed: 0,
                commandsProcessed: 0,
            }
        });
    } else if (details.reason === 'update') {
        console.log('Web Guide updated to version:', chrome.runtime.getManifest().version);
    }
});

// ============================================
// MESSAGE HANDLING
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'getSettings':
            chrome.storage.local.get('settings', (data) => {
                sendResponse(data.settings || {});
            });
            return true; // Keep channel open for async
            
        case 'updateSettings':
            chrome.storage.local.get('settings', (data) => {
                const newSettings = { ...data.settings, ...message.settings };
                chrome.storage.local.set({ settings: newSettings }, () => {
                    sendResponse({ success: true });
                });
            });
            return true;
            
        case 'incrementStats':
            chrome.storage.local.get('stats', (data) => {
                const stats = data.stats || { pagesAnalyzed: 0, commandsProcessed: 0 };
                if (message.stat === 'pages') {
                    stats.pagesAnalyzed++;
                } else if (message.stat === 'commands') {
                    stats.commandsProcessed++;
                }
                chrome.storage.local.set({ stats });
                sendResponse(stats);
            });
            return true;
            
        case 'getStats':
            chrome.storage.local.get('stats', (data) => {
                sendResponse(data.stats || { pagesAnalyzed: 0, commandsProcessed: 0 });
            });
            return true;
            
        default:
            sendResponse({ error: 'Unknown action' });
    }
});

// ============================================
// TAB EVENTS
// ============================================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Page finished loading - could trigger auto-summarize here
        console.log('Page loaded:', tab.url);
    }
});

// ============================================
// KEYBOARD SHORTCUTS (Future Feature)
// ============================================

chrome.commands?.onCommand?.addListener((command) => {
    console.log('Command received:', command);
    
    switch (command) {
        case 'toggle-guide':
            // Toggle guide mode
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleGuide' });
                }
            });
            break;
            
        case 'summarize-page':
            // Quick summarize
            chrome.action.openPopup();
            break;
    }
});

// ============================================
// CONTEXT MENU (Future Feature)
// ============================================

// Uncomment to add right-click context menu
/*
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'webguide-explain',
        title: 'Explain this element',
        contexts: ['all']
    });
    
    chrome.contextMenus.create({
        id: 'webguide-navigate',
        title: 'Guide me from here',
        contexts: ['all']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'webguide-explain') {
        chrome.tabs.sendMessage(tab.id, { 
            action: 'explainElement',
            x: info.x,
            y: info.y
        });
    }
});
*/

console.log('Web Guide background service worker initialized');
