/**
 * GestureForge 2D Game Engine
 * Implements Action RPG, Survival, and Puzzle mechanics on HTML5 Canvas.
 *
 * Timing model: all durations are stored in milliseconds and advanced by the
 * real frame delta, while positional speeds are expressed per 60fps-frame and
 * scaled by `frameScale`. This keeps the simulation identical on 30Hz, 60Hz
 * and 144Hz displays.
 */
class CyberGameEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Game dimensions
    this.width = 800;
    this.height = 450;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Cooldown per castable spell, in milliseconds. Without these a held
    // gesture re-casts on every single frame.
    this.SPELL_COOLDOWNS = {
      'Pinch': 350,
      'Open Palm': 1500,
      'Fist': 900,
      'Circle': 2500
    };

    this.isRunning = false;
    this.lastTime = 0;
    this.frameHandle = null;
    this.arenaTime = 0;
    this.arenaStars = this.createArenaStars();
    this.arenaBackground = new Image();
    this.arenaBackground.src = 'assets/moonlit-temple-arena.png';

    this.reset();
  }

  reset() {
    this.player = {
      x: this.width / 2,
      y: this.height - 80,
      targetX: this.width / 2,
      width: 40,
      height: 60,
      vy: 0,
      gravity: 0.6,
      isJumping: false,
      isDashing: false,
      dashCooldown: 0,   // ms
      dashTime: 0,       // ms
      dashDirection: 1,  // 1: Right, -1: Left
      hp: 100,
      maxHp: 100,
      mp: 100,
      maxMp: 100,
      shieldActive: false,
      shieldTime: 0,        // ms
      shieldMaxTime: 2000,  // ms
      score: 0,
      level: 1,
      xp: 0,
      xpNeeded: 100,
      walkCycle: 0,
      movement: 0,
      pose: 'idle',
      poseTimer: 0,
      lastHandSeen: 0
    };

    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.comboQueue = [];

    // Remaining cooldown per spell, in ms
    this.cooldowns = { 'Pinch': 0, 'Open Palm': 0, 'Fist': 0, 'Circle': 0 };

    // Spawning parameters (Difficulty adjusted by DDA)
    this.spawnTimer = 0;
    this.spawnInterval = 3000; // ms
    this.difficultyMultiplier = 1.0;

    // Puzzle / Rune state
    this.puzzle = {
      active: false,
      requiredGesture: 'None',
      timer: 0,
      maxTimer: 5000,
      x: this.width / 2,
      y: this.height / 3,
      radius: 50,
      completed: false
    };

    // Tracking stats for DDA
    this.stats = {
      spellsCast: 0,
      projectilesFired: 0,
      projectilesHit: 0,
      damageTaken: 0,
      puzzlesSolved: 0,
      puzzlesTotal: 0
    };

    this.clearCombo();
    this.resetHud();
  }

  // A fixed star field gives the arena depth without allocating particles every frame.
  createArenaStars() {
    const stars = [];
    for (let i = 0; i < 72; i++) {
      stars.push({
        x: Math.random() * this.width,
        y: 18 + Math.random() * (this.height * 0.52),
        size: Math.random() * 1.4 + 0.25,
        alpha: Math.random() * 0.6 + 0.18,
        phase: Math.random() * Math.PI * 2
      });
    }
    return stars;
  }

  /**
   * Restore every DOM element the engine mutates back to its initial state,
   * so a restart after a loss doesn't inherit the game-over styling.
   */
  resetHud() {
    const level = document.getElementById('hud-level');
    if (level) level.innerText = 'L1';

    const score = document.getElementById('hud-score');
    if (score) score.innerText = '0';

    const hpFill = document.getElementById('hp-fill');
    if (hpFill) hpFill.style.width = '100%';

    const mpFill = document.getElementById('mana-fill');
    if (mpFill) mpFill.style.width = '100%';

    const title = document.getElementById('overlay-title');
    if (title) {
      title.innerText = 'GESTUREFORGE';
      title.style.color = '';
      title.style.textShadow = '';
    }
  }

  start() {
    if (this.isRunning) return; // Never run two loops at once
    this.isRunning = true;
    this.lastTime = performance.now();
    this.frameHandle = requestAnimationFrame((t) => this.gameLoop(t));
  }

  stop() {
    this.isRunning = false;
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  /**
   * Main game update and draw loop
   */
  gameLoop(timestamp) {
    if (!this.isRunning) return;

    // Clamp the delta so a backgrounded tab doesn't teleport the simulation
    const dt = Math.min(100, timestamp - this.lastTime);
    this.lastTime = timestamp;

    this.update(dt);
    this.draw();

    if (this.isRunning) {
      this.frameHandle = requestAnimationFrame((t) => this.gameLoop(t));
    }
  }

  /**
   * Handle player inputs from gestures
   */
  handleGestureInput(gesture, confidence, predictedX) {
    // 1. Move player to the predicted X position
    // Map predictedX (0 to 1) smoothly to canvas width, accounting for margin bounds
    if (typeof predictedX === 'number' && !Number.isNaN(predictedX)) {
      const margin = 50;
      this.player.targetX = predictedX * (this.width - margin * 2) + margin;
      this.player.lastHandSeen = this.arenaTime;
      if (Math.abs(this.player.targetX - this.player.x) > 8) {
        this.player.dashDirection = this.player.targetX > this.player.x ? 1 : -1;
      }
    }

    // Reject low confidence actions
    if (gesture === 'None' || confidence < 0.7) return;

    // 2. Resolve Spell Casting
    if (this.puzzle.active) {
      // If puzzle is active, check if gesture satisfies the rune lock
      if (gesture === this.puzzle.requiredGesture) {
        this.solvePuzzle();
      }
      return; // Block regular attacks during puzzle phase
    }

    // Jump is driven by wrist velocity upstream and has its own gating
    if (gesture === 'Jump') {
      if (!this.player.isJumping) {
        this.player.vy = -12;
        this.player.isJumping = true;
        this.addJumpParticles();
        this.setPlayerPose('jump', 500);
      }
      return;
    }

    // Dash (Swipe Left / Swipe Right) - gated by its own cooldown
    if (gesture === 'Swipe Left' || gesture === 'Swipe Right') {
      if (this.player.dashCooldown <= 0) {
        this.player.isDashing = true;
        this.player.dashTime = 170;      // ~10 frames at 60fps
        this.player.dashCooldown = 1000; // 1s cooldown
        this.player.dashDirection = gesture === 'Swipe Right' ? 1 : -1;
        this.addDashGhostParticles();
        this.setPlayerPose('dash', 220);
        this.pushCombo(gesture);
      }
      return;
    }

    // Static spells: a held gesture must not re-cast every frame
    if (!this.canCast(gesture)) return;

    // Shield (Open Palm)
    if (gesture === 'Open Palm') {
      if (this.player.mp >= 10 && !this.player.shieldActive) {
        this.player.shieldActive = true;
        this.player.shieldTime = this.player.shieldMaxTime;
        this.player.mp -= 10;
        this.addMagicCircleParticles(this.player.x, this.player.y - 30, '#00f0ff');
        this.setPlayerPose('guard', 420);
        this.onSpellCast('Open Palm');
      }
      return;
    }

    // Fireball (Pinch)
    if (gesture === 'Pinch') {
      if (this.player.mp >= 15) {
        this.player.mp -= 15;
        this.shootProjectile(1); // Type 1: Fireball
        this.setPlayerPose('strike', 250);
        this.onSpellCast('Pinch');
      }
      return;
    }

    // Earth Slam (Fist)
    if (gesture === 'Fist') {
      if (this.player.mp >= 20) {
        this.player.mp -= 20;
        this.triggerEarthSlam();
        this.setPlayerPose('slam', 380);
        this.onSpellCast('Fist');
      }
      return;
    }

    // Circle Spell (Ice Storm)
    if (gesture === 'Circle') {
      if (this.player.mp >= 30) {
        this.player.mp -= 30;
        this.triggerIceStorm();
        this.setPlayerPose('cast', 420);
        this.onSpellCast('Circle');
      }
    }
  }

  /**
   * True when the spell is off cooldown (unknown gestures are always allowed).
   */
  canCast(gesture) {
    if (!(gesture in this.cooldowns)) return true;
    return this.cooldowns[gesture] <= 0;
  }

  setPlayerPose(pose, duration) {
    this.player.pose = pose;
    this.player.poseTimer = duration;
  }

  /**
   * Shared bookkeeping for a successful cast.
   */
  onSpellCast(gesture) {
    this.cooldowns[gesture] = this.SPELL_COOLDOWNS[gesture] || 0;
    this.stats.spellsCast++;
    this.pushCombo(gesture);
  }

  /**
   * Track combinations and trigger Ultimates
   */
  pushCombo(spell) {
    this.comboQueue.push(spell);
    if (this.comboQueue.length > 3) {
      this.comboQueue.shift();
    }

    // Update UI Combo slots
    const slots = document.getElementById('combo-slots');
    if (slots) {
      slots.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const slotEl = document.createElement('span');
        slotEl.className = 'combo-slot';
        if (i < this.comboQueue.length) {
          slotEl.classList.add('active');
          slotEl.innerText = this.getSpellSymbol(this.comboQueue[i]);
        } else {
          slotEl.classList.add('empty');
        }
        slots.appendChild(slotEl);
      }
    }

    // Check combos
    if (this.comboQueue.length === 3) {
      const comboStr = this.comboQueue.join(',');
      if (comboStr === 'Pinch,Open Palm,Fist') {
        this.triggerUltimate('Nova Spell');
      } else if (comboStr === 'Circle,Circle,Fist') {
        this.triggerUltimate('Blizzard End');
      } else if (comboStr === 'Swipe Right,Swipe Left,Pinch') {
        this.triggerUltimate('Wind Strike');
      }
    }
  }

  getSpellSymbol(spellName) {
    if (spellName === 'Pinch') return '👌';
    if (spellName === 'Open Palm') return '🖐️';
    if (spellName === 'Fist') return '✊';
    if (spellName === 'Circle') return '🌀';
    if (spellName.includes('Swipe')) return '👉';
    return '';
  }

  clearCombo() {
    this.comboQueue = [];
    const slots = document.getElementById('combo-slots');
    if (slots) {
      slots.innerHTML = `<span class="combo-slot empty"></span><span class="combo-slot empty"></span><span class="combo-slot empty"></span>`;
    }
  }

  /**
   * Action triggers
   */
  shootProjectile(type) {
    // Fire in the direction the player last dashed / is facing
    const dir = this.player.dashDirection >= 0 ? 1 : -1;
    this.projectiles.push({
      x: this.player.x + dir * 20,
      y: this.player.y - 30,
      vx: 7 * dir,
      vy: (Math.random() - 0.5) * 2, // Slight vertical variance
      radius: type === 1 ? 8 : 12,
      color: type === 1 ? '#ff9d42' : '#d7f3ff', // Ember fireball, not neon purple
      damage: 25,
      type: 'player'
    });
    this.stats.projectilesFired++;
    this.addMagicCircleParticles(this.player.x + dir * 20, this.player.y - 30, '#ff9d42');
  }

  triggerEarthSlam() {
    // Damaging wave on ground
    this.addSlamRing(this.player.x, this.player.y + 10);
    this.enemies.forEach(e => {
      const dist = Math.abs(e.x - this.player.x);
      if (dist < 200) {
        e.hp -= 40;
        e.stunTimer = 1000; // Stun for 1s
        this.addSparks(e.x, e.y, '#fff01f');
      }
    });
  }

  triggerIceStorm() {
    // Freeze all active enemies on screen
    this.enemies.forEach(e => {
      e.hp -= 15;
      e.frozenTimer = 3000; // Frozen for 3s
      this.addSparks(e.x, e.y, '#00f0ff');
    });
    this.addFreezeShield();
  }

  triggerUltimate(name) {
    this.clearCombo();
    const hint = document.getElementById('combo-hint');
    if (hint) {
      hint.innerText = `ULTIMATE: ${name} CASTED!`;
      hint.style.color = '#39ff14';
      clearTimeout(this.hintTimeout);
      this.hintTimeout = setTimeout(() => {
        hint.innerText = 'Cast a spell to start a combo chain!';
        hint.style.color = '';
      }, 2000);
    }

    this.addMagicCircleParticles(this.player.x, this.player.y - 30, '#39ff14', 60);

    if (name === 'Nova Spell') {
      // Destroys all currently spawned enemies with massive neon ring
      this.enemies.forEach(e => {
        e.hp -= 150;
        this.addSparks(e.x, e.y, '#39ff14', 30);
      });
      this.addSlamRing(this.player.x, this.player.y, '#39ff14', 400);
    } else if (name === 'Blizzard End') {
      this.enemies.forEach(e => {
        e.hp -= 80;
        e.frozenTimer = 5000; // Freeze for 5s
      });
    } else if (name === 'Wind Strike') {
      // Mega quick dash cutting all screen
      this.player.isDashing = true;
      this.player.dashTime = 420;
      this.player.dashDirection = 1;
      this.enemies.forEach(e => {
        e.hp -= 100;
      });
    }
    this.player.mp = Math.min(this.player.maxMp, this.player.mp + 40); // Spell refund
  }

  /**
   * Puzzle system helpers
   */
  spawnPuzzle() {
    const gestures = ['Fist', 'Open Palm', 'Pinch', 'Circle'];
    const selected = gestures[Math.floor(Math.random() * gestures.length)];

    // Scale timer according to DDA difficulty (higher difficulty = shorter time window)
    const baseTime = 5000; // ms
    const adjustedTime = Math.max(2000, baseTime / this.difficultyMultiplier);

    this.puzzle = {
      active: true,
      requiredGesture: selected,
      timer: adjustedTime,
      maxTimer: adjustedTime,
      x: this.width / 2,
      y: this.height / 3 + 10,
      radius: 65,
      completed: false
    };

    this.stats.puzzlesTotal++;
  }

  solvePuzzle() {
    this.puzzle.active = false;
    this.stats.puzzlesSolved++;
    this.player.score += 500;
    this.player.mp = Math.min(this.player.maxMp, this.player.mp + 50);

    // Destroy all enemies as reward
    this.enemies.forEach(e => {
      e.hp = 0;
    });

    this.addMagicCircleParticles(this.puzzle.x, this.puzzle.y, '#39ff14', 50);
    this.clearCombo();
  }

  failPuzzle() {
    this.puzzle.active = false;
    this.player.hp = Math.max(0, this.player.hp - 25);
    this.stats.damageTaken += 25;
    this.addMagicCircleParticles(this.puzzle.x, this.puzzle.y, '#ff3333', 40);
  }

  /**
   * Logic Updates
   */
  update(dt) {
    this.arenaTime += dt;
    if (this.player.hp <= 0) {
      this.stop();
      this.showGameOver();
      return;
    }

    // Positional speeds are authored per 60fps frame
    const f = dt / (1000 / 60);

    const previousX = this.player.x;

    // 1. Difficulty Scaling (Dynamic Difficulty Adjustment)
    this.applyDDA();

    // 2. Player horizontal movement
    if (this.player.isDashing) {
      this.player.x += this.player.dashDirection * 15 * f;
      this.player.dashTime -= dt;
      if (this.player.dashTime <= 0) {
        this.player.isDashing = false;
        this.player.dashTime = 0;
      }
    } else {
      // Frame-rate independent exponential easing towards the target
      const ease = 1 - Math.pow(1 - 0.15, f);
      this.player.x += (this.player.targetX - this.player.x) * ease;
    }
    // Clamp to canvas borders
    this.player.x = Math.max(20, Math.min(this.width - 20, this.player.x));
    const travel = Math.abs(this.player.x - previousX);
    this.player.movement += (Math.min(1, travel / (5 * f || 1)) - this.player.movement) * Math.min(1, 0.18 * f);
    this.player.walkCycle += (1.7 + this.player.movement * 8) * f;
    if (this.player.poseTimer > 0) {
      this.player.poseTimer -= dt;
      if (this.player.poseTimer <= 0) this.player.pose = 'idle';
    } else if (!this.player.isJumping && !this.player.isDashing) {
      this.player.pose = this.player.movement > 0.08 ? 'walk' : 'idle';
    }

    // Jump / Gravity physics
    if (this.player.isJumping) {
      this.player.vy += this.player.gravity * f;
      this.player.y += this.player.vy * f;

      const groundLevel = this.height - 80;
      if (this.player.y >= groundLevel) {
        this.player.y = groundLevel;
        this.player.vy = 0;
        this.player.isJumping = false;
      }
    }

    // Shield Timer
    if (this.player.shieldActive) {
      this.player.shieldTime -= dt;
      if (this.player.shieldTime <= 0) {
        this.player.shieldActive = false;
        this.player.shieldTime = 0;
      }
    }

    // Dash Cooldown
    if (this.player.dashCooldown > 0) {
      this.player.dashCooldown = Math.max(0, this.player.dashCooldown - dt);
    }

    // Spell cooldowns
    for (const key of Object.keys(this.cooldowns)) {
      if (this.cooldowns[key] > 0) {
        this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
      }
    }

    // Mana Regeneration (passive)
    this.player.mp = Math.min(this.player.maxMp, this.player.mp + 0.15 * f);

    // 3. Spawners (Enemies)
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;

      // 20% chance to spawn a puzzle rune instead if none active
      if (Math.random() < 0.20 && !this.puzzle.active) {
        this.spawnPuzzle();
      } else {
        this.spawnEnemy();
      }
    }

    // 4. Update Puzzle timer
    if (this.puzzle.active) {
      this.puzzle.timer -= dt;
      if (this.puzzle.timer <= 0) {
        this.failPuzzle();
      }
    }

    // 5. Update Projectiles
    // Iterating backwards so removing an element cannot skip the next one.
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * f;
      p.y += p.vy * f;

      // Particle trail
      if (Math.random() < 0.4) {
        this.particles.push({
          x: p.x,
          y: p.y,
          vx: -p.vx * 0.2 + (Math.random() - 0.5),
          vy: (Math.random() - 0.5),
          radius: Math.random() * 3 + 1,
          color: p.color,
          alpha: 1,
          decay: 0.05
        });
      }

      // Boundary check
      if (p.x > this.width + 50 || p.x < -50) {
        this.projectiles.splice(i, 1);
      }
    }

    // 6. Update Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      // Stun/Frozen controls
      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
      } else if (e.frozenTimer > 0) {
        e.frozenTimer -= dt;
      } else {
        // AI movement: moves towards player
        const dir = Math.sign(this.player.x - e.x);
        e.x += dir * e.speed * f;
      }

      // Check collision with player projectiles (backwards, same reason)
      for (let j = this.projectiles.length - 1; j >= 0; j--) {
        const proj = this.projectiles[j];
        if (proj.type !== 'player') continue;

        const distToProj = Math.hypot(e.x - proj.x, e.y - proj.y);
        if (distToProj < 25) {
          e.hp -= proj.damage;
          this.stats.projectilesHit++;
          this.addSparks(proj.x, proj.y, proj.color);
          this.projectiles.splice(j, 1);
        }
      }

      // Death check must come before the contact check, so an enemy killed
      // this frame cannot still land a hit on the player.
      if (e.hp <= 0) {
        this.player.score += e.scoreVal;
        this.player.xp += e.xpVal;
        this.checkLevelUp();
        this.addSparks(e.x, e.y, e.color, 15);
        this.enemies.splice(i, 1);
        continue;
      }

      // Check collision with player
      const distToPlayer = Math.hypot(e.x - this.player.x, e.y - (this.player.y - 30));
      if (distToPlayer < 40) {
        this.damagePlayer(e.damage);
        this.addSparks(e.x, e.y, e.color, 15);
        this.enemies.splice(i, 1); // Destroy enemy on hit
      }
    }

    // 7. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.alpha -= p.decay * f;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  /**
   * Damage player (checking shields)
   */
  damagePlayer(amt) {
    if (this.player.shieldActive) {
      // Absorb damage, sparks particles
      this.addSparks(this.player.x, this.player.y - 30, '#00f0ff', 10);
      return;
    }
    this.player.hp = Math.max(0, this.player.hp - amt);
    this.stats.damageTaken += amt;
    this.addSparks(this.player.x, this.player.y - 30, '#ff3333', 20);
  }

  checkLevelUp() {
    // A loop, since a single kill can grant more than one level's worth of XP
    while (this.player.xp >= this.player.xpNeeded) {
      this.player.xp -= this.player.xpNeeded;
      this.player.level++;
      this.player.xpNeeded = Math.floor(this.player.xpNeeded * 1.5);

      // Heal player
      this.player.hp = this.player.maxHp;
      this.player.mp = this.player.maxMp;

      this.addMagicCircleParticles(this.player.x, this.player.y - 30, '#39ff14', 40);

      // Update UI level indicator
      const lvlEl = document.getElementById('game-level');
      if (lvlEl) lvlEl.innerText = this.player.level;
    }
  }

  /**
   * Spawning mechanics
   */
  spawnEnemy() {
    // Enemies spawn from left or right side offscreen
    const spawnSide = Math.random() < 0.5 ? -30 : this.width + 30;

    // Choose enemy type based on DDA & Random
    const r = Math.random() * this.difficultyMultiplier;
    let type = 'runner';
    let color = '#39ff14'; // Green
    let speed = 1.6 + Math.random() * 0.8;
    let hp = 20;
    let scoreVal = 100;
    let xpVal = 20;
    let dmg = 15;

    if (r > 1.8) {
      type = 'bomber';
      color = '#fff01f'; // Yellow
      speed = 0.8;
      hp = 60;
      scoreVal = 250;
      xpVal = 50;
      dmg = 35;
    } else if (r > 1.3) {
      type = 'mage';
      color = '#ff007f'; // Pink
      speed = 1.2;
      hp = 35;
      scoreVal = 200;
      xpVal = 40;
      dmg = 20;
    }

    // Apply global DDA health/speed multipliers
    speed *= this.difficultyMultiplier * 0.9;
    hp *= this.difficultyMultiplier;

    this.enemies.push({
      x: spawnSide,
      y: this.height - 80,
      width: 30,
      height: 45,
      type,
      color,
      speed,
      hp,
      maxHp: hp,
      damage: dmg,
      scoreVal,
      xpVal,
      stunTimer: 0,
      frozenTimer: 0
    });
  }

  /**
   * Dynamic Difficulty Adjustment (DDA)
   */
  applyDDA() {
    // Accuracy is projectile hit rate - the only spell type that can miss.
    const accuracy = this.stats.projectilesFired > 0
      ? (this.stats.projectilesHit / this.stats.projectilesFired)
      : 1;
    const damageFactor = this.stats.damageTaken / 100;

    // Calculate DDA index (0.5 to 2.5)
    // Higher accuracy increases difficulty, taking more damage lowers it
    let dda = 1.0 + (accuracy * 0.5) - (damageFactor * 0.3) + (this.player.level * 0.1);
    dda = Math.max(0.5, Math.min(2.5, dda));

    this.difficultyMultiplier = dda;

    // Update interval
    this.spawnInterval = Math.max(1000, 3200 - dda * 800);

    // Update DDA UI indicator
    const ddaStatus = document.getElementById('dda-status');
    if (ddaStatus) {
      let desc = 'Normal';
      if (dda > 1.8) desc = 'Nightmare (AI Aggressive)';
      else if (dda > 1.3) desc = 'Hard (AI Adaptive)';
      else if (dda < 0.7) desc = 'Easy (AI Relaxed)';
      const text = `Difficulty: ${desc}`;
      if (ddaStatus.innerText !== text) ddaStatus.innerText = text;
    }
  }

  /**
   * Rendering functions
   */
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Draw Cyber Grid Floor
    this.drawGridFloor();

    // 2. Draw Puzzle / Rune Lock
    if (this.puzzle.active) {
      this.drawPuzzle();
    }

    // 3. Draw Projectiles
    this.projectiles.forEach(p => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = p.color;
      ctx.fill();
      ctx.restore();
    });

    // 4. Draw Enemies
    this.enemies.forEach(e => {
      ctx.save();

      // Drawing body
      ctx.fillStyle = e.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = e.color;

      // Draw status indicator (Frozen = blue overlay)
      if (e.frozenTimer > 0) {
        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
      } else if (e.stunTimer > 0) {
        ctx.fillStyle = '#fff01f';
      }

      // Compact martial-artist silhouette: readable at a distance, with a
      // coloured rim rather than a simple glowing oval.
      const facing = Math.sign(this.player.x - e.x) || 1;
      ctx.fillStyle = '#06070a';
      ctx.beginPath();
      ctx.arc(e.x, e.y - 48, 9, 0, Math.PI * 2); // head
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(e.x - 10, e.y - 38);
      ctx.lineTo(e.x + 10, e.y - 38);
      ctx.lineTo(e.x + 15, e.y - 12);
      ctx.lineTo(e.x - 14, e.y - 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = e.frozenTimer > 0 ? '#8ce8ff' : (e.stunTimer > 0 ? '#ffd55e' : e.color);
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 9;
      ctx.lineWidth = 2;
      ctx.beginPath(); // forward striking arm
      ctx.moveTo(e.x + 5 * facing, e.y - 34);
      ctx.lineTo(e.x + 22 * facing, e.y - 25);
      ctx.lineTo(e.x + 27 * facing, e.y - 19);
      ctx.stroke();
      ctx.beginPath(); // grounded stance
      ctx.moveTo(e.x - 6, e.y - 13);
      ctx.lineTo(e.x - 13, e.y);
      ctx.moveTo(e.x + 6, e.y - 13);
      ctx.lineTo(e.x + 14, e.y - 2);
      ctx.stroke();

      // Draw HP Bar
      const barW = 30;
      const barH = 4;
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(e.x - barW / 2, e.y - 60, barW, barH);

      ctx.fillStyle = '#ff3333';
      const pct = Math.max(0, Math.min(1, e.hp / e.maxHp));
      ctx.fillRect(e.x - barW / 2, e.y - 60, barW * pct, barH);

      ctx.restore();
    });

    // 5. Draw Particles
    this.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    });

    // 6. Draw Player
    ctx.save();
    const pose = this.player.pose;
    const walkSwing = Math.sin(this.player.walkCycle) * 7 * this.player.movement;
    const isStriking = pose === 'strike' || pose === 'slam';
    const lunge = (pose === 'dash' ? 10 : (isStriking ? 6 : 0)) * (this.player.dashDirection >= 0 ? 1 : -1);
    const px = this.player.x + lunge;
    const py = this.player.y + (pose === 'idle' ? Math.sin(this.arenaTime * 0.004) * 1.3 : 0);
    const facing = this.player.dashDirection >= 0 ? 1 : -1;
    // Shadow-duelist body with a moonlit rim. This gives the player a much
    // stronger fighting-game silhouette than the previous triangle marker.
    ctx.fillStyle = '#050609';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#75c7ff';
    ctx.beginPath();
    ctx.arc(px, py - 56, 11, 0, Math.PI * 2); // masked head
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px - 13, py - 43);
    ctx.lineTo(px + 13, py - 43);
    ctx.lineTo(px + 18, py - 17);
    ctx.lineTo(px + 7, py - 12);
    ctx.lineTo(px - 14, py - 15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7ed7ff';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); // back arm and leading weapon arm
    ctx.moveTo(px - 8 * facing, py - 38);
    ctx.lineTo(px - (pose === 'guard' ? 21 : 20) * facing, py - (pose === 'guard' ? 38 : 25));
    ctx.moveTo(px + 8 * facing, py - 37);
    ctx.lineTo(px + (isStriking ? 31 : 23) * facing, py - (isStriking ? 34 : 30));
    ctx.lineTo(px + (isStriking ? 43 : 32) * facing, py - (isStriking ? 35 : 39));
    ctx.stroke();
    ctx.beginPath(); // low martial stance
    ctx.moveTo(px - 7, py - 15);
    ctx.lineTo(px - (18 + walkSwing) * facing, py);
    ctx.moveTo(px + 7, py - 14);
    ctx.lineTo(px + (16 - walkSwing) * facing, py - 3);
    ctx.stroke();

    // Small scarf streak helps the player read against the detailed sky.
    ctx.strokeStyle = 'rgba(232, 67, 107, 0.9)';
    ctx.shadowColor = '#e8436b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 7 * facing, py - 51);
    ctx.quadraticCurveTo(px - (26 + walkSwing * 0.4) * facing, py - 48, px - 35 * facing, py - 41);
    ctx.stroke();

    // Glowing staff / aura, on the side the player is facing
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.beginPath();
    ctx.arc(px + 15 * facing, py - 45, 4, 0, 2 * Math.PI);
    ctx.fill();

    // Shield drawing
    if (this.player.shieldActive) {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#00f0ff';
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y - 30, 45, 0, 2 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();

    // 7. Update HUD values on document
    const scoreVal = document.getElementById('hud-score');
    if (scoreVal) {
      scoreVal.innerText = String(this.player.score);
    }
    const hpFill = document.getElementById('hp-fill');
    if (hpFill) {
      hpFill.style.width = `${Math.max(0, this.player.hp)}%`;
    }
    const mpFill = document.getElementById('mana-fill');
    if (mpFill) {
      mpFill.style.width = `${Math.max(0, this.player.mp)}%`;
    }
  }

  drawGridFloor() {
    const ctx = this.ctx;
    const groundY = this.height - 80;
    const t = this.arenaTime * 0.001;
    const horizon = groundY - 7;

    // Use the painted stage when it has loaded; keep the procedural arena as
    // a graceful offline/loading fallback.
    if (this.arenaBackground.complete && this.arenaBackground.naturalWidth) {
      ctx.drawImage(this.arenaBackground, 0, 0, this.width, this.height);

      // A very light blue haze unifies the scene with the spell effects.
      const haze = ctx.createLinearGradient(0, 145, 0, groundY + 28);
      haze.addColorStop(0, 'rgba(58, 107, 154, 0)');
      haze.addColorStop(0.72, 'rgba(61, 123, 157, 0.10)');
      haze.addColorStop(1, 'rgba(5, 13, 20, 0.03)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 110, this.width, groundY - 75);

      // Slow embers make the painted stage feel alive without obscuring action.
      ctx.save();
      for (let i = 0; i < 16; i++) {
        const x = (i * 83 + t * (8 + (i % 4) * 2)) % (this.width + 30) - 15;
        const y = 150 + ((i * 47 + t * (5 + i % 3)) % 185);
        ctx.globalAlpha = 0.16 + (i % 4) * 0.035;
        ctx.fillStyle = i % 3 ? '#c5dfff' : '#ffb15d';
        ctx.fillRect(x, y, 1.4, 1.4);
      }
      ctx.restore();
      return;
    }

    // Layered night sky: dark enough for combat readability, but no longer empty.
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#030711');
    sky.addColorStop(0.52, '#08172a');
    sky.addColorStop(1, '#14213c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, groundY);

    const moonGlow = ctx.createRadialGradient(this.width * 0.72, 88, 5, this.width * 0.72, 88, 115);
    moonGlow.addColorStop(0, 'rgba(109, 210, 255, 0.20)');
    moonGlow.addColorStop(0.35, 'rgba(70, 119, 211, 0.09)');
    moonGlow.addColorStop(1, 'rgba(22, 45, 98, 0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(0, 0, this.width, groundY);

    ctx.save();
    this.arenaStars.forEach(star => {
      const shimmer = 0.72 + Math.sin(t * 1.8 + star.phase) * 0.28;
      ctx.globalAlpha = star.alpha * shimmer;
      ctx.fillStyle = '#c8e9ff';
      ctx.fillRect(star.x, star.y, star.size, star.size);
    });
    ctx.restore();

    // Distant fortress skyline with varied towers and lit windows.
    ctx.fillStyle = '#07101e';
    const buildings = [
      [0, 60, 122], [45, 40, 142], [88, 72, 110], [130, 52, 130],
      [180, 88, 94], [218, 46, 136], [266, 70, 112], [312, 34, 148],
      [366, 76, 108], [410, 54, 130], [456, 91, 92], [500, 38, 146],
      [554, 68, 116], [600, 43, 138], [650, 80, 102], [695, 28, 154], [748, 64, 118]
    ];
    buildings.forEach(([x, w, h], index) => {
      const y = horizon - h;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = index % 3 === 0 ? '#0b1b31' : '#091626';
      ctx.fillRect(x + 5, y + 8, w - 10, 4);
      ctx.fillStyle = '#53c7df';
      for (let wy = y + 23; wy < horizon - 13; wy += 22) {
        const wx = x + 10 + ((index * 13 + wy) % Math.max(12, w - 20));
        ctx.globalAlpha = 0.24 + ((index + wy) % 3) * 0.12;
        ctx.fillRect(wx, wy, 3, 5);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#07101e';
    });

    // A monumental energy gate makes the horizon feel like a real destination.
    ctx.save();
    ctx.translate(this.width / 2, horizon + 2);
    ctx.strokeStyle = 'rgba(61, 198, 255, 0.22)';
    ctx.shadowColor = '#36caff';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 4, 62, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 55, 151, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 4, 75, Math.PI + 0.2, -0.2);
    ctx.stroke();
    ctx.restore();

    // Fog band hides the seam between skyline and combat floor.
    const fog = ctx.createLinearGradient(0, horizon - 20, 0, groundY + 18);
    fog.addColorStop(0, 'rgba(91, 159, 230, 0)');
    fog.addColorStop(0.55, 'rgba(41, 113, 155, 0.20)');
    fog.addColorStop(1, 'rgba(4, 13, 25, 0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, horizon - 20, this.width, 45);

    // Reflective runway floor.
    const floor = ctx.createLinearGradient(0, groundY, 0, this.height);
    floor.addColorStop(0, '#071b28');
    floor.addColorStop(1, '#02070e');
    ctx.fillStyle = floor;
    ctx.fillRect(0, groundY, this.width, this.height - groundY);

    ctx.save();
    ctx.strokeStyle = 'rgba(70, 226, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let depth = 0; depth < 8; depth++) {
      const progress = depth / 8;
      const y = groundY + (this.height - groundY) * progress * progress;
      ctx.globalAlpha = 0.3 + progress * 0.7;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke();
    }
    const centerX = this.width / 2;
    for (let x = -240; x <= this.width + 240; x += 68) {
      ctx.globalAlpha = 0.62;
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(centerX + (x - centerX) * 2.1, this.height);
      ctx.stroke();
    }
    ctx.restore();

    // Neon runway edge and animated energy lanes.
    ctx.save();
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 13;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(this.width, groundY); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 46, 145, 0.38)';
    ctx.lineWidth = 1;
    for (let lane = -1; lane <= 1; lane++) {
      const x = centerX + lane * 175;
      ctx.beginPath(); ctx.moveTo(x, groundY + 2); ctx.lineTo(centerX + lane * 300, this.height); ctx.stroke();
    }
    ctx.restore();
  }

  drawPuzzle() {
    const ctx = this.ctx;
    const p = this.puzzle;

    ctx.save();

    // Draw magic circle boundary
    ctx.strokeStyle = '#fff01f';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#fff01f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
    ctx.stroke();

    // Timer ring (countdown)
    const timerRatio = Math.max(0, Math.min(1, p.timer / p.maxTimer));
    ctx.strokeStyle = '#ff3333';
    ctx.shadowColor = '#ff3333';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius + 6, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * timerRatio));
    ctx.stroke();

    // Text in center
    ctx.fillStyle = '#e2e8f0';
    ctx.font = "bold 14px 'Share Tech Mono'";
    ctx.textAlign = 'center';
    ctx.shadowBlur = 0;
    ctx.fillText("RUNE LOCK", p.x, p.y - 12);

    // Spell prompt name
    ctx.fillStyle = '#fff01f';
    ctx.font = "bold 13px 'Share Tech Mono'";
    ctx.fillText(p.requiredGesture.toUpperCase(), p.x, p.y + 12);

    // Spell gesture icon symbol
    ctx.fillStyle = '#ffffff';
    ctx.font = "24px 'Outfit'";
    ctx.fillText(this.getSpellSymbol(p.requiredGesture), p.x, p.y + 35);

    ctx.restore();
  }

  /**
   * Particle Systems
   */
  addSparks(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const speed = Math.random() * 4 + 1;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 3 + 1,
        color,
        alpha: 1,
        decay: Math.random() * 0.04 + 0.02
      });
    }
  }

  addMagicCircleParticles(x, y, color, count = 25) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI;
      this.particles.push({
        x: x + Math.cos(angle) * 30,
        y: y + Math.sin(angle) * 30,
        vx: Math.cos(angle) * (Math.random() * 1.5 + 0.5),
        vy: Math.sin(angle) * (Math.random() * 1.5 + 0.5) - 1, // Slight upward drift
        radius: Math.random() * 2.5 + 1,
        color,
        alpha: 1,
        decay: 0.02
      });
    }
  }

  addJumpParticles() {
    this.addSparks(this.player.x, this.player.y, '#00f0ff', 12);
  }

  addDashGhostParticles() {
    // Generate horizontal trail
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: this.player.x - i * 15 * this.player.dashDirection,
        y: this.player.y - 30,
        vx: 0,
        vy: 0,
        radius: 12,
        color: 'rgba(123, 205, 255, 0.35)',
        alpha: 0.8,
        decay: 0.15
      });
    }
  }

  addSlamRing(x, y, color = '#fff01f', maxRadius = 180) {
    const pCount = 30;
    for (let i = 0; i < pCount; i++) {
      const angle = (i / pCount) * Math.PI; // Half circle ground shock
      const speed = 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed * (Math.random() * 0.4 + 0.8),
        vy: -Math.sin(angle) * speed * 0.3, // Flat ground wave
        radius: Math.random() * 4 + 2,
        color,
        alpha: 1,
        decay: 0.02
      });
    }
  }

  addFreezeShield() {
    // Add ice storm circle overlay
    this.addMagicCircleParticles(this.width / 2, this.height / 2, '#00f0ff', 60);
  }

  showGameOver() {
    const overlay = document.getElementById('game-overlay');
    const title = document.getElementById('overlay-title');
    const desc = document.getElementById('overlay-desc');
    const btn = document.getElementById('btn-start-game');

    if (overlay && title && desc && btn) {
      title.innerText = "GAME OVER";
      title.style.color = '#ff3333';
      title.style.textShadow = '0 0 20px rgba(255, 51, 51, 0.6)';
      desc.innerHTML = `Your defense collapsed.<br><strong>Final Score: ${this.player.score}</strong><br>Level Achieved: ${this.player.level}`;
      btn.innerText = "Re-Forge Controls";
      btn.disabled = false;
      overlay.classList.remove('hide');
      overlay.classList.add('show');
    }
  }
}

// Export class globally
window.CyberGameEngine = CyberGameEngine;
