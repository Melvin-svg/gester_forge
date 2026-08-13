/**
 * GestureForge Settings UI Panel Controller
 * Links accessibility sliders and calibration reset commands.
 */
class SettingsPanelController {
  constructor(onSettingChanged, onResetProfile) {
    this.onSettingChanged = onSettingChanged;
    this.onResetProfile = onResetProfile;

    this.handSelect = document.getElementById('setting-hand');
    this.oneHandToggle = document.querySelector('#toggle-onehand input');
    this.mirrorToggle = document.querySelector('#toggle-mirror input');
    
    this.sensitivitySlider = document.getElementById('slider-sensitivity');
    this.sensitivityValue = document.getElementById('val-sensitivity');

    this.btnReset = document.getElementById('btn-reset-profile');

    this.bindEvents();
  }

  bindEvents() {
    // Dominant hand
    if (this.handSelect) {
      this.handSelect.addEventListener('change', (e) => {
        this.triggerChange('dominantHand', e.target.value);
      });
    }

    // Toggles
    const setupToggle = (element, key) => {
      if (element) {
        element.addEventListener('change', (e) => {
          this.triggerChange(key, e.target.checked);
        });
      }
    };
    setupToggle(this.oneHandToggle, 'oneHandMode');
    setupToggle(this.mirrorToggle, 'mirrored');

    // Sensitivity slider
    if (this.sensitivitySlider) {
      this.sensitivitySlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (this.sensitivityValue) this.sensitivityValue.textContent = `${val}%`;
        // Convert 0-100 to 0.5x - 2.0x scalar multiplier
        const scalar = 0.5 + (val / 100) * 1.5;
        this.triggerChange('sensitivity', scalar);
      });
    }

    // Reset profile
    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => {
        if (this.onResetProfile) this.onResetProfile();
      });
    }
  }

  triggerChange(key, value) {
    if (this.onSettingChanged) {
      this.onSettingChanged(key, value);
    }
  }
}

window.SettingsPanelController = SettingsPanelController;
