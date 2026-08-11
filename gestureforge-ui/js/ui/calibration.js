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

  updateStepProgress(step, progress) {
    const steps = ['Size', 'Pinch', 'Palm', 'Fist'];
    const currentStep = steps[step];
    if (this.learningText) {
      this.learningText.textContent = `Calibrating ${currentStep}: ${Math.round(progress)}%`;
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
