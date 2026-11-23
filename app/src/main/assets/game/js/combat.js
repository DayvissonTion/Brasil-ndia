import {
  ELEMENTS,
  ENEMY_FORMS,
  KEYS_PER_ENEMY,
  KEY_PICKUP_RADIUS,
  MEDIUM_ENEMIES_PER_PORTAL,
  SATANTI_BONUS_SECONDS,
} from "./constants.js";

function distPointToSegmentSq(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  if (abLenSq < 1e-8) {
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    const dz = p.z - a.z;
    return dx * dx + dy * dy + dz * dz;
  }
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const apz = p.z - a.z;
  let t = (apx * abx + apy * aby + apz * abz) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx - p.x;
  const cy = a.y + t * aby - p.y;
  const cz = a.z + t * abz - p.z;
  return cx * cx + cy * cy + cz * cz;
}

export class CombatManager {
  constructor(THREE, scene, world, audio) {
    this.THREE = THREE;
    this.scene = scene;
    this.world = world;
    this.audio = audio;

    this.enemies = [];
    this.keys = [];
    this.projectiles = [];

    this.spawnCooldown = 1.4;
    this.formCursor = 0;

    this.lockedTarget = null;
    this.lockProgress = 0;
    this.reticleGroup = this._buildAutoAimReticle();
    this.scene.add(this.reticleGroup);

    this.cageGroup = this._buildCaptureCage();
    this.scene.add(this.cageGroup);

    this.satantiSpawnTimer = 22.0;
    this.isCaptured = false;
    this.captorEnemy = null;

    this.seedInitialKeys();
  }

