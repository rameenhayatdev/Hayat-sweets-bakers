/**
 * ============================================================================
 * Hayat Sweets & Bakers
 * Premium Animation & Interaction Engine
 * ============================================================================
 *
 * Responsibility:
 *   JavaScript → detects interaction / viewport state and applies classes.
 *   CSS        → handles the actual visual animations and transitions.
 *
 * Systems:
 *   • Scroll reveal
 *   • Staggered reveals
 *   • Hero entrance sequence
 *   • Image reveal
 *   • Card hover state
 *   • Button interaction state
 *   • Floating elements
 *   • Parallax
 *   • Animated counters
 *   • Scroll progress
 *   • Scroll indicator
 *   • Active sections
 *   • Reduced-motion accessibility
 *
 * Public API:
 *   window.HSBAnimations.refresh()
 *   window.HSBAnimations.destroy()
 *   window.HSBAnimations.setButtonState()
 * ============================================================================
 */

(() => {
  'use strict';

  /* ==========================================================================
     CONFIGURATION
  ========================================================================== */

  const CONFIG = {
    reveal: {
      selector: [
        '.reveal',
        '.reveal-up',
        '.reveal-down',
        '.reveal-left',
        '.reveal-right',
        '.reveal-scale',
        '.reveal-zoom',
        '.reveal-rotate',
        '.reveal-blur',
        '.reveal-card',
        '.reveal-image',
        '.reveal-text',
        '.reveal-hero',
        '.reveal-footer'
      ].join(', '),

      activeClass: 'is-visible',

      threshold: 0.12,

      rootMargin: '0px 0px -8% 0px'
    },

    stagger: {
      containerSelector: '[data-stagger]',
      itemSelector: '[data-stagger-item]',
      defaultDelay: 90,
      activeClass: 'is-visible'
    },

    hero: {
      rootSelector: '[data-hero]',
      sequenceSelector: '[data-hero-sequence]',
      activeClass: 'is-visible',
      startDelay: 120,
      stepDelay: 140
    },

    parallax: {
      selector: '[data-parallax]',
      speedAttribute: 'data-parallax-speed',
      defaultSpeed: 0.12,
      maxOffset: 80
    },

    floating: {
      selector: '[data-float]',
      speedAttribute: 'data-float-speed',
      amplitudeAttribute: 'data-float-amplitude',
      defaultSpeed: 4,
      defaultAmplitude: 10
    },

    counters: {
      selector: '[data-counter]',
      durationAttribute: 'data-counter-duration',
      defaultDuration: 1800,
      threshold: 0.5
    },

    progress: {
      selector: '[data-scroll-progress]'
    },

    scrollIndicator: {
      selector: '[data-scroll-indicator]',
      hideAfter: 120,
      hiddenClass: 'is-hidden'
    },

    buttons: {
      selector: '[data-btn-animate]',
      pressedClass: 'is-pressed',
      focusedClass: 'is-focused',
      loadingClass: 'is-loading',
      successClass: 'is-success',
      errorClass: 'is-error'
    },

    cards: {
      selector: '[data-card-animate]',
      hoverClass: 'is-hovered'
    },

    sections: {
      selector: '[data-section]',
      activeClass: 'is-active',
      threshold: 0.3
    }
  };

  /* ==========================================================================
     STATE
  ========================================================================== */

  const state = {
    initialized: false,
    reducedMotion: false,
    touchDevice: false
  };

  /* ==========================================================================
     DOM CACHE
  ========================================================================== */

  const dom = {
    revealElements: [],
    staggerContainers: [],
    heroRoot: null,
    heroElements: [],
    parallaxElements: [],
    floatingElements: [],
    counterElements: [],
    progressBar: null,
    scrollIndicator: null,
    buttons: [],
    cards: [],
    sections: []
  };

  /* ==========================================================================
     CLEANUP REGISTRIES
  ========================================================================== */

  const listeners = [];
  const observers = [];
  const timers = new Set();
  const animationFrames = new Set();

  /* ==========================================================================
     UTILITY FUNCTIONS
  ========================================================================== */

  function selectAll(selector, scope = document) {
    if (!selector || !scope) {
      return [];
    }

    return Array.from(scope.querySelectorAll(selector));
  }

  function select(selector, scope = document) {
    if (!selector || !scope) {
      return null;
    }

    return scope.querySelector(selector);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function parseNumber(value, fallback) {
    const number = Number.parseFloat(value);

    return Number.isFinite(number) ? number : fallback;
  }

  function parseInteger(value, fallback) {
    const number = Number.parseInt(value, 10);

    return Number.isFinite(number) ? number : fallback;
  }

  function addListener(target, eventName, handler, options) {
    if (!target) {
      return;
    }

    target.addEventListener(eventName, handler, options);

    listeners.push({
      target,
      eventName,
      handler,
      options
    });
  }

  function addObserver(observer) {
    if (!observer) {
      return;
    }

    observers.push(observer);
  }

  function addTimer(timerId) {
    if (timerId) {
      timers.add(timerId);
    }

    return timerId;
  }

  function addAnimationFrame(frameId) {
    if (frameId) {
      animationFrames.add(frameId);
    }

    return frameId;
  }

  function removeTimer(timerId) {
    timers.delete(timerId);
  }

  function removeAnimationFrame(frameId) {
    animationFrames.delete(frameId);
  }

  function debounce(callback, delay) {
    let timer = null;

    return (...args) => {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        callback(...args);
        timer = null;
      }, delay);
    };
  }

  function requestFrame(callback) {
    const frameId = requestAnimationFrame((timestamp) => {
      removeAnimationFrame(frameId);
      callback(timestamp);
    });

    addAnimationFrame(frameId);

    return frameId;
  }

  function isTouchDevice() {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
  }

  function getReducedMotionPreference() {
    return window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
  }

  /* ==========================================================================
     DOM CACHE
  ========================================================================== */

  function cacheDOM() {
    dom.revealElements = selectAll(CONFIG.reveal.selector);

    dom.staggerContainers = selectAll(
      CONFIG.stagger.containerSelector
    );

    dom.heroRoot = select(CONFIG.hero.rootSelector);

    dom.heroElements = dom.heroRoot
      ? selectAll(
          CONFIG.hero.sequenceSelector,
          dom.heroRoot
        )
      : [];

    dom.parallaxElements = selectAll(
      CONFIG.parallax.selector
    );

    dom.floatingElements = selectAll(
      CONFIG.floating.selector
    );

    dom.counterElements = selectAll(
      CONFIG.counters.selector
    );

    dom.progressBar = select(
      CONFIG.progress.selector
    );

    dom.scrollIndicator = select(
      CONFIG.scrollIndicator.selector
    );

    dom.buttons = selectAll(
      CONFIG.buttons.selector
    );

    dom.cards = selectAll(
      CONFIG.cards.selector
    );

    dom.sections = selectAll(
      CONFIG.sections.selector
    );
  }

  /* ==========================================================================
     REDUCED MOTION
  ========================================================================== */

  function updateMotionPreference() {
    state.reducedMotion = getReducedMotionPreference();

    document.body?.classList.toggle(
      'reduce-motion',
      state.reducedMotion
    );
  }

  /* ==========================================================================
     SCROLL REVEAL
  ========================================================================== */

  function initRevealSystem() {
    if (!dom.revealElements.length) {
      return;
    }

    if (state.reducedMotion) {
      dom.revealElements.forEach((element) => {
        element.classList.add(CONFIG.reveal.activeClass);
      });

      return;
    }

    if (!('IntersectionObserver' in window)) {
      dom.revealElements.forEach((element) => {
        element.classList.add(CONFIG.reveal.activeClass);
      });

      return;
    }

    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        entries.forEach((entry) => {
          const element = entry.target;

          if (!entry.isIntersecting) {
            if (element.hasAttribute('data-reveal-repeat')) {
              element.classList.remove(
                CONFIG.reveal.activeClass
              );
            }

            return;
          }

          element.classList.add(
            CONFIG.reveal.activeClass
          );

          if (!element.hasAttribute('data-reveal-repeat')) {
            currentObserver.unobserve(element);
          }
        });
      },
      {
        threshold: CONFIG.reveal.threshold,
        rootMargin: CONFIG.reveal.rootMargin
      }
    );

    dom.revealElements.forEach((element) => {
      observer.observe(element);
    });

    addObserver(observer);
  }

  /* ==========================================================================
     STAGGERED ANIMATIONS
  ========================================================================== */

  function initStaggerSystem() {
    if (!dom.staggerContainers.length) {
      return;
    }

    if (state.reducedMotion) {
      dom.staggerContainers.forEach((container) => {
        const items = selectAll(
          CONFIG.stagger.itemSelector,
          container
        );

        items.forEach((item) => {
          item.classList.add(
            CONFIG.stagger.activeClass
          );
        });
      });

      return;
    }

    if (!('IntersectionObserver' in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const container = entry.target;

          const items = selectAll(
            CONFIG.stagger.itemSelector,
            container
          );

          const delayStep = parseInteger(
            container.dataset.staggerDelay,
            CONFIG.stagger.defaultDelay
          );

          items.forEach((item, index) => {
            const delay = index * delayStep;

            const timerId = setTimeout(() => {
              item.classList.add(
                CONFIG.stagger.activeClass
              );

              removeTimer(timerId);
            }, delay);

            addTimer(timerId);
          });

          currentObserver.unobserve(container);
        });
      },
      {
        threshold: 0.15
      }
    );

    dom.staggerContainers.forEach((container) => {
      observer.observe(container);
    });

    addObserver(observer);
  }

  /* ==========================================================================
     HERO ENTRANCE SEQUENCE
  ========================================================================== */

  function initHeroSequence() {
    if (
      !dom.heroRoot ||
      !dom.heroElements.length
    ) {
      return;
    }

    const elements = dom.heroElements
      .slice()
      .sort((first, second) => {
        const firstOrder = parseInteger(
          first.getAttribute('data-hero-sequence'),
          0
        );

        const secondOrder = parseInteger(
          second.getAttribute('data-hero-sequence'),
          0
        );

        return firstOrder - secondOrder;
      });

    if (state.reducedMotion) {
      elements.forEach((element) => {
        element.classList.add(
          CONFIG.hero.activeClass
        );
      });

      return;
    }

    const startTimer = setTimeout(() => {
      removeTimer(startTimer);

      elements.forEach((element, index) => {
        const delay =
          index * CONFIG.hero.stepDelay;

        const timerId = setTimeout(() => {
          element.classList.add(
            CONFIG.hero.activeClass
          );

          removeTimer(timerId);
        }, delay);

        addTimer(timerId);
      });
    }, CONFIG.hero.startDelay);

    addTimer(startTimer);
  }

  /* ==========================================================================
     PARALLAX
  ========================================================================== */

  let latestScrollY = 0;
  let parallaxFrame = null;

  function updateParallax() {
    parallaxFrame = null;

    if (
      state.reducedMotion ||
      state.touchDevice ||
      !dom.parallaxElements.length
    ) {
      return;
    }

    dom.parallaxElements.forEach((element) => {
      const speed = clamp(
        parseNumber(
          element.getAttribute(
            CONFIG.parallax.speedAttribute
          ),
          CONFIG.parallax.defaultSpeed
        ),
        -0.5,
        0.5
      );

      const offset = clamp(
        latestScrollY * speed,
        -CONFIG.parallax.maxOffset,
        CONFIG.parallax.maxOffset
      );

      element.style.setProperty(
        '--parallax-offset',
        `${offset}px`
      );
    });
  }

  function handleParallaxScroll() {
    latestScrollY = window.scrollY;

    if (parallaxFrame !== null) {
      return;
    }

    parallaxFrame = requestFrame(
      updateParallax
    );
  }

  function initParallax() {
    if (
      !dom.parallaxElements.length ||
      state.reducedMotion ||
      state.touchDevice
    ) {
      return;
    }

    addListener(
      window,
      'scroll',
      handleParallaxScroll,
      { passive: true }
    );

    updateParallax();
  }

  /* ==========================================================================
     FLOATING ELEMENTS
  ========================================================================== */

  function initFloatingSystem() {
    if (
      !dom.floatingElements.length ||
      state.reducedMotion
    ) {
      return;
    }

    dom.floatingElements.forEach(
      (element, index) => {
        const speed = parseNumber(
          element.getAttribute(
            CONFIG.floating.speedAttribute
          ),
          CONFIG.floating.defaultSpeed
        );

        const amplitude = parseNumber(
          element.getAttribute(
            CONFIG.floating.amplitudeAttribute
          ),
          CONFIG.floating.defaultAmplitude
        );

        const delay =
          (index % 5) * 0.25;

        element.style.setProperty(
          '--float-speed',
          `${Math.max(speed, 1)}s`
        );

        element.style.setProperty(
          '--float-amplitude',
          `${Math.max(amplitude, 0)}px`
        );

        element.style.setProperty(
          '--float-delay',
          `${delay}s`
        );

        element.classList.add(
          'is-floating'
        );
      }
    );
  }

  /* ==========================================================================
     COUNTER ANIMATION
  ========================================================================== */

  function easeOutQuart(value) {
    return 1 - Math.pow(1 - value, 4);
  }

  function animateCounter(element) {
    const rawTarget =
      element.getAttribute('data-counter');

    const target = parseNumber(
      rawTarget,
      0
    );

    const duration = Math.max(
      parseInteger(
        element.getAttribute(
          CONFIG.counters.durationAttribute
        ),
        CONFIG.counters.defaultDuration
      ),
      300
    );

    if (state.reducedMotion) {
      element.textContent =
        Math.round(target).toLocaleString();

      return;
    }

    const startTime = performance.now();

    function updateCounter(timestamp) {
      const elapsed =
        timestamp - startTime;

      const progress = clamp(
        elapsed / duration,
        0,
        1
      );

      const eased =
        easeOutQuart(progress);

      const current =
        Math.round(target * eased);

      element.textContent =
        current.toLocaleString();

      if (progress < 1) {
        requestFrame(updateCounter);
      } else {
        element.textContent =
          Math.round(target).toLocaleString();
      }
    }

    requestFrame(updateCounter);
  }

  function initCounterSystem() {
    if (!dom.counterElements.length) {
      return;
    }

    if (
      state.reducedMotion ||
      !('IntersectionObserver' in window)
    ) {
      dom.counterElements.forEach(
        (element) => {
          animateCounter(element);
        }
      );

      return;
    }

    const observer =
      new IntersectionObserver(
        (entries, currentObserver) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            animateCounter(
              entry.target
            );

            currentObserver.unobserve(
              entry.target
            );
          });
        },
        {
          threshold:
            CONFIG.counters.threshold
        }
      );

    dom.counterElements.forEach(
      (element) => {
        observer.observe(element);
      }
    );

    addObserver(observer);
  }

  /* ==========================================================================
     SCROLL PROGRESS
  ========================================================================== */

  let progressFrame = null;

  function updateScrollProgress() {
    progressFrame = null;

    if (!dom.progressBar) {
      return;
    }

    const scrollTop =
      window.scrollY || 0;

    const documentHeight =
      document.documentElement.scrollHeight;

    const viewportHeight =
      window.innerHeight;

    const scrollable =
      documentHeight - viewportHeight;

    const progress =
      scrollable > 0
        ? clamp(
            scrollTop / scrollable,
            0,
            1
          )
        : 0;

    dom.progressBar.style.transform =
      `scaleX(${progress})`;
  }

  function handleProgressScroll() {
    if (progressFrame !== null) {
      return;
    }

    progressFrame = requestFrame(
      updateScrollProgress
    );
  }

  function initScrollProgress() {
    if (!dom.progressBar) {
      return;
    }

    addListener(
      window,
      'scroll',
      handleProgressScroll,
      { passive: true }
    );

    addListener(
      window,
      'resize',
      debounce(
        updateScrollProgress,
        120
      ),
      { passive: true }
    );

    updateScrollProgress();
  }

  /* ==========================================================================
     SCROLL INDICATOR
  ========================================================================== */

  let indicatorFrame = null;

  function updateScrollIndicator() {
    indicatorFrame = null;

    if (!dom.scrollIndicator) {
      return;
    }

    const hidden =
      window.scrollY >
      CONFIG.scrollIndicator.hideAfter;

    dom.scrollIndicator.classList.toggle(
      CONFIG.scrollIndicator.hiddenClass,
      hidden
    );
  }

  function handleIndicatorScroll() {
    if (indicatorFrame !== null) {
      return;
    }

    indicatorFrame = requestFrame(
      updateScrollIndicator
    );
  }

  function initScrollIndicator() {
    if (!dom.scrollIndicator) {
      return;
    }

    addListener(
      window,
      'scroll',
      handleIndicatorScroll,
      { passive: true }
    );

    updateScrollIndicator();
  }

  /* ==========================================================================
     BUTTON INTERACTIONS
  ========================================================================== */

  function initButtonInteractions() {
    if (!dom.buttons.length) {
      return;
    }

    dom.buttons.forEach((button) => {
      addListener(
        button,
        'pointerdown',
        () => {
          button.classList.add(
            CONFIG.buttons.pressedClass
          );
        },
        { passive: true }
      );

      addListener(
        button,
        'pointerup',
        () => {
          button.classList.remove(
            CONFIG.buttons.pressedClass
          );
        },
        { passive: true }
      );

      addListener(
        button,
        'pointercancel',
        () => {
          button.classList.remove(
            CONFIG.buttons.pressedClass
          );
        },
        { passive: true }
      );

      addListener(
        button,
        'pointerleave',
        () => {
          button.classList.remove(
            CONFIG.buttons.pressedClass
          );
        },
        { passive: true }
      );

      addListener(
        button,
        'focus',
        () => {
          button.classList.add(
            CONFIG.buttons.focusedClass
          );
        }
      );

      addListener(
        button,
        'blur',
        () => {
          button.classList.remove(
            CONFIG.buttons.focusedClass
          );
        }
      );
    });
  }

  /* ==========================================================================
     CARD INTERACTIONS
  ========================================================================== */

  function initCardInteractions() {
    if (!dom.cards.length) {
      return;
    }

    dom.cards.forEach((card) => {
      addListener(
        card,
        'pointerenter',
        () => {
          card.classList.add(
            CONFIG.cards.hoverClass
          );
        },
        { passive: true }
      );

      addListener(
        card,
        'pointerleave',
        () => {
          card.classList.remove(
            CONFIG.cards.hoverClass
          );
        },
        { passive: true }
      );
    });
  }

  /* ==========================================================================
     ACTIVE SECTION OBSERVER
  ========================================================================== */

  function initSectionObserver() {
    if (!dom.sections.length) {
      return;
    }

    if (
      state.reducedMotion ||
      !('IntersectionObserver' in window)
    ) {
      dom.sections.forEach((section) => {
        section.classList.add(
          CONFIG.sections.activeClass
        );
      });

      return;
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            entry.target.classList.toggle(
              CONFIG.sections.activeClass,
              entry.isIntersecting
            );
          });
        },
        {
          threshold:
            CONFIG.sections.threshold
        }
      );

    dom.sections.forEach((section) => {
      observer.observe(section);
    });

    addObserver(observer);
  }

  /* ==========================================================================
     REDUCED MOTION WATCHER
  ========================================================================== */

  function initMotionWatcher() {
    const mediaQuery =
      window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      );

    const handleChange = () => {
      const previous =
        state.reducedMotion;

      updateMotionPreference();

      if (
        previous !==
        state.reducedMotion
      ) {
        refresh();
      }
    };

    if (
      typeof mediaQuery.addEventListener ===
      'function'
    ) {
      addListener(
        mediaQuery,
        'change',
        handleChange
      );
    }
  }

  /* ==========================================================================
     IMAGE LOAD POLISH
  ========================================================================== */

  function initImageLoading() {
    const images = selectAll('img.img-loading');

    images.forEach((image) => {
      const reveal = () => image.classList.add('is-loaded');

      if (image.complete) {
        reveal();
      } else {
        image.addEventListener('load', reveal, { once: true });
        image.addEventListener('error', reveal, { once: true });
      }
    });
  }

  /* ==========================================================================
     INITIALIZATION
  ========================================================================== */

  function init() {
    if (state.initialized) {
      return;
    }

    try {
      state.touchDevice =
        isTouchDevice();

      updateMotionPreference();

      cacheDOM();

      initImageLoading();
      initRevealSystem();
      initStaggerSystem();
      initHeroSequence();
      initParallax();
      initFloatingSystem();
      initCounterSystem();
      initScrollProgress();
      initScrollIndicator();
      initButtonInteractions();
      initCardInteractions();
      initSectionObserver();
      initMotionWatcher();

      state.initialized = true;
    } catch (error) {
      console.error(
        'HSB Animation Engine:',
        error
      );
    }
  }

  /* ==========================================================================
     DESTROY / CLEANUP
  ========================================================================== */

  function destroy() {
    listeners.forEach(
      ({
        target,
        eventName,
        handler,
        options
      }) => {
        target.removeEventListener(
          eventName,
          handler,
          options
        );
      }
    );

    listeners.length = 0;

    observers.forEach(
      (observer) => {
        observer.disconnect();
      }
    );

    observers.length = 0;

    timers.forEach(
      (timerId) => {
        clearTimeout(timerId);
      }
    );

    timers.clear();

    animationFrames.forEach(
      (frameId) => {
        cancelAnimationFrame(
          frameId
        );
      }
    );

    animationFrames.clear();

    dom.floatingElements.forEach(
      (element) => {
        element.classList.remove(
          'is-floating'
        );
      }
    );

    state.initialized = false;
  }

  /* ==========================================================================
     REFRESH
  ========================================================================== */

  function refresh() {
    destroy();
    init();
  }

  /* ==========================================================================
     PUBLIC BUTTON STATE API
  ========================================================================== */

  function setButtonState(
    button,
    stateName
  ) {
    if (
      !button ||
      !button.classList
    ) {
      return;
    }

    button.classList.remove(
      CONFIG.buttons.loadingClass,
      CONFIG.buttons.successClass,
      CONFIG.buttons.errorClass
    );

    if (stateName === 'loading') {
      button.classList.add(
        CONFIG.buttons.loadingClass
      );
    }

    if (stateName === 'success') {
      button.classList.add(
        CONFIG.buttons.successClass
      );
    }

    if (stateName === 'error') {
      button.classList.add(
        CONFIG.buttons.errorClass
      );
    }
  }

  /* ==========================================================================
     BOOTSTRAP
  ========================================================================== */

  function bootstrap() {
    if (
      document.readyState ===
      'loading'
    ) {
      document.addEventListener(
        'DOMContentLoaded',
        init,
        { once: true }
      );
    } else {
      init();
    }
  }

  /* ==========================================================================
     PUBLIC API
  ========================================================================== */

  window.HSBAnimations = {
    init,
    refresh,
    destroy,
    setButtonState
  };

  /* ==========================================================================
     START ENGINE
  ========================================================================== */

  bootstrap();

})();
/* ============================================================================
   PREMIUM ENHANCEMENT PASS
   Adds visible polish to the existing project without replacing its content.
   Defensive and independent from the main animation engine.
============================================================================ */
(() => {
  'use strict';

  const ready = (callback) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  };

  ready(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    /* Add data hooks to existing sections so the current animation engine
       can make better use of them without changing the HTML manually. */
    document.querySelectorAll('main section[id]').forEach((section) => {
      section.setAttribute('data-section', '');
    });

    document.querySelectorAll('.featured-card, .menu-item, .why-card, .testimonial-card').forEach((card) => {
      card.setAttribute('data-card-animate', '');
    });

    document.querySelectorAll('.button, .header-cta').forEach((button) => {
      button.setAttribute('data-btn-animate', '');
      button.classList.add('ripple-host');
    });

    /* Image reveal: only images that have actually loaded get the polish. */
    document.querySelectorAll('img').forEach((image) => {
      if (image.loading === 'lazy' || image.closest('.hero')) {
        image.classList.add('img-loading');
      }

      const markReady = () => image.classList.add('hsb-image-ready', 'is-loaded');
      if (image.complete) {
        markReady();
      } else {
        image.addEventListener('load', markReady, { once: true, passive: true });
        image.addEventListener('error', markReady, { once: true, passive: true });
      }
    });

    /* Scroll progress */
    let progress = document.querySelector('[data-scroll-progress]');
    if (!progress) {
      progress = document.createElement('div');
      progress.className = 'hsb-scroll-progress';
      progress.setAttribute('data-scroll-progress', '');
      progress.setAttribute('aria-hidden', 'true');
      document.body.appendChild(progress);
    }

    let progressFrame = 0;
    const updateProgress = () => {
      progressFrame = 0;
      const scrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const value = Math.min(Math.max(window.scrollY / scrollable, 0), 1);
      progress.style.transform = `scaleX(${value})`;
    };

    const requestProgress = () => {
      if (progressFrame) return;
      progressFrame = window.requestAnimationFrame(updateProgress);
    };

    window.addEventListener('scroll', requestProgress, { passive: true });
    window.addEventListener('resize', requestProgress, { passive: true });
    updateProgress();

    /* Back-to-top */
    let backTop = document.querySelector('.hsb-back-top');
    if (!backTop) {
      backTop = document.createElement('button');
      backTop.type = 'button';
      backTop.className = 'hsb-back-top';
      backTop.setAttribute('aria-label', 'Back to top');
      backTop.setAttribute('aria-hidden', 'true');
      backTop.innerHTML = '<span aria-hidden="true">↑</span>';
      document.body.appendChild(backTop);
    }

    const updateBackTop = () => {
      const visible = window.scrollY > 520;
      backTop.classList.toggle('is-visible', visible);
      backTop.setAttribute('aria-hidden', String(!visible));
    };

    backTop.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: reduced ? 'auto' : 'smooth'
      });
    });

    window.addEventListener('scroll', updateBackTop, { passive: true });
    updateBackTop();

    /* Premium ripple for buttons. */
    document.querySelectorAll('.ripple-host').forEach((button) => {
      if (button.dataset.rippleReady === 'true') return;
      button.dataset.rippleReady = 'true';

      button.addEventListener('pointerdown', (event) => {
        if (reduced || event.pointerType === 'touch') return;

        const rect = button.getBoundingClientRect();
        const ripple = document.createElement('span');
        const size = Math.max(rect.width, rect.height) * 1.35;
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        ripple.className = 'ripple';
        ripple.style.width = `${size}px`;
        ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;

        button.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      });
    });

    /* Subtle pointer glow on desktop cards. This is intentionally limited to
       cards so the effect remains premium instead of distracting. */
    if (!reduced && window.matchMedia?.('(pointer: fine)').matches) {
      document.querySelectorAll('.featured-card, .menu-item, .why-card, .testimonial-card').forEach((card) => {
        if (card.dataset.pointerGlowReady === 'true') return;
        card.dataset.pointerGlowReady = 'true';

        card.addEventListener('pointermove', (event) => {
          const rect = card.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * 100;
          const y = ((event.clientY - rect.top) / rect.height) * 100;
          card.style.setProperty('--pointer-x', `${x}%`);
          card.style.setProperty('--pointer-y', `${y}%`);
        }, { passive: true });

        card.addEventListener('pointerleave', () => {
          card.style.removeProperty('--pointer-x');
          card.style.removeProperty('--pointer-y');
        }, { passive: true });
      });
    }
  });
})();
