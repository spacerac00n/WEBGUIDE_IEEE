/**
 * Web Guide Extension - Popup Logic
 * 
 * Features:
 * - Voice command input (Speech-to-Text)
 * - Voice response output (Text-to-Speech)
 * - Gemini API integration for page analysis
 * - Communication with content script for visual guidance
 */

// ============================================
// STATE MANAGEMENT
// ============================================
const state = {
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    voiceOutputEnabled: CONFIG.FEATURES.VOICE_OUTPUT,
    recognition: null,
    synthesis: window.speechSynthesis,
    currentUtterance: null,
    currentAudio: null,
    currentAudioUrl: null,
    currentTTSAbortController: null,
    currentSpeakRequestId: 0,
    activeSpeechEngine: null, // 'browser' | 'custom' | null
    microphonePermission: 'unknown', // 'unknown', 'granted', 'denied', 'prompt'
    pendingVoiceTranscript: '',
    voiceCommandDebounceTimer: null,
};

// ============================================
// DOM ELEMENTS
// ============================================
const elements = {
    voiceBtn: document.getElementById('voiceBtn'),
    stopSpeechBtn: document.getElementById('stopSpeechBtn'),
    responseArea: document.getElementById('responseArea'),
    transcriptText: document.getElementById('transcriptText'),
    sendTranscriptBtn: document.getElementById('sendTranscriptBtn'),
    voiceOutputToggle: document.getElementById('voiceOutputToggle'),
    voiceOutputStatus: document.getElementById('voiceOutputStatus'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
};

function setTranscriptText(text) {
    if (!elements.transcriptText) return;
    elements.transcriptText.value = text;
}

function getTranscriptText() {
    if (!elements.transcriptText) return '';
    return (elements.transcriptText.value || '').trim();
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkMicrophonePermission();
    await loadVoiceOutputPreference();
    initSpeechRecognition();
    bindEventListeners();
    updateStatus('ready', 'Ready to guide');
});

async function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                    return;
                }
                resolve(response);
            });
        } catch (error) {
            console.warn('Runtime message failed:', error);
            resolve(null);
        }
    });
}

function applyVoiceOutputUI(enabled) {
    state.voiceOutputEnabled = Boolean(enabled);

    if (elements.voiceOutputToggle) {
        elements.voiceOutputToggle.checked = state.voiceOutputEnabled;
    }

    if (elements.voiceOutputStatus) {
        elements.voiceOutputStatus.textContent = state.voiceOutputEnabled
            ? 'Voice output is ON'
            : 'Voice output is OFF';
    }
}

async function loadVoiceOutputPreference() {
    let enabled = CONFIG.FEATURES.VOICE_OUTPUT;
    const settingsResponse = await sendRuntimeMessage({ action: 'getSettings' });

    if (settingsResponse && typeof settingsResponse.voiceOutput === 'boolean') {
        enabled = settingsResponse.voiceOutput;
    } else {
        try {
            const data = await chrome.storage.local.get('settings');
            if (typeof data?.settings?.voiceOutput === 'boolean') {
                enabled = data.settings.voiceOutput;
            }
        } catch (error) {
            console.warn('Failed to load voice output setting from storage:', error);
        }
    }

    applyVoiceOutputUI(enabled);
}

async function saveVoiceOutputPreference(enabled) {
    const normalized = Boolean(enabled);
    const runtimeResult = await sendRuntimeMessage({
        action: 'updateSettings',
        settings: { voiceOutput: normalized },
    });

    if (runtimeResult?.success) return;

    try {
        const data = await chrome.storage.local.get('settings');
        const current = data.settings || {};
        await chrome.storage.local.set({
            settings: {
                ...current,
                voiceOutput: normalized,
            },
        });
    } catch (error) {
        console.warn('Failed to persist voice output setting:', error);
    }
}

/**
 * Check current microphone permission status
 */
