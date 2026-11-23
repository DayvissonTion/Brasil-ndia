import {
  AURA_DURATION_SECONDS,
  AUTHOR_NAME,
  BASE_KEY_TIMER_SECONDS,
  CHARACTERS,
  GAME_TITLE,
  MEDIUM_ENEMIES_PER_PORTAL,
  PLANES,
  STORY_CHAPTERS,
  TARGET_KEYS,
} from "./constants.js";
import { SoundEngine } from "./audio.js";
import { WorldBuilder } from "./world.js";
import { CharacterRig, getCharacterById } from "./characters.js";
import { CombatManager } from "./combat.js";

async function loadThreeWithFallback() {
  const sources = [
    "../vendor/three.module.min.js",
    "three",
    "https://unpkg.com/three@0.170.0/build/three.module.js",
  ];
  for (const src of sources) {
    try {
      const THREE = await import(src);
      return THREE;
    } catch (err) {
      console.warn("Three.js load failed from", src, err);
    }
  }
  throw new Error("Não foi possível carregar o motor 3D WebGL.");
}

class BrasilandiaGame {
  constructor() {
    this.audio = new SoundEngine();
    this.THREE = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.world = null;
    this.playerRig = null;
    this.combat = null;

    this.state = {
      playerName: "Viajante",
      activeCharacterId: "ever",
      keysCollected: 0,
      enemiesDefeated: 0,
      mediumEnemiesCycle: 0,
      currentRealmIndex: 0,
      bossesDefeated: 0,
      satantiDowns: 0,
      keyTimerMaxSeconds: BASE_KEY_TIMER_SECONDS,
      keyTimerRemaining: BASE_KEY_TIMER_SECONDS,
      finalWarActive: false,
      secretUnlocked: false,
      highScore: 0,
      playerPos: null,
      playerYaw: Math.PI,
      isFlying: false,
      selectedElement: 0,
      auraRemaining: 0,
      auraCooldown: 0,
    };

    this.keysDown = new Set();
    this.joystickVec = { x: 0, y: 0 };
    this.touchAscend = false;
    this.touchDescend = false;
    this.attackPulse = 0;
    this.cameraYawOffset = 0;
    this.cameraPitch = 0.36;
    this.toastTimeout = null;
    this.autoSaveTimer = 0;
    this.dirtyCloudSave = false;
    this.minimapMode = "compact";
    this.inGameplay = false;
    this.lastTime = 0;
    this.elapsed = 0;

    this._bindDom();
    this._bindAndroidBridgeCallbacks();
  }

  _bindDom() {
    this.dom = {
      canvas: document.getElementById("renderCanvas"),
      floatingLayer: document.getElementById("floatingLayer"),
      loadingOverlay: document.getElementById("loadingOverlay"),
      loadingBarFill: document.getElementById("loadingBarFill"),
      loadingStatusText: document.getElementById("loadingStatusText"),
      btnStartGame: document.getElementById("btnStartGame"),

      hudTop: document.getElementById("hudTop"),
      hudBottom: document.getElementById("hudBottom"),
      statusBanners: document.getElementById("statusBanners"),
      minimapPanel: document.getElementById("minimapPanel"),
      minimapCanvas: document.getElementById("minimapCanvas"),
      touchControls: document.getElementById("touchControls"),
      quickDrawer: document.getElementById("quickDrawer"),
      flightAltitudePad: document.getElementById("flightAltitudePad"),

      hudKeys: document.getElementById("hudKeys"),
      hudRealm: document.getElementById("hudRealm"),
      hudCycle: document.getElementById("hudCycle"),
      hudTimer: document.getElementById("hudTimer"),
      timerChip: document.getElementById("timerChip"),
      hudCharName: document.getElementById("hudCharName"),
      hudFlightState: document.getElementById("hudFlightState"),

      bossBanner: document.getElementById("bossBanner"),
      bossBannerTitle: document.getElementById("bossBannerTitle"),
      bossHpFill: document.getElementById("bossHpFill"),
      captureBanner: document.getElementById("captureBanner"),
      auraBanner: document.getElementById("auraBanner"),
      auraCountdown: document.getElementById("auraCountdown"),
      toastBanner: document.getElementById("toastBanner"),

      btnMenuToggle: document.getElementById("btnMenuToggle"),
      btnCloudLogin: document.getElementById("btnCloudLogin"),
      btnCharacters: document.getElementById("btnCharacters"),
      btnStory: document.getElementById("btnStory"),
      btnFinalWar: document.getElementById("btnFinalWar"),
      btnWhatsApp: document.getElementById("btnWhatsApp"),
      btnAudioToggle: document.getElementById("btnAudioToggle"),
      btnAuraDivina: document.getElementById("btnAuraDivina"),
      btnToggleFlight: document.getElementById("btnToggleFlight"),

      btnMinimapSize: document.getElementById("btnMinimapSize"),
      btnMinimapMin: document.getElementById("btnMinimapMin"),

      characterModal: document.getElementById("characterModal"),
      btnCloseCharModal: document.getElementById("btnCloseCharModal"),
      characterGrid: document.getElementById("characterGrid"),

      storyModal: document.getElementById("storyModal"),
      btnCloseStoryModal: document.getElementById("btnCloseStoryModal"),
      btnNarratePlay: document.getElementById("btnNarratePlay"),
      btnNarrateStop: document.getElementById("btnNarrateStop"),
      narrationStatus: document.getElementById("narrationStatus"),
      storyContent: document.getElementById("storyContent"),

      joystickZone: document.getElementById("joystickZone"),
      joystickKnob: document.getElementById("joystickKnob"),
      btnTouchUp: document.getElementById("btnTouchUp"),
      btnTouchDown: document.getElementById("btnTouchDown"),
      btnTouchAttack: document.getElementById("btnTouchAttack"),
    };
  }

