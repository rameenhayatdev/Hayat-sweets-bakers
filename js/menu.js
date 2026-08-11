
                              /**
 * ============================================================================
 * HAYAT SWEETS & BAKERS — menu.js
 * ============================================================================
 *
 * Navigation Engine — single source of truth for everything navigation.
 *
 * Responsibilities
 *   • Desktop + mobile navigation lifecycle
 *   • Injected, animated hamburger disclosure button
 *   • Off-canvas drawer with overlay, scroll lock and focus management
 *   • Sticky header: scrolled state, glass transition, hide/show on scroll
 *   • Scroll-spy with aria-current synchronisation
 *   • Smooth anchor scrolling with header offset compensation
 *   • Full keyboard support: Tab trap, Escape, arrow-key roving
 *   • Reduced-motion awareness, resize/orientation resilience
 *
 * Out of scope (owned by sibling modules)
 *   • main.js        → bootstrapping, html.js class, global utilities
 *   • animations.js  → reveal observers, cursor-follow motion
 *   • cursor.js      → custom cursor behaviour
 *
 * CSS contracts honoured (see responsive.css / animations.css)
 *   • .nav-toggle        — disclosure button (created here if absent)
 *   • .is-open           — toggled on #primary-navigation
 *   • .is-scrolled       — toggled on #site-header
 *   • aria-current="page"— styled by style.css on .nav-link
 *
 * The module is defensive: every DOM dependency is validated, every listener
 * is registered through a central registry, and destroy() restores the page
 * to its pre-initialisation state.
 * ============================================================================
 */

