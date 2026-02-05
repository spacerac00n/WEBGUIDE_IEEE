# Web Guide Chrome Extension: Technical Report

**Project:** Web Guide - Accessibility-Focused Web Navigator
**Author:** Manus AI
**Date:** February 05, 2026

---

## 1. Introduction

This document provides a technical overview of the **Web Guide** Chrome extension, a project designed to enhance web accessibility. The extension functions as a "virtual tour guide," summarizing web pages, providing navigation guidance, and responding to user voice commands. Its primary goal is to assist users who may struggle with complex web layouts or have difficulty finding information, directly addressing core principles of the Web Content Accessibility Guidelines (WCAG) [1].

This report details the extension's architecture, setup procedures, and key code implementation points. It is intended for a technical audience, such as a senior engineer, to review the project's design, functionality, and extensibility.

## 2. System Architecture

The Web Guide extension is built on a standard, event-driven Chrome extension architecture. It consists of three main client-side components and one external service, which communicate via message passing and API calls.

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Popup Script** (`popup.js`) | JavaScript | Manages the user interface, handles voice input (SpeechRecognition) and output (SpeechSynthesis), and orchestrates API calls. |
| **Content Script** (`content.js`) | JavaScript | Injected into web pages to extract content, analyze the DOM, and render visual guidance (highlights and arrows). |
| **Background Script** (`background.js`) | JavaScript | A service worker that manages the extension's lifecycle, settings storage, and future features like context menus. |
| **Gemini API** | Google AI | Provides the core intelligence for page summarization, natural language understanding of voice commands, and identifying target elements. |

### Architectural Diagram

```mermaid
graph TD
    subgraph User Interface
        A[Popup UI - popup.html] <--> B(Popup Script - popup.js);
    end

    subgraph Web Page
        C(Content Script - content.js);
    end

    subgraph Browser
        D(Background Script - background.js);
        E[Chrome APIs - Storage, Tabs, Scripting];
    end

    subgraph External Services
        F[Google Gemini API];
    end

    B -- 1. Get Page Content --> C;
    C -- 2. Return Page Data --> B;
    B -- 3. Send Prompt --> F;
    F -- 4. Return Summary/Guidance --> B;
    B -- 5. Highlight Element --> C;
    C -- 6. Render Arrow/Highlight --> Web Page;
    B <--> D; 
    D <--> E;
```
*Figure 1: High-level architecture of the Web Guide extension, showing the flow of communication between components.* 

## 3. Setup and Deployment

The extension is designed for straightforward local deployment using Chrome's developer mode. No compilation or build tools are required.

### Step-by-Step Installation

1.  **Obtain Source Code**: The complete source code is provided in the `web-guide-extension.zip` archive.

2.  **Configure API Key**: Before loading, the Gemini API key must be set. 
    > **Important Note**: The API key is stored in plain text within `config.js`. This is suitable for demonstration purposes only. For production, a secure backend proxy should be used to protect the key.
    -   Open `web-guide-extension/config.js`.
    -   Replace the placeholder `'your-api-key-here'` with a valid Gemini API key.

3.  **Load the Extension in Chrome**:
    -   Open the Chrome browser and navigate to `chrome://extensions`.
    -   Enable **Developer mode** using the toggle in the top-right corner.
    -   Click the **"Load unpacked"** button.
    -   Select the entire `web-guide-extension` directory.

4.  **Verify Installation**: The Web Guide icon (a compass symbol) will appear in the Chrome toolbar. It is recommended to "pin" the extension for easy access.

## 4. Code Walkthrough

This section highlights key aspects of the source code, focusing on design choices and functionality.

### `manifest.json` - The Extension's Blueprint

The manifest file defines the extension's capabilities and permissions. Key configurations include:

-   **`"manifest_version": 3`**: Specifies the modern, more secure Manifest V3 platform.
-   **`"permissions": ["activeTab", "scripting", "storage"]`**: Requests essential permissions. `activeTab` grants temporary access to the current page, `scripting` allows for injecting the content script, and `storage` is used for settings.
-   **`"host_permissions": ["<all_urls>"]`**: Allows the content script to run on any webpage, which is necessary for the extension's core function.
-   **`"content_scripts"`**: Defines that `config.js` and `content.js` are injected into pages at `document_idle`, ensuring the page is mostly loaded before the script runs.
-   **`"background": {"service_worker": "background.js"}`**: Registers the background service worker for lifecycle management.

### `config.js` - Centralized Configuration

To simplify management, all critical variables are stored in a single `config.js` file. This includes the Gemini API key and URL, feature flags, and voice/UI settings. This approach allows for quick adjustments without digging into the application logic.