async function checkMicrophonePermission() {
    try {
        // Check if permissions API is available
        if (navigator.permissions && navigator.permissions.query) {
            const result = await navigator.permissions.query({ name: 'microphone' });
            state.microphonePermission = result.state;
            
            // Listen for permission changes
            result.onchange = () => {
                state.microphonePermission = result.state;
                console.log('Microphone permission changed to:', result.state);
            };
        }
    } catch (e) {
        console.log('Permissions API not fully supported:', e);
        state.microphonePermission = 'unknown';
    }
}

/**
 * Request microphone permission explicitly
 */
async function requestMicrophonePermission() {
    const formatMicError = (error) => {
        const name = error?.name || 'Error';
        const message = error?.message || String(error);
        return `${name}: ${message}`;
    };

    try {
        updateResponse('Requesting microphone access... Please click "Allow" when prompted.');
        updateStatus('processing', 'Requesting mic access...');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            // Some extension popup contexts do not expose getUserMedia.
            // Let SpeechRecognition attempt to acquire mic access directly.
            state.microphonePermission = 'unknown';
            updateResponse(
                'Direct microphone permission API is unavailable in this popup context.\n' +
                'Trying voice recognition directly...'
            );
            updateStatus('ready', 'Ready to guide');
            return true;
        }

        // This will trigger the browser's permission prompt
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Permission granted - stop the stream immediately (we just needed permission)
        stream.getTracks().forEach(track => track.stop());
        
        state.microphonePermission = 'granted';
        updateResponse('Microphone access granted! Click the microphone button to start speaking.');
        updateStatus('ready', 'Ready to guide');
        
        return true;
    } catch (error) {
        const errorSummary = formatMicError(error);
        console.error(`Microphone permission error: ${errorSummary}`);
        let statusMessage = 'Microphone unavailable';
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            const isDismissed = /dismissed|closed/i.test(error?.message || '');

            if (isDismissed) {
                state.microphonePermission = 'prompt';
                statusMessage = 'Permission dismissed';
                updateResponse(
                    '🎤 Microphone permission prompt was dismissed.\n\n' +
                    'Click the microphone button again, then choose "Allow".\n\n' +
                    `Technical detail: ${errorSummary}`
                );
            } else {
                state.microphonePermission = 'denied';
                statusMessage = 'Mic access denied';
                updateResponse(
                    '🎤 Microphone access was denied.\n\n' +
                    'To enable voice commands:\n' +
                    '1. Open Chrome Site Settings for this extension popup\n' +
                    '2. Set Microphone to "Allow"\n' +
                    '3. Confirm your OS microphone permission for Chrome is enabled\n' +
                    '4. Retry the microphone button\n\n' +
                    `Technical detail: ${errorSummary}`
                );
            }
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            state.microphonePermission = 'unknown';
            statusMessage = 'No microphone found';
            updateResponse(
                'No microphone device was found.\n\n' +
                'Connect or enable a microphone, then try again.\n\n' +
                `Technical detail: ${errorSummary}`
            );
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            state.microphonePermission = 'unknown';
            statusMessage = 'Microphone busy';
            updateResponse(
                'Your microphone is busy or unavailable.\n\n' +
                'Close other apps using the microphone and try again.\n\n' +
                `Technical detail: ${errorSummary}`
            );
        } else {
            state.microphonePermission = 'unknown';
            updateResponse(`Microphone error: ${errorSummary}. Please try again.`);
        }
        
        updateStatus('inactive', statusMessage);
        return false;
    }
}