(() => {
  'use strict';

  /* ==========================================================================
     01. CONFIGURATION
     Single place to tune behaviour. Flip features without touching logic.
  ========================================================================== */

  const CONFIG = Object.freeze({
    debug: false,

    features: Object.freeze({
      mobileMenu: true,      // drawer + toggle system
      stickyHeader: true,    // scrolled state + glass transition
      hideOnScroll: true,    // hide scrolling down, reveal scrolling up
      transparentTop: true,  // lighter glass while resting over the hero
      scrollSpy: true,       // active section detection
      smoothScroll: true,    // intercept anchor navigation
      focusTrap: true,       // trap Tab inside the open drawer
      arrowKeys: true,       // arrow-key roving across nav links
      announcements: true,   // polite live-region routing messages
    }),

    /* Breakpoint must mirror responsive.css (TABLET PORTRAIT) */
    mobileBreakpoint: '48rem',

    /* Geometry */
    scrollOffset: 12,        // extra breathing room under the sticky header
    stickyThreshold: 24,     // px scrolled before .is-scrolled applies
    topThreshold: 8,         // px window considered "at the very top"
    hideOffset: 180,         // scroll depth where hide-on-scroll may engage
    hideDelta: 6,            // direction noise filter (px)
    drawerWidth: 'min(84vw, 21rem)',
    drawerClearance: 24,     // space kept below the header inside the drawer

    /* Timing */
    resizeDebounce: 160,
    drawerDuration: 480,
    headerDuration: 400,
    transitionEase: 'cubic-bezier(0.22, 1, 0.36, 1)',

    /* Visual tokens (referenced as CSS custom properties where possible) */
    headerGlassTop: 'rgba(255, 252, 246, 0.55)',
    headerGlassTopBorder: 'rgba(198, 156, 95, 0.12)',
    fallbackMobileWidth: 768,
  });

  /* ==========================================================================
     02. CONSTANTS
  ========================================================================== */

  const SELECTORS = Object.freeze({
    header: '#site-header',
    nav: '#primary-navigation',
    navList: '#nav-menu-list',
    navLink: '.nav-link',
    toggle: '.nav-toggle',
    section: 'main section[id]',
  });

  const CLASSES = Object.freeze({
    js: 'js',
    scrolled: 'is-scrolled',
    open: 'is-open',
    active: 'is-active',
    toggle: 'nav-toggle',
    overlay: 'nav-overlay',
    announcer: 'nav-announcer',
  });

  const KEYS = Object.freeze({
    escape: 'Escape',
    tab: 'Tab',
    arrowUp: 'ArrowUp',
    arrowDown: 'ArrowDown',
    arrowLeft: 'ArrowLeft',
    arrowRight: 'ArrowRight',
    home: 'Home',
    end: 'End',
  });

  const ARIA = Object.freeze({
    expanded: 'aria-expanded',
    controls: 'aria-controls',
    label: 'aria-label',
    current: 'aria-current',
    hidden: 'aria-hidden',
  });

  const LABELS = Object.freeze({
    openMenu: 'Open navigation menu',
    closeMenu: 'Close navigation menu',
    menuOpened: 'Navigation menu opened',
    menuClosed: 'Navigation menu closed',
    navigatedTo: 'Navigated to',
  });

  /* ==========================================================================
     03. DOM CACHE
     Every node is resolved once. Nothing is re-queried inside hot paths.
  ========================================================================== */

  const dom = {
    header: null,
    nav: null,
    navList: null,
    links: [],
    sections: [],
    toggle: null,
    overlay: null,
    announcer: null,
  };

  const cacheDom = () => {
    dom.header = document.querySelector(SELECTORS.header);
    dom.nav = document.querySelector(SELECTORS.nav);
    dom.navList = document.getElementById('nav-menu-list')
      ?? dom.nav?.querySelector('ul')
      ?? null;
    dom.links = dom.navList
      ? Array.from(dom.navList.querySelectorAll(SELECTORS.navLink))
      : [];
    dom.sections = Array.from(document.querySelectorAll(SELECTORS.section));
  };

  /* ==========================================================================
     04. APPLICATION STATE
  ========================================================================== */

  const state = {
    initialized: false,
    menuOpen: false,
    headerHidden: false,
    activeId: null,
    lastScrollY: 0,
    lastSectionId: null,
    lastFocused: null,
    toggleInjected: false,
    toggleBars: [],
    linkForSection: new Map(),
    spyObserver: null,
    resizeTimer: 0,
    savedBody: { overflow: '', paddingRight: '' },
    savedHeaderPadding: '',
  };

  /* ==========================================================================
     05. UTILITIES
  ========================================================================== */

  const log = (...args) => {
    if (CONFIG.debug) console.info('[HayatNav]', ...args);
  };

  const debounce = (fn, wait) => {
    let timerId = 0;
    const wrapped = (...args) => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => fn(...args), wait);
    };
    wrapped.cancel = () => window.clearTimeout(timerId);
    return wrapped;
  };

  const mobileQuery = window.matchMedia?.(`(max-width: ${CONFIG.mobileBreakpoint})`) ?? null;
  const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;

  const isMobile = () =>
    mobileQuery ? mobileQuery.matches : window.innerWidth <= CONFIG.fallbackMobileWidth;

  const prefersReducedMotion = () => reducedQuery?.matches ?? false;

  const getHeaderHeight = () => dom.header?.offsetHeight ?? 0;

  const getScrollTargetY = (target) => {
    const rect = target.getBoundingClientRect();
    const top = rect.top + window.scrollY - getHeaderHeight() - CONFIG.scrollOffset;
    return Math.max(top, 0);
  };

  const makeFocusable = (element) => {
    if (!element.hasAttribute('tabindex')) {
      element.setAttribute('tabindex', '-1');
    }
  };

  /* ==========================================================================
     06. EVENT MANAGEMENT
     One registry → zero orphaned listeners, trivial teardown.
  ========================================================================== */

  const createEventManager = () => {
    const registry = [];

    const bind = (target, type, handler, options) => {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler, options);
      registry.push({ target, type, handler, options });
    };

    const unbindAll = () => {
      registry.forEach(({ target, type, handler, options }) => {
        target.removeEventListener(type, handler, options);
      });
      registry.length = 0;
    };

    return { bind, unbindAll };
  };

  const events = createEventManager();

  /* ==========================================================================
     07. ACCESSIBILITY CONTROLLER
     Live-region announcements + focus helpers. Motion preferences live here
     so every controller asks one place what the user prefers.
  ========================================================================== */

  const ensureAnnouncer = () => {
    if (!CONFIG.features.announcements || dom.announcer) return;

    const announcer = document.createElement('div');
    announcer.className = CLASSES.announcer;
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.style.cssText = [
      'position:absolute',
      'width:1px',
      'height:1px',
      'padding:0',
      'margin:-1px',
      'overflow:hidden',
      'clip:rect(0 0 0 0)',
      'white-space:nowrap',
      'border:0',
    ].join(';');

    document.body.appendChild(announcer);
    dom.announcer = announcer;
  };

  const announce = (message) => {
    if (!dom.announcer || !message) return;
    dom.announcer.textContent = '';
    requestAnimationFrame(() => {
      dom.announcer.textContent = message;
    });
  };

  /* ==========================================================================
     08. MOBILE MENU CONTROLLER
     Toggle creation, off-canvas drawer, overlay, scroll lock,
     focus trap + restoration, auto-close behaviour.
  ========================================================================== */

  const barBaseStyle = () => [
    'display:block',
    'width:22px',
    'height:2px',
    'border-radius:2px',
    'background-color:var(--color-primary, #2f1f14)',
    `transition:transform 300ms ${CONFIG.transitionEase}, opacity 200ms ease`,
  ].join(';');

  const buildToggleBars = (toggle) => {
    const barCount = 3;
    for (let index = 0; index < barCount; index += 1) {
      const bar = document.createElement('span');
      bar.setAttribute('aria-hidden', 'true');
      bar.style.cssText = barBaseStyle();
      toggle.appendChild(bar);
      state.toggleBars.push(bar);
    }
  };

  const ensureToggle = () => {
    if (!dom.nav || !dom.navList) return;

    const existing = dom.nav.querySelector(SELECTORS.toggle);
    if (existing) {
      dom.toggle = existing;
      return;
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = CLASSES.toggle;
    toggle.setAttribute(ARIA.expanded, 'false');
    toggle.setAttribute(ARIA.controls, dom.navList.id ?? '');
    toggle.setAttribute(ARIA.label, LABELS.openMenu);
    toggle.style.gap = '5px';

    buildToggleBars(toggle);

    dom.nav.insertBefore(toggle, dom.navList);
    dom.toggle = toggle;
    state.toggleInjected = true;
    log('Disclosure toggle injected');
  };

  const paintToggleBars = (open) => {
    const [top, middle, bottom] = state.toggleBars;
    if (!top || !middle || !bottom) return;

    top.style.transform = open ? 'translateY(7px) rotate(45deg)' : '';
    middle.style.opacity = open ? '0' : '';
    middle.style.transform = open ? 'scaleX(0.2)' : '';
    bottom.style.transform = open ? 'translateY(-7px) rotate(-45deg)' : '';
  };

  const updateToggle = (open) => {
    if (!dom.toggle) return;
    dom.toggle.setAttribute(ARIA.expanded, String(open));
    dom.toggle.setAttribute(ARIA.label, open ? LABELS.closeMenu : LABELS.openMenu);
    paintToggleBars(open);
  };

  const drawerStyle = (open) => {
    const duration = prefersReducedMotion() ? 1 : CONFIG.drawerDuration;
    const visibilityDelay = open ? '0ms' : `${duration}ms`;
    const paddingTop = getHeaderHeight() + CONFIG.drawerClearance;

    return [
      'position:fixed',
      'top:0',
      'bottom:0',
      'right:0',
      'left:auto',
      `width:${CONFIG.drawerWidth}`,
      'max-width:100vw',
      'display:flex',
      'flex-direction:column',
      'align-items:stretch',
      'gap:0.25rem',
      `padding:${paddingTop}px 2rem 2.5rem`,
      'margin:0',
      'overflow-y:auto',
      'background-color:var(--color-surface, #fffdf8)',
      'border:0',
      'box-shadow:-24px 0 60px rgba(31, 21, 14, 0.28)',
      'z-index:var(--z-modal, 300)',
      `transform:${open ? 'translateX(0)' : 'translateX(110%)'}`,
      `opacity:${open ? '1' : '0'}`,
      `visibility:${open ? 'visible' : 'hidden'}`,
      `transition:transform ${duration}ms ${CONFIG.transitionEase},` +
        ` opacity ${duration}ms ease,` +
        ` visibility 0s linear ${visibilityDelay}`,
    ].join(';');
  };

  const ensureOverlay = () => {
    if (dom.overlay) return;

    const overlay = document.createElement('div');
    overlay.className = CLASSES.overlay;
    overlay.setAttribute(ARIA.hidden, 'true');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:var(--z-overlay, 200)',
      'background-color:var(--color-overlay, rgba(24, 15, 8, 0.55))',
      'opacity:0',
      'visibility:hidden',
    ].join(';');

    document.body.appendChild(overlay);
    dom.overlay = overlay;

    events.bind(overlay, 'click', () => closeMenu({ restoreFocus: true }));
  };

  const setOverlay = (visible) => {
    if (!dom.overlay) return;
    const duration = prefersReducedMotion() ? 1 : CONFIG.drawerDuration;
    const delay = visible ? '0ms' : `${duration}ms`;
    dom.overlay.style.transition =
      `opacity ${duration}ms ease, visibility 0s linear ${delay}`;
    dom.overlay.style.opacity = visible ? '1' : '0';
    dom.overlay.style.visibility = visible ? 'visible' : 'hidden';
  };

  const lockScroll = () => {
    state.savedBody.overflow = document.body.style.overflow;
    state.savedBody.paddingRight = document.body.style.paddingRight;
    state.savedHeaderPadding = dom.header?.style.paddingRight ?? '';

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      if (dom.header) dom.header.style.paddingRight = `${scrollbarWidth}px`;
    }
  };

  const unlockScroll = () => {
    document.body.style.overflow = state.savedBody.overflow;
    document.body.style.paddingRight = state.savedBody.paddingRight;
    if (dom.header) dom.header.style.paddingRight = state.savedHeaderPadding;
  };

  const getTrapFocusables = () =>
    [dom.toggle, ...dom.links].filter(Boolean);

  const openMenu = () => {
    if (state.menuOpen || !dom.nav || !dom.navList || !isMobile()) return;

    state.lastFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    ensureOverlay();
    lockScroll();

    dom.navList.style.cssText = drawerStyle(true);
    dom.nav.classList.add(CLASSES.open);

    /* Keep the bar + toggle above the drawer so it becomes the close button */
    if (dom.header) dom.header.style.zIndex = 'var(--z-skip, 400)';

    setOverlay(true);
    updateToggle(true);
    state.menuOpen = true;

    requestAnimationFrame(() => {
      const firstLink = dom.links[0];
      (firstLink ?? dom.toggle)?.focus({ preventScroll: true });
    });

    announce(LABELS.menuOpened);
    log('Drawer opened');
  };

  const closeMenu = ({ restoreFocus = true } = {}) => {
    if (!state.menuOpen || !dom.navList) return;

    state.menuOpen = false;

    dom.nav?.classList.remove(CLASSES.open);
    dom.navList.style.cssText = drawerStyle(false);

    if (dom.header) dom.header.style.zIndex = '';

    setOverlay(false);
    updateToggle(false);
    unlockScroll();

    if (restoreFocus && state.lastFocused) {
      state.lastFocused.focus({ preventScroll: true });
    }
    state.lastFocused = null;

    announce(LABELS.menuClosed);
    log('Drawer closed');
  };

  const toggleMenu = () => {
    if (state.menuOpen) closeMenu({ restoreFocus: true });
    else openMenu();
  };

  /** Fully release drawer styling when leaving the mobile context. */
  const resetMobileArtifacts = () => {
    if (state.menuOpen) closeMenu({ restoreFocus: false });
    if (dom.navList) dom.navList.style.cssText = '';
    if (dom.header) dom.header.style.zIndex = '';
  };

  /* ==========================================================================
     09. STICKY HEADER CONTROLLER
     Scrolled state, hero glass transition, directional hide/show.
  ========================================================================== */

  const applyHeaderTransition = () => {
    if (!dom.header) return;

    const transition = prefersReducedMotion()
      ? 'background-color 1ms linear, box-shadow 1ms linear, border-color 1ms linear'
      : `transform ${CONFIG.headerDuration}ms ${CONFIG.transitionEase},` +
        ' background-color 300ms ease,' +
        ' box-shadow 300ms ease,' +
        ' border-color 300ms ease,' +
        ' backdrop-filter 300ms ease';

    dom.header.style.transition = transition;
  };

  const applyTopGlass = (atTop) => {
    if (!dom.header || !CONFIG.features.transparentTop) return;

    if (atTop) {
      dom.header.style.backgroundColor = CONFIG.headerGlassTop;
      dom.header.style.backdropFilter = 'blur(6px)';
      dom.header.style.setProperty('-webkit-backdrop-filter', 'blur(6px)');
      dom.header.style.borderBottomColor = CONFIG.headerGlassTopBorder;
      return;
    }

    dom.header.style.removeProperty('background-color');
    dom.header.style.removeProperty('backdrop-filter');
    dom.header.style.removeProperty('-webkit-backdrop-filter');
    dom.header.style.removeProperty('border-bottom-color');
  };

  const setHeaderHidden = (hidden) => {
    if (!dom.header || state.headerHidden === hidden) return;

    state.headerHidden = hidden;
    dom.header.style.transform = hidden ? 'translateY(-110%)' : '';

    if ('inert' in dom.header) {
      dom.header.inert = hidden;
    } else if (hidden) {
      dom.header.setAttribute(ARIA.hidden, 'true');
    } else {
      dom.header.removeAttribute(ARIA.hidden);
    }
  };

  const updateHeader = (scrollY) => {
    if (!dom.header || !CONFIG.features.stickyHeader) return;

    const atTop = scrollY <= CONFIG.topThreshold;
    dom.header.classList.toggle(CLASSES.scrolled, scrollY > CONFIG.stickyThreshold);
    applyTopGlass(atTop);

    if (!CONFIG.features.hideOnScroll) return;

    /* Never hide while the drawer is open or keyboard focus lives in the bar */
    if (state.menuOpen || dom.header.contains(document.activeElement)) {
      setHeaderHidden(false);
      return;
    }

    if (scrollY <= CONFIG.hideOffset) {
      setHeaderHidden(false);
      return;
    }

    const delta = scrollY - state.lastScrollY;
    if (delta > CONFIG.hideDelta) setHeaderHidden(true);
    else if (delta < -CONFIG.hideDelta) setHeaderHidden(false);
  };

  /* ==========================================================================
     10. SCROLL SPY CONTROLLER
     IntersectionObserver-driven current-section detection.
  ========================================================================== */

  const indexLinks = () => {
    state.linkForSection.clear();
    dom.links.forEach((link) => {
      const href = link.getAttribute('href') ?? '';
      if (href.startsWith('#') && href.length > 1) {
        state.linkForSection.set(href.slice(1), link);
      }
    });
  };

  const setActiveSection = (id) => {
    if (state.activeId === id) return;

    const previous = state.activeId ? state.linkForSection.get(state.activeId) : null;
    previous?.removeAttribute(ARIA.current);
    previous?.classList.remove(CLASSES.active);

    const next = id ? state.linkForSection.get(id) : null;
    if (next) {
      next.setAttribute(ARIA.current, 'page');
      next.classList.add(CLASSES.active);
    }

    state.activeId = id ?? null;
  };

  const initScrollSpy = () => {
    if (!CONFIG.features.scrollSpy || dom.sections.length === 0) return;

    state.lastSectionId = dom.sections[dom.sections.length - 1]?.id ?? null;

    if (!('IntersectionObserver' in window)) {
      log('IntersectionObserver unavailable — scroll spy disabled');
      return;
    }

    state.spyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
    );

    dom.sections.forEach((section) => state.spyObserver.observe(section));
  };

  /* ==========================================================================
     11. SMOOTH SCROLL CONTROLLER
     Delegated anchor interception with offset compensation,
     focus hand-off and history updates.
  ========================================================================== */

  const handleAnchorClick = (event) => {
    if (!CONFIG.features.smoothScroll) return;
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = event.target instanceof Element
      ? event.target.closest('a[href^="#"]')
      : null;
    if (!anchor || anchor.getAttribute('target') === '_blank') return;

    const hash = anchor.getAttribute('href') ?? '';
    if (hash.length <= 1) return;

    const target = document.getElementById(hash.slice(1));
    if (!target) return;

    event.preventDefault();

    if (state.menuOpen) closeMenu({ restoreFocus: false });

    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    window.scrollTo({ top: getScrollTargetY(target), behavior });

    makeFocusable(target);
    target.focus({ preventScroll: true });

    if (anchor.matches(SELECTORS.navLink)) setActiveSection(target.id);

    try {
      history.pushState(null, '', `#${target.id}`);
    } catch {
      /* Some embedded contexts block history writes — non-fatal */
    }

    const label = anchor.textContent?.trim() || target.id;
    announce(`${LABELS.navigatedTo} ${label}`);
  };

  const handleInitialHash = () => {
    const hash = window.location.hash;
    if (!hash || hash.length <= 1) return;

    const target = document.getElementById(hash.slice(1));
    if (!target) return;

    requestAnimationFrame(() => {
      window.scrollTo({
        top: getScrollTargetY(target),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    });
  };

  /* ==========================================================================
     12. KEYBOARD & SCROLL HANDLERS
  ========================================================================== */

  const handleDocumentKeydown = (event) => {
    if (!state.menuOpen) return;

    if (event.key === KEYS.escape) {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
      return;
    }

    if (event.key === KEYS.tab && CONFIG.features.focusTrap) {
      trapTabNavigation(event);
    }
  };

  const trapTabNavigation = (event) => {
    const focusables = getTrapFocusables();
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !focusables.includes(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleNavArrowKeys = (event) => {
    if (!CONFIG.features.arrowKeys || dom.links.length === 0) return;
    if (!(event.target instanceof Element)) return;
    if (!event.target.matches(SELECTORS.navLink)) return;

    const movesForward = event.key === KEYS.arrowRight || event.key === KEYS.arrowDown;
    const movesBackward = event.key === KEYS.arrowLeft || event.key === KEYS.arrowUp;
    const jumps = event.key === KEYS.home || event.key === KEYS.end;
    if (!movesForward && !movesBackward && !jumps) return;

    event.preventDefault();

    const currentIndex = dom.links.indexOf(event.target);
    const lastIndex = dom.links.length - 1;

    let nextIndex;
    if (event.key === KEYS.home) nextIndex = 0;
    else if (event.key === KEYS.end) nextIndex = lastIndex;
    else if (movesForward) nextIndex = currentIndex >= lastIndex ? 0 : currentIndex + 1;
    else nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1;

    dom.links[nextIndex]?.focus();
  };

  /* rAF-throttled scroll pump — one frame of work per frame at most. */
  let scrollTicking = false;

  const processScrollFrame = () => {
    const scrollY = window.scrollY;

    updateHeader(scrollY);

    /* Snap the spy to the final section when the page is fully scrolled */
    const reachedBottom =
      window.innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    if (reachedBottom && state.lastSectionId) {
      setActiveSection(state.lastSectionId);
    }

    state.lastScrollY = scrollY;
    scrollTicking = false;
  };

  const handleScroll = () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(processScrollFrame);
  };

  /* ==========================================================================
     13. RESIZE / ORIENTATION HANDLING
  ========================================================================== */

  const handleViewportChange = () => {
    if (isMobile()) return;
    resetMobileArtifacts();
    log('Switched to desktop layout — drawer state cleared');
  };

  const handleResize = debounce(() => {
    handleViewportChange();
    /* Re-sync the scrolled state in case metrics changed under us */
    processScrollFrame();
  }, CONFIG.resizeDebounce);

  const applyMotionPreferences = () => {
    applyHeaderTransition();
    state.toggleBars.forEach((bar) => {
      bar.style.transition = prefersReducedMotion() ? 'none' : barBaseStyle().split('transition:')[1];
    });
  };

  /* ==========================================================================
     14. EVENT WIRING
  ========================================================================== */

  const bindEvents = () => {
    events.bind(window, 'scroll', handleScroll, { passive: true });
    events.bind(window, 'resize', handleResize, { passive: true });
    events.bind(window, 'orientationchange', handleResize, { passive: true });
    events.bind(window, 'load', processScrollFrame, { once: true });

    events.bind(document, 'click', handleAnchorClick);
    events.bind(document, 'keydown', handleDocumentKeydown);

    if (dom.toggle) events.bind(dom.toggle, 'click', toggleMenu);
    if (dom.navList) events.bind(dom.navList, 'keydown', handleNavArrowKeys);

    /* Reveal the bar the moment a keyboard user reaches it while hidden */
    if (dom.header) {
      events.bind(dom.header, 'focusin', () => {
        if (state.headerHidden) setHeaderHidden(false);
      });
    }

    if (typeof mobileQuery?.addEventListener === 'function') {
      events.bind(mobileQuery, 'change', handleViewportChange);
    }
    if (typeof reducedQuery?.addEventListener === 'function') {
      events.bind(reducedQuery, 'change', applyMotionPreferences);
    }
  };

  /* ==========================================================================
     15. INITIALIZATION
  ========================================================================== */

  const initialize = () => {
    if (state.initialized) return;

    cacheDom();

    if (!dom.header || !dom.navList) {
      log('Navigation landmarks missing — module standing down gracefully');
      return;
    }

    /* Idempotent even if main.js already applied it */
    document.documentElement.classList.add(CLASSES.js);

    indexLinks();
    ensureAnnouncer();

    if (CONFIG.features.mobileMenu) {
      ensureToggle();
      ensureOverlay();
    }

    applyMotionPreferences();
    bindEvents();
    initScrollSpy();
    processScrollFrame();
    handleInitialHash();

    state.initialized = true;
    log('Navigation engine initialised', {
      links: dom.links.length,
      sections: dom.sections.length,
      mobile: isMobile(),
    });
  };

  /* ==========================================================================
     16. CLEANUP
     Full teardown — safe for SPA transitions and hot reloads.
  ========================================================================== */

  const destroy = () => {
    if (!state.initialized) return;

    handleResize.cancel();
    events.unbindAll();

    state.spyObserver?.disconnect();
    state.spyObserver = null;

    resetMobileArtifacts();

    if (dom.header) {
      dom.header.style.transform = '';
      dom.header.style.transition = '';
      dom.header.style.zIndex = '';
      dom.header.classList.remove(CLASSES.scrolled);
      dom.header.removeAttribute(ARIA.hidden);
      if ('inert' in dom.header) dom.header.inert = false;
    }

    if (state.toggleInjected) dom.toggle?.remove();
    dom.overlay?.remove();
    dom.announcer?.remove();

    dom.toggle = null;
    dom.overlay = null;
    dom.announcer = null;
    state.toggleBars = [];
    state.menuOpen = false;
    state.headerHidden = false;
    state.activeId = null;
    state.initialized = false;

    log('Navigation engine destroyed');
  };

  /* ==========================================================================
     17. PUBLIC API + BOOTSTRAP
  ========================================================================== */

  const boot = () => initialize();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.HayatNav = Object.freeze({
    open: openMenu,
    close: () => closeMenu({ restoreFocus: true }),
    toggle: toggleMenu,
    refresh: processScrollFrame,
    destroy,
  });
})();


         
                    