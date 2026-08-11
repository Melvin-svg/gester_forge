/**
 * GestureForge Spell Wheel Controller
 * Handles radial slot positioning and selecting spells via user interaction or keys.
 */
class SpellWheelController {
  constructor() {
    this.container = document.getElementById('spell-wheel');
    this.slotsContainer = document.getElementById('wheel-slots');
    this.labelsContainer = document.getElementById('wheel-labels');

    if (this.container) {
      this.initSlots();
    }
  }

  initSlots() {
    if (!this.slotsContainer) return;
    this.slotsContainer.innerHTML = '';
    
    // Position 5 spell slots in a circle
    const spellsList = Object.keys(GF_CONFIG.SPELLS).filter(k => k !== 'raise');
    const radius = 80; // px distance from center
    const total = spellsList.length;

    spellsList.forEach((key, idx) => {
      const spell = GF_CONFIG.SPELLS[key];
      const angle = (idx * (2 * Math.PI) / total) - (Math.PI / 2); // Start at top
      
      const x = Math.round(Math.cos(angle) * radius) + 110 - 22; // half width offset
      const y = Math.round(Math.sin(angle) * radius) + 110 - 22;

      const slot = document.createElement('div');
      slot.className = 'wheel-slot';
      slot.setAttribute('data-spell', key);
      slot.style.left = `${x}px`;
      slot.style.top = `${y}px`;
      slot.innerHTML = `<span>${spell.icon}</span>`;
      
      this.slotsContainer.appendChild(slot);
    });
  }

  show() {
    if (this.container) this.container.classList.add('active');
  }

  hide() {
    if (this.container) this.container.classList.remove('active');
  }
}

window.SpellWheelController = SpellWheelController;
