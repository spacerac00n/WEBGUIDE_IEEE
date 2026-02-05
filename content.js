/**
 * Web Guide Extension - Content Script
 * 
 * Runs on every webpage to:
 * 1. Extract page content for analysis
 * 2. Display visual guidance (arrows, highlights)
 * 3. Handle element interactions
 * 
 * Architecture: Feature-first, easily extensible
 */

// ============================================
// FEATURE: PAGE CONTENT EXTRACTION
// ============================================
const PageExtractor = {
    /**
     * Extract comprehensive page data for AI analysis
     */
    getPageContent() {
        return {
            url: window.location.href,
            title: document.title,
            textContent: this.getMainTextContent(),
            interactiveElements: this.getInteractiveElements(),
            navigationLinks: this.getNavigationLinks(),
            headings: this.getHeadings(),
            forms: this.getForms(),
            landmarks: this.getLandmarks(),
        };
    },

    /**
     * Get main text content, prioritizing meaningful content
     */
    getMainTextContent() {
        // Try to find main content area
        const mainSelectors = ['main', 'article', '[role="main"]', '#content', '.content', '#main'];
        let mainElement = null;
        
        for (const selector of mainSelectors) {
            mainElement = document.querySelector(selector);
            if (mainElement) break;
        }
        
        // Fall back to body if no main content found
        const contentElement = mainElement || document.body;
        
        // Clone and clean the content
        const clone = contentElement.cloneNode(true);
        
        // Remove script, style, and hidden elements
        const removeSelectors = 'script, style, noscript, iframe, [hidden], [aria-hidden="true"]';
        clone.querySelectorAll(removeSelectors).forEach(el => el.remove());
        
        // Get text and clean up whitespace
        return clone.textContent
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 5000); // Limit for API
    },

    /**
     * Get interactive elements (buttons, links, inputs)
     */
    getInteractiveElements() {
        const elements = [];
        const selectors = 'button, a[href], input, select, textarea, [role="button"], [onclick], [tabindex="0"]';
        
        document.querySelectorAll(selectors).forEach((el, index) => {
            if (index >= 50) return; // Limit to 50 elements
            if (!this.isVisible(el)) return;
            
            const rect = el.getBoundingClientRect();
            elements.push({
                tag: el.tagName.toLowerCase(),
                type: el.type || null,
                text: this.getElementText(el),
                ariaLabel: el.getAttribute('aria-label'),
                id: el.id || null,
                className: el.className?.toString().substring(0, 100) || null,
                href: el.href || null,
                selector: this.generateSelector(el),
                position: {
                    top: Math.round(rect.top),
                    left: Math.round(rect.left),
                },
            });
        });
        
        return elements;
    },

    /**
     * Get navigation links
     */
    getNavigationLinks() {
        const links = [];
        const navSelectors = 'nav a, header a, [role="navigation"] a, .nav a, .menu a, .navbar a';
        
        document.querySelectorAll(navSelectors).forEach((el, index) => {
            if (index >= 20) return;
            if (!this.isVisible(el)) return;
            
            links.push({
                text: this.getElementText(el),
                href: el.href,
                selector: this.generateSelector(el),
            });
        });
        
        return links;
    },

    /**
     * Get page headings for structure
     */
    getHeadings() {
        const headings = [];
        document.querySelectorAll('h1, h2, h3').forEach((el, index) => {
            if (index >= 15) return;
            headings.push({
                level: parseInt(el.tagName[1]),
                text: el.textContent.trim().substring(0, 100),
            });
        });
        return headings;
    },

    /**
     * Get form information
     */
    getForms() {
        const forms = [];
        document.querySelectorAll('form').forEach((form, index) => {
            if (index >= 5) return;
            
            const inputs = Array.from(form.querySelectorAll('input, select, textarea'))
                .slice(0, 10)
                .map(input => ({
                    type: input.type || input.tagName.toLowerCase(),
                    name: input.name || input.id,
                    placeholder: input.placeholder,
                    label: this.getInputLabel(input),
                }));
            
            forms.push({
                id: form.id,
                action: form.action,
                inputs: inputs,
            });
        });
        return forms;
    },

    /**
     * Get ARIA landmarks
     */
    getLandmarks() {
        const landmarks = [];
        const roles = ['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'search'];
        
        roles.forEach(role => {
            const el = document.querySelector(`[role="${role}"]`) || 
                       document.querySelector(role === 'banner' ? 'header' : 
                                             role === 'navigation' ? 'nav' :
                                             role === 'main' ? 'main' :
                                             role === 'complementary' ? 'aside' :
                                             role === 'contentinfo' ? 'footer' : null);
            if (el) {
                landmarks.push({
                    role: role,
                    label: el.getAttribute('aria-label') || null,
                });
            }
        });
        return landmarks;
    },

    /**
     * Helper: Check if element is visible
     */
    isVisible(el) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               rect.width > 0 && 
               rect.height > 0;
    },

    /**
     * Helper: Get element text content
     */
    getElementText(el) {
        return (el.textContent || el.value || el.getAttribute('aria-label') || el.title || '')
            .trim()
            .substring(0, 100);
    },

    /**
     * Helper: Get label for input element
     */
    getInputLabel(input) {
        // Check for associated label
        if (input.id) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label) return label.textContent.trim();
        }
        
        // Check for parent label
        const parentLabel = input.closest('label');
        if (parentLabel) return parentLabel.textContent.trim();
        
        // Check for aria-label
        return input.getAttribute('aria-label') || input.placeholder || null;
    },

    /**
     * Helper: Generate a CSS selector for an element
     */
    generateSelector(el) {
        // Try ID first
        if (el.id) {
            return `#${CSS.escape(el.id)}`;
        }
        
        // Try unique class combination
        if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\s+/).slice(0, 2);
            if (classes.length > 0) {
                const selector = `${el.tagName.toLowerCase()}.${classes.map(c => CSS.escape(c)).join('.')}`;
                if (document.querySelectorAll(selector).length === 1) {
                    return selector;
                }
            }
        }
        
        // Try data attributes
        for (const attr of el.attributes) {
            if (attr.name.startsWith('data-') && attr.value) {
                const selector = `${el.tagName.toLowerCase()}[${attr.name}="${CSS.escape(attr.value)}"]`;
                if (document.querySelectorAll(selector).length === 1) {
                    return selector;
                }
            }
        }
        
        // Fall back to nth-child
        const parent = el.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(el) + 1;
            const parentSelector = this.generateSelector(parent);
            return `${parentSelector} > ${el.tagName.toLowerCase()}:nth-child(${index})`;
        }
        
        return el.tagName.toLowerCase();
    }
};

