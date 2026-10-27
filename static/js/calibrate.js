/**
 * WearItNow - Calibration & Manual Garment Tuning Controller
 * Provides real-time interactive manual sliders for position, scale, rotation,
 * height, perspective, and sleeve angles, with comparison against MediaPipe auto-detected values.
 */

import * as THREE from 'three';
import { GarmentModelFactory } from './garment_models.js?v=11.0';

/**
 * Ground-Truth Calibrated Presets from Empirical Manual Tuning
 */
const DEFAULT_PRESETS = {
    male_tshirt: {
        posX: -0.015, posY: 0.055, posZ: -0.5,
        scaleX: 1.82, scaleY: 2.5, scaleZ: 2,
        rotYaw: -1, rotPitch: -5.5, rotRoll: 0,
        armLeft: 0, armRight: 0,
        camFov: 55, camDist: 3.3,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: true
    },
    male_formal_shirt: {
        posX: 0.035, posY: 0.055, posZ: -0.5,
        scaleX: 1.9, scaleY: 2.36, scaleZ: 2,
        rotYaw: -1, rotPitch: -5.5, rotRoll: 0,
        armLeft: 0, armRight: 0,
        camFov: 55, camDist: 3.3,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: false
    },
    male_jacket: {
        posX: 0.02, posY: 0.125, posZ: -0.305,
        scaleX: 1.82, scaleY: 2.6, scaleZ: 2,
        rotYaw: -1, rotPitch: -5.5, rotRoll: 0,
        armLeft: 0, armRight: 0,
        camFov: 66, camDist: 3.3,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: true
    },
    male_hoodie: {
        posX: 0.015, posY: 0.09, posZ: -0.4,
        scaleX: 1.86, scaleY: 2.55, scaleZ: 2,
        rotYaw: -1, rotPitch: -5.5, rotRoll: 0,
        armLeft: 0, armRight: 0,
        camFov: 58, camDist: 3.3,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: false
    },
    desk_formal_shirt: {
        posX: 0.34, posY: -0.515, posZ: 0.03,
        scaleX: 2.24, scaleY: 2.22, scaleZ: 2,
        rotYaw: -41, rotPitch: -23.5, rotRoll: -9,
        armLeft: -1.73, armRight: 9.24,
        camFov: 68, camDist: 2.55,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: false
    },
    desk_tshirt: {
        posX: 0.33, posY: -0.495, posZ: 0.025,
        scaleX: 2.38, scaleY: 2.32, scaleZ: 2,
        rotYaw: -44.5, rotPitch: -25, rotRoll: -13,
        armLeft: 0, armRight: 0,
        camFov: 45, camDist: 3.7,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: false
    },
    desk_hoodie: {
        posX: 0.2, posY: -0.525, posZ: 0.025,
        scaleX: 2.38, scaleY: 2.32, scaleZ: 1.253,
        rotYaw: -47, rotPitch: -19.5, rotRoll: -12.5,
        armLeft: 0, armRight: 0,
        camFov: 45, camDist: 3.45,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: false
    },
    desk_jacket: {
        posX: 0.28, posY: -0.51, posZ: 0.028,
        scaleX: 2.35, scaleY: 2.30, scaleZ: 2,
        rotYaw: -44.5, rotPitch: -22.5, rotRoll: -11.5,
        armLeft: 0, armRight: 0,
        camFov: 52, camDist: 3.45,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: false
    },
    female_formal_shirt: {
        posX: 0.005, posY: -0.065, posZ: 0.04,
        scaleX: 1.54, scaleY: 2.08, scaleZ: 1.65,
        rotYaw: -5.5, rotPitch: -10.5, rotRoll: -3,
        armLeft: -6.83, armRight: 7.90,
        camFov: 68, camDist: 2.55,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: false
    },
    female_tshirt: {
        posX: 0.005, posY: -0.035, posZ: 0.04,
        scaleX: 1.47, scaleY: 1.94, scaleZ: 1.65,
        rotYaw: -5.5, rotPitch: -10.5, rotRoll: -2.5,
        armLeft: -6.83, armRight: 7.90,
        camFov: 68, camDist: 2.55,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: false
    },
    female_hoodie: {
        posX: 0.005, posY: -0.05, posZ: 0.04,
        scaleX: 1.54, scaleY: 2.05, scaleZ: 1.65,
        rotYaw: -5.5, rotPitch: -10.5, rotRoll: -2.8,
        armLeft: -6.83, armRight: 7.90,
        camFov: 68, camDist: 2.55,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: false
    },
    female_jacket: {
        posX: 0.005, posY: -0.05, posZ: 0.04,
        scaleX: 1.54, scaleY: 2.06, scaleZ: 1.65,
        rotYaw: -5.5, rotPitch: -10.5, rotRoll: -2.8,
        armLeft: -6.83, armRight: 7.90,
        camFov: 68, camDist: 2.55,
        opacity: 1, wireframe: false, showSkeleton: true, lockAspect: false
    }
};