  _bindAndroidBridgeCallbacks() {
    window.onCloudAuthChanged = (isAuth) => {
      if (this.dom.btnCloudLogin) {
        this.dom.btnCloudLogin.classList.toggle("hidden", Boolean(isAuth));
      }
      if (isAuth && this.state.keysCollected > 0) {
        this.dirtyCloudSave = true;
        this._saveProgressNow();
      }
    };
    window.onCloudSaveLoaded = (saved) => {
      if (!saved || typeof saved !== "object") return;
      const prevKeys = this.state.keysCollected;
      const prevEnemies = this.state.enemiesDefeated;
      this.applySavedProgress(saved);
      if (prevKeys > (saved.keysCollected || 0) || prevEnemies > (saved.enemiesDefeated || 0)) {
        this._saveProgressNow();
      }
    };
    window.onCloudSyncError = (msg) => {
      this.showToast(`☁️ ${msg}`);
    };
    window.handleAndroidBack = () => {
      if (!this.dom.quickDrawer.classList.contains("hidden")) {
        this.dom.quickDrawer.classList.add("hidden");
        return;
      }
      if (!this.dom.characterModal.classList.contains("hidden")) {
        this.dom.characterModal.classList.add("hidden");
        return;
      }
      if (!this.dom.storyModal.classList.contains("hidden")) {
        this.audio.stopNarration();
        this.dom.storyModal.classList.add("hidden");
      }
    };
  }

  applySavedProgress(saved) {
    if (saved.playerName) this.state.playerName = saved.playerName;
    if (typeof saved.keysCollected === "number") {
      this.state.keysCollected = Math.max(this.state.keysCollected, saved.keysCollected);
    }
    if (typeof saved.enemiesDefeated === "number") {
      this.state.enemiesDefeated = Math.max(this.state.enemiesDefeated, saved.enemiesDefeated);
    }
    if (typeof saved.mediumEnemiesCycle === "number") {
      this.state.mediumEnemiesCycle = saved.mediumEnemiesCycle;
    }
    if (typeof saved.currentRealmIndex === "number") {
      this.state.currentRealmIndex = saved.currentRealmIndex % PLANES.length;
      if (this.world) {
        this.world.applyPlaneTheme(this.state.currentRealmIndex, this.state.finalWarActive);
      }
    }
    if (typeof saved.bossesDefeated === "number") {
      this.state.bossesDefeated = Math.max(this.state.bossesDefeated, saved.bossesDefeated);
    }
    if (typeof saved.satantiDowns === "number") {
      this.state.satantiDowns = Math.max(this.state.satantiDowns, saved.satantiDowns);
    }
    if (typeof saved.keyTimerMaxSeconds === "number") {
      this.state.keyTimerMaxSeconds = Math.max(BASE_KEY_TIMER_SECONDS, saved.keyTimerMaxSeconds);
      this.state.keyTimerRemaining = this.state.keyTimerMaxSeconds;
    }
    if (typeof saved.finalWarActive === "boolean" && saved.finalWarActive !== this.state.finalWarActive) {
      this.state.finalWarActive = saved.finalWarActive;
      if (this.world) this.world.setFinalWar(saved.finalWarActive, null);
    }
    this.state.secretUnlocked = Boolean(saved.secretUnlocked) || this.state.keysCollected >= TARGET_KEYS;
    if (typeof saved.highScore === "number") {
      this.state.highScore = Math.max(this.state.highScore, saved.highScore);
    }
    if (saved.activeCharacterId) {
      this.selectCharacter(saved.activeCharacterId, false);
    }
    this._updateHud();
  }

