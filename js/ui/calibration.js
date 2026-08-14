/**
 * GestureForge Calibration UI Controller
 * Manages steps, neuron grids, quality bars, and calibration buttons.
 */
class CalibrationController {
  constructor(onStartGame, onRecalibrate) {
    this.btnStart = document.getElementById('btn-start-game');
    this.btnRecalib = document.getElementById('btn-recalibrate');
    this.learningText = document.getElementById('learning-text');
    this.neuronGrid = document.getElementById('neuron-grid');
    this.previewName = document.getElementById('preview-name');
    this.previewConfFill = document.querySelector('.gesture-preview .conf-fill');
    this.previewConfText = document.querySelector('.gesture-preview .conf-text');
    this.checklistItems = {};
    document.querySelectorAll('#gesture-checklist .check-item').forEach(item => {
      this.checklistItems[item.dataset.gesture] = item;
    });

    this.onStartGame = onStartGame;
    this.onRecalibrate = onRecalibrate;

    this.initNeuronGrid();
    this.bindEvents();
  }

  initNeuronGrid() {
    if (!this.neuronGrid) return;
    this.neuronGrid.innerHTML = '';
    for (let i = 0; i < 12; i++) {
      const dot = document.createElement('div');
      dot.className = 'neuron-dot';
      this.neuronGrid.appendChild(dot);
    }
  }

  bindEvents() {
    if (this.btnStart) {
      this.btnStart.addEventListener('click', () => {
        if (this.onStartGame) this.onStartGame();
      });
    }
    if (this.btnRecalib) {
      this.btnRecalib.addEventListener('click', () => {
        this.resetChecklist();
        if (this.onRecalibrate) this.onRecalibrate();
      });
    }
  }

  updateConfidence(gesture, confidence) {
    if (this.previewName) this.previewName.textContent = gesture;
    const pct = Math.round(confidence * 100);
    if (this.previewConfFill) this.previewConfFill.style.width = `${pct}%`;
    if (this.previewConfText) this.previewConfText.textContent = `${pct}%`;

    // Light up neuron dots randomly based on confidence
    if (this.neuronGrid) {
      const dots = this.neuronGrid.querySelectorAll('.neuron-dot');
      dots.forEach((dot, idx) => {
        if (Math.random() < confidence) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }
  }

  updateStepProgress(step, progress, hand = 'right', customStepName = null) {
    const steps = ['Size', 'Pinch', 'Palm', 'Fist'];
    const currentStep = customStepName || steps[step] || 'Custom';
    if (this.learningText) {
      const handStr = hand.charAt(0).toUpperCase() + hand.slice(1);
      this.learningText.textContent = `Calibrating ${handStr} Hand (${currentStep}): ${Math.round(progress)}%`;
    }
  }

  markGestureVerified(key) {
    const item = this.checklistItems[key];
    if (!item || item.classList.contains('verified')) return;
    item.classList.add('verified');
    const status = item.querySelector('.check-status');
    if (status) status.textContent = 'Verified';
  }

  setGestureDetecting(key) {
    const item = this.checklistItems[key];
    if (!item || item.classList.contains('verified')) return;
    Object.values(this.checklistItems).forEach(check => {
      if (!check.classList.contains('verified')) check.classList.remove('detecting');
    });
    item.classList.add('detecting');
    const status = item.querySelector('.check-status');
    if (status) status.textContent = 'Detecting...';
  }

  clearGestureDetecting() {
    Object.values(this.checklistItems).forEach(item => {
      if (!item.classList.contains('detecting')) return;
      item.classList.remove('detecting');
      const status = item.querySelector('.check-status');
      if (status) status.textContent = 'Not tested';
    });
  }

  resetChecklist() {
    Object.values(this.checklistItems).forEach(item => {
      item.classList.remove('verified', 'detecting');
      const status = item.querySelector('.check-status');
      if (status) status.textContent = 'Not tested';
    });
  }

  updateDominantHand(hand) {
    const el = document.getElementById('calib-dominant-hand');
    if (el) {
      el.textContent = hand.charAt(0).toUpperCase() + hand.slice(1);
    }
  }

  setCalibratedState(isCalibrated) {
    if (this.btnStart) this.btnStart.disabled = !isCalibrated;
    if (this.learningText) {
      this.learningText.textContent = isCalibrated 
        ? "Calibration Successful! Adaptive profile active." 
        : "Complete calibration to unlock gameplay.";
    }
  }
}

window.CalibrationController = CalibrationController;
