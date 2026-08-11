/**
 * GestureForge Main Menu Controller
 * Handles particle effects, navigation buttons, and player profile updates.
 */
class MainMenuController {
  constructor(canvasId, onActionCallback) {
    this.canvas = document.getElementById(canvasId);
    this.onAction = onActionCallback;
    
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.particles = [];
      this.animationFrame = null;
      this.initParticles();
    }

    this.bindEvents();
  }

  bindEvents() {
    const buttons = document.querySelectorAll('.menu-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        if (action && this.onAction) {
          this.onAction(action);
        }
      });
    });
  }

  initParticles() {
    this.particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 2 + 1,
      speedX: Math.random() * 0.4 - 0.2,
      speedY: Math.random() * -0.5 - 0.1,
      opacity: Math.random() * 0.5 + 0.1
    }));
  }

  start() {
    if (!this.canvas) return;
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeCanvas.bind(this));
    this.animate();
  }

  stop() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    window.removeEventListener('resize', this.resizeCanvas.bind(this));
  }

  resizeCanvas() {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.width = this.canvas.parentElement.clientWidth;
      this.canvas.height = this.canvas.parentElement.clientHeight;
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#5b8def';

    this.particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;

      if (p.y < 0) {
        p.y = this.canvas.height;
        p.x = Math.random() * this.canvas.width;
      }

      this.ctx.globalAlpha = p.opacity;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    });

    this.ctx.globalAlpha = 1.0;
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  updateProfile(name, calibrated) {
    const profileName = document.querySelector('.profile-name');
    const profileStatus = document.querySelector('.profile-status');
    if (profileName) profileName.textContent = name;
    if (profileStatus) {
      profileStatus.textContent = calibrated ? 'Calibrated • Dominant Hand' : 'Uncalibrated';
    }
  }
}

window.MainMenuController = MainMenuController;
