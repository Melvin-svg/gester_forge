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

    // References to custom gesture elements
    this.btnAddCustom = document.getElementById('btn-add-custom-gesture');
    this.customNameInput = document.getElementById('custom-gesture-name');
    this.customActionSelect = document.getElementById('custom-gesture-action');
    this.customListContainer = document.getElementById('custom-gestures-list');

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

    // Custom gesture add button
    if (this.btnAddCustom) {
      this.btnAddCustom.addEventListener('click', () => {
        const name = this.customNameInput ? this.customNameInput.value.trim() : '';
        const action = this.customActionSelect ? this.customActionSelect.value : '';
        if (!name || !action) {
          alert('Please enter a gesture name and select a mapped spell action.');
          return;
        }
        
        // Trigger event to add custom gesture
        this.triggerChange('addCustomGesture', { name, action });
        
        // Reset inputs
        if (this.customNameInput) this.customNameInput.value = '';
        if (this.customActionSelect) this.customActionSelect.selectedIndex = 0;
      });
    }
  }

  updateHandSelection(hand) {
    if (this.handSelect) {
      this.handSelect.value = hand;
    }
  }

  renderCustomGestures(customGestures, onRemoveCallback) {
    if (!this.customListContainer) return;
    this.customListContainer.innerHTML = '';

    const entries = Object.entries(customGestures || {});
    if (entries.length === 0) {
      this.customListContainer.innerHTML = '<span class="setting-desc" style="font-style: italic;">No custom hand signs registered yet.</span>';
      return;
    }

    entries.forEach(([name, info]) => {
      const item = document.createElement('div');
      item.className = 'custom-gesture-item';
      
      const details = document.createElement('span');
      details.innerHTML = `<strong>${name}</strong> &rarr; ${info.mappedAction}`;
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        onRemoveCallback(name);
      });
      
      item.appendChild(details);
      item.appendChild(removeBtn);
      this.customListContainer.appendChild(item);
    });
  }

  triggerChange(key, value) {
    if (this.onSettingChanged) {
      this.onSettingChanged(key, value);
    }
  }
}

window.SettingsPanelController = SettingsPanelController;
