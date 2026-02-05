# Web Guide - Chrome Extension

> Your virtual tour guide for the web. Making the internet accessible for everyone.

## Overview

Web Guide is a Chrome extension that acts as a **virtual tour guide** for any webpage. It helps users understand where they are, what the page is for, and guides them to their next action—solving accessibility challenges for people who struggle with understanding pages and navigating to the right place.

### Key Features

- **Page Summarization**: Explains the current page in simple, clear language
- **Next Action Guidance**: Suggests what users can do and highlights the recommended element
- **Voice Commands**: Speak naturally to ask questions or request navigation
- **Voice Responses**: Hear responses spoken aloud (Text-to-Speech)
- **Visual Indicators**: Animated arrows and highlights point to relevant elements
- **WCAG Aligned**: Designed with accessibility principles at its core

## Quick Start

### Installation (Developer Mode)

1. **Download/Clone** this repository to your local machine

2. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Or: Menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the `web-guide-extension` folder

5. **Pin the Extension** (Optional)
   - Click the puzzle piece icon in Chrome toolbar
   - Pin "Web Guide" for easy access

### Configuration

Edit `config.js` to customize the extension:

```javascript
const CONFIG = {
    // Your Gemini API Key
    GEMINI_API_KEY: 'your-api-key-here',
    
    // Feature toggles
    FEATURES: {
        VOICE_INPUT: true,      // Speech-to-text
        VOICE_OUTPUT: true,     // Text-to-speech
        VISUAL_ARROWS: true,    // Show arrow indicators
    },
    
    // Voice settings
    VOICE: {
        LANGUAGE: 'en-US',
        SPEECH_RATE: 1.0,
    }
};
```

## Usage

### Basic Commands

| Action | How to Trigger |
|--------|----------------|
| Summarize page | Click "Summarize" button |
| Get guidance | Click "Guide Me" button |
| Voice command | Click microphone, speak naturally |
| Quick actions | Click any chip (e.g., "Where am I?") |

### Voice Commands Examples

- "Where am I?"
- "What is this page about?"
- "What can I do here?"
- "Take me to checkout"
- "Find the search bar"
- "Show me the menu"
- "I want to log in"

### Visual Guidance

When the extension identifies a relevant element:
1. The page scrolls to bring the element into view
2. An animated arrow points to the element
3. A tooltip describes what the element is
4. A pulsing highlight draws attention

Click anywhere to dismiss the highlight.

## Project Structure

```
web-guide-extension/
├── manifest.json      # Chrome extension configuration
├── config.js          # API keys and settings (EDIT THIS)
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic + voice commands
├── content.js         # Page analysis + visual guidance
├── content.css        # Arrow animations + highlight styles
├── background.js      # Service worker for lifecycle
├── icons/             # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # This file
```

## Architecture

### Feature-First Design

The codebase is organized by feature for easy extension:

```javascript
// content.js
const PageExtractor = { ... }  // Page content extraction
const VisualGuide = { ... }    // Visual guidance system

// popup.js
// Voice recognition, TTS, Gemini API integration
```

### Extending the Extension

**Adding new visual guidance styles:**
```javascript
// In content.js, extend VisualGuide object
VisualGuide.showAnimatedPath = function(elements) {
    // Your animated path implementation
};
```

**Adding new voice commands:**
```javascript
// In popup.js, extend processVoiceCommand()
if (lowerTranscript.includes('your-trigger')) {
    await processCommand('your-action');
}
```

## API Reference

### Gemini API Integration

The extension uses Google's Gemini API for:
- Page content analysis
- Natural language understanding
- Navigation guidance generation

**Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`

### Chrome APIs Used

| API | Purpose |
|-----|---------|
| `chrome.tabs` | Access active tab information |
| `chrome.scripting` | Inject content scripts |
| `chrome.storage` | Persist settings |
| `chrome.runtime` | Message passing |

### Web APIs Used

| API | Purpose |
|-----|---------|
| `SpeechRecognition` | Voice command input |
| `SpeechSynthesis` | Voice response output |
| `Fetch API` | Gemini API calls |

## Troubleshooting

### Common Issues

**"Speech recognition not supported"**
- Use Chrome browser (not Firefox/Safari)
- Ensure microphone permissions are granted

**"Could not access page content"**
- Refresh the page after installing extension
- Some pages (chrome://, file://) have restrictions

**"API request failed"**
- Check your API key in `config.js`
- Verify internet connection
- Check Gemini API quota

**Highlight not appearing**
- Element may be dynamically loaded
- Try the command again after page fully loads

### Debug Mode

Open Chrome DevTools (F12) and check:
- **Console**: For error messages
- **Network**: For API call status
- **Application → Extensions**: For extension state

## Security Notes

⚠️ **Important**: The current implementation stores the API key in plain text in `config.js`. For production:

1. Use a backend proxy to hide API keys
2. Implement Chrome's `storage.sync` for user-specific keys
3. Never commit API keys to public repositories

## WCAG Alignment

This extension supports WCAG 2.1 guidelines:

| Principle | Implementation |
|-----------|----------------|
| **Perceivable** | Visual + audio feedback |
| **Operable** | Voice + click interaction |
| **Understandable** | Plain language summaries |
| **Robust** | Works across websites |

Specific guidelines addressed:
- 2.4.1 Bypass Blocks
- 2.4.2 Page Titled
- 2.4.4 Link Purpose
- 2.4.8 Location
- 3.1.5 Reading Level

## License

MIT License - Feel free to modify and distribute.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

**Built with accessibility in mind** 🌐