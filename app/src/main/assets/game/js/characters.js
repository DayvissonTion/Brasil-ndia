import { CHARACTERS } from "./constants.js";

export class CharacterRig {
  constructor(THREE, charSpec) {
    this.THREE = THREE;
    this.spec = charSpec;
    this.root = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.root.add(this.bodyGroup);

    this.leftArm = null;
    this.rightArm = null;
    this.leftLeg = null;
    this.rightLeg = null;
    this.head = null;

    this.leftWingPivot = null;
    this.rightWingPivot = null;
    this.leftWingOuter = null;
    this.rightWingOuter = null;
    this.leftFeathers = [];
    this.rightFeathers = [];

    this.auraGroup = null;
    this.auraRings = [];
    this.auraLight = null;
    this.heroFillLight = null;

    this._buildCharacter();
    this._buildRealisticWings();
    this._buildDivineAura();
  }

  _buildCharacter() {
    const THREE = this.THREE;
    const s = this.spec;

    const suitMat = new THREE.MeshStandardMaterial({
      color: s.suitColor,
      roughness: 0.38,
      metalness: 0.25,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: s.accentColor,
      emissive: s.accentColor,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.65,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: s.skinColor,
      roughness: 0.6,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: s.hairColor,
      roughness: 0.48,
      metalness: 0.14,
    });
    const eyeMat = new THREE.MeshBasicMaterial({
      color: s.eyeColor,
    });

    // Subtle fill light on the hero so character is always crisp and vivid
    this.heroFillLight = new THREE.PointLight(0xffffff, 1.35, 9);
    this.heroFillLight.position.set(0, 2.5, 2.2);
    this.bodyGroup.add(this.heroFillLight);

    // Torso + heroic shoulder pauldrons & chest crest
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.94, 0.44), suitMat);
    torso.position.y = 1.44;
    torso.castShadow = true;
    this.bodyGroup.add(torso);

    [-0.45, 0.45].forEach((sx) => {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), accentMat);
      pauldron.position.set(sx, 1.84, 0);
      pauldron.scale.set(1.1, 0.75, 1.1);
      this.bodyGroup.add(pauldron);
    });

    const chestCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), accentMat);
    chestCrest.position.set(0, 1.54, 0.24);
    chestCrest.scale.set(1, 1.35, 0.45);
    this.bodyGroup.add(chestCrest);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.47), accentMat);
    belt.position.y = 1.02;
    this.bodyGroup.add(belt);

    // Flowing Heroic Scarf / Cape Accent
    const cape = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.95, 0.06),
      new THREE.MeshStandardMaterial({
        color: s.accentColor,
        roughness: 0.5,
        emissive: s.suitColor,
        emissiveIntensity: 0.2,
      })
    );
    cape.position.set(0, 1.32, -0.28);
    cape.rotation.x = 0.18;
    this.bodyGroup.add(cape);

    // Head + expressive eyes & brows + stylized hair
    this.head = new THREE.Group();
    this.head.position.set(0, 2.18, 0);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 18), skinMat);
    skull.castShadow = true;
    this.head.add(skull);

    // Expressive eyes
    [-0.105, 0.105].forEach((ex) => {
      const eyeWhite = new THREE.Mesh(
        new THREE.SphereGeometry(0.056, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      eyeWhite.position.set(ex, 0.03, 0.27);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.033, 8, 8), eyeMat);
      iris.position.set(ex, 0.03, 0.308);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.026, 0.04), hairMat);
      brow.position.set(ex, 0.105, 0.285);
      brow.rotation.z = ex < 0 ? -0.15 : 0.15;
      this.head.add(eyeWhite, iris, brow);
    });

    // Stylized Hair Cap + dynamic locks
    const hairCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.345, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
      hairMat
    );
    hairCrown.position.y = 0.04;
    this.head.add(hairCrown);

    for (let i = 0; i < 7; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.3, 6), hairMat);
      const angle = (i / 7) * Math.PI * 1.5 - Math.PI * 0.75;
      spike.position.set(Math.sin(angle) * 0.24, 0.23, -Math.cos(angle) * 0.17 - 0.05);
      spike.rotation.x = -0.55;
      spike.rotation.z = -Math.sin(angle) * 0.48;
      this.head.add(spike);
    }

    if (s.id === "anciao") {
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 8), hairMat);
      beard.position.set(0, -0.24, 0.22);
      beard.rotation.x = Math.PI;
      this.head.add(beard);
    }

    this.bodyGroup.add(this.head);

    // Articulated Arms
    const armGeo = new THREE.BoxGeometry(0.24, 0.78, 0.24);
    armGeo.translate(0, -0.34, 0);
    const gloveGeo = new THREE.BoxGeometry(0.27, 0.24, 0.27);
    gloveGeo.translate(0, -0.68, 0);

    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.52, 1.82, 0);
    this.leftArm.add(new THREE.Mesh(armGeo, suitMat), new THREE.Mesh(gloveGeo, accentMat));

    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.52, 1.82, 0);
    this.rightArm.add(new THREE.Mesh(armGeo, suitMat), new THREE.Mesh(gloveGeo, accentMat));

    this.bodyGroup.add(this.leftArm, this.rightArm);

    // Articulated Legs
    const legGeo = new THREE.BoxGeometry(0.27, 0.88, 0.27);
    legGeo.translate(0, -0.44, 0);
    const bootGeo = new THREE.BoxGeometry(0.3, 0.25, 0.36);
    bootGeo.translate(0, -0.82, 0.04);

    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.21, 0.94, 0);
    this.leftLeg.add(new THREE.Mesh(legGeo, suitMat), new THREE.Mesh(bootGeo, accentMat));

    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.21, 0.94, 0);
    this.rightLeg.add(new THREE.Mesh(legGeo, suitMat), new THREE.Mesh(bootGeo, accentMat));

    this.bodyGroup.add(this.leftLeg, this.rightLeg);
  }

  _buildRealisticWings() {
    const THREE = this.THREE;
    const s = this.spec;

    const primaryMat = new THREE.MeshStandardMaterial({
      color: s.wingColor,
      emissive: s.wingTipColor,
      emissiveIntensity: 0.28,
      roughness: 0.32,
      metalness: 0.16,
    });
    const covertMat = new THREE.MeshStandardMaterial({
      color: s.wingTipColor,
      emissive: s.wingTipColor,
      emissiveIntensity: 0.42,
      roughness: 0.28,
      metalness: 0.42,
    });

    const createWingSide = (dir, featherStore) => {
      const innerPivot = new THREE.Group();
      innerPivot.position.set(dir * 0.24, 1.64, -0.26);

      const spar = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.11, 0.11), covertMat);
      spar.position.set(dir * 0.58, 0.16, 0);
      spar.rotation.z = dir * 0.22;
      innerPivot.add(spar);

      for (let i = 0; i < 6; i++) {
        const ratio = i / 5;
        const len = 0.88 + ratio * 0.58;
        const feather = new THREE.Mesh(new THREE.BoxGeometry(0.17, len, 0.04), primaryMat);
        feather.position.set(dir * (0.24 + i * 0.16), 0.12 - len * 0.42, -0.04 - (i % 2) * 0.03);
        feather.rotation.z = dir * (-0.18 - ratio * 0.24);
        innerPivot.add(feather);
        featherStore.push(feather);
      }

      for (let c = 0; c < 4; c++) {
        const cov = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.56, 0.06), covertMat);
        cov.position.set(dir * (0.28 + c * 0.2), 0.04, 0.03);
        cov.rotation.z = dir * (-0.25 - c * 0.06);
        innerPivot.add(cov);
      }

      const outerPivot = new THREE.Group();
      outerPivot.position.set(dir * 1.08, 0.26, 0);

      for (let p = 0; p < 6; p++) {
        const ratio = p / 5;
        const len = 1.52 - ratio * 0.48;
        const primary = new THREE.Mesh(new THREE.BoxGeometry(0.15, len, 0.035), primaryMat);
        primary.position.set(dir * (0.14 + p * 0.18), -len * 0.35 + ratio * 0.2, -0.02);
        primary.rotation.z = dir * (-0.65 - ratio * 0.45);
        outerPivot.add(primary);
        featherStore.push(primary);
      }

      innerPivot.add(outerPivot);
      this.bodyGroup.add(innerPivot);
      return { innerPivot, outerPivot };
    };

    const left = createWingSide(-1, this.leftFeathers);
    const right = createWingSide(1, this.rightFeathers);
    this.leftWingPivot = left.innerPivot;
    this.leftWingOuter = left.outerPivot;
    this.rightWingPivot = right.innerPivot;
    this.rightWingOuter = right.outerPivot;
  }

  _buildDivineAura() {
    const THREE = this.THREE;
    this.auraGroup = new THREE.Group();
    this.auraGroup.visible = false;

    const ringSpecs = [
      { r: 1.5, tube: 0.07, color: 0xfde047, tiltX: Math.PI / 2, tiltY: 0 },
      { r: 2.1, tube: 0.055, color: 0x38bdf8, tiltX: Math.PI / 3, tiltY: 0.5 },
      { r: 2.7, tube: 0.05, color: 0xffffff, tiltX: -Math.PI / 3, tiltY: -0.4 },
    ];
    ringSpecs.forEach((spec) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(spec.r, spec.tube, 12, 48),
        new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
        })
      );
      ring.position.y = 1.3;
      ring.rotation.set(spec.tiltX, spec.tiltY, 0);
      this.auraGroup.add(ring);
      this.auraRings.push(ring);
    });

    const auraSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.75, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    auraSphere.position.y = 1.3;
    this.auraGroup.add(auraSphere);

    this.auraLight = new THREE.PointLight(0xfde047, 5.0, 20);
    this.auraLight.position.y = 1.6;
    this.auraGroup.add(this.auraLight);

    this.root.add(this.auraGroup);
  }

  applyCharacterSpec(charSpec) {
    this.spec = charSpec;
    this.bodyGroup.clear();
    this.leftFeathers = [];
    this.rightFeathers = [];
    this._buildCharacter();
    this._buildRealisticWings();
  }

  updateAnimation(dt, elapsed, { isMoving, isFlying, speedRatio, attackPulse, auraActive, isCaptured }) {
    const lerp = this.THREE.MathUtils.lerp;

    if (isFlying) {
      this.bodyGroup.rotation.x = lerp(
        this.bodyGroup.rotation.x,
        isMoving ? 0.34 : 0.08,
        Math.min(1, dt * 8)
      );
      this.leftLeg.rotation.x = 0.25 + Math.sin(elapsed * 3) * 0.08;
      this.rightLeg.rotation.x = 0.32 - Math.sin(elapsed * 3) * 0.08;
      this.leftArm.rotation.x = -0.3 + Math.sin(elapsed * 4) * 0.1;
      this.rightArm.rotation.x = -0.3 - Math.sin(elapsed * 4) * 0.1;
    } else if (isMoving) {
      this.bodyGroup.rotation.x = lerp(this.bodyGroup.rotation.x, 0.12, Math.min(1, dt * 8));
      const swing = Math.sin(elapsed * 12) * 0.65 * Math.max(0.4, speedRatio);
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.85;
      this.rightArm.rotation.x = swing * 0.85;
    } else {
      this.bodyGroup.rotation.x = lerp(this.bodyGroup.rotation.x, 0, Math.min(1, dt * 8));
      this.leftLeg.rotation.x = lerp(this.leftLeg.rotation.x, 0, Math.min(1, dt * 8));
      this.rightLeg.rotation.x = lerp(this.rightLeg.rotation.x, 0, Math.min(1, dt * 8));
      this.leftArm.rotation.x = Math.sin(elapsed * 2) * 0.05;
      this.rightArm.rotation.x = -Math.sin(elapsed * 2) * 0.05;
    }

    if (attackPulse > 0) {
      this.rightArm.rotation.x = -1.4 * attackPulse;
      this.leftArm.rotation.x = -0.6 * attackPulse;
    }

    const flapSpeed = isFlying ? (isMoving ? 9.5 : 6.2) : auraActive ? 7.5 : 2.1;
    const flapAmp = isFlying ? 0.55 : auraActive ? 0.42 : 0.12;
    const baseOpenY = isFlying ? 0.25 : auraActive ? 0.2 : 0.72;
    const flap = Math.sin(elapsed * flapSpeed) * flapAmp;

    if (this.leftWingPivot && this.rightWingPivot) {
      this.leftWingPivot.rotation.y = baseOpenY + flap * 0.65;
      this.rightWingPivot.rotation.y = -(baseOpenY + flap * 0.65);

      this.leftWingPivot.rotation.z = flap * 0.45;
      this.rightWingPivot.rotation.z = -flap * 0.45;

      const outerCurl = isFlying ? Math.cos(elapsed * flapSpeed) * 0.32 : 0.2;
      this.leftWingOuter.rotation.y = outerCurl;
      this.rightWingOuter.rotation.y = -outerCurl;
    }

    this.auraGroup.visible = auraActive;
    if (auraActive) {
      this.auraRings.forEach((ring, idx) => {
        ring.rotation.z += dt * (2.6 + idx * 0.8);
        ring.rotation.x += dt * (idx % 2 === 0 ? 1.3 : -1.3);
        const wave = 1 + Math.sin(elapsed * 7 + idx) * 0.12;
        ring.scale.set(wave, wave, wave);
      });
    }

    if (isCaptured) {
      this.bodyGroup.position.x = Math.sin(elapsed * 32) * 0.04;
    } else {
      this.bodyGroup.position.x = 0;
    }
  }
}

export function getCharacterById(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}