function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        updateResponse('Speech recognition is not supported in this browser. Please use Chrome.');
        elements.voiceBtn.disabled = true;
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    state.recognition = new SpeechRecognition();
    state.recognition.continuous = false;
    state.recognition.interimResults = true;
    state.recognition.lang = CONFIG.VOICE.LANGUAGE;
    
    state.recognition.onstart = () => {
        state.isListening = true;
        elements.voiceBtn.classList.add('listening');
        updateStatus('listening', 'Listening...');
    };
    
    state.recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');
        
        setTranscriptText(transcript);
        
        // If final result, process with a short silence delay
        if (event.results[0].isFinal) {
            scheduleVoiceCommandProcessing(transcript);
        }
    };
    
    state.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        stopListening();
        
        if (event.error === 'not-allowed') {
            state.microphonePermission = 'denied';
            updateResponse(
                '🎤 Microphone access is required for voice commands.\n\n' +
                'Click the microphone button again to request permission, or use the text buttons below.'
            );
        } else if (event.error === 'no-speech') {
            updateResponse('No speech detected. Please try again and speak clearly.');
        } else if (event.error === 'audio-capture') {
            updateResponse('No microphone found. Please connect a microphone and try again.');
        } else if (event.error === 'network') {
            updateResponse('Network error during speech recognition. Please check your connection.');
        } else {
            updateResponse(`Speech recognition error: ${event.error}. Please try again.`);
        }
    };
    
    state.recognition.onend = () => {
        stopListening();
    };
}

function scheduleVoiceCommandProcessing(transcript) {
    state.pendingVoiceTranscript = transcript;

    if (state.voiceCommandDebounceTimer) {
        clearTimeout(state.voiceCommandDebounceTimer);
    }

    // Wait briefly after final speech so slight pauses don't trigger early processing.
    state.voiceCommandDebounceTimer = setTimeout(() => {
        const finalTranscript = state.pendingVoiceTranscript;
        state.pendingVoiceTranscript = '';
        state.voiceCommandDebounceTimer = null;
        processVoiceCommand(finalTranscript);
    }, 1500);
}

function bindEventListeners() {
    // Voice button
    elements.voiceBtn.addEventListener('click', handleVoiceButtonClick);
    
    elements.stopSpeechBtn.addEventListener('click', stopSpeaking);

    if (elements.voiceOutputToggle) {
        elements.voiceOutputToggle.addEventListener('change', async (event) => {
            const enabled = Boolean(event.target.checked);
            applyVoiceOutputUI(enabled);
            await saveVoiceOutputPreference(enabled);

            if (!enabled) {
                stopSpeaking();
            }
        });
    }

    if (elements.sendTranscriptBtn) {
        elements.sendTranscriptBtn.addEventListener('click', () => {
            handleTypedCommand();
        });
    }

    if (elements.transcriptText) {
        elements.transcriptText.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleTypedCommand();
            }
        });
    }
}

function handleTypedCommand() {
    const command = getTranscriptText();
    if (!command) return;
    processVoiceCommand(command);
}

// ============================================
// VOICE CONTROL
// ============================================

/**
 * Handle voice button click - request permission if needed
 */
async function handleVoiceButtonClick() {
    // If already listening, stop
    if (state.isListening) {
        stopListening();
        return;
    }

    // Refresh in background for state sync, but do not await here.
    // Awaiting can consume transient user activation in popup contexts.
    checkMicrophonePermission().catch(() => {});

    // Attempt explicit permission when supported, otherwise continue to recognition.
    const granted = await requestMicrophonePermission();
    if (!granted) return;
    startListening();
}

function toggleListening() {
    if (state.isListening) {
        stopListening();
    } else {
        startListening();
    }
}

function startListening() {
    if (state.isSpeaking) {
        stopSpeaking();
    }
    
    try {
        state.recognition.start();
    } catch (e) {
        console.error('Failed to start recognition:', e);
        
        // If it fails, might need permission
        if (e.message && e.message.includes('not-allowed')) {
            requestMicrophonePermission();
        }
    }
}

function stopListening() {
    state.isListening = false;
    elements.voiceBtn.classList.remove('listening');
    updateStatus('ready', 'Ready to guide');
    
    try {
        state.recognition?.stop();
    } catch (e) {
        // Ignore errors when stopping
    }
}

/**
 * Convert text into speech using ElevenLabs-style REST API.
 * @param {string} text - Text to synthesize.
 * @returns {Promise<Blob>} MP3 audio blob.
 */