```javascript
const CONFIG = {
    GEMINI_API_KEY: 'AIzaSy...', // API Key
    FEATURES: {
        VOICE_INPUT: true,      // Enable/disable speech-to-text
        VOICE_OUTPUT: true,     // Enable/disable text-to-speech
    },
    // ... other settings
};
```

### `popup.js` - The Control Center

This script is the brain of the operation. It handles user interactions from the popup and orchestrates the workflow.

-   **Voice I/O**: It utilizes the Web Speech API, with `webkitSpeechRecognition` for voice input and `speechSynthesis` for spoken responses.
-   **Command Processing**: The `processCommand` function is the entry point for all actions. It first messages the content script to get structured data from the current page. 
-   **Gemini API Integration**: The `buildPrompt` function is particularly noteworthy. It constructs a detailed prompt for the Gemini API, providing rich context about the current page (URL, title, text summary, interactive elements). This contextual prompting is crucial for receiving accurate and relevant responses. The `callGeminiAPI` function then makes the `fetch` request.
-   **Response Handling**: After receiving a response from Gemini, `handleGeminiResponse` parses the text. It uses a regular expression (`/\[HIGHLIGHT_ELEMENT\](.*?)\[\/HIGHLIGHT_ELEMENT\]/s`) to extract a JSON object containing a CSS selector for the element that needs to be highlighted. This data is then passed to the content script.

### `content.js` - The On-Page Worker

This script is responsible for all interactions with the webpage's DOM. It is designed with a **feature-first architecture**, where responsibilities are separated into distinct objects.

-   **`PageExtractor` Object**: This object is solely responsible for reading and structuring data from the DOM. It extracts not just raw text but also a semantic list of interactive elements, navigation links, and headings. Its `generateSelector` method is a key helper function that creates a stable CSS selector for any given DOM element, which is essential for reliably highlighting elements later.

-   **`VisualGuide` Object**: This object manages the rendering of all visual aids. 
    -   The `highlightElement` function receives a selector and description from the popup script. It finds the element, scrolls it into view, and then creates the arrow, tooltip, and highlight overlay.
    -   The architecture is **extensible**. A placeholder function, `showAnimatedPath`, is included to demonstrate how a more complex visual guide (like a multi-step path) could be added without refactoring existing code.

### `background.js` - The Silent Partner

The background service worker handles tasks that are not tied to a specific page or popup instance. Its current role is minimal, focusing on `onInstalled` events to set up default settings in `chrome.storage`. The structure is in place to easily add future features like keyboard shortcuts (`chrome.commands`) or context menus.

## 5. Key Implementation Notes

### Security Considerations

The most significant point of attention for a senior engineer is the handling of the API key. As implemented, the key is exposed on the client-side. **This is not secure for a production environment.** For a real-world deployment, the following change is recommended:

> Create a simple backend proxy (e.g., using Cloudflare Workers or a small Node.js server) that receives requests from the extension, attaches the API key securely on the server-side, and forwards the request to the Gemini API. The extension would call this proxy instead of the Gemini API directly.

### Extensibility and Maintainability

The code was intentionally structured to be easily extendable. The separation of concerns in `content.js` (Extractor vs. Guide) and the centralized command processing in `popup.js` mean that new features can be added with minimal disruption. For example, to add a new voice command, a developer would only need to modify the `processVoiceCommand` logic in `popup.js` and potentially add a new prompt type in `buildPrompt`.

### Accessibility (WCAG)

The extension itself is built with accessibility in mind. The popup UI uses ARIA roles (`aria-live`, `aria-label`) and the visual guidance system directly supports users in understanding page structure and locating content, aligning with the following WCAG principles:
-   **Perceivable**: Information is presented visually (text, highlights) and audibly (text-to-speech).
-   **Operable**: The interface is navigable via voice and mouse.
-   **Understandable**: The core feature is to make web content more understandable.

## 6. Conclusion

The Web Guide extension is a functional prototype that successfully demonstrates the concept of an AI-powered accessibility guide for the web. The architecture is sound for its purpose, and the code is organized for future development.

The immediate next step before any wider deployment should be to address the API key security issue by implementing a backend proxy. Following that, the feature-first design provides a solid foundation for adding more advanced guidance features, such as multi-step animated paths or form-filling assistance.

---

### References

[1] W3C. (2018). *Web Content Accessibility Guidelines (WCAG) 2.1*. [https://www.w3.org/TR/WCAG21/](https://www.w3.org/TR/WCAG21/)
