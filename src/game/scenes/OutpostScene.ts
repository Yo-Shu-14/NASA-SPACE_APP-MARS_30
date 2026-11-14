import Phaser from 'phaser';
import { BUILDING_DEFINITIONS, BUILDING_LIST } from '../../data/buildings';
import { TOTAL_DAY_HOURS } from '../../data/mission';
import { getMedaTelemetrySnapshot } from '../../data/nasa';
import { gameStore, WorldFeedbackEvent } from '../../state/gameStore';
import { soundFX } from '../../systems/audio';
import { getBuildingUnlockStatus } from '../../systems/buildings';
import { isEventOfficiallyActive, isShelterRequiredEvent } from '../../systems/events';
import { getContextualGilMessage } from '../../systems/gil';
import { calculateDailyRates } from '../../systems/resources';
import { getCurrentTutorialStep } from '../../systems/tutorial';
import { BuildingId } from '../../types/building';
import { GameState, ScreenMode, TerrainScar } from '../../types/game';
import {
  BUILDING_CLEARANCE,
  gridManager,
  Point2D,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../grid/GridManager';
import {
  BuildingDrawExtra,
  createCrewMemberContainer,
  createGilContainer,
  createNasContainer,
  drawBuildingGraphics,
  PALETTE,
} from '../rendering/GraphicsFactory';
import {
  focusGameplayCanvas,
  hasBlockingUiDialog,
  isEditableTarget,
} from '../../utils/keyboard';

interface BuildingVisual {
  container: Phaser.GameObjects.Container;
  graphics: Phaser.GameObjects.Graphics;
  selectionRing: Phaser.GameObjects.Graphics;
  workBar: Phaser.GameObjects.Graphics;
  statusTag: Phaser.GameObjects.Text;
  nameTag: Phaser.GameObjects.Text;
  baseX: number;
  baseY: number;
  width: number;
  height: number;
  restoringUntil: number;
}

type ActionAnimKind = 'restore' | 'repair' | 'clean' | 'plant' | 'harvest';

interface ActiveWorkAnimation {
  buildingId: BuildingId;
  kind: ActionAnimKind;
  startedAt: number;
  duration: number;
  label: string;
}

const PLANET_CX = 560;
const PLANET_CY = 360;
const PLANET_RADIUS = 1480;
const ROCKET_LANDING_X = WORLD_WIDTH + 168;
const ROCKET_LANDING_Y = WORLD_HEIGHT * 0.56;

type IdleActivity =
  | 'inspecting'
  | 'tinkering'
  | 'looking_around'
  | 'stretching'
  | 'waving'
  | 'posture_adjust'
  | 'resting';

const IDLE_ACTIVITIES: IdleActivity[] = [
  'inspecting',
  'tinkering',
  'looking_around',
  'stretching',
  'waving',
  'posture_adjust',
  'resting',
];

interface CrewAgent {
  name: string;
  container: Phaser.GameObjects.Container;
  homeBuilding: BuildingId;
  patrolBuildings: BuildingId[];
  scenicSpots: Point2D[];
  path: Point2D[];
  allowInsideBuildingId?: BuildingId;
  waitUntil: number;
  phaseOffset: number;
  walkSpeed: number;
  idleActivity: IdleActivity;
  activityUntil: number;
  specialtyTask: ActionAnimKind;
  taskUntil: number;
  strideGain: number;
  stuckElapsed: number;
  lastX: number;
  lastY: number;
}

export class OutpostScene extends Phaser.Scene {
  private buildingVisuals = new Map<BuildingId, BuildingVisual>();
  private nas!: Phaser.GameObjects.Container;
  private crewAgents: CrewAgent[] = [];
  private gil!: Phaser.GameObjects.Container;
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private terrainRocksGraphics!: Phaser.GameObjects.Graphics;
  private terrainRocksContainer!: Phaser.GameObjects.Container;
  private jezeroLabel?: Phaser.GameObjects.Text;
  private groundSunTintLayer!: Phaser.GameObjects.Graphics;
  private groundLightsLayer!: Phaser.GameObjects.Graphics;
  private environmentalScarsLayer!: Phaser.GameObjects.Graphics;
  private scarDustLayer!: Phaser.GameObjects.Graphics;
  private conduitsLayer!: Phaser.GameObjects.Graphics;
  private skyHorizonLayer!: Phaser.GameObjects.Graphics;
  private dayNightOverlay!: Phaser.GameObjects.Graphics;
  private outpostLightsLayer!: Phaser.GameObjects.Graphics;
  private nightStars: Array<{ circle: Phaser.GameObjects.Arc; phase: number; baseAlpha: number }> =
    [];
  private displayHours = 5;
  private lastDrawnHours = -1;
  private lastTerrainHours = -100;
  private lastScarsKey = '';
  private weatherOverlay!: Phaser.GameObjects.Graphics;
  private eventEffectsLayer!: Phaser.GameObjects.Graphics;
  private actionAnimLayer!: Phaser.GameObjects.Graphics;
  private activeWorkAnim: ActiveWorkAnimation | null = null;
  private lastFootDustAt = 0;
  private lastHazardPopupAt = -10;
  private dustParticles: Array<{ rect: Phaser.GameObjects.Rectangle; speed: number }> = [];
  private stormStreaks: Array<{
    rect: Phaser.GameObjects.Rectangle;
    speed: number;
    driftY: number;
  }> = [];
  private iceParticles: Array<{
    circle: Phaser.GameObjects.Arc;
    speedY: number;
    driftX: number;
  }> = [];

  private lastActiveEventKey: string | null = null;
  private nextQuakeAt = 0;
  private quakeEndAt = 0;
  private reducedMotion = false;

  private unsubscribeState?: () => void;
  private unsubscribeFeedback?: () => void;
  private windowBlurHandler?: () => void;
  private zoomEventHandler?: (evt: Event) => void;
  private introStageEventHandler?: (evt: Event) => void;
  private cutsceneFocusEventHandler?: (evt: Event) => void;
  private endingVisualEventHandler?: (evt: Event) => void;
  private activeEndingKind: string | null = null;
  private endingBeatIndex = 0;
  private endingIsFinalBeat = false;
  private endingStagedKey: string | null = null;
  private endingEvacStarted = false;

  private isDragging = false;
  private activePointerId: number | null = null;
  private activePointers = new Map<number, { x: number; y: number }>();
  private isPinching = false;
  private pinchStartDist = 0;
  private pinchStartZoom = 1;
  private pinchAnchorWorldX = 0;
  private pinchAnchorWorldY = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private camStartX = 0;
  private camStartY = 0;
  private wasDragged = false;
  private lastLightingNightFactor = -1;
  private lastScreen: ScreenMode | null = null;
  private isPaused = false;

  private keys?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
  };

  private nasPath: Point2D[] = [];
  private nasAllowInsideBuildingId: BuildingId | undefined = undefined;
  private nasStuckElapsed = 0;
  private nasLastX = 0;
  private nasLastY = 0;
  private walkStuckRecoveryElapsed = 0;
  private activeWalkActionId: string | null = null;
  private returningSleepElapsed = 0;
  private nasJumpUntil = 0;
  private playerIdleWaitUntil = 4.2;
  private playerIdleActivity: IdleActivity = 'inspecting';
  private playerActivityUntil = 3.5;
  private playerIdleStrolling = false;
  private elapsedTime = 0;
  private introStage = -1;
  private introStageStartedAt = 0;
  private introWasSkipped = false;
  private introSkipEventHandler?: () => void;
  private landingDisembarkActive = false;
  private landingDisembarkStartedAt = 0;
  private landingNasEnteredGrid = false;
  private landingAgentMeta: Array<{
    delay: number;
    enteredGrid: boolean;
    targetSlot: Point2D;
  }> = [];
  private introVisualLayer?: Phaser.GameObjects.Container;
  private introAcademyPad?: Phaser.GameObjects.Container;
  private introLander?: Phaser.GameObjects.Container;
  private introThrusterFlame?: Phaser.GameObjects.Graphics;
  private introDustPlume?: Phaser.GameObjects.Graphics;
  private landerGroundShadow?: Phaser.GameObjects.Graphics;
  private landerHighlightRing?: Phaser.GameObjects.Graphics;
  private landerNameTag?: Phaser.GameObjects.Text;
  private rocketSelected = false;
  private rocketHovered = false;
  private rocketDeselectHandler?: () => void;

  constructor() {
    super({ key: 'OutpostScene' });
  }

  private getCanvasDpr(): number {
    const scaleZoom = this.scale?.zoom;
    return scaleZoom && scaleZoom > 0 ? 1 / scaleZoom : 1;
  }

  private getViewportCssSize(): { width: number; height: number } {
    const cam = this.cameras.main;
    const dpr = this.getCanvasDpr();
    if (!cam) return { width: 1024, height: 768 };
    return { width: cam.width / dpr, height: cam.height / dpr };
  }

  private getTextResolution(): number {
    return typeof window !== 'undefined'
      ? Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 2)))
      : 2;
  }

  public create() {
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.cameras.main.setBackgroundColor('#060914');
    // Generous world bounds so planetary zoom-out centers Mars cleanly in outer space.
    this.cameras.main.setBounds(-3600, -2800, WORLD_WIDTH + 7200, WORLD_HEIGHT + 5600);

    this.drawMarsTerrain();
    this.createBuildings();
    this.createCharacters();
    this.createIntroVisuals();
    this.createDayNightLayer();
    this.createWeatherLayer();
    this.setupCameraAndInput();

    const initialState = gameStore.getState();
    this.displayHours = initialState.hoursElapsed;
    this.syncWithGameState(initialState);
    this.renderDayNightCycle(initialState);

    this.unsubscribeState = gameStore.subscribe((state) => {
      this.syncWithGameState(state);
    });

    this.unsubscribeFeedback = gameStore.onFeedback((evt) => {
      this.handleWorldFeedback(evt);
    });

    this.zoomEventHandler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ action?: 'in' | 'out' | 'planet' }>).detail;
      if (!detail?.action) return;
      this.applyExternalZoom(detail.action);
    };
    window.addEventListener('mars30:zoom', this.zoomEventHandler);

    this.introStageEventHandler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ stage?: number }>).detail;
      if (typeof detail?.stage === 'number') {
        this.applyIntroStageCamera(detail.stage);
      }
    };
    window.addEventListener('mars30:intro-stage', this.introStageEventHandler);

    this.introSkipEventHandler = () => {
      this.introWasSkipped = true;
    };
    window.addEventListener('mars30:intro-skip', this.introSkipEventHandler);

    this.cutsceneFocusEventHandler = (evt: Event) => {
      const detail = (evt as CustomEvent<{
        buildingId?: BuildingId;
        zoom?: number;
        reset?: boolean;
      }>).detail;
      if (!detail) return;
      if (detail.reset) {
        this.resetCameraFromCutscene();
      } else {
        this.focusCameraForCutscene(detail.buildingId, detail.zoom);
      }
    };
    window.addEventListener('mars30:cutscene-focus', this.cutsceneFocusEventHandler);

    this.endingVisualEventHandler = (evt: Event) => {
      const detail = (evt as CustomEvent<{
        endingKind?: string;
        beatIndex?: number;
        isFinalBeat?: boolean;
        reset?: boolean;
      }>).detail;
      if (!detail) return;
      if (detail.reset) {
        this.activeEndingKind = null;
        this.endingBeatIndex = 0;
        this.endingIsFinalBeat = false;
        this.endingStagedKey = null;
        this.endingEvacStarted = false;
        this.syncLandedRocketState(gameStore.getState());
      } else if (detail.endingKind) {
        this.activeEndingKind = detail.endingKind;
        this.endingBeatIndex = detail.beatIndex ?? 0;
        this.endingIsFinalBeat = Boolean(detail.isFinalBeat);
        this.syncEndingChoreography(gameStore.getState());
      }
    };
    window.addEventListener('mars30:ending-visual', this.endingVisualEventHandler);

    this.rocketDeselectHandler = () => {
      this.rocketSelected = false;
      this.drawRocketHighlight(this.rocketHovered, 1);
    };
    window.addEventListener('mars30:deselect-rocket', this.rocketDeselectHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeState?.();
      this.unsubscribeFeedback?.();
      if (this.windowBlurHandler) {
        window.removeEventListener('blur', this.windowBlurHandler);
        this.windowBlurHandler = undefined;
      }
      if (this.zoomEventHandler) {
        window.removeEventListener('mars30:zoom', this.zoomEventHandler);
      }
      if (this.introStageEventHandler) {
        window.removeEventListener('mars30:intro-stage', this.introStageEventHandler);
      }
      if (this.introSkipEventHandler) {
        window.removeEventListener('mars30:intro-skip', this.introSkipEventHandler);
      }
      if (this.cutsceneFocusEventHandler) {
        window.removeEventListener('mars30:cutscene-focus', this.cutsceneFocusEventHandler);
      }
      if (this.endingVisualEventHandler) {
        window.removeEventListener('mars30:ending-visual', this.endingVisualEventHandler);
      }
      if (this.rocketDeselectHandler) {
        window.removeEventListener('mars30:deselect-rocket', this.rocketDeselectHandler);
      }
    });

    this.centerCameraOnOutpost();
    this.scale.on('resize', () => {
      if (gameStore.getState().screen !== 'INTRO_CINEMATIC') {
        this.centerCameraOnOutpost();
      }
    });
  }

  private createIntroVisuals() {
    const layer = this.add.container(0, 0);
    layer.setDepth(68);
    layer.setVisible(false);

    // 1. Orbital Academy Dock Platform (matching comic-ink PALETTE)
    const academyPad = this.add.container(PLANET_CX - 1780, PLANET_CY - 460);
    const padG = this.add.graphics();
    // Main orbital truss & solar wings
    padG.fillStyle(PALETTE.techBlue, 1);
    padG.lineStyle(3, PALETTE.charcoal, 1);
    padG.fillRoundedRect(-170, -14, 110, 28, 6);
    padG.strokeRoundedRect(-170, -14, 110, 28, 6);
    padG.fillRoundedRect(60, -14, 110, 28, 6);
    padG.strokeRoundedRect(60, -14, 110, 28, 6);
    padG.lineStyle(1.5, PALETTE.creamLight, 0.45);
    padG.lineBetween(-162, 0, -68, 0);
    padG.lineBetween(68, 0, 162, 0);
    // Central staging deck
    padG.fillStyle(PALETTE.cream, 1);
    padG.lineStyle(3, PALETTE.charcoal, 1);
    padG.fillRoundedRect(-64, -36, 128, 72, 14);
    padG.strokeRoundedRect(-64, -36, 128, 72, 14);
    padG.fillStyle(PALETTE.sand, 1);
    padG.fillRoundedRect(-48, -22, 96, 44, 8);
    padG.fillStyle(PALETTE.marsRed, 1);
    padG.fillCircle(0, 0, 14);
    padG.lineStyle(2, PALETTE.charcoal, 1);
    padG.strokeCircle(0, 0, 14);
    academyPad.add(padG);

    // Crew portrait tokens waiting on the Academy staging deck
    const crewAccents = [
      PALETTE.marsRed,
      0xe59838,
      PALETTE.lifeGreen,
      PALETTE.techBlue,
      0x8e63a8,
    ];
    crewAccents.forEach((accent, idx) => {
      const cx = -42 + idx * 21;
      const cy = 48;
      const badge = this.add.graphics();
      badge.fillStyle(PALETTE.creamLight, 1);
      badge.lineStyle(2, PALETTE.charcoal, 1);
      badge.fillCircle(cx, cy, 8.5);
      badge.strokeCircle(cx, cy, 8.5);
      badge.fillStyle(accent, 1);
      badge.fillCircle(cx, cy, 4.8);
      academyPad.add(badge);
    });

    // 2. NASA Orion Spacecraft (Crew Module + Heat Shield + European Service Module, comic-ink PALETTE style)
    const lander = this.add.container(ROCKET_LANDING_X, ROCKET_LANDING_Y);
    const groundShadow = this.add.graphics();
    groundShadow.fillStyle(PALETTE.charcoal, 0.28);
    groundShadow.fillEllipse(0, 31, 60, 15);
    groundShadow.setVisible(false);

    const highlightRing = this.add.graphics();
    const dustPlume = this.add.graphics();
    const thrusterFlame = this.add.graphics();
    const hull = this.add.graphics();

    // Landing struts supporting Orion on the crater rim
    hull.lineStyle(3.2, PALETTE.charcoal, 1);
    hull.lineBetween(-14, 15, -24, 30);
    hull.lineBetween(14, 15, 24, 30);
    hull.lineBetween(-7, 16, -11, 31);
    hull.lineBetween(7, 16, 11, 31);
    hull.fillStyle(PALETTE.sand, 1);
    hull.lineStyle(2, PALETTE.charcoal, 1);
    hull.fillRoundedRect(-30, 28, 12, 5, 2);
    hull.strokeRoundedRect(-30, 28, 12, 5, 2);
    hull.fillRoundedRect(18, 28, 12, 5, 2);
    hull.strokeRoundedRect(18, 28, 12, 5, 2);

    // Orion European Service Module (ESM) orbital main engine bell
    hull.fillStyle(PALETTE.wreckDark, 1);
    hull.lineStyle(2.2, PALETTE.charcoal, 1);
    hull.beginPath();
    hull.moveTo(-6, 16);
    hull.lineTo(6, 16);
    hull.lineTo(9, 22);
    hull.lineTo(-9, 22);
    hull.closePath();
    hull.fillPath();
    hull.strokePath();

    // Deployable Orion European Service Module solar array wings
    hull.fillStyle(PALETTE.techBlue, 1);
    hull.lineStyle(2, PALETTE.charcoal, 1);
    hull.fillRoundedRect(-35, 5, 21, 8, 2);
    hull.strokeRoundedRect(-35, 5, 21, 8, 2);
    hull.fillRoundedRect(14, 5, 21, 8, 2);
    hull.strokeRoundedRect(14, 5, 21, 8, 2);
    hull.lineStyle(1.2, PALETTE.techBlueLight, 0.75);
    hull.lineBetween(-31, 9, -17, 9);
    hull.lineBetween(17, 9, 31, 9);
    hull.lineBetween(-25, 6, -25, 12);
    hull.lineBetween(25, 6, 25, 12);

    // European Service Module cylindrical body
    hull.fillStyle(PALETTE.cream, 1);
    hull.lineStyle(2.2, PALETTE.charcoal, 1);
    hull.fillRoundedRect(-14, 2, 28, 14, 3);
    hull.strokeRoundedRect(-14, 2, 28, 14, 3);
    hull.fillStyle(PALETTE.wreckMetal, 1);
    hull.fillRect(-13, 6, 26, 5);

    // Orion Crew Module ablative Avcoat heat shield rim
    hull.fillStyle(PALETTE.marsDark, 1);
    hull.lineStyle(2.2, PALETTE.charcoal, 1);
    hull.fillRoundedRect(-22, -1, 44, 5, 2.5);
    hull.strokeRoundedRect(-22, -1, 44, 5, 2.5);

    // Conical Orion Crew Module hull + forward bay cover
    hull.fillStyle(PALETTE.creamLight, 1);
    hull.lineStyle(2.5, PALETTE.charcoal, 1);
    hull.beginPath();
    hull.moveTo(-21, -1);
    hull.lineTo(-11, -21);
    hull.lineTo(11, -21);
    hull.lineTo(21, -1);
    hull.closePath();
    hull.fillPath();
    hull.strokePath();

    hull.fillRoundedRect(-11, -26, 22, 7, 3.5);
    hull.strokeRoundedRect(-11, -26, 22, 7, 3.5);

    // Contoured Terracotta / Mars Red crew module band
    hull.fillStyle(PALETTE.marsRed, 1);
    hull.beginPath();
    hull.moveTo(-18.5, -5);
    hull.lineTo(-16.5, -9);
    hull.lineTo(16.5, -9);
    hull.lineTo(18.5, -5);
    hull.closePath();
    hull.fillPath();

    // Twin Orion cockpit viewport windows
    hull.fillStyle(PALETTE.techBlueLight, 1);
    hull.lineStyle(1.8, PALETTE.charcoal, 1);
    hull.fillRoundedRect(-9, -18, 7.5, 5, 2);
    hull.strokeRoundedRect(-9, -18, 7.5, 5, 2);
    hull.fillRoundedRect(1.5, -18, 7.5, 5, 2);
    hull.strokeRoundedRect(1.5, -18, 7.5, 5, 2);

    // Forward docking ring & comms beacon
    hull.fillStyle(PALETTE.sand, 1);
    hull.lineStyle(2, PALETTE.charcoal, 1);
    hull.fillRoundedRect(-6, -29, 12, 3.5, 1.5);
    hull.strokeRoundedRect(-6, -29, 12, 3.5, 1.5);
    hull.lineStyle(2.2, PALETTE.charcoal, 1);
    hull.lineBetween(0, -29, 0, -35);
    hull.fillStyle(0xf4c552, 1);
    hull.fillCircle(0, -36.5, 3);
    hull.strokeCircle(0, -36.5, 3);

    const landerNameTag = this.add
      .text(0, 39, 'Orion Spacecraft', {
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#292C2B',
        backgroundColor: '#F1D8A8',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5, 0)
      .setResolution(this.getTextResolution())
      .setVisible(false);

    lander.add([groundShadow, highlightRing, dustPlume, thrusterFlame, hull, landerNameTag]);
    lander.setSize(80, 88);
    lander.setInteractive({ useHandCursor: true });

    lander.on('pointerover', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) return;
      const st = gameStore.getState();
      if (st.screen !== 'PLAYING' || this.hasBlockingGameplayOverlay(st)) return;
      this.rocketHovered = true;
      lander.setScale(1.05);
      this.drawRocketHighlight(true, 1);
    });

    lander.on('pointerout', () => {
      this.rocketHovered = false;
      const st = gameStore.getState();
      if (st.screen === 'INTRO_CINEMATIC') return;
      lander.setScale(1);
      this.drawRocketHighlight(this.rocketSelected, 1);
    });

    lander.on('pointerup', () => {
      if (this.wasDragged || this.isPinching) return;
      const st = gameStore.getState();
      if (st.screen !== 'PLAYING' || this.hasBlockingGameplayOverlay(st)) return;
      this.rocketSelected = true;
      this.drawRocketHighlight(true, 1);
      soundFX.playSelect();
      window.dispatchEvent(new CustomEvent('mars30:select-rocket'));
    });

    layer.add([academyPad, lander]);

    this.introVisualLayer = layer;
    this.introAcademyPad = academyPad;
    this.introLander = lander;
    this.introThrusterFlame = thrusterFlame;
    this.introDustPlume = dustPlume;
    this.landerGroundShadow = groundShadow;
    this.landerHighlightRing = highlightRing;
    this.landerNameTag = landerNameTag;
  }

  private setCrewVisibility(visible: boolean) {
    this.nas?.setVisible(visible);
    this.gil?.setVisible(visible);
    for (const agent of this.crewAgents) {
      agent.container?.setVisible(visible);
    }
  }

  private startLandingDisembarkRun() {
    const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
    const frontY = habBounds.y + habBounds.height + 24;
    const hatchX = WORLD_WIDTH + 148;
    const hatchY = WORLD_HEIGHT * 0.56 + 18;
    const rimGateX = WORLD_WIDTH - 38;
    const rimGateY = 396;

    this.landingDisembarkActive = true;
    this.landingDisembarkStartedAt = this.elapsedTime;
    this.landingNasEnteredGrid = false;

    if (this.nas) {
      this.nas.setVisible(true);
      this.nas.setPosition(hatchX, hatchY);
      this.nas.setScale(this.reducedMotion ? 1.08 : 0.56);
      this.nas.setAlpha(this.reducedMotion ? 1 : 0);
      this.nasPath = [{ x: rimGateX, y: rimGateY }];
      this.nasAllowInsideBuildingId = undefined;
      this.nasStuckElapsed = 0;
      this.nasLastX = hatchX;
      this.nasLastY = hatchY;
    }

    if (this.gil) {
      this.gil.setVisible(true);
      this.gil.setPosition(hatchX + 14, hatchY - 14);
      this.gil.setScale(this.reducedMotion ? 1.0 : 0.56);
      this.gil.setAlpha(this.reducedMotion ? 1 : 0);
    }

    const offsets = [-96, -54, 46, 94];
    const delays = [0.22, 0.44, 0.66, 0.88];
    this.landingAgentMeta = this.crewAgents.map((agent, i) => {
      const targetSlot = gridManager.pushOutOfBuildings(
        habBounds.centerX + (offsets[i] ?? 0),
        frontY - (i === 3 ? 4 : i === 1 ? -4 : 0),
        BUILDING_CLEARANCE
      );
      agent.container.setVisible(true);
      agent.container.setPosition(hatchX, hatchY);
      agent.container.setScale(this.reducedMotion ? 0.92 : 0.56);
      agent.container.setAlpha(this.reducedMotion ? 1 : 0);
      agent.path = [{ x: rimGateX, y: rimGateY + (i - 1.5) * 10 }];
      agent.allowInsideBuildingId = undefined;
      agent.stuckElapsed = 0;
      agent.lastX = hatchX;
      agent.lastY = hatchY;
      agent.taskUntil = 0;
      agent.waitUntil = this.elapsedTime + 99;
      return {
        delay: delays[i] ?? 0.3,
        enteredGrid: false,
        targetSlot,
      };
    });

    if (this.reducedMotion) {
      this.landingDisembarkActive = false;
      this.placeCrewAtMorningPost();
    }
  }

  private drawRocketHighlight(active: boolean, pulse = 1) {
    const ring = this.landerHighlightRing;
    if (!ring) return;
    ring.clear();
    if (!active) return;
    ring.lineStyle(3.5, 0xfaf0dc, 0.9 * pulse);
    ring.strokeRoundedRect(-38, -40, 76, 78, 16);
    ring.lineStyle(2, 0xf4c552, 0.95);
    ring.strokeRoundedRect(-41, -43, 82, 84, 18);
  }

  private syncLandedRocketState(state: GameState) {
    if (!this.introVisualLayer || !this.introLander) return;

    if (state.screen === 'INTRO_CINEMATIC') {
      this.rocketSelected = false;
      this.rocketHovered = false;
      this.drawRocketHighlight(false);
      this.landerNameTag?.setVisible(false);
      this.introLander.disableInteractive();
      return;
    }

    if (state.screen === 'TITLE_MENU') {
      this.rocketSelected = false;
      this.rocketHovered = false;
      this.drawRocketHighlight(false);
      this.landerNameTag?.setVisible(false);
      this.introLander.disableInteractive();
      this.introVisualLayer.setVisible(false);
      return;
    }

    // Keep landed rocket permanently visible at its original Jezero Crater landing position
    // across Stage 4 disembark, PLAYING, PAUSED, Ending Cutscenes, and Mission Report
    this.introVisualLayer.setVisible(true);
    this.introVisualLayer.setAlpha(1);
    this.introVisualLayer.setDepth(11);
    this.introAcademyPad?.setVisible(false);

    this.introLander.setVisible(true);
    this.introLander.setPosition(ROCKET_LANDING_X, ROCKET_LANDING_Y);
    this.introLander.setRotation(0);

    this.landerGroundShadow?.setVisible(true);
    this.landerGroundShadow?.setAlpha(1);
    this.introThrusterFlame?.clear();
    this.introThrusterFlame?.setVisible(false);
    this.introDustPlume?.clear();
    this.introDustPlume?.setVisible(false);

    const isEndingCutscene =
      (state.screen === 'MISSION_REPORT' || state.screen === 'GAME_OVER') &&
      !state.endingCutsceneCompleted;

    this.landerNameTag?.setVisible(
      (state.screen === 'PLAYING' || state.screen === 'PAUSED') && !this.landingDisembarkActive
    );

    if (state.screen === 'PLAYING') {
      if (!this.introLander.input?.enabled) {
        this.introLander.setInteractive({ useHandCursor: true });
      }
      if (!this.rocketHovered) {
        this.introLander.setScale(1.0);
      }
    } else {
      this.rocketSelected = false;
      this.rocketHovered = false;
      this.drawRocketHighlight(false);
      this.introLander.disableInteractive();
      this.introLander.setScale(isEndingCutscene ? 1.0 : 1.0);
    }
  }

  private applyIntroStageCamera(stage: number) {
    const cam = this.cameras.main;
    if (!cam) return;

    this.introStage = stage;
    this.introStageStartedAt = this.elapsedTime;
    this.tweens.killTweensOf(cam);

    if (this.introVisualLayer) {
      this.introVisualLayer.setVisible(stage !== 1);
      this.introVisualLayer.setAlpha(1);
      this.introVisualLayer.setDepth(stage === 4 ? 11 : 68);
    }
    if (this.introAcademyPad) {
      this.introAcademyPad.setVisible(stage === 0);
    }
    if (this.introLander) {
      this.introLander.setVisible(stage !== 1);
      this.introLander.disableInteractive();
    }
    this.landerNameTag?.setVisible(false);
    this.drawRocketHighlight(false);

    const dpr = this.getCanvasDpr();
    const minZoom = this.getMinZoom();

    if (stage === 0) {
      this.introWasSkipped = false;
      this.landingDisembarkActive = false;
      this.setCrewVisibility(false);
      // Scene 1: Space Academy Orbital Staging beside Mars
      cam.setZoom((this.reducedMotion ? 0.92 : 0.78) * dpr);
      cam.centerOn(PLANET_CX - 1690, PLANET_CY - 455);
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: cam,
          zoom: 0.96 * dpr,
          duration: 7200,
          ease: 'Sine.easeInOut',
        });
      }
      return;
    }

    if (stage === 1) {
      this.landingDisembarkActive = false;
      this.setCrewVisibility(false);
      // Scene 2: Recon of the Dormant Abandoned Outpost
      const outpostZoom = Math.max(0.55 * dpr, this.getOutpostFitZoom() * 1.06);
      cam.setZoom(outpostZoom);
      cam.centerOn(WORLD_WIDTH * 0.45, WORLD_HEIGHT * 0.48);
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: cam,
          scrollX: cam.scrollX + 95,
          duration: 7800,
          ease: 'Sine.easeInOut',
        });
      }
      return;
    }

    if (stage === 2) {
      this.landingDisembarkActive = false;
      this.setCrewVisibility(false);
      // Scene 3: Earth-to-Mars Planetary Transfer (West -> East approach)
      cam.setZoom(Math.max(minZoom, minZoom * 1.08));
      cam.centerOn(PLANET_CX - 280, PLANET_CY - 80);
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: cam,
          zoom: Math.max(minZoom, minZoom * 1.28),
          duration: 8200,
          ease: 'Sine.easeInOut',
          onUpdate: (tw) => {
            const p = tw.progress;
            cam.centerOn(
              Phaser.Math.Linear(PLANET_CX - 280, PLANET_CX + 120, p),
              PLANET_CY - 40
            );
          },
        });
      }
      return;
    }

    if (stage === 3) {
      this.landingDisembarkActive = false;
      this.setCrewVisibility(false);
      // Scene 4: Entry, Descent & Landing near Jezero Crater Rim (consistent West -> East trajectory)
      cam.setZoom(0.62 * dpr);
      cam.centerOn(ROCKET_LANDING_X - 80, ROCKET_LANDING_Y - 125);
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: cam,
          zoom: 0.88 * dpr,
          duration: 8200,
          ease: 'Cubic.easeOut',
          onUpdate: (tw) => {
            const p = tw.progress;
            cam.centerOn(
              Phaser.Math.Linear(ROCKET_LANDING_X - 80, ROCKET_LANDING_X + 10, p),
              Phaser.Math.Linear(ROCKET_LANDING_Y - 125, ROCKET_LANDING_Y, p)
            );
          },
        });
      }
      return;
    }

    // Scene 5: Crew exits landed spacecraft and runs into the prebuilt outpost
    this.startLandingDisembarkRun();
    this.playOutpostRevealCamera();
  }

  private updateIntroVisuals() {
    if (!this.introVisualLayer || !this.introLander) return;
    const stageElapsed = Math.max(0, this.elapsedTime - this.introStageStartedAt);
    const flame = this.introThrusterFlame;
    const dust = this.introDustPlume;
    flame?.clear();
    dust?.clear();

    if (this.introStage === 0) {
      // Docked gently at Academy staging platform
      this.introVisualLayer.setDepth(68);
      this.landerGroundShadow?.setVisible(false);
      flame?.setVisible(false);
      dust?.setVisible(false);
      this.introLander.setPosition(
        PLANET_CX - 1780,
        PLANET_CY - 468 + Math.sin(this.elapsedTime * 2.2) * 3
      );
      this.introLander.setScale(1.1);
      this.introLander.setRotation(0);
    } else if (this.introStage === 1) {
      this.introVisualLayer.setVisible(false);
    } else if (this.introStage === 2) {
      // Cruising smoothly across deep space toward Mars globe (West -> East)
      this.introVisualLayer.setVisible(true);
      this.introVisualLayer.setDepth(68);
      this.landerGroundShadow?.setVisible(false);
      flame?.setVisible(true);
      dust?.setVisible(false);

      const p = Phaser.Math.Clamp(stageElapsed / 10.5, 0, 1);
      const lx = Phaser.Math.Linear(PLANET_CX - 1180, PLANET_CX + 380, p);
      const ly = Phaser.Math.Linear(PLANET_CY - 420, PLANET_CY - 40, p) + Math.sin(p * Math.PI) * -90;
      this.introLander.setPosition(lx, ly);
      this.introLander.setScale(1.35);
      this.introLander.setRotation(0.32);

      if (flame) {
        const flicker = 16 + Math.sin(this.elapsedTime * 26) * 5;
        flame.fillStyle(PALETTE.terracotta, 0.9);
        flame.fillTriangle(-8, 22, 8, 22, 0, 22 + flicker);
        flame.fillStyle(0xf4c552, 0.95);
        flame.fillTriangle(-4, 22, 4, 22, 0, 22 + flicker * 0.65);
      }
    } else if (this.introStage === 3) {
      // Powered descent into Jezero Crater rim from consistent West -> East approach & +0.32 tilt -> upright 0
      this.introVisualLayer.setVisible(true);
      this.introVisualLayer.setDepth(68);

      const p = Phaser.Math.Clamp(stageElapsed / 8.5, 0, 1);
      const easeOut = 1 - Math.pow(1 - p, 2.2);
      const lx = Phaser.Math.Linear(ROCKET_LANDING_X - 240, ROCKET_LANDING_X, easeOut);
      const ly = Phaser.Math.Linear(ROCKET_LANDING_Y - 300, ROCKET_LANDING_Y, easeOut);
      this.introLander.setPosition(lx, ly);
      this.introLander.setScale(Phaser.Math.Linear(1.16, 1.0, easeOut));
      this.introLander.setRotation(Phaser.Math.Linear(0.32, 0, easeOut));

      if (this.landerGroundShadow) {
        this.landerGroundShadow.setVisible(p > 0.65);
        this.landerGroundShadow.setAlpha(Phaser.Math.Clamp((p - 0.65) / 0.35, 0, 1));
      }

      flame?.setVisible(p < 0.94);
      if (flame && p < 0.94) {
        const flicker = 18 + Math.sin(this.elapsedTime * 30) * 6;
        flame.fillStyle(PALETTE.terracotta, 0.92);
        flame.fillTriangle(-9, 22, 9, 22, 0, 22 + flicker);
        flame.fillStyle(0xfaf0dc, 0.95);
        flame.fillTriangle(-5, 22, 5, 22, 0, 22 + flicker * 0.6);
      }

      dust?.setVisible(p > 0.55);
      if (dust && p > 0.55) {
        const dp = (p - 0.55) / 0.45;
        const spread = 24 + dp * 62;
        const alpha = (1 - dp * 0.5) * 0.45;
        dust.fillStyle(PALETTE.sand, alpha);
        dust.fillEllipse(-spread * 0.65, 30, 32 + dp * 28, 12 + dp * 6);
        dust.fillEllipse(spread * 0.65, 30, 32 + dp * 28, 12 + dp * 6);
      }
    } else if (this.introStage === 4) {
      // Settled on Jezero Rim while camera reveals outpost
      this.introVisualLayer.setVisible(true);
      this.introVisualLayer.setDepth(11);
      this.landerGroundShadow?.setVisible(true);
      this.landerGroundShadow?.setAlpha(1);
      flame?.setVisible(false);
      dust?.setVisible(false);
      this.introLander.setPosition(ROCKET_LANDING_X, ROCKET_LANDING_Y);
      this.introLander.setScale(1.0);
      this.introLander.setRotation(0);
    }
  }

  private getOutpostFitZoom(): number {
    const cam = this.cameras.main;
    const dpr = this.getCanvasDpr();
    if (!cam) return 0.7 * dpr;
    const { width: cssW, height: cssH } = this.getViewportCssSize();
    const effectiveWidth = Math.min(cssW, 1440);
    const horizontalMargin = effectiveWidth >= 768 ? 110 : effectiveWidth < 480 ? 18 : 32;
    const verticalMargin = cssH < 520 ? 110 : cssW < 640 ? 155 : 180;
    const minFitZoom = cssW < 640 ? 0.28 : 0.45;
    const cssFitZoom = Math.max(
      minFitZoom,
      Math.min(
        (effectiveWidth - horizontalMargin) / (WORLD_WIDTH + 170),
        (cssH - verticalMargin) / WORLD_HEIGHT,
        1.0
      )
    );
    return cssFitZoom * dpr;
  }

  private getOutpostCenterTarget(): { x: number; y: number } {
    const { width: cssW } = this.getViewportCssSize();
    const xOffset = cssW < 640 ? 12 : 56;
    return { x: WORLD_WIDTH / 2 + xOffset, y: WORLD_HEIGHT / 2 };
  }

  private playOutpostRevealCamera() {
    const cam = this.cameras.main;
    if (!cam) return;
    const dpr = this.getCanvasDpr();
    const { width: cssW } = this.getViewportCssSize();
    const targetZoom = this.getOutpostFitZoom();
    const { x: targetX, y: targetY } = this.getOutpostCenterTarget();

    if (this.reducedMotion) {
      cam.setZoom(targetZoom);
      cam.centerOn(targetX, targetY);
      this.clampCameraScroll();
      return;
    }

    this.tweens.killTweensOf(cam);
    const minFloor = (cssW < 640 ? 0.28 : 0.45) * dpr;
    cam.setZoom(Math.max(minFloor, targetZoom * 0.78));
    cam.centerOn(WORLD_WIDTH + 150, WORLD_HEIGHT * 0.52);
    this.clampCameraScroll();

    this.tweens.add({
      targets: cam,
      zoom: targetZoom,
      duration: 6200,
      ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const p = tw.progress;
        const cx = Phaser.Math.Linear(WORLD_WIDTH + 150, targetX, p);
        const cy = Phaser.Math.Linear(WORLD_HEIGHT * 0.52, targetY, p);
        cam.centerOn(cx, cy);
        this.clampCameraScroll();
      },
      onComplete: () => {
        cam.setZoom(targetZoom);
        cam.centerOn(targetX, targetY);
        this.clampCameraScroll();
      },
    });
  }

  private getMinZoom(): number {
    const cam = this.cameras.main;
    const dpr = this.getCanvasDpr();
    if (!cam) return 0.22 * dpr;
    const { width: cssW, height: cssH } = this.getViewportCssSize();
    const diameter = PLANET_RADIUS * 2;
    const fitW = (cssW * 0.86) / diameter;
    const fitH = (cssH * 0.84) / diameter;
    return Phaser.Math.Clamp(Math.min(fitW, fitH), 0.12, 0.48) * dpr;
  }

  private applyExternalZoom(action: 'in' | 'out' | 'planet') {
    const cam = this.cameras.main;
    if (!cam) return;
    const dpr = this.getCanvasDpr();
    const minZoom = this.getMinZoom();

    if (action === 'planet') {
      const alreadyAtPlanet = Math.abs(cam.zoom - minZoom) < 0.04 * dpr;
      if (alreadyAtPlanet) {
        this.centerCameraOnOutpost();
        return;
      }
      this.tweens.killTweensOf(cam);
      this.tweens.add({
        targets: cam,
        zoom: minZoom,
        duration: this.reducedMotion ? 10 : 420,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          cam.centerOn(PLANET_CX, PLANET_CY);
          this.clampCameraScroll();
        },
        onComplete: () => {
          cam.centerOn(PLANET_CX, PLANET_CY);
          this.clampCameraScroll();
        },
      });
      return;
    }

    const delta = (action === 'in' ? 0.18 : -0.18) * dpr;
    const targetZoom = Phaser.Math.Clamp(cam.zoom + delta, minZoom, 1.45 * dpr);
    this.tweens.killTweensOf(cam);
    this.tweens.add({
      targets: cam,
      zoom: targetZoom,
      duration: this.reducedMotion ? 10 : 220,
      ease: 'Sine.easeOut',
      onUpdate: () => this.clampCameraScroll(),
      onComplete: () => this.clampCameraScroll(),
    });
  }

  private centerCameraOnOutpost() {
    const cam = this.cameras.main;
    if (!cam) return;
    const fitZoom = this.getOutpostFitZoom();
    const { x, y } = this.getOutpostCenterTarget();
    cam.setZoom(fitZoom);
    cam.centerOn(x, y);
    this.clampCameraScroll();
  }

  private focusCameraForCutscene(buildingId?: BuildingId, requestedZoom?: number) {
    const cam = this.cameras.main;
    if (!cam) return;
    const dpr = this.getCanvasDpr();
    const { width: cssW } = this.getViewportCssSize();
    const isNarrow = cssW < 640;
    let targetX = WORLD_WIDTH / 2 + (isNarrow ? 12 : 40);
    let targetY = WORLD_HEIGHT / 2 + 24;
    if (this.activeEndingKind && this.endingIsFinalBeat) {
      if (this.activeEndingKind.startsWith('fail_')) {
        // Pan smoothly to frame habitat courtyard, walking crew, and eastern ascent shuttle
        const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
        targetX = Math.min(WORLD_WIDTH - 40, habBounds.centerX + (isNarrow ? 160 : 240));
        targetY = WORLD_HEIGHT / 2 + 12;
      } else {
        // Wide panoramic showcase of the full Mars outpost for Sol 30 finale
        targetX = WORLD_WIDTH / 2 + 18;
        targetY = WORLD_HEIGHT / 2 + 16;
      }
    } else if (buildingId && BUILDING_DEFINITIONS[buildingId]) {
      const bounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS[buildingId]);
      targetX = bounds.centerX;
      // Offset slightly downward so bottom cutscene deck stays clear of centered structure
      targetY = bounds.centerY + (isNarrow ? 54 : 42);
    }
    const baseZoom = requestedZoom ?? (isNarrow ? 0.85 : 1.02);
    const targetZoom =
      Phaser.Math.Clamp(
        isNarrow ? Math.min(baseZoom, 0.92) : baseZoom,
        isNarrow ? 0.42 : 0.55,
        1.35
      ) * dpr;
    const startCenterX = cam.scrollX + cam.width * 0.5;
    const startCenterY = cam.scrollY + cam.height * 0.5;
    this.tweens.killTweensOf(cam);
    this.tweens.add({
      targets: cam,
      zoom: targetZoom,
      duration: this.reducedMotion ? 10 : 720,
      ease: 'Cubic.easeInOut',
      onUpdate: (tween) => {
        const p = tween.progress;
        cam.centerOn(
          Phaser.Math.Linear(startCenterX, targetX, p),
          Phaser.Math.Linear(startCenterY, targetY, p)
        );
        this.clampCameraScroll();
      },
      onComplete: () => {
        cam.centerOn(targetX, targetY);
        this.clampCameraScroll();
      },
    });
  }

  private resetCameraFromCutscene() {
    const cam = this.cameras.main;
    if (!cam) return;
    const fitZoom = this.getOutpostFitZoom();
    const { x: targetX, y: targetY } = this.getOutpostCenterTarget();
    const startCenterX = cam.scrollX + cam.width * 0.5;
    const startCenterY = cam.scrollY + cam.height * 0.5;
    this.tweens.killTweensOf(cam);
    this.tweens.add({
      targets: cam,
      zoom: fitZoom,
      duration: this.reducedMotion ? 10 : 520,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        const p = tween.progress;
        cam.centerOn(
          Phaser.Math.Linear(startCenterX, targetX, p),
          Phaser.Math.Linear(startCenterY, targetY, p)
        );
        this.clampCameraScroll();
      },
      onComplete: () => {
        this.centerCameraOnOutpost();
      },
    });
  }

  private clampCameraScroll() {
    const cam = this.cameras.main;
    if (!cam) return;
    const dpr = this.getCanvasDpr();
    const minZoom = this.getMinZoom();
    const outpostMinX = -40;
    const outpostMaxX = WORLD_WIDTH + 280;
    const outpostMinY = -20;
    const outpostMaxY = WORLD_HEIGHT + 40;

    // Smoothly pull bounds toward Mars center when zoomed out to planetary view
    const planetBlend = Phaser.Math.Clamp(1 - (cam.zoom - minZoom) / (0.16 * dpr), 0, 1);
    const minCenterX = Phaser.Math.Linear(outpostMinX, PLANET_CX, planetBlend);
    const maxCenterX = Phaser.Math.Linear(outpostMaxX, PLANET_CX, planetBlend);
    const minCenterY = Phaser.Math.Linear(outpostMinY, PLANET_CY, planetBlend);
    const maxCenterY = Phaser.Math.Linear(outpostMaxY, PLANET_CY, planetBlend);

    const currentCenterX = cam.scrollX + cam.width * 0.5;
    const currentCenterY = cam.scrollY + cam.height * 0.5;

    const clampedCenterX = Phaser.Math.Clamp(currentCenterX, minCenterX, maxCenterX);
    const clampedCenterY = Phaser.Math.Clamp(currentCenterY, minCenterY, maxCenterY);

    cam.scrollX = clampedCenterX - cam.width * 0.5;
    cam.scrollY = clampedCenterY - cam.height * 0.5;
  }

  private drawMarsTerrain() {
    this.terrainGraphics = this.add.graphics();
    this.terrainGraphics.setDepth(0);

    this.terrainRocksContainer = this.add.container(0, 0);
    this.terrainRocksContainer.setDepth(1);
    this.terrainRocksGraphics = this.add.graphics();
    this.terrainRocksContainer.add(this.terrainRocksGraphics);

    this.jezeroLabel = this.add
      .text(WORLD_WIDTH + 228, 72, 'JEZERO CRATER · 18.38°N 77.58°E (-2,569m)', {
        fontFamily: '"JetBrains Mono", "Plus Jakarta Sans", monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#FAF0DC',
        backgroundColor: '#292C2B',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setResolution(this.getTextResolution())
      .setDepth(2);

    this.groundSunTintLayer = this.add.graphics();
    this.groundSunTintLayer.setDepth(2);

    this.groundLightsLayer = this.add.graphics();
    this.groundLightsLayer.setDepth(3);

    this.environmentalScarsLayer = this.add.graphics();
    this.environmentalScarsLayer.setDepth(4);

    this.scarDustLayer = this.add.graphics();
    this.scarDustLayer.setDepth(5);

    this.conduitsLayer = this.add.graphics();
    this.conduitsLayer.setDepth(6);
    this.conduitsLayer.setAlpha(0.46);

    this.redrawTerrainAtmosphere(this.computeDayNightLighting(this.displayHours));
  }

  private redrawTerrainAtmosphere(lighting: ReturnType<OutpostScene['computeDayNightLighting']>) {
    const g = this.terrainGraphics;
    const rocksG = this.terrainRocksGraphics;
    if (!g || !rocksG) return;

    g.clear();
    rocksG.clear();

    // Outer space backdrop surrounding the circular Mars globe
    this.cameras.main?.setBackgroundColor('#060914');

    // Subtle deep-space Milky Way / cosmic dust glow well outside Mars
    g.fillStyle(0x161f42, 0.28);
    g.fillEllipse(PLANET_CX - 180, PLANET_CY - 100, 5600, 2100);

    // Mars' two moons (Phobos & Deimos) orbiting in outer space outside the planet disc
    const phobosX = PLANET_CX + PLANET_RADIUS + 260;
    const phobosY = PLANET_CY - 640;
    g.fillStyle(0x8fa8d8, 0.15);
    g.fillCircle(phobosX, phobosY, 64);
    g.fillStyle(0xc8beaf, 0.96);
    g.fillEllipse(phobosX, phobosY, 48, 38);
    g.fillStyle(0x7a7066, 0.55);
    g.fillCircle(phobosX - 8, phobosY - 3, 7);
    g.fillCircle(phobosX + 9, phobosY + 5, 4.5);

    const deimosX = PLANET_CX - PLANET_RADIUS - 270;
    const deimosY = PLANET_CY + 460;
    g.fillStyle(0xb9b0a3, 0.9);
    g.fillEllipse(deimosX, deimosY, 30, 23);
    g.fillStyle(0x6e645b, 0.5);
    g.fillCircle(deimosX + 4, deimosY - 2, 4);

    // 1. Circular Mars Planetary Atmosphere Limb Halo
    g.fillStyle(lighting.skyInnerColor, 0.2);
    g.fillCircle(PLANET_CX, PLANET_CY, PLANET_RADIUS + 44);
    g.fillStyle(lighting.rimColor, 0.24);
    g.fillCircle(PLANET_CX, PLANET_CY, PLANET_RADIUS + 18);

    // Circular Mars Planet Surface Disc
    g.fillStyle(lighting.skyOuterColor, 1);
    g.fillCircle(PLANET_CX, PLANET_CY, PLANET_RADIUS);
    g.fillStyle(lighting.terrainSoil, 0.9);
    g.fillCircle(PLANET_CX, PLANET_CY, PLANET_RADIUS - 20);

    // Planetary-scale Martian basaltic plains (Syrtis/Acidalia-style textures) inside the globe
    g.fillStyle(lighting.craterShade, 0.36);
    g.fillEllipse(PLANET_CX - 620, PLANET_CY - 520, 740, 420);
    g.fillEllipse(PLANET_CX - 540, PLANET_CY + 720, 820, 360);
    g.fillEllipse(PLANET_CX + 410, PLANET_CY - 780, 760, 320);
    g.fillEllipse(PLANET_CX + 440, PLANET_CY + 760, 720, 340);
    g.fillEllipse(PLANET_CX - 980, PLANET_CY + 120, 360, 540);
    g.fillEllipse(PLANET_CX + 960, PLANET_CY + 80, 380, 520);

    // Subtle wind-carved Martian dune ripples across outer highlands
    g.lineStyle(6, lighting.terrainDune, 0.35);
    g.lineBetween(PLANET_CX - 1020, PLANET_CY - 190, PLANET_CX - 460, PLANET_CY - 250);
    g.lineBetween(PLANET_CX - 1040, PLANET_CY - 135, PLANET_CX - 440, PLANET_CY - 195);
    g.lineBetween(PLANET_CX + 620, PLANET_CY - 380, PLANET_CX + 1120, PLANET_CY - 310);
    g.lineBetween(PLANET_CX + 650, PLANET_CY - 325, PLANET_CX + 1140, PLANET_CY - 255);
    g.lineBetween(PLANET_CX - 860, PLANET_CY + 440, PLANET_CX - 340, PLANET_CY + 400);
    g.lineBetween(PLANET_CX + 580, PLANET_CY + 380, PLANET_CX + 1060, PLANET_CY + 440);

    // Extended Martian Valles-style canyon rift valley in southern highlands
    g.lineStyle(28, lighting.craterShade, 0.48);
    g.lineBetween(PLANET_CX - 760, PLANET_CY + 960, PLANET_CX - 220, PLANET_CY + 885);
    g.lineBetween(PLANET_CX - 220, PLANET_CY + 885, PLANET_CX + 260, PLANET_CY + 955);
    g.lineBetween(PLANET_CX + 260, PLANET_CY + 955, PLANET_CX + 760, PLANET_CY + 880);
    g.lineStyle(12, lighting.craterShade, 0.36);
    g.lineBetween(PLANET_CX - 220, PLANET_CY + 885, PLANET_CX - 80, PLANET_CY + 1050);
    g.lineBetween(PLANET_CX + 260, PLANET_CY + 955, PLANET_CX + 440, PLANET_CY + 1110);
    g.lineStyle(8, lighting.craterRim, 0.4);
    g.lineBetween(PLANET_CX - 740, PLANET_CY + 944, PLANET_CX - 220, PLANET_CY + 869);
    g.lineBetween(PLANET_CX - 220, PLANET_CY + 869, PLANET_CX + 260, PLANET_CY + 939);
    g.lineBetween(PLANET_CX + 260, PLANET_CY + 939, PLANET_CX + 740, PLANET_CY + 864);

    // North & South polar frost cap arcs inside Mars limbs
    g.fillStyle(0xf6efe6, 0.44);
    g.fillEllipse(PLANET_CX, PLANET_CY - PLANET_RADIUS + 92, 620, 92);
    g.fillStyle(0xf6efe6, 0.25);
    g.fillEllipse(PLANET_CX - 40, PLANET_CY - PLANET_RADIUS + 135, 420, 46);
    g.fillStyle(0xf6efe6, 0.32);
    g.fillEllipse(PLANET_CX + 50, PLANET_CY + PLANET_RADIUS - 78, 440, 68);

    // Mid highland plateau band framing the Outpost & Jezero Crater
    g.fillStyle(lighting.skyInnerColor, 0.56);
    g.fillEllipse(PLANET_CX - 10, PLANET_CY, 2240, 1860);

    // Distant layered Martian hills, mesas & stepped ridges inside Mars circle
    const ridges = [
      { x: -160, y: -235, w: 320, h: 110 },
      { x: 230, y: -295, w: 400, h: 120 },
      { x: 690, y: -255, w: 340, h: 110 },
      { x: -245, y: 120, w: 185, h: 235 },
      { x: -235, y: 440, w: 180, h: 225 },
      { x: -50, y: WORLD_HEIGHT + 90, w: 320, h: 115 },
      { x: 325, y: WORLD_HEIGHT + 100, w: 360, h: 115 },
      { x: 720, y: WORLD_HEIGHT + 85, w: 300, h: 110 },
      { x: PLANET_CX - 760, y: PLANET_CY - 820, w: 340, h: 115 },
      { x: PLANET_CX + 440, y: PLANET_CY + 710, w: 360, h: 120 },
      { x: PLANET_CX - 1080, y: PLANET_CY - 90, w: 220, h: 270 },
      { x: PLANET_CX + 860, y: PLANET_CY - 120, w: 230, h: 260 },
    ];
    for (const hill of ridges) {
      g.fillStyle(lighting.shadowColor, 0.34);
      g.fillRoundedRect(
        hill.x + lighting.shadowDx * 0.7,
        hill.y + lighting.shadowDy * 0.8,
        hill.w,
        hill.h,
        36
      );
      g.fillStyle(lighting.terrainDune, 0.85);
      g.fillRoundedRect(hill.x, hill.y, hill.w, hill.h, 36);
      g.lineStyle(2.5, lighting.craterRim, 0.45);
      g.lineBetween(hill.x + 28, hill.y + 4, hill.x + hill.w - 28, hill.y + 4);
    }

    // Expanded impact craters & volcanic basins across Mars globe (all inside PLANET_RADIUS)
    const outerCraters = [
      { x: -135, y: 235, r: 58, ringed: true },
      { x: -120, y: 580, r: 48, ringed: false },
      { x: -390, y: 390, r: 84, ringed: true },
      { x: -360, y: -140, r: 70, ringed: false },
      { x: -640, y: 120, r: 96, ringed: true },
      { x: -580, y: 740, r: 78, ringed: true },
      { x: -460, y: -560, r: 88, ringed: true },
      { x: 250, y: -155, r: 48, ringed: false },
      { x: 765, y: -140, r: 54, ringed: true },
      { x: 210, y: WORLD_HEIGHT + 145, r: 52, ringed: false },
      { x: 745, y: WORLD_HEIGHT + 140, r: 56, ringed: true },
      { x: 560, y: -540, r: 82, ringed: true },
      { x: 165, y: -760, r: 64, ringed: false },
      { x: 1080, y: -560, r: 76, ringed: true },
      { x: 1460, y: -220, r: 88, ringed: true },
      { x: 1520, y: 340, r: 74, ringed: false },
      { x: 1380, y: 860, r: 82, ringed: true },
      { x: 560, y: 1320, r: 86, ringed: true },
      { x: 1080, y: 1220, r: 66, ringed: false },
      { x: 40, y: 1240, r: 62, ringed: false },
      { x: 120, y: -880, r: 54, ringed: true },
      { x: 960, y: -840, r: 60, ringed: false },
    ];
    for (const c of outerCraters) {
      g.fillStyle(lighting.craterShade, 0.72);
      g.fillCircle(c.x, c.y, c.r);
      g.fillStyle(lighting.shadowColor, 0.28);
      g.fillCircle(c.x + lighting.shadowDx * 0.25, c.y + lighting.shadowDy * 0.25, c.r * 0.76);
      g.lineStyle(3, lighting.craterRim, 0.65);
      g.strokeCircle(c.x, c.y, c.r + 2);
      if (c.ringed) {
        g.lineStyle(2, lighting.craterRim, 0.36);
        g.strokeCircle(c.x, c.y, c.r * 0.62);
        g.fillStyle(lighting.rockBody, 0.8);
        g.fillCircle(c.x + 2, c.y + 2, c.r * 0.16);
      }
    }

    // Clearly Visible, Larger JEZERO CRATER beside the eastern plateau edge (cleanly inside Mars disc)
    const jcX = WORLD_WIDTH + 228;
    const jcY = WORLD_HEIGHT * 0.5;
    const jcRx = 212;
    const jcRy = 324;

    // Outer Jezero ejecta shelf & rim ridge
    g.fillStyle(lighting.terrainDune, 0.9);
    g.fillEllipse(jcX, jcY, jcRx * 2 + 48, jcRy * 2 + 48);
    g.lineStyle(4.5, lighting.craterRim, 0.78);
    g.strokeEllipse(jcX, jcY, jcRx * 2 + 12, jcRy * 2 + 12);

    // Upper terraced crater bench
    g.fillStyle(lighting.craterShade, 0.86);
    g.fillEllipse(jcX, jcY, jcRx * 2, jcRy * 2);
    g.lineStyle(3.2, lighting.craterRim, 0.54);
    g.strokeEllipse(jcX, jcY, jcRx * 2, jcRy * 2);

    // Deeper stepped inner crater floor + directional wall shadow
    g.fillStyle(lighting.shadowColor, 0.36);
    g.fillEllipse(
      jcX + lighting.shadowDx * 0.9,
      jcY + lighting.shadowDy * 0.9,
      jcRx * 1.58,
      jcRy * 1.58
    );
    g.fillStyle(lighting.craterShade, 0.95);
    g.fillEllipse(jcX + 8, jcY + 5, jcRx * 1.34, jcRy * 1.34);
    g.lineStyle(2.8, lighting.craterRim, 0.4);
    g.strokeEllipse(jcX + 8, jcY + 5, jcRx * 1.34, jcRy * 1.34);

    // Pale clay-carbonate Séítah / Neretva fan-delta sedimentary deposits inside NW Jezero basin
    g.fillStyle(lighting.walkwayColor, 0.24);
    g.fillEllipse(jcX - 42, jcY - 12, jcRx * 0.96, jcRy * 0.88);
    g.fillStyle(lighting.terrainDune, 0.42);
    g.fillEllipse(jcX + 18, jcY + 24, jcRx * 0.72, jcRy * 0.66);

    // Neretva Vallis ancient river delta channels carving through the NW Jezero rim
    g.lineStyle(14, lighting.craterShade, 0.56);
    g.lineBetween(WORLD_WIDTH + 30, 168, jcX - 84, 272);
    g.lineStyle(10, lighting.walkwayColor, 0.44);
    g.lineBetween(WORLD_WIDTH + 34, 170, jcX - 84, 272);
    g.lineBetween(jcX - 84, 272, jcX - 24, 372);
    g.lineStyle(6.5, lighting.walkwayColor, 0.36);
    g.lineBetween(jcX - 84, 272, jcX - 112, 398);
    g.lineBetween(jcX - 24, 372, jcX + 38, 434);
    g.lineBetween(jcX - 48, 326, jcX + 12, 344);

    // Dark olivine-basalt Máaz crater floor outcrops & Kodiak-style delta remnant butte
    g.fillStyle(lighting.shadowColor, 0.4);
    g.fillEllipse(jcX + 20 + lighting.shadowDx * 0.4, jcY + 14 + lighting.shadowDy * 0.4, 68, 50);
    g.fillStyle(lighting.rockBody, 0.92);
    g.fillEllipse(jcX + 16, jcY + 10, 62, 44);
    g.lineStyle(2.5, lighting.rimColor, 0.65);
    g.strokeEllipse(jcX + 16, jcY + 10, 62, 44);

    // Belva-inspired secondary impact craterlets & terraced rim exposures inside Jezero
    g.fillStyle(lighting.shadowColor, 0.42);
    g.fillCircle(jcX - 48, jcY + 136, 25);
    g.lineStyle(2, lighting.craterRim, 0.45);
    g.strokeCircle(jcX - 48, jcY + 136, 25);
    g.fillStyle(lighting.shadowColor, 0.36);
    g.fillCircle(jcX + 68, jcY - 128, 20);
    g.lineStyle(2, lighting.craterRim, 0.42);
    g.strokeCircle(jcX + 68, jcY - 128, 20);

    if (this.jezeroLabel) {
      this.jezeroLabel.setAlpha(0.92);
    }

    // Crisp circular planet horizon rim
    g.lineStyle(4, lighting.craterRim, 0.65);
    g.strokeCircle(PLANET_CX, PLANET_CY, PLANET_RADIUS);

    // 2. Seamless Elevated Outpost Mars Plateau (zero holes or gaps inside the outpost area!)
    g.fillStyle(lighting.shadowColor, 0.34);
    g.fillRoundedRect(-22, -12, WORLD_WIDTH + 48, WORLD_HEIGHT + 34, 34);

    g.fillStyle(lighting.terrainSoil, 1);
    g.fillRoundedRect(-28, -20, WORLD_WIDTH + 56, WORLD_HEIGHT + 40, 32);

    // Subtle geological regolith strata & mineral pigment variations across the plateau
    g.fillStyle(lighting.terrainDune, 0.28);
    g.fillEllipse(210, 185, 310, 92);
    g.fillEllipse(715, 200, 295, 86);
    g.fillEllipse(230, 530, 320, 96);
    g.fillEllipse(710, 535, 300, 90);
    g.fillEllipse(475, 345, 380, 120);

    g.fillStyle(lighting.craterShade, 0.14);
    g.fillEllipse(145, 620, 190, 62);
    g.fillEllipse(820, 620, 200, 68);
    g.fillEllipse(835, 110, 175, 58);

    // Realistic wind-sculpted sand ripples & mineral dust streaks (no pits/holes)
    g.lineStyle(2.2, lighting.walkwayColor, 0.26);
    const rippleRows = [
      { x1: 68, y1: 185, x2: 196, y2: 179 },
      { x1: 310, y1: 168, x2: 432, y2: 164 },
      { x1: 580, y1: 235, x2: 710, y2: 229 },
      { x1: 160, y1: 522, x2: 295, y2: 516 },
      { x1: 635, y1: 518, x2: 785, y2: 511 },
      { x1: 340, y1: 632, x2: 478, y2: 626 },
      { x1: 710, y1: 638, x2: 855, y2: 631 },
    ];
    for (const r of rippleRows) {
      g.lineBetween(r.x1, r.y1, r.x2, r.y2);
      g.lineBetween(r.x1 + 14, r.y1 + 9, r.x2 + 8, r.y2 + 9);
    }

    // Fine mineral scatter speckles & micro-gravel texture for surface realism
    const regolithSpecks = [
      { x: 112, y: 205, r: 2.2 }, { x: 245, y: 152, r: 1.8 }, { x: 405, y: 215, r: 2.0 },
      { x: 560, y: 190, r: 2.4 }, { x: 745, y: 195, r: 1.9 }, { x: 882, y: 318, r: 2.2 },
      { x: 148, y: 392, r: 2.0 }, { x: 325, y: 405, r: 2.3 }, { x: 660, y: 398, r: 1.8 },
      { x: 830, y: 458, r: 2.2 }, { x: 192, y: 615, r: 2.4 }, { x: 590, y: 615, r: 2.0 },
      { x: 775, y: 625, r: 2.3 }, { x: 448, y: 545, r: 1.8 }, { x: 382, y: 255, r: 2.1 },
    ];
    for (const sp of regolithSpecks) {
      g.fillStyle(lighting.craterShade, 0.25);
      g.fillCircle(sp.x, sp.y, sp.r);
      g.fillStyle(lighting.craterRim, 0.22);
      g.fillCircle(sp.x + 12, sp.y + 4, sp.r * 0.78);
    }

    // Soft natural regolith plateau rim instead of harsh box border
    g.lineStyle(2.5, lighting.craterRim, 0.28);
    g.strokeRoundedRect(-24, -16, WORLD_WIDTH + 48, WORLD_HEIGHT + 32, 30);

    // 3. Perimeter & surrounding Martian boulders + scattered stone clusters (clear of walkways/buildings!)
    const rocks = [
      // Outpost corners & outer margins
      { x: 18, y: 20, w: 28, h: 20 },
      { x: 312, y: 18, w: 24, h: 16 },
      { x: 528, y: 18, w: 22, h: 16 },
      { x: 882, y: 22, w: 30, h: 20 },
      { x: 18, y: 405, w: 24, h: 18 },
      { x: 24, y: 668, w: 30, h: 20 },
      { x: 280, y: 672, w: 26, h: 18 },
      { x: 655, y: 670, w: 28, h: 18 },
      { x: 882, y: 666, w: 32, h: 22 },
      // Surrounding Martian terrain & Jezero Crater rim boulders (inside Mars disc)
      { x: -115, y: 95, w: 36, h: 24 },
      { x: -135, y: 425, w: 40, h: 26 },
      { x: -90, y: 645, w: 34, h: 22 },
      { x: 480, y: -92, w: 38, h: 24 },
      { x: 460, y: WORLD_HEIGHT + 72, w: 36, h: 24 },
      { x: WORLD_WIDTH + 54, y: 126, w: 32, h: 22 },
      { x: WORLD_WIDTH + 62, y: 580, w: 36, h: 24 },
      { x: jcX + 82, y: jcY + 158, w: 30, h: 22 },
    ];
    for (const r of rocks) {
      rocksG.fillStyle(lighting.shadowColor, 0.4);
      rocksG.fillRoundedRect(
        r.x + lighting.shadowDx * 0.45,
        r.y + lighting.shadowDy * 0.55,
        r.w + 2,
        r.h + 1,
        5
      );
      rocksG.fillStyle(lighting.rockBody, 1);
      rocksG.lineStyle(2, PALETTE.charcoal, 1);
      rocksG.fillRoundedRect(r.x, r.y, r.w, r.h, 5);
      rocksG.strokeRoundedRect(r.x, r.y, r.w, r.h, 5);
      rocksG.lineStyle(2.2, lighting.rimColor, 0.65);
      rocksG.lineBetween(r.x + 4, r.y + 3, r.x + r.w - 4, r.y + 3);
    }

    // Scattered small Martian pebbles/stones outside buildings & paths
    const pebbles = [
      { x: 320, y: 235, r: 4 },
      { x: 540, y: 185, r: 3.5 },
      { x: 756, y: 105, r: 4 },
      { x: 245, y: 540, r: 4 },
      { x: 756, y: 396, r: 3.5 },
      { x: 520, y: 645, r: 4.5 },
      { x: -65, y: 315, r: 5 },
      { x: -100, y: 540, r: 4.5 },
      { x: WORLD_WIDTH + 48, y: 420, r: 5 },
      { x: jcX - 50, y: jcY - 90, r: 4 },
    ];
    for (const p of pebbles) {
      rocksG.fillStyle(lighting.shadowColor, 0.35);
      rocksG.fillCircle(p.x + 2, p.y + 2, p.r);
      rocksG.fillStyle(lighting.rockBody, 0.95);
      rocksG.fillCircle(p.x, p.y, p.r);
    }
  }

  private createBuildings() {
    for (const def of BUILDING_LIST) {
      const bounds = gridManager.getBuildingBounds(def);
      const container = this.add.container(bounds.centerX, bounds.centerY);
      container.setDepth(10);

      const selectionRing = this.add.graphics();
      const graphics = this.add.graphics();
      const workBar = this.add.graphics();

      const textResolution = this.getTextResolution();
      const nameTag = this.add
        .text(0, bounds.height / 2 + 6, def.shortName, {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#292C2B',
          backgroundColor: '#F1D8A8',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5, 0)
        .setResolution(textResolution);

      const statusTag = this.add
        .text(0, -bounds.height / 2 - 22, '', {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#F1D8A8',
          backgroundColor: '#5C524C',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5, 1)
        .setResolution(textResolution);

      container.add([selectionRing, graphics, workBar, nameTag, statusTag]);
      container.setSize(bounds.width, bounds.height);
      container.setInteractive({ useHandCursor: true });

      container.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        if (pointer.wasTouch) return;
        const st = gameStore.getState();
        if (st.screen !== 'PLAYING' || this.hasBlockingGameplayOverlay(st)) return;
        container.setScale(1.03);
      });

      container.on('pointerout', () => {
        container.setScale(1);
      });

      container.on('pointerup', () => {
        if (this.wasDragged || this.isPinching) return;
        const st = gameStore.getState();
        if (st.screen !== 'PLAYING' || this.hasBlockingGameplayOverlay(st)) return;
        this.runNasToBuilding(def.id);
        gameStore.selectBuilding(def.id);
      });

      this.buildingVisuals.set(def.id, {
        container,
        graphics,
        selectionRing,
        workBar,
        statusTag,
        nameTag,
        baseX: bounds.centerX,
        baseY: bounds.centerY,
        width: bounds.width,
        height: bounds.height,
        restoringUntil: 0,
      });
    }
  }

  private createCharacters() {
    const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
    const frontY = habBounds.y + habBounds.height + 24;
    // Playable astronaut ('You') + GIL + 4 AI crew members (Brent, MJ, Darryl, Magno) = 5 crew total
    this.nas = createNasContainer(this, habBounds.centerX - 10, frontY);
    this.gil = createGilContainer(this, habBounds.centerX + 26, frontY - 18);

    const crewSpecs: Array<{
      name: string;
      suitAccent: number;
      skinTone: number;
      hairColor: number;
      homeBuilding: BuildingId;
      patrolBuildings: BuildingId[];
      scenicSpots: Point2D[];
      spawnX: number;
      spawnY: number;
      walkSpeed: number;
      phaseOffset: number;
      idleActivity: IdleActivity;
      specialtyTask: ActionAnimKind;
      strideGain: number;
    }> = [
      {
        name: 'Brent',
        suitAccent: 0xe59838,
        skinTone: 0xf4c7a1,
        hairColor: 0x4b3224,
        homeBuilding: 'solar_panels',
        patrolBuildings: ['solar_panels', 'energy_storage', 'radiation_shelter', 'main_habitat'],
        scenicSpots: [
          { x: 215, y: 315 },
          { x: 650, y: 165 },
          { x: 878, y: 485 },
        ],
        spawnX: habBounds.centerX - 96,
        spawnY: frontY,
        walkSpeed: 132,
        phaseOffset: 0.7,
        idleActivity: 'waving',
        specialtyTask: 'clean',
        strideGain: 1.05,
      },
      {
        name: 'MJ',
        suitAccent: PALETTE.lifeGreen,
        skinTone: 0x8d5524,
        hairColor: 0x221b18,
        homeBuilding: 'greenhouse',
        patrolBuildings: ['greenhouse', 'food_storage', 'water_recycling', 'main_habitat'],
        scenicSpots: [
          { x: 468, y: 375 },
          { x: 255, y: 515 },
          { x: 695, y: 505 },
        ],
        spawnX: habBounds.centerX - 54,
        spawnY: frontY + 4,
        walkSpeed: 112,
        phaseOffset: 2.3,
        idleActivity: 'inspecting',
        specialtyTask: 'plant',
        strideGain: 0.9,
      },
      {
        name: 'Darryl',
        suitAccent: PALETTE.techBlue,
        skinTone: 0xe0ac69,
        hairColor: 0x292c2b,
        homeBuilding: 'oxygen_generator',
        patrolBuildings: ['oxygen_generator', 'oxygen_storage', 'water_recycling', 'radiation_shelter'],
        scenicSpots: [
          { x: 878, y: 345 },
          { x: 520, y: 205 },
          { x: 350, y: 365 },
        ],
        spawnX: habBounds.centerX + 46,
        spawnY: frontY,
        walkSpeed: 124,
        phaseOffset: 4.1,
        idleActivity: 'tinkering',
        specialtyTask: 'repair',
        strideGain: 1.0,
      },
      {
        name: 'Magno',
        suitAccent: 0x8e63a8,
        skinTone: 0xf1c27d,
        hairColor: 0x7c3e26,
        homeBuilding: 'maintenance_facility',
        patrolBuildings: ['maintenance_facility', 'water_storage', 'energy_storage', 'main_habitat'],
        scenicSpots: [
          { x: 885, y: 495 },
          { x: 472, y: 615 },
          { x: 640, y: 155 },
        ],
        spawnX: habBounds.centerX + 94,
        spawnY: frontY - 4,
        walkSpeed: 142,
        phaseOffset: 5.9,
        idleActivity: 'looking_around',
        specialtyTask: 'repair',
        strideGain: 1.15,
      },
    ];

    this.nasLastX = this.nas.x;
    this.nasLastY = this.nas.y;

    this.crewAgents = crewSpecs.map((spec, idx) => {
      const safeSpawn = gridManager.pushOutOfBuildings(
        spec.spawnX,
        spec.spawnY,
        BUILDING_CLEARANCE
      );
      const container = createCrewMemberContainer(
        this,
        safeSpawn.x,
        safeSpawn.y,
        {
          name: spec.name,
          suitAccent: spec.suitAccent,
          skinTone: spec.skinTone,
          hairColor: spec.hairColor,
        }
      );
      const agent: CrewAgent = {
        name: spec.name,
        container,
        homeBuilding: spec.homeBuilding,
        patrolBuildings: spec.patrolBuildings,
        scenicSpots: spec.scenicSpots,
        path: [],
        allowInsideBuildingId: undefined,
        waitUntil: 1.3 + idx * 1.15,
        phaseOffset: spec.phaseOffset,
        walkSpeed: spec.walkSpeed,
        idleActivity: spec.idleActivity,
        activityUntil: 2.5 + idx * 1.1,
        specialtyTask: spec.specialtyTask,
        taskUntil: 0,
        strideGain: spec.strideGain,
        stuckElapsed: 0,
        lastX: safeSpawn.x,
        lastY: safeSpawn.y,
      };
      this.setupCrewInteraction(container, agent);
      return agent;
    });

    this.setupCrewInteraction(this.nas, 'player');

    this.actionAnimLayer = this.add.graphics();
    this.actionAnimLayer.setDepth(46);
  }

  private setupCrewInteraction(
    container: Phaser.GameObjects.Container | undefined,
    target: 'player' | CrewAgent
  ) {
    if (!container) return;
    container.setSize(42, 54);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerup', () => {
      if (this.wasDragged) return;
      const st = gameStore.getState();
      if (st.screen !== 'PLAYING' || this.hasBlockingGameplayOverlay(st)) return;
      this.triggerCrewClickReaction(target);
    });
  }

  private triggerCrewClickReaction(target: 'player' | CrewAgent) {
    const state = gameStore.getState();
    if (state.screen !== 'PLAYING' || this.hasBlockingGameplayOverlay(state)) return;

    const isBusy =
      this.landingDisembarkActive ||
      state.crew.inShelter ||
      state.sleepPhase !== 'idle' ||
      state.sleepingRemaining > 0;

    if (target === 'player') {
      if (isBusy || this.nasPath.length > 0 || state.pendingAction) {
        soundFX.playTick();
        return;
      }
      const candidates = IDLE_ACTIVITIES.filter((a) => a !== this.playerIdleActivity);
      const nextActivity =
        candidates[Phaser.Math.Between(0, Math.max(0, candidates.length - 1))] ?? 'waving';
      this.playerIdleActivity = nextActivity;
      this.playerActivityUntil = this.elapsedTime + Phaser.Math.FloatBetween(3.4, 5.2);
      this.playerIdleWaitUntil = Math.max(this.playerIdleWaitUntil, this.elapsedTime + 3.6);
      if (this.nas && !this.reducedMotion) {
        this.nas.setScale(1.16, 1.0);
      }
      soundFX.playCrewReactionCue('Player', 'calm');
      return;
    }

    if (
      isBusy ||
      target.path.length > 0 ||
      target.taskUntil > this.elapsedTime
    ) {
      soundFX.playTick();
      return;
    }

    const candidates = IDLE_ACTIVITIES.filter((a) => a !== target.idleActivity);
    const nextActivity =
      candidates[Phaser.Math.Between(0, Math.max(0, candidates.length - 1))] ?? 'looking_around';
    target.idleActivity = nextActivity;
    target.activityUntil = this.elapsedTime + Phaser.Math.FloatBetween(3.4, 5.4);
    target.waitUntil = Math.max(target.waitUntil, this.elapsedTime + 3.6);
    if (target.container && !this.reducedMotion) {
      target.container.setScale(0.99, 0.85);
    }
    const speaker =
      target.name === 'Brent' ||
      target.name === 'MJ' ||
      target.name === 'Darryl' ||
      target.name === 'Magno'
        ? target.name
        : 'Brent';
    soundFX.playCrewReactionCue(speaker, 'calm');
  }

  private createWeatherLayer() {
    this.weatherOverlay = this.add.graphics();
    this.weatherOverlay.setDepth(60);

    this.eventEffectsLayer = this.add.graphics();
    this.eventEffectsLayer.setDepth(61);

    for (let i = 0; i < 24; i++) {
      const rect = this.add.rectangle(
        Phaser.Math.Between(0, WORLD_WIDTH),
        Phaser.Math.Between(0, WORLD_HEIGHT),
        Phaser.Math.Between(14, 34),
        4,
        PALETTE.sand,
        0.22
      );
      rect.setDepth(59);
      this.dustParticles.push({
        rect,
        speed: Phaser.Math.Between(35, 95),
      });
    }

    // Blowing storm dust streaks (visible during dust storms & dust devils)
    for (let i = 0; i < 42; i++) {
      const streak = this.add.rectangle(
        Phaser.Math.Between(-80, WORLD_WIDTH),
        Phaser.Math.Between(0, WORLD_HEIGHT),
        Phaser.Math.Between(56, 155),
        Phaser.Math.Between(4, 10),
        i % 3 === 0 ? PALETTE.cream : i % 2 === 0 ? PALETTE.sand : PALETTE.terracotta,
        0.42
      );
      streak.setAngle(-9);
      streak.setDepth(62);
      streak.setVisible(false);
      this.stormStreaks.push({
        rect: streak,
        speed: Phaser.Math.Between(300, 560),
        driftY: Phaser.Math.Between(28, 78),
      });
    }

    // Falling ice crystals (visible during water ice cloud formation)
    for (let i = 0; i < 38; i++) {
      const circle = this.add.circle(
        Phaser.Math.Between(0, WORLD_WIDTH),
        Phaser.Math.Between(0, WORLD_HEIGHT),
        Phaser.Math.Between(3, 5),
        i % 3 === 0 ? 0xffffff : 0xbbe8ff,
        0.82
      );
      circle.setStrokeStyle(1.2, 0x6ca4c4, 0.55);
      circle.setDepth(62);
      circle.setVisible(false);
      this.iceParticles.push({
        circle,
        speedY: Phaser.Math.Between(42, 88),
        driftX: Phaser.Math.Between(-24, 24),
      });
    }
  }

  private createDayNightLayer() {
    // Horizon atmospheric light sweep sits under buildings/characters so it never muddies interactive assets
    this.skyHorizonLayer = this.add.graphics();
    this.skyHorizonLayer.setDepth(2);

    // Ultra-subtle atmospheric air perspective veil (no dark overlay dimming gameplay!)
    this.dayNightOverlay = this.add.graphics();
    this.dayNightOverlay.setDepth(57);

    this.outpostLightsLayer = this.add.graphics();
    this.outpostLightsLayer.setDepth(58);

    // Multi-hue twinkling stars in outer space surrounding the circular Mars globe
    const starColors = [0xfaf0dc, 0xa8cbff, 0xffe2b0, 0xdbeafe];
    for (let i = 0; i < 240; i++) {
      const angle = ((i * 137.508) % 360) * (Math.PI / 180);
      const ringDist = PLANET_RADIUS + 90 + ((i * 137) % 2400);
      const sx = PLANET_CX + Math.cos(angle) * ringDist;
      const sy = PLANET_CY + Math.sin(angle) * ringDist;
      const star = this.add.circle(
        sx,
        sy,
        i % 5 === 0 ? 5.2 : i % 3 === 0 ? 3.8 : 2.4,
        starColors[i % starColors.length],
        0.8
      );
      star.setDepth(0);
      this.nightStars.push({
        circle: star,
        phase: i * 0.72,
        baseAlpha: 0.48 + (i % 4) * 0.14,
      });
    }
  }

  private lerpHexColor(c1: number, c2: number, t: number): number {
    const clamped = Phaser.Math.Clamp(t, 0, 1);
    const col1 = Phaser.Display.Color.IntegerToColor(c1);
    const col2 = Phaser.Display.Color.IntegerToColor(c2);
    const blended = Phaser.Display.Color.Interpolate.ColorWithColor(col1, col2, 100, clamped * 100);
    return Phaser.Display.Color.GetColor(blended.r, blended.g, blended.b);
  }

  private computeDayNightLighting(hours: number): {
    tintColor: number;
    tintAlpha: number;
    nightFactor: number;
    shadowDx: number;
    shadowDy: number;
    shadowAlpha: number;
    shadowColor: number;
    sunBias: number;
    rimColor: number;
    rimAlpha: number;
    horizonColor: number;
    horizonAlpha: number;
    horizonSide: 'east' | 'west' | 'none';
    groundTintColor: number;
    groundTintAlpha: number;
    skyOuterColor: number;
    skyInnerColor: number;
    terrainSoil: number;
    terrainDune: number;
    craterShade: number;
    craterRim: number;
    walkwayColor: number;
    gridTint: number;
    rockBody: number;
  } {
    const h = Phaser.Math.Clamp(hours, 0, TOTAL_DAY_HOURS);

    // Balanced, cohesive Martian color grading across all times of sol
    const NIGHT = {
      tintColor: 0x242854,
      tintAlpha: 0.08,
      nightFactor: 1,
      shadowDx: 7,
      shadowDy: 6,
      shadowAlpha: 0.34,
      shadowColor: 0x1b1b3d, // Deep slate-indigo shadow
      sunBias: 0,
      rimColor: 0x8fb8ff, // Cool ambient moonlight rim
      rimAlpha: 0.52,
      horizonColor: 0x3b4e8a,
      horizonAlpha: 0.14,
      horizonSide: 'east' as const,
      groundTintColor: 0x7ba4f7,
      groundTintAlpha: 0.06,
      skyOuterColor: 0x0b1026,
      skyInnerColor: 0x1e234d,
      terrainSoil: 0x462b3d, // Cohesive muted Martian rust-plum
      terrainDune: 0x583649,
      craterShade: 0x262044,
      craterRim: 0x715a78,
      walkwayColor: 0x675368,
      gridTint: 0x8fa4d8,
      rockBody: 0x6b3e48,
    };

    const SUNRISE = {
      tintColor: 0xffa873,
      tintAlpha: 0.07,
      nightFactor: 0.25,
      shadowDx: -14,
      shadowDy: 8,
      shadowAlpha: 0.32,
      shadowColor: 0x392748,
      sunBias: -0.82,
      rimColor: 0xf5ba82,
      rimAlpha: 0.46,
      horizonColor: 0xf4a568,
      horizonAlpha: 0.28,
      horizonSide: 'east' as const,
      groundTintColor: 0xffaa64,
      groundTintAlpha: 0.09,
      skyOuterColor: 0x653b52,
      skyInnerColor: 0xc97352,
      terrainSoil: 0xa6503d,
      terrainDune: 0xba6248,
      craterShade: 0x563245,
      craterRim: 0xe69868,
      walkwayColor: 0xd9a174,
      gridTint: 0x3b2638,
      rockBody: 0xbf6a4b,
    };

    const DAY = {
      tintColor: 0xffbe7d,
      tintAlpha: 0.02,
      nightFactor: 0,
      shadowDx: 2,
      shadowDy: 6.5,
      shadowAlpha: 0.3,
      shadowColor: 0x422a3a, // Balanced warm-plum shadow
      sunBias: 0,
      rimColor: 0xfce0ac,
      rimAlpha: 0.36,
      horizonColor: 0xebaa72,
      horizonAlpha: 0.07,
      horizonSide: 'none' as const,
      groundTintColor: 0xffc67d,
      groundTintAlpha: 0.03,
      skyOuterColor: 0xa5533a,
      skyInnerColor: 0xcf7f54,
      terrainSoil: 0xb86242, // Balanced dusty Martian sienna (never competes with HUD/buildings)
      terrainDune: 0xc7734d,
      craterShade: 0x7a3d2e,
      craterRim: 0xdf9864,
      walkwayColor: 0xe2c388, // Sunlit dusty sand
      gridTint: 0x3a2420,
      rockBody: 0xc77449,
    };

    const SUNSET = {
      tintColor: 0xeb7349,
      tintAlpha: 0.1,
      nightFactor: 0.42,
      shadowDx: 16,
      shadowDy: 8.5,
      shadowAlpha: 0.36,
      shadowColor: 0x2e2147,
      sunBias: 0.85,
      rimColor: 0xf49158,
      rimAlpha: 0.52,
      horizonColor: 0xf27652,
      horizonAlpha: 0.32,
      horizonSide: 'west' as const,
      groundTintColor: 0xff7e47,
      groundTintAlpha: 0.1,
      skyOuterColor: 0x442549,
      skyInnerColor: 0xcf5f47,
      terrainSoil: 0x99453c,
      terrainDune: 0xb35641,
      craterShade: 0x3a2548,
      craterRim: 0xed8c58,
      walkwayColor: 0xcf875e,
      gridTint: 0x351e3d,
      rockBody: 0xb55744,
    };

    const blendPalette = (
      a: ReturnType<OutpostScene['computeDayNightLighting']>,
      b: ReturnType<OutpostScene['computeDayNightLighting']>,
      t: number,
      side: 'east' | 'west' | 'none'
    ): ReturnType<OutpostScene['computeDayNightLighting']> => ({
      tintColor: this.lerpHexColor(a.tintColor, b.tintColor, t),
      tintAlpha: Phaser.Math.Linear(a.tintAlpha, b.tintAlpha, t),
      nightFactor: Phaser.Math.Linear(a.nightFactor, b.nightFactor, t),
      shadowDx: Phaser.Math.Linear(a.shadowDx, b.shadowDx, t),
      shadowDy: Phaser.Math.Linear(a.shadowDy, b.shadowDy, t),
      shadowAlpha: Phaser.Math.Linear(a.shadowAlpha, b.shadowAlpha, t),
      shadowColor: this.lerpHexColor(a.shadowColor, b.shadowColor, t),
      sunBias: Phaser.Math.Linear(a.sunBias, b.sunBias, t),
      rimColor: this.lerpHexColor(a.rimColor, b.rimColor, t),
      rimAlpha: Phaser.Math.Linear(a.rimAlpha, b.rimAlpha, t),
      horizonColor: this.lerpHexColor(a.horizonColor, b.horizonColor, t),
      horizonAlpha: Phaser.Math.Linear(a.horizonAlpha, b.horizonAlpha, t),
      horizonSide: side,
      groundTintColor: this.lerpHexColor(a.groundTintColor, b.groundTintColor, t),
      groundTintAlpha: Phaser.Math.Linear(a.groundTintAlpha, b.groundTintAlpha, t),
      skyOuterColor: this.lerpHexColor(a.skyOuterColor, b.skyOuterColor, t),
      skyInnerColor: this.lerpHexColor(a.skyInnerColor, b.skyInnerColor, t),
      terrainSoil: this.lerpHexColor(a.terrainSoil, b.terrainSoil, t),
      terrainDune: this.lerpHexColor(a.terrainDune, b.terrainDune, t),
      craterShade: this.lerpHexColor(a.craterShade, b.craterShade, t),
      craterRim: this.lerpHexColor(a.craterRim, b.craterRim, t),
      walkwayColor: this.lerpHexColor(a.walkwayColor, b.walkwayColor, t),
      gridTint: this.lerpHexColor(a.gridTint, b.gridTint, t),
      rockBody: this.lerpHexColor(a.rockBody, b.rockBody, t),
    });

    if (h < 5.0) {
      return NIGHT;
    }
    if (h < 6.4) {
      // Pre-dawn Night -> Warm Coral Sunrise
      return blendPalette(NIGHT, SUNRISE, (h - 5.0) / 1.4, 'east');
    }
    if (h < 8.5) {
      // Sunrise -> Bright Morning Sun
      return blendPalette(SUNRISE, DAY, (h - 6.4) / 2.1, 'east');
    }
    if (h < 15.5) {
      // Bright Daytime with slow overhead sun shadow sweep (-3 -> +7)
      const t = (h - 8.5) / 7.0;
      return {
        ...DAY,
        shadowDx: Phaser.Math.Linear(-3, 7, t),
        shadowDy: 6.2 + Math.sin(t * Math.PI) * 1.4,
        sunBias: Phaser.Math.Linear(-0.22, 0.25, t),
      };
    }
    if (h < 18.0) {
      // Afternoon -> Rich Amber/Coral/Deep Orange Sunset with long violet shadows
      return blendPalette(DAY, SUNSET, (h - 15.5) / 2.5, 'west');
    }
    if (h < 20.0) {
      // Sunset -> Deep Navy/Indigo Nightfall
      return blendPalette(SUNSET, NIGHT, (h - 18.0) / 2.0, 'west');
    }
    return NIGHT;
  }

  private renderDayNightCycle(state: GameState, lightingChanged = true) {
    if (!this.dayNightOverlay || !this.outpostLightsLayer) return;

    const lighting = this.computeDayNightLighting(this.displayHours);
    const shouldUpdateStaticAtmosphere =
      lightingChanged || this.lastLightingNightFactor < 0;
    const shouldUpdateNightLights =
      lighting.nightFactor > 0.1 || this.lastLightingNightFactor > 0.1 || lightingChanged;

    if (Math.abs(this.displayHours - this.lastTerrainHours) > 0.005) {
      this.lastTerrainHours = this.displayHours;
      this.redrawTerrainAtmosphere(lighting);
    }

    if (shouldUpdateStaticAtmosphere) {
      if (this.groundSunTintLayer) {
        this.groundSunTintLayer.clear();
        if (lighting.groundTintAlpha > 0.005) {
          this.groundSunTintLayer.fillStyle(lighting.groundTintColor, lighting.groundTintAlpha);
          this.groundSunTintLayer.fillRoundedRect(-24, -18, WORLD_WIDTH + 48, WORLD_HEIGHT + 36, 20);
        }
      }

      if (this.skyHorizonLayer) {
        this.skyHorizonLayer.clear();
        if (lighting.horizonAlpha > 0.01 && lighting.horizonSide !== 'none') {
          const isEast = lighting.horizonSide === 'east';
          const bandX = isEast ? PLANET_CX + 380 : PLANET_CX - 380;
          // Martian twilight: Mie-scattered dusty ochre outer band + cool bluish-gray glow toward the Sun
          this.skyHorizonLayer.fillStyle(lighting.horizonColor, lighting.horizonAlpha * 0.2);
          this.skyHorizonLayer.fillEllipse(bandX, PLANET_CY, 1100, 1950);
          const rimX = isEast ? PLANET_CX + 540 : PLANET_CX - 540;
          this.skyHorizonLayer.fillStyle(0x7ca2c8, lighting.horizonAlpha * 0.24);
          this.skyHorizonLayer.fillEllipse(rimX, PLANET_CY, 640, 1620);
        }
      }

      this.dayNightOverlay.clear();
      if (lighting.tintAlpha > 0.004) {
        this.dayNightOverlay.fillStyle(lighting.tintColor, lighting.tintAlpha);
        this.dayNightOverlay.fillCircle(PLANET_CX, PLANET_CY, PLANET_RADIUS);
      }
    }

    // Warm artificial ground light pools spilling from habitats & systems (under buildings!)
    if (this.groundLightsLayer && shouldUpdateNightLights) {
      this.groundLightsLayer.clear();
      if (lighting.nightFactor > 0.1 && state.screen !== 'TITLE_MENU') {
        const nf = lighting.nightFactor;
        const groundSpecs: Array<{
          id: BuildingId;
          outerColor: number;
          innerColor: number;
          radius: number;
          alpha: number;
        }> = [
          { id: 'main_habitat', outerColor: 0xff9f43, innerColor: 0xffd773, radius: 138, alpha: 0.34 },
          { id: 'greenhouse', outerColor: 0xff80c4, innerColor: 0xffc2e2, radius: 126, alpha: 0.3 },
          { id: 'oxygen_generator', outerColor: 0x5ee0d4, innerColor: 0xb0fff4, radius: 86, alpha: 0.24 },
          { id: 'water_recycling', outerColor: 0x6cc8ff, innerColor: 0xbde8ff, radius: 86, alpha: 0.24 },
          { id: 'maintenance_facility', outerColor: 0xffad4d, innerColor: 0xffe08a, radius: 98, alpha: 0.28 },
          {
            id: 'radiation_shelter',
            outerColor: 0xffb85c,
            innerColor: 0xffe4a3,
            radius: state.crew.inShelter ? 105 : 82,
            alpha: state.crew.inShelter ? 0.34 : 0.22,
          },
          { id: 'energy_storage', outerColor: 0xffb84d, innerColor: 0xffe28a, radius: 72, alpha: 0.22 },
          { id: 'water_storage', outerColor: 0x6cc8ff, innerColor: 0xaee2ff, radius: 68, alpha: 0.18 },
          { id: 'food_storage', outerColor: 0x8be2ff, innerColor: 0xd4f4ff, radius: 68, alpha: 0.18 },
        ];

        for (const spec of groundSpecs) {
          const bState = state.buildings[spec.id];
          if (bState.status === 'inactive') continue;
          const visual = this.buildingVisuals.get(spec.id);
          if (!visual) continue;
          const factor = bState.status === 'operational' ? nf : nf * 0.48;
          this.groundLightsLayer.fillStyle(spec.outerColor, spec.alpha * 0.55 * factor);
          this.groundLightsLayer.fillCircle(visual.baseX, visual.baseY + 8, spec.radius);
          this.groundLightsLayer.fillStyle(spec.innerColor, spec.alpha * factor);
          this.groundLightsLayer.fillCircle(visual.baseX, visual.baseY + 6, spec.radius * 0.58);
        }
      }
    }

    // Twinkling multi-hue stars in outer space surrounding Mars (only when visible)
    const camZoom = this.cameras.main?.zoom ?? 1;
    if (
      camZoom < 0.62 ||
      lighting.nightFactor > 0.08 ||
      state.screen === 'INTRO_CINEMATIC' ||
      state.screen === 'TITLE_MENU'
    ) {
      for (const s of this.nightStars) {
        const twinkle = this.reducedMotion
          ? 1
          : 0.62 + 0.38 * Math.sin(this.elapsedTime * 2.1 + s.phase);
        s.circle.setAlpha(s.baseAlpha * twinkle);
      }
    }

    // Gentle overhead atmospheric light bloom + astronaut headlamps at dusk/night (keeps buildings sharp!)
    if (shouldUpdateNightLights) {
      this.outpostLightsLayer.clear();
      if (lighting.nightFactor > 0.1 && state.screen !== 'TITLE_MENU') {
        const nf = lighting.nightFactor;
        const litSpecs: Array<{
          id: BuildingId;
          color: number;
          radius: number;
          alpha: number;
        }> = [
          { id: 'main_habitat', color: 0xffd773, radius: 96, alpha: 0.16 },
          { id: 'greenhouse', color: 0xffb7df, radius: 92, alpha: 0.15 },
          { id: 'oxygen_generator', color: 0x7be0d6, radius: 66, alpha: 0.12 },
          { id: 'water_recycling', color: 0x8be2ff, radius: 66, alpha: 0.12 },
          { id: 'maintenance_facility', color: 0xffe08a, radius: 72, alpha: 0.14 },
          { id: 'radiation_shelter', color: 0xffdf99, radius: 74, alpha: state.crew.inShelter ? 0.18 : 0.11 },
        ];

        for (const spec of litSpecs) {
          const bState = state.buildings[spec.id];
          if (bState.status === 'inactive') continue;
          const visual = this.buildingVisuals.get(spec.id);
          if (!visual) continue;
          const factor = bState.status === 'operational' ? nf : nf * 0.45;
          this.outpostLightsLayer.fillStyle(spec.color, spec.alpha * factor);
          this.outpostLightsLayer.fillCircle(visual.baseX, visual.baseY, spec.radius);
        }

        // Astronaut helmet lamps + GIL cool-cyan beacon light (off once inside shelter or tucked sleeping)
        const isTuckedInside = state.crew.inShelter || state.sleepPhase === 'sleeping';
        if (this.nas && !isTuckedInside) {
          this.outpostLightsLayer.fillStyle(0xfff1bf, 0.28 * nf);
          this.outpostLightsLayer.fillCircle(this.nas.x, this.nas.y - 4, 34);
        }
        if (this.gil && !isTuckedInside) {
          this.outpostLightsLayer.fillStyle(0x8be2ff, 0.28 * nf);
          this.outpostLightsLayer.fillCircle(this.gil.x, this.gil.y, 26);
        }
        if (!isTuckedInside) {
          for (const agent of this.crewAgents) {
            this.outpostLightsLayer.fillStyle(0xfff1bf, 0.18 * nf);
            this.outpostLightsLayer.fillCircle(agent.container.x, agent.container.y - 3, 24);
          }
        }
      }
    }

    this.lastLightingNightFactor = lighting.nightFactor;
  }

  private hasBlockingGameplayOverlay(state: GameState): boolean {
    if (hasBlockingUiDialog()) return true;
    if (state.screen !== 'PLAYING') return true;
    const activeEventCentered =
      state.sleepPhase !== 'sleeping' &&
      Boolean(state.activeEvent) &&
      !state.activeEvent!.resolved &&
      state.activeEvent!.animationRemaining <= 0;
    const summaryCentered = Boolean(state.lastDaySummary);
    const gilHintCentered = Boolean(state.gilDayHint);
    const minigameCentered =
      state.pendingAction?.phase === 'working' && state.pendingAction.kind === 'task';
    return activeEventCentered || summaryCentered || gilHintCentered || minigameCentered;
  }

  private resetHeldMovementKeys() {
    if (!this.keys) return;
    Object.values(this.keys).forEach((k) => k.reset());
  }

  private syncKeyboardInputState(state: GameState): boolean {
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const canUseKeyboard =
      state.screen === 'PLAYING' &&
      !this.isPaused &&
      !isEditableTarget(activeEl) &&
      !this.hasBlockingGameplayOverlay(state);

    if (this.input.keyboard) {
      this.input.keyboard.enabled = canUseKeyboard;
    }
    if (!canUseKeyboard) {
      this.resetHeldMovementKeys();
    }
    return canUseKeyboard;
  }

  private setupCameraAndInput() {
    this.input.addPointer(1);
    const canvas = this.game.canvas;
    if (canvas) {
      canvas.setAttribute('tabindex', '-1');
      canvas.style.outline = 'none';
    }

    if (this.input.keyboard) {
      this.keys = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W, false),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A, false),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S, false),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D, false),
        UP: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP, false),
        LEFT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT, false),
        DOWN: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN, false),
        RIGHT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT, false),
      };
      this.input.keyboard.clearCaptures();

      this.windowBlurHandler = () => {
        this.resetHeldMovementKeys();
      };
      window.addEventListener('blur', this.windowBlurHandler);
    }

    const startPinchIfReady = () => {
      if (this.activePointers.size < 2) return;
      const pts = Array.from(this.activePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const cam = this.cameras.main;
      if (!cam) return;
      this.tweens.killTweensOf(cam);
      this.isPinching = true;
      this.isDragging = false;
      this.wasDragged = true;
      this.pinchStartDist = Math.max(12, Math.hypot(p2.x - p1.x, p2.y - p1.y));
      this.pinchStartZoom = cam.zoom;
      const midX = (p1.x + p2.x) * 0.5;
      const midY = (p1.y + p2.y) * 0.5;
      this.pinchAnchorWorldX =
        cam.scrollX + cam.width * 0.5 + (midX - cam.width * 0.5) / cam.zoom;
      this.pinchAnchorWorldY =
        cam.scrollY + cam.height * 0.5 + (midY - cam.height * 0.5) / cam.zoom;
      for (const visual of this.buildingVisuals.values()) {
        visual.container.setScale(1);
      }
      this.rocketHovered = false;
      this.introLander?.setScale(1);
      this.drawRocketHighlight(this.rocketSelected, 1);
    };

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const currentState = gameStore.getState();
      if (currentState.screen !== 'PLAYING' || this.hasBlockingGameplayOverlay(currentState)) {
        return;
      }
      focusGameplayCanvas();
      this.activePointers.set(pointer.id, { x: pointer.x, y: pointer.y });

      if (this.activePointers.size >= 2) {
        startPinchIfReady();
        return;
      }

      this.isPinching = false;
      this.isDragging = true;
      this.activePointerId = pointer.id;
      this.wasDragged = false;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.camStartX = this.cameras.main.scrollX;
      this.camStartY = this.cameras.main.scrollY;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.activePointers.has(pointer.id) && pointer.isDown) {
        this.activePointers.set(pointer.id, { x: pointer.x, y: pointer.y });
      }

      if (this.isPinching && this.activePointers.size >= 2) {
        const pts = Array.from(this.activePointers.values());
        const p1 = pts[0];
        const p2 = pts[1];
        const cam = this.cameras.main;
        if (!cam) return;
        const dpr = this.getCanvasDpr();
        const dist = Math.max(12, Math.hypot(p2.x - p1.x, p2.y - p1.y));
        const midX = (p1.x + p2.x) * 0.5;
        const midY = (p1.y + p2.y) * 0.5;
        const nextZoom = Phaser.Math.Clamp(
          this.pinchStartZoom * (dist / this.pinchStartDist),
          this.getMinZoom(),
          1.45 * dpr
        );
        cam.setZoom(nextZoom);
        cam.scrollX =
          this.pinchAnchorWorldX - cam.width * 0.5 - (midX - cam.width * 0.5) / nextZoom;
        cam.scrollY =
          this.pinchAnchorWorldY - cam.height * 0.5 - (midY - cam.height * 0.5) / nextZoom;
        this.clampCameraScroll();
        return;
      }

      if (!this.isDragging || pointer.id !== this.activePointerId || !pointer.isDown) return;
      const dx = pointer.x - this.dragStartX;
      const dy = pointer.y - this.dragStartY;
      const dragThreshold = (pointer.wasTouch ? 12 : 7) * this.getCanvasDpr();
      if (Math.hypot(dx, dy) > dragThreshold) {
        if (!this.wasDragged) {
          this.wasDragged = true;
          this.input.setDefaultCursor('grabbing');
          for (const visual of this.buildingVisuals.values()) {
            visual.container.setScale(1);
          }
          this.rocketHovered = false;
          this.introLander?.setScale(1);
          this.drawRocketHighlight(this.rocketSelected, 1);
        }
      }
      if (this.wasDragged) {
        const zoom = this.cameras.main.zoom;
        this.cameras.main.scrollX = this.camStartX - dx / zoom;
        this.cameras.main.scrollY = this.camStartY - dy / zoom;
        this.clampCameraScroll();
      }
    });

    const endDrag = (pointer?: Phaser.Input.Pointer, currentlyOver?: unknown[]) => {
      if (!pointer) {
        this.activePointers.clear();
        this.isPinching = false;
        this.isDragging = false;
        this.activePointerId = null;
        this.input.setDefaultCursor('default');
        return;
      }

      this.activePointers.delete(pointer.id);

      if (this.isPinching) {
        if (this.activePointers.size === 1) {
          const remaining = Array.from(this.activePointers.entries())[0];
          this.isPinching = false;
          this.isDragging = true;
          this.wasDragged = true;
          this.activePointerId = remaining[0];
          this.dragStartX = remaining[1].x;
          this.dragStartY = remaining[1].y;
          this.camStartX = this.cameras.main.scrollX;
          this.camStartY = this.cameras.main.scrollY;
        } else if (this.activePointers.size === 0) {
          this.isPinching = false;
          this.isDragging = false;
          this.activePointerId = null;
          this.input.setDefaultCursor('default');
        }
        return;
      }

      if (this.activePointerId !== null && pointer.id !== this.activePointerId) return;
      const currentState = gameStore.getState();
      const overlayBlocking = this.hasBlockingGameplayOverlay(currentState);
      if (
        !overlayBlocking &&
        !this.wasDragged &&
        currentState.screen === 'PLAYING' &&
        currentState.activeEvent &&
        currentState.activeEvent.animationRemaining > 0
      ) {
        this.spawnEventTapRipple(pointer.worldX, pointer.worldY, currentState.activeEvent.definition.id);
        soundFX.playEnvironmentEventCue(currentState.activeEvent.definition.phenomenon);
      }
      const shouldDeselect =
        !overlayBlocking &&
        !this.wasDragged &&
        Array.isArray(currentlyOver) &&
        currentlyOver.length === 0 &&
        currentState.screen === 'PLAYING' &&
        currentState.selectedBuildingId !== null;
      this.isDragging = false;
      this.activePointerId = null;
      this.input.setDefaultCursor('default');
      if (shouldDeselect) {
        gameStore.selectBuilding(null);
      }
    };

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer, currentlyOver: unknown[]) =>
      endDrag(pointer, currentlyOver)
    );
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => endDrag(pointer));
    this.input.on('gameout', () => endDrag());

    this.input.on(
      'wheel',
      (_pointer: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
        const currentState = gameStore.getState();
        if (currentState.screen !== 'PLAYING' || this.hasBlockingGameplayOverlay(currentState)) {
          return;
        }
        const cam = this.cameras.main;
        const dpr = this.getCanvasDpr();
        const nextZoom = Phaser.Math.Clamp(cam.zoom - dy * 0.0008 * dpr, this.getMinZoom(), 1.45 * dpr);
        cam.setZoom(nextZoom);
        this.clampCameraScroll();
      }
    );
  }

  private getSolarOutputFactor(
    state: GameState,
    lighting: ReturnType<OutpostScene['computeDayNightLighting']>
  ): number {
    const solar = state.buildings.solar_panels;
    if (solar.status === 'inactive') return 0;
    const condFactor = Phaser.Math.Clamp(solar.condition / 100, 0.25, 1);
    const dustFactor = Phaser.Math.Clamp(1 - solar.dustLevel * 0.0055, 0.4, 1);
    const sunFactor = Phaser.Math.Clamp(1 - lighting.nightFactor * 0.85, 0.15, 1);
    const stormFactor = state.activeEvent?.definition.solarPenaltyFactor
      ? Math.max(0.2, 1 - state.activeEvent.definition.solarPenaltyFactor)
      : 1;
    return Phaser.Math.Clamp(condFactor * dustFactor * sunFactor * stormFactor, 0.1, 1);
  }

  private getStorageStatsForBuilding(
    state: GameState,
    id: BuildingId
  ): { current: number; capacity: number; ratio: number } | null {
    const map = {
      energy_storage: 'energy',
      oxygen_storage: 'oxygen',
      water_storage: 'water',
      food_storage: 'food',
    } as const;
    if (!(id in map)) return null;
    const resKey = map[id as keyof typeof map];
    const current = Math.max(0, state.resources[resKey]);
    const capacity = Math.max(1, state.capacities[resKey]);
    return {
      current,
      capacity,
      ratio: Phaser.Math.Clamp(current / capacity, 0, 1),
    };
  }

  private buildBuildingDrawExtra(
    state: GameState,
    id: BuildingId,
    lighting: ReturnType<OutpostScene['computeDayNightLighting']>,
    isSleeping: boolean,
    hasPowerForLifeSupport: boolean,
    solarOutputFactor: number
  ): BuildingDrawExtra {
    const def = BUILDING_DEFINITIONS[id];
    const storageStats = this.getStorageStatsForBuilding(state, id);
    const isWorkingHere =
      state.pendingAction?.phase === 'working' && state.pendingAction.buildingId === id;
    const isLocked = !getBuildingUnlockStatus(id, state).unlocked;

    return {
      inShelter: state.crew.inShelter,
      isSleeping,
      isRepairing: isWorkingHere,
      isLocked,
      repairTaskKind: isWorkingHere ? state.pendingAction?.taskKind : undefined,
      hasPower: def.requiresPower
        ? hasPowerForLifeSupport
        : id === 'solar_panels'
        ? solarOutputFactor > 0.08
        : true,
      solarOutputFactor,
      storageCurrent: storageStats?.current,
      storageCapacity: storageStats?.capacity,
      hasActiveCrop: Boolean(state.greenhouseCrop && !state.greenhouseCrop.isMature),
      shadowDx: lighting.shadowDx,
      shadowDy: lighting.shadowDy,
      shadowAlpha: lighting.shadowAlpha,
      shadowColor: lighting.shadowColor,
      nightFactor: lighting.nightFactor,
      sunBias: lighting.sunBias,
      rimColor: lighting.rimColor,
      rimAlpha: lighting.rimAlpha,
    };
  }

  private syncWithGameState(state: GameState) {
    const lighting = this.computeDayNightLighting(this.displayHours);
    const rates = calculateDailyRates({
      buildings: state.buildings,
      currentResources: state.resources,
      greenhouseCrop: state.greenhouseCrop,
      activeEvent: state.activeEvent,
      modifiers: state.modifiers,
      difficulty: state.difficulty,
    });
    const solarOutputFactor = this.getSolarOutputFactor(state, lighting);
    const isSleeping =
      state.sleepPhase === 'sleeping' ||
      (state.sleepPhase === 'idle' && state.sleepingRemaining > 0);

    for (const def of BUILDING_LIST) {
      const visual = this.buildingVisuals.get(def.id);
      if (!visual) continue;

      const bState = state.buildings[def.id];
      const isLocked = !getBuildingUnlockStatus(def.id, state).unlocked;
      visual.container.setAlpha(isLocked ? 0.78 : 1);

      drawBuildingGraphics(
        visual.graphics,
        def.id,
        visual.width,
        visual.height,
        bState,
        def.id === 'greenhouse' ? state.greenhouseCrop : null,
        this.elapsedTime,
        this.buildBuildingDrawExtra(
          state,
          def.id,
          lighting,
          isSleeping,
          rates.hasPowerForLifeSupport,
          solarOutputFactor
        )
      );

      // Selection highlight ring (drawn cleanly and animated in update loop)
      this.drawSelectionHighlight(visual, state.selectedBuildingId === def.id && state.screen === 'PLAYING', 1);

      // Clear kid-friendly icon/short state tag above buildings needing attention
      const needsRestorationFirst = !bState.restoredOnce || bState.status === 'inactive';
      const pendingAtThis =
        state.pendingAction?.buildingId === def.id ? state.pendingAction : null;
      const storageStats = this.getStorageStatsForBuilding(state, def.id);

      if (pendingAtThis?.phase === 'working' || visual.restoringUntil > this.elapsedTime) {
        const k = pendingAtThis?.taskKind ?? this.activeWorkAnim?.kind;
        visual.statusTag.setText(
          k === 'plant'
            ? 'Planting...'
            : k === 'harvest'
            ? 'Harvesting...'
            : k === 'clean'
            ? 'Cleaning...'
            : 'Fixing...'
        );
        visual.statusTag.setColor('#FAF0DC');
        visual.statusTag.setBackgroundColor('#477C9B');
        visual.statusTag.setVisible(true);
      } else if (pendingAtThis?.phase === 'walking') {
        visual.statusTag.setText('On Way...');
        visual.statusTag.setColor('#FAF0DC');
        visual.statusTag.setBackgroundColor('#718B78');
        visual.statusTag.setVisible(true);
      } else if (isLocked) {
        visual.statusTag.setText('Locked');
        visual.statusTag.setColor('#FAF0DC');
        visual.statusTag.setBackgroundColor('#4B4846');
        visual.statusTag.setVisible(true);
      } else if (needsRestorationFirst) {
        visual.statusTag.setText('Fix');
        visual.statusTag.setColor('#F1D8A8');
        visual.statusTag.setBackgroundColor(
          bState.status === 'inactive' ? '#5C524C' : '#825D45'
        );
        visual.statusTag.setVisible(true);
      } else if (bState.status === 'damaged') {
        visual.statusTag.setText(`Repair ${bState.condition}%`);
        visual.statusTag.setColor('#FAF0DC');
        visual.statusTag.setBackgroundColor('#825D45');
        visual.statusTag.setVisible(true);
      } else if (def.id === 'solar_panels' && bState.dustLevel >= 35) {
        visual.statusTag.setText('Dust');
        visual.statusTag.setColor('#FAF0DC');
        visual.statusTag.setBackgroundColor('#9E6A44');
        visual.statusTag.setVisible(true);
      } else if (def.id === 'greenhouse' && state.greenhouseCrop?.isMature) {
        visual.statusTag.setText('Harvest!');
        visual.statusTag.setColor('#FAF0DC');
        visual.statusTag.setBackgroundColor('#718B78');
        visual.statusTag.setVisible(true);
      } else if (storageStats && storageStats.ratio >= 0.85) {
        visual.statusTag.setText(
          storageStats.ratio >= 0.99 ? 'Full 100%' : `${Math.round(storageStats.ratio * 100)}% Cap`
        );
        visual.statusTag.setColor('#292C2B');
        visual.statusTag.setBackgroundColor('#F4C552');
        visual.statusTag.setVisible(true);
      } else {
        visual.statusTag.setVisible(false);
      }
    }

    this.renderInfrastructureConduits(state, lighting, rates.hasPowerForLifeSupport, solarOutputFactor);

    // Event transition triggers (weather tint rendered smoothly in update())
    const activeEvent = state.activeEvent;
    const eventKey = activeEvent
      ? `${activeEvent.dayTriggered}:${activeEvent.definition.id}`
      : null;

    if (eventKey !== this.lastActiveEventKey) {
      this.lastActiveEventKey = eventKey;
      if (activeEvent?.definition.id === 'marsquake') {
        this.triggerQuakeBurst();
      } else {
        this.quakeEndAt = 0;
      }
    }

    this.renderEnvironmentalScars(state.environmentalScars);

    const shouldPause = state.screen === 'PAUSED';
    if (shouldPause !== this.isPaused) {
      this.isPaused = shouldPause;
      if (shouldPause) {
        this.tweens.pauseAll();
        this.time.paused = true;
        this.isDragging = false;
        this.activePointerId = null;
        if (this.keys) {
          Object.values(this.keys).forEach((k) => k.reset());
        }
        this.input.setDefaultCursor('default');
      } else {
        this.tweens.resumeAll();
        this.time.paused = false;
      }
    }

    if (state.screen === 'PLAYING' && this.lastScreen === 'TITLE_MENU') {
      this.landingDisembarkActive = false;
      this.setCrewVisibility(true);
      this.placeCrewAtMorningPost();
      this.syncLandedRocketState(state);
      this.centerCameraOnOutpost();
      this.input.setDefaultCursor('default');
      focusGameplayCanvas();
    } else if (state.screen === 'PLAYING' && this.lastScreen === 'INTRO_CINEMATIC') {
      const quickSnap = this.introWasSkipped || this.introStage < 4 || this.reducedMotion;
      this.introWasSkipped = false;
      this.setCrewVisibility(true);
      this.input.setDefaultCursor('default');
      focusGameplayCanvas();
      if (quickSnap) {
        this.landingDisembarkActive = false;
        this.placeCrewAtMorningPost();
        this.syncLandedRocketState(state);
        this.tweens.killTweensOf(this.cameras.main);
        this.centerCameraOnOutpost();
      } else {
        this.syncLandedRocketState(state);
        // Smooth transition: let running crew finish stepping into courtyard while camera settles
        const cam = this.cameras.main;
        const targetZoom = this.getOutpostFitZoom();
        const targetX = WORLD_WIDTH / 2 + 56;
        const targetY = WORLD_HEIGHT / 2;
        this.tweens.killTweensOf(cam);
        this.tweens.add({
          targets: cam,
          zoom: targetZoom,
          duration: 900,
          ease: 'Sine.easeOut',
          onUpdate: () => {
            cam.centerOn(
              Phaser.Math.Linear(cam.midPoint.x, targetX, 0.14),
              Phaser.Math.Linear(cam.midPoint.y, targetY, 0.14)
            );
            this.clampCameraScroll();
          },
          onComplete: () => {
            this.centerCameraOnOutpost();
          },
        });
      }
    } else if (state.screen === 'TITLE_MENU') {
      this.landingDisembarkActive = false;
      this.endingStagedKey = null;
      this.endingEvacStarted = false;
      this.setCrewVisibility(true);
      this.syncLandedRocketState(state);
    } else if (
      (state.screen === 'MISSION_REPORT' || state.screen === 'GAME_OVER') &&
      !state.endingCutsceneCompleted
    ) {
      this.syncEndingChoreography(state);
    } else if (state.screen !== 'INTRO_CINEMATIC') {
      this.endingStagedKey = null;
      this.endingEvacStarted = false;
      this.syncLandedRocketState(state);
    }
    this.lastScreen = state.screen;
    this.syncKeyboardInputState(state);

    if (state.crew.inShelter && state.sleepPhase === 'idle' && state.sleepingRemaining <= 0) {
      const shelterBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.radiation_shelter);
      const nasSlot = this.getShelterSlots(shelterBounds)[0];
      if (
        this.nas &&
        this.nasPath.length === 0 &&
        Math.hypot(this.nas.x - nasSlot.x, this.nas.y - nasSlot.y) > 4
      ) {
        this.setNasDestination(nasSlot.x, nasSlot.y, 'radiation_shelter');
      }
    }
  }

  private getShelterSlots(bounds: { centerX: number; centerY: number }): Point2D[] {
    return [
      { x: bounds.centerX, y: bounds.centerY - 22 },
      { x: bounds.centerX - 30, y: bounds.centerY - 12 },
      { x: bounds.centerX + 30, y: bounds.centerY - 12 },
      { x: bounds.centerX - 20, y: bounds.centerY + 22 },
      { x: bounds.centerX + 20, y: bounds.centerY + 22 },
    ];
  }

  private getHabitatSleepSlots(bounds: { centerX: number; centerY: number }): Point2D[] {
    return [
      { x: bounds.centerX - 54, y: bounds.centerY - 34 },
      { x: bounds.centerX - 54, y: bounds.centerY + 18 },
      { x: bounds.centerX + 54, y: bounds.centerY - 34 },
      { x: bounds.centerX + 54, y: bounds.centerY + 18 },
      { x: bounds.centerX, y: bounds.centerY - 44 },
    ];
  }

  private isInsideBuildingFootprint(x: number, y: number, buildingId: BuildingId): boolean {
    const b = gridManager.getBuildingBounds(BUILDING_DEFINITIONS[buildingId]);
    return x >= b.x - 10 && x <= b.x + b.width + 10 && y >= b.y - 10 && y <= b.y + b.height + 10;
  }

  private isShelteredDuringActiveEvent(state: GameState): boolean {
    return Boolean(
      state.crew.inShelter &&
        isShelterRequiredEvent(state.activeEvent) &&
        isEventOfficiallyActive(state.activeEvent)
    );
  }

  private buildCharacterPath(
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
    allowInsideBuildingId?: BuildingId
  ): { path: Point2D[]; permitBuildingId?: BuildingId } {
    let curInside: BuildingId | undefined = undefined;
    if (this.isInsideBuildingFootprint(startX, startY, 'radiation_shelter')) {
      curInside = 'radiation_shelter';
    } else if (this.isInsideBuildingFootprint(startX, startY, 'main_habitat')) {
      curInside = 'main_habitat';
    }

    // If entering an interior building, walk cleanly around obstacles to its airlock doorstep first
    if (allowInsideBuildingId) {
      if (curInside === allowInsideBuildingId) {
        return { path: [{ x: goalX, y: goalY }], permitBuildingId: allowInsideBuildingId };
      }
      const targetDoor = gridManager.getBuildingDoorstep(allowInsideBuildingId, startX, startY);
      if (curInside && curInside !== allowInsideBuildingId) {
        const exitDoor = gridManager.getBuildingDoorstep(curInside);
        const between = gridManager.findPath(exitDoor.x, exitDoor.y, targetDoor.x, targetDoor.y);
        return {
          path: [exitDoor, ...between, { x: goalX, y: goalY }],
          permitBuildingId: allowInsideBuildingId,
        };
      }
      const outsidePath = gridManager.findPath(startX, startY, targetDoor.x, targetDoor.y);
      return {
        path: [...outsidePath, { x: goalX, y: goalY }],
        permitBuildingId: allowInsideBuildingId,
      };
    }

    // Leaving an interior building to an outdoor location: step out airlock first
    if (curInside) {
      const exitDoor = gridManager.getBuildingDoorstep(curInside);
      const rest = gridManager.findPath(exitDoor.x, exitDoor.y, goalX, goalY);
      return {
        path: [exitDoor, ...rest],
        permitBuildingId: curInside,
      };
    }

    return {
      path: gridManager.findPath(startX, startY, goalX, goalY),
      permitBuildingId: undefined,
    };
  }

  private setNasDestination(goalX: number, goalY: number, allowInsideBuildingId?: BuildingId) {
    if (!this.nas) return;
    const built = this.buildCharacterPath(
      this.nas.x,
      this.nas.y,
      goalX,
      goalY,
      allowInsideBuildingId
    );
    this.nasPath = built.path;
    this.nasAllowInsideBuildingId = built.permitBuildingId;
  }

  private setAgentDestination(
    agent: CrewAgent,
    goalX: number,
    goalY: number,
    allowInsideBuildingId?: BuildingId
  ) {
    if (!agent.container) return;
    const built = this.buildCharacterPath(
      agent.container.x,
      agent.container.y,
      goalX,
      goalY,
      allowInsideBuildingId
    );
    agent.path = built.path;
    agent.allowInsideBuildingId = built.permitBuildingId;
  }

  private sendCrewToSleepInHabitat() {
    const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
    const sleepSlots = this.getHabitatSleepSlots(habBounds);
    if (this.nas) {
      this.setNasDestination(sleepSlots[0].x, sleepSlots[0].y, 'main_habitat');
    }
    this.crewAgents.forEach((agent, idx) => {
      const slot = sleepSlots[idx + 1] ?? sleepSlots[0];
      this.setAgentDestination(agent, slot.x, slot.y, 'main_habitat');
      agent.waitUntil = this.elapsedTime + 999;
    });
  }

  private placeCrewAtMorningPost() {
    const state = gameStore.getState();
    if (state.crew.inShelter) return;
    const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
    const frontY = habBounds.y + habBounds.height + 24;
    if (this.nas) {
      this.nas.setPosition(habBounds.centerX - 10, frontY);
      this.nas.setScale(1.08);
      this.nas.setAlpha(1);
      this.nasPath = [];
      this.nasAllowInsideBuildingId = undefined;
      this.nasStuckElapsed = 0;
      this.nasLastX = this.nas.x;
      this.nasLastY = this.nas.y;
    }
    if (this.gil) {
      this.gil.setPosition(habBounds.centerX + 26, frontY - 18);
      this.gil.setScale(1);
      this.gil.setAlpha(1);
    }
    const offsets = [-96, -54, 46, 94];
    this.crewAgents.forEach((agent, i) => {
      const safePos = gridManager.pushOutOfBuildings(
        habBounds.centerX + (offsets[i] ?? 0),
        frontY - (i === 3 ? 4 : i === 1 ? -4 : 0),
        BUILDING_CLEARANCE
      );
      agent.container.setPosition(safePos.x, safePos.y);
      agent.container.setScale(0.92);
      agent.container.setAlpha(1);
      agent.path = [];
      agent.allowInsideBuildingId = undefined;
      agent.stuckElapsed = 0;
      agent.lastX = safePos.x;
      agent.lastY = safePos.y;
      agent.taskUntil = 0;
      agent.waitUntil = this.elapsedTime + 1.1 + i * 0.85;
    });
  }

  private syncEndingChoreography(state: GameState) {
    const isEndingCutscene =
      (state.screen === 'MISSION_REPORT' || state.screen === 'GAME_OVER') &&
      !state.endingCutsceneCompleted;
    if (!isEndingCutscene) return;

    const kind = this.activeEndingKind ?? (state.screen === 'GAME_OVER' ? 'fail_condition' : 'victory_improvements');
    const stageKey = `${state.screen}:${kind}`;
    const isVictory = kind === 'victory_sustainable' || kind === 'victory_improvements';
    const isEarlyFailure = kind.startsWith('fail_');
    const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
    const frontY = habBounds.y + habBounds.height + (isVictory ? 30 : 24);

    if (this.endingStagedKey !== stageKey) {
      this.endingStagedKey = stageKey;
      this.endingEvacStarted = false;
      this.setCrewVisibility(true);

      const nasStart = gridManager.pushOutOfBuildings(
        habBounds.centerX,
        frontY + (isVictory ? 4 : 0),
        BUILDING_CLEARANCE
      );
      if (this.nas) {
        this.nas.setPosition(nasStart.x, nasStart.y);
        this.nas.setScale(1.08);
        this.nas.setAlpha(1);
        this.nasPath = [];
        this.nasAllowInsideBuildingId = undefined;
        this.nasStuckElapsed = 0;
        this.nasLastX = nasStart.x;
        this.nasLastY = nasStart.y;
        this.playerIdleStrolling = false;
        this.playerIdleWaitUntil = this.elapsedTime + 999;
      }

      if (this.gil) {
        this.gil.setPosition(nasStart.x + 34, nasStart.y - 20);
        this.gil.setScale(1);
        this.gil.setAlpha(1);
      }

      const offsets = isVictory ? [-90, -44, 44, 90] : [-72, -32, 32, 72];
      const yOffsets = isVictory ? [-6, 4, 4, -6] : [-2, 4, 4, -2];
      this.crewAgents.forEach((agent, i) => {
        const safePos = gridManager.pushOutOfBuildings(
          habBounds.centerX + (offsets[i] ?? 0),
          frontY + (yOffsets[i] ?? 0),
          BUILDING_CLEARANCE
        );
        agent.container.setPosition(safePos.x, safePos.y);
        agent.container.setScale(isVictory ? 0.96 : 0.92);
        agent.container.setAlpha(1);
        agent.path = [];
        agent.allowInsideBuildingId = undefined;
        agent.stuckElapsed = 0;
        agent.lastX = safePos.x;
        agent.lastY = safePos.y;
        agent.taskUntil = 0;
        agent.waitUntil = this.elapsedTime + 999;
        agent.idleActivity = isVictory ? 'waving' : i % 2 === 0 ? 'looking_around' : 'resting';
      });
    }

    // Keep the landed spacecraft permanently visible at its landing site across all ending beats,
    // and guide crew calmly toward boarding on the final evacuation beat of early-failure endings
    this.syncLandedRocketState(state);
    if (isEarlyFailure && this.endingIsFinalBeat && !this.endingEvacStarted && !this.reducedMotion) {
      this.endingEvacStarted = true;
      const rimX = WORLD_WIDTH - 46;
      const rimY = 398;
      if (this.nas) {
        this.setNasDestination(rimX, rimY);
      }
      this.crewAgents.forEach((agent, i) => {
        const safeGoal = gridManager.pushOutOfBuildings(
          rimX - 24 - i * 18,
          rimY + (i - 1.5) * 18,
          BUILDING_CLEARANCE
        );
        this.setAgentDestination(agent, safeGoal.x, safeGoal.y);
      });
    }
  }

  private runNasToBuilding(buildingId: BuildingId) {
    const st = gameStore.getState();
    if (st.sleepPhase !== 'idle' || st.sleepingRemaining > 0) return;
    this.playerIdleStrolling = false;
    this.playerIdleWaitUntil = this.elapsedTime + 5.5;
    const doorstep = gridManager.getBuildingDoorstep(buildingId, this.nas?.x, this.nas?.y);
    this.setNasDestination(doorstep.x, doorstep.y);
  }

  private handleWorldFeedback(evt: WorldFeedbackEvent) {
    if (evt.type === 'task_assigned') {
      this.activeWorkAnim = null;
      this.runNasToBuilding(evt.buildingId);

      // Have the nearest free crew helper walk nearby around obstacles to assist
      const helper = this.crewAgents[0];
      const st = gameStore.getState();
      if (helper && !st.crew.inShelter && st.sleepPhase === 'idle' && st.sleepingRemaining <= 0) {
        const door = gridManager.getBuildingDoorstep(
          evt.buildingId,
          helper.container.x,
          helper.container.y
        );
        const safeAssist = gridManager.pushOutOfBuildings(door.x + 28, door.y, BUILDING_CLEARANCE);
        this.setAgentDestination(helper, safeAssist.x, safeAssist.y);
        helper.waitUntil = this.elapsedTime + 4.2;
      }
    } else if (evt.type === 'work_started') {
      this.activeWorkAnim = {
        buildingId: evt.buildingId,
        kind: evt.taskKind,
        startedAt: this.elapsedTime,
        duration: evt.duration,
        label: evt.label,
      };

      const visual = this.buildingVisuals.get(evt.buildingId);
      if (visual) {
        visual.restoringUntil = this.elapsedTime + evt.duration;
        visual.statusTag.setText(
          evt.taskKind === 'plant'
            ? 'Planting...'
            : evt.taskKind === 'harvest'
            ? 'Harvesting...'
            : evt.taskKind === 'clean'
            ? 'Cleaning...'
            : 'Building...'
        );
        visual.statusTag.setBackgroundColor('#477C9B');
        visual.statusTag.setVisible(true);

        this.tweens.add({
          targets: visual.container,
          scaleX: 1.07,
          scaleY: 1.07,
          duration: 140,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      }
    } else if (evt.type === 'task' || evt.type === 'plant' || evt.type === 'harvest') {
      const kind: ActionAnimKind =
        evt.type === 'plant'
          ? 'plant'
          : evt.type === 'harvest'
          ? 'harvest'
          : evt.taskKind ?? 'repair';

      const labelText =
        evt.type === 'harvest'
          ? `+${evt.amount} Food!`
          : evt.type === 'plant'
          ? 'Seeds Planted!'
          : kind === 'clean'
          ? 'Sparkling Clean!'
          : kind === 'restore'
          ? 'System Restored!'
          : evt.conditionGain && evt.conditionGain > 0
          ? `Repaired +${evt.conditionGain}%!`
          : 'Repaired!';

      const visual = this.buildingVisuals.get(evt.buildingId);
      this.activeWorkAnim = null;
      if (visual) {
        visual.restoringUntil = 0;
        this.triggerWorkCompletion(
          {
            buildingId: evt.buildingId,
            kind,
            startedAt: this.elapsedTime,
            duration: 0.1,
            label: labelText,
          },
          visual
        );
      }
    } else if (evt.type === 'shelter') {
      const targetDef = evt.inShelter
        ? BUILDING_DEFINITIONS.radiation_shelter
        : BUILDING_DEFINITIONS.main_habitat;
      const bounds = gridManager.getBuildingBounds(targetDef);
      if (evt.inShelter) {
        const slots = this.getShelterSlots(bounds);
        this.setNasDestination(slots[0].x, slots[0].y, 'radiation_shelter');
        this.crewAgents.forEach((agent, i) => {
          const slot = slots[i + 1] ?? slots[0];
          this.setAgentDestination(agent, slot.x, slot.y, 'radiation_shelter');
          agent.waitUntil = this.elapsedTime + 999;
        });
      } else {
        const frontY = bounds.y + bounds.height + 24;
        this.setNasDestination(bounds.centerX - 10, frontY);
        const offsets = [-96, -54, 46, 94];
        this.crewAgents.forEach((agent, i) => {
          const safeOut = gridManager.pushOutOfBuildings(
            bounds.centerX + (offsets[i] ?? 0),
            frontY - (i === 3 ? 4 : i === 1 ? -4 : 0),
            BUILDING_CLEARANCE
          );
          this.setAgentDestination(agent, safeOut.x, safeOut.y);
          agent.waitUntil = this.elapsedTime + 1.8 + i * 0.4;
        });
      }
      this.spawnCompletionBurst(bounds.centerX, bounds.centerY, 'restore', targetDef.id);
      this.spawnFloatingFeedback(
        bounds.centerX,
        bounds.centerY - 24,
        evt.inShelter ? 'Crew Safe Inside!' : 'Crew Outside!'
      );
    } else if (evt.type === 'sleep_start') {
      this.activeWorkAnim = null;
      const currentState = gameStore.getState();
      if (this.isShelteredDuringActiveEvent(currentState)) {
        const shelterBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.radiation_shelter);
        this.spawnFloatingFeedback(
          shelterBounds.centerX,
          shelterBounds.centerY - 28,
          'Sheltered — Storm Passing!'
        );
      } else {
        this.sendCrewToSleepInHabitat();
        const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
        this.spawnFloatingFeedback(habBounds.centerX, habBounds.centerY - 28, 'Heading Home to Sleep!');
      }
    } else if (evt.type === 'focus_building') {
      const def = BUILDING_DEFINITIONS[evt.buildingId];
      const bounds = gridManager.getBuildingBounds(def);
      const st = gameStore.getState();
      if (st.pendingAction?.phase !== 'walking' && st.pendingAction?.phase !== 'working') {
        this.runNasToBuilding(evt.buildingId);
      }
      const cam = this.cameras.main;
      const dpr = this.getCanvasDpr();
      const { width: cssW } = this.getViewportCssSize();
      const sheetOffsetY =
        cam && cssW < 768
          ? Math.round((cam.height * 0.16) / Math.max(0.28 * dpr, cam.zoom))
          : 0;
      cam.pan(bounds.centerX, bounds.centerY + sheetOffsetY, 320, 'Sine.easeOut', true);

      const visual = this.buildingVisuals.get(evt.buildingId);
      if (visual) {
        this.tweens.add({
          targets: visual.container,
          scaleX: 1.07,
          scaleY: 1.07,
          duration: 150,
          yoyo: true,
          ease: 'Sine.easeOut',
        });
      }
    } else if (evt.type === 'decision') {
      const impacts = evt.buildingImpacts ?? [];
      if (impacts.length > 0) {
        impacts.forEach((impact, idx) => {
          const visual = this.buildingVisuals.get(impact.buildingId);
          if (!visual) return;
          const isPositive = impact.conditionDelta >= 0;
          const label = isPositive
            ? `+${impact.conditionDelta}% Health`
            : `${impact.conditionDelta}% Health`;
          this.time.delayedCall(idx * 120, () => {
            this.spawnFloatingFeedback(
              visual.baseX,
              visual.baseY - visual.height / 2 - 14,
              label,
              isPositive ? 'success' : 'hazard'
            );
            if (isPositive) {
              this.spawnCompletionBurst(visual.baseX, visual.baseY, 'repair', impact.buildingId);
            } else {
              this.spawnDamageImpactRing(visual.baseX, visual.baseY, visual.width, visual.height);
            }
          });
        });
      } else {
        const hab = this.buildingVisuals.get('main_habitat');
        if (hab) {
          this.spawnCompletionBurst(hab.baseX, hab.baseY, 'restore', 'main_habitat');
          this.spawnFloatingFeedback(hab.baseX, hab.baseY - 24, evt.choiceTitle, 'info');
        }
      }
    } else if (evt.type === 'end_day') {
      this.placeCrewAtMorningPost();
      if (evt.buildingImpacts?.length) {
        evt.buildingImpacts.forEach((impact, idx) => {
          const visual = this.buildingVisuals.get(impact.buildingId);
          if (!visual) return;

          const msgParts: string[] = [];
          if (impact.conditionDelta < 0) msgParts.push(`${impact.conditionDelta}% Health`);
          if (impact.dustAdded && impact.dustAdded > 0) msgParts.push(`+${impact.dustAdded}% Dust`);
          if (msgParts.length > 0) {
            this.time.delayedCall(idx * 140, () => {
              this.spawnFloatingFeedback(
                visual.baseX,
                visual.baseY - visual.height / 2 - 14,
                msgParts.join(' · '),
                'warn'
              );
              this.spawnDamageImpactRing(visual.baseX, visual.baseY, visual.width, visual.height);
            });
          }
        });
      }
    } else if (evt.type === 'event_impact' && evt.buildingImpacts?.length) {
      const current = gameStore.getState();
      const sev = current.activeEvent?.definition.severity ?? 'minor';
      const phenom = current.activeEvent?.definition.phenomenon;
      const isMajorOrSuper = sev === 'major' || sev === 'super_major';
      const impactColor =
        phenom === 'water_ice_clouds'
          ? 0x7dd3fc
          : phenom === 'secondary_neutron_cascades' || phenom === 'solar_energetic_particles'
          ? 0xc084fc
          : phenom === 'solar_storm_response' || phenom === 'solar_flare_xray_uv'
          ? 0xf4c552
          : 0xe58f49;

      if (!this.reducedMotion && current.screen === 'PLAYING') {
        this.cameras.main.shake(isMajorOrSuper ? 440 : 320, isMajorOrSuper ? 0.0095 : 0.0072);
      }
      evt.buildingImpacts.forEach((impact, idx) => {
        const visual = this.buildingVisuals.get(impact.buildingId);
        if (!visual) return;

        const msgParts: string[] = [];
        if (impact.conditionDelta < 0) msgParts.push(`${impact.conditionDelta}% Health`);
        if (impact.dustAdded && impact.dustAdded > 0) msgParts.push(`+${impact.dustAdded}% Dust`);
        if (impact.frostAdded && impact.frostAdded > 0) msgParts.push(`+${impact.frostAdded}% Frost`);
        if (msgParts.length > 0) {
          this.time.delayedCall(idx * 130, () => {
            this.spawnFloatingFeedback(
              visual.baseX,
              visual.baseY - visual.height / 2 - 14,
              msgParts.join(' · '),
              'hazard'
            );
            this.spawnDamageImpactRing(
              visual.baseX,
              visual.baseY,
              visual.width,
              visual.height,
              impactColor,
              isMajorOrSuper || Boolean(impact.shutdown)
            );
          });
        }
      });
    } else if (evt.type === 'systems_unlocked') {
      evt.buildings.forEach((bId, idx) => {
        const visual = this.buildingVisuals.get(bId);
        if (!visual) return;
        this.time.delayedCall(idx * 120, () => {
          this.spawnCompletionBurst(visual.baseX, visual.baseY, 'restore', bId);
          this.spawnFloatingFeedback(
            visual.baseX,
            visual.baseY - visual.height / 2 - 16,
            'System Unlocked!',
            'success'
          );
        });
      });
    } else if (evt.type === 'crew_hazard_damage' && this.nas) {
      if (evt.reason || this.elapsedTime - this.lastHazardPopupAt >= 2.2) {
        this.lastHazardPopupAt = this.elapsedTime;
        const label = evt.reason ? `-${evt.delta}% Health (${evt.reason})` : `-${evt.delta}% Health`;
        this.spawnFloatingFeedback(this.nas.x, this.nas.y - 34, label, 'hazard');
      }
    } else if (evt.type === 'crew_health_recovery' && this.nas) {
      this.spawnFloatingFeedback(
        this.nas.x,
        this.nas.y - 34,
        `+${evt.delta}% Health`,
        'success'
      );
    } else if (evt.type === 'hazard_cleared' && this.nas) {
      this.spawnFloatingFeedback(
        this.nas.x,
        this.nas.y - 46,
        evt.labels.length > 0 ? `${evt.labels[0]} Cleared!` : 'Hazard Cleared!',
        'success'
      );
    }
  }

  private drawSelectionHighlight(visual: BuildingVisual, isSelected: boolean, pulseAlpha: number) {
    visual.selectionRing.clear();
    if (!isSelected) return;

    const hw = visual.width / 2;
    const hh = visual.height / 2;

    // Outer warm gold glow frame
    visual.selectionRing.lineStyle(6, 0xf4c552, 0.45 * pulseAlpha);
    visual.selectionRing.strokeRoundedRect(-hw - 8, -hh - 8, visual.width + 16, visual.height + 16, 14);

    // Crisp inner bright border
    visual.selectionRing.lineStyle(3.5, PALETTE.creamLight, 1);
    visual.selectionRing.strokeRoundedRect(-hw - 4, -hh - 4, visual.width + 8, visual.height + 8, 12);

    // Corner focus brackets for instant recognition
    const bLen = 12;
    const bx = hw + 9;
    const by = hh + 9;
    visual.selectionRing.lineStyle(3, 0xf4c552, 1);
    // Top-left
    visual.selectionRing.lineBetween(-bx, -by + bLen, -bx, -by);
    visual.selectionRing.lineBetween(-bx, -by, -bx + bLen, -by);
    // Top-right
    visual.selectionRing.lineBetween(bx - bLen, -by, bx, -by);
    visual.selectionRing.lineBetween(bx, -by, bx, -by + bLen);
    // Bottom-left
    visual.selectionRing.lineBetween(-bx, by - bLen, -bx, by);
    visual.selectionRing.lineBetween(-bx, by, -bx + bLen, by);
    // Bottom-right
    visual.selectionRing.lineBetween(bx - bLen, by, bx, by);
    visual.selectionRing.lineBetween(bx, by - bLen, bx, by);
  }

  private spawnFloatingFeedback(
    x: number,
    y: number,
    text: string,
    tone: 'success' | 'warn' | 'hazard' | 'info' = 'info'
  ) {
    const palette =
      tone === 'success'
        ? { color: '#2F5B3B', bg: '#E3F1E6' }
        : tone === 'warn'
        ? { color: '#9A5D12', bg: '#FFF3D6' }
        : tone === 'hazard'
        ? { color: '#B94F32', bg: '#FDE8E6' }
        : { color: '#292C2B', bg: '#FAF0DC' };

    const popup = this.add
      .text(x, y, text, {
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: palette.color,
        backgroundColor: palette.bg,
        padding: { x: 9, y: 4 },
      })
      .setOrigin(0.5)
      .setResolution(this.getTextResolution())
      .setDepth(80)
      .setScale(this.reducedMotion ? 1 : 0.86);

    if (!this.reducedMotion) {
      this.tweens.add({
        targets: popup,
        scaleX: 1.04,
        scaleY: 1.04,
        duration: 140,
        yoyo: true,
        ease: 'Back.easeOut',
      });
    }

    this.tweens.add({
      targets: popup,
      y: y - 36,
      alpha: 0,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy(),
    });
  }

  public update(_time: number, rawDeltaMs: number) {
    const state = gameStore.getState();
    if (state.screen === 'PAUSED' || this.isPaused) {
      return;
    }

    const dt = Math.min(rawDeltaMs / 1000, 0.05);
    this.elapsedTime += dt;
    const isEndingCutscene =
      (state.screen === 'MISSION_REPORT' || state.screen === 'GAME_OVER') &&
      !state.endingCutsceneCompleted;
    const isReturningToSleep = !isEndingCutscene && state.sleepPhase === 'returning';
    const isSleeping =
      !isEndingCutscene &&
      (state.sleepPhase === 'sleeping' ||
        (state.sleepPhase === 'idle' && state.sleepingRemaining > 0));
    const stormHoldingInShelter = !isEndingCutscene && this.isShelteredDuringActiveEvent(state);
    const isHeadingHome = !isEndingCutscene && !stormHoldingInShelter && (isReturningToSleep || isSleeping);
    const targetDisplayHour = isEndingCutscene
      ? this.activeEndingKind === 'victory_sustainable' || this.activeEndingKind === 'victory_improvements'
        ? 10.6
        : this.activeEndingKind === 'survived_failed'
        ? 17.5
        : 18.6
      : isHeadingHome
      ? Math.max(state.hoursElapsed, 21.0)
      : state.hoursElapsed;

    // Smoothly transition visual time-of-day toward target (snap on new day or reset)
    if (this.reducedMotion || (!isHeadingHome && !isEndingCutscene && state.hoursElapsed < this.displayHours - 0.5)) {
      this.displayHours = targetDisplayHour;
    } else {
      const lerpSpeed = isHeadingHome ? 1.45 : 1.65;
      this.displayHours = Phaser.Math.Linear(
        this.displayHours,
        targetDisplayHour,
        Math.min(1, dt * lerpSpeed)
      );
      if (Math.abs(this.displayHours - targetDisplayHour) < 0.002) {
        this.displayHours = targetDisplayHour;
      }
    }

    const lighting = this.computeDayNightLighting(this.displayHours);
    const lightingChanged = Math.abs(this.displayHours - this.lastDrawnHours) > 0.002;
    if (lightingChanged) {
      this.lastDrawnHours = this.displayHours;
    }
    this.renderDayNightCycle(state, lightingChanged);

    const rates = calculateDailyRates({
      buildings: state.buildings,
      currentResources: state.resources,
      greenhouseCrop: state.greenhouseCrop,
      activeEvent: state.activeEvent,
      modifiers: state.modifiers,
      difficulty: state.difficulty,
    });
    const solarOutputFactor = this.getSolarOutputFactor(state, lighting);

    this.renderInfrastructureConduits(state, lighting, rates.hasPowerForLifeSupport, solarOutputFactor);

    // Animate operational/damaged machinery, active repairs & shifting sun shadows
    for (const def of BUILDING_LIST) {
      const visual = this.buildingVisuals.get(def.id);
      if (!visual) continue;
      const bState = state.buildings[def.id];
      const isWorkingHere =
        state.pendingAction?.phase === 'working' && state.pendingAction.buildingId === def.id;

      if (
        bState.status === 'operational' ||
        bState.status === 'damaged' ||
        isWorkingHere ||
        lightingChanged
      ) {
        drawBuildingGraphics(
          visual.graphics,
          def.id,
          visual.width,
          visual.height,
          bState,
          def.id === 'greenhouse' ? state.greenhouseCrop : null,
          this.elapsedTime,
          this.buildBuildingDrawExtra(
            state,
            def.id,
            lighting,
            isSleeping,
            rates.hasPowerForLifeSupport,
            solarOutputFactor
          )
        );
      }

      const tutorialTargetId =
        state.screen === 'PLAYING' ? getCurrentTutorialStep(state)?.highlight : null;
      const isTutorialTarget =
        tutorialTargetId === 'solar_panels' &&
        def.id === 'solar_panels' &&
        state.selectedBuildingId !== 'solar_panels';

      if ((state.selectedBuildingId === def.id && state.screen === 'PLAYING') || isTutorialTarget) {
        const pulse = 0.65 + 0.35 * Math.sin(this.elapsedTime * 5);
        this.drawSelectionHighlight(visual, true, pulse);
      } else {
        this.drawSelectionHighlight(visual, false, 0);
      }

      visual.workBar.clear();
      const workingHere =
        state.pendingAction?.phase === 'working' && state.pendingAction.buildingId === def.id
          ? state.pendingAction
          : null;
      if (workingHere) {
        const bw = 78;
        visual.workBar.fillStyle(PALETTE.charcoal, 1);
        visual.workBar.fillRoundedRect(-bw / 2 - 2, -7, bw + 4, 14, 5);
        const barColor =
          workingHere.taskKind === 'plant' || workingHere.taskKind === 'harvest'
            ? PALETTE.lifeGreenBright
            : workingHere.taskKind === 'clean'
            ? 0xf4c552
            : PALETTE.techBlueLight;
        if (workingHere.kind === 'task' || workingHere.workDurationSec <= 0) {
          const sweep = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(this.elapsedTime * 4));
          visual.workBar.fillStyle(barColor, 0.95);
          visual.workBar.fillRoundedRect(-bw / 2, -5, Math.max(12, bw * sweep), 10, 3);
        } else {
          const pct = Math.min(
            1,
            Math.max(
              0,
              (workingHere.workDurationSec - workingHere.workRemainingSec) /
                Math.max(0.1, workingHere.workDurationSec)
            )
          );
          visual.workBar.fillStyle(barColor, 1);
          visual.workBar.fillRoundedRect(-bw / 2, -5, Math.max(6, bw * pct), 10, 3);
        }
      }
    }

    const allowKbPan = this.syncKeyboardInputState(state);
    if (state.screen === 'INTRO_CINEMATIC') {
      this.updateIntroVisuals();
    } else if (state.screen !== 'TITLE_MENU') {
      this.syncLandedRocketState(state);
      if (state.screen === 'PLAYING' && (this.rocketSelected || this.rocketHovered)) {
        const pulse = this.rocketSelected ? 0.65 + 0.35 * Math.sin(this.elapsedTime * 5) : 1;
        this.drawRocketHighlight(true, pulse);
      }
    }

    if (state.screen === 'TITLE_MENU') {
      const cam = this.cameras.main;
      const targetX = WORLD_WIDTH / 2 + 40 + Math.sin(this.elapsedTime * 0.25) * 70;
      const targetY = WORLD_HEIGHT / 2 + Math.cos(this.elapsedTime * 0.18) * 30;
      cam.centerOn(targetX, targetY);
    } else if (allowKbPan && this.keys) {
      const panSpeed = 360 * dt;
      let panned = false;
      if (this.keys.A.isDown || this.keys.LEFT.isDown) {
        this.cameras.main.scrollX -= panSpeed;
        panned = true;
      }
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) {
        this.cameras.main.scrollX += panSpeed;
        panned = true;
      }
      if (this.keys.W.isDown || this.keys.UP.isDown) {
        this.cameras.main.scrollY -= panSpeed;
        panned = true;
      }
      if (this.keys.S.isDown || this.keys.DOWN.isDown) {
        this.cameras.main.scrollY += panSpeed;
        panned = true;
      }
      if (panned) {
        this.clampCameraScroll();
      }
    }

    // Ensure returning/sleeping crew stays routed into main_habitat until all 5 enter
    if (isHeadingHome && this.nas) {
      const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
      const habSlot = this.getHabitatSleepSlots(habBounds)[0];
      if (
        this.nasAllowInsideBuildingId !== 'main_habitat' ||
        (this.nasPath.length === 0 && !this.isInsideBuildingFootprint(this.nas.x, this.nas.y, 'main_habitat'))
      ) {
        this.setNasDestination(habSlot.x, habSlot.y, 'main_habitat');
      }
    }

    // Keep player character walking to pendingAction doorstep if reassigned or blocked slightly
    if (
      state.screen === 'PLAYING' &&
      !isHeadingHome &&
      state.pendingAction?.phase === 'walking' &&
      this.nas
    ) {
      this.playerIdleStrolling = false;
      if (this.activeWalkActionId !== state.pendingAction.id) {
        this.activeWalkActionId = state.pendingAction.id;
        this.walkStuckRecoveryElapsed = 0;
      }
      const doorstep = gridManager.getBuildingDoorstep(
        state.pendingAction.buildingId,
        this.nas.x,
        this.nas.y
      );
      const distToDoor = Math.hypot(this.nas.x - doorstep.x, this.nas.y - doorstep.y);
      if ((distToDoor <= 22 && this.nasPath.length <= 1) || (this.nasPath.length === 0 && distToDoor <= 26)) {
        this.nasPath = [];
        this.walkStuckRecoveryElapsed = 0;
        gameStore.notifyCrewArrived(state.pendingAction.id);
      } else {
        if (this.nasPath.length === 0) {
          this.setNasDestination(doorstep.x, doorstep.y);
        }
        const movedRecently = Math.hypot(this.nas.x - this.nasLastX, this.nas.y - this.nasLastY);
        if (movedRecently < 0.25) {
          this.walkStuckRecoveryElapsed += dt;
          if (this.walkStuckRecoveryElapsed > 2.2) {
            const safeDoor = gridManager.pushOutOfBuildings(
              doorstep.x,
              doorstep.y,
              BUILDING_CLEARANCE
            );
            this.nas.setPosition(safeDoor.x, safeDoor.y);
            this.nasLastX = safeDoor.x;
            this.nasLastY = safeDoor.y;
            this.nasPath = [];
            this.nasAllowInsideBuildingId = undefined;
            this.walkStuckRecoveryElapsed = 0;
            gameStore.notifyCrewArrived(state.pendingAction.id);
          }
        } else {
          this.walkStuckRecoveryElapsed = 0;
        }
      }
    } else if (isHeadingHome && this.nas) {
      this.activeWalkActionId = null;
      this.walkStuckRecoveryElapsed = 0;
      const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
      const sleepSlot = this.getHabitatSleepSlots(habBounds)[0];
      const insideHab = this.isInsideBuildingFootprint(this.nas.x, this.nas.y, 'main_habitat');
      if (
        this.nasAllowInsideBuildingId !== 'main_habitat' ||
        (this.nasPath.length === 0 && !insideHab)
      ) {
        this.setNasDestination(sleepSlot.x, sleepSlot.y, 'main_habitat');
      }
    } else if (
      state.screen === 'PLAYING' &&
      !isHeadingHome &&
      !state.crew.inShelter &&
      !state.pendingAction &&
      this.nas
    ) {
      // Natural idle activities & occasional strolls for player when not assigned a task
      if (this.elapsedTime >= this.playerActivityUntil) {
        this.playerIdleActivity =
          IDLE_ACTIVITIES[Phaser.Math.Between(0, IDLE_ACTIVITIES.length - 1)];
        this.playerActivityUntil = this.elapsedTime + Phaser.Math.FloatBetween(2.6, 5.2);
      }
      if (this.nasPath.length === 0 && this.elapsedTime >= this.playerIdleWaitUntil) {
        const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
        const strollSpots: Point2D[] = [
          { x: habBounds.centerX - 10, y: habBounds.y + habBounds.height + 24 },
          { x: 468, y: 360 },
          { x: 320, y: 380 },
          { x: 640, y: 380 },
          { x: 878, y: 365 },
        ];
        const spot = strollSpots[Phaser.Math.Between(0, strollSpots.length - 1)];
        const safeSpot = gridManager.pushOutOfBuildings(
          spot.x + Phaser.Math.Between(-20, 20),
          spot.y + Phaser.Math.Between(-14, 14),
          BUILDING_CLEARANCE
        );
        this.playerIdleStrolling = true;
        this.setNasDestination(safeSpot.x, safeSpot.y);
      }
    }

    // Update player pathfinding movement + sliding obstacle collision enforcement + stuck recovery
    let nasIsRunning = false;
    let nasMoveDirX = 0;
    if (this.landingDisembarkActive && !this.landingNasEnteredGrid && this.nas) {
      // Smoothly emerge from landed spacecraft and jog westward onto the outpost rim grid
      const wp = this.nasPath[0];
      if (wp) {
        const dx = wp.x - this.nas.x;
        const dy = wp.y - this.nas.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 6) {
          nasIsRunning = true;
          nasMoveDirX = dx;
          const step = Math.min(dist, 215 * dt);
          this.nas.x += (dx / dist) * step;
          this.nas.y += (dy / dist) * step;
          this.nasLastX = this.nas.x;
          this.nasLastY = this.nas.y;
          if (!this.reducedMotion && this.elapsedTime - this.lastFootDustAt > 0.16) {
            this.lastFootDustAt = this.elapsedTime;
            this.spawnFootDust(this.nas.x, this.nas.y + 16);
          }
        }
        if (this.nas.x <= WORLD_WIDTH - 42 || dist <= 6) {
          this.landingNasEnteredGrid = true;
          if (state.pendingAction?.phase === 'walking') {
            this.runNasToBuilding(state.pendingAction.buildingId);
          } else {
            const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
            this.setNasDestination(habBounds.centerX - 10, habBounds.y + habBounds.height + 24);
          }
        }
      }
    } else if (this.nasPath.length > 0 && this.nas) {
      const nextWaypoint = this.nasPath[0];
      const dx = nextWaypoint.x - this.nas.x;
      const dy = nextWaypoint.y - this.nas.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) {
        nasIsRunning = true;
        nasMoveDirX = dx;
        const speed =
          (isEndingCutscene
            ? 112
            : isHeadingHome
            ? 320
            : this.landingDisembarkActive
            ? 215
            : this.playerIdleStrolling
            ? 138
            : 305) * dt;
        const step = Math.min(dist, speed);
        const targetX = this.nas.x + (dx / dist) * step;
        const targetY = this.nas.y + (dy / dist) * step;

        const wasInsidePermit = this.nasAllowInsideBuildingId
          ? this.isInsideBuildingFootprint(this.nas.x, this.nas.y, this.nasAllowInsideBuildingId)
          : false;

        const activeIgnoreBuildingId =
          isHeadingHome && this.isInsideBuildingFootprint(this.nas.x, this.nas.y, 'radiation_shelter')
            ? 'radiation_shelter'
            : this.nasAllowInsideBuildingId;

        const resolved = gridManager.resolveMovementStep(
          this.nas.x,
          this.nas.y,
          targetX,
          targetY,
          BUILDING_CLEARANCE,
          activeIgnoreBuildingId
        );
        this.nas.x = resolved.x;
        this.nas.y = resolved.y;

        if (
          wasInsidePermit &&
          this.nasAllowInsideBuildingId &&
          !isHeadingHome &&
          !state.crew.inShelter &&
          !this.isInsideBuildingFootprint(this.nas.x, this.nas.y, this.nasAllowInsideBuildingId)
        ) {
          this.nasAllowInsideBuildingId = undefined;
        }

        const movedDist = Math.hypot(this.nas.x - this.nasLastX, this.nas.y - this.nasLastY);
        this.nasLastX = this.nas.x;
        this.nasLastY = this.nas.y;

        if (movedDist < 0.25 && speed > 1.5) {
          this.nasStuckElapsed += dt;
          if (this.nasStuckElapsed > 0.4) {
            this.nasStuckElapsed = 0;
            const finalGoal = this.nasPath[this.nasPath.length - 1];
            const rebuilt = this.buildCharacterPath(
              this.nas.x,
              this.nas.y,
              finalGoal.x,
              finalGoal.y,
              isHeadingHome
                ? 'main_habitat'
                : state.crew.inShelter
                ? 'radiation_shelter'
                : undefined
            );
            this.nasPath = rebuilt.path;
            this.nasAllowInsideBuildingId = rebuilt.permitBuildingId;
          }
        } else {
          this.nasStuckElapsed = 0;
        }

        if (!this.reducedMotion && this.elapsedTime - this.lastFootDustAt > 0.14) {
          this.lastFootDustAt = this.elapsedTime;
          this.spawnFootDust(this.nas.x, this.nas.y + 16);
        }
      } else {
        this.nasStuckElapsed = 0;
        this.nasPath.shift();
        if (this.nasPath.length === 0) {
          this.playerIdleStrolling = false;
          this.playerIdleWaitUntil = this.elapsedTime + Phaser.Math.FloatBetween(4.2, 8.0);
          if (!isHeadingHome && !state.crew.inShelter) {
            this.nasAllowInsideBuildingId = undefined;
          }
        }
      }
    } else if (this.nas && !isHeadingHome && !state.crew.inShelter && !this.landingDisembarkActive) {
      // Ensure idle player outside buildings is never embedded inside any obstacle
      const safePos = gridManager.pushOutOfBuildings(
        this.nas.x,
        this.nas.y,
        BUILDING_CLEARANCE
      );
      this.nas.x = safePos.x;
      this.nas.y = safePos.y;
      this.nasLastX = safePos.x;
      this.nasLastY = safePos.y;
    }

    const nasInsideHabitatSleeping =
      isHeadingHome &&
      Boolean(this.nas) &&
      this.isInsideBuildingFootprint(this.nas.x, this.nas.y, 'main_habitat');

    const nasIsWorking =
      state.pendingAction?.phase === 'working' && !nasIsRunning && !isHeadingHome && !isEndingCutscene;
    const isVictoryCutscene =
      isEndingCutscene &&
      (this.activeEndingKind === 'victory_sustainable' ||
        this.activeEndingKind === 'victory_improvements');
    const nasCutsceneIdle: IdleActivity = isVictoryCutscene
      ? 'waving'
      : isEndingCutscene
      ? 'looking_around'
      : this.playerIdleActivity;

    this.animateAstronautLimbs(
      this.nas,
      nasIsRunning,
      nasIsWorking ? state.pendingAction?.taskKind ?? this.activeWorkAnim?.kind ?? null : null,
      nasMoveDirX,
      0.4,
      nasCutsceneIdle,
      isEndingCutscene ? 0.65 : 1.08,
      dt
    );

    if (this.nas && !this.reducedMotion) {
      const nasBody = this.nas.getByName('bodyGroup') as Phaser.GameObjects.Container | null;
      if (nasBody) {
        if (this.nasJumpUntil > this.elapsedTime) {
          const jumpProgress = 1 - (this.nasJumpUntil - this.elapsedTime) / 0.36;
          nasBody.y -= Math.sin(Phaser.Math.Clamp(jumpProgress, 0, 1) * Math.PI) * 14;
        } else if (isVictoryCutscene) {
          nasBody.y -= Math.max(0, Math.sin(this.elapsedTime * 5.2)) * 8;
        }
      }
    }

    if (this.nas) {
      const targetScale = nasInsideHabitatSleeping
        ? 0.66
        : state.crew.inShelter && !nasIsRunning && !isEndingCutscene
        ? 0.76
        : 1.08;
      const targetAlpha = nasInsideHabitatSleeping
        ? 0.16
        : state.crew.inShelter && !nasIsRunning && !isEndingCutscene
        ? 0.94
        : 1;
      const scaleStep = Math.min(1, dt * 8);
      this.nas.setScale(
        Phaser.Math.Linear(this.nas.scaleX, targetScale, scaleStep),
        Phaser.Math.Linear(this.nas.scaleY, targetScale, scaleStep)
      );
      this.nas.setAlpha(Phaser.Math.Linear(this.nas.alpha, targetAlpha, scaleStep));
      const nasIndicator = this.nas.getByName('nasIndicator') as Phaser.GameObjects.Graphics | null;
      if (nasIndicator) {
        nasIndicator.setVisible(!nasInsideHabitatSleeping && !isEndingCutscene);
        nasIndicator.y = Math.sin(this.elapsedTime * 4) * 3.5;
      }
    }

    // Update the 4 supporting AI crew members (Brent, MJ, Darryl, Magno)
    this.updateCrewAgents(state, dt);

    // Check if the landing disembark run has completed cleanly
    if (
      this.landingDisembarkActive &&
      this.landingNasEnteredGrid &&
      this.nasPath.length === 0 &&
      this.landingAgentMeta.every((m) => m.enteredGrid) &&
      this.crewAgents.every((a) => a.path.length === 0)
    ) {
      this.landingDisembarkActive = false;
      this.playerIdleWaitUntil = this.elapsedTime + 3.2;
      this.crewAgents.forEach((a, idx) => {
        a.waitUntil = this.elapsedTime + 1.2 + idx * 0.85;
      });
      this.syncLandedRocketState(state);
    }

    // Check if ALL 5 crew members have visibly entered Main Habitat before triggering 3s sleep!
    if (isReturningToSleep && !stormHoldingInShelter && this.nas) {
      this.returningSleepElapsed += dt;
      const nasInside =
        this.nasPath.length === 0 &&
        this.isInsideBuildingFootprint(this.nas.x, this.nas.y, 'main_habitat');
      const allAgentsInside = this.crewAgents.every(
        (agent) =>
          agent.path.length === 0 &&
          this.isInsideBuildingFootprint(agent.container.x, agent.container.y, 'main_habitat')
      );
      if (nasInside && allAgentsInside) {
        this.returningSleepElapsed = 0;
        gameStore.beginHabitatSleep();
      } else if (this.returningSleepElapsed > 4.5) {
        // Failsafe: settle any straggler at their habitat bunk so End Sol never stalls
        const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
        const sleepSlots = this.getHabitatSleepSlots(habBounds);
        if (!nasInside) {
          this.nas.setPosition(sleepSlots[0].x, sleepSlots[0].y);
          this.nasPath = [];
          this.nasAllowInsideBuildingId = 'main_habitat';
        }
        this.crewAgents.forEach((agent, idx) => {
          if (
            agent.path.length > 0 ||
            !this.isInsideBuildingFootprint(agent.container.x, agent.container.y, 'main_habitat')
          ) {
            const slot = sleepSlots[idx + 1] ?? sleepSlots[0];
            agent.container.setPosition(slot.x, slot.y);
            agent.path = [];
            agent.allowInsideBuildingId = 'main_habitat';
          }
        });
        this.returningSleepElapsed = 0;
        gameStore.beginHabitatSleep();
      }
    } else {
      this.returningSleepElapsed = 0;
    }

    // Update GIL companion smoothly following NAS, inside Habitat sleeping, or hovering inside Radiation Shelter
    const gilEmotion = getContextualGilMessage(state).emotion;
    if (this.gil && this.nas) {
      const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
      const shelterBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.radiation_shelter);
      const gilInsideHab =
        isHeadingHome && this.isInsideBuildingFootprint(this.gil.x, this.gil.y, 'main_habitat');
      const bobSpeed =
        gilEmotion === 'excited'
          ? 6.4
          : gilEmotion === 'worried'
          ? 8.0
          : gilEmotion === 'surprised'
          ? 5.5
          : 3.4;
      const bobAmp =
        gilEmotion === 'excited' ? 6.5 : gilEmotion === 'worried' ? 2.5 : 4.5;
      const worriedJitter =
        gilEmotion === 'worried' && !this.reducedMotion ? Math.sin(this.elapsedTime * 22) * 2.2 : 0;

      const targetGilX = isHeadingHome
        ? habBounds.centerX
        : state.crew.inShelter && !isEndingCutscene
        ? shelterBounds.centerX
        : this.nas.x + 36 + worriedJitter;
      const targetGilY = isHeadingHome
        ? habBounds.centerY - 12 + Math.sin(this.elapsedTime * 2.2) * 2.0
        : state.crew.inShelter && !isEndingCutscene
        ? shelterBounds.centerY - 2 + Math.sin(this.elapsedTime * 3.4) * 3.0
        : this.nas.y - 18 + Math.sin(this.elapsedTime * bobSpeed) * bobAmp;
      const prevGilX = this.gil.x;
      this.gil.x = Phaser.Math.Linear(this.gil.x, targetGilX, 0.12);
      this.gil.y = Phaser.Math.Linear(this.gil.y, targetGilY, 0.16);
      const gilTargetScale = gilInsideHab ? 0.68 : state.crew.inShelter && !isEndingCutscene ? 0.84 : 1.0;
      const gilTargetAlpha = gilInsideHab ? 0.18 : state.crew.inShelter && !isEndingCutscene ? 0.96 : 1;
      this.gil.setScale(Phaser.Math.Linear(this.gil.scaleX, gilTargetScale, Math.min(1, dt * 8)));
      this.gil.setAlpha(Phaser.Math.Linear(this.gil.alpha, gilTargetAlpha, Math.min(1, dt * 8)));
      const gilBody = this.gil.getByName('gilBody') as Phaser.GameObjects.Container | null;
      if (gilBody) {
        const excitedTilt =
          gilEmotion === 'excited' && !this.reducedMotion ? Math.sin(this.elapsedTime * 7) * 0.12 : 0;
        gilBody.rotation =
          Phaser.Math.Clamp((this.gil.x - prevGilX) * 0.04, -0.18, 0.18) + excitedTilt;
      }
    }

    // Draw contextual building construction, planting, cleaning & repair visual animations + walking marker + sleeping Zs
    this.renderActiveWorkAnimation(isSleeping, state);

    const activeEvent = state.activeEvent;
    const activeEventId = activeEvent?.definition.id ?? null;
    const animDuration = Math.max(1, activeEvent?.animationDuration ?? 1);
    const animRemaining = activeEvent?.animationRemaining ?? 0;
    const animElapsed = Math.max(0, animDuration - animRemaining);
    const isCutsceneOngoing = Boolean(
      activeEvent &&
        !activeEvent.resolved &&
        animRemaining <= 0 &&
        !activeEvent.cutsceneCompleted &&
        activeEvent.definition.cutscene?.length
    );
    const fadeIn = Phaser.Math.Clamp(animElapsed / 1.6, 0, 1);
    const fadeOut =
      animRemaining > 0
        ? Phaser.Math.Clamp(animRemaining / 2.2, 0, 1)
        : isCutsceneOngoing
        ? 0.58
        : 0.32;
    const eventStrength = activeEvent
      ? this.reducedMotion
        ? animRemaining > 0
          ? 0.85
          : isCutsceneOngoing
          ? 0.55
          : 0.3
        : animRemaining > 0
        ? fadeIn * fadeOut
        : isCutsceneOngoing
        ? 0.58
        : 0.32
      : 0;

    // Smooth atmospheric weather tint overlay
    this.renderWeatherTint(state, eventStrength);

    const isDustStorm =
      activeEventId === 'dust_devils' ||
      activeEventId === 'global_dust_storm';
    const isGlobalStorm = activeEventId === 'global_dust_storm';
    const isDustDevils = activeEventId === 'dust_devils';
    const isQuake = activeEventId === 'marsquake';
    const isNeutronCascade = activeEventId === 'secondary_neutron_cascades';
    const isIceClouds = activeEventId === 'water_ice_cloud_formation';
    const isSolarFlare = activeEventId === 'solar_flare_xray_uv';
    const isSolarStorm = activeEventId === 'solar_storm_response';
    const isSepStorm = activeEventId === 'solar_energetic_particles';
    const isRadiation = Boolean(activeEvent?.definition.radiationLevel);

    // 15-second Marsquake tremor envelope + smooth restoration once event animation finishes
    const quakeAnimRunning = isQuake && state.screen === 'PLAYING' && animRemaining > 0;
    if (quakeAnimRunning && this.elapsedTime >= this.nextQuakeAt) {
      this.triggerQuakeBurst();
    }
    const quakeActiveNow = quakeAnimRunning && this.elapsedTime < this.quakeEndAt;
    const quakeAlpha = quakeAnimRunning
      ? Phaser.Math.Clamp(animElapsed / 1.0, 0, 1) * Phaser.Math.Clamp(animRemaining / 2.0, 0, 1)
      : 0;

    if (this.terrainRocksContainer) {
      if (quakeActiveNow && !this.reducedMotion) {
        this.terrainRocksContainer.setPosition(
          Math.sin(this.elapsedTime * 64) * 6.0 * quakeAlpha,
          Math.cos(this.elapsedTime * 54) * 4.2 * quakeAlpha
        );
      } else {
        this.terrainRocksContainer.setPosition(
          Phaser.Math.Linear(this.terrainRocksContainer.x, 0, Math.min(1, dt * 8)),
          Phaser.Math.Linear(this.terrainRocksContainer.y, 0, Math.min(1, dt * 8))
        );
      }
    }

    if (this.terrainGraphics && this.environmentalScarsLayer) {
      if (quakeActiveNow && !this.reducedMotion) {
        const tx = Math.sin(this.elapsedTime * 58) * 3.2 * quakeAlpha;
        const ty = Math.cos(this.elapsedTime * 49) * 2.4 * quakeAlpha;
        this.terrainGraphics.setPosition(tx, ty);
        this.environmentalScarsLayer.setPosition(tx, ty);
      } else {
        this.terrainGraphics.setPosition(
          Phaser.Math.Linear(this.terrainGraphics.x, 0, Math.min(1, dt * 9)),
          Phaser.Math.Linear(this.terrainGraphics.y, 0, Math.min(1, dt * 9))
        );
        this.environmentalScarsLayer.setPosition(
          Phaser.Math.Linear(this.environmentalScarsLayer.x, 0, Math.min(1, dt * 9)),
          Phaser.Math.Linear(this.environmentalScarsLayer.y, 0, Math.min(1, dt * 9))
        );
      }
    }

    const quakeTargets = new Set(isQuake ? activeEvent?.definition.targetBuildings ?? [] : []);
    for (const [bId, visual] of this.buildingVisuals.entries()) {
      if (quakeActiveNow && !this.reducedMotion) {
        const isHitTarget = quakeTargets.has(bId);
        const amp = (isHitTarget ? 7.2 : 4.2) * quakeAlpha;
        const shakeX = Math.sin(this.elapsedTime * 58 + visual.baseX * 0.1) * amp;
        const shakeY = Math.cos(this.elapsedTime * 51 + visual.baseY * 0.1) * (amp * 0.65);
        visual.container.setPosition(visual.baseX + shakeX, visual.baseY + shakeY);
        visual.container.setRotation(
          (isHitTarget ? Math.sin(this.elapsedTime * 40 + visual.baseY) * 0.036 : Math.sin(this.elapsedTime * 34) * 0.018) *
            quakeAlpha
        );
      } else {
        visual.container.setPosition(
          Phaser.Math.Linear(visual.container.x, visual.baseX, Math.min(1, dt * 9)),
          Phaser.Math.Linear(visual.container.y, visual.baseY, Math.min(1, dt * 9))
        );
        visual.container.setRotation(
          Phaser.Math.Linear(visual.container.rotation, 0, Math.min(1, dt * 9))
        );
      }
    }

    this.renderScarDustClouds(state.environmentalScars ?? []);

    if (
      state.screen === 'PLAYING' &&
      activeEvent &&
      !activeEvent.resolved &&
      animRemaining > 0 &&
      activeEventId
    ) {
      soundFX.playEventLoopPulse(activeEventId);
    }

    // Render animated non-obstructive environmental effects + building damage visuals
    this.renderEventEffects(state, {
      isGlobalStorm,
      isDustDevils,
      isQuake,
      quakeActiveNow,
      quakeAlpha,
      isNeutronCascade,
      isIceClouds,
      isSolarFlare,
      isSolarStorm,
      isSepStorm,
      isRadiation,
      eventStrength,
      animRemaining,
    });

    const meda = getMedaTelemetrySnapshot(
      state.hoursElapsed,
      state.activeEvent,
      state.buildings.solar_panels.dustLevel
    );
    const lingeringHazards = state.lingeringHazards ?? [];
    const hasLingeringDust = lingeringHazards.some((h) => h.kind === 'toxic_dust');
    const windFactor = Math.max(0.65, meda.windSpeedMs / 7.4) * (hasLingeringDust ? 1.25 : 1);
    const tauAlpha = Phaser.Math.Clamp(
      0.16 + (meda.opticalDepthTau - 0.4) * 0.11 + (hasLingeringDust ? 0.14 : 0),
      0.16,
      0.56
    );

    for (const p of this.dustParticles) {
      p.rect.x += p.speed * windFactor * dt;
      if (p.rect.x > PLANET_CX + PLANET_RADIUS - 60) {
        p.rect.x = PLANET_CX - PLANET_RADIUS + 80;
        p.rect.y = Phaser.Math.Between(PLANET_CY - 520, PLANET_CY + 520);
      }
      const distFromCenter = Math.hypot(p.rect.x - PLANET_CX, p.rect.y - PLANET_CY);
      const insideMars = distFromCenter < PLANET_RADIUS - 35;
      p.rect.setVisible(insideMars);
      if (insideMars) {
        p.rect.setAlpha(
          isDustStorm ? Math.max(tauAlpha, 0.28 + 0.42 * eventStrength) : tauAlpha
        );
      }
    }

    // Blowing storm dust streaks smoothly scaled by eventStrength & clipped to Mars globe
    const streakDensity = isGlobalStorm
      ? Math.round(this.stormStreaks.length * Math.max(0.4, eventStrength))
      : isDustDevils
      ? Math.round(22 * Math.max(0.45, eventStrength))
      : 0;
    this.stormStreaks.forEach((s, idx) => {
      const activeStreak = idx < streakDensity;
      if (activeStreak && !this.reducedMotion) {
        const speedBoost = isGlobalStorm ? 1.48 : 1.05;
        s.rect.x += s.speed * speedBoost * dt;
        s.rect.y += s.driftY * dt;
        if (s.rect.x > WORLD_WIDTH + 140 || s.rect.y > WORLD_HEIGHT + 60) {
          s.rect.x = -140;
          s.rect.y = Phaser.Math.Between(-40, WORLD_HEIGHT - 20);
        }
      }
      const distFromCenter = Math.hypot(s.rect.x - PLANET_CX, s.rect.y - PLANET_CY);
      const insideMars = distFromCenter < PLANET_RADIUS - 55;
      s.rect.setVisible(activeStreak && insideMars);
      if (activeStreak && insideMars) {
        s.rect.setAlpha((isGlobalStorm ? 0.46 : 0.36) * Math.max(0.4, eventStrength));
      }
    });

    // Water Ice Cloud Formation falling sparkling ice crystals inside Mars globe
    this.iceParticles.forEach((p, idx) => {
      if (isIceClouds && !this.reducedMotion) {
        p.circle.y += p.speedY * dt;
        p.circle.x += (p.driftX + Math.sin(this.elapsedTime * 2.5 + idx) * 14) * dt;
        if (p.circle.y > WORLD_HEIGHT + 20) {
          p.circle.y = -20;
          p.circle.x = Phaser.Math.Between(0, WORLD_WIDTH);
        }
      }
      const insideMars =
        Math.hypot(p.circle.x - PLANET_CX, p.circle.y - PLANET_CY) < PLANET_RADIUS - 35;
      p.circle.setVisible(isIceClouds && insideMars);
      if (isIceClouds && insideMars) {
        const twinkle = 0.72 + 0.28 * Math.sin(this.elapsedTime * 6 + idx);
        p.circle.setAlpha(0.84 * twinkle * Math.max(0.4, eventStrength));
      }
    });
  }

  private renderWeatherTint(state: GameState, eventStrength: number) {
    if (!this.weatherOverlay) return;
    this.weatherOverlay.clear();
    if (state.screen === 'TITLE_MENU') return;

    // Distinct ending atmosphere tints during victory/failure cutscenes
    if (
      (state.screen === 'MISSION_REPORT' || state.screen === 'GAME_OVER') &&
      !state.endingCutsceneCompleted &&
      this.activeEndingKind
    ) {
      let endColor = PALETTE.terracotta;
      let endAlpha = 0.16;
      if (this.activeEndingKind === 'victory_sustainable') {
        endColor = 0xf4c552;
        endAlpha = 0.12;
      } else if (this.activeEndingKind === 'victory_improvements') {
        endColor = 0xd77b4a;
        endAlpha = 0.11;
      } else if (this.activeEndingKind === 'survived_failed') {
        endColor = 0x7c5c48;
        endAlpha = 0.2;
      } else if (this.activeEndingKind === 'fail_oxygen') {
        endColor = 0x3b82a6;
        endAlpha = 0.24;
      } else if (this.activeEndingKind === 'fail_water') {
        endColor = 0x9a4c28;
        endAlpha = 0.22;
      } else if (this.activeEndingKind === 'fail_food') {
        endColor = 0x5c4638;
        endAlpha = 0.24;
      } else if (this.activeEndingKind === 'fail_radiation') {
        endColor = PALETTE.alertRed;
        endAlpha = 0.24;
      } else if (this.activeEndingKind === 'fail_condition') {
        endColor = 0x475569;
        endAlpha = 0.24;
      }
      this.weatherOverlay.fillStyle(endColor, endAlpha);
      this.weatherOverlay.fillCircle(PLANET_CX, PLANET_CY, PLANET_RADIUS);
      return;
    }

    const activeEvent = state.activeEvent;
    if (!activeEvent) {
      const primaryLingering = (state.lingeringHazards ?? [])[0];
      if (primaryLingering) {
        const pulse = this.reducedMotion ? 0.9 : 0.8 + 0.2 * Math.sin(this.elapsedTime * 1.6);
        const lingerColor =
          primaryLingering.kind === 'frost_haze'
            ? 0x7dd3fc
            : primaryLingering.kind === 'ionizing_particles'
            ? 0x8b5cf6
            : PALETTE.terracotta;
        const lingerAlpha =
          (primaryLingering.kind === 'ionizing_particles' ? 0.11 : 0.13) * pulse;
        this.weatherOverlay.fillStyle(lingerColor, lingerAlpha);
        this.weatherOverlay.fillCircle(PLANET_CX, PLANET_CY, PLANET_RADIUS);
      }
      return;
    }

    const id = activeEvent.definition.id;
    const sev = activeEvent.definition.severity;
    let color = PALETTE.terracotta;
    let baseAlpha = 0.15;
    const wave = this.reducedMotion ? 1 : 0.86 + 0.14 * Math.sin(this.elapsedTime * 2.8);

    if (id === 'water_ice_cloud_formation') {
      color = 0x7dd3fc;
      baseAlpha = 0.2;
    } else if (id === 'secondary_neutron_cascades') {
      color = 0x7c3aed;
      baseAlpha = 0.17;
    } else if (id === 'solar_flare_xray_uv') {
      color = 0xf59e0b;
      baseAlpha = 0.17;
    } else if (id === 'marsquake') {
      color = 0xc25432;
      baseAlpha = 0.16;
    } else if (id === 'solar_energetic_particles') {
      color = 0xbe185d;
      baseAlpha = 0.22;
    } else if (id === 'solar_storm_response') {
      color = PALETTE.alertRed;
      baseAlpha = 0.21;
    } else if (id === 'global_dust_storm') {
      color = 0xb5532c;
      baseAlpha = 0.32;
    } else if (id === 'dust_devils') {
      color = PALETTE.sand;
      baseAlpha = 0.16;
    } else if (sev === 'major') {
      baseAlpha = 0.21;
    }

    const alpha = baseAlpha * Math.max(0.32, eventStrength) * wave;
    this.weatherOverlay.fillStyle(color, alpha);
    this.weatherOverlay.fillCircle(PLANET_CX, PLANET_CY, PLANET_RADIUS);

    // Subtle glowing atmospheric rim halo around the Mars horizon matching the active phenomenon
    this.weatherOverlay.lineStyle(
      sev === 'minor' ? 8 : 14,
      color,
      Math.min(0.45, alpha * 1.45)
    );
    this.weatherOverlay.strokeCircle(PLANET_CX, PLANET_CY, PLANET_RADIUS - 4);
  }

  private renderEnvironmentalScars(scars: TerrainScar[]) {
    if (!this.environmentalScarsLayer) return;
    const key = scars.map((s) => `${s.id}:${s.severity ?? 'minor'}`).join('|');
    if (key === this.lastScarsKey) return;
    this.lastScarsKey = key;

    const g = this.environmentalScarsLayer;
    g.clear();

    for (const scar of scars) {
      const sz = scar.size;
      const isMajor = scar.severity === 'major' || scar.severity === 'super_major';
      const isSuper = scar.severity === 'super_major';

      if (scar.kind === 'quake_fissure') {
        // Multi-branching seismic ground fracture + displaced rock rubble scaled by severity
        g.lineStyle(isSuper ? 4.4 : isMajor ? 3.8 : 3.2, PALETTE.charcoal, 0.88);
        g.lineBetween(scar.x - sz, scar.y + 4, scar.x - sz * 0.25, scar.y - 6);
        g.lineBetween(scar.x - sz * 0.25, scar.y - 6, scar.x + sz * 0.35, scar.y + 8);
        g.lineBetween(scar.x + sz * 0.35, scar.y + 8, scar.x + sz, scar.y - 2);
        g.lineBetween(scar.x - sz * 0.25, scar.y - 6, scar.x - sz * 0.48, scar.y - 18);
        if (isMajor) {
          g.lineBetween(scar.x + sz * 0.35, scar.y + 8, scar.x + sz * 0.55, scar.y + 20);
          g.lineBetween(scar.x - sz * 0.6, scar.y + 2, scar.x - sz * 0.8, scar.y + 14);
        }
        g.fillStyle(PALETTE.wreckDark, 0.92);
        g.fillRect(scar.x - 12, scar.y + 8, isMajor ? 10 : 7, isMajor ? 7 : 5);
        g.fillRect(scar.x + 8, scar.y - 12, 7, 5);
        g.fillStyle(PALETTE.terracotta, 0.94);
        g.fillCircle(scar.x + 14, scar.y - 8, isMajor ? 5 : 3.8);
        if (isSuper) {
          g.fillCircle(scar.x - 20, scar.y - 6, 4.5);
        }
      } else if (scar.kind === 'solar_scorch') {
        // Charred scorch pit + bent metallic hull debris + warm ember spots
        g.fillStyle(PALETTE.charcoal, isSuper ? 0.58 : isMajor ? 0.48 : 0.38);
        g.fillEllipse(scar.x, scar.y, sz * 1.5, sz * 0.88);
        g.fillStyle(0xea580c, isMajor ? 0.42 : 0.32);
        g.fillEllipse(scar.x - 2, scar.y - 1, sz * 0.8, sz * 0.46);
        g.fillStyle(PALETTE.wreckMetal, 0.95);
        g.fillRect(scar.x + 6, scar.y + 4, 9, 5);
        if (isMajor) {
          g.fillRect(scar.x - 16, scar.y - 8, 8, 4);
        }
        g.fillStyle(0xfbbf24, 0.85);
        g.fillCircle(scar.x - 5, scar.y + 2, 2.5);
        g.fillCircle(scar.x + 9, scar.y - 4, 2);
      } else if (scar.kind === 'sep_crater') {
        // Static zap burn ring + shattered casing shards + arc scorch spokes
        g.fillStyle(0x1f2438, isMajor ? 0.56 : 0.44);
        g.fillCircle(scar.x, scar.y, sz * 0.62);
        g.lineStyle(isMajor ? 2.6 : 2, 0x8be2ff, 0.78);
        g.strokeCircle(scar.x, scar.y, sz * 0.68);
        if (isMajor) {
          g.lineStyle(2, 0xf4c552, 0.72);
          g.lineBetween(scar.x - sz * 0.5, scar.y - 4, scar.x - sz * 0.85, scar.y - 10);
          g.lineBetween(scar.x + sz * 0.45, scar.y + 5, scar.x + sz * 0.82, scar.y + 12);
        }
        g.fillStyle(PALETTE.techBlueLight, 0.94);
        g.fillTriangle(scar.x - 10, scar.y + 6, scar.x - 2, scar.y - 5, scar.x + 4, scar.y + 8);
        g.fillStyle(0xf4c552, 0.94);
        g.fillCircle(scar.x + 11, scar.y - 5, 3);
      } else if (scar.kind === 'dust_drift') {
        // Drifted terracotta/sand dunes + scattered storm debris pebbles & scrap
        g.fillStyle(PALETTE.terracotta, isSuper ? 0.82 : isMajor ? 0.72 : 0.62);
        g.fillEllipse(scar.x, scar.y, sz * 1.75, sz * 0.82);
        g.fillStyle(PALETTE.sand, isSuper ? 0.76 : 0.64);
        g.fillEllipse(scar.x - 4, scar.y - 3, sz * 1.12, sz * 0.48);
        g.fillStyle(PALETTE.wreckDark, 0.88);
        g.fillCircle(scar.x + 12, scar.y + 4, isMajor ? 4 : 3);
        g.fillCircle(scar.x - 14, scar.y + 3, isMajor ? 3.5 : 2.5);
        if (isSuper) {
          g.fillRect(scar.x - 3, scar.y + 6, 9, 4);
        }
      }
    }
  }

  private renderScarDustClouds(scars: TerrainScar[]) {
    if (!this.scarDustLayer) return;
    const g = this.scarDustLayer;
    g.clear();
    if (this.reducedMotion) return;

    for (let i = 0; i < scars.length; i++) {
      const scar = scars[i];
      const isHeavy = scar.severity === 'major' || scar.severity === 'super_major';
      if (scar.kind === 'dust_drift' || scar.kind === 'quake_fissure') {
        const p = (this.elapsedTime * 0.35 + i * 0.29) % 1;
        const driftX = scar.x - 16 + p * 38;
        const driftY = scar.y - 4 - Math.sin(p * Math.PI) * (isHeavy ? 11 : 8);
        const alpha =
          Math.sin(p * Math.PI) *
          (scar.kind === 'dust_drift' ? (isHeavy ? 0.46 : 0.34) : isHeavy ? 0.34 : 0.22);
        g.fillStyle(scar.kind === 'dust_drift' ? PALETTE.sand : PALETTE.terracotta, alpha);
        g.fillEllipse(driftX, driftY, isHeavy ? 30 : 24, isHeavy ? 13 : 10);
      } else if (isHeavy && (scar.kind === 'solar_scorch' || scar.kind === 'sep_crater')) {
        const spark = Math.sin(this.elapsedTime * 6 + i * 1.7);
        if (spark > 0.65) {
          g.fillStyle(scar.kind === 'sep_crater' ? 0x8be2ff : 0xfbbf24, 0.72);
          g.fillCircle(scar.x + Math.cos(i + this.elapsedTime * 4) * 8, scar.y - 4, 2.4);
        }
      }
    }
  }

  private triggerQuakeBurst() {
    const activeEvent = gameStore.getState().activeEvent;
    const animRem = activeEvent?.animationRemaining ?? 0;
    if (animRem <= 0) return;

    if (gameStore.getState().screen === 'PLAYING') {
      soundFX.playEnvironmentEventCue('marsquake');
      if (!this.reducedMotion) {
        const strength = Phaser.Math.Clamp(animRem / 2.2, 0.45, 1);
        this.cameras.main.shake(560, 0.0105 * strength);
      }
    }
    this.quakeEndAt = this.elapsedTime + 1.25;
    this.nextQuakeAt = this.elapsedTime + 1.9;
  }

  private spawnEventTapRipple(x: number, y: number, eventId: string) {
    if (this.reducedMotion) return;
    const color =
      eventId === 'marsquake'
        ? 0xf4c552
        : eventId === 'global_dust_storm' || eventId === 'dust_devils'
        ? PALETTE.sand
        : eventId === 'water_ice_cloud_formation'
        ? 0x8be2ff
        : 0xfbbf24;

    const ring = this.add.circle(x, y, 10, color, 0.35);
    ring.setStrokeStyle(3, 0xfaf0dc, 0.9);
    ring.setDepth(76);
    this.tweens.add({
      targets: ring,
      scale: 4.2,
      alpha: 0,
      duration: 460,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private spawnDamageImpactRing(
    x: number,
    y: number,
    width: number,
    height: number,
    color = 0xe58f49,
    heavy = false
  ) {
    if (this.reducedMotion) return;

    // Brief interior flash + twin expanding shockwave rings
    const flash = this.add.rectangle(x, y, width + 10, height + 10, color, heavy ? 0.34 : 0.24);
    flash.setDepth(73);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 1.14,
      scaleY: 1.14,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    const ring = this.add.graphics();
    ring.setPosition(x, y);
    ring.setDepth(74);
    ring.lineStyle(heavy ? 4.5 : 3.5, color, 0.96);
    ring.strokeRoundedRect(-width / 2 - 4, -height / 2 - 4, width + 8, height + 8, 14);
    ring.lineStyle(2, 0xfaf0dc, 0.7);
    ring.strokeRoundedRect(-width / 2 - 10, -height / 2 - 10, width + 20, height + 20, 18);
    this.tweens.add({
      targets: ring,
      scaleX: heavy ? 1.24 : 1.16,
      scaleY: heavy ? 1.24 : 1.16,
      alpha: 0,
      duration: heavy ? 920 : 780,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    // Scatter radial impact spark/debris flecks
    const sparkCount = heavy ? 8 : 5;
    for (let i = 0; i < sparkCount; i++) {
      const ang = (i / sparkCount) * Math.PI * 2 + 0.3;
      const dist = (Math.max(width, height) * 0.48) + (heavy ? 36 : 24);
      const spark = this.add.circle(x, y, heavy ? 3.5 : 2.8, i % 2 === 0 ? 0xfaf0dc : color, 0.95);
      spark.setDepth(75);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
        scale: 0.3,
        duration: 480 + i * 35,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private renderEventEffects(
    state: GameState,
    flags: {
      isGlobalStorm: boolean;
      isDustDevils: boolean;
      isQuake: boolean;
      quakeActiveNow: boolean;
      quakeAlpha: number;
      isNeutronCascade: boolean;
      isIceClouds: boolean;
      isSolarFlare: boolean;
      isSolarStorm: boolean;
      isSepStorm: boolean;
      isRadiation: boolean;
      eventStrength: number;
      animRemaining: number;
    }
  ) {
    const g = this.eventEffectsLayer;
    if (!g) return;
    g.clear();

    if (state.screen === 'TITLE_MENU') return;

    // 0. Live damaged / inactive equipment visual feedback scaled by cause & severity
    if (!this.reducedMotion) {
      for (const def of BUILDING_LIST) {
        const bState = state.buildings[def.id];
        const visual = this.buildingVisuals.get(def.id);
        if (!visual) continue;
        const isMajorHit =
          bState.damageSeverity === 'major' || bState.damageSeverity === 'super_major';
        const isSuperHit = bState.damageSeverity === 'super_major';

        if (bState.status === 'inactive') {
          // Rising dark gray smoke plumes from broken machinery
          const plumeCount = isSuperHit ? 4 : isMajorHit ? 3 : 2;
          for (let s = 0; s < plumeCount; s++) {
            const p = (this.elapsedTime * 0.65 + s * (1 / plumeCount) + visual.baseX * 0.01) % 1;
            const sx = visual.baseX - 14 + s * 10 + Math.sin(this.elapsedTime * 2.2 + s) * 7;
            const sy = visual.baseY - 12 - p * (isMajorHit ? 44 : 34);
            g.fillStyle(0x4b4846, (1 - p) * (isSuperHit ? 0.62 : 0.48));
            g.fillCircle(sx, sy, (isMajorHit ? 5 : 4) + p * 8);
          }
          // Blown sparks or swirling dust around severe wrecks
          if (
            bState.damageCause === 'solar_energetic_particles' ||
            bState.damageCause === 'secondary_neutron_cascades'
          ) {
            if (Math.sin(this.elapsedTime * 10 + visual.baseX) > 0.35) {
              const sx = visual.baseX + Math.sin(this.elapsedTime * 13) * 20;
              const sy = visual.baseY + Math.cos(this.elapsedTime * 9) * 14;
              g.lineStyle(2.4, 0x8be2ff, 0.92);
              g.lineBetween(sx - 6, sy, sx, sy - 6);
              g.lineBetween(sx, sy - 6, sx + 6, sy + 5);
            }
          }
        } else if (bState.status === 'damaged') {
          // Cause-aware ambient damage feedback: blowing sand on dust hits, sparks on electrical hits
          if (
            bState.damageCause === 'global_dust_storm' ||
            bState.damageCause === 'dust_devils'
          ) {
            const dp = (this.elapsedTime * 0.85 + visual.baseX * 0.01) % 1;
            g.fillStyle(PALETTE.sand, Math.sin(dp * Math.PI) * 0.42);
            g.fillEllipse(
              visual.baseX - 18 + dp * 36,
              visual.baseY + visual.height * 0.25,
              22,
              9
            );
          } else {
            const threshold = isMajorHit ? 0.5 : 0.72;
            const sparkPhase = Math.sin(this.elapsedTime * 7 + visual.baseY * 0.05);
            if (sparkPhase > threshold) {
              const sx = visual.baseX + Math.cos(this.elapsedTime * 11) * 18;
              const sy = visual.baseY + Math.sin(this.elapsedTime * 9) * 14;
              g.lineStyle(2.5, 0xf4c552, 0.95);
              g.lineBetween(sx - 6, sy, sx, sy - 5);
              g.lineBetween(sx, sy - 5, sx + 5, sy + 4);
            }
          }
        }
      }
    }

    // 0b. Cinematic Ending Storytelling Visuals (celebration sparks, audit highlights, respectful cause cues)
    if (
      (state.screen === 'MISSION_REPORT' || state.screen === 'GAME_OVER') &&
      !state.endingCutsceneCompleted &&
      this.activeEndingKind
    ) {
      this.renderEndingEffects(g, state, this.activeEndingKind);
    }

    if (!state.activeEvent) return;

    const env = Math.max(0.32, flags.eventStrength);
    const targets = state.activeEvent.definition.targetBuildings ?? [];
    const targetPulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 5.2);
    const sevColor =
      state.activeEvent.definition.severity === 'minor' ? 0xf4c552 : PALETTE.alertRed;

    // Clear target hazard reticle + floating warning diamond on systems at risk during active event
    for (const bId of targets) {
      const visual = this.buildingVisuals.get(bId);
      if (!visual) continue;
      const rx = visual.baseX - visual.width / 2 - 8;
      const ry = visual.baseY - visual.height / 2 - 8;
      const rw = visual.width + 16;
      const rh = visual.height + 16;
      const frameAlpha = (0.38 + targetPulse * 0.42) * Math.min(1, env + 0.25);

      g.lineStyle(3, sevColor, frameAlpha);
      g.strokeRoundedRect(rx, ry, rw, rh, 14);

      // Corner targeting brackets for crisp legibility
      const cLen = 14;
      g.lineStyle(3.5, 0xfaf0dc, frameAlpha * 0.9);
      g.lineBetween(rx, ry + cLen, rx, ry);
      g.lineBetween(rx, ry, rx + cLen, ry);
      g.lineBetween(rx + rw - cLen, ry, rx + rw, ry);
      g.lineBetween(rx + rw, ry, rx + rw, ry + cLen);
      g.lineBetween(rx, ry + rh - cLen, rx, ry + rh);
      g.lineBetween(rx, ry + rh, rx + cLen, ry + rh);
      g.lineBetween(rx + rw - cLen, ry + rh, rx + rw, ry + rh);
      g.lineBetween(rx + rw, ry + rh, rx + rw, ry + rh - cLen);

      // Bobbing hazard diamond above targeted buildings while event animation runs
      if (flags.animRemaining > 0) {
        const bob = this.reducedMotion ? 0 : Math.sin(this.elapsedTime * 5 + visual.baseX) * 3.5;
        const bx = visual.baseX;
        const by = ry - 11 + bob;
        g.fillStyle(sevColor, 0.94);
        g.lineStyle(2, PALETTE.charcoal, 0.95);
        g.fillTriangle(bx, by - 8, bx + 7, by, bx - 7, by);
        g.fillTriangle(bx, by + 8, bx + 7, by, bx - 7, by);
        g.strokeTriangle(bx, by - 8, bx + 7, by, bx - 7, by);
        g.strokeTriangle(bx, by + 8, bx + 7, by, bx - 7, by);
      }
    }

    // 1. Dust Devils: 4 spinning tall red-orange conical vortices with dust wakes & orbiting debris
    if (flags.isDustDevils) {
      const devilCount = 4;
      for (let i = 0; i < devilCount; i++) {
        const travel = (this.elapsedTime * (0.16 + i * 0.03) + i * 0.25) % 1;
        const dx = 90 + travel * (WORLD_WIDTH - 180);
        const dy = 135 + i * 165 + Math.sin(this.elapsedTime * 2.8 + i * 2) * 38;

        g.fillStyle(PALETTE.charcoal, 0.28 * env);
        g.fillEllipse(dx, dy + 24, 46, 15);
        g.fillStyle(PALETTE.sand, 0.22 * env);
        g.fillEllipse(dx - 16, dy + 22, 68, 20);

        for (let ring = 0; ring < 7; ring++) {
          const ry = dy + 18 - ring * 11;
          const rw = 18 + ring * 8.5;
          const wobble = Math.sin(this.elapsedTime * 12 + ring + i) * 6;
          g.lineStyle(3.4, ring % 2 === 0 ? PALETTE.sand : PALETTE.terracotta, 0.88 * env);
          g.strokeEllipse(dx + wobble, ry, rw, 9);
        }

        for (let f = 0; f < 6; f++) {
          const a = this.elapsedTime * 10 + (f * Math.PI) / 3 + i;
          g.fillStyle(f % 2 === 0 ? PALETTE.marsDark : PALETTE.cream, 0.9 * env);
          g.fillCircle(dx + Math.cos(a) * (24 + f * 3), dy - 16 + Math.sin(a) * 12, 3.4);
        }
      }
    }

    // 2. Global Dust Storm: dense layered swirling terracotta dust walls + desert-storm static lightning
    if (flags.isGlobalStorm) {
      for (let i = 0; i < 12; i++) {
        const speed = 105 + i * 24;
        const cx = ((this.elapsedTime * speed + i * 160) % (WORLD_WIDTH + 420)) - 210;
        const cy = 65 + ((i * 86) % (WORLD_HEIGHT - 120));
        g.fillStyle(PALETTE.sand, 0.3 * env);
        g.fillEllipse(cx, cy, 330, 92);
        g.fillStyle(PALETTE.terracotta, 0.26 * env);
        g.fillEllipse(cx - 60, cy + 20, 240, 66);
        g.fillStyle(PALETTE.marsDark, 0.14 * env);
        g.fillEllipse(cx + 45, cy + 12, 180, 44);
      }
      if (!this.reducedMotion && Math.sin(this.elapsedTime * 21) > 0.56) {
        const lx = 160 + ((Math.floor(this.elapsedTime * 5) * 237) % (WORLD_WIDTH - 320));
        const ly = 110 + ((Math.floor(this.elapsedTime * 4) * 193) % (WORLD_HEIGHT - 240));
        g.fillStyle(0xffe49c, 0.24 * env);
        g.fillCircle(lx + 10, ly + 24, 52);
        g.lineStyle(3.2, 0xffe49c, 0.95 * env);
        g.lineBetween(lx, ly, lx + 16, ly + 22);
        g.lineBetween(lx + 16, ly + 22, lx - 8, ly + 44);
        g.lineBetween(lx - 8, ly + 44, lx + 12, ly + 66);
      }
    }

    // 3. Marsquake (15s): outpost-wide concentric seismic waves, fractures, dust plumes & bouncing gravel
    if (flags.isQuake && flags.quakeAlpha > 0.02) {
      const qa = flags.quakeAlpha;
      const wavePhase = (this.elapsedTime * 1.65) % 1;

      // Colony-wide epicenter ring radiating out from outpost center
      const colonyR = 80 + wavePhase * 520;
      g.lineStyle(4, PALETTE.sand, (1 - wavePhase) * (flags.quakeActiveNow ? 0.55 : 0.24) * qa);
      g.strokeCircle(WORLD_WIDTH * 0.5, WORLD_HEIGHT * 0.5, colonyR);

      for (const bId of targets) {
        const visual = this.buildingVisuals.get(bId);
        if (!visual) continue;

        const radius = 34 + wavePhase * 76;
        const alpha = (1 - wavePhase) * (flags.quakeActiveNow ? 0.88 : 0.42) * qa;
        g.lineStyle(4, PALETTE.sand, alpha);
        g.strokeCircle(visual.baseX, visual.baseY + 8, radius);

        const radius2 = 22 + ((wavePhase + 0.5) % 1) * 62;
        const alpha2 = (1 - ((wavePhase + 0.5) % 1)) * 0.56 * qa;
        g.lineStyle(3, PALETTE.terracotta, alpha2);
        g.strokeCircle(visual.baseX, visual.baseY + 8, radius2);

        // Jagged seismic fissure beneath shaking structure
        g.lineStyle(3.5, PALETTE.charcoal, 0.78 * qa);
        g.lineBetween(visual.baseX - 46, visual.baseY + visual.height / 2 + 6, visual.baseX - 18, visual.baseY + visual.height / 2 + 14);
        g.lineBetween(visual.baseX - 18, visual.baseY + visual.height / 2 + 14, visual.baseX - 2, visual.baseY + visual.height / 2 + 7);
        g.lineBetween(visual.baseX - 2, visual.baseY + visual.height / 2 + 7, visual.baseX + 24, visual.baseY + visual.height / 2 + 16);

        if (!this.reducedMotion) {
          for (let d = 0; d < 8; d++) {
            const p = (this.elapsedTime * 1.35 + d * 0.16) % 1;
            const dx = visual.baseX - visual.width * 0.4 + (d / 7) * visual.width * 0.8 + Math.sin(this.elapsedTime * 6 + d) * 5;
            const dy = visual.baseY + visual.height * 0.35 - p * (visual.height * 0.85);
            const dustAlpha = (1 - p) * (flags.quakeActiveNow ? 0.82 : 0.4) * qa;
            g.fillStyle(d % 2 === 0 ? PALETTE.sand : PALETTE.terracotta, dustAlpha);
            g.fillCircle(dx, dy, 3.5 + (1 - p) * 3.8);
          }
        }
      }
      if (flags.quakeActiveNow && !this.reducedMotion) {
        const bounce = Math.abs(Math.sin(this.elapsedTime * 24)) * 12 * qa;
        for (let r = 0; r < 12; r++) {
          const rx = 95 + r * 105;
          const ry = 160 + ((r * 135) % 520) - bounce;
          g.fillStyle(r % 2 === 0 ? PALETTE.terracotta : PALETTE.sand, 0.9 * qa);
          g.fillCircle(rx, ry, 4.6);
        }
      }
    }

    // 4. Secondary Neutron Cascades: cosmic rays slamming terrain/targets & splashing violet/gold neutron bursts
    if (flags.isNeutronCascade) {
      for (let i = 0; i < 6; i++) {
        const cycle = (this.elapsedTime * 0.82 + i * 0.19) % 1;
        const targetVisual = targets.length > 0 ? this.buildingVisuals.get(targets[i % targets.length]) : undefined;
        const gx = targetVisual && i < 3 ? targetVisual.baseX + (i - 1) * 38 : 150 + i * 200;
        const gy = targetVisual && i < 3 ? targetVisual.baseY : 195 + ((i * 150) % 440);

        if (cycle < 0.34) {
          const p = cycle / 0.34;
          const sx = gx - 110 * (1 - p);
          const sy = gy - 155 * (1 - p);
          g.lineStyle(3.2, 0xf4c552, 0.92 * env);
          g.lineBetween(sx - 24, sy - 34, sx, sy);
          g.fillStyle(0xffffff, 0.9 * env);
          g.fillCircle(sx, sy, 3.5);
        } else {
          const p = (cycle - 0.34) / 0.66;
          const alpha = (1 - p) * env;
          g.fillStyle(0xc084fc, alpha * 0.5);
          g.fillCircle(gx, gy, 12 + p * 26);
          g.lineStyle(2.5, 0xf4c552, alpha * 0.75);
          g.strokeCircle(gx, gy, 10 + p * 34);
          for (let b = 0; b < 5; b++) {
            const bx = gx + (b - 2) * (15 + p * 36);
            const by = gy - p * (64 + (b % 2) * 22);
            g.lineStyle(2.4, b % 2 === 0 ? 0xc084fc : 0x6ca4c4, alpha * 0.95);
            g.lineBetween(gx, gy, bx, by);
            g.fillStyle(b % 2 === 0 ? 0xf4c552 : 0xc084fc, alpha);
            g.fillCircle(bx, by, 4);
          }
        }
      }
    }

    // 5. Water Ice Cloud Formation: drifting icy cirrus cloud banks + cryo shimmer rings on water facilities
    if (flags.isIceClouds) {
      for (let i = 0; i < 10; i++) {
        const cx = ((this.elapsedTime * (38 + i * 9) + i * 155) % (WORLD_WIDTH + 340)) - 170;
        const cy = 55 + ((i * 88) % (WORLD_HEIGHT - 130));
        g.fillStyle(0xdcf4ff, 0.42 * env);
        g.fillEllipse(cx, cy, 240, 52);
        g.fillStyle(0xffffff, 0.32 * env);
        g.fillEllipse(cx + 32, cy - 10, 165, 34);
      }
      for (const bId of targets) {
        const visual = this.buildingVisuals.get(bId);
        if (!visual) continue;
        const sparkle = 0.45 + 0.55 * Math.sin(this.elapsedTime * 5.5 + visual.baseX);
        g.lineStyle(3, 0xbbe8ff, 0.52 * sparkle * env);
        g.strokeCircle(visual.baseX, visual.baseY, visual.width * 0.56);
        g.fillStyle(0xffffff, 0.65 * sparkle * env);
        g.fillCircle(visual.baseX - 22, visual.baseY - 16, 4.5);
        g.fillCircle(visual.baseX + 24, visual.baseY + 10, 4);
        g.fillCircle(visual.baseX + 4, visual.baseY - 24, 3.5);
      }
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 2.8);
      g.lineStyle(8, 0xbbe8ff, (0.34 + pulse * 0.28) * env);
      g.strokeRoundedRect(6, 6, WORLD_WIDTH - 12, WORLD_HEIGHT - 12, 12);
    }

    // 6. Solar Flare X-rays & UV Waves: bright golden sunbeam shafts + violet/gold UV wave arcs
    if (flags.isSolarFlare) {
      for (let r = 0; r < 6; r++) {
        const beamP = (this.elapsedTime * 0.46 + r * 0.18) % 1;
        const bx = WORLD_WIDTH * (0.14 + r * 0.16) - beamP * 160;
        g.fillStyle(0xf4c552, Math.sin(beamP * Math.PI) * 0.2 * env);
        g.fillTriangle(bx + 80, -20, bx - 50, WORLD_HEIGHT + 20, bx + 26, WORLD_HEIGHT + 20);
      }
      for (let w = 0; w < 6; w++) {
        const waveP = (this.elapsedTime * 0.72 + w * 0.17) % 1;
        const centerX = WORLD_WIDTH * 0.9 - waveP * WORLD_WIDTH;
        const centerY = 30 + waveP * (WORLD_HEIGHT - 50);
        g.lineStyle(4.2, w % 2 === 0 ? 0xc084fc : 0xf4c552, (1 - waveP) * 0.85 * env);
        g.beginPath();
        g.arc(centerX, centerY, 96 + w * 30, Math.PI * 0.58, Math.PI * 1.42, false);
        g.strokePath();
      }
    }

    // 7. Solar Storm Response: sweeping CME aurora curtains, plasma streams & border surge
    if (flags.isSolarStorm) {
      for (let r = 0; r < 8; r++) {
        const offset = (this.elapsedTime * 165 + r * 145) % (WORLD_WIDTH + 280);
        const yBase = 65 + r * 102 + Math.sin(this.elapsedTime * 2.8 + r) * 18;
        const color = r % 2 === 0 ? 0xfbbf24 : PALETTE.alertRed;
        g.lineStyle(7.5, color, 0.28 * env);
        g.lineBetween(offset - 220, yBase - 28, offset, yBase + 16);
        g.lineStyle(3.2, r % 2 === 0 ? 0xffe08a : 0xff7b6b, 0.82 * env);
        g.lineBetween(offset - 190, yBase - 24, offset - 6, yBase + 14);
      }
      // Shimmering upper-atmosphere aurora ribbons & border pulse
      const auroraPulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 3.4);
      g.fillStyle(0xf472b6, (0.1 + auroraPulse * 0.09) * env);
      g.fillRect(0, 0, WORLD_WIDTH, 76);
      g.fillStyle(0xfbbf24, (0.06 + auroraPulse * 0.06) * env);
      g.fillRect(0, 24, WORLD_WIDTH, 48);
      g.lineStyle(6, 0xfbbf24, (0.34 + auroraPulse * 0.34) * env);
      g.strokeRoundedRect(10, 10, WORLD_WIDTH - 20, WORLD_HEIGHT - 20, 14);
    }

    // 8. Solar Energetic Particles: fast glowing particle slashes + vivid target static arcs
    if (flags.isSepStorm) {
      for (let i = 0; i < 28; i++) {
        const progress = (this.elapsedTime * 0.98 + i * 0.11) % 1;
        const rx = 40 + ((i * 67) % WORLD_WIDTH) - progress * 140;
        const ry = -30 + progress * (WORLD_HEIGHT + 70);
        const color = i % 3 === 0 ? 0xfaf0dc : i % 3 === 1 ? 0x6ca4c4 : 0xf472b6;
        g.lineStyle(5.5, color, 0.3 * env);
        g.lineBetween(rx, ry, rx - 38, ry + 48);
        g.lineStyle(2.6, color, 0.92 * env);
        g.lineBetween(rx - 4, ry + 5, rx - 34, ry + 44);
        g.fillStyle(0xffffff, 0.95 * env);
        g.fillCircle(rx - 34, ry + 44, 2.8);
      }
      if (flags.animRemaining > 0 && Math.sin(this.elapsedTime * 19) > 0.12) {
        for (const bId of targets) {
          const visual = this.buildingVisuals.get(bId);
          if (!visual) continue;
          const sx = visual.baseX + Math.sin(this.elapsedTime * 15 + visual.baseX) * 26;
          const sy = visual.baseY + Math.cos(this.elapsedTime * 12) * 18;
          g.lineStyle(3, 0x8be2ff, 0.95 * env);
          g.lineBetween(sx - 10, sy, sx, sy - 8);
          g.lineBetween(sx, sy - 8, sx + 8, sy + 7);
          g.lineStyle(2, 0xf472b6, 0.85 * env);
          g.lineBetween(sx + 6, sy - 6, sx - 6, sy + 8);
        }
      }
    }

    // Shared Radiation Alert border + Shelter Beacon whenever radiation > 0
    if (flags.isRadiation) {
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 5.2);
      const borderColor =
        state.activeEvent.definition.severity === 'minor' ? 0xf4c552 : PALETTE.alertRed;
      g.lineStyle(6.5, borderColor, (0.3 + pulse * 0.32) * Math.min(1, env + 0.25));
      g.strokeRoundedRect(6, 6, WORLD_WIDTH - 12, WORLD_HEIGHT - 12, 12);

      // Beacon on Radiation Shelter if crew is still outside!
      if (!state.crew.inShelter) {
        const shelter = this.buildingVisuals.get('radiation_shelter');
        if (shelter) {
          g.lineStyle(4.5, 0xf4c552, 0.5 + pulse * 0.5);
          g.strokeRoundedRect(
            shelter.baseX - shelter.width / 2 - 12,
            shelter.baseY - shelter.height / 2 - 12,
            shelter.width + 24,
            shelter.height + 24,
            16
          );
          g.lineStyle(2.5, 0xfaf0dc, 0.35 + pulse * 0.45);
          g.strokeRoundedRect(
            shelter.baseX - shelter.width / 2 - 18,
            shelter.baseY - shelter.height / 2 - 18,
            shelter.width + 36,
            shelter.height + 36,
            20
          );
        }
      }
    }
  }

  private renderEndingEffects(
    g: Phaser.GameObjects.Graphics,
    state: GameState,
    kind: string
  ) {
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 3.2);
    const hab = this.buildingVisuals.get('main_habitat');

    if (kind === 'victory_sustainable' || kind === 'victory_improvements') {
      // Warm operational halo across key life-support facilities
      const highlightIds: BuildingId[] = ['main_habitat', 'solar_panels', 'greenhouse', 'oxygen_generator'];
      for (const bId of highlightIds) {
        const b = state.buildings[bId];
        const v = this.buildingVisuals.get(bId);
        if (!v || b.status !== 'operational') continue;
        g.lineStyle(2.5, 0xf4c552, 0.18 + pulse * 0.18);
        g.strokeRoundedRect(
          v.baseX - v.width / 2 - 6,
          v.baseY - v.height / 2 - 6,
          v.width + 12,
          v.height + 12,
          14
        );
      }

      // Celebratory golden & cream sparkles above the crew plaza
      if (!this.reducedMotion && hab) {
        const sparkColors = [0xf4c552, 0xfaf0dc, 0x86efac, 0x6ca4c4];
        for (let s = 0; s < 16; s++) {
          const cycle = (this.elapsedTime * (0.45 + (s % 4) * 0.08) + s * 0.17) % 1;
          const sx = hab.baseX - 135 + ((s * 21) % 270) + Math.sin(this.elapsedTime * 2.5 + s) * 10;
          const sy = hab.baseY + hab.height * 0.55 + 24 - cycle * 115;
          const alpha = Math.sin(cycle * Math.PI) * 0.85;
          g.fillStyle(sparkColors[s % sparkColors.length], alpha);
          g.fillCircle(sx, sy, 2.2 + (s % 3) * 0.9);
        }
      }
      return;
    }

    if (kind === 'survived_failed') {
      // Highlight incomplete/damaged systems so players visually see what missed 150-sol readiness
      for (const def of BUILDING_LIST) {
        const b = state.buildings[def.id];
        const v = this.buildingVisuals.get(def.id);
        if (!v || b.status === 'operational') continue;
        g.lineStyle(3, 0xd77b4a, 0.28 + pulse * 0.34);
        g.strokeRoundedRect(
          v.baseX - v.width / 2 - 7,
          v.baseY - v.height / 2 - 7,
          v.width + 14,
          v.height + 14,
          14
        );
      }
      return;
    }

    // Cause-specific environmental storytelling for early mission failure
    const outlineTarget = (bId: BuildingId, color: number) => {
      const v = this.buildingVisuals.get(bId);
      if (!v) return;
      g.lineStyle(3.2, color, 0.34 + pulse * 0.34);
      g.strokeRoundedRect(
        v.baseX - v.width / 2 - 8,
        v.baseY - v.height / 2 - 8,
        v.width + 16,
        v.height + 16,
        15
      );
    };

    if (kind === 'fail_oxygen') {
      outlineTarget('oxygen_generator', 0x6ca4c4);
      outlineTarget('oxygen_storage', 0x6ca4c4);
      const o2v = this.buildingVisuals.get('oxygen_generator');
      if (o2v && !this.reducedMotion) {
        for (let i = 0; i < 6; i++) {
          const p = (this.elapsedTime * 0.5 + i * 0.16) % 1;
          g.fillStyle(0xdcf4ff, (1 - p) * 0.42);
          g.fillCircle(o2v.baseX - 18 + i * 7 + Math.sin(p * 6 + i) * 6, o2v.baseY - 12 - p * 46, 4 + p * 7);
        }
      }
    } else if (kind === 'fail_water') {
      outlineTarget('water_storage', 0xd77b4a);
      outlineTarget('water_recycling', 0xd77b4a);
      outlineTarget('greenhouse', 0x9e6a44);
    } else if (kind === 'fail_food') {
      outlineTarget('food_storage', 0xd77b4a);
      outlineTarget('greenhouse', 0x9e6a44);
    } else if (kind === 'fail_radiation') {
      outlineTarget('radiation_shelter', PALETTE.alertRed);
      if (!this.reducedMotion) {
        for (let i = 0; i < 8; i++) {
          const p = (this.elapsedTime * 0.65 + i * 0.14) % 1;
          const rx = 120 + ((i * 149) % (WORLD_WIDTH - 200)) - p * 90;
          const ry = -20 + p * (WORLD_HEIGHT + 40);
          g.lineStyle(2.4, i % 2 === 0 ? PALETTE.alertRed : 0xfbbf24, 0.45);
          g.lineBetween(rx, ry, rx - 24, ry + 32);
        }
      }
    } else if (hab) {
      outlineTarget('main_habitat', 0xd77b4a);
    }

    // Calm eastern boarding lights leading toward the ascent craft on the final beat
    if (this.endingIsFinalBeat) {
      for (let b = 0; b < 4; b++) {
        const bx = WORLD_WIDTH - 40 + b * 44;
        const by = WORLD_HEIGHT * 0.56 + 18;
        const lit = 0.3 + 0.55 * (0.5 + 0.5 * Math.sin(this.elapsedTime * 4 - b * 0.8));
        g.fillStyle(0xf4c552, lit);
        g.fillCircle(bx, by, 4.2);
      }
    }
  }

  private animateAstronautLimbs(
    astronaut: Phaser.GameObjects.Container | undefined,
    isRunning: boolean,
    workKind: ActionAnimKind | null,
    moveDirX: number,
    phaseOffset: number,
    idleActivity: IdleActivity = 'resting',
    strideGain = 1,
    dt = 0.016
  ) {
    if (!astronaut) return;
    const bodyGroup = astronaut.getByName('bodyGroup') as Phaser.GameObjects.Container | null;
    if (!bodyGroup) return;

    const leftLeg = bodyGroup.getByName('leftLeg') as Phaser.GameObjects.Graphics | null;
    const rightLeg = bodyGroup.getByName('rightLeg') as Phaser.GameObjects.Graphics | null;
    const leftArm = bodyGroup.getByName('leftArm') as Phaser.GameObjects.Graphics | null;
    const rightArm = bodyGroup.getByName('rightArm') as Phaser.GameObjects.Container | null;

    if (rightArm) {
      const wrenchProp = rightArm.getByName('wrenchProp') as Phaser.GameObjects.Graphics | null;
      const brushProp = rightArm.getByName('brushProp') as Phaser.GameObjects.Graphics | null;
      const seedProp = rightArm.getByName('seedProp') as Phaser.GameObjects.Graphics | null;
      const tabletProp = rightArm.getByName('tabletProp') as Phaser.GameObjects.Graphics | null;

      wrenchProp?.setVisible(
        workKind === 'restore' ||
          workKind === 'repair' ||
          (!isRunning && !workKind && idleActivity === 'tinkering')
      );
      brushProp?.setVisible(workKind === 'clean');
      seedProp?.setVisible(workKind === 'plant' || workKind === 'harvest');
      tabletProp?.setVisible(!isRunning && !workKind && idleActivity === 'inspecting');
    }

    if (this.reducedMotion) {
      bodyGroup.y = 0;
      bodyGroup.rotation = 0;
      if (leftLeg) leftLeg.y = 0;
      if (rightLeg) rightLeg.y = 0;
      if (leftArm) leftArm.rotation = 0;
      if (rightArm) rightArm.rotation = 0;
      return;
    }

    // Slightly unique cadence per crew member so nobody moves in lockstep
    const freqScale = 0.88 + ((phaseOffset * 0.29) % 0.28);
    const t = this.elapsedTime * freqScale + phaseOffset;

    let targetBodyY = 0;
    let targetBodyRot = 0;
    let targetLeftLegY = 0;
    let targetRightLegY = 0;
    let targetLeftArmRot = 0;
    let targetRightArmRot = 0;

    if (isRunning) {
      const stride = Math.sin(t * 15 * strideGain);
      targetBodyY = -Math.abs(Math.cos(t * 15 * strideGain)) * (4.2 * strideGain);
      targetBodyRot = moveDirX < -2 ? -0.09 * strideGain : moveDirX > 2 ? 0.09 * strideGain : 0;
      targetLeftLegY = stride * 3.6;
      targetRightLegY = -stride * 3.6;
      targetLeftArmRot = -stride * 0.55;
      targetRightArmRot = stride * 0.55;
    } else if (workKind) {
      targetBodyY = Math.sin(t * 9) * 2;
      targetBodyRot = workKind === 'plant' ? 0.06 : 0;
      targetLeftArmRot = -0.25 + Math.sin(t * 8) * 0.15;
      targetRightArmRot =
        workKind === 'clean'
          ? -0.6 + Math.sin(t * 14) * 0.65
          : workKind === 'plant'
          ? -0.45 + Math.sin(t * 10) * 0.45
          : -0.9 + Math.sin(t * 16) * 0.7;
    } else if (idleActivity === 'inspecting') {
      // Holding up glowing tablet scanner & leaning slightly to read telemetry
      targetBodyY = Math.sin(t * 2.4) * 1.1;
      targetBodyRot = Math.sin(t * 1.1) * 0.05;
      targetLeftArmRot = 0.18 + Math.sin(t * 4.5) * 0.14;
      targetRightArmRot = -0.78 + Math.sin(t * 1.8) * 0.06;
    } else if (idleActivity === 'tinkering') {
      // Quick diagnostic wrench check
      targetBodyY = Math.sin(t * 5.2) * 1.6;
      targetBodyRot = 0.04;
      targetLeftArmRot = -0.15;
      targetRightArmRot = -0.65 + Math.sin(t * 8.5) * 0.35;
    } else if (idleActivity === 'stretching') {
      // Zero-g suit stretch & deep breath
      const stretch = Math.max(0, Math.sin(t * 1.6));
      targetBodyY = -stretch * 2.8;
      targetBodyRot = Math.sin(t * 0.9) * 0.04;
      targetLeftArmRot = 0.35 + stretch * 1.15;
      targetRightArmRot = -0.35 - stretch * 1.15;
    } else if (idleActivity === 'waving') {
      // Cheerful astronaut wave
      targetBodyY = Math.abs(Math.sin(t * 3.8)) * -2.2;
      targetBodyRot = Math.sin(t * 3.2) * 0.05;
      targetLeftArmRot = 0.1;
      targetRightArmRot = -2.05 + Math.sin(t * 10.5) * 0.42;
    } else if (idleActivity === 'looking_around') {
      // Curious perimeter scan
      targetBodyY = Math.sin(t * 2.1) * 1.2;
      targetBodyRot = Math.sin(t * 1.45) * 0.09;
      targetLeftLegY = Math.sin(t * 1.45) * 0.8;
      targetRightLegY = -Math.sin(t * 1.45) * 0.8;
      targetLeftArmRot = -0.1 + Math.sin(t * 1.8) * 0.14;
      targetRightArmRot = 0.1 - Math.sin(t * 1.8) * 0.14;
    } else if (idleActivity === 'posture_adjust') {
      // Adjusting spacesuit harness & shifting weight naturally
      targetBodyY = -Math.abs(Math.sin(t * 2.6)) * 1.6;
      targetBodyRot = Math.sin(t * 1.9) * 0.065;
      targetLeftLegY = Math.sin(t * 1.9) * 0.6;
      targetRightLegY = -Math.sin(t * 1.9) * 0.6;
      targetLeftArmRot = -0.36 + Math.sin(t * 4.2) * 0.16;
      targetRightArmRot = 0.34 - Math.sin(t * 4.2) * 0.16;
    } else {
      // Relaxed breathing idle
      targetBodyY = Math.sin(t * 2.3) * 1.3;
      targetBodyRot = 0;
      targetLeftArmRot = Math.sin(t * 2.0) * 0.07;
      targetRightArmRot = -Math.sin(t * 2.0) * 0.07;
    }

    const blend = Math.min(1, Math.max(0.18, dt * 11));
    bodyGroup.y = Phaser.Math.Linear(bodyGroup.y, targetBodyY, blend);
    bodyGroup.rotation = Phaser.Math.Linear(bodyGroup.rotation, targetBodyRot, blend);
    if (leftLeg) leftLeg.y = Phaser.Math.Linear(leftLeg.y, targetLeftLegY, blend);
    if (rightLeg) rightLeg.y = Phaser.Math.Linear(rightLeg.y, targetRightLegY, blend);
    if (leftArm) leftArm.rotation = Phaser.Math.Linear(leftArm.rotation, targetLeftArmRot, blend);
    if (rightArm) rightArm.rotation = Phaser.Math.Linear(rightArm.rotation, targetRightArmRot, blend);
  }

  private updateCrewAgents(state: GameState, dt: number) {
    const isEndingCutscene =
      (state.screen === 'MISSION_REPORT' || state.screen === 'GAME_OVER') &&
      !state.endingCutsceneCompleted;
    const stormHoldingInShelter = !isEndingCutscene && this.isShelteredDuringActiveEvent(state);
    const isHeadingHome =
      !isEndingCutscene &&
      !stormHoldingInShelter &&
      (state.sleepPhase === 'returning' ||
        state.sleepPhase === 'sleeping' ||
        (state.sleepPhase === 'idle' && state.sleepingRemaining > 0));
    const shelterBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.radiation_shelter);
    const shelterSlots = this.getShelterSlots(shelterBounds);

    for (let i = 0; i < this.crewAgents.length; i++) {
      const agent = this.crewAgents[i];
      if (!agent.container) continue;

      const isEndingVictory =
        isEndingCutscene &&
        (this.activeEndingKind === 'victory_sustainable' ||
          this.activeEndingKind === 'victory_improvements');

      if (isEndingVictory) {
        agent.idleActivity = 'waving';
      } else if (isEndingCutscene) {
        agent.idleActivity = i % 2 === 0 ? 'looking_around' : 'resting';
      } else if (this.elapsedTime >= agent.activityUntil) {
        const nextIdx =
          (IDLE_ACTIVITIES.indexOf(agent.idleActivity) + Phaser.Math.Between(1, IDLE_ACTIVITIES.length - 1)) %
          IDLE_ACTIVITIES.length;
        agent.idleActivity = IDLE_ACTIVITIES[nextIdx];
        agent.activityUntil = this.elapsedTime + Phaser.Math.FloatBetween(2.4, 5.2);
      }

      if (this.landingDisembarkActive) {
        const meta = this.landingAgentMeta[i];
        const disembarkElapsed = this.elapsedTime - this.landingDisembarkStartedAt;
        if (meta && disembarkElapsed < meta.delay) {
          agent.container.setAlpha(0);
          this.animateAstronautLimbs(
            agent.container,
            false,
            null,
            0,
            agent.phaseOffset,
            agent.idleActivity,
            agent.strideGain,
            dt
          );
          continue;
        }
      } else if (isHeadingHome) {
        const habBounds = gridManager.getBuildingBounds(BUILDING_DEFINITIONS.main_habitat);
        const sleepSlot = this.getHabitatSleepSlots(habBounds)[i + 1] ?? habBounds;
        const insideHab = this.isInsideBuildingFootprint(
          agent.container.x,
          agent.container.y,
          'main_habitat'
        );
        if (
          agent.allowInsideBuildingId !== 'main_habitat' ||
          (agent.path.length === 0 && !insideHab)
        ) {
          this.setAgentDestination(agent, sleepSlot.x, sleepSlot.y, 'main_habitat');
        }
      } else if (state.crew.inShelter && !isEndingCutscene) {
        const slot = shelterSlots[i + 1] ?? shelterSlots[0];
        if (
          agent.path.length === 0 &&
          Math.hypot(agent.container.x - slot.x, agent.container.y - slot.y) > 4
        ) {
          this.setAgentDestination(agent, slot.x, slot.y, 'radiation_shelter');
        }
      } else if (agent.path.length === 0 && this.elapsedTime >= agent.waitUntil && state.screen === 'PLAYING') {
        // Alternate naturally between visiting operational infrastructure & scenic outpost overlooks
        const visitScenic = agent.scenicSpots.length > 0 && Phaser.Math.Between(0, 2) === 0;
        if (visitScenic) {
          const spot = agent.scenicSpots[Phaser.Math.Between(0, agent.scenicSpots.length - 1)];
          const candidate = gridManager.pushOutOfBuildings(
            spot.x + Phaser.Math.Between(-18, 18),
            spot.y + Phaser.Math.Between(-14, 14),
            BUILDING_CLEARANCE
          );
          const goal = gridManager.isPointBlocked(candidate.x, candidate.y, BUILDING_CLEARANCE - 1)
            ? gridManager.findNearestWalkablePoint(spot.x, spot.y, BUILDING_CLEARANCE)
            : candidate;
          agent.taskUntil = 0;
          this.setAgentDestination(agent, goal.x, goal.y);
        } else {
          const operationalTargets = agent.patrolBuildings.filter(
            (bId) => state.buildings[bId].status !== 'inactive'
          );
          const chosenId =
            operationalTargets.length > 0
              ? operationalTargets[Phaser.Math.Between(0, operationalTargets.length - 1)]
              : 'main_habitat';
          const door = gridManager.getBuildingDoorstep(chosenId, agent.container.x, agent.container.y);
          const candidate = gridManager.pushOutOfBuildings(
            door.x + Phaser.Math.Between(-26, 26),
            door.y + Phaser.Math.Between(-8, 12),
            BUILDING_CLEARANCE
          );
          const goal = gridManager.isPointBlocked(candidate.x, candidate.y, BUILDING_CLEARANCE - 1)
            ? door
            : candidate;
          agent.taskUntil = -1; // Flag to trigger contextual task animation upon arrival
          this.setAgentDestination(agent, goal.x, goal.y);
        }
      }

      let isMoving = false;
      let moveDirX = 0;
      const landingMeta = this.landingDisembarkActive ? this.landingAgentMeta[i] : undefined;
      if (landingMeta && !landingMeta.enteredGrid && agent.path.length > 0) {
        const nextWp = agent.path[0];
        const dx = nextWp.x - agent.container.x;
        const dy = nextWp.y - agent.container.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 6) {
          isMoving = true;
          moveDirX = dx;
          const speed = (188 + (i % 2) * 14) * dt;
          const step = Math.min(dist, speed);
          agent.container.x += (dx / dist) * step;
          agent.container.y += (dy / dist) * step;
          agent.lastX = agent.container.x;
          agent.lastY = agent.container.y;
          if (!this.reducedMotion && Math.random() < 0.14) {
            this.spawnFootDust(agent.container.x, agent.container.y + 14);
          }
        }
        if (agent.container.x <= WORLD_WIDTH - 42 || dist <= 6) {
          landingMeta.enteredGrid = true;
          this.setAgentDestination(agent, landingMeta.targetSlot.x, landingMeta.targetSlot.y);
        }
      } else if (agent.path.length > 0) {
        const nextWp = agent.path[0];
        const dx = nextWp.x - agent.container.x;
        const dy = nextWp.y - agent.container.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 4) {
          isMoving = true;
          moveDirX = dx;
          const speed =
            (isEndingCutscene
              ? 106 + (i % 2) * 6
              : isHeadingHome
              ? 275
              : state.crew.inShelter
              ? 195
              : this.landingDisembarkActive
              ? 202
              : agent.walkSpeed) * dt;
          const step = Math.min(dist, speed);
          const targetX = agent.container.x + (dx / dist) * step;
          const targetY = agent.container.y + (dy / dist) * step;

          const wasInsidePermit = agent.allowInsideBuildingId
            ? this.isInsideBuildingFootprint(
                agent.container.x,
                agent.container.y,
                agent.allowInsideBuildingId
              )
            : false;

          const activeAgentIgnoreId =
            isHeadingHome &&
            this.isInsideBuildingFootprint(
              agent.container.x,
              agent.container.y,
              'radiation_shelter'
            )
              ? 'radiation_shelter'
              : agent.allowInsideBuildingId;

          const resolved = gridManager.resolveMovementStep(
            agent.container.x,
            agent.container.y,
            targetX,
            targetY,
            BUILDING_CLEARANCE,
            activeAgentIgnoreId
          );
          agent.container.x = resolved.x;
          agent.container.y = resolved.y;

          if (
            wasInsidePermit &&
            agent.allowInsideBuildingId &&
            !isHeadingHome &&
            !state.crew.inShelter &&
            !this.isInsideBuildingFootprint(
              agent.container.x,
              agent.container.y,
              agent.allowInsideBuildingId
            )
          ) {
            agent.allowInsideBuildingId = undefined;
          }

          const movedDist = Math.hypot(
            agent.container.x - agent.lastX,
            agent.container.y - agent.lastY
          );
          agent.lastX = agent.container.x;
          agent.lastY = agent.container.y;

          if (movedDist < 0.2 && speed > 1.2) {
            agent.stuckElapsed += dt;
            if (agent.stuckElapsed > 0.4) {
              agent.stuckElapsed = 0;
              if (!isHeadingHome && !state.crew.inShelter) {
                agent.path = [];
                agent.allowInsideBuildingId = undefined;
                agent.waitUntil = this.elapsedTime + 0.5;
              } else {
                const finalGoal = agent.path[agent.path.length - 1];
                const rebuilt = this.buildCharacterPath(
                  agent.container.x,
                  agent.container.y,
                  finalGoal.x,
                  finalGoal.y,
                  isHeadingHome ? 'main_habitat' : 'radiation_shelter'
                );
                agent.path = rebuilt.path;
                agent.allowInsideBuildingId = rebuilt.permitBuildingId;
              }
            }
          } else {
            agent.stuckElapsed = 0;
          }
        } else {
          agent.stuckElapsed = 0;
          agent.path.shift();
          if (agent.path.length === 0) {
            if (!isHeadingHome && !state.crew.inShelter) {
              agent.allowInsideBuildingId = undefined;
            }
            const holdSec = Phaser.Math.FloatBetween(2.8, 6.2);
            agent.waitUntil = this.elapsedTime + holdSec;
            if (agent.taskUntil === -1 && !state.crew.inShelter && !isHeadingHome) {
              agent.taskUntil = this.elapsedTime + Math.min(3.2, holdSec * 0.7);
            } else {
              agent.taskUntil = 0;
            }
            agent.idleActivity =
              IDLE_ACTIVITIES[Phaser.Math.Between(0, IDLE_ACTIVITIES.length - 1)];
            agent.activityUntil = this.elapsedTime + Phaser.Math.FloatBetween(2.4, 4.6);
          }
        }
      } else if (!isHeadingHome && !state.crew.inShelter && !this.landingDisembarkActive) {
        const safePos = gridManager.pushOutOfBuildings(
          agent.container.x,
          agent.container.y,
          BUILDING_CLEARANCE
        );
        agent.container.x = safePos.x;
        agent.container.y = safePos.y;
        agent.lastX = safePos.x;
        agent.lastY = safePos.y;
      }

      // Soft outdoor crew-to-crew & crew-to-commander separation so characters never stack cleanly on top of each other
      if (!isHeadingHome && !state.crew.inShelter && !agent.allowInsideBuildingId) {
        const minSep = 22;
        for (let j = 0; j < this.crewAgents.length; j++) {
          if (i === j) continue;
          const other = this.crewAgents[j];
          if (!other.container || other.allowInsideBuildingId) continue;
          const ox = agent.container.x - other.container.x;
          const oy = agent.container.y - other.container.y;
          const od = Math.hypot(ox, oy);
          if (od > 0.01 && od < minSep) {
            const push = (minSep - od) * 0.35;
            const sepStep = gridManager.resolveMovementStep(
              agent.container.x,
              agent.container.y,
              agent.container.x + (ox / od) * push,
              agent.container.y + (oy / od) * push,
              BUILDING_CLEARANCE
            );
            agent.container.x = sepStep.x;
            agent.container.y = sepStep.y;
          }
        }
        if (this.nas && !this.nasAllowInsideBuildingId) {
          const nx = agent.container.x - this.nas.x;
          const ny = agent.container.y - this.nas.y;
          const nd = Math.hypot(nx, ny);
          if (nd > 0.01 && nd < 24) {
            const push = (24 - nd) * 0.4;
            const sepNas = gridManager.resolveMovementStep(
              agent.container.x,
              agent.container.y,
              agent.container.x + (nx / nd) * push,
              agent.container.y + (ny / nd) * push,
              BUILDING_CLEARANCE
            );
            agent.container.x = sepNas.x;
            agent.container.y = sepNas.y;
          }
        }
      }

      const insideHabSleeping =
        isHeadingHome &&
        this.isInsideBuildingFootprint(agent.container.x, agent.container.y, 'main_habitat');

      const targetScale = insideHabSleeping
        ? 0.64
        : state.crew.inShelter && !isMoving && !isEndingCutscene
        ? 0.76
        : isEndingVictory
        ? 0.96
        : 0.92;
      const targetAlpha = insideHabSleeping
        ? 0.15
        : state.crew.inShelter && !isMoving && !isEndingCutscene
        ? 0.94
        : 1;
      const scaleStep = Math.min(1, dt * 8);
      agent.container.setScale(
        Phaser.Math.Linear(agent.container.scaleX, targetScale, scaleStep),
        Phaser.Math.Linear(agent.container.scaleY, targetScale, scaleStep)
      );
      agent.container.setAlpha(
        Phaser.Math.Linear(agent.container.alpha, targetAlpha, scaleStep)
      );
      const isHelping =
        !isMoving &&
        !isEndingCutscene &&
        state.pendingAction?.phase === 'working' &&
        i === 0 &&
        !state.crew.inShelter &&
        !isHeadingHome;
      const isAutonomousTasking =
        !isMoving &&
        !isEndingCutscene &&
        !state.crew.inShelter &&
        !isHeadingHome &&
        agent.taskUntil > this.elapsedTime;
      const activeWorkKind: ActionAnimKind | null = isHelping
        ? state.pendingAction?.taskKind ?? this.activeWorkAnim?.kind ?? null
        : isAutonomousTasking
        ? agent.specialtyTask
        : null;

      this.animateAstronautLimbs(
        agent.container,
        isMoving,
        activeWorkKind,
        moveDirX,
        agent.phaseOffset,
        agent.idleActivity,
        isEndingCutscene ? 0.68 : agent.strideGain,
        dt
      );

      // Gentle joyful hop for crew during Sol 30 victory celebration
      if (isEndingVictory && !this.reducedMotion) {
        const bodyGroup = agent.container.getByName('bodyGroup') as Phaser.GameObjects.Container | null;
        if (bodyGroup) {
          bodyGroup.y -= Math.max(0, Math.sin(this.elapsedTime * 5.0 + agent.phaseOffset * 2.1)) * 6.5;
        }
      }
    }
  }

  private renderActiveWorkAnimation(isSleeping = false, state?: GameState) {
    const g = this.actionAnimLayer;
    if (!g) return;
    g.clear();

    if (isSleeping) {
      const hab = this.buildingVisuals.get('main_habitat');
      if (hab) {
        for (let i = 0; i < 3; i++) {
          const cycle = (this.elapsedTime * 0.55 + i * 0.33) % 1;
          const zx = hab.baseX + 18 + i * 11 + Math.sin(this.elapsedTime * 2.4 + i) * 5;
          const zy = hab.baseY - hab.height / 2 - 12 - cycle * 38;
          const size = 7 + i * 2;
          const alpha = Math.sin(cycle * Math.PI) * 0.95;
          g.lineStyle(2.6, 0xffe49c, alpha);
          g.lineBetween(zx - size * 0.5, zy - size * 0.5, zx + size * 0.5, zy - size * 0.5);
          g.lineBetween(zx + size * 0.5, zy - size * 0.5, zx - size * 0.5, zy + size * 0.5);
          g.lineBetween(zx - size * 0.5, zy + size * 0.5, zx + size * 0.5, zy + size * 0.5);
        }
      }
    }

    // Animated bouncing tutorial beacon above Solar Panels on Step 0
    const tutorialStep =
      state?.screen === 'PLAYING' ? getCurrentTutorialStep(state) : null;
    if (
      tutorialStep?.highlight === 'solar_panels' &&
      state?.selectedBuildingId !== 'solar_panels'
    ) {
      const solar = this.buildingVisuals.get('solar_panels');
      if (solar) {
        const bounce = this.reducedMotion ? 0 : Math.sin(this.elapsedTime * 5.2) * 7;
        const ax = solar.baseX;
        const ay = solar.baseY - solar.height / 2 - 42 + bounce;

        // Pulsing circular target beacon beneath arrow
        const pulseR = 12 + (this.reducedMotion ? 0 : (Math.sin(this.elapsedTime * 5.2) + 1) * 4);
        g.lineStyle(3, 0xf4c552, 0.85);
        g.strokeCircle(ax, solar.baseY - solar.height / 2 - 14, pulseR);

        // Bold downward pointing arrow with charcoal comic-ink outline
        g.fillStyle(PALETTE.charcoal, 1);
        g.fillRoundedRect(ax - 7, ay - 24, 14, 18, 4);
        g.fillTriangle(ax - 15, ay - 9, ax + 15, ay - 9, ax, ay + 8);

        g.fillStyle(0xf4c552, 1);
        g.fillRoundedRect(ax - 4.5, ay - 22, 9, 15, 3);
        g.fillTriangle(ax - 11.5, ay - 9, ax + 11.5, ay - 9, ax, ay + 4);
      }
    }

    // Destination ring when NAS is walking to perform an arrival-gated task
    if (state?.pendingAction?.phase === 'walking' && this.nas) {
      const door = gridManager.getBuildingDoorstep(
        state.pendingAction.buildingId,
        this.nas.x,
        this.nas.y
      );
      const ringPulse = 0.55 + 0.45 * Math.sin(this.elapsedTime * 6);
      g.lineStyle(2.8, 0xf4c552, 0.5 + ringPulse * 0.45);
      g.strokeCircle(door.x, door.y, 11 + ringPulse * 4);
      g.fillStyle(0xf4c552, 0.35);
      g.fillCircle(door.x, door.y, 5);
    }

    const anim = this.activeWorkAnim;
    if (!anim || state?.pendingAction?.phase !== 'working') return;

    const visual = this.buildingVisuals.get(anim.buildingId);
    if (!visual) return;

    const elapsed = Math.max(0, this.elapsedTime - anim.startedAt);
    const progress =
      anim.duration > 0
        ? Phaser.Math.Clamp(elapsed / anim.duration, 0, 1)
        : (elapsed * 0.65) % 1;
    const cx = visual.baseX;
    const cy = visual.baseY;
    const hw = visual.width / 2;
    const hh = visual.height / 2;

    if (anim.kind === 'restore') {
      // Active construction beam frame & welding sparks
      g.lineStyle(3, 0xf4c552, 0.85);
      const buildHeight = hh * 2 * progress;
      g.strokeRoundedRect(cx - hw - 4, cy + hh - buildHeight, visual.width + 8, Math.max(8, buildHeight), 10);

      if (anim.buildingId === 'greenhouse') {
        // Greenhouse roof truss beams snapping into place
        g.lineStyle(3, PALETTE.creamLight, 0.9);
        const beamX = cx - hw + progress * visual.width;
        g.lineBetween(cx - hw + 10, cy - hh + 8, beamX, cy - hh + 8);
        g.lineBetween(cx - hw + 10, cy + hh - 8, beamX, cy + hh - 8);
      }

      // Welding / wrench sparks popping near building center & NAS
      for (let i = 0; i < 6; i++) {
        const angle = elapsed * 9 + (i * Math.PI) / 3;
        const dist = 10 + ((elapsed * 45 + i * 7) % 24);
        const sx = cx + Math.cos(angle) * dist;
        const sy = cy + Math.sin(angle) * (dist * 0.65);
        g.fillStyle(i % 2 === 0 ? 0xf4c552 : PALETTE.terracotta, 0.95);
        g.fillCircle(sx, sy, 3.2);
      }
    } else if (anim.kind === 'repair') {
      // Wrench spin ring & tool sparks
      g.lineStyle(3, PALETTE.techBlueLight, 0.8);
      g.strokeCircle(cx, cy, 24 + Math.sin(elapsed * 12) * 5);
      for (let i = 0; i < 4; i++) {
        const a = elapsed * 10 + (i * Math.PI) / 2;
        g.fillStyle(0xf4c552, 0.9);
        g.fillCircle(cx + Math.cos(a) * 28, cy + Math.sin(a) * 18, 3);
      }
    } else if (anim.kind === 'clean') {
      // Sweeping dust clouds scattering & solar blue glints
      for (let i = 0; i < 6; i++) {
        const sweep = (elapsed * 1.8 + i * 0.18) % 1;
        const dx = cx - hw + 18 + sweep * (visual.width - 20);
        const dy = cy - hh + 18 + ((i * 23) % (visual.height - 30));
        g.fillStyle(PALETTE.sand, (1 - sweep) * 0.75);
        g.fillCircle(dx, dy, 6 + sweep * 5);
      }
      g.lineStyle(3, 0xffffff, 0.8);
      const glintX = cx - hw + progress * visual.width;
      g.lineBetween(glintX - 12, cy - hh + 12, glintX + 12, cy + hh - 12);
    } else if (anim.kind === 'plant') {
      // Seeds arcing into the 3 greenhouse planter beds + water droplets + sprouts
      for (let bed = 0; bed < 3; bed++) {
        const bedX = cx - hw * 0.55 + bed * (hw * 0.55);
        const arcP = Phaser.Math.Clamp(progress * 1.4 - bed * 0.12, 0, 1);
        if (arcP > 0 && arcP < 1) {
          const sx = Phaser.Math.Linear(cx, bedX, arcP);
          const sy = Phaser.Math.Linear(cy + hh + 10, cy, arcP) - Math.sin(arcP * Math.PI) * 28;
          g.fillStyle(0xf4c552, 1);
          g.fillCircle(sx, sy, 4);
        }
        // Blue water mist & green sprout popping up in second half
        if (progress > 0.4) {
          const sproutP = (progress - 0.4) / 0.6;
          g.fillStyle(PALETTE.techBlueLight, (1 - sproutP) * 0.85);
          g.fillCircle(bedX - 8, cy - 10 + sproutP * 14, 3);
          g.fillCircle(bedX + 8, cy - 6 + sproutP * 12, 3);

          g.fillStyle(PALETTE.lifeGreenBright, 1);
          g.fillCircle(bedX, cy, 4 + sproutP * 5);
        }
      }
    } else if (anim.kind === 'harvest') {
      // Golden & green harvest orbs lifting up out of Greenhouse
      for (let i = 0; i < 6; i++) {
        const ox = cx - 45 + i * 18;
        const oy = cy - progress * 44 - Math.sin(progress * Math.PI + i) * 10;
        g.fillStyle(i % 2 === 0 ? PALETTE.lifeGreenBright : 0xf4c552, 1 - progress * 0.6);
        g.fillCircle(ox, oy, 5.5);
      }
    }
  }

  private renderInfrastructureConduits(
    state: GameState,
    lighting: ReturnType<OutpostScene['computeDayNightLighting']>,
    hasPowerForLifeSupport: boolean,
    solarOutputFactor: number
  ) {
    const g = this.conduitsLayer;
    if (!g) return;
    g.clear();

    const drawPipeSegment = (
      points: Point2D[],
      active: boolean,
      damaged: boolean,
      flowColor: number,
      speed: number,
      width = 3
    ) => {
      if (points.length < 2) return;

      // Subtle thin outer border so pipes stay grounded & non-distracting
      g.lineStyle(width + 1.5, PALETTE.charcoal, active ? 0.34 : 0.18);
      g.beginPath();
      g.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
      g.strokePath();

      // Muted pipe core
      const coreColor = active ? 0x5c666b : damaged ? 0x61554c : 0x3b3836;
      g.lineStyle(width, coreColor, active ? 0.42 : 0.24);
      g.beginPath();
      g.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
      g.strokePath();

      // Compute cumulative segment lengths for gentle directional flow pulses
      let totalLen = 0;
      const segLens: number[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
        segLens.push(len);
        totalLen += len;
      }
      if (totalLen <= 1) return;

      const sampleAt = (dist: number): Point2D => {
        let d = Math.max(0, Math.min(totalLen, dist));
        for (let i = 0; i < segLens.length; i++) {
          if (d <= segLens[i] || i === segLens.length - 1) {
            const t = segLens[i] > 0 ? d / segLens[i] : 0;
            return {
              x: Phaser.Math.Linear(points[i].x, points[i + 1].x, t),
              y: Phaser.Math.Linear(points[i].y, points[i + 1].y, t),
            };
          }
          d -= segLens[i];
        }
        return points[points.length - 1];
      };

      if (active) {
        const spacing = 54;
        const count = Math.max(1, Math.floor(totalLen / spacing));
        const offset = this.reducedMotion ? 0.5 : (this.elapsedTime * speed * 0.65) % 1;
        for (let i = 0; i < count; i++) {
          const dist = ((i + offset) / count) * totalLen;
          const pt = sampleAt(dist);
          g.fillStyle(flowColor, 0.55);
          g.fillCircle(pt.x, pt.y, Math.max(1.4, width * 0.5));
        }
      } else if (damaged && !this.reducedMotion) {
        // Subtle stuttering amber indicator on damaged pipes
        const flicker = 0.16 + 0.22 * Math.sin(this.elapsedTime * 4 + points[0].x);
        const mid = sampleAt(totalLen * 0.5);
        g.fillStyle(0xd99b52, flicker);
        g.fillCircle(mid.x, mid.y, 1.6);
      }
    };

    const solar = state.buildings.solar_panels;
    const battery = state.buildings.energy_storage;
    const habitat = state.buildings.main_habitat;
    const workshop = state.buildings.maintenance_facility;
    const shelter = state.buildings.radiation_shelter;
    const o2Gen = state.buildings.oxygen_generator;
    const o2Store = state.buildings.oxygen_storage;
    const waterRec = state.buildings.water_recycling;
    const waterStore = state.buildings.water_storage;
    const greenhouse = state.buildings.greenhouse;
    const foodStore = state.buildings.food_storage;

    const solarActive = solar.status === 'operational' && solarOutputFactor > 0.12;
    const solarDamaged = solar.status === 'damaged';
    const powerBusActive =
      hasPowerForLifeSupport &&
      (solar.status === 'operational' ||
        (battery.status !== 'inactive' && state.resources.energy > 0));
    const powerBusDamaged =
      !powerBusActive && (solar.status === 'damaged' || battery.status === 'damaged');

    // 1. Power Conduits (subtle thin amber lines)
    drawPipeSegment(
      [
        { x: 108, y: 144 },
        { x: 108, y: 216 },
      ],
      solarActive && battery.status !== 'inactive',
      solarDamaged || battery.status === 'damaged',
      0xf4c552,
      1.1,
      2.5
    );
    drawPipeSegment(
      [
        { x: 252, y: 144 },
        { x: 252, y: 180 },
        { x: 360, y: 180 },
      ],
      (solarActive || powerBusActive) && shelter.status !== 'inactive',
      shelter.status === 'damaged',
      0xf4c552,
      1.0,
      2.5
    );
    drawPipeSegment(
      [
        { x: 144, y: 288 },
        { x: 252, y: 288 },
        { x: 252, y: 360 },
        { x: 288, y: 360 },
      ],
      powerBusActive && habitat.status !== 'inactive',
      powerBusDamaged || habitat.status === 'damaged',
      0xf4c552,
      1.05,
      2.5
    );
    drawPipeSegment(
      [
        { x: 252, y: 360 },
        { x: 252, y: 468 },
        { x: 216, y: 468 },
      ],
      powerBusActive && workshop.status !== 'inactive',
      workshop.status === 'damaged',
      0xf4c552,
      0.95,
      2.5
    );
    drawPipeSegment(
      [
        { x: 504, y: 126 },
        { x: 540, y: 126 },
        { x: 576, y: 126 },
      ],
      powerBusActive && o2Gen.status !== 'inactive',
      o2Gen.status === 'damaged',
      0xf4c552,
      1.0,
      2.5
    );
    drawPipeSegment(
      [
        { x: 540, y: 126 },
        { x: 540, y: 270 },
        { x: 576, y: 270 },
      ],
      powerBusActive && waterRec.status !== 'inactive',
      waterRec.status === 'damaged',
      0xf4c552,
      1.0,
      2.5
    );
    drawPipeSegment(
      [
        { x: 540, y: 270 },
        { x: 540, y: 468 },
        { x: 576, y: 468 },
      ],
      powerBusActive && greenhouse.status !== 'inactive',
      greenhouse.status === 'damaged',
      0xf4c552,
      1.0,
      2.5
    );

    // 2. Oxygen Pipes (subtle thin mint-cyan lines)
    const o2Active = o2Gen.status === 'operational' && hasPowerForLifeSupport;
    const o2Damaged = o2Gen.status === 'damaged';
    drawPipeSegment(
      [
        { x: 720, y: 108 },
        { x: 792, y: 108 },
      ],
      o2Active && o2Store.status !== 'inactive',
      o2Damaged || o2Store.status === 'damaged',
      0x7be0d6,
      1.15,
      3
    );
    drawPipeSegment(
      [
        { x: 576, y: 98 },
        { x: 554, y: 98 },
        { x: 554, y: 324 },
        { x: 504, y: 324 },
      ],
      o2Active && habitat.status !== 'inactive',
      o2Damaged,
      0x7be0d6,
      1.05,
      3
    );

    // 3. Water Pipes (subtle thin sky-blue lines)
    const waterActive = waterRec.status === 'operational' && hasPowerForLifeSupport;
    const waterDamaged = waterRec.status === 'damaged';
    drawPipeSegment(
      [
        { x: 720, y: 324 },
        { x: 792, y: 324 },
      ],
      waterActive && waterStore.status !== 'inactive',
      waterDamaged || waterStore.status === 'damaged',
      0x8be2ff,
      1.2,
      3
    );
    drawPipeSegment(
      [
        { x: 666, y: 360 },
        { x: 666, y: 432 },
      ],
      waterActive && greenhouse.status !== 'inactive',
      waterDamaged || greenhouse.status === 'damaged',
      0x8be2ff,
      1.2,
      3
    );
    drawPipeSegment(
      [
        { x: 576, y: 342 },
        { x: 526, y: 342 },
        { x: 526, y: 384 },
        { x: 504, y: 384 },
      ],
      waterActive && habitat.status !== 'inactive',
      waterDamaged,
      0x8be2ff,
      1.0,
      3
    );

    // 4. Greenhouse -> Food Vault Supply Track (subtle thin sage-green conduit)
    const foodFlowActive =
      greenhouse.status === 'operational' &&
      foodStore.status !== 'inactive' &&
      Boolean(state.greenhouseCrop);
    drawPipeSegment(
      [
        { x: 612, y: 576 },
        { x: 612, y: 612 },
        { x: 432, y: 612 },
      ],
      foodFlowActive,
      greenhouse.status === 'damaged' || foodStore.status === 'damaged',
      PALETTE.lifeGreenBright,
      0.8,
      2.5
    );
    void lighting;
  }

  private triggerWorkCompletion(anim: ActiveWorkAnimation, visual: BuildingVisual) {
    this.spawnCompletionBurst(visual.baseX, visual.baseY, anim.kind, anim.buildingId);
    this.spawnFloatingFeedback(visual.baseX, visual.baseY - 28, anim.label, 'success');

    if (!this.reducedMotion) {
      const healRing = this.add.graphics();
      healRing.setDepth(74);
      healRing.fillStyle(0xffffff, 0.24);
      healRing.fillRoundedRect(
        visual.baseX - visual.width / 2,
        visual.baseY - visual.height / 2,
        visual.width,
        visual.height,
        12
      );
      healRing.lineStyle(4, PALETTE.lifeGreenBright, 0.95);
      healRing.strokeRoundedRect(
        visual.baseX - visual.width / 2 - 4,
        visual.baseY - visual.height / 2 - 4,
        visual.width + 8,
        visual.height + 8,
        14
      );
      this.tweens.add({
        targets: healRing,
        alpha: 0,
        duration: 720,
        ease: 'Cubic.easeOut',
        onComplete: () => healRing.destroy(),
      });

      this.tweens.add({
        targets: visual.container,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 160,
        yoyo: true,
        ease: 'Back.easeOut',
      });

      this.nasJumpUntil = this.elapsedTime + 0.36;
    }
  }

  private spawnCompletionBurst(
    x: number,
    y: number,
    kind: ActionAnimKind,
    buildingId: BuildingId
  ) {
    if (this.reducedMotion) return;

    const primaryColor =
      kind === 'plant' || kind === 'harvest'
        ? PALETTE.lifeGreenBright
        : buildingId === 'water_recycling'
        ? PALETTE.techBlueLight
        : buildingId === 'oxygen_generator'
        ? 0xdcf4ff
        : 0xf4c552;

    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const dist = Phaser.Math.Between(34, 64);
      const star = this.add.circle(
        x,
        y,
        Phaser.Math.Between(4, 7),
        i % 2 === 0 ? primaryColor : 0xfaf0dc,
        0.95
      );
      star.setDepth(75);
      this.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 12,
        alpha: 0,
        scale: 0.4,
        duration: 550,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy(),
      });
    }
  }

  private spawnFootDust(x: number, y: number) {
    const puff = this.add.circle(x, y, Phaser.Math.Between(3, 5), PALETTE.sand, 0.6);
    puff.setDepth(38);
    this.tweens.add({
      targets: puff,
      y: y - 8,
      scale: 1.6,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    });
  }
}