async function callCustomTTSAPI(text) {
    const elevenLabs = CONFIG.TTS?.ELEVENLABS;
    const apiKey = elevenLabs?.API_KEY?.trim();

    if (!apiKey || apiKey === 'YOUR_ELEVENLABS_API_KEY_HERE') {
        throw new Error('Custom TTS API key is not configured.');
    }

    if (!elevenLabs?.VOICE_ID) {
        throw new Error('Custom TTS voice ID is not configured.');
    }

    const endpointBase = (elevenLabs.API_URL || '').replace(/\/$/, '');
    const endpoint = `${endpointBase}/${encodeURIComponent(elevenLabs.VOICE_ID)}?output_format=${encodeURIComponent(elevenLabs.OUTPUT_FORMAT || 'mp3_44100_128')}`;
    const controller = new AbortController();
    state.currentTTSAbortController = controller;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg',
                'xi-api-key': apiKey,
            },
            body: JSON.stringify({
                text,
                model_id: elevenLabs.MODEL_ID || 'eleven_multilingual_v2',
                voice_settings: {
                    speed: elevenLabs.SPEED ?? 0.85,
                    stability: elevenLabs.STABILITY ?? 0.45,
                    similarity_boost: elevenLabs.SIMILARITY_BOOST ?? 0.8,
                    style: elevenLabs.STYLE ?? 0.2,
                    use_speaker_boost: elevenLabs.USE_SPEAKER_BOOST ?? true,
                },
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const errorMessage =
                errorData?.detail?.message ||
                errorData?.detail ||
                errorData?.message ||
                `Custom TTS request failed with status ${response.status}`;
            throw new Error(errorMessage);
        }

        const audioBlob = await response.blob();
        if (!audioBlob || audioBlob.size === 0) {
            throw new Error('Custom TTS returned empty audio.');
        }

        return audioBlob;
    } finally {
        if (state.currentTTSAbortController === controller) {
            state.currentTTSAbortController = null;
        }
    }
}

/**
 * Play custom TTS audio generated from API response.
 * @param {string} text - Text to synthesize and play.
 * @param {number} requestId - Monotonic request id used to ignore stale events.
 * @returns {Promise<void>}
 */
async function playCustomTTSAudio(text, requestId) {
    updateStatus('processing', 'Generating voice...');
    elements.stopSpeechBtn.disabled = false;

    const audioBlob = await callCustomTTSAPI(text);
    if (requestId !== state.currentSpeakRequestId) return;

    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.preload = 'auto';

    state.currentAudio = audio;
    state.currentAudioUrl = audioUrl;
    state.activeSpeechEngine = 'custom';

    await audio.play();
    if (requestId !== state.currentSpeakRequestId) return;

    state.isSpeaking = true;
    elements.stopSpeechBtn.disabled = false;
    updateStatus('speaking', 'Speaking...');

    await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = () => reject(new Error('Custom TTS audio playback failed.'));
    });

    if (requestId === state.currentSpeakRequestId) {
        stopSpeaking(true, false);
    }
}

/**
 * Speak text with browser SpeechSynthesis as fallback.
 * @param {string} text - Text to speak.
 * @param {number} requestId - Monotonic request id used to ignore stale events.
 */
function speakWithBrowserTTS(text, requestId) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = CONFIG.VOICE.SPEECH_RATE;
    utterance.pitch = CONFIG.VOICE.SPEECH_PITCH;
    utterance.lang = CONFIG.VOICE.LANGUAGE;

    state.currentUtterance = utterance;
    state.activeSpeechEngine = 'browser';

    utterance.onstart = () => {
        if (requestId !== state.currentSpeakRequestId) return;
        state.isSpeaking = true;
        elements.stopSpeechBtn.disabled = false;
        updateStatus('speaking', 'Speaking...');
    };

    utterance.onend = () => {
        if (requestId !== state.currentSpeakRequestId) return;
        state.currentUtterance = null;
        state.activeSpeechEngine = null;
        state.isSpeaking = false;
        elements.stopSpeechBtn.disabled = true;
        updateStatus('ready', 'Ready to guide');
    };

    utterance.onerror = (event) => {
        if (requestId !== state.currentSpeakRequestId) return;
        console.error('Browser TTS error:', event.error);
        state.currentUtterance = null;
        state.activeSpeechEngine = null;
        state.isSpeaking = false;
        elements.stopSpeechBtn.disabled = true;
        updateStatus('ready', 'Ready to guide');
    };

    elements.stopSpeechBtn.disabled = false;
    state.synthesis.speak(utterance);
}