  async init() {
    try {
      this._setLoading(30, "Carregando motor 3D local...");
      const THREE = await loadThreeWithFallback();
      this.THREE = THREE;

      this._setLoading(58, "Erguendo Ponte Marechal Hermes e luz celestial...");
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(
        56,
        window.innerWidth / Math.max(1, window.innerHeight),
        0.1,
        320
      );

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.dom.canvas,
        antialias: true,
        powerPreference: "high-performance",
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;

      this.state.playerPos = new THREE.Vector3(0, 0, 10);

      this.world = new WorldBuilder(THREE, this.scene, this.renderer);
      this.playerRig = new CharacterRig(THREE, getCharacterById(this.state.activeCharacterId));
      this.playerRig.root.position.copy(this.state.playerPos);
      this.scene.add(this.playerRig.root);

      this.combat = new CombatManager(THREE, this.scene, this.world, this.audio);

      this._setLoading(88, "Sincronizando dados...");
      this._loadLocalAndBridgeSave();

      this._setupUIEvents();
      this._renderStoryModal();
      this._renderCharacterGrid();
      this._updateHud();

      this._setLoading(100, "Pronto! Toque para começar.");
      this.dom.btnStartGame.classList.remove("hidden");

      // Render live 3D preview immediately behind the welcome card!
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this._loop(t));
    } catch (err) {
      this._setLoading(100, `Erro ao inicializar 3D: ${err.message}`);
    }
  }

  _setLoading(pct, msg) {
    this.dom.loadingBarFill.style.width = `${pct}%`;
    this.dom.loadingStatusText.textContent = msg;
  }

  _loadLocalAndBridgeSave() {
    try {
      const local = localStorage.getItem("brasilandia_save_v1");
      if (local) this.applySavedProgress(JSON.parse(local));
    } catch {}
    try {
      if (window.AndroidBridge && window.AndroidBridge.isCloudAuthenticated) {
        const isAuth = window.AndroidBridge.isCloudAuthenticated();
        if (this.dom.btnCloudLogin) {
          this.dom.btnCloudLogin.classList.toggle("hidden", Boolean(isAuth));
        }
      }
      if (window.AndroidBridge && window.AndroidBridge.requestCloudState) {
        const raw = window.AndroidBridge.requestCloudState();
        if (raw) this.applySavedProgress(JSON.parse(raw));
      }
    } catch {}
  }

  _saveProgressNow() {
    const payload = {
      playerName: this.state.playerName,
      activeCharacterId: this.state.activeCharacterId,
      keysCollected: this.state.keysCollected,
      enemiesDefeated: this.state.enemiesDefeated,
      mediumEnemiesCycle: this.state.mediumEnemiesCycle,
      currentRealmIndex: this.state.currentRealmIndex,
      bossesDefeated: this.state.bossesDefeated,
      satantiDowns: this.state.satantiDowns,
      keyTimerMaxSeconds: Math.round(this.state.keyTimerMaxSeconds),
      finalWarActive: this.state.finalWarActive,
      secretUnlocked: this.state.secretUnlocked,
      highScore: this.state.highScore,
    };
    const json = JSON.stringify(payload);
    try {
      localStorage.setItem("brasilandia_save_v1", json);
    } catch {}
    try {
      if (window.AndroidBridge && window.AndroidBridge.autoSaveCloud) {
        window.AndroidBridge.autoSaveCloud(json);
      }
    } catch {}
  }

  _setupUIEvents() {
    this.dom.btnStartGame.addEventListener("click", () => {
      this.audio.init();
      this.dom.loadingOverlay.classList.add("hidden");
      this.dom.hudTop.classList.remove("hidden");
      this.dom.hudBottom.classList.remove("hidden");
      this.dom.statusBanners.classList.remove("hidden");
      this.dom.minimapPanel.classList.remove("hidden");
      this.dom.touchControls.classList.remove("hidden");
      this.inGameplay = true;
      this.showToast("✨ Explore a Planície e a Ponte Velha em Pirapora!");
    });

    window.addEventListener("keydown", (e) => {
      const code = e.code;
      this.keysDown.add(code);
      if (!this.inGameplay) return;

      if (code === "Digit1") this._selectElement(0);
      else if (code === "Digit2") this._selectElement(1);
      else if (code === "Digit3") this._selectElement(2);
      else if (code === "Digit4") this._selectElement(3);
      else if (code === "KeyF") this._toggleFlight();
      else if (code === "KeyE") this._activateDivineAuraManual();
      else if (code === "Space") {
        e.preventDefault();
        this._performAttack();
      }
    });
    window.addEventListener("keyup", (e) => this.keysDown.delete(e.code));

    // Drag canvas to orbit camera smoothly; quick tap to attack
    let dragId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragMoved = false;
    this.dom.canvas.addEventListener("pointerdown", (e) => {
      if (!this.inGameplay) return;
      dragId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragMoved = false;
    });
    this.dom.canvas.addEventListener("pointermove", (e) => {
      if (e.pointerId !== dragId || !this.inGameplay) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.hypot(dx, dy) > 6) dragMoved = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      this.cameraYawOffset -= dx * 0.007;
      this.cameraPitch = Math.max(0.14, Math.min(0.85, this.cameraPitch + dy * 0.004));
    });
    this.dom.canvas.addEventListener("pointerup", (e) => {
      if (e.pointerId !== dragId) return;
      dragId = null;
      if (!dragMoved && this.inGameplay) {
        this._performAttack();
      }
    });

    document.querySelectorAll(".elem-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._selectElement(parseInt(btn.dataset.elem, 10));
      });
    });

    this.dom.btnAuraDivina.addEventListener("click", () => this._activateDivineAuraManual());
    this.dom.btnToggleFlight.addEventListener("click", () => this._toggleFlight());

    this.dom.btnMenuToggle.addEventListener("click", () => {
      this.dom.quickDrawer.classList.toggle("hidden");
    });

    this.dom.btnCloudLogin.addEventListener("click", () => {
      this.dom.quickDrawer.classList.add("hidden");
      if (window.AndroidBridge && window.AndroidBridge.requestCloudLogin) {
        window.AndroidBridge.requestCloudLogin();
      } else {
        this.showToast("☁️ Login Google disponível na versão conectada.");
      }
    });

    this.dom.btnFinalWar.addEventListener("click", () => {
      this.dom.quickDrawer.classList.add("hidden");
      this.state.finalWarActive = !this.state.finalWarActive;
      this.dom.btnFinalWar.classList.toggle("active", this.state.finalWarActive);
      this.world.setFinalWar(this.state.finalWarActive, this.audio);
      this.showToast(
        this.state.finalWarActive
          ? "🔥 GUERRA FINAL ATIVADA!"
          : "🌤️ Guerra Final contida."
      );
      this.dirtyCloudSave = true;
    });

    this.dom.btnCharacters.addEventListener("click", () => {
      this.dom.quickDrawer.classList.add("hidden");
      this._renderCharacterGrid();
      this.dom.characterModal.classList.remove("hidden");
    });
    this.dom.btnCloseCharModal.addEventListener("click", () => {
      this.dom.characterModal.classList.add("hidden");
    });

    this.dom.btnStory.addEventListener("click", () => {
      this.dom.quickDrawer.classList.add("hidden");
      this.dom.storyModal.classList.remove("hidden");
    });
    this.dom.btnCloseStoryModal.addEventListener("click", () => {
      this.audio.stopNarration();
      this.dom.storyModal.classList.add("hidden");
    });

    this.dom.btnNarratePlay.addEventListener("click", () => {
      this.audio.startStoryNarration(
        (pIdx) => this._highlightStoryParagraph(pIdx),
        (status) => {
          this.dom.narrationStatus.textContent = status;
        }
      );
    });
    this.dom.btnNarrateStop.addEventListener("click", () => {
      this.audio.stopNarration();
      this._highlightStoryParagraph(-1);
      this.dom.narrationStatus.textContent = "Narração interrompida.";
    });

    this.dom.btnAudioToggle.addEventListener("click", () => {
      const next = !this.audio.muted;
      this.audio.setMuted(next);
      this.dom.btnAudioToggle.textContent = next ? "🔇 Som Mudo" : "🔊 Som Ligado";
    });

    this.dom.btnWhatsApp.addEventListener("click", () => {
      this.dom.quickDrawer.classList.add("hidden");
      this._shareProgressWhatsApp();
    });

    this.dom.btnMinimapSize.addEventListener("click", () => {
      if (this.minimapMode === "minimized") this.minimapMode = "compact";
      else this.minimapMode = this.minimapMode === "compact" ? "expanded" : "compact";
      this._applyMinimapClass();
    });
    this.dom.btnMinimapMin.addEventListener("click", () => {
      this.minimapMode = this.minimapMode === "minimized" ? "compact" : "minimized";
      this._applyMinimapClass();
    });

    // Virtual Joystick
    const zone = this.dom.joystickZone;
    const knob = this.dom.joystickKnob;
    let activeTouchId = null;
    const updateJoystick = (clientX, clientY) => {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxR = rect.width * 0.38;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joystickVec.x = dx / maxR;
      this.joystickVec.y = dy / maxR;
    };
    const resetJoystick = () => {
      activeTouchId = null;
      knob.style.transform = "translate(0px, 0px)";
      this.joystickVec.x = 0;
      this.joystickVec.y = 0;
    };
    zone.addEventListener("pointerdown", (e) => {
      activeTouchId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      updateJoystick(e.clientX, e.clientY);
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId === activeTouchId) updateJoystick(e.clientX, e.clientY);
    });
    zone.addEventListener("pointerup", resetJoystick);
    zone.addEventListener("pointercancel", resetJoystick);

    const holdBtn = (el, setter) => {
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        setter(true);
      });
      el.addEventListener("pointerup", () => setter(false));
      el.addEventListener("pointercancel", () => setter(false));
    };
    holdBtn(this.dom.btnTouchUp, (v) => (this.touchAscend = v));
    holdBtn(this.dom.btnTouchDown, (v) => (this.touchDescend = v));
    this.dom.btnTouchAttack.addEventListener("click", () => this._performAttack());

    const syncRendererSize = () => {
      if (!this.renderer || !this.camera) return;
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener("resize", syncRendererSize);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(syncRendererSize);
      ro.observe(document.documentElement);
    }
  }

  _applyMinimapClass() {
    this.dom.minimapPanel.classList.remove("compact", "expanded", "minimized");
    this.dom.minimapPanel.classList.add(this.minimapMode);
    this.dom.btnMinimapMin.textContent = this.minimapMode === "minimized" ? "+" : "−";
  }

  _selectElement(index) {
    this.state.selectedElement = index;
    document.querySelectorAll(".elem-btn").forEach((b) => {
      b.classList.toggle("active", parseInt(b.dataset.elem, 10) === index);
    });
  }

  _toggleFlight() {
    this.state.isFlying = !this.state.isFlying;
    if (this.state.isFlying && this.state.playerPos.y < 1.8) {
      this.state.playerPos.y = 2.6;
    }
    this.dom.btnToggleFlight.classList.toggle("active", this.state.isFlying);
    this.dom.flightAltitudePad.classList.toggle("hidden", !this.state.isFlying);
    this.showToast(this.state.isFlying ? "🪽 Voo livre ativado! Use ▲ / ▼ ou R / Q." : "👣 Pouso na planície.");
  }

  _activateDivineAuraManual() {
    if (this.state.auraRemaining > 0) return;
    if (this.state.auraCooldown > 0) {
      this.showToast(`⏳ Aura recarregando (${this.state.auraCooldown.toFixed(1)}s)`);
      return;
    }
    this.state.auraRemaining = AURA_DURATION_SECONDS;
    this.state.auraCooldown = 16.0;
    this.audio.playAuraDivina();
    this.showToast("✦ AURA DIVINA ATIVADA MANUALMENTE por 12s!");
  }

  _performAttack() {
    this.attackPulse = 1.0;
    this.combat.fireElementAttack(
      this.state.playerPos,
      this.state.playerYaw,
      this.state.selectedElement
    );
  }

  _spawnFloatingText(worldPos, text, color) {
    if (!this.camera || !this.THREE) return;
    const v = new this.THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    v.project(this.camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement("div");
    el.className = "float-pop";
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color || "#f5c451";
    this.dom.floatingLayer.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  selectCharacter(charId, showFeedback = true) {
    const spec = getCharacterById(charId);
    if (!spec.unlockedByDefault && !this.state.secretUnlocked && this.state.keysCollected < TARGET_KEYS) {
      if (showFeedback) {
        this.showToast('🔒 Colete 1.000 chaves para despertar "?"!');
      }
      return;
    }
    this.state.activeCharacterId = spec.id;
    if (this.playerRig) {
      this.playerRig.applyCharacterSpec(spec);
    }
    this._updateHud();
    if (showFeedback) {
      this.showToast(`🪽 Personagem: ${spec.name}`);
      this.dirtyCloudSave = true;
    }
  }

  _renderCharacterGrid() {
    const grid = this.dom.characterGrid;
    grid.innerHTML = "";
    const canUseSecret = this.state.secretUnlocked || this.state.keysCollected >= TARGET_KEYS;

    CHARACTERS.forEach((char) => {
      const unlocked = char.unlockedByDefault || canUseSecret;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "char-card";
      if (char.id === this.state.activeCharacterId) card.classList.add("selected");
      if (!unlocked) card.classList.add("locked");

      const swatchHex = "#" + char.suitColor.toString(16).padStart(6, "0");
      card.innerHTML = `
        <div class="char-swatch" style="background:${swatchHex}"></div>
        <strong>${unlocked ? char.name : "🔒 ? (1.000 Chaves)"}</strong>
        <span>${char.role}</span>
        <span>${char.description}</span>
      `;
      card.addEventListener("click", () => {
        this.selectCharacter(char.id, true);
        if (unlocked) this.dom.characterModal.classList.add("hidden");
      });
      grid.appendChild(card);
    });
  }

  _renderStoryModal() {
    const container = this.dom.storyContent;
    container.innerHTML = "";
    STORY_CHAPTERS.forEach((text, i) => {
      const p = document.createElement("p");
      p.className = "story-paragraph";
      p.dataset.index = String(i);
      p.textContent = text;
      container.appendChild(p);
    });
  }

  _highlightStoryParagraph(activeIndex) {
    this.dom.storyContent.querySelectorAll(".story-paragraph").forEach((p, idx) => {
      p.classList.toggle("active-line", idx === activeIndex);
      if (idx === activeIndex) {
        p.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }

  _shareProgressWhatsApp() {
    const plane = PLANES[this.state.currentRealmIndex % PLANES.length];
    const charSpec = getCharacterById(this.state.activeCharacterId);
    const msg =
      `Estou jogando ${GAME_TITLE} (autoria de ${AUTHOR_NAME})!\n` +
      `🪽 Herói: ${charSpec.name}\n` +
      `🔑 Chaves dos 1000 Elos: ${this.state.keysCollected} / ${TARGET_KEYS}\n` +
      `🌀 Plano Dimensional: ${plane.name}\n` +
      `⚔️ Inimigos derrotados: ${this.state.enemiesDefeated} | Pontuação: ${this.state.highScore}`;

    if (window.AndroidBridge && window.AndroidBridge.shareWhatsApp) {
      window.AndroidBridge.shareWhatsApp(msg);
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    }
  }

  showToast(message) {
    this.dom.toastBanner.textContent = message;
    this.dom.toastBanner.classList.remove("hidden");
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.dom.toastBanner.classList.add("hidden");
    }, 3200);
  }

  _advancePortalCycle() {
    this.state.currentRealmIndex = (this.state.currentRealmIndex + 1) % PLANES.length;
    const nextPlane = PLANES[this.state.currentRealmIndex];
    this.audio.playPortalWarp();
    this.world.applyPlaneTheme(this.state.currentRealmIndex, this.state.finalWarActive);
    this.state.playerPos.set(0, this.state.isFlying ? 3.5 : 0, 10);
    this.showToast(`🌀 Novo plano: ${nextPlane.name}`);
  }

  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.elapsed += dt;

    const prevPos = this.state.playerPos.clone();

    if (this.inGameplay) {
      let moveX = this.joystickVec.x;
      let moveZ = this.joystickVec.y;
      if (this.keysDown.has("KeyW") || this.keysDown.has("ArrowUp")) moveZ -= 1;
      if (this.keysDown.has("KeyS") || this.keysDown.has("ArrowDown")) moveZ += 1;
      if (this.keysDown.has("KeyA") || this.keysDown.has("ArrowLeft")) moveX -= 1;
      if (this.keysDown.has("KeyD") || this.keysDown.has("ArrowRight")) moveX += 1;

      const inputLen = Math.hypot(moveX, moveZ);
      const isMoving = inputLen > 0.08;
      const speed = this.state.isFlying ? 15.5 : 10.5;

      if (isMoving && !this.combat.isCaptured) {
        const rawNx = moveX / Math.max(1, inputLen);
        const rawNz = moveZ / Math.max(1, inputLen);
        // Align movement smoothly with camera orbit angle
        const cosY = Math.cos(this.cameraYawOffset);
        const sinY = Math.sin(this.cameraYawOffset);
        const nx = rawNx * cosY + rawNz * sinY;
        const nz = -rawNx * sinY + rawNz * cosY;

        this.state.playerPos.x = Math.max(-85, Math.min(85, this.state.playerPos.x + nx * speed * dt));
        this.state.playerPos.z = Math.max(-95, Math.min(85, this.state.playerPos.z + nz * speed * dt));

        const targetYaw = Math.atan2(nx, nz);
        let diff = targetYaw - this.state.playerYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.state.playerYaw += diff * Math.min(1, dt * 11);
      }

      if (this.state.isFlying) {
        let vy = 0;
        if (this.keysDown.has("KeyR") || this.touchAscend) vy += 10.5;
        if (this.keysDown.has("KeyQ") || this.touchDescend) vy -= 10.5;
        this.state.playerPos.y = Math.max(0.4, Math.min(34, this.state.playerPos.y + vy * dt));
      } else {
        this.state.playerPos.y = Math.max(0, this.state.playerPos.y - 14 * dt);
      }

      if (this.state.auraRemaining > 0) {
        this.state.auraRemaining = Math.max(0, this.state.auraRemaining - dt);
      }
      if (this.state.auraCooldown > 0) {
        this.state.auraCooldown = Math.max(0, this.state.auraCooldown - dt);
      }
      if (this.attackPulse > 0) {
        this.attackPulse = Math.max(0, this.attackPulse - dt * 4.5);
      }

      this.playerRig.root.position.copy(this.state.playerPos);
      this.playerRig.root.rotation.y = this.state.playerYaw;
      this.playerRig.updateAnimation(dt, this.elapsed, {
        isMoving,
        isFlying: this.state.isFlying,
        speedRatio: Math.min(1, inputLen),
        attackPulse: this.attackPulse,
        auraActive: this.state.auraRemaining > 0,
        isCaptured: this.combat.isCaptured,
      });

      this.world.update(dt, this.elapsed, this.audio);
      this.combat.update(dt, this.elapsed, prevPos, this.state, {
        onToast: (m) => this.showToast(m),
        onPortalAdvance: () => this._advancePortalCycle(),
        onFloatingText: (pos, txt, col) => this._spawnFloatingText(pos, txt, col),
        onStateMutated: () => {
          this.dirtyCloudSave = true;
        },
      });

      const camDist = 9.5;
      const camTarget = new this.THREE.Vector3(
        this.state.playerPos.x + Math.sin(this.cameraYawOffset) * camDist * Math.cos(this.cameraPitch),
        this.state.playerPos.y + 2.6 + Math.sin(this.cameraPitch) * camDist,
        this.state.playerPos.z + Math.cos(this.cameraYawOffset) * camDist * Math.cos(this.cameraPitch)
      );
      this.camera.position.lerp(camTarget, Math.min(1, dt * 8));
      this.camera.lookAt(
        this.state.playerPos.x,
        this.state.playerPos.y + 1.65,
        this.state.playerPos.z
      );

      this.autoSaveTimer += dt;
      if (this.dirtyCloudSave && this.autoSaveTimer >= 4.0) {
        this.dirtyCloudSave = false;
        this.autoSaveTimer = 0;
        this._saveProgressNow();
      }

      this._updateHud();
      this._drawMinimap();
    } else {
      // Live 3D showcase orbit around the character while on Title Card!
      this.playerRig.root.position.copy(this.state.playerPos);
      this.playerRig.root.rotation.y = this.elapsed * 0.4;
      this.playerRig.updateAnimation(dt, this.elapsed, {
        isMoving: false,
        isFlying: false,
        speedRatio: 0,
        attackPulse: 0,
        auraActive: false,
        isCaptured: false,
      });
      this.world.update(dt, this.elapsed, null);
      this.camera.position.set(
        this.state.playerPos.x + Math.sin(this.elapsed * 0.35) * 6.0,
        this.state.playerPos.y + 2.8,
        this.state.playerPos.z + Math.cos(this.elapsed * 0.35) * 6.0
      );
      this.camera.lookAt(this.state.playerPos.x, this.state.playerPos.y + 1.15, this.state.playerPos.z);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _updateHud() {
    const plane = PLANES[this.state.currentRealmIndex % PLANES.length];
    const charSpec = getCharacterById(this.state.activeCharacterId);

    this.dom.hudKeys.textContent = `${this.state.keysCollected}/${TARGET_KEYS}`;
    this.dom.hudRealm.textContent = plane.name;
    this.dom.hudCycle.textContent = `${this.state.mediumEnemiesCycle}/${MEDIUM_ENEMIES_PER_PORTAL}`;
    this.dom.hudTimer.textContent = `${this.state.keyTimerRemaining.toFixed(1)}s`;
    this.dom.timerChip.classList.toggle("danger", this.state.keyTimerRemaining < 10 || this.combat?.isCaptured);
    this.dom.hudCharName.textContent = charSpec.name;
    this.dom.hudFlightState.textContent = this.state.isFlying ? "Voo" : "Solo";

    this.dom.captureBanner.classList.toggle("hidden", !this.combat?.isCaptured);

    const auraActive = this.state.auraRemaining > 0;
    this.dom.auraBanner.classList.toggle("hidden", !auraActive);
    if (auraActive) {
      this.dom.auraCountdown.textContent = `${this.state.auraRemaining.toFixed(1)}s`;
    }

    if (this.state.auraCooldown > 0 && !auraActive) {
      this.dom.btnAuraDivina.textContent = `${Math.ceil(this.state.auraCooldown)}`;
      this.dom.btnAuraDivina.classList.add("cooldown");
    } else {
      this.dom.btnAuraDivina.textContent = "✦";
      this.dom.btnAuraDivina.classList.remove("cooldown");
    }

    const boss = this.combat?.enemies.find((e) => e.kind === "meyanga" || e.kind === "satanti");
    this.dom.bossBanner.classList.toggle("hidden", !boss);
    if (boss) {
      this.dom.bossBannerTitle.textContent = `${boss.name} (${Math.max(0, Math.ceil(boss.hp))} HP)`;
      this.dom.bossHpFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    }
  }

  _drawMinimap() {
    if (this.minimapMode === "minimized") return;
    const canvas = this.dom.minimapCanvas;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const scale = w / 180;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#060b1a";
    ctx.fillRect(0, 0, w, h);

    const riverY = h / 2 + (-34) * scale;
    ctx.fillStyle = "rgba(14, 165, 233, 0.35)";
    ctx.fillRect(0, riverY - 10 * scale, w, 20 * scale);
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(w / 2 - 4 * scale, riverY - 22 * scale, 8 * scale, 44 * scale);

    ctx.strokeStyle = "rgba(253, 224, 71, 0.55)";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 10 * scale, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#fde047";
    this.combat.keys.forEach((k) => {
      const kx = w / 2 + k.pos.x * scale;
      const ky = h / 2 + k.pos.z * scale;
      ctx.fillRect(kx - 1.5, ky - 1.5, 3, 3);
    });

    this.combat.enemies.forEach((e) => {
      const ex = w / 2 + e.pos.x * scale;
      const ey = h / 2 + e.pos.z * scale;
      ctx.fillStyle = e.kind === "medium" ? "#f97316" : "#e879f9";
      ctx.beginPath();
      ctx.arc(ex, ey, e.kind === "medium" ? 3.2 : 5, 0, Math.PI * 2);
      ctx.fill();
    });

    const px = w / 2 + this.state.playerPos.x * scale;
    const py = h / 2 + this.state.playerPos.z * scale;
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

const game = new BrasilandiaGame();
game.init();