// ============================================
// FEATURE: VISUAL GUIDANCE SYSTEM
// ============================================
const VisualGuide = {
    currentHighlight: null,
    currentArrow: null,
    currentTooltip: null,
    currentTargetElement: null,
    currentDescription: '',
    currentIsInteractive: true,
    currentArrowSide: 'top',
    dismissHandler: null,
    viewportHandler: null,
    pendingFrame: null,

    /**
     * Highlight an element with arrow and tooltip
     */
    highlightElement(selector, description) {
        // Clear previous highlights
        this.clearHighlights();
        
        // Find the element
        let element = null;
        
        // Try the provided selector
        try {
            element = document.querySelector(selector);
        } catch (e) {
            console.warn('Invalid selector:', selector);
        }
        
        // If not found, try to find by text content
        if (!element && description) {
            element = this.findElementByDescription(description);
        }
        
        if (!element) {
            console.warn('Element not found:', selector);
            return false;
        }

        // If this points to inner text/wrapper, snap to the best actionable target
        // so clickable actions always get a clear bounding box.
        const actionableTarget = this.getActionableElement(element);
        if (actionableTarget) {
            element = actionableTarget;
        }

        this.currentTargetElement = element;
        this.currentDescription = description || '';
        
        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        const isInteractive = this.isInteractiveElement(element);
        this.currentIsInteractive = isInteractive;

        // Wait for scroll to complete
        setTimeout(() => {
            this.createHighlight(isInteractive);
            this.createArrow(isInteractive);
            this.createTooltip(description);
            this.updateGuidePositions();
            this.enableViewportTracking();
        }, 300);
        
        return true;
    },

    /**
     * Find element by description text
     */
    findElementByDescription(description) {
        const lowerDesc = description.toLowerCase();
        const selectors = 'button, a, input, select, textarea, [role="button"], [role="link"], [aria-label], h1, h2, h3, h4, [role="heading"], p, li, section, article, main, nav, [role="main"], [role="navigation"]';
        let bestMatch = null;
        let bestScore = 0;
        let checked = 0;

        for (const el of document.querySelectorAll(selectors)) {
            if (checked++ > 700) break;
            if (!PageExtractor.isVisible(el)) continue;

            const text = (el.textContent || el.value || el.getAttribute('aria-label') || el.title || '')
                .trim()
                .toLowerCase();

            if (!text || text.length < 2) continue;

            let score = 0;
            if (text === lowerDesc) score += 120;
            if (text.includes(lowerDesc)) score += 90;
            if (lowerDesc.includes(text)) score += 60;

            const descTokens = lowerDesc.split(/\s+/).filter(Boolean);
            const tokenMatches = descTokens.filter(token => text.includes(token)).length;
            score += tokenMatches * 10;

            if (this.isInteractiveElement(el)) score += 25;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = el;
            }
        }

        if (bestScore >= 20) {
            return bestMatch;
        }

        return null;
    },

    /**
     * Determine whether target is directly actionable
     */
    isInteractiveElement(element) {
        if (!element) return false;
        const selectors = 'button, a[href], input, select, textarea, summary, [role="button"], [role="link"], [onclick], [tabindex]:not([tabindex="-1"]), [data-action], [aria-pressed], [aria-expanded], [contenteditable="true"]';
        if (element.matches(selectors)) return true;
        if (this.hasPointerCue(element)) return true;
        return false;
    },

    /**
     * Heuristic: element looks clickable even without semantic button/link markup.
     */
    hasPointerCue(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (style.cursor !== 'pointer') return false;
        if (style.pointerEvents === 'none') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 6 && rect.height > 6;
    },

    /**
     * Resolve to the best actionable target around a candidate node.
     */
    getActionableElement(element) {
        if (!element) return null;

        const actionableSelector =
            'button, a[href], input, select, textarea, summary, [role="button"], [role="link"], [onclick], [tabindex]:not([tabindex="-1"]), [data-action], [aria-pressed], [aria-expanded], [contenteditable="true"]';

        if (this.isInteractiveElement(element) && PageExtractor.isVisible(element)) {
            return element;
        }

        const closestActionable = element.closest(actionableSelector);
        if (closestActionable && PageExtractor.isVisible(closestActionable)) {
            return closestActionable;
        }

        const descendants = Array.from(element.querySelectorAll(actionableSelector));
        for (const candidate of descendants) {
            if (PageExtractor.isVisible(candidate)) {
                return candidate;
            }
        }

        // Last fallback for JS-driven clickable containers.
        let current = element;
        for (let i = 0; i < 4 && current; i += 1) {
            if (this.hasPointerCue(current) && PageExtractor.isVisible(current)) {
                return current;
            }
            current = current.parentElement;
        }

        return null;
    },

    /**
     * Create highlight overlay on element
     */
    createHighlight(isInteractive = true) {
        const highlight = document.createElement('div');
        highlight.className = `webguide-highlight${isInteractive ? '' : ' scan-target'}`;
        highlight.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 0;
            height: 0;
            pointer-events: none;
            z-index: 2147483646;
        `;
        
        document.body.appendChild(highlight);
        this.currentHighlight = highlight;
        
        // Add click listener to dismiss
        this.dismissHandler = () => {
            this.clearHighlights();
            document.removeEventListener('click', this.dismissHandler);
        };
        setTimeout(() => {
            document.addEventListener('click', this.dismissHandler);
        }, 500);
    },

    /**
     * Create arrow pointing to element
     */
    createArrow(isInteractive = true) {
        const arrow = document.createElement('div');
        arrow.className = `webguide-arrow${isInteractive ? '' : ' scan-target'}`;
        arrow.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            z-index: 2147483647;
            pointer-events: none;
        `;
        
        this.setArrowVisual(arrow, 'top', isInteractive);
        
        document.body.appendChild(arrow);
        this.currentArrow = arrow;
    },

    /**
     * Update arrow SVG based on side placement
     */
    setArrowVisual(arrow, side, isInteractive) {
        const strokeColor = isInteractive ? '#4f6bff' : '#ff8a00';
        if (side === 'left') {
            arrow.innerHTML = `
                <svg width="150" height="120" viewBox="0 0 150 120">
                    <path d="M8 60 L122 60 M102 38 L122 60 L102 82"
                          stroke="${strokeColor}"
                          stroke-width="10"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          fill="none"/>
                </svg>
            `;
            return;
        }

        if (side === 'right') {
            arrow.innerHTML = `
                <svg width="150" height="120" viewBox="0 0 150 120">
                    <path d="M142 60 L28 60 M48 38 L28 60 L48 82"
                          stroke="${strokeColor}"
                          stroke-width="10"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          fill="none"/>
                </svg>
            `;
            return;
        }

        arrow.innerHTML = `
            <svg width="120" height="150" viewBox="0 0 120 150">
                <path d="M60 8 L60 122 M38 100 L60 122 L82 100"
                      stroke="${strokeColor}"
                      stroke-width="10"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      fill="none"/>
            </svg>
        `;
    },

    /**
     * Create tooltip with description
     */
    createTooltip(description) {
        if (!description) return;

        const tooltip = document.createElement('div');
        tooltip.className = 'webguide-tooltip';
        tooltip.textContent = description;
        tooltip.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            z-index: 2147483646;
            pointer-events: none;
        `;
        
        document.body.appendChild(tooltip);
        this.currentTooltip = tooltip;
    },

    /**
     * Select arrow side to avoid overlapping tooltip area above target.
     */
    getArrowSide(rect) {
        const minSideSpace = 130;
        const spaceLeft = rect.left;
        const spaceRight = window.innerWidth - rect.right;

        if (spaceRight >= minSideSpace) return 'right';
        if (spaceLeft >= minSideSpace) return 'left';
        return 'top';
    },

    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    },

    /**
     * Reposition highlight, arrow, and tooltip to follow the target while scrolling.
     */
    updateGuidePositions() {
        if (!this.currentTargetElement || !this.currentHighlight || !this.currentArrow) return;
        if (!document.contains(this.currentTargetElement)) {
            this.clearHighlights();
            return;
        }

        const rect = this.currentTargetElement.getBoundingClientRect();
        const padding = this.currentIsInteractive ? 10 : 18;
        const highlightTop = rect.top - padding;
        const highlightLeft = rect.left - padding;

        this.currentHighlight.style.top = `${highlightTop}px`;
        this.currentHighlight.style.left = `${highlightLeft}px`;
        this.currentHighlight.style.width = `${rect.width + padding * 2}px`;
        this.currentHighlight.style.height = `${rect.height + padding * 2}px`;

        const side = this.getArrowSide(rect);
        if (side !== this.currentArrowSide) {
            this.setArrowVisual(this.currentArrow, side, this.currentIsInteractive);
            this.currentArrowSide = side;
        }

        let arrowTop = 0;
        let arrowLeft = 0;
        if (side === 'right') {
            arrowTop = rect.top + (rect.height / 2) - 60;
            arrowLeft = rect.right + 16;
        } else if (side === 'left') {
            arrowTop = rect.top + (rect.height / 2) - 60;
            arrowLeft = rect.left - 162;
        } else {
            arrowTop = rect.top - 160;
            arrowLeft = rect.left + (rect.width / 2) - 60;
        }

        this.currentArrow.style.top = `${this.clamp(arrowTop, 8, window.innerHeight - 158)}px`;
        this.currentArrow.style.left = `${this.clamp(arrowLeft, 8, window.innerWidth - 158)}px`;

        if (this.currentTooltip) {
            let tooltipTop = rect.top - 112;
            let tooltipLeft = rect.left + (rect.width / 2);
            let tooltipTransform = 'translateX(-50%)';

            if (side === 'right') {
                tooltipTop = rect.top - 82;
            } else if (side === 'left') {
                tooltipTop = rect.top - 82;
            } else if (tooltipTop < 10) {
                tooltipTop = rect.bottom + 16;
            }

            this.currentTooltip.style.top = `${this.clamp(tooltipTop, 10, window.innerHeight - 90)}px`;
            this.currentTooltip.style.left = `${this.clamp(tooltipLeft, 16, window.innerWidth - 16)}px`;
            this.currentTooltip.style.transform = tooltipTransform;
        }
    },

    handleViewportChange() {
        if (this.pendingFrame) return;
        this.pendingFrame = requestAnimationFrame(() => {
            this.pendingFrame = null;
            this.updateGuidePositions();
        });
    },

    enableViewportTracking() {
        if (!this.viewportHandler) {
            this.viewportHandler = this.handleViewportChange.bind(this);
        }
        window.addEventListener('scroll', this.viewportHandler, true);
        window.addEventListener('resize', this.viewportHandler);
    },

    /**
     * Clear all visual guides
     */
    clearHighlights() {
        if (this.pendingFrame) {
            cancelAnimationFrame(this.pendingFrame);
            this.pendingFrame = null;
        }
        if (this.viewportHandler) {
            window.removeEventListener('scroll', this.viewportHandler, true);
            window.removeEventListener('resize', this.viewportHandler);
        }
        if (this.dismissHandler) {
            document.removeEventListener('click', this.dismissHandler);
            this.dismissHandler = null;
        }
        if (this.currentHighlight) {
            this.currentHighlight.remove();
            this.currentHighlight = null;
        }
        if (this.currentArrow) {
            this.currentArrow.remove();
            this.currentArrow = null;
        }
        if (this.currentTooltip) {
            this.currentTooltip.remove();
            this.currentTooltip = null;
        }
        
        // Also remove any orphaned elements
        document.querySelectorAll('.webguide-highlight, .webguide-arrow, .webguide-tooltip')
            .forEach(el => el.remove());

        this.currentTargetElement = null;
        this.currentDescription = '';
        this.currentIsInteractive = true;
        this.currentArrowSide = 'top';
    },

    /**
     * EXTENSIBLE: Animated path guidance (placeholder for future)
     */
    showAnimatedPath(elements) {
        // TODO: Implement animated path between multiple elements
        // This is a placeholder for the feature-first extensibility
        console.log('Animated path feature - to be implemented');
        
        // For now, highlight the first element
        if (elements.length > 0) {
            this.highlightElement(elements[0].selector, elements[0].description);
        }
    }
};

// ============================================
// MESSAGE HANDLER
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'getPageContent':
            sendResponse(PageExtractor.getPageContent());
            break;
            
        case 'highlightElement':
            const success = VisualGuide.highlightElement(message.selector, message.description);
            sendResponse({ success });
            break;
            
        case 'clearHighlights':
            VisualGuide.clearHighlights();
            sendResponse({ success: true });
            break;
            
        case 'showPath':
            // Future: animated path feature
            VisualGuide.showAnimatedPath(message.elements);
            sendResponse({ success: true });
            break;
            
        default:
            sendResponse({ error: 'Unknown action' });
    }
    
    return true; // Keep channel open for async response
});

// ============================================
// INITIALIZATION
// ============================================
console.log('Web Guide content script loaded');

// Clear any existing highlights on page load
VisualGuide.clearHighlights();