async function speak(text) {
    if (!state.voiceOutputEnabled) return;

    const message = String(text || '').trim();
    if (!message) return;

    // Start a new speech cycle and invalidate older callbacks.
    const requestId = state.currentSpeakRequestId + 1;
    stopSpeaking(false, false);
    state.currentSpeakRequestId = requestId;

    const useCustomTTS = Boolean(
        CONFIG.FEATURES.CUSTOM_TTS_OUTPUT &&
        CONFIG.TTS?.ENABLE_CUSTOM_TTS &&
        CONFIG.TTS?.PROVIDER === 'elevenlabs'
    );

    if (useCustomTTS) {
        try {
            await playCustomTTSAudio(message, requestId);
            return;
        } catch (error) {
            if (error?.name === 'AbortError' || requestId !== state.currentSpeakRequestId) {
                return;
            }

            console.error('Custom TTS failed, falling back to browser TTS:', error);

            if (!CONFIG.TTS?.FALLBACK_TO_BROWSER_TTS) {
                updateResponse(`Voice output error: ${error.message}`);
                stopSpeaking(true, false);
                return;
            }

            updateStatus('processing', 'Custom voice unavailable, using browser voice...');
        }
    }

    speakWithBrowserTTS(message, requestId);
}

/**
 * Stop all speech output (custom audio and browser TTS), clean resources, and reset UI.
 * @param {boolean} updateUI - Whether to set status back to ready.
 * @param {boolean} invalidateRequest - Whether to invalidate in-flight speech callbacks.
 */
function stopSpeaking(updateUI = true, invalidateRequest = true) {
    if (invalidateRequest) {
        state.currentSpeakRequestId += 1;
    }

    if (state.currentTTSAbortController) {
        try {
            state.currentTTSAbortController.abort();
        } catch (e) {
            console.warn('Failed to abort custom TTS request:', e);
        } finally {
            state.currentTTSAbortController = null;
        }
    }

    try {
        state.synthesis.cancel();
    } catch (e) {
        console.warn('Failed to cancel browser TTS:', e);
    }

    state.currentUtterance = null;

    if (state.currentAudio) {
        try {
            state.currentAudio.pause();
            state.currentAudio.src = '';
        } catch (e) {
            console.warn('Failed to stop custom audio:', e);
        }
        state.currentAudio = null;
    }

    if (state.currentAudioUrl) {
        URL.revokeObjectURL(state.currentAudioUrl);
        state.currentAudioUrl = null;
    }

    state.activeSpeechEngine = null;
    state.isSpeaking = false;
    elements.stopSpeechBtn.disabled = true;

    if (updateUI) {
        updateStatus('ready', 'Ready to guide');
    }
}

// ============================================
// COMMAND PROCESSING
// ============================================
async function processVoiceCommand(transcript) {
    const prompt = String(transcript || '').trim();
    if (!prompt) return;
    await processCommand('navigate', prompt);
}

async function processCommand(type, customQuery = null) {
    if (state.isProcessing) return;
    
    state.isProcessing = true;
    updateStatus('processing', 'Analyzing page...');
    updateResponse('<span class="loading"></span> Processing your request...');
    
    try {
        // Get page content from content script
        const pageData = await getPageContent();
        
        if (!pageData) {
            throw new Error('Could not access page content. Please refresh the page and try again.');
        }

        // Reset previous guidance before generating a new recommendation
        if (CONFIG.FEATURES.VISUAL_ARROWS) {
            await sendToContentScript({ action: 'clearHighlights' });
        }
        
        // Build prompt based on command type
        let prompt = buildPrompt(type, pageData, customQuery);
        
        // Call Gemini API
        const response = await callGeminiAPI(prompt);
        
        // Parse and display response
        await handleGeminiResponse(response, type, pageData);
        
    } catch (error) {
        console.error('Command processing error:', error);
        const errorMessage = `Sorry, I encountered an error: ${error.message}`;
        updateResponse(errorMessage);
        speak(errorMessage);
    } finally {
        state.isProcessing = false;
        updateStatus('ready', 'Ready to guide');
    }
}

