/**
 * GestureForge HUD Controller
 * Manages HP, MP, score, level indicators, combo queue animations, and active cooldown overlays.
 */
class HudController {
  constructor() {
    this.scoreVal = document.getElementById('hud-score');
    this.comboVal = document.getElementById('hud-combo');
    this.levelVal = document.getElementById('hud-level');
    this.hpFill = document.getElementById('hp-fill');
    this.hpShield = document.getElementById('hp-shield');
    this.hpText = document.getElementById('hp-text');
    this.manaFill = document.getElementById('mana-fill');
    
    this.gestName = document.getElementById('gesture-name');
    this.gestConfFill = document.getElementById('gesture-conf-fill');
    this.gestConfText = document.getElementById('gesture-conf-text');
    this.fpsValue = document.getElementById('fps-value');

    this.cooldowns = {
      'open_palm': document.getElementById('cd-shield'),
      'pinch': document.getElementById('cd-fireball'),
      'swipe': document.getElementById('cd-dash'),
      'fist': document.getElementById('cd-earth'),
      'circle': document.getElementById('cd-ice')
    };
  }

  updatePlayerStats(player) {
    if (this.scoreVal) this.scoreVal.textContent = player.score;
    if (this.comboVal) {
      this.comboVal.textContent = `x${player.combo || 1}`;
      if (player.combo > 1) {
        this.comboVal.classList.add('glow');
      } else {
        this.comboVal.classList.remove('glow');
      }
    }
    if (this.levelVal) this.levelVal.textContent = `L${player.level}`;

    // HP & MP Update
    const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
    const shieldPct = Math.max(0, (player.shieldTime / player.shieldMaxTime) * 100);
    
    if (this.hpFill) this.hpFill.style.width = `${hpPct}%`;
    if (this.hpShield) this.hpShield.style.width = player.shieldActive ? `${shieldPct}%` : '0%';
    if (this.hpText) this.hpText.textContent = `${Math.round(player.hp)} / ${player.maxHp}`;
    
    const mpPct = Math.max(0, (player.mp / player.maxMp) * 100);
    if (this.manaFill) this.manaFill.style.width = `${mpPct}%`;
  }

  updateGestureStatus(gesture, confidence) {
    if (this.gestName) this.gestName.textContent = gesture;
    const pct = Math.round(confidence * 100);
    if (this.gestConfFill) this.gestConfFill.style.width = `${pct}%`;
    if (this.gestConfText) this.gestConfText.textContent = confidence > 0 ? `${pct}%` : '--';
  }

  updateFps(fps) {
    if (this.fpsValue) this.fpsValue.textContent = fps;
  }

  updateCooldowns(currentCooldowns, maxCooldowns) {
    for (const [key, element] of Object.entries(this.cooldowns)) {
      if (element && currentCooldowns[key] !== undefined) {
        const remaining = currentCooldowns[key];
        const max = maxCooldowns[key] || 1;
        const pct = Math.min(100, Math.max(0, (remaining / max) * 100));
        element.style.width = `${pct}%`;
      }
    }
  }
}

window.HudController = HudController;
