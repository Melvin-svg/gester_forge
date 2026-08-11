/**
 * GestureForge Gesture Coach UI Controller
 * Direct translation of the original coach.js for tips and fatigue index.
 */
class GestureCoachController {
  constructor() {
    this.msgEl = document.getElementById('coach-message');
    this.fatigueEl = document.querySelector('.coach-fatigue .fatigue-label');
    this.fatigueFill = document.querySelector('.coach-fatigue .fatigue-fill');

    this.lastCoachUpdate = 0;
    this.coachCooldown = 1500; // 1.5s toast frequency
    
    this.fatigueScore = 0;
    this.jitterSamples = [];
    this.lastWristPos = null;
    this.gestureCastTimes = [];
  }

  analyze(landmarks, rawLandmarks, latency, activeGesture) {
    const now = Date.now();
    this.updateFatigue(rawLandmarks, activeGesture);

    if (now - this.lastCoachUpdate < this.coachCooldown) return;

    if (!landmarks || landmarks.length === 0) {
      this.setCoachMessage("Hand out of view! Place your hand clearly in front of the camera.", '#fbbf24');
      this.lastCoachUpdate = now;
      return;
    }

    if (latency > 150) {
      this.setCoachMessage("High processing latency. Check CPU load or improve room lighting.", '#f87171');
      this.lastCoachUpdate = now;
      return;
    }

    const wrist = landmarks[0];
    const borderThreshold = 0.08;
    if (wrist.x < borderThreshold || wrist.x > (1 - borderThreshold) ||
        wrist.y < borderThreshold || wrist.y > (1 - borderThreshold)) {
      this.setCoachMessage("Hand too close to camera edge! Keep hand centered.", '#fbbf24');
      this.lastCoachUpdate = now;
      return;
    }

    const scale = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y);
    if (scale < 0.06) {
      this.setCoachMessage("Hand too far! Move closer to the camera.", '#fbbf24');
      this.lastCoachUpdate = now;
      return;
    } else if (scale > 0.22) {
      this.setCoachMessage("Hand too close! Move slightly back.", '#fbbf24');
      this.lastCoachUpdate = now;
      return;
    }

    if (this.jitterSamples.length > 0) {
      const avgJitter = this.jitterSamples.reduce((a, b) => a + b, 0) / this.jitterSamples.length;
      if (avgJitter > 0.05 && activeGesture === 'None') {
        this.setCoachMessage("Hold hand steady. Too much rapid movement.", '#fbbf24');
        this.lastCoachUpdate = now;
        return;
      }
    }

    if (activeGesture !== 'None') {
      this.setCoachMessage(`Great job! Casted ${activeGesture.toUpperCase()}.`, '#4ade80');
      this.lastCoachUpdate = now;
    } else {
      const tips = [
        "Pinch index & thumb tips to shoot Fireballs!",
        "Open your palm flat to deploy your energy Shield.",
        "Clench your fist tight to trigger an Earth Slam stun wave.",
        "Perform a Swipe Left or Swipe Right to Dash away from danger.",
        "Trace a complete Circle with your index finger to cast Ice Storm!",
        "Chaining Pinch -> Palm -> Fist casts the ultimate Nova spell!"
      ];
      const randomTip = tips[Math.floor(Math.random() * tips.length)];
      this.setCoachMessage(randomTip, '#5b8def');
      this.lastCoachUpdate = now;
    }
  }

  updateFatigue(rawLandmarks, activeGesture) {
    const now = Date.now();

    if (activeGesture && activeGesture !== 'None') {
      this.gestureCastTimes.push(now);
    }
    // Clean old casts (> 60s)
    this.gestureCastTimes = this.gestureCastTimes.filter(t => now - t < 60000);

    // Compute wrist jitter
    if (rawLandmarks && rawLandmarks.length > 0) {
      const wrist = rawLandmarks[0];
      if (this.lastWristPos) {
        const movement = Math.hypot(wrist.x - this.lastWristPos.x, wrist.y - this.lastWristPos.y);
        this.jitterSamples.push(movement);
        if (this.jitterSamples.length > 50) this.jitterSamples.shift();
      }
      this.lastWristPos = { x: wrist.x, y: wrist.y };
    }

    // Rate calculations
    const castsPerMin = this.gestureCastTimes.length;
    let avgJitter = 0;
    if (this.jitterSamples.length > 0) {
      avgJitter = this.jitterSamples.reduce((a, b) => a + b, 0) / this.jitterSamples.length;
    }

    // Fatigue factors
    let calculatedFatigue = 0;
    if (castsPerMin > 25) calculatedFatigue += (castsPerMin - 25) * 2;
    if (avgJitter > 0.02) calculatedFatigue += (avgJitter - 0.02) * 500;

    // Decay fatigue slowly over time if user rests
    this.fatigueScore = Math.max(0, Math.min(100, this.fatigueScore * 0.98 + calculatedFatigue * 0.02));

    this.updateFatigueUI();
  }

  updateFatigueUI() {
    if (!this.fatigueEl || !this.fatigueFill) return;

    let status = 'Low';
    let color = '#4ade80';

    if (this.fatigueScore > 65) {
      status = 'High! Take a break';
      color = '#f87171';
    } else if (this.fatigueScore > 35) {
      status = 'Moderate';
      color = '#fbbf24';
    }

    this.fatigueEl.textContent = `Fatigue: ${status}`;
    this.fatigueEl.style.color = color;
    this.fatigueFill.style.backgroundColor = color;
    this.fatigueFill.style.width = `${Math.max(5, this.fatigueScore)}%`;

    if (this.fatigueScore > 75 && Math.random() < 0.005) {
      this.setCoachMessage("High fatigue detected. Stand up and take a 2-minute break!", '#f87171');
    }
  }

  setCoachMessage(msg, color) {
    if (this.msgEl) {
      this.msgEl.textContent = msg;
      this.msgEl.style.color = color || 'var(--gf-text-primary)';
    }
  }
}

window.GestureCoachController = GestureCoachController;
