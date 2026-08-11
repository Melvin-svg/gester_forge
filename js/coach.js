/**
 * GestureForge Gesture Coach & Fatigue Detector
 * Analyzes movement metrics to output realtime tips, check illumination/positioning, 
 * compute Fatigue index, and recommend breaks.
 */
class CyberCoach {
  constructor(messageElementId, fatigueElementId) {
    this.msgEl = document.getElementById(messageElementId);
    this.fatigueEl = document.getElementById(fatigueElementId);
    
    this.lastCoachUpdate = 0;
    this.coachCooldown = 1500; // 1.5s toast frequency
    
    // Fatigue tracking variables
    this.fatigueScore = 0;
    this.jitterSamples = [];
    this.lastWristPos = null;
    this.gestureCastTimes = [];
  }

  /**
   * Monitor hand stats and output warnings
   */
  analyze(landmarks, rawLandmarks, latency, activeGesture) {
    const now = Date.now();
    
    // 1. Fatigue tracking
    this.updateFatigue(rawLandmarks, activeGesture);

    // 2. Cooldown check for coaching messages (don't spam text warnings)
    if (now - this.lastCoachUpdate < this.coachCooldown) return;

    // 3. Technical checks (Distance, Boundary, Brightness/Quality)
    if (!landmarks || landmarks.length === 0) {
      this.setCoachMessage("Hand out of view! Place your hand clearly in front of the camera.", '#fff01f');
      this.lastCoachUpdate = now; // Respect the cooldown, don't rewrite every frame
      return;
    }

    // Check lighting / detection confidence
    // Note: rawLandmarks from MediaPipe sometimes has visibility score or we infer from latency/jitter
    if (latency > 150) {
      this.setCoachMessage("High processing latency. Check CPU load or improve room lighting.", '#ff3333');
      this.lastCoachUpdate = now;
      return;
    }

    // Check hand boundary bounds (Wrist/Fingertips close to edges of camera view [0, 1])
    const wrist = landmarks[0];
    const borderThreshold = 0.08;
    if (wrist.x < borderThreshold || wrist.x > (1 - borderThreshold) ||
        wrist.y < borderThreshold || wrist.y > (1 - borderThreshold)) {
      this.setCoachMessage("Hand too close to camera edge! Keep hand centered.", '#fff01f');
      this.lastCoachUpdate = now;
      return;
    }

    // Check distance (relative scale size wrist to middle finger knuckle)
    const scale = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y);
    if (scale < 0.06) {
      this.setCoachMessage("Hand too far! Move closer to the camera.", '#fff01f');
      this.lastCoachUpdate = now;
      return;
    } else if (scale > 0.22) {
      this.setCoachMessage("Hand too close! Move slightly back.", '#fff01f');
      this.lastCoachUpdate = now;
      return;
    }

    // Check speed / stability
    if (this.jitterSamples.length > 0) {
      const avgJitter = this.jitterSamples.reduce((a, b) => a + b, 0) / this.jitterSamples.length;
      if (avgJitter > 0.05 && activeGesture === 'None') {
        this.setCoachMessage("Hold hand steady. Too much rapid movement.", '#fff01f');
        this.lastCoachUpdate = now;
        return;
      }
    }