class CalibrationLab {
    constructor() {
        // Subjects
        this.subjects = {
            male: { name: 'Male Standing', url: '/samples/test_person_male.jpg' },
            desk: { name: 'Desk Turned', url: '/samples/test_person_turned.jpg' },
            female: { name: 'Female Standing', url: '/samples/test_person_female.jpg' },
        };
        this.currentSubjectKey = 'male';

        // Garments
        this.garments = {
            tshirt: { name: 'T-Shirt', url: '/samples/tshirt.png' },
            formal_shirt: { name: 'Formal Shirt', url: '/samples/formal_shirt.png' },
            hoodie: { name: 'Hoodie', url: '/samples/hoodie.png' },
            jacket: { name: 'Jacket', url: '/samples/jacket.png' },
        };
        this.currentGarmentKey = 'tshirt';

        // Stored Presets Cache (localStorage merged with empirical defaults)
        this.presets = this._loadStoredPresets();

        // DOM elements
        this.subjectImg = document.getElementById('subject-img');
        this.skeletonCanvas = document.getElementById('skeleton-canvas');
        this.webglCanvas = document.getElementById('webgl-canvas');
        this.viewportContainer = document.getElementById('viewport-container');

        // Three.js State
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.currentGarment = null;
        this.currentTexture = null;

        // MediaPipe State
        this.landmarker = null;
        this.poseData = null;
        this.isLandmarkerReady = false;

        // Transforms
        this.autoValues = {};
        this.manualValues = {
            posX: 0,
            posY: -0.15,
            posZ: 0.04,
            scaleX: 1.0,
            scaleY: 1.06,
            scaleZ: 0.72,
            rotYaw: 0,
            rotPitch: 0,
            rotRoll: 0,
            armLeft: -12,
            armRight: 12,
            camFov: 50,
            camDist: 3.2,
            opacity: 1.0,
            wireframe: false,
            showSkeleton: true,
            lockAspect: true
        };

        this._aspectRatioTorso = 1.06 / 1.00;

        this._initThree();
        this._setupEventListeners();
        this._syncSlidersFromManualValues();
        this._loadGarment(this.currentGarmentKey);
        this._initMediaPipe();
        this._loadSubject(this.currentSubjectKey);
    }

    _loadStoredPresets() {
        try {
            const raw = localStorage.getItem('wearitnow_calibration_presets');
            const stored = raw ? JSON.parse(raw) : {};
            return { ...DEFAULT_PRESETS, ...stored };
        } catch (e) {
            console.warn('Failed to load presets from localStorage:', e);
            return { ...DEFAULT_PRESETS };
        }
    }

    _saveStoredPresets() {
        try {
            localStorage.setItem('wearitnow_calibration_presets', JSON.stringify(this.presets));
        } catch (e) {
            console.warn('Failed to save presets to localStorage:', e);
        }
    }

