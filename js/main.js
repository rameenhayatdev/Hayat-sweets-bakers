/**
 * ============================================================================
 * Hayat Sweets & Bakers — Application Controller (main.js)
 * ============================================================================
 * This file is the single entry point that boots the website.
 *
 * It does NOT implement cursor, animation, or menu behavior — those live in
 * cursor.js, animations.js, and menu.js respectively. main.js is responsible
 * for sequencing, shared configuration, shared utilities, global events,
 * lifecycle management, and loose coordination between modules via custom
 * events.
 *
 * Module contract (soft dependency — each check is defensive):
 *   - window.HSBMenu       → { init(), destroy(), close() }        (menu.js)
 *   - window.HSBAnimations → { refresh(), destroy(), setButtonState() } (animations.js)
 *   - cursor.js             → self-initializing, no public API required
 *
 * Author: Lead Frontend Architecture
 * ============================================================================
 */

(() => {
  'use strict';

  /* ==========================================================================
     Configuration
     ========================================================================== */

  const CONFIG = {
    debug: false,

    scroll: {
      offset: 80, // fixed header height, used by smoothScrollTo
      backToTopThreshold: 400,
      throttleMs: 16
    },

    resize: {
      debounceMs: 200
    },

    breakpoints: {
      mobile: 480,
      tablet: 768,
      desktop: 1024,
      wide: 1280
    },

    features: {
      cursor: true,
      animations: true,
      menu: true,
      backToTop: true
    },

    selectors: {
      backToTop: '[data-back-to-top]',
      smoothScrollLinks: 'a[href^="#"]:not([href="#"])',
      skipLink: '[data-skip-link]',
      body: 'body'
    }
  };

  /* ==========================================================================
     Constants
     ========================================================================== */

  const EVENTS = {
    READY: 'hsb:ready',
    RESIZE_END: 'hsb:resizeEnd',
    BREAKPOINT_CHANGE: 'hsb:breakpointChange',
    VISIBILITY_VISIBLE: 'hsb:visible',
    VISIBILITY_HIDDEN: 'hsb:hidden',
    DESTROY: 'hsb:destroy'
  };

  const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

  /* ==========================================================================
     Application State
     ========================================================================== */

  const state = {
    isInitialized: false,
    isReducedMotion: false,
    currentBreakpoint: null,
    isPageVisible: !document.hidden,
    modules: {
      menu: false,
      cursor: false,
      animations: false
    }
  };

  /* ==========================================================================
     DOM Cache
     ========================================================================== */

  const dom = {};

  function cacheDOM() {
    dom.body = document.querySelector(CONFIG.selectors.body);
    dom.backToTopBtn = document.querySelector(CONFIG.selectors.backToTop);
    dom.smoothScrollLinks = Array.from(
      document.querySelectorAll(CONFIG.selectors.smoothScrollLinks)
    );
    dom.skipLink = document.querySelector(CONFIG.selectors.skipLink);
  }

  /* ==========================================================================
     Logging Utilities
     ========================================================================== */

  const logger = {
    info: (...args) => {
      if (CONFIG.debug) console.info('[HSB]', ...args);
    },
    warn: (...args) => {
      if (CONFIG.debug) console.warn('[HSB]', ...args);
    },
    error: (...args) => {
      // Errors always surface, regardless of debug mode.
      console.error('[HSB]', ...args);
    }
  };

  /* ==========================================================================
     Utility Functions
     ========================================================================== */

  const utils = {
    select: (selector, scope = document) => scope?.querySelector(selector) ?? null,

    selectAll: (selector, scope = document) =>
      Array.from(scope?.querySelectorAll(selector) ?? []),

    clamp: (value, min, max) => Math.min(Math.max(value, min), max),

    random: (min, max) => Math.random() * (max - min) + min,

    debounce(fn, delay) {
      let timerId = null;
      return (...args) => {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn(...args), delay);
      };
    },

    throttleRAF(fn) {
      let ticking = false;
      return (...args) => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          fn(...args);
          ticking = false;
        });
      };
    },

    isInViewport(el, offset = 0) {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return (
        rect.top <= window.innerHeight - offset &&
        rect.bottom >= offset
      );
    },

    getBreakpoint(width = window.innerWidth) {
      const { mobile, tablet, desktop } = CONFIG.breakpoints;
      if (width < mobile) return 'xs';
      if (width < tablet) return 'mobile';
      if (width < desktop) return 'tablet';
      return 'desktop';
    },

    isTouchDevice: () =>
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches,

    smoothScrollTo(target, offset = CONFIG.scroll.offset) {
      const el = typeof target === 'string' ? utils.select(target) : target;
      if (!el) {
        logger.warn(`smoothScrollTo: target not found →`, target);
        return;
      }

      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({
        top,
        behavior: state.isReducedMotion ? 'auto' : 'smooth'
      });
    },

    emit(eventName, detail = {}) {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
    },

    safeInvoke(fn, ...args) {
      if (typeof fn !== 'function') return undefined;
      try {
        return fn(...args);
      } catch (err) {
        logger.error('safeInvoke failed:', err);
        return undefined;
      }
    }
  };

  /* ==========================================================================
     Event Registry (centralized cleanup)
     ========================================================================== */

  const listenerRegistry = [];

  function on(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    listenerRegistry.push({ target, type, handler, options });
  }

  /* ==========================================================================
     Browser Compatibility Checks
     ========================================================================== */

  function checkBrowserSupport() {
    const required = {
      IntersectionObserver: 'IntersectionObserver' in window,
      requestAnimationFrame: 'requestAnimationFrame' in window,
      CustomEvent: 'CustomEvent' in window,
      classList: 'classList' in document.documentElement
    };

    const unsupported = Object.entries(required)
      .filter(([, isSupported]) => !isSupported)
      .map(([feature]) => feature);

    if (unsupported.length) {
      logger.warn('Unsupported browser features detected:', unsupported);
      dom.body?.classList.add('hsb-legacy-browser');
      return false;
    }

    return true;
  }

  /* ==========================================================================
     Module Coordination — Menu / Cursor / Animations
     ========================================================================== */

  function initMenu() {
    if (!CONFIG.features.menu) return;

    if (window.HSBMenu?.init) {
      utils.safeInvoke(window.HSBMenu.init);
      state.modules.menu = true;
      logger.info('Menu module initialized.');
    } else {
      // menu.js may be self-initializing (IIFE on DOMContentLoaded), which
      // is a valid pattern — absence of a public API is not an error.
      logger.info('Menu module has no public init() — assuming self-initialized.');
    }
  }

  function initCursor() {
    if (!CONFIG.features.cursor) return;
    if (state.isReducedMotion || utils.isTouchDevice()) {
      logger.info('Cursor module skipped (reduced motion or touch device).');
      return;
    }

    // cursor.js self-initializes on load; nothing to invoke here.
    // Marked as active so downstream systems know the custom cursor is live.
    state.modules.cursor = true;
    dom.body?.classList.add('has-custom-cursor');
  }

  function initAnimations() {
    if (!CONFIG.features.animations) return;

    if (window.HSBAnimations?.refresh) {
      // animations.js self-initializes on load; refresh() re-syncs it with
      // any DOM changes that happened before main.js finished booting.
      utils.safeInvoke(window.HSBAnimations.refresh);
    }

    state.modules.animations = true;
    logger.info('Animations module coordinated.');
  }

  /* ==========================================================================
     Back To Top Component
     ========================================================================== */

  function initBackToTop() {
    if (!CONFIG.features.backToTop || !dom.backToTopBtn) return;

    const updateVisibility = utils.throttleRAF(() => {
      const shouldShow = window.scrollY > CONFIG.scroll.backToTopThreshold;
      dom.backToTopBtn.classList.toggle('is-visible', shouldShow);
      dom.backToTopBtn.setAttribute('aria-hidden', String(!shouldShow));
    });

    on(window, 'scroll', updateVisibility, { passive: true });

    on(dom.backToTopBtn, 'click', (event) => {
      event.preventDefault();
      utils.smoothScrollTo(document.body, 0);
      // Return focus to the top for keyboard/screen-reader users.
      dom.skipLink?.focus?.();
    });

    updateVisibility();
  }

  /* ==========================================================================
     Smooth Scroll Links
     ========================================================================== */

  function initSmoothScrollLinks() {
    if (!dom.smoothScrollLinks.length) return;

    dom.smoothScrollLinks.forEach((link) => {
      on(link, 'click', (event) => {
        const targetId = link.getAttribute('href');
        const targetEl = utils.select(targetId);
        if (!targetEl) return;

        event.preventDefault();
        utils.smoothScrollTo(targetEl);

        // Move focus for accessibility once the scroll settles.
        targetEl.setAttribute('tabindex', '-1');
        targetEl.focus({ preventScroll: true });
      });
    });
  }

  /* ==========================================================================
     Global Events — Resize
     ========================================================================== */

  function handleResize() {
    const newBreakpoint = utils.getBreakpoint();

    if (newBreakpoint !== state.currentBreakpoint) {
      const previous = state.currentBreakpoint;
      state.currentBreakpoint = newBreakpoint;
      utils.emit(EVENTS.BREAKPOINT_CHANGE, { previous, current: newBreakpoint });
      logger.info(`Breakpoint changed: ${previous} → ${newBreakpoint}`);
    }

    utils.emit(EVENTS.RESIZE_END, {
      width: window.innerWidth,
      height: window.innerHeight
    });
  }

  function initResizeHandler() {
    const debounced = utils.debounce(handleResize, CONFIG.resize.debounceMs);
    on(window, 'resize', debounced, { passive: true });
    on(window, 'orientationchange', debounced, { passive: true });

    // Set initial breakpoint without waiting for a resize event.
    state.currentBreakpoint = utils.getBreakpoint();
  }

  /* ==========================================================================
     Page Visibility Handling
     ========================================================================== */

  function handleVisibilityChange() {
    state.isPageVisible = !document.hidden;

    if (state.isPageVisible) {
      utils.emit(EVENTS.VISIBILITY_VISIBLE);
      logger.info('Page became visible.');
    } else {
      utils.emit(EVENTS.VISIBILITY_HIDDEN);
      logger.info('Page became hidden.');
    }
  }

  function initVisibilityHandler() {
    on(document, 'visibilitychange', handleVisibilityChange, { passive: true });
  }

  /* ==========================================================================
     Accessibility Enhancements
     ========================================================================== */

  function initReducedMotionWatcher() {
    const query = window.matchMedia(REDUCE_MOTION_QUERY);
    state.isReducedMotion = query.matches;
    dom.body?.classList.toggle('reduce-motion', state.isReducedMotion);

    const handler = (event) => {
      state.isReducedMotion = event.matches;
      dom.body?.classList.toggle('reduce-motion', state.isReducedMotion);
      logger.info(`Reduced motion preference changed: ${state.isReducedMotion}`);
    };

    if (query.addEventListener) {
      query.addEventListener('change', handler);
      listenerRegistry.push({ target: query, type: 'change', handler, options: undefined });
    }
  }

  function initKeyboardNavigationDetection() {
    // Adds a class only when the user is navigating via keyboard, so focus
    // outlines can be styled distinctly from mouse-driven interactions
    // without removing them entirely (a common accessibility regression).
    const onFirstTab = (event) => {
      if (event.key === 'Tab') {
        dom.body?.classList.add('user-is-tabbing');
        window.removeEventListener('keydown', onFirstTab);
        on(window, 'mousedown', onMouseDownAfterTab, { passive: true });
      }
    };

    function onMouseDownAfterTab() {
      dom.body?.classList.remove('user-is-tabbing');
      window.removeEventListener('mousedown', onMouseDownAfterTab);
      on(window, 'keydown', onFirstTab, { passive: true });
    }

    on(window, 'keydown', onFirstTab, { passive: true });
  }

  function initSkipLink() {
    if (!dom.skipLink) return;
    // Ensure the skip link's target is programmatically focusable.
    const targetId = dom.skipLink.getAttribute('href');
    const targetEl = targetId ? utils.select(targetId) : null;
    if (targetEl && !targetEl.hasAttribute('tabindex')) {
      targetEl.setAttribute('tabindex', '-1');
    }
  }

  /* ==========================================================================
     Lifecycle — Boot Sequence
     ========================================================================== */

  function bootWebsite() {
    try {
      cacheDOM();
      checkBrowserSupport();

      initReducedMotionWatcher();
      initResizeHandler();
      initVisibilityHandler();
      initKeyboardNavigationDetection();
      initSkipLink();

      initMenu();
      initCursor();
      initAnimations();

      initBackToTop();
      initSmoothScrollLinks();

      state.isInitialized = true;
      utils.emit(EVENTS.READY, { modules: { ...state.modules } });
      logger.info('Hayat Sweets & Bakers website initialized.', state);
    } catch (err) {
      logger.error('Fatal error during boot sequence:', err);
      // Fail gracefully — native browser behavior remains fully functional
      // even if enhancement layers failed to initialize.
    }
  }

  /* ==========================================================================
     Cleanup System
     ========================================================================== */

  function destroy() {
    listenerRegistry.forEach(({ target, type, handler, options }) => {
      target.removeEventListener(type, handler, options);
    });
    listenerRegistry.length = 0;

    utils.safeInvoke(window.HSBAnimations?.destroy);
    utils.safeInvoke(window.HSBMenu?.destroy);

    utils.emit(EVENTS.DESTROY);
    state.isInitialized = false;
    logger.info('Website teardown complete.');
  }

  /* ==========================================================================
     DOM Ready / Window Load Handlers
     ========================================================================== */

  function onDOMReady() {
    bootWebsite();
  }

  function onWindowLoad() {
    // Reserved for below-the-fold or non-critical enhancements that should
    // wait until all assets (images, fonts, etc.) have finished loading.
    utils.emit('hsb:windowLoaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDOMReady, { once: true });
  } else {
    onDOMReady();
  }

  window.addEventListener('load', onWindowLoad, { once: true });
  window.addEventListener('beforeunload', destroy, { once: true });

  /* ==========================================================================
     Public API
     ========================================================================== */

  window.HSB = {
    config: CONFIG,
    events: EVENTS,
    state,
    utils,
    destroy,
    refresh: () => {
      destroy();
      bootWebsite();
    }
  };
})();