    // Default friendly coach tip if everything is stable
    if (activeGesture !== 'None') {
      this.setCoachMessage(`Great job! Casted ${activeGesture.toUpperCase()}.`, '#39ff14');
      this.lastCoachUpdate = now;
    } else {
      // Random tips
      const tips = [
        "Pinch index & thumb tips to shoot Fireballs!",
        "Open your palm flat to deploy your energy Shield.",
        "Clench your fist tight to trigger an Earth Slam stun wave.",
        "Perform a Swipe Left or Swipe Right to Dash away from danger.",
        "Trace a complete Circle with your index finger to cast Ice Storm!",
        "Chaining Pinch -> Palm -> Fist casts the ultimate Nova spell!"
      ];
      const randomTip = tips[Math.floor(Math.random() * tips.length)];
      this.setCoachMessage(randomTip, '#00f0ff');
      this.lastCoachUpdate = now;
    }
  }

  setCoachMessage(msg, color) {
    if (!this.msgEl) return;
    // Skip redundant DOM writes when the message hasn't actually changed
    if (this.msgEl.innerText === msg) return;

    this.msgEl.innerText = msg;
    this.msgEl.style.color = color;

    // Add subtle glow matching color
    this.msgEl.style.textShadow = `0 0 5px ${color}44`;
  }

  /**
   * Fatigue calculation algorithm:
   * Combines rapid gesture rate and micro-jitter (unintended small trembling movements)
   */
  updateFatigue(rawLandmarks, activeGesture) {
    const now = Date.now();
    
    // 1. Gesture Frequency Track (spells cast per minute)
    if (activeGesture !== 'None') {
      this.gestureCastTimes.push(now);
    }
    // Clean old logs (> 15s ago)
    this.gestureCastTimes = this.gestureCastTimes.filter(t => now - t < 15000);
    const castsPerSecond = this.gestureCastTimes.length / 15;

    // 2. Micro-jitter tracking (differential movement of wrist when not moving fast)
    if (rawLandmarks) {
      const wrist = rawLandmarks[0];
      if (this.lastWristPos) {
        const delta = Math.hypot(wrist.x - this.lastWristPos.x, wrist.y - this.lastWristPos.y);
        
        // Only count as jitter if speed is small (exclude intentional swift swipes)
        if (delta < 0.08) {
          this.jitterSamples.push(delta);
          if (this.jitterSamples.length > 60) {
            this.jitterSamples.shift();
          }
        }
      }
      this.lastWristPos = { x: wrist.x, y: wrist.y };
    } else {
      // Hand left the frame: drop the anchor so the jump back in when it
      // returns isn't measured as a huge tremor.
      this.lastWristPos = null;
    }

    // 3. Compute index
    let jitterSum = 0;
    if (this.jitterSamples.length > 0) {
      jitterSum = this.jitterSamples.reduce((a, b) => a + b, 0) / this.jitterSamples.length;
    }

    // Jitter scalar (normalized) + Cast frequency factor
    // High jitter (trembling) and rapid spell activity increases fatigue index
    const jitterFactor = Math.min(50, jitterSum * 2500); // Max 50 pts
    const freqFactor = Math.min(50, castsPerSecond * 40); // Max 50 pts
    
    // Decay fatigue slowly back to 0
    this.fatigueScore = this.fatigueScore * 0.995 + (jitterFactor + freqFactor) * 0.005;
    this.fatigueScore = Math.max(0, Math.min(100, this.fatigueScore));

    // 4. Update UI & Adjust sensitivity
    this.renderFatigueHUD();
  }

  renderFatigueHUD() {
    if (!this.fatigueEl) return;

    let desc = 'Normal';
    let color = '#39ff14'; // Green
    
    if (this.fatigueScore > 75) {
      desc = 'Fatigued! Take Rest';
      color = '#ff3333'; // Red
      
      // Auto-tuning sensitivity on extreme fatigue (accessible help)
      const sensSlider = document.getElementById('slider-sensitivity');
      if (sensSlider && parseFloat(sensSlider.value) < 1.4) {
        sensSlider.value = "1.5";
        sensSlider.dispatchEvent(new Event('input'));
        this.setCoachMessage("High fatigue detected! Sensitivity increased automatically to 1.5x.", '#ff3333');
      }
    } else if (this.fatigueScore > 40) {
      desc = 'Elevated Jitter';
      color = '#fff01f'; // Yellow
    }

    this.fatigueEl.innerText = desc;
    this.fatigueEl.style.color = color;
    this.fatigueEl.style.textShadow = `0 0 8px ${color}88`;
  }
}

// Export class globally
window.CyberCoach = CyberCoach;
