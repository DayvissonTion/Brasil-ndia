import { PLANES } from "./constants.js";

export class WorldBuilder {
  constructor(THREE, scene, renderer) {
    this.THREE = THREE;
    this.scene = scene;
    this.renderer = renderer;

    this.buildings = [];
    this.warFires = [];
    this.softExplosions = [];
    this.portals = [];
    this.skyDome = null;
    this.celestialParticles = null;
    this.celestialBeam = null;
    this.celestialBeamLight = null;
    this.riverMesh = null;
    this.terrainMesh = null;
    this.ambientLight = null;
    this.sunLight = null;
    this.hemiLight = null;
    this.currentPlane = PLANES[0];
    this.finalWarActive = false;
    this.warTime = 0;

    this._buildSkyDome();
    this._buildEnvironmentAndLights();
    this._buildTerrainAndRiver();
    this._buildPonteMarechalHermes();
    this._buildUrbanStructures();
    this._buildDimensionalPortals();
    this._buildCelestialBeam();
    this._buildCelestialMotes();
    this.applyPlaneTheme(0, false);
  }

  _makeProceduralTexture(primaryHex, secondaryHex, gridMode = false) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = primaryHex;
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 450; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const y = (Math.sin(i * 78.233) * 19341.23) % 1;
      const px = Math.abs(x) * 256;
      const py = Math.abs(y) * 256;
      const r = 2 + (i % 7);
      ctx.fillStyle = secondaryHex;
      ctx.globalAlpha = 0.16 + (i % 5) * 0.04;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (gridMode) {
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 2;
      for (let g = 0; g <= 256; g += 32) {
        ctx.beginPath();
        ctx.moveTo(g, 0);
        ctx.lineTo(g, 256);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, g);
        ctx.lineTo(256, g);
        ctx.stroke();
      }
    }

    const tex = new this.THREE.CanvasTexture(canvas);
    tex.wrapS = this.THREE.RepeatWrapping;
    tex.wrapT = this.THREE.RepeatWrapping;
    tex.repeat.set(22, 22);
    tex.colorSpace = this.THREE.SRGBColorSpace;
    return tex;
  }

  _buildSkyDome() {
    const THREE = this.THREE;
    const geo = new THREE.SphereGeometry(210, 24, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.skyDome = new THREE.Mesh(geo, mat);
    this.scene.add(this.skyDome);
  }

  _updateSkyDomeTexture(topColorHex, horizonColorHex) {
    const THREE = this.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");

    const topCol = "#" + topColorHex.toString(16).padStart(6, "0");
    const horCol = "#" + horizonColorHex.toString(16).padStart(6, "0");

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, topCol);
    grad.addColorStop(0.55, horCol);
    grad.addColorStop(0.85, "#0f172a");
    grad.addColorStop(1.0, "#070b19");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle stars & celestial glow
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    for (let i = 0; i < 65; i++) {
      const sx = Math.abs(Math.sin(i * 91.7)) * 256;
      const sy = Math.abs(Math.cos(i * 37.3)) * 120;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (this.skyDome) {
      if (this.skyDome.material.map) this.skyDome.material.map.dispose();
      this.skyDome.material.map = tex;
      this.skyDome.material.color.setHex(0xffffff);
      this.skyDome.material.needsUpdate = true;
    }
    this.scene.background = new THREE.Color(horizonColorHex);
  }

  _buildEnvironmentAndLights() {
    const THREE = this.THREE;
    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 1.05);
    this.scene.add(this.hemiLight);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.9);
    this.sunLight.position.set(36, 62, 28);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 160;
    const d = 55;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0008;
    this.scene.add(this.sunLight);
  }

  _buildTerrainAndRiver() {
    const THREE = this.THREE;
    const groundGeo = new THREE.PlaneGeometry(240, 240, 40, 40);
    groundGeo.rotateX(-Math.PI / 2);

    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const riverDist = Math.abs(z + 34);
      let y = 0;
      if (riverDist < 11) {
        y = -1.6 * (1 - riverDist / 11);
      } else if (Math.hypot(x, z) > 30) {
        y = Math.sin(x * 0.06) * Math.cos(z * 0.06) * 1.4;
      }
      pos.setY(i, y);
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      map: this._makeProceduralTexture("#2e5f36", "#4b7b41"),
      roughness: 0.86,
      metalness: 0.06,
    });
    this.terrainMesh = new THREE.Mesh(groundGeo, groundMat);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);

    const riverGeo = new THREE.PlaneGeometry(240, 22, 24, 6);
    riverGeo.rotateX(-Math.PI / 2);
    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.2,
      metalness: 0.55,
      transparent: true,
      opacity: 0.88,
    });
    this.riverMesh = new THREE.Mesh(riverGeo, riverMat);
    this.riverMesh.position.set(0, -0.42, -34);
    this.riverMesh.receiveShadow = true;
    this.scene.add(this.riverMesh);
  }

  _buildPonteMarechalHermes() {
    const THREE = this.THREE;
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(0, 0, -34);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.84 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.38, metalness: 0.72 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.76 });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(8, 0.75, 42), deckMat);
    deck.position.set(0, 4.2, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    bridgeGroup.add(deck);

    const rampSouth = new THREE.Mesh(new THREE.BoxGeometry(8, 0.7, 12), deckMat);
    rampSouth.position.set(0, 2.2, 25.5);
    rampSouth.rotation.x = 0.34;
    bridgeGroup.add(rampSouth);

    const rampNorth = new THREE.Mesh(new THREE.BoxGeometry(8, 0.7, 12), deckMat);
    rampNorth.position.set(0, 2.2, -25.5);
    rampNorth.rotation.x = -0.34;
    bridgeGroup.add(rampNorth);

    [-16, -6, 6, 16].forEach((zPos) => {
      [-3.1, 3.1].forEach((xPos) => {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.2, 1.8), stoneMat);
        pier.position.set(xPos, 1.6, zPos);
        pier.castShadow = true;
        bridgeGroup.add(pier);
      });
    });

    [-12, 0, 12].forEach((cz) => {
      [-3.7, 3.7].forEach((sideX) => {
        const topChord = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 11.4), steelMat);
        topChord.position.set(sideX, 8.2, cz);
        bridgeGroup.add(topChord);

        for (let k = -2; k <= 2; k++) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.8, 0.28), steelMat);
          post.position.set(sideX, 6.2, cz + k * 2.4);
          bridgeGroup.add(post);

          if (k < 2) {
            const diag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.4, 0.22), steelMat);
            diag.position.set(sideX, 6.2, cz + k * 2.4 + 1.2);
            diag.rotation.x = k % 2 === 0 ? 0.56 : -0.56;
            bridgeGroup.add(diag);
          }
        }
      });

      for (let b = -1; b <= 1; b++) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.28, 0.28), steelMat);
        brace.position.set(0, 8.2, cz + b * 3.4);
        bridgeGroup.add(brace);
      }
    });

    const shelterLight = new THREE.PointLight(0xfbbf24, 2.2, 18);
    shelterLight.position.set(0, 2.2, 0);
    bridgeGroup.add(shelterLight);

    this.scene.add(bridgeGroup);
  }

  _buildUrbanStructures() {
    const THREE = this.THREE;
    const buildingCoords = [
      { x: -24, z: 14, w: 7, h: 14, d: 7, color: 0x334155 },
      { x: -34, z: -6, w: 8, h: 18, d: 8, color: 0x475569 },
      { x: -18, z: 28, w: 6, h: 11, d: 7, color: 0x3b4252 },
      { x: 24, z: 16, w: 8, h: 16, d: 8, color: 0x334155 },
      { x: 35, z: -8, w: 9, h: 21, d: 8, color: 0x1e293b },
      { x: 20, z: 32, w: 7, h: 12, d: 6, color: 0x475569 },
      { x: -28, z: -64, w: 9, h: 17, d: 9, color: 0x334155 },
      { x: 26, z: -62, w: 8, h: 15, d: 8, color: 0x475569 },
    ];

    const facadeTex = this._makeProceduralTexture("#334155", "#64748b", true);
    facadeTex.repeat.set(2, 4);

    buildingCoords.forEach((b, idx) => {
      const group = new THREE.Group();
      group.position.set(b.x, 0, b.z);

      const mat = new THREE.MeshStandardMaterial({
        color: b.color,
        map: facadeTex,
        roughness: 0.55,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
      mesh.position.y = b.h / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      const beacon = new THREE.Mesh(
        new THREE.BoxGeometry(b.w * 0.4, 0.8, b.d * 0.4),
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xd97706,
          emissiveIntensity: 0.65,
        })
      );
      beacon.position.y = b.h + 0.4;
      group.add(beacon);

      this.scene.add(group);
      this.buildings.push({
        group,
        baseX: b.x,
        baseZ: b.z,
        height: b.h,
        collapseProgress: 0,
        tiltDirX: idx % 2 === 0 ? 1 : -1,
        tiltDirZ: idx % 3 === 0 ? 1 : -1,
        delay: idx * 1.1,
      });
    });

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
    const treeSpots = [
      [-14, -12], [15, -10], [-16, 6], [16, 8], [-42, 22], [44, 24], [-14, -54], [14, -54],
    ];
    treeSpots.forEach(([tx, tz]) => {
      const tGroup = new THREE.Group();
      tGroup.position.set(tx, 0, tz);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3.2, 7), trunkMat);
      trunk.position.y = 1.6;
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.1, 1), leafMat);
      crown.position.y = 4.2;
      tGroup.add(trunk, crown);
      this.scene.add(tGroup);
    });
  }

  _buildDimensionalPortals() {
    const THREE = this.THREE;
    [
      { x: 0, z: -72 },
      { x: 52, z: 0 },
    ].forEach((p) => {
      const group = new THREE.Group();
      group.position.set(p.x, 4.2, p.z);

      const outerRing = new THREE.Mesh(
        new THREE.TorusGeometry(3.8, 0.32, 14, 40),
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x38bdf8,
          emissiveIntensity: 1.6,
          metalness: 0.75,
          roughness: 0.2,
        })
      );
      const innerDisc = new THREE.Mesh(
        new THREE.CircleGeometry(3.45, 32),
        new THREE.MeshBasicMaterial({
          color: 0x7dd3fc,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
        })
      );
      const light = new THREE.PointLight(0x38bdf8, 2.8, 20);
      group.add(outerRing, innerDisc, light);
      this.scene.add(group);
      this.portals.push({ group, outerRing, innerDisc, light });
    });
  }

  _buildCelestialBeam() {
    const THREE = this.THREE;
    const beamGeo = new THREE.CylinderGeometry(3.0, 11.0, 78, 28, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.celestialBeam = new THREE.Mesh(beamGeo, beamMat);
    this.celestialBeam.position.set(0, 38, 0);
    this.scene.add(this.celestialBeam);

    const coreBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 3.6, 78, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.celestialBeam.add(coreBeam);

    const haloGeo = new THREE.RingGeometry(4.5, 12.5, 42);
    haloGeo.rotateX(-Math.PI / 2);
    const groundHalo = new THREE.Mesh(
      haloGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    groundHalo.position.y = -37.85;
    this.celestialBeam.add(groundHalo);

    this.celestialBeamLight = new THREE.PointLight(0xfde047, 3.6, 65);
    this.celestialBeamLight.position.set(0, 12, 0);
    this.scene.add(this.celestialBeamLight);
  }

  _buildCelestialMotes() {
    const THREE = this.THREE;
    const count = 90;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 2 + Math.random() * 28;
      const a = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = 0.5 + Math.random() * 22;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfef08a,
      size: 0.35,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.celestialParticles = new THREE.Points(geo, mat);
    this.scene.add(this.celestialParticles);
  }

  applyPlaneTheme(planeIndex, finalWarActive) {
    const THREE = this.THREE;
    const plane = PLANES[planeIndex % PLANES.length];
    this.currentPlane = plane;
    this.finalWarActive = finalWarActive;

    const skyTop = finalWarActive ? 0x450a0a : plane.skyTop;
    const skyHorizon = finalWarActive ? 0xea580c : plane.skyHorizon;
    const fogColor = finalWarActive ? 0x7c2d12 : plane.fogColor;

    this._updateSkyDomeTexture(skyTop, skyHorizon);
    this.scene.fog = new THREE.FogExp2(fogColor, finalWarActive ? 0.01 : 0.0068);

    if (this.terrainMesh) {
      if (this.terrainMesh.material.map) this.terrainMesh.material.map.dispose();
      this.terrainMesh.material.map = this._makeProceduralTexture(
        plane.groundPrimary,
        plane.groundSecondary
      );
      this.terrainMesh.material.needsUpdate = true;
    }

    if (this.ambientLight) {
      this.ambientLight.color.setHex(finalWarActive ? 0xffedd5 : plane.ambientColor);
    }

    const beamHex = finalWarActive ? 0xff4500 : plane.beamColor;
    const beamMult = finalWarActive ? 1.85 : 1.0;
    if (this.celestialBeam) {
      this.celestialBeam.material.color.setHex(beamHex);
      this.celestialBeam.material.opacity = finalWarActive ? 0.38 : 0.22;
      this.celestialBeam.children[1].material.color.setHex(beamHex);
    }
    if (this.celestialBeamLight) {
      this.celestialBeamLight.color.setHex(beamHex);
      this.celestialBeamLight.intensity = plane.beamIntensity * 1.6 * beamMult;
    }
    if (this.celestialParticles) {
      this.celestialParticles.material.color.setHex(beamHex);
    }

    this.portals.forEach((p) => {
      p.outerRing.material.color.setHex(plane.portalColor);
      p.outerRing.material.emissive.setHex(plane.portalColor);
      p.innerDisc.material.color.setHex(plane.portalColor);
      p.light.color.setHex(plane.portalColor);
    });
  }

  setFinalWar(active, audioEngine) {
    this.finalWarActive = active;
    this.applyPlaneTheme(this.currentPlane.id, active);

    if (active) {
      this._spawnWarFires();
      if (audioEngine) audioEngine.playSoftExplosion();
    } else {
      this._clearWarFires();
      this.buildings.forEach((b) => {
        b.collapseProgress = 0;
        b.group.position.y = 0;
        b.group.rotation.set(0, 0, 0);
      });
    }
  }

  _spawnWarFires() {
    if (this.warFires.length > 0) return;
    const THREE = this.THREE;
    const fireMat = new THREE.MeshBasicMaterial({
      color: 0xff6d00,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const dist = 12 + (i % 4) * 12;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.2, 8), fireMat.clone());
      cone.position.set(Math.cos(angle) * dist, 1.5, Math.sin(angle) * dist);
      this.scene.add(cone);
      this.warFires.push({ mesh: cone, phase: i * 0.7, baseY: 1.5 });
    }
  }

  _clearWarFires() {
    this.warFires.forEach((f) => this.scene.remove(f.mesh));
    this.warFires = [];
  }

  spawnSoftAuraExplosion(x, y, z, colorHex) {
    const THREE = this.THREE;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 14, 14),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sphere.position.set(x, y, z);
    this.scene.add(sphere);
    this.softExplosions.push({ mesh: sphere, age: 0, maxAge: 0.65 });
  }

  update(dt, elapsed, audioEngine) {
    if (this.riverMesh) {
      this.riverMesh.position.y = -0.42 + Math.sin(elapsed * 1.8) * 0.05;
    }

    if (this.celestialBeam) {
      this.celestialBeam.rotation.y += dt * (this.finalWarActive ? 1.1 : 0.35);
      const pulse = 1 + Math.sin(elapsed * 2.4) * (this.finalWarActive ? 0.14 : 0.06);
      this.celestialBeam.scale.set(pulse, 1, pulse);
    }

    if (this.celestialParticles) {
      const posAttr = this.celestialParticles.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) + dt * (this.finalWarActive ? 3.2 : 1.4);
        if (y > 24) y = 0.5;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
      this.celestialParticles.rotation.y += dt * 0.08;
    }

    this.portals.forEach((p, idx) => {
      p.outerRing.rotation.z += dt * (idx === 0 ? 0.9 : -0.9);
      p.innerDisc.material.opacity = 0.28 + Math.sin(elapsed * 3.5 + idx) * 0.1;
    });

    if (this.finalWarActive) {
      this.warTime += dt;
      this.warFires.forEach((f) => {
        const flicker = 0.8 + Math.sin(elapsed * 11 + f.phase) * 0.32;
        f.mesh.scale.set(1, flicker, 1);
        f.mesh.position.y = f.baseY * flicker;
      });

      this.buildings.forEach((b) => {
        if (this.warTime > b.delay && b.collapseProgress < 1) {
          const prev = b.collapseProgress;
          b.collapseProgress = Math.min(1, b.collapseProgress + dt * 0.18);
          const p = b.collapseProgress;
          b.group.position.y = -p * (b.height * 0.58);
          b.group.rotation.z = b.tiltDirX * p * 0.42;
          b.group.rotation.x = b.tiltDirZ * p * 0.32;
          if (prev < 0.25 && b.collapseProgress >= 0.25) {
            this.spawnSoftAuraExplosion(b.baseX, 4, b.baseZ, 0xff7722);
            if (audioEngine) audioEngine.playSoftExplosion();
          }
        }
      });

      if (Math.random() < dt * 1.4) {
        this.spawnSoftAuraExplosion(
          (Math.random() - 0.5) * 60,
          2 + Math.random() * 8,
          (Math.random() - 0.5) * 60,
          0xfb923c
        );
      }
    }

    for (let i = this.softExplosions.length - 1; i >= 0; i--) {
      const ex = this.softExplosions[i];
      ex.age += dt;
      const t = ex.age / ex.maxAge;
      if (t >= 1) {
        this.scene.remove(ex.mesh);
        this.softExplosions.splice(i, 1);
      } else {
        const s = 1 + t * 3.2;
        ex.mesh.scale.set(s, s, s);
        ex.mesh.material.opacity = (1 - t) * 0.65;
      }
    }
  }
}