  _buildAutoAimReticle() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.visible = false;

    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.08, 28),
      new THREE.MeshBasicMaterial({
        color: 0xf5c451,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.y = 0.08;

    const targetHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.06, 10, 28),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.9,
      })
    );
    targetHalo.position.y = 1.6;

    group.add(groundRing, targetHalo);
    group.userData = { groundRing, targetHalo };
    return group;
  }

  _buildCaptureCage() {
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.visible = false;
    const barMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.72,
      wireframe: true,
    });
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.2, 10, 1, true), barMat);
    cage.position.y = 1.6;
    group.add(cage);
    return group;
  }

  seedInitialKeys() {
    const spots = [
      [0, 1.1, 6],
      [-5, 1.1, -6],
      [6, 1.1, -10],
      [0, 1.2, -34],
      [-8, 1.2, -26],
      [8, 1.2, -42],
    ];
    spots.forEach(([x, y, z]) => this.spawnKey(x, y, z, 1));
  }

  spawnKey(x, y, z, value = 1) {
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.4,
      metalness: 0.85,
      roughness: 0.2,
    });

    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 8, 18), goldMat);
    bow.position.y = 0.28;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.48, 8), goldMat);
    shaft.position.y = -0.05;
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), goldMat);
    teeth.position.set(0.09, -0.2, 0);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.22, 3.0, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    beam.position.y = 1.1;

    group.add(bow, shaft, teeth, beam);
    this.scene.add(group);
    this.keys.push({
      mesh: group,
      pos: group.position,
      baseY: y,
      value,
      phase: Math.random() * Math.PI * 2,
    });
  }

  _buildEnemyMesh(kind, formSpec) {
    const THREE = this.THREE;
    const group = new THREE.Group();

    let bodyColor = formSpec ? formSpec.bodyColor : 0x7e22ce;
    let accentColor = formSpec ? formSpec.accentColor : 0xe879f9;
    let scale = formSpec ? formSpec.scale : 1.0;

    if (kind === "meyanga") {
      bodyColor = 0x581c87;
      accentColor = 0xf0abfc;
      scale = 1.65;
    } else if (kind === "satanti") {
      bodyColor = 0x450a0a;
      accentColor = 0xef4444;
      scale = 1.75;
    }

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.42,
      metalness: 0.35,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 1.05,
    });

    const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 1), bodyMat);
    torso.position.y = 1.45;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 12), bodyMat);
    head.position.y = 2.25;
    group.add(head);

    [-0.13, 0.13].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), glowMat);
      eye.position.set(ex, 2.28, 0.32);
      group.add(eye);
    });

    if (kind === "satanti" || (formSpec && (formSpec.id === "bestial" || formSpec.id === "divino_trevas"))) {
      [-0.26, 0.26].forEach((hx) => {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 6), glowMat);
        horn.position.set(hx, 2.62, 0);
        horn.rotation.z = hx < 0 ? 0.38 : -0.38;
        group.add(horn);
      });
    } else {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 24), glowMat);
      halo.position.y = 2.75;
      halo.rotation.x = Math.PI / 2;
      group.add(halo);
    }

    [-1, 1].forEach((dir) => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.08), glowMat);
      wing.position.set(dir * 0.85, 1.6, -0.3);
      wing.rotation.z = dir * 0.32;
      group.add(wing);
    });

    group.scale.setScalar(scale);
    return group;
  }

  spawnMediumEnemy(playerPos) {
    const form = ENEMY_FORMS[this.formCursor % ENEMY_FORMS.length];
    this.formCursor++;

    const angle = Math.random() * Math.PI * 2;
    const dist = 16 + Math.random() * 12;
    const x = Math.max(-75, Math.min(75, playerPos.x + Math.cos(angle) * dist));
    const z = Math.max(-85, Math.min(75, playerPos.z + Math.sin(angle) * dist));

    const mesh = this._buildEnemyMesh("medium", form);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);

    this.enemies.push({
      kind: "medium",
      form,
      name: form.name,
      mesh,
      pos: mesh.position,
      hp: form.hp,
      maxHp: form.hp,
      speed: form.speed,
      auraColor: form.auraColor,
      grabCooldown: 0,
      phase: Math.random() * Math.PI * 2,
    });
  }

  spawnMeyangaBoss(playerPos) {
    if (this.enemies.some((e) => e.kind === "meyanga")) return false;
    const angle = Math.random() * Math.PI * 2;
    const x = Math.max(-65, Math.min(65, playerPos.x + Math.cos(angle) * 20));
    const z = Math.max(-75, Math.min(65, playerPos.z + Math.sin(angle) * 20));

    const mesh = this._buildEnemyMesh("meyanga", null);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);

    this.enemies.push({
      kind: "meyanga",
      form: null,
      name: "Chefona Meyanga",
      mesh,
      pos: mesh.position,
      hp: 180,
      maxHp: 180,
      speed: 6.4,
      auraColor: 0xe879f9,
      grabCooldown: 0,
      phase: 0,
    });
    this.audio.playBossEvent(false);
    return true;
  }

  spawnSatantiBoro(playerPos) {
    if (this.enemies.some((e) => e.kind === "satanti")) return false;
    const angle = Math.random() * Math.PI * 2;
    const x = Math.max(-65, Math.min(65, playerPos.x + Math.cos(angle) * 18));
    const z = Math.max(-75, Math.min(65, playerPos.z + Math.sin(angle) * 18));

    const mesh = this._buildEnemyMesh("satanti", null);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);

    this.enemies.push({
      kind: "satanti",
      form: null,
      name: "Satãnti Borô",
      mesh,
      pos: mesh.position,
      hp: 130,
      maxHp: 130,
      speed: 7.2,
      auraColor: 0xef4444,
      grabCooldown: 2.0,
      phase: 0,
    });
    this.audio.playBossEvent(false);
    return true;
  }

  fireElementAttack(playerPos, playerYaw, elementIndex) {
    const THREE = this.THREE;
    const elem = ELEMENTS[elementIndex] || ELEMENTS[0];
    this.audio.playElementAttack(elem.id);

    const origin = new THREE.Vector3(playerPos.x, playerPos.y + 1.45, playerPos.z);
    let dir;
    if (this.lockedTarget && this.lockProgress > 0.1) {
      const targetPos = new THREE.Vector3(
        this.lockedTarget.pos.x,
        this.lockedTarget.pos.y + 1.4,
        this.lockedTarget.pos.z
      );
      dir = targetPos.sub(origin).normalize();
    } else {
      dir = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw)).normalize();
    }

    const projGroup = new THREE.Group();
    projGroup.position.copy(origin);
    const mat = new THREE.MeshBasicMaterial({ color: elem.color });

    if (elem.id === 0) {
      // Fogo
      projGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), mat));
    } else if (elem.id === 1) {
      // Trovão
      const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.15, 6), mat);
      bolt.rotation.x = Math.PI / 2;
      projGroup.add(bolt);
    } else if (elem.id === 2) {
      // Vento
      const cyclone = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.1, 8, 20), mat);
      cyclone.rotation.x = Math.PI / 2;
      projGroup.add(cyclone);
    } else {
      // Luz Divina
      projGroup.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), mat));
    }
    projGroup.add(new THREE.PointLight(elem.color, 2.2, 8));
    this.scene.add(projGroup);

    const baseDamage = 26 + Math.round(this.lockProgress * 18);
    this.projectiles.push({
      mesh: projGroup,
      vel: dir.multiplyScalar(34),
      age: 0,
      maxAge: 1.8,
      damage: baseDamage,
      color: elem.color,
      glowCss: elem.glow,
    });
  }

  _defeatEnemy(enemy, state, callbacks) {
    const idx = this.enemies.indexOf(enemy);
    if (idx !== -1) this.enemies.splice(idx, 1);
    this.scene.remove(enemy.mesh);

    if (this.captorEnemy === enemy) {
      this.isCaptured = false;
      this.captorEnemy = null;
      this.cageGroup.visible = false;
    }

    this.world.spawnSoftAuraExplosion(enemy.pos.x, enemy.pos.y + 1.4, enemy.pos.z, enemy.auraColor);
    if (enemy.kind === "medium" && enemy.form) {
      this.audio.playEnemyDefeat(enemy.form.id);
    } else {
      this.audio.playBossEvent(true);
    }

    for (let k = 0; k < KEYS_PER_ENEMY; k++) {
      const ang = (k / KEYS_PER_ENEMY) * Math.PI * 2;
      const rad = 0.42 + k * 0.24;
      this.spawnKey(
        enemy.pos.x + Math.cos(ang) * rad,
        Math.max(0.8, enemy.pos.y + 0.9),
        enemy.pos.z + Math.sin(ang) * rad,
        1
      );
    }

    callbacks.onFloatingText?.(
      { x: enemy.pos.x, y: enemy.pos.y + 2.5, z: enemy.pos.z },
      `+${KEYS_PER_ENEMY} 🔑`,
      "#f5c451"
    );

    state.enemiesDefeated += 1;
    state.highScore += enemy.kind === "medium" ? 150 : 650;

    if (enemy.kind === "medium") {
      state.mediumEnemiesCycle += 1;
      if (state.mediumEnemiesCycle >= MEDIUM_ENEMIES_PER_PORTAL) {
        state.mediumEnemiesCycle = MEDIUM_ENEMIES_PER_PORTAL;
        const spawned = this.spawnMeyangaBoss(state.playerPos);
        if (spawned) {
          callbacks.onToast("⚔️ Chefona Meyanga entrou em combate!");
        }
      }
    } else if (enemy.kind === "meyanga") {
      state.bossesDefeated += 1;
      state.mediumEnemiesCycle = 0;
      callbacks.onPortalAdvance();
    } else if (enemy.kind === "satanti") {
      state.satantiDowns += 1;
      state.keyTimerMaxSeconds += SATANTI_BONUS_SECONDS;
      state.keyTimerRemaining = state.keyTimerMaxSeconds;
      callbacks.onToast(
        `💥 Satãnti Borô derrubado! +${SATANTI_BONUS_SECONDS}s no tempo limite (${state.keyTimerMaxSeconds}s)!`
      );
    }

    callbacks.onStateMutated();
  }

  update(dt, elapsed, prevPlayerPos, state, callbacks) {
    const playerPos = state.playerPos;

    const activeMedium = this.enemies.filter((e) => e.kind === "medium").length;
    const hasMeyanga = this.enemies.some((e) => e.kind === "meyanga");
    if (!hasMeyanga && activeMedium === 0 && state.mediumEnemiesCycle < MEDIUM_ENEMIES_PER_PORTAL) {
      this.spawnCooldown -= dt;
      if (this.spawnCooldown <= 0) {
        this.spawnMediumEnemy(playerPos);
        this.spawnCooldown = 1.7;
      }
    }

    this.satantiSpawnTimer -= dt;
    if (this.satantiSpawnTimer <= 0) {
      const spawned = this.spawnSatantiBoro(playerPos);
      if (spawned) {
        callbacks.onToast("⚠️ Satãnti Borô surgiu na planície!");
      }
      this.satantiSpawnTimer = 28.0;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.phase += dt * 3;
      const toPlayerX = playerPos.x - e.pos.x;
      const toPlayerZ = playerPos.z - e.pos.z;
      const dist = Math.hypot(toPlayerX, toPlayerZ);

      if (dist > 0.01) {
        e.mesh.rotation.y = Math.atan2(toPlayerX, toPlayerZ);
      }

      if (dist > 2.2) {
        const move = Math.min(dist, e.speed * dt);
        e.pos.x += (toPlayerX / dist) * move;
        e.pos.z += (toPlayerZ / dist) * move;
      }
      e.pos.y = Math.max(0, playerPos.y * 0.45) + Math.sin(e.phase) * 0.25;

      if (e.kind === "satanti") {
        e.grabCooldown = Math.max(0, e.grabCooldown - dt);
        if (!this.isCaptured && e.grabCooldown <= 0 && dist < 2.55) {
          this.isCaptured = true;
          this.captorEnemy = e;
          this.cageGroup.visible = true;
          callbacks.onToast("⛓️ Satãnti Borô prendeu você! Cronômetro perdendo 30s/s!");
        }
      }

      if (state.auraRemaining > 0 && dist < 6.4) {
        e.hp -= 120 * dt;
        if (e.hp <= 0) {
          this._defeatEnemy(e, state, callbacks);
          continue;
        }
      }
    }

    if (this.isCaptured) {
      this.cageGroup.position.copy(playerPos);
      this.cageGroup.rotation.y += dt * 2.5;
      state.keyTimerRemaining = Math.max(0, state.keyTimerRemaining - 30.0 * dt);
      if (!this.captorEnemy || this.enemies.indexOf(this.captorEnemy) === -1) {
        this.isCaptured = false;
        this.captorEnemy = null;
        this.cageGroup.visible = false;
      }
    } else {
      state.keyTimerRemaining = Math.max(0, state.keyTimerRemaining - dt);
    }

    if (state.keyTimerRemaining <= 0) {
      if (this.isCaptured) {
        this.isCaptured = false;
        this.captorEnemy = null;
        this.cageGroup.visible = false;
      }
      state.keyTimerRemaining = state.keyTimerMaxSeconds;
      this.spawnKey(playerPos.x + 2.5, Math.max(1, playerPos.y + 1), playerPos.z - 2.5, 1);
      callbacks.onToast("⏳ Nova janela iniciada! Colete chaves rápido!");
    }

    // Growing Auto-Aim
    let nearest = null;
    let nearestDist = Infinity;
    this.enemies.forEach((e) => {
      const d = e.pos.distanceTo(playerPos);
      if (d < 28 && d < nearestDist) {
        nearest = e;
        nearestDist = d;
      }
    });

    if (nearest) {
      if (this.lockedTarget !== nearest) {
        this.lockedTarget = nearest;
        this.lockProgress = 0.15;
      } else {
        this.lockProgress = Math.min(1.0, this.lockProgress + dt * (1.2 + (28 - nearestDist) * 0.08));
      }
      this.reticleGroup.visible = true;
      this.reticleGroup.position.set(nearest.pos.x, nearest.pos.y, nearest.pos.z);
      const scaleGrow = 0.65 + this.lockProgress * 1.15;
      const { groundRing, targetHalo } = this.reticleGroup.userData;
      groundRing.scale.setScalar(scaleGrow);
      groundRing.rotation.z += dt * 3.5;
      targetHalo.scale.setScalar(0.75 + this.lockProgress * 0.85);
      targetHalo.rotation.y += dt * 4.5;
      targetHalo.rotation.x = Math.sin(elapsed * 4) * 0.4;
    } else {
      this.lockedTarget = null;
      this.lockProgress = 0;
      this.reticleGroup.visible = false;
    }

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.y += dt * 10;

      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        const hitRad = e.kind === "medium" ? 1.65 : 2.3;
        const centerY = e.pos.y + 1.4;
        const d = Math.hypot(
          p.mesh.position.x - e.pos.x,
          p.mesh.position.y - centerY,
          p.mesh.position.z - e.pos.z
        );
        if (d <= hitRad) {
          hit = true;
          e.hp -= p.damage;
          callbacks.onFloatingText?.(
            { x: e.pos.x, y: e.pos.y + 2.2, z: e.pos.z },
            `-${p.damage}`,
            p.glowCss
          );
          this.world.spawnSoftAuraExplosion(
            p.mesh.position.x,
            p.mesh.position.y,
            p.mesh.position.z,
            p.color
          );
          if (e.hp <= 0) {
            this._defeatEnemy(e, state, callbacks);
          }
          break;
        }
      }

      if (hit || p.age >= p.maxAge) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // 0.55m Continuous Swept-Segment Key Pickup
    const pickupRadiusSq = KEY_PICKUP_RADIUS * KEY_PICKUP_RADIUS;
    const playerCenterPrev = { x: prevPlayerPos.x, y: prevPlayerPos.y + 1.0, z: prevPlayerPos.z };
    const playerCenterCurr = { x: playerPos.x, y: playerPos.y + 1.0, z: playerPos.z };

    for (let i = this.keys.length - 1; i >= 0; i--) {
      const k = this.keys[i];
      k.phase += dt * 4;
      k.mesh.rotation.y += dt * 2.4;
      k.pos.y = k.baseY + Math.sin(k.phase) * 0.16;

      const dSq = distPointToSegmentSq(k.pos, playerCenterPrev, playerCenterCurr);
      const dSqGround = distPointToSegmentSq(k.pos, prevPlayerPos, playerPos);

      if (dSq <= pickupRadiusSq || dSqGround <= pickupRadiusSq) {
        this.scene.remove(k.mesh);
        this.keys.splice(i, 1);
        state.keysCollected += k.value;
        state.keyTimerRemaining = state.keyTimerMaxSeconds;
        state.highScore += 50 * k.value;
        this.audio.playKeyPickup();

        callbacks.onFloatingText?.(
          { x: playerPos.x, y: playerPos.y + 2.6, z: playerPos.z },
          `+${k.value} 🔑`,
          "#38bdf8"
        );

        if (!state.secretUnlocked && state.keysCollected >= 1000) {
          state.secretUnlocked = true;
          callbacks.onToast(
            '✨ 1.000 CHAVES! Personagem "?" (União dos 1000 Elos) desbloqueado!'
          );
        }
        callbacks.onStateMutated();
      }
    }
  }
}