// ============================================
// PAGE CONTENT EXTRACTION
// ============================================
async function getPageContent() {
    return new Promise(async (resolve) => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                resolve(null);
                return;
            }
            
            // Check if we're on a restricted page
            if (tab.url.startsWith('chrome://') || 
                tab.url.startsWith('chrome-extension://') ||
                tab.url.startsWith('edge://') ||
                tab.url.startsWith('about:')) {
                updateResponse('Cannot analyze browser internal pages. Please navigate to a regular webpage.');
                resolve(null);
                return;
            }
            
            // First, try to inject the content script programmatically
            // This ensures it's loaded even if the page was open before extension install
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['config.js', 'content.js']
                });
                
                // Also inject CSS
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ['content.css']
                });
            } catch (injectionError) {
                // Script might already be injected, or page doesn't allow it
                console.log('Script injection note:', injectionError.message);
            }
            
            // Small delay to ensure script is ready
            await new Promise(r => setTimeout(r, 100));
            
            // Now try to communicate with the content script
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { 
                    action: 'getPageContent' 
                });
                resolve(response);
            } catch (messageError) {
                console.error('Message error:', messageError);
                
                // If still failing, try one more time with a longer delay
                await new Promise(r => setTimeout(r, 300));
                
                try {
                    const retryResponse = await chrome.tabs.sendMessage(tab.id, { 
                        action: 'getPageContent' 
                    });
                    resolve(retryResponse);
                } catch (retryError) {
                    console.error('Retry failed:', retryError);
                    resolve(null);
                }
            }
        } catch (error) {
            console.error('Failed to get page content:', error);
            resolve(null);
        }
    });
}

// ============================================
// GEMINI API INTEGRATION
// ============================================
function getIndexedInteractiveElements(pageData) {
    return (pageData.interactiveElements || []).slice(0, 20).map((element, index) => ({
        index,
        tag: element.tag,
        type: element.type,
        text: element.text || null,
        ariaLabel: element.ariaLabel || null,
        href: element.href || null,
    }));
}

