
(() => {
  if (customElements.get('um-category-showcase')) return;

  class UMCategoryShowcase extends HTMLElement {
    connectedCallback() {
      if (this.controller) return;
      this.track = this.querySelector('.um-categories__track');
      if (!this.track) return;

      this.controller = new AbortController();
      const signal = this.controller.signal;
      this.cards = Array.from(this.track.children);
      this.controls = this.querySelector('.um-categories__controls');
      this.arrows = this.querySelector('.um-categories__arrows');
      this.dots = this.querySelector('.um-categories__dots');
      this.prev = this.querySelector('[data-um-prev]');
      this.next = this.querySelector('[data-um-next]');
      this.pauseButton = this.querySelector('[data-um-pause]');
      this.mobileQuery = matchMedia('(max-width: 749px)');
      this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
      this.userPaused = false;
      this.hovered = false;
      this.focused = false;
      this.visible = false;
      this.editorSelected = false;

      const listen = (target, event, callback, options = {}) =>
        target.addEventListener(event, callback, { ...options, signal });

      listen(this.prev, 'click', () => this.step(-1));
      listen(this.next, 'click', () => this.step(1));

      listen(this.dots, 'click', event => {
        const button = event.target.closest('[data-um-page]');
        if (!button) return;
        this.pauseForInteraction();
        this.go(Number(button.dataset.umPage));
      });

      listen(this.pauseButton, 'click', () => {
        this.userPaused = !this.userPaused;
        this.refreshAutoplay();
      });

      listen(this.track, 'scroll', () => this.scheduleUpdate(), { passive: true });
      listen(this.track, 'pointerdown', () => this.pauseForInteraction(), { passive: true });
      listen(this.track, 'wheel', () => this.pauseForInteraction(), { passive: true });

      listen(this, 'mouseenter', () => {
        this.hovered = true;
        this.refreshAutoplay();
      });
      listen(this, 'mouseleave', () => {
        this.hovered = false;
        this.refreshAutoplay();
      });
      listen(this, 'focusin', () => {
        this.focused = true;
        this.refreshAutoplay();
      });
      listen(this, 'focusout', () => {
        queueMicrotask(() => {
          if (!this.isConnected) return;
          this.focused = this.contains(document.activeElement);
          this.refreshAutoplay();
        });
      });

      listen(this.track, 'keydown', event => {
        if (!this.carousel || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        this.pauseForInteraction();
        if (event.key === 'Home') this.go(0);
        else if (event.key === 'End') this.go(this.positions.length - 1);
        else this.step(event.key === 'ArrowRight' ? 1 : -1);
      });

      listen(this.mobileQuery, 'change', () => this.configure());
      listen(this.motionQuery, 'change', () => this.refreshAutoplay());
      listen(document, 'visibilitychange', () => this.refreshAutoplay());

      listen(document, 'shopify:block:select', event => {
        const card = event.target.closest('[data-block-id]');
        if (!card || !this.contains(card)) return;
        this.editorSelected = true;
        this.refreshAutoplay();
        if (this.carousel) {
          this.track.scrollTo({ left: this.cardPosition(card), behavior: 'auto' });
        }
      });
      listen(document, 'shopify:block:deselect', event => {
        if (!this.contains(event.target)) return;
        this.editorSelected = false;
        this.refreshAutoplay();
      });

      this.resizeObserver = new ResizeObserver(() => this.configure());
      this.resizeObserver.observe(this.track);

      this.intersectionObserver = new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting;
        this.refreshAutoplay();
      }, { threshold: 0.1 });
      this.intersectionObserver.observe(this);

      this.configure();
    }

    get screen() {
      return this.mobileQuery.matches ? 'mobile' : 'desktop';
    }

    option(name) {
      return this.getAttribute('data-' + this.screen + '-' + name);
    }

    cardPosition(card) {
      const trackRect = this.track.getBoundingClientRect();
      return card.getBoundingClientRect().left - trackRect.left + this.track.scrollLeft;
    }

    configure() {
      if (!this.isConnected) return;
      this.carousel = this.option('layout') === 'carousel';
      const max = Math.max(0, this.track.scrollWidth - this.track.clientWidth);
      this.positions = [0];

      if (this.carousel && max > 2) {
        this.cards.forEach(card => {
          const position = Math.max(0, Math.min(max, this.cardPosition(card)));
          if (position - this.positions[this.positions.length - 1] > 2) {
            this.positions.push(position);
          }
        });
        if (max - this.positions[this.positions.length - 1] > 2) {
          this.positions.push(max);
        }
      }

      this.overflowing = this.carousel && this.positions.length > 1;
      const arrows = this.overflowing && this.option('arrows') === 'true';
      const dots = this.overflowing && this.option('dots') === 'true';
      this.arrows.hidden = !arrows;
      this.dots.hidden = !dots;
      this.track.tabIndex = this.overflowing ? 0 : -1;

      if (this.dots.childElementCount !== this.positions.length) {
        const fragment = document.createDocumentFragment();
        this.positions.forEach((position, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.umPage = String(index);
          button.setAttribute('aria-label', 'Ir a posición ' + (index + 1));
          button.setAttribute('aria-controls', this.track.id);
          fragment.append(button);
        });
        this.dots.replaceChildren(fragment);
      }

      if (!this.carousel && this.track.scrollLeft) {
        this.track.scrollLeft = 0;
      }
      this.update();
      this.refreshAutoplay();
    }

    scheduleUpdate() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.update();
      });
    }

    update() {
      const position = this.track.scrollLeft;
      this.index = this.positions.reduce((best, value, index) =>
        Math.abs(value - position) < Math.abs(this.positions[best] - position)
          ? index : best, 0);

      const loop = this.dataset.loop === 'true';
      this.prev.disabled = !loop && this.index === 0;
      this.next.disabled = !loop && this.index === this.positions.length - 1;
      Array.from(this.dots.children).forEach((button, index) => {
        button.setAttribute('aria-current', String(index === this.index));
      });
    }

    go(index) {
      if (!this.overflowing) return;
      const last = this.positions.length - 1;
      if (this.dataset.loop === 'true') {
        index = (index + this.positions.length) % this.positions.length;
      } else {
        index = Math.max(0, Math.min(last, index));
      }
      this.track.scrollTo({
        left: this.positions[index],
        behavior: this.motionQuery.matches ? 'auto' : 'smooth'
      });
    }

    step(direction, automatic = false) {
      if (!automatic) this.pauseForInteraction();
      this.update();
      this.go(this.index + direction);
    }

    pauseForInteraction() {
      this.userPaused = true;
      this.refreshAutoplay();
    }

    refreshAutoplay() {
      clearInterval(this.timer);
      this.timer = null;

      const enabled = this.overflowing &&
        this.option('autoplay') === 'true' &&
        !this.motionQuery.matches &&
        !window.Shopify?.designMode;

      this.pauseButton.hidden = !enabled;
      this.pauseButton.textContent = this.userPaused ? 'Reanudar' : 'Pausar';
      this.pauseButton.setAttribute('aria-label',
        this.userPaused ? 'Reanudar reproducción automática' : 'Pausar reproducción automática');

      this.controls.hidden =
        this.arrows.hidden && this.dots.hidden && this.pauseButton.hidden;

      if (!enabled || this.userPaused || this.hovered || this.focused ||
          this.editorSelected || !this.visible || document.hidden) return;

      const delay = Math.max(3000, Number(this.dataset.interval) || 5000);
      this.timer = setInterval(() => {
        this.update();
        if (this.index === this.positions.length - 1 && this.dataset.loop !== 'true') {
          this.userPaused = true;
          this.refreshAutoplay();
          return;
        }
        this.step(1, true);
      }, delay);
    }

    disconnectedCallback() {
      this.controller?.abort();
      this.controller = null;
      this.resizeObserver?.disconnect();
      this.intersectionObserver?.disconnect();
      clearInterval(this.timer);
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  customElements.define('um-category-showcase', UMCategoryShowcase);
})();
