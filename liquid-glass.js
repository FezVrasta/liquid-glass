// Liquid Glass Effect - Based on https://github.com/shuding/liquid-glass
// Created by Shu Ding (https://github.com/shuding/liquid-glass) in 2025.

(function () {
  'use strict';

  // Utility functions
  function smoothStep(a, b, t) {
    t = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function length(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  // Generate squircle path matching the CSS mask path format
  // CSS mask uses: M0,28 C0,6 6,0 28,0 (control point at 6/28 ≈ 21% of radius)
  function getSquirclePath(w, h, r, o = 0) {
    const k = r * (6 / 28);
    const L = o;
    const T = o;
    const R = w - o;
    const B = h - o;

    return `
      M ${L},${T + r}
      C ${L},${T + k} ${L + k},${T} ${L + r},${T}
      L ${R - r},${T}
      C ${R - k},${T} ${R},${T + k} ${R},${T + r}
      L ${R},${B - r}
      C ${R},${B - k} ${R - k},${B} ${R - r},${B}
      L ${L + r},${B}
      C ${L + k},${B} ${L},${B - k} ${L},${B - r}
      Z
    `
      .replace(/\s+/g, ' ')
      .trim();
  }

  function squircleSDF(x, y, width, height, radius) {
    // Simplified squircle SDF for the shader (using power 4 for the squircle-like shape)
    const qx = Math.max(Math.abs(x) - width + radius, 0) / radius;
    const qy = Math.max(Math.abs(y) - height + radius, 0) / radius;
    const dist = Math.pow(Math.pow(qx, 4) + Math.pow(qy, 4), 1 / 4);
    
    const dx = Math.abs(x) - width + radius;
    const dy = Math.abs(y) - height + radius;
    const outside = dist * radius - radius;
    const inside = Math.min(Math.max(dx, dy), 0);
    
    return outside + inside;
  }

  function texture(x, y) {
    return { type: 't', x, y };
  }

  // Generate unique ID
  function generateId() {
    return 'liquid-glass-' + Math.random().toString(36).substr(2, 9);
  }

  // Main Shader class
  class Shader {
    constructor(options = {}) {
      this.width = options.width || 100;
      this.height = options.height || 100;
      this.fragment = options.fragment || ((uv) => texture(uv.x, uv.y));
      this.canvasDPI = 1;
      this.id = generateId();
      this.targetElement = options.targetElement || null;

      this.mouse = { x: 0, y: 0 };
      this.mouseUsed = false;

      this.createFilter();
      this.updateShader();
    }

    createFilter() {
      // Create SVG with filter and rim in one element
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      const defs = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'defs'
      );

      // Displacement filter
      const filter = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'filter'
      );
      filter.setAttribute('id', `${this.id}_filter`);
      filter.setAttribute('filterUnits', 'userSpaceOnUse');
      filter.setAttribute('colorInterpolationFilters', 'sRGB');
      filter.setAttribute('x', '0');
      filter.setAttribute('y', '0');
      filter.setAttribute('width', this.width.toString());
      filter.setAttribute('height', this.height.toString());

      this.feImage = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'feImage'
      );
      this.feImage.setAttribute('id', `${this.id}_map`);
      this.feImage.setAttribute('width', this.width.toString());
      this.feImage.setAttribute('height', this.height.toString());

      this.feDisplacementMap = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'feDisplacementMap'
      );
      this.feDisplacementMap.setAttribute('in', 'SourceGraphic');
      this.feDisplacementMap.setAttribute('in2', `${this.id}_map`);
      this.feDisplacementMap.setAttribute('xChannelSelector', 'R');
      this.feDisplacementMap.setAttribute('yChannelSelector', 'G');

      filter.appendChild(this.feImage);
      filter.appendChild(this.feDisplacementMap);
      defs.appendChild(filter);

      // Mask for squircle shape
      const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
      mask.setAttribute('id', `${this.id}_mask`);
      mask.setAttribute('maskUnits', 'userSpaceOnUse');
      this.maskPathElement = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      );
      this.maskPathElement.setAttribute('fill', 'white');
      mask.appendChild(this.maskPathElement);
      defs.appendChild(mask);

      this.svg.appendChild(defs);
      this.defs = defs;

      // Create canvas for displacement map (hidden)
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width * this.canvasDPI;
      this.canvas.height = this.height * this.canvasDPI;
      this.canvas.style.display = 'none';

      this.context = this.canvas.getContext('2d');
    }

    updateShader() {
      const mouseProxy = new Proxy(this.mouse, {
        get: (target, prop) => {
          this.mouseUsed = true;
          return target[prop];
        },
      });

      this.mouseUsed = false;

      const w = this.width * this.canvasDPI;
      const h = this.height * this.canvasDPI;
      const data = new Uint8ClampedArray(w * h * 4);

      let maxScale = 0;
      const rawValues = [];

      for (let i = 0; i < data.length; i += 4) {
        const x = (i / 4) % w;
        const y = Math.floor(i / 4 / w);
        const pos = this.fragment({ x: x / w, y: y / h }, mouseProxy);
        const dx = pos.x * w - x;
        const dy = pos.y * h - y;
        maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
        rawValues.push(dx, dy);
      }

      maxScale *= 0.5;

      let index = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = rawValues[index++] / maxScale + 0.5;
        const g = rawValues[index++] / maxScale + 0.5;
        data[i] = r * 255;
        data[i + 1] = g * 255;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }

      this.context.putImageData(new ImageData(data, w, h), 0, 0);
      this.feImage.setAttributeNS(
        'http://www.w3.org/1999/xlink',
        'href',
        this.canvas.toDataURL()
      );
      this.feDisplacementMap.setAttribute(
        'scale',
        (maxScale / this.canvasDPI).toString()
      );
    }

    applyTo(element, options = {}) {
      const rimContainer =
        options.rimContainer || element.parentElement || element;
      const showRim = options.rim !== false;
      const borderRadius = options.borderRadius || 12;

      // Position the SVG over the element
      this.svg.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 10;
        overflow: visible;
      `
        .replace(/\s+/g, ' ')
        .trim();

      // Store options
      this.borderRadius = borderRadius;
      this.squircle = options.squircle || false;

      // Apply squircle mask if enabled
      if (this.squircle) {
        const maskUrl = `url(#${this.id}_mask)`;
        element.style.maskImage = maskUrl;
        element.style.webkitMaskImage = maskUrl;
      } else {
        element.style.borderRadius = `${borderRadius}px`;
      }

      // Add rim
      if (showRim) {
        const rimGradient = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'linearGradient'
        );
        rimGradient.setAttribute('id', `${this.id}_rim`);
        rimGradient.setAttribute('gradientUnits', 'userSpaceOnUse');
        rimGradient.innerHTML = `
          <stop offset="0%" stop-color="rgba(255,255,255,0.5)" />
          <stop offset="40%" stop-color="rgba(255,255,255,0)" />
          <stop offset="60%" stop-color="rgba(255,255,255,0)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0.3)" />
        `;
        this.defs.appendChild(rimGradient);

        // Use path for squircle, rect for regular rounded corners
        if (this.squircle) {
          const rimPath = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path'
          );
          rimPath.setAttribute('fill', 'none');
          rimPath.setAttribute('stroke', `url(#${this.id}_rim)`);
          rimPath.setAttribute('stroke-width', '1');
          this.svg.appendChild(rimPath);
          this.rimPath = rimPath;
        } else {
          const rimRect = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'rect'
          );
          rimRect.setAttribute('fill', 'none');
          rimRect.setAttribute('stroke', `url(#${this.id}_rim)`);
          rimRect.setAttribute('stroke-width', '1');
          this.svg.appendChild(rimRect);
          this.rimRect = rimRect;
        }
        this.rimGradient = rimGradient;
      }

      rimContainer.appendChild(this.svg);

      // Update dimensions on resize - use the target element's inner size
      const updateDimensions = () => {
        const w = element.clientWidth;
        const h = element.clientHeight;

        if (w === 0 || h === 0) return; // Not rendered yet

        this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

        if (this.squircle) {
          const squirclePath = getSquirclePath(w, h, this.borderRadius, 0);
          if (this.maskPathElement) {
            this.maskPathElement.setAttribute('d', squirclePath);
          }
          if (this.rimPath) {
            this.rimPath.setAttribute(
              'd',
              getSquirclePath(w, h, this.borderRadius, 0.5)
            );
          }
        }

        if (this.rimRect) {
          this.rimRect.setAttribute('x', '0.5');
          this.rimRect.setAttribute('y', '0.5');
          this.rimRect.setAttribute('width', (w - 1).toString());
          this.rimRect.setAttribute('height', (h - 1).toString());
          this.rimRect.setAttribute('rx', this.borderRadius.toString());
          this.rimRect.setAttribute('ry', this.borderRadius.toString());
        }

        if (this.rimGradient) {
          this.rimGradient.setAttribute('x1', '0');
          this.rimGradient.setAttribute('y1', '0');
          this.rimGradient.setAttribute('x2', w.toString());
          this.rimGradient.setAttribute('y2', h.toString());
        }

        this.svg.style.width = `${w}px`;
        this.svg.style.height = `${h}px`;
      };

      // Initial update
      updateDimensions();

      // Watch for resize on the element
      this.resizeObserver = new ResizeObserver(updateDimensions);
      this.resizeObserver.observe(element);

      // Apply backdrop-filter
      const backdropFilter = `url(#${this.id}_filter) blur(0.5px) contrast(1.05) brightness(1.02) saturate(1.05)`;
      element.style.backdropFilter = backdropFilter;
      element.style.webkitBackdropFilter = backdropFilter;

      this.targetElement = element;

      return this;
    }

    destroy() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
      this.svg.remove();
      this.canvas.remove();
      if (this.targetElement) {
        this.targetElement.style.backdropFilter = '';
        this.targetElement.style.webkitBackdropFilter = '';
      }
    }
  }

  // Public API
  window.LiquidGlass = {
    _applied: new WeakMap(),

    applyTo(element, options = {}) {
      // Prevent double-application
      if (this._applied.has(element)) {
        return this._applied.get(element);
      }

      const width = options.width || element.offsetWidth || 300;
      const height = options.height || element.offsetHeight || 200;

      const shader = new Shader({
        width: width,
        height: height,
        fragment: (uv, mouse) => {
          const ix = uv.x - 0.5;
          const iy = uv.y - 0.5;
          const distanceToEdge = squircleSDF(ix, iy, 0.3, 0.2, 0.6);
          const displacement = smoothStep(0.8, 0, distanceToEdge - 0.15);
          const scaled = smoothStep(0, 1, displacement);
          return texture(ix * scaled + 0.5, iy * scaled + 0.5);
        },
      });

      shader.applyTo(element, options);

      const result = {
        shader: shader,
        destroy: () => {
          shader.destroy();
          this._applied.delete(element);
        },
      };

      this._applied.set(element, result);
      return result;
    },

    // Apply to an element with liquid-glass class (card_mod integration)
    // Classes supported:
    //   liquid-glass           - apply effect
    //   liquid-glass-squircle  - use squircle corners
    //   liquid-glass-no-rim    - hide rim effect
    // CSS variables supported:
    //   --liquid-glass-radius: 24px
    applyToElement(element) {
      if (!element.classList.contains('liquid-glass')) return null;

      const squircle = element.classList.contains('liquid-glass-squircle');
      const showRim = !element.classList.contains('liquid-glass-no-rim');

      // Find the inner target (ha-card inside the element, or the element itself)
      let target = element.shadowRoot?.querySelector('ha-card') || element;

      // If element is a card wrapper, look for ha-card in shadow
      if (element.shadowRoot) {
        target =
          element.shadowRoot.querySelector('ha-card') ||
          element.shadowRoot.querySelector('.card') ||
          element.shadowRoot.firstElementChild ||
          element;
      }

      // Get border radius from CSS variable (check both element and target) or from target's computed style
      const elementStyle = getComputedStyle(element);
      const targetStyle = getComputedStyle(target);
      let borderRadius =
        parseFloat(elementStyle.getPropertyValue('--liquid-glass-radius')) ||
        parseFloat(targetStyle.getPropertyValue('--liquid-glass-radius')) ||
        parseFloat(targetStyle.borderRadius) ||
        12;

      if (target.parentElement) {
        const parentStyle = getComputedStyle(target.parentElement);
        if (parentStyle.position === 'static') {
          target.parentElement.style.position = 'relative';
        }
      }

      return this.applyTo(target, {
        rimContainer: target.parentElement || target,
        borderRadius: borderRadius,
        rim: showRim,
        squircle: squircle,
      });
    },
  };

  // Auto-apply to elements with liquid-glass class (via card_mod)
  function initAutoApply() {
    const processedElements = new WeakSet();

    function checkAndApply(element) {
      if (processedElements.has(element)) return;

      // Check for liquid-glass class (card_mod integration)
      if (element.classList?.contains('liquid-glass')) {
        processedElements.add(element);

        // Wait for shadowRoot to be ready if it's a custom element
        const tryApply = (attempts = 0) => {
          if (attempts > 30) return;

          // For custom elements, wait for shadow DOM
          if (
            element.shadowRoot === undefined ||
            (element.shadowRoot && element.shadowRoot.firstElementChild)
          ) {
            window.LiquidGlass.applyToElement(element);
          } else {
            setTimeout(() => tryApply(attempts + 1), 100);
          }
        };

        tryApply();
        return;
      }

      // Legacy: check for liquid_glass config
      const config = element._config || element.config;
      if (config?.liquid_glass) {
        processedElements.add(element);

        const tryApply = (attempts = 0) => {
          if (attempts > 30) return;

          if (element.shadowRoot && element.shadowRoot.firstElementChild) {
            window.LiquidGlass.applyToCard(element);
          } else {
            setTimeout(() => tryApply(attempts + 1), 100);
          }
        };

        tryApply();
      }
    }

    // Recursively traverse shadow DOMs
    function traverseDeep(root, callback) {
      if (!root) return;
      const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
      elements.forEach((el) => {
        callback(el);
        if (el.shadowRoot) {
          traverseDeep(el.shadowRoot, callback);
        }
      });
    }

    function scanForElements() {
      // Scan for elements with liquid-glass class
      document.querySelectorAll('.liquid-glass').forEach((el) => {
        checkAndApply(el);
      });

      // Deep scan for cards with liquid_glass config or class in shadow DOM
      traverseDeep(document.body, (el) => {
        if (
          el.classList?.contains('liquid-glass') ||
          el._config?.liquid_glass ||
          el.config?.liquid_glass
        ) {
          checkAndApply(el);
        }
      });
    }

    // Watch for DOM changes
    const observer = new MutationObserver(() =>
      setTimeout(scanForElements, 100)
    );
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial scan
    setTimeout(scanForElements, 500);

    // Expose manual scan
    window.LiquidGlass.scan = scanForElements;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () =>
      setTimeout(initAutoApply, 1000)
    );
  } else {
    setTimeout(initAutoApply, 1000);
  }

  console.info(
    '%c LIQUID-GLASS %c v1.1.0 ',
    'color: white; background: #007AFF; font-weight: 700;',
    'color: #007AFF; background: white; font-weight: 700;'
  );
})();