function buildPrompt(type, pageData, customQuery) {
    const indexedInteractiveElements = getIndexedInteractiveElements(pageData);

    const baseContext = `
You are a helpful web accessibility guide. Your role is to help users understand web pages and navigate them effectively.
You speak in a friendly, clear, and concise manner - like a helpful tour guide.

Current Page Information:
- URL: ${pageData.url}
- Title: ${pageData.title}
- Main Content Summary: ${pageData.textContent.substring(0, 3000)}
- Interactive Elements (indexed): ${JSON.stringify(indexedInteractiveElements)}
- Navigation Links: ${JSON.stringify(pageData.navigationLinks.slice(0, 15))}
- Page Structure: ${JSON.stringify(pageData.headings)}
`;

    const prompts = {
        summarize: `${baseContext}

Task: Summarize this page for the user.
Please provide:
1. A brief explanation of what this page is (1-2 sentences)
2. The main purpose or content of the page
3. Key sections or features available

Keep your response concise (under 100 words) and speak naturally as if talking to the user.
Format your response as plain text, not markdown.`,

        guide: `${baseContext}

Task: Answer this exact question for the user: "What's the best next action?"
Please provide:
1. One clear recommended next action
2. 1-2 short alternatives

If the user's request is unclear, seems unrelated to the page, or could reflect a speech impairment/misheard phrase, ask one short clarification question instead.
When asking a clarification question, wrap it in:
[CLARIFY]your question here[/CLARIFY]
Do not include a highlight block when clarifying.

Output rules (strict):
- Return exactly 1-2 short, simple, concrete next-step sentences.
- Each sentence must start with an action verb (for example: "Click", "Review", "Upload", "Open", "Select", "Enter").
- No preamble, no filler, no markdown, no bullet points.
- Maximum 2 lines total.

IMPORTANT OUTPUT FORMAT:
At the end, include exactly one JSON block:
[HIGHLIGHT_ELEMENT]{"elementIndex": NUMBER, "description": "SHORT_LABEL"}[/HIGHLIGHT_ELEMENT]

Rules:
- elementIndex must be one of the interactive element indexes provided above.
- Choose the single best button/link/input the user should act on next.
- description should be a short label suitable for a tooltip.`,

        navigate: `${baseContext}

User Request: "${customQuery}"

Task: Help the user find what they're looking for.
1. Identify if the requested item/action exists on this page
2. If yes, explain where it is and how to access it
3. If no, suggest the closest alternative or explain what's available

If the user's request is unclear, not aligned with anything on the page, or could reflect a speech impairment/misheard phrase, ask one short clarification question instead.
When asking a clarification question, wrap it in:
[CLARIFY]your question here[/CLARIFY]
Do not include a highlight block when clarifying.

Output rules (strict):
- Return exactly 1-2 short, simple, concrete next-step sentences.
- Each sentence must start with an action verb (for example: "Click", "Review", "Upload", "Open", "Select", "Enter").
- No preamble, no filler, no markdown, no bullet points.
- Maximum 2 lines total.

IMPORTANT: If you found a relevant element, include a JSON block:
[HIGHLIGHT_ELEMENT]{"elementIndex": NUMBER, "description": "BRIEF_DESCRIPTION"}[/HIGHLIGHT_ELEMENT]

Even if no exact match exists, choose the closest practical next step and still include the highlight block.`
    };

    return prompts[type] || prompts.summarize;
}

