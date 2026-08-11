/**
 * ============================================================================
 * Hayat Sweets & Bakers — Premium Cursor Interaction Engine
 * ============================================================================
 * A lightweight, GPU-optimized, luxury cursor system with inertia,
 * interpolation, magnetic hover states, and full accessibility support.
 *
 * Author: Senior Frontend / Creative Technology Engineering
 * ============================================================================
 */

(() => {
  'use strict';

  /* ==========================================================================
     Configuration
     ========================================================================== */

  const CONFIG = {
    // Interpolation / easing
    dotLerp: 0.35,          // Fast-following inner dot
    ringLerp: 0.12,         // Slower, trailing outer ring
    magneticLerp: 0.18,     // Magnetic pull easing

    // Sizing (px)
    dotSize: 8,
    ringSize: 40,

    // Scale multipliers per state
    scale: {
      default: 1,
      hover: 1.6,
      button: 2.2,
      image: 2.8,
      text: 0.5,
      card: 2,
      disabled: 0
    },

    // Magnetic pull strength (0–1)
    magneticStrength: 0.35,
    magneticRadius: 80,

    // Selectors mapped to interaction states
    selectors: {
      hover: 'a, [data-cursor="hover"]',
      button: 'button, .btn, [data-cursor="button"]',
      card: '.card, [data-cursor="card"]',
      image: 'img, .gallery-item, [data-cursor="image"]',
      text: 'p, h1, h2, h3, h4, h5, h6, span[data-cursor-text], [data-cursor="text"]',
      magnetic: '[data-magnetic]',
      disabled: '[data-cursor="none"], input, textarea, select'
    },

    // Root element / body class toggles
    activeClass: 'cursor-active',
    hiddenClass: 'cursor-hidden',
    readyClass: 'cursor-ready'
  };

  /* ==========================================================================
     Environment Checks (Accessibility / Device Capability)
     ========================================================================== */

  const isTouchDevice =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches;

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  // Abort entirely on touch devices or reduced-motion preference —
  // native cursor / touch behavior is preserved and untouched.
  if (isTouchDevice || prefersReducedMotion) {
    return;
  }

  /* ==========================================================================
     DOM Cache
     ========================================================================== */

  let dotEl = null;
  let ringEl = null;
  let containerEl = null;

  function buildCursorDOM() {
    containerEl = document.createElement('div');
    containerEl.setAttribute('aria-hidden', 'true');
    containerEl.className = 'hsb-cursor-container';
    containerEl.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 2147483647;
    `;

    ringEl = document.createElement('div');
    ringEl.className = 'hsb-cursor-ring';
    ringEl.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: ${CONFIG.ringSize}px;
      height: ${CONFIG.ringSize}px;
      margin-left: -${CONFIG.ringSize / 2}px;
      margin-top: -${CONFIG.ringSize / 2}px;
      border-radius: 50%;
      border: 1px solid currentColor;
      pointer-events: none;
      will-change: transform, opacity;
      transform: translate3d(0, 0, 0) scale(1);
      transition: opacity 0.3s ease, border-color 0.3s ease;
      opacity: 0;
    `;

    dotEl = document.createElement('div');
    dotEl.className = 'hsb-cursor-dot';
    dotEl.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: ${CONFIG.dotSize}px;
      height: ${CONFIG.dotSize}px;
      margin-left: -${CONFIG.dotSize / 2}px;
      margin-top: -${CONFIG.dotSize / 2}px;
      border-radius: 50%;
      background: currentColor;
      pointer-events: none;
      will-change: transform, opacity;
      transform: translate3d(0, 0, 0) scale(1);
      transition: opacity 0.3s ease;
      opacity: 0;
    `;

    containerEl.appendChild(ringEl);
    containerEl.appendChild(dotEl);
    document.body.appendChild(containerEl);
  }

  /* ==========================================================================
     State
     ========================================================================== */

  const state = {
    // Raw pointer position
    mouseX: window.innerWidth / 2,
    mouseY: window.innerHeight / 2,

    // Interpolated dot position
    dotX: window.innerWidth / 2,
    dotY: window.innerHeight / 2,

    // Interpolated ring position
    ringX: window.innerWidth / 2,
    ringY: window.innerHeight / 2,

    currentState: 'default',
    targetScale: CONFIG.scale.default,
    currentScale: CONFIG.scale.default,

    isMagnetic: false,
    magneticEl: null,
    magneticX: 0,
    magneticY: 0,

    rafId: null,
    isVisible: false,
    hoveredEl: null
  };

  /* ==========================================================================
     Utility
     ========================================================================== */

  const lerp = (start, end, factor) => start + (end - start) * factor;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  /* ==========================================================================
     Animation Loop
     ========================================================================== */

  function animate() {
    // Determine target position (magnetic override or raw mouse position)
    let targetX = state.mouseX;
    let targetY = state.mouseY;

    if (state.isMagnetic && state.magneticEl) {
      targetX = state.mouseX + state.magneticX * CONFIG.magneticStrength;
      targetY = state.mouseY + state.magneticY * CONFIG.magneticStrength;
    }

    // Interpolate dot (fast) and ring (slower, trailing)
    state.dotX = lerp(state.dotX, targetX, CONFIG.dotLerp);
    state.dotY = lerp(state.dotY, targetY, CONFIG.dotLerp);

    const ringEase = state.isMagnetic ? CONFIG.magneticLerp : CONFIG.ringLerp;
    state.ringX = lerp(state.ringX, targetX, ringEase);
    state.ringY = lerp(state.ringY, targetY, ringEase);

    // Smooth scale transition
    state.currentScale = lerp(state.currentScale, state.targetScale, 0.18);

    if (dotEl && ringEl) {
      dotEl.style.transform = `translate3d(${state.dotX}px, ${state.dotY}px, 0) scale(${state.currentScale === 0 ? 0 : 1})`;
      ringEl.style.transform = `translate3d(${state.ringX}px, ${state.ringY}px, 0) scale(${state.currentScale})`;
    }

    state.rafId = requestAnimationFrame(animate);
  }

  /* ==========================================================================
     Hover System
     ========================================================================== */

  function resolveStateForElement(el) {
    if (!el || !el.closest) return 'default';

    if (el.closest(CONFIG.selectors.disabled)) return 'disabled';
    if (el.closest(CONFIG.selectors.image)) return 'image';
    if (el.closest(CONFIG.selectors.button)) return 'button';
    if (el.closest(CONFIG.selectors.card)) return 'card';
    if (el.closest(CONFIG.selectors.text)) return 'text';
    if (el.closest(CONFIG.selectors.hover)) return 'hover';

    return 'default';
  }

  function applyState(newState) {
    if (newState === state.currentState) return;

    if (ringEl) {
      ringEl.classList.remove(`hsb-state-${state.currentState}`);
      ringEl.classList.add(`hsb-state-${newState}`);
    }
    if (dotEl) {
      dotEl.classList.remove(`hsb-state-${state.currentState}`);
      dotEl.classList.add(`hsb-state-${newState}`);
    }

    state.currentState = newState;
    state.targetScale = CONFIG.scale[newState] ?? CONFIG.scale.default;
  }

  function handleMagneticAttraction(el, mouseX, mouseY) {
    if (!el) {
      state.isMagnetic = false;
      state.magneticEl = null;
      return;
    }

    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(mouseX - centerX, mouseY - centerY);

    if (distance < CONFIG.magneticRadius) {
      state.isMagnetic = true;
      state.magneticEl = el;
      state.magneticX = centerX - mouseX;
      state.magneticY = centerY - mouseY;
    } else {
      state.isMagnetic = false;
      state.magneticEl = null;
    }
  }

  function onPointerOver(event) {
    const target = event.target;
    if (!target) return;

    const resolvedState = resolveStateForElement(target);
    applyState(resolvedState);

    const magneticTarget = target.closest?.(CONFIG.selectors.magnetic);
    if (magneticTarget) {
      state.magneticEl = magneticTarget;
    }
  }

  function onPointerOut(event) {
    const related = event.relatedTarget;
    // Only reset if we're truly leaving an interactive zone
    if (!related || !related.closest?.(CONFIG.selectors.hover)) {
      applyState('default');
    }

    const magneticTarget = event.target?.closest?.(CONFIG.selectors.magnetic);
    if (magneticTarget && magneticTarget === state.magneticEl) {
      state.isMagnetic = false;
      state.magneticEl = null;
    }
  }

  /* ==========================================================================
     Event Listeners
     ========================================================================== */

  function onMouseMove(event) {
    state.mouseX = event.clientX;
    state.mouseY = event.clientY;

    if (!state.isVisible) {
      showCursor();
    }

    if (state.magneticEl) {
      handleMagneticAttraction(state.magneticEl, state.mouseX, state.mouseY);
    }
  }

  function onMouseLeaveWindow() {
    hideCursor();
  }

  function onMouseEnterWindow() {
    showCursor();
  }

  function showCursor() {
    state.isVisible = true;
    if (dotEl) dotEl.style.opacity = '1';
    if (ringEl) ringEl.style.opacity = '1';
  }

  function hideCursor() {
    state.isVisible = false;
    if (dotEl) dotEl.style.opacity = '0';
    if (ringEl) ringEl.style.opacity = '0';
  }

  function onResize() {
    // No layout-dependent caching to invalidate currently;
    // reserved for future responsive cursor sizing logic.
  }

  const listenerRegistry = [];

  function addListener(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listenerRegistry.push({ target, type, handler, options });
  }

  function bindEvents() {
    addListener(window, 'mousemove', onMouseMove, { passive: true });
    addListener(document, 'mouseover', onPointerOver, { passive: true });
    addListener(document, 'mouseout', onPointerOut, { passive: true });
    addListener(document, 'mouseleave', onMouseLeaveWindow, { passive: true });
    addListener(document, 'mouseenter', onMouseEnterWindow, { passive: true });
    addListener(window, 'resize', onResize, { passive: true });

    // If reduced-motion preference changes mid-session, tear down gracefully.
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionHandler = (e) => {
      if (e.matches) destroy();
    };
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', motionHandler);
      listenerRegistry.push({ target: motionQuery, type: 'change', handler: motionHandler, options: undefined });
    }
  }

  /* ==========================================================================
     Cleanup
     ========================================================================== */

  function destroy() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }

    listenerRegistry.forEach(({ target, type, handler, options }) => {
      target.removeEventListener(type, handler, options);
    });
    listenerRegistry.length = 0;

    if (containerEl?.parentNode) {
      containerEl.parentNode.removeChild(containerEl);
    }

    document.documentElement.classList.remove(CONFIG.readyClass);
    dotEl = null;
    ringEl = null;
    containerEl = null;
  }

  window.addEventListener('pagehide', destroy, { once: true });

  /* ==========================================================================
     Init
     ========================================================================== */

  function init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }

    try {
      buildCursorDOM();
      bindEvents();
      document.documentElement.classList.add(CONFIG.readyClass);
      state.rafId = requestAnimationFrame(animate);
    } catch (err) {
      // Fail silently in production — never break the host page.
      // Native cursor remains fully functional.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Hayat Sweets & Bakers cursor engine failed to initialize:', err);
      }
    }
  }

  init();
})();