    /**
     * Initialize Three.js scene, camera, lights, and WebGL renderer
     */
    _initThree() {
        this.scene = new THREE.Scene();

        const aspect = this.viewportContainer.clientWidth / (this.viewportContainer.clientHeight || 1);
        this.camera = new THREE.PerspectiveCamera(this.manualValues.camFov, aspect, 0.1, 100);
        this.camera.position.set(0, 0, this.manualValues.camDist);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.webglCanvas,
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;

        // Realistic Studio Cloth Lights
        const ambient = new THREE.AmbientLight(0xffffff, 1.25);
        this.scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xfff8ee, 1.35);
        keyLight.position.set(1.5, 2.5, 3.0);
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xe8f4ff, 0.85);
        fillLight.position.set(-2.0, 1.5, 2.0);
        this.scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.35);
        rimLight.position.set(0, -1.0, 1.5);
        this.scene.add(rimLight);

        this._resizeViewports();
        window.addEventListener('resize', () => this._resizeViewports());

        // Render loop
        const animate = () => {
            requestAnimationFrame(animate);
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }

    _resizeViewports() {
        const w = this.viewportContainer.clientWidth;
        const h = this.viewportContainer.clientHeight;
        if (!w || !h) return;

        this.skeletonCanvas.width = w;
        this.skeletonCanvas.height = h;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);

        if (this.poseData) {
            this._drawSkeleton();
        }
    }

    /**
     * Initialize MediaPipe BlazePose Vision Engine
     */
    async _initMediaPipe() {
        const statusText = document.getElementById('status-text');
        if (statusText) statusText.textContent = 'Loading MediaPipe...';

        let PoseLandmarkerClass = window.PoseLandmarker;
        let FilesetResolverClass = window.FilesetResolver;

        if (!PoseLandmarkerClass && window.tasksVision) {
            PoseLandmarkerClass = window.tasksVision.PoseLandmarker;
            FilesetResolverClass = window.tasksVision.FilesetResolver;
        }

        if (!PoseLandmarkerClass) {
            const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18");
            PoseLandmarkerClass = vision.PoseLandmarker;
            FilesetResolverClass = vision.FilesetResolver;
        }

        const wasmResolver = await FilesetResolverClass.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
        );

        const primaryModelUrl = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
        const fallbackModelUrl = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

        const loadModel = async (url, delegate = "GPU") => {
            return await PoseLandmarkerClass.createFromOptions(wasmResolver, {
                baseOptions: {
                    modelAssetPath: url,
                    delegate,
                },
                runningMode: "IMAGE",
                numPoses: 1,
                minPoseDetectionConfidence: 0.5,
                minPosePresenceConfidence: 0.5,
            });
        };

        try {
            this.landmarker = await loadModel(primaryModelUrl, "GPU");
        } catch (e) {
            console.warn("GPU delegate full model failed, trying CPU:", e);
            try {
                this.landmarker = await loadModel(primaryModelUrl, "CPU");
            } catch (e2) {
                console.warn("Full model failed, fallback to lite:", e2);
                this.landmarker = await loadModel(fallbackModelUrl, "CPU");
            }
        }

        this.isLandmarkerReady = true;
        if (statusText) statusText.textContent = 'Pose Calibrated';

        // Re-detect on active subject
        this._runPoseDetection();
    }

    /**
     * Load Subject Photo
     */
    _loadSubject(subjectKey, customUrl = null) {
        this.currentSubjectKey = subjectKey;
        const url = customUrl || this.subjects[subjectKey]?.url;
        if (!url) return;

        this.subjectImg.onload = () => {
            this._runPoseDetection();
        };
        this.subjectImg.src = url;

        // Update active UI chips
        document.querySelectorAll('.selector-bar button[id^="btn-sub-"]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subject === subjectKey);
        });
    }

    /**
     * Run Pose Detection on Subject
     */
    _runPoseDetection() {
        if (!this.isLandmarkerReady || !this.landmarker || !this.subjectImg.complete) return;

        try {
            let results = null;
            try {
                results = this.landmarker.detect(this.subjectImg);
            } catch (detectErr) {
                const offscreen = document.createElement('canvas');
                offscreen.width = this.subjectImg.naturalWidth || 640;
                offscreen.height = this.subjectImg.naturalHeight || 480;
                const ctx = offscreen.getContext('2d');
                ctx.drawImage(this.subjectImg, 0, 0);
                results = this.landmarker.detect(offscreen);
            }

            if (results && results.landmarks && results.landmarks.length > 0) {
                const lm = results.landmarks[0];
                this.poseData = this._extractMetrics(lm, this.subjectImg.naturalWidth, this.subjectImg.naturalHeight);
                this._drawSkeleton();
                this._computeAutoValues();
                this._checkSavedPresetOrApplyAuto();
            } else {
                console.warn('No pose detected on subject');
            }
        } catch (e) {
            console.error('Pose detection error:', e);
        }
    }

    _extractMetrics(lm, width, height) {
        const ls = lm[11], rs = lm[12], le = lm[13], re = lm[14];
        const lh = lm[23], rh = lm[24];

        const scX = (ls.x + rs.x) / 2;
        const scY = (ls.y + rs.y) / 2;
        const scZ = ((ls.z || 0) + (rs.z || 0)) / 2;

        const dx = Math.abs(ls.x - rs.x);
        const dy = (ls.y - rs.y);
        const sw = Math.hypot(dx, dy);

        const roll = Math.atan2(rs.y - ls.y, Math.max(0.01, dx));
        const yaw = Math.atan2((rs.z || 0) - (ls.z || 0), Math.max(0.05, dx));
        const pitch = Math.atan2(scZ - (((lh.z || 0) + (rh.z || 0)) / 2), 0.5);

        const leftArmAngle = Math.atan2(le.x - ls.x, Math.max(0.01, le.y - ls.y));
        const rightArmAngle = Math.atan2(re.x - rs.x, Math.max(0.01, re.y - rs.y));

        const bodyCage = this._buildBodyCage(lm);

        return {
            landmarks: lm,
            bodyCage,
            center: { x: scX, y: scY, z: scZ },
            shoulderWidth: sw,
            roll, yaw, pitch,
            leftArmAngle, rightArmAngle
        };
    }

    _buildBodyCage(lm) {
        if (!lm || lm.length < 25) return null;

        const getPt = (idx) => {
            const p = lm[idx];
            if (!p) return { x: 0.5, y: 0.5, z: 0 };
            return { x: p.x, y: p.y, z: p.z || 0, visibility: p.visibility ?? 1.0 };
        };

        const ls = getPt(11);
        const rs = getPt(12);
        const le = getPt(13);
        const re = getPt(14);
        const lw = getPt(15);
        const rw = getPt(16);
        const lh = getPt(23);
        const rh = getPt(24);

        const shoulderCenter = {
            x: (ls.x + rs.x) / 2,
            y: (ls.y + rs.y) / 2,
            z: (ls.z + rs.z) / 2
        };
        const shoulderWidth = Math.hypot(ls.x - rs.x, ls.y - rs.y);

        const neck = {
            x: shoulderCenter.x,
            y: shoulderCenter.y - shoulderWidth * 0.04,
            z: shoulderCenter.z
        };

        const clavicleLeft = {
            x: ls.x * 0.65 + neck.x * 0.35,
            y: ls.y * 0.65 + neck.y * 0.35,
            z: ls.z * 0.65 + neck.z * 0.35
        };
        const clavicleRight = {
            x: rs.x * 0.65 + neck.x * 0.35,
            y: rs.y * 0.65 + neck.y * 0.35,
            z: rs.z * 0.65 + neck.z * 0.35
        };

        const hipsVisible = (lh.visibility > 0.35 && rh.visibility > 0.35);
        let hipLeft, hipRight, hipCenter;

        if (hipsVisible) {
            hipLeft = { ...lh };
            hipRight = { ...rh };
            hipCenter = {
                x: (lh.x + rh.x) / 2,
                y: (lh.y + rh.y) / 2,
                z: (lh.z + rh.z) / 2
            };
        } else {
            const torsoLen = Math.max(0.35, shoulderWidth * 1.30);
            hipCenter = {
                x: shoulderCenter.x,
                y: shoulderCenter.y + torsoLen,
                z: shoulderCenter.z
            };
            hipLeft = {
                x: hipCenter.x + (ls.x - shoulderCenter.x) * 0.88,
                y: hipCenter.y,
                z: ls.z
            };
            hipRight = {
                x: hipCenter.x + (rs.x - shoulderCenter.x) * 0.88,
                y: hipCenter.y,
                z: rs.z
            };
        }

        const sternum = {
            x: shoulderCenter.x * 0.70 + hipCenter.x * 0.30,
            y: shoulderCenter.y * 0.70 + hipCenter.y * 0.30,
            z: shoulderCenter.z * 0.70 + hipCenter.z * 0.30 - 0.025 * shoulderWidth
        };

        const solarPlexus = {
            x: shoulderCenter.x * 0.45 + hipCenter.x * 0.55,
            y: shoulderCenter.y * 0.45 + hipCenter.y * 0.55,
            z: shoulderCenter.z * 0.45 + hipCenter.z * 0.55 - 0.015 * shoulderWidth
        };

        const navel = {
            x: shoulderCenter.x * 0.20 + hipCenter.x * 0.80,
            y: shoulderCenter.y * 0.20 + hipCenter.y * 0.80,
            z: shoulderCenter.z * 0.20 + hipCenter.z * 0.80
        };

        const leftArmpit = {
            x: ls.x * 0.85 + hipLeft.x * 0.15,
            y: ls.y * 0.85 + hipLeft.y * 0.15,
            z: ls.z * 0.85 + hipLeft.z * 0.15
        };
        const rightArmpit = {
            x: rs.x * 0.85 + hipRight.x * 0.15,
            y: rs.y * 0.85 + hipRight.y * 0.15,
            z: rs.z * 0.85 + hipRight.z * 0.15
        };

        const leftRib = {
            x: leftArmpit.x * 0.55 + hipLeft.x * 0.45,
            y: leftArmpit.y * 0.55 + hipLeft.y * 0.45,
            z: leftArmpit.z * 0.55 + hipLeft.z * 0.45
        };
        const rightRib = {
            x: rightArmpit.x * 0.55 + hipRight.x * 0.45,
            y: rightArmpit.y * 0.55 + hipRight.y * 0.45,
            z: rightArmpit.z * 0.55 + hipRight.z * 0.45
        };

        const leftWaist = {
            x: leftRib.x * 0.45 + hipLeft.x * 0.55,
            y: leftRib.y * 0.45 + hipLeft.y * 0.55,
            z: leftRib.z * 0.45 + hipLeft.z * 0.55
        };
        const rightWaist = {
            x: rightRib.x * 0.45 + hipRight.x * 0.55,
            y: rightRib.y * 0.45 + hipRight.y * 0.55,
            z: rightRib.z * 0.45 + hipRight.z * 0.55
        };

        return {
            neck,
            clavicleLeft,
            clavicleRight,
            leftShoulder: ls,
            rightShoulder: rs,
            leftArmpit,
            rightArmpit,
            sternum,
            solarPlexus,
            navel,
            leftRib,
            rightRib,
            leftWaist,
            rightWaist,
            leftHip: hipLeft,
            rightHip: hipRight,
            hipCenter,
            leftElbow: le,
            rightElbow: re,
            leftWrist: lw,
            rightWrist: rw,
            shoulderWidth,
            shoulderCenter,
            torsoHeight: Math.hypot(hipCenter.x - shoulderCenter.x, hipCenter.y - shoulderCenter.y)
        };
    }

    _computeAutoValues() {
        if (!this.poseData) return;

        const dist = this.camera.position.z;
        const fovRad = (this.camera.fov * Math.PI) / 180;
        const visibleHeight = 2.0 * Math.tan(fovRad / 2) * dist;
        const visibleWidth = visibleHeight * this.camera.aspect;

        const sw = this.poseData.shoulderWidth;
        const personWidth3D = sw * visibleWidth;

        // Auto Model Scale with foreshortening compensation
        const rawYaw = this.poseData.yaw || 0;
        const cosYaw = Math.max(0.65, Math.cos(rawYaw));
        const scaleX = (personWidth3D / (0.92 * cosYaw)) * 1.12;

        const isDesk = (this.currentSubjectKey === 'desk');
        const heightRatio = isDesk ? 1.00 : 1.35;
        const scaleY = scaleX * heightRatio;
        const scaleZ = 2.0;

        // Auto Position (chest yaw shift + empirical collarbone alignment)
        const yawShift = -0.15 * personWidth3D * Math.sin(rawYaw);
        const targetX = (this.poseData.center.x - 0.5) * visibleWidth + yawShift;
        const shoulderY = (0.5 - this.poseData.center.y) * visibleHeight;
        const targetY = shoulderY - (0.12 * scaleY);
        const targetZ = isDesk ? 0.03 : -0.45;

        // Auto Rotations (in degrees, with inverted horizontal yaw * 1.20)
        const radToDeg = 180 / Math.PI;
        const yawDeg = Math.max(-50, Math.min(50, -rawYaw * 1.20 * radToDeg));
        const pitchDeg = Math.max(-25, Math.min(25, -Math.abs(this.poseData.pitch * radToDeg * 0.75)));
        const rollDeg = Math.max(-25, Math.min(25, this.poseData.roll * radToDeg));

        // Arm Angles (in degrees)
        const leftArmDeg = 0;
        const rightArmDeg = 0;

        this.autoValues = {
            posX: targetX,
            posY: targetY,
            posZ: targetZ,
            scaleX,
            scaleY,
            scaleZ,
            rotYaw: yawDeg,
            rotPitch: pitchDeg,
            rotRoll: rollDeg,
            armLeft: leftArmDeg,
            armRight: rightArmDeg,
            camFov: isDesk ? 55 : 58,
            camDist: isDesk ? 3.0 : 3.3
        };
    }

    _checkSavedPresetOrApplyAuto() {
        const comboKey = `${this.currentSubjectKey}_${this.currentGarmentKey}`;
        const saved = this.presets[comboKey];

        if (saved) {
            // Apply saved preset
            this.manualValues = { ...this.manualValues, ...saved };
        } else {
            // Apply auto values
            this.manualValues = {
                ...this.manualValues,
                posX: this.autoValues.posX || 0,
                posY: this.autoValues.posY || -0.15,
                posZ: this.autoValues.posZ || 0.04,
                scaleX: this.autoValues.scaleX || 1.0,
                scaleY: this.autoValues.scaleY || 1.06,
                scaleZ: this.autoValues.scaleZ || 0.72,
                rotYaw: this.autoValues.rotYaw || 0,
                rotPitch: this.autoValues.rotPitch || 0,
                rotRoll: this.autoValues.rotRoll || 0,
                armLeft: this.autoValues.armLeft || -12,
                armRight: this.autoValues.armRight || 12,
            };
        }

        this._syncSlidersFromManualValues();
        this._loadGarment(this.currentGarmentKey);
        this._updateDiagnosticsTable();
        this._updatePresetsChipsUI();
    }

    /**
     * Load / Build 3D Garment
     */
    _loadGarment(garmentKey, customTextureUrl = null) {
        this.currentGarmentKey = garmentKey;

        if (this.currentGarment) {
            this.scene.remove(this.currentGarment);
            this.currentGarment = null;
        }

        const textureUrl = customTextureUrl || this.garments[garmentKey]?.url;
        const loader = new THREE.TextureLoader();

        loader.load(textureUrl, (texture) => {
            this.currentTexture = texture;
            this.currentGarment = GarmentModelFactory.createGarment(garmentKey, texture);
            this.scene.add(this.currentGarment);
            this._applyManualTransforms();
        });

        // Update active UI chips
        document.querySelectorAll('.selector-bar button[id^="btn-gar-"]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.garment === garmentKey);
        });
    }

    /**
     * Apply Manual Transforms to 3D Garment
     */
    _applyManualTransforms() {
        if (!this.currentGarment) return;

        const m = this.manualValues;
        const degToRad = Math.PI / 180;

        if (this.poseData?.bodyCage && this.currentGarment.userData?.updateDeformation) {
            this.currentGarment.userData.updateDeformation(this.poseData.bodyCage, this.camera);
            this.currentGarment.position.set(m.posX || 0, m.posY || 0, m.posZ || 0);
            this.currentGarment.rotation.set(
                (m.rotPitch || 0) * degToRad,
                (m.rotYaw || 0) * degToRad,
                (m.rotRoll || 0) * degToRad
            );
            this.currentGarment.scale.set(m.scaleX || 1, m.scaleY || 1, m.scaleZ || 1);
        } else {
            this.currentGarment.position.set(m.posX, m.posY, m.posZ);
            this.currentGarment.scale.set(m.scaleX, m.scaleY, m.scaleZ);

            this.currentGarment.rotation.set(
                m.rotPitch * degToRad,
                m.rotYaw * degToRad,
                m.rotRoll * degToRad
            );
        }

        // Sleeves Articulation
        const ls = this.currentGarment.userData?.leftSleeve;
        const rs = this.currentGarment.userData?.rightSleeve;
        if (ls && !this.poseData?.bodyCage) ls.rotation.z = m.armLeft * degToRad;
        if (rs && !this.poseData?.bodyCage) rs.rotation.z = m.armRight * degToRad;

        // Opacity & Wireframe
        this.currentGarment.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.opacity = m.opacity;
                child.material.wireframe = m.wireframe;
            }
        });

        // Camera
        if (this.camera) {
            if (this.camera.fov !== m.camFov) {
                this.camera.fov = m.camFov;
                this.camera.updateProjectionMatrix();
            }
            this.camera.position.z = m.camDist;
        }

        this._updateDiagnosticsTable();
    }

    /**
     * Draw Skeleton Landmark Overlay
     */
    _drawSkeleton() {
        const ctx = this.skeletonCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.skeletonCanvas.width, this.skeletonCanvas.height);

        if (!this.manualValues.showSkeleton || !this.poseData || !this.poseData.landmarks) return;

        const w = this.skeletonCanvas.width;
        const h = this.skeletonCanvas.height;
        const lm = this.poseData.landmarks;

        // Compute aspect-fit offset and scale to match #subject-img object-fit: contain
        const img = this.subjectImg;
        if (!img.naturalWidth || !img.naturalHeight) return;

        const imgAspect = img.naturalWidth / img.naturalHeight;
        const canvasAspect = w / h;
        let drawW, drawH, offsetX, offsetY;

        if (canvasAspect > imgAspect) {
            drawH = h;
            drawW = h * imgAspect;
            offsetX = (w - drawW) / 2;
            offsetY = 0;
        } else {
            drawW = w;
            drawH = w / imgAspect;
            offsetX = 0;
            offsetY = (h - drawH) / 2;
        }

        const getPt = (idx) => {
            const p = lm[idx];
            if (!p) return null;
            return {
                x: offsetX + p.x * drawW,
                y: offsetY + p.y * drawH
            };
        };

        const bones = [
            [11, 12], // shoulders
            [11, 23], [12, 24], [23, 24], // torso
            [11, 13], [13, 15], // left arm
            [12, 14], [14, 16], // right arm
        ];

        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 8;

        bones.forEach(([i, j]) => {
            const p1 = getPt(i);
            const p2 = getPt(j);
            if (!p1 || !p2) return;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        });

        // Joint dots
        [11, 12, 13, 14, 15, 16, 23, 24].forEach(idx => {
            const p = getPt(idx);
            if (!p) return;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#00d4ff';
            ctx.shadowBlur = 10;
            ctx.fill();
        });
    }

    /**
     * UI Two-Way Binding
     */
    _setupEventListeners() {
        // Slider definitions: [key, sliderId, numId, isFloat, decimals]
        const mappings = [
            ['posX', 'slider-pos-x', 'num-pos-x', true, 3],
            ['posY', 'slider-pos-y', 'num-pos-y', true, 3],
            ['posZ', 'slider-pos-z', 'num-pos-z', true, 3],
            ['scaleX', 'slider-scale-x', 'num-scale-x', true, 2],
            ['scaleY', 'slider-scale-y', 'num-scale-y', true, 2],
            ['scaleZ', 'slider-scale-z', 'num-scale-z', true, 2],
            ['rotYaw', 'slider-rot-yaw', 'num-rot-yaw', true, 1],
            ['rotPitch', 'slider-rot-pitch', 'num-rot-pitch', true, 1],
            ['rotRoll', 'slider-rot-roll', 'num-rot-roll', true, 1],
            ['armLeft', 'slider-arm-left', 'num-arm-left', false, 0],
            ['armRight', 'slider-arm-right', 'num-arm-right', false, 0],
            ['camFov', 'slider-cam-fov', 'num-cam-fov', false, 0],
            ['camDist', 'slider-cam-dist', 'num-cam-dist', true, 2],
        ];

        mappings.forEach(([key, sliderId, numId, isFloat, decimals]) => {
            const slider = document.getElementById(sliderId);
            const num = document.getElementById(numId);
            if (!slider || !num) return;

            slider.addEventListener('input', (e) => {
                const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
                this.manualValues[key] = val;
                num.value = val.toFixed(decimals);

                if (key === 'scaleX' && this.manualValues.lockAspect) {
                    const ratio = this._aspectRatioTorso;
                    this.manualValues.scaleY = parseFloat((val * ratio).toFixed(2));
                    const sY = document.getElementById('slider-scale-y');
                    const nY = document.getElementById('num-scale-y');
                    if (sY) sY.value = this.manualValues.scaleY;
                    if (nY) nY.value = this.manualValues.scaleY.toFixed(2);
                }

                this._applyManualTransforms();
            });

            num.addEventListener('input', (e) => {
                const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
                if (isNaN(val)) return;
                this.manualValues[key] = val;
                slider.value = val;

                if (key === 'scaleX' && this.manualValues.lockAspect) {
                    const ratio = this._aspectRatioTorso;
                    this.manualValues.scaleY = parseFloat((val * ratio).toFixed(2));
                    const sY = document.getElementById('slider-scale-y');
                    const nY = document.getElementById('num-scale-y');
                    if (sY) sY.value = this.manualValues.scaleY;
                    if (nY) nY.value = this.manualValues.scaleY.toFixed(2);
                }

                this._applyManualTransforms();
            });
        });

        // Lock Aspect Ratio
        const lockAspect = document.getElementById('toggle-lock-aspect');
        if (lockAspect) {
            lockAspect.checked = this.manualValues.lockAspect;
            lockAspect.addEventListener('change', (e) => {
                this.manualValues.lockAspect = e.target.checked;
            });
        }

        // Opacity Slider
        const sliderOpacity = document.getElementById('slider-opacity');
        const valOpacity = document.getElementById('val-opacity');
        if (sliderOpacity && valOpacity) {
            sliderOpacity.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.manualValues.opacity = val;
                valOpacity.textContent = val.toFixed(2);
                this._applyManualTransforms();
            });
        }

        // Toggles
        const toggleSkel = document.getElementById('toggle-skeleton');
        if (toggleSkel) {
            toggleSkel.addEventListener('change', (e) => {
                this.manualValues.showSkeleton = e.target.checked;
                this._drawSkeleton();
            });
        }

        const toggleWire = document.getElementById('toggle-wireframe');
        if (toggleWire) {
            toggleWire.addEventListener('change', (e) => {
                this.manualValues.wireframe = e.target.checked;
                this._applyManualTransforms();
            });
        }

        // Subject selector buttons
        document.querySelectorAll('.selector-bar button[id^="btn-sub-"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.subject;
                if (key) this._loadSubject(key);
            });
        });

        // Custom Subject upload
        const btnSubCustom = document.getElementById('btn-sub-custom');
        const fileSubInput = document.getElementById('custom-photo-input');
        if (btnSubCustom && fileSubInput) {
            btnSubCustom.addEventListener('click', () => fileSubInput.click());
            fileSubInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                this._loadSubject('custom', url);
            });
        }

        // Garment selector buttons
        document.querySelectorAll('.selector-bar button[id^="btn-gar-"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.garment;
                if (key) {
                    this.currentGarmentKey = key;
                    this._loadGarment(key);
                    this._checkSavedPresetOrApplyAuto();
                }
            });
        });

        // Custom Garment upload
        const btnGarCustom = document.getElementById('btn-gar-custom');
        const fileGarInput = document.getElementById('custom-garment-input');
        if (btnGarCustom && fileGarInput) {
            btnGarCustom.addEventListener('click', () => fileGarInput.click());
            fileGarInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                this._loadGarment(this.currentGarmentKey, url);
            });
        }

        // Reset to Auto button
        const btnResetAuto = document.getElementById('btn-reset-auto');
        if (btnResetAuto) {
            btnResetAuto.addEventListener('click', () => {
                this._computeAutoValues();
                this.manualValues = {
                    ...this.manualValues,
                    posX: this.autoValues.posX || 0,
                    posY: this.autoValues.posY || -0.15,
                    posZ: this.autoValues.posZ || 0.04,
                    scaleX: this.autoValues.scaleX || 1.0,
                    scaleY: this.autoValues.scaleY || 1.06,
                    scaleZ: this.autoValues.scaleZ || 0.72,
                    rotYaw: this.autoValues.rotYaw || 0,
                    rotPitch: this.autoValues.rotPitch || 0,
                    rotRoll: this.autoValues.rotRoll || 0,
                    armLeft: this.autoValues.armLeft || -12,
                    armRight: this.autoValues.armRight || 12,
                };
                this._syncSlidersFromManualValues();
                this._applyManualTransforms();
            });
        }

        // Save Preset Button
        const btnSaveCombo = document.getElementById('btn-save-combo');
        if (btnSaveCombo) {
            btnSaveCombo.addEventListener('click', () => {
                const comboKey = `${this.currentSubjectKey}_${this.currentGarmentKey}`;
                this.presets[comboKey] = { ...this.manualValues };
                this._saveStoredPresets();
                this._updatePresetsChipsUI();

                btnSaveCombo.textContent = '✅ Saved!';
                setTimeout(() => { btnSaveCombo.textContent = '💾 Save Preset'; }, 1500);
            });
        }

        // Export All JSON Modal
        const btnExportAll = document.getElementById('btn-export-all');
        const modal = document.getElementById('export-modal');
        const modalText = document.getElementById('json-export-text');
        const btnCloseModal = document.getElementById('btn-close-modal');
        const btnCopyJson = document.getElementById('btn-copy-json');

        if (btnExportAll && modal && modalText) {
            btnExportAll.addEventListener('click', () => {
                // Ensure current active values are saved in the export payload
                const currentComboKey = `${this.currentSubjectKey}_${this.currentGarmentKey}`;
                this.presets[currentComboKey] = { ...this.manualValues };

                const payload = {
                    metadata: {
                        timestamp: new Date().toISOString(),
                        description: "WearItNow 3D Garment Manual Calibration Tweaks"
                    },
                    currentCombo: {
                        subject: this.currentSubjectKey,
                        garment: this.currentGarmentKey,
                        autoValues: this.autoValues,
                        manualValues: this.manualValues,
                    },
                    allPresets: this.presets
                };

                modalText.value = JSON.stringify(payload, null, 2);
                modal.classList.add('active');
            });

            if (btnCloseModal) {
                btnCloseModal.addEventListener('click', () => modal.classList.remove('active'));
            }

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });

            if (btnCopyJson) {
                btnCopyJson.addEventListener('click', () => {
                    navigator.clipboard.writeText(modalText.value).then(() => {
                        btnCopyJson.textContent = '✅ Copied!';
                        setTimeout(() => { btnCopyJson.textContent = '📋 Copy to Clipboard'; }, 1500);
                    });
                });
            }
        }

        // Copy Diagnostics Table
        const btnCopyDiag = document.getElementById('btn-copy-diagnostics');
        if (btnCopyDiag) {
            btnCopyDiag.addEventListener('click', () => {
                let text = `Parameter | Auto | Manual | Delta\n--------------------------------\n`;
                const rows = document.querySelectorAll('#diagnostics-rows tr');
                rows.forEach(r => {
                    const cols = Array.from(r.children).map(c => c.textContent.trim());
                    text += `${cols.join(' | ')}\n`;
                });
                navigator.clipboard.writeText(text).then(() => {
                    btnCopyDiag.textContent = '✅ Copied!';
                    setTimeout(() => { btnCopyDiag.textContent = '📋 Copy Table'; }, 1200);
                });
            });
        }
    }

    _syncSlidersFromManualValues() {
        const m = this.manualValues;

        const updateField = (sliderId, numId, val, decimals) => {
            const slider = document.getElementById(sliderId);
            const num = document.getElementById(numId);
            if (slider) slider.value = val;
            if (num) num.value = Number(val).toFixed(decimals);
        };

        updateField('slider-pos-x', 'num-pos-x', m.posX, 3);
        updateField('slider-pos-y', 'num-pos-y', m.posY, 3);
        updateField('slider-pos-z', 'num-pos-z', m.posZ, 3);

        updateField('slider-scale-x', 'num-scale-x', m.scaleX, 2);
        updateField('slider-scale-y', 'num-scale-y', m.scaleY, 2);
        updateField('slider-scale-z', 'num-scale-z', m.scaleZ, 2);

        updateField('slider-rot-yaw', 'num-rot-yaw', m.rotYaw, 1);
        updateField('slider-rot-pitch', 'num-rot-pitch', m.rotPitch, 1);
        updateField('slider-rot-roll', 'num-rot-roll', m.rotRoll, 1);

        updateField('slider-arm-left', 'num-arm-left', m.armLeft, 0);
        updateField('slider-arm-right', 'num-arm-right', m.armRight, 0);

        updateField('slider-cam-fov', 'num-cam-fov', m.camFov, 0);
        updateField('slider-cam-dist', 'num-cam-dist', m.camDist, 2);
    }

    _updateDiagnosticsTable() {
        const tbody = document.getElementById('diagnostics-rows');
        if (!tbody) return;

        const items = [
            { label: 'Pos X', auto: this.autoValues.posX, manual: this.manualValues.posX, unit: 'm', dec: 3 },
            { label: 'Pos Y', auto: this.autoValues.posY, manual: this.manualValues.posY, unit: 'm', dec: 3 },
            { label: 'Scale X', auto: this.autoValues.scaleX, manual: this.manualValues.scaleX, unit: 'x', dec: 2 },
            { label: 'Scale Y', auto: this.autoValues.scaleY, manual: this.manualValues.scaleY, unit: 'x', dec: 2 },
            { label: 'Yaw', auto: this.autoValues.rotYaw, manual: this.manualValues.rotYaw, unit: '°', dec: 1 },
            { label: 'Pitch', auto: this.autoValues.rotPitch, manual: this.manualValues.rotPitch, unit: '°', dec: 1 },
            { label: 'Roll', auto: this.autoValues.rotRoll, manual: this.manualValues.rotRoll, unit: '°', dec: 1 },
            { label: 'Arm L', auto: this.autoValues.armLeft, manual: this.manualValues.armLeft, unit: '°', dec: 0 },
            { label: 'Arm R', auto: this.autoValues.armRight, manual: this.manualValues.armRight, unit: '°', dec: 0 },
        ];

        let html = '';
        items.forEach(it => {
            const autoVal = it.auto !== undefined ? it.auto.toFixed(it.dec) : '--';
            const manualVal = it.manual !== undefined ? it.manual.toFixed(it.dec) : '--';
            let deltaStr = '--';
            if (it.auto !== undefined && it.manual !== undefined) {
                const delta = it.manual - it.auto;
                const sign = delta >= 0 ? '+' : '';
                deltaStr = `${sign}${delta.toFixed(it.dec)}${it.unit}`;
            }

            html += `
                <tr>
                    <td>${it.label}</td>
                    <td class="val-auto">${autoVal}${it.unit}</td>
                    <td class="val-manual">${manualVal}${it.unit}</td>
                    <td class="val-delta">${deltaStr}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    _updatePresetsChipsUI() {
        const container = document.getElementById('presets-chips');
        if (!container) return;

        const combos = [
            ['male_tshirt', 'Male + T-Shirt'],
            ['male_formal_shirt', 'Male + Shirt'],
            ['desk_tshirt', 'Desk + T-Shirt'],
            ['desk_formal_shirt', 'Desk + Shirt'],
            ['female_tshirt', 'Female + T-Shirt'],
            ['female_formal_shirt', 'Female + Shirt'],
            ['desk_hoodie', 'Desk + Hoodie'],
            ['male_jacket', 'Male + Jacket'],
        ];

        let html = '';
        combos.forEach(([key, label]) => {
            const isSaved = Boolean(this.presets[key]);
            const isCurrent = key === `${this.currentSubjectKey}_${this.currentGarmentKey}`;
            const chipClass = isSaved ? 'preset-chip saved' : 'preset-chip';
            const icon = isSaved ? '✅' : '⚪';
            const border = isCurrent ? 'style="border-color: var(--accent-cyan); font-weight: 600;"' : '';
            html += `<span class="${chipClass}" ${border}>${icon} ${label}</span>`;
        });

        container.innerHTML = html;
    }
}

// Initialize on DOM ready
window.addEventListener('DOMContentLoaded', () => {
    window.lab = new CalibrationLab();
});