async function callGeminiAPI(prompt) {
    const url = `${CONFIG.GEMINI_API_URL}?key=${CONFIG.GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 500,
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_NONE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_NONE"
                }
            ]
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response from Gemini API');
    }
    
    return data.candidates[0].content.parts[0].text;
}

function resolveHighlightTarget(highlightData, pageData) {
    const interactiveElements = pageData?.interactiveElements || [];
    const parsedIndex = Number(highlightData?.elementIndex);
    let selector = null;
    let description = typeof highlightData?.description === 'string' ? highlightData.description.trim() : '';

    if (Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < interactiveElements.length) {
        const recommendedElement = interactiveElements[parsedIndex];
        selector = recommendedElement.selector;

        if (!description) {
            description =
                recommendedElement.text ||
                recommendedElement.ariaLabel ||
                'Recommended action';
        }
    }

    if (!selector && typeof highlightData?.selector === 'string' && highlightData.selector.trim()) {
        selector = highlightData.selector.trim();
    }

    if (!selector) return null;
    if (!description) description = 'Recommended action';

    return { selector, description };
}

function formatActionStepResponse(text) {
    const cleaned = String(text || '')
        .replace(/\r/g, '')
        .replace(/^\s*[-*•]\s*/gm, '')
        .replace(/^\s*\d+[.)]\s*/gm, '')
        .trim();

    if (!cleaned) {
        return 'Click the recommended option to continue.';
    }

    const sentenceLikeParts = cleaned
        .split(/\n+/)
        .flatMap(line => line.split(/(?<=[.!?])\s+/))
        .map(part => part.trim())
        .filter(Boolean);

    const actionLines = sentenceLikeParts.slice(0, 2).map((line) => {
        const normalized = line.replace(/\s+/g, ' ').trim();
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    });

    if (actionLines.length === 0) {
        return 'Click the recommended option to continue.';
    }

    return actionLines.join('\n');
}

function resolveFallbackHighlightTarget(pageData, responseText) {
    const interactiveElements = pageData?.interactiveElements || [];
    if (!interactiveElements.length) return null;

    const lowerText = String(responseText || '').toLowerCase();
    let bestElement = interactiveElements[0];
    let bestScore = -1;

    for (const element of interactiveElements) {
        const combined = `${element.text || ''} ${element.ariaLabel || ''}`.toLowerCase().trim();
        if (!combined) continue;

        let score = 0;
        if (lowerText.includes(combined)) score += 50;
        const tokens = combined.split(/\s+/).filter(Boolean);
        const tokenMatches = tokens.filter(token => lowerText.includes(token)).length;
        score += tokenMatches * 4;

        if (score > bestScore) {
            bestScore = score;
            bestElement = element;
        }
    }

    if (!bestElement?.selector) return null;
    return {
        selector: bestElement.selector,
        description: bestElement.text || bestElement.ariaLabel || 'Start here'
    };
}

async function handleGeminiResponse(response, type, pageData) {
    const clarifyMatch = response.match(/\[CLARIFY\](.*?)\[\/CLARIFY\]/s);
    if (clarifyMatch) {
        const clarifyText = clarifyMatch[1].trim() || 'Could you clarify what you want to do on this page?';
        updateResponse(clarifyText);
        speak(clarifyText);
        await sendToContentScript({ action: 'clearHighlights' });
        return;
    }

    // Extract highlight element if present
    const highlightMatch = response.match(/\[HIGHLIGHT_ELEMENT\](.*?)\[\/HIGHLIGHT_ELEMENT\]/s);
    const cleanResponse = response.replace(/\[HIGHLIGHT_ELEMENT\].*?\[\/HIGHLIGHT_ELEMENT\]/s, '').trim();
    const displayResponse = ['guide', 'navigate'].includes(type)
        ? formatActionStepResponse(cleanResponse)
        : cleanResponse;
    const responseToDisplay = displayResponse || 'I found a recommendation, but could not format it clearly.';
    
    // Update UI with response
    updateResponse(responseToDisplay);
    
    // Speak the response
    speak(responseToDisplay);
    
    let target = null;
    if (highlightMatch) {
        try {
            const highlightData = JSON.parse(highlightMatch[1]);
            target = resolveHighlightTarget(highlightData, pageData);
        } catch (e) {
            console.error('Failed to parse highlight data:', e);
        }
    }

    if (!target) {
        target = resolveFallbackHighlightTarget(pageData, responseToDisplay);
    }

    if (target) {
        await sendToContentScript({
            action: 'highlightElement',
            selector: target.selector,
            description: target.description
        });
    } else {
        if (['guide', 'navigate'].includes(type)) {
            const reprompt = 'I could not match that to anything on this page. What did you mean, or what should I look for?';
            updateResponse(reprompt);
            speak(reprompt);
            await sendToContentScript({ action: 'clearHighlights' });
        }
        console.warn('No actionable target available to highlight for this prompt.');
    }
}

// ============================================
// CONTENT SCRIPT COMMUNICATION
// ============================================
async function sendToContentScript(message) {
    return new Promise(async (resolve) => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                resolve(null);
                return;
            }
            
            try {
                const response = await chrome.tabs.sendMessage(tab.id, message);
                resolve(response);
            } catch (error) {
                console.error('Failed to send to content script:', error);
                resolve(null);
            }
        } catch (error) {
            console.error('Tab query error:', error);
            resolve(null);
        }
    });
}

// ============================================
// UI UPDATES
// ============================================
function updateStatus(status, text) {
    elements.statusDot.className = 'status-dot';
    
    switch (status) {
        case 'listening':
            elements.statusDot.classList.add('listening');
            break;
        case 'processing':
        case 'speaking':
            // Default active state
            break;
        case 'inactive':
            elements.statusDot.classList.add('inactive');
            break;
        default:
            // Ready state - default green
            break;
    }
    
    elements.statusText.textContent = text;
}

function updateResponse(text) {
    // Convert newlines to <br> for HTML display
    elements.responseArea.innerHTML = text.replace(/\n/g, '<br>');
}
