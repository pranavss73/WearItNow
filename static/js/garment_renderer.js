/**
 * WearItNow - 3D Garment AR Renderer Module
 * High-precision AR cloth projection engine using Three.js and MediaPipe BlazePose.
 *
 * Professional Architecture:
 * 1. GROUND-TRUTH CALIBRATED PRESETS: Direct incorporation of empirical calibration data
 *    for reference subjects (Male, Desk-Seated, Female) across all garment categories.
 * 2. MATHEMATICALLY DERIVED AUTO-TRACKING:
 *    - Foreshortening scale compensation: scaleX = (width / cos(yaw)) * fitFactor
 *    - Anatomical vertical alignment: targetY = shoulderY - 0.12 * scaleY
 *    - Horizontal rotation inversion: yaw = -rawYaw * 1.20
 *    - Chest center yaw shift compensation
 * 3. REAL-TIME ARTICULATED SLEEVES: Natural draping and dynamic movement.
 */

import * as THREE from 'three';
import { GarmentModelFactory } from './garment_models.js?v=12.0';
import { SMPLModelFactory } from './smpl_model.js?v=12.0';

/**
 * Empirical Ground-Truth Presets (Calibrated by User)
 */
export const CALIBRATED_PRESETS = {
    male_tshirt: {
        posX: -0.015, posY: 0.055, posZ: -0.5,
        scaleX: 1.82, scaleY: 2.50, scaleZ: 2.0,
        rotYaw: -1, rotPitch: -5.5, rotRoll: 0,
        armLeft: 0, armRight: 0,
        camFov: 55, camDist: 3.3
    },
    male_formal_shirt: {
        posX: 0.035, posY: 0.055, posZ: -0.5,
        scaleX: 1.90, scaleY: 2.36, scaleZ: 2.0,
        rotYaw: -1, rotPitch: -5.5, rotRoll: 0,
        armLeft: 0, armRight: 0,
        camFov: 55, camDist: 3.3
    },
    male_jacket: {
        posX: 0.02, posY: 0.125, posZ: -0.305,
        scaleX: 1.82, scaleY: 2.60, scaleZ: 2.0,
        rotYaw: -1, rotPitch: -5.5, rotRoll: 0,
        armLeft: 0, armRight: 0,
        camFov: 66, camDist: 3.3
    },
    male_hoodie: {
        posX: 0.015, posY: 0.09, posZ: -0.4,
        scaleX: 1.86, scaleY: 2.55, scaleZ: 2.0,
        rotYaw: -1, rotPitch: -5.5, rotRoll: 0,
        armLeft: 0, armRight: 0,
        camFov: 58, camDist: 3.3
    },
    desk_formal_shirt: {
        posX: 0.34, posY: -0.515, posZ: 0.03,
        scaleX: 2.24, scaleY: 2.22, scaleZ: 2.0,
        rotYaw: -41, rotPitch: -23.5, rotRoll: -9,
        armLeft: -1.73, armRight: 9.24,
        camFov: 68, camDist: 2.55
    },
    desk_tshirt: {
        posX: 0.33, posY: -0.495, posZ: 0.025,
        scaleX: 2.38, scaleY: 2.32, scaleZ: 2.0,
        rotYaw: -44.5, rotPitch: -25, rotRoll: -13,
        armLeft: 0, armRight: 0,
        camFov: 45, camDist: 3.7
    },
    desk_hoodie: {
        posX: 0.20, posY: -0.525, posZ: 0.025,
        scaleX: 2.38, scaleY: 2.32, scaleZ: 1.253,
        rotYaw: -47, rotPitch: -19.5, rotRoll: -12.5,
        armLeft: 0, armRight: 0,
        camFov: 45, camDist: 3.45
    },
    desk_jacket: {
        posX: 0.28, posY: -0.51, posZ: 0.028,
        scaleX: 2.35, scaleY: 2.30, scaleZ: 2.0,
        rotYaw: -44.5, rotPitch: -22.5, rotRoll: -11.5,
        armLeft: 0, armRight: 0,
        camFov: 52, camDist: 3.45
    },
    female_formal_shirt: {
        posX: 0.005, posY: -0.065, posZ: 0.04,
        scaleX: 1.54, scaleY: 2.08, scaleZ: 1.65,
        rotYaw: -5.5, rotPitch: -10.5, rotRoll: -3,
        armLeft: -6.83, armRight: 7.90,
        camFov: 68, camDist: 2.55
    },
    female_tshirt: {
        posX: 0.005, posY: -0.035, posZ: 0.04,
        scaleX: 1.47, scaleY: 1.94, scaleZ: 1.65,
        rotYaw: -5.5, rotPitch: -10.5, rotRoll: -2.5,
        armLeft: -6.83, armRight: 7.90,
        camFov: 68, camDist: 2.55
    },
    female_hoodie: {
        posX: 0.005, posY: -0.05, posZ: 0.04,
        scaleX: 1.54, scaleY: 2.05, scaleZ: 1.65,
        rotYaw: -5.5, rotPitch: -10.5, rotRoll: -2.8,
        armLeft: -6.83, armRight: 7.90,
        camFov: 68, camDist: 2.55
    },
    female_jacket: {
        posX: 0.005, posY: -0.05, posZ: 0.04,
        scaleX: 1.54, scaleY: 2.06, scaleZ: 1.65,
        rotYaw: -5.5, rotPitch: -10.5, rotRoll: -2.8,
        armLeft: -6.83, armRight: 7.90,
        camFov: 68, camDist: 2.55
    }
};

export class GarmentRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        this.currentGarment = null;
        this.currentType = null;
        this.currentTexture = null;

        this.isVisible = false;
        this.targetOpacity = 0.0;
        this.currentOpacity = 0.0;

        // Smoothed transform targets for stable, jitter-free AR
        this.targetPos = new THREE.Vector3(0, 0, 0);
        this.targetRot = new THREE.Euler(0, 0, 0);
        this.targetScale = new THREE.Vector3(1, 1, 1);

        this.currentPos = new THREE.Vector3(0, 0, 0);
        this.currentRot = new THREE.Euler(0, 0, 0);
        this.currentScale = new THREE.Vector3(1, 1, 1);

        this.targetLeftArmZ = -0.20;
        this.targetRightArmZ = 0.20;
        this.currentLeftArmZ = -0.20;
        this.currentRightArmZ = 0.20;

        this.aspectRatio = 4 / 3;
        this.animationTime = 0;
        this.engineMode = 'landmark'; // 'landmark' | 'smpl'
        this.showSMPLBody = true;

        this._initThree();
    }

    /**
     * Switch try-on deformation engine ('landmark' vs 'smpl')
     */
    setEngineMode(mode) {
        if (this.engineMode === mode) return;
        this.engineMode = mode;
        if (this.currentGarment) {
            this.setGarment(this.currentType || 'tshirt', this.currentTexture);
        }
    }

    /**
     * Toggle visibility of SMPL 3D human body digital twin
     */
    toggleSMPLBody(show) {
        this.showSMPLBody = Boolean(show);
        if (this.currentGarment && this.currentGarment.userData?.bodyMesh) {
            this.currentGarment.userData.bodyMesh.visible = this.showSMPLBody;
        }
    }

    /**
     * Setup Three.js scene, camera, lights, and WebGL renderer
     */
    _initThree() {
        this.scene = new THREE.Scene();

        // Perspective camera matching typical webcam FOV (~50 deg)
        this.camera = new THREE.PerspectiveCamera(50, this.aspectRatio, 0.1, 100);
        this.camera.position.set(0, 0, 3.2);

        // Renderer with transparent canvas
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;

        // Realistic studio cloth lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
        this.scene.add(ambientLight);

        // Key light (upper-front right)
        const keyLight = new THREE.DirectionalLight(0xfff8ee, 1.35);
        keyLight.position.set(1.5, 2.5, 3.0);
        this.scene.add(keyLight);

        // Fill light (upper-front left)
        const fillLight = new THREE.DirectionalLight(0xe8f4ff, 0.85);
        fillLight.position.set(-2.0, 1.5, 2.0);
        this.scene.add(fillLight);

        // Subtle soft rim light
        const rimLight = new THREE.DirectionalLight(0x00d4ff, 0.35);
        rimLight.position.set(0, -1.0, 1.5);
        this.scene.add(rimLight);
    }

    /**
     * Update viewport / canvas size
     */
    resize(width, height) {
        if (!width || !height) return;
        this.aspectRatio = width / height;
        this.camera.aspect = this.aspectRatio;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }

    /**
     * Load or switch garment model
     * @param {'tshirt'|'hoodie'|'formal_shirt'|'jacket'} type 
     * @param {HTMLImageElement|string|THREE.Texture} textureSource 
     */
    setGarment(type, textureSource = null) {
        if (this.currentGarment) {
            this.scene.remove(this.currentGarment);
            this.currentGarment = null;
        }

        this.currentType = type;

        let texture = null;
        if (textureSource) {
            if (typeof textureSource === 'string') {
                const loader = new THREE.TextureLoader();
                texture = loader.load(textureSource);
                texture.colorSpace = THREE.SRGBColorSpace;
            } else if (textureSource instanceof Image || textureSource instanceof HTMLCanvasElement) {
                texture = new THREE.CanvasTexture(textureSource);
                texture.colorSpace = THREE.SRGBColorSpace;
            } else if (textureSource instanceof THREE.Texture) {
                texture = textureSource;
            }
            this.currentTexture = texture;
        }

        if (this.engineMode === 'smpl') {
            this.currentGarment = SMPLModelFactory.createSMPLSystem(type, this.currentTexture);
            if (this.currentGarment.userData?.bodyMesh) {
                this.currentGarment.userData.bodyMesh.visible = Boolean(this.showSMPLBody);
            }
        } else {
            this.currentGarment = GarmentModelFactory.createGarment(type, this.currentTexture);
        }
        this.scene.add(this.currentGarment);

        this.isVisible = true;
        this.targetOpacity = 1.0;
        this.currentOpacity = 1.0;
    }

    /**
     * Update garment with new texture image
     */
    updateTexture(imageElement) {
        if (!this.currentGarment) return;
        GarmentModelFactory.updateTexture(this.currentGarment, imageElement);
    }

    /**
     * Show or hide try-on projection
     */
    setVisible(visible) {
        this.isVisible = visible;
        this.targetOpacity = visible ? 1.0 : 0.0;
    }

    /**
     * Update garment position, rotation, scale, and sleeve articulation based on tracking data
     * @param {any} poseData Metrics from BodyTracker
     * @param {number} delta Time delta
     */
    update(poseData, delta = 0.016) {
        this.animationTime += delta;

        if (!this.currentGarment) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // Smooth opacity transition
        const opacityLerp = 0.22;
        this.currentOpacity += (this.targetOpacity - this.currentOpacity) * opacityLerp;

        const isBodyPart = (node) => {
            let cur = node;
            while (cur && cur !== this.currentGarment) {
                if (cur.name === 'smpl_body_mesh') return true;
                cur = cur.parent;
            }
            return false;
        };

        this.currentGarment.traverse((child) => {
            if (child.isMesh && child.material) {
                if (isBodyPart(child)) {
                    child.visible = Boolean(this.showSMPLBody);
                    return;
                }
                child.material.opacity = this.currentOpacity;
                child.visible = this.currentOpacity > 0.02;
            }
        });

        if (poseData && poseData.shoulders && poseData.torso) {
            this.targetOpacity = this.isVisible ? 1.0 : 0.0;

            // 1. ANATOMICAL 3D DEFORMATION (Landmark Engine vs SMPL Human Mesh Recovery)
            if (poseData.bodyCage && this.currentGarment.userData?.updateDeformation) {
                if (this.engineMode === 'smpl') {
                    // SMPL Parametric 3D Human Mesh Recovery
                    this.currentGarment.userData.updateDeformation(poseData, this.camera);
                    if (this.currentGarment.userData?.bodyMesh) {
                        this.currentGarment.userData.bodyMesh.visible = Boolean(this.showSMPLBody);
                    }
                } else {
                    // Landmark-Anchored Deformer
                    this.currentGarment.userData.updateDeformation(poseData.bodyCage, this.camera, {
                        silhouetteBounds: poseData.silhouetteBounds
                    });
                }

                // With landmark anchoring, vertices are already located at their exact 3D camera coordinates!
                this.targetPos.set(0, 0, 0);
                this.targetRot.set(0, 0, 0);
                this.targetScale.set(1, 1, 1);
                this.targetLeftArmZ = 0;
                this.targetRightArmZ = 0;

                this.currentPos.set(0, 0, 0);
                this.currentRot.set(0, 0, 0);
                this.currentScale.set(1, 1, 1);
                this.currentLeftArmZ = 0;
                this.currentRightArmZ = 0;

                this.currentGarment.position.set(0, 0, 0);
                this.currentGarment.rotation.set(0, 0, 0);
                this.currentGarment.scale.set(1, 1, 1);
                if (this.currentGarment.userData?.leftSleeve) this.currentGarment.userData.leftSleeve.rotation.set(0, 0, 0);
                if (this.currentGarment.userData?.rightSleeve) this.currentGarment.userData.rightSleeve.rotation.set(0, 0, 0);
            } else {
                // Fallback: Rigid transform projection if bodyCage is unavailable
                const presetKey = poseData.presetKey || `${poseData.subjectName || ''}_${this.currentType}`;
                const preset = CALIBRATED_PRESETS[presetKey];

                if (preset) {
                    this.targetPos.set(preset.posX, preset.posY, preset.posZ);
                    this.targetScale.set(preset.scaleX, preset.scaleY, preset.scaleZ);

                    const degToRad = Math.PI / 180;
                    this.targetRot.set(
                        preset.rotPitch * degToRad,
                        preset.rotYaw * degToRad,
                        preset.rotRoll * degToRad
                    );

                    if (preset.armLeft !== undefined) {
                        this.targetLeftArmZ = preset.armLeft * degToRad;
                    }
                    if (preset.armRight !== undefined) {
                        this.targetRightArmZ = preset.armRight * degToRad;
                    }

                    if (preset.camFov && this.camera.fov !== preset.camFov) {
                        this.camera.fov = preset.camFov;
                        this.camera.updateProjectionMatrix();
                    }
                    if (preset.camDist) {
                        this.camera.position.z = preset.camDist;
                    }
                } else {
                    const dist = this.camera.position.z;
                    const fovRad = (this.camera.fov * Math.PI) / 180;
                    const visibleHeight = 2.0 * Math.tan(fovRad / 2) * dist;
                    const visibleWidth = visibleHeight * this.camera.aspect;

                    const sw = poseData.shoulders.width;
                    const personShoulderWidth3D = sw * visibleWidth;
                    const rawYaw = (poseData.orientation.yaw || 0);
                    const isMirrored = poseData.isMirrored !== false;

                    const cosYaw = Math.max(0.65, Math.cos(rawYaw));
                    const foreshortenedWidth = personShoulderWidth3D / cosYaw;
                    const scaleX = (foreshortenedWidth / 0.92) * 1.12;
                    const hasHips = poseData.hips && poseData.hips.left && (poseData.hips.left.visibility ?? 1.0) > 0.45;
                    const heightRatio = hasHips ? 1.34 : 1.02;
                    const scaleY = scaleX * heightRatio;
                    const scaleZ = scaleX * 0.90;

                    this.targetScale.set(scaleX, scaleY, scaleZ);

                    const scX = poseData.shoulders.center.x;
                    const scY = poseData.shoulders.center.y;
                    const screenX = isMirrored ? (1.0 - scX) : scX;

                    const yawShift = -0.15 * personShoulderWidth3D * Math.sin(rawYaw);
                    const targetX = (screenX - 0.5) * visibleWidth + (isMirrored ? -yawShift : yawShift);
                    const shoulderY = (0.5 - scY) * visibleHeight;
                    const targetY = shoulderY - (0.12 * scaleY);
                    const targetZ = -0.05;

                    this.targetPos.set(targetX, targetY, targetZ);

                    const yawSign = isMirrored ? 1.20 : -1.20;
                    const clampedYaw = Math.max(-0.85, Math.min(0.85, rawYaw * yawSign));
                    const rollSign = isMirrored ? -1.0 : 1.0;
                    const clampedRoll = (poseData.orientation.roll || 0) * rollSign;
                    const clampedPitch = Math.max(-0.45, Math.min(0.45, (poseData.orientation.pitch || 0) * 0.65));

                    this.targetRot.set(clampedPitch, clampedYaw, clampedRoll);
                }
            }
        } else {
            this.targetOpacity = 0.0;
        }

        // Apply smooth interpolation (Damping)
        const lerpFactor = 0.35;
        this.currentPos.lerp(this.targetPos, lerpFactor);
        this.currentScale.lerp(this.targetScale, lerpFactor);

        this.currentRot.x += (this.targetRot.x - this.currentRot.x) * lerpFactor;
        this.currentRot.y += (this.targetRot.y - this.currentRot.y) * lerpFactor;
        this.currentRot.z += (this.targetRot.z - this.currentRot.z) * lerpFactor;

        this.currentLeftArmZ += (this.targetLeftArmZ - this.currentLeftArmZ) * 0.25;
        this.currentRightArmZ += (this.targetRightArmZ - this.currentRightArmZ) * 0.25;

        // Apply to garment 3D hierarchy
        this.currentGarment.position.copy(this.currentPos);
        this.currentGarment.rotation.copy(this.currentRot);
        this.currentGarment.scale.copy(this.currentScale);

        // Articulate sleeves (only for rigid fallback, deformable sleeves are already vertex-anchored)
        if (!poseData?.bodyCage) {
            const ls = this.currentGarment.userData?.leftSleeve;
            const rs = this.currentGarment.userData?.rightSleeve;
            if (ls) ls.rotation.z = this.currentLeftArmZ;
            if (rs) rs.rotation.z = this.currentRightArmZ;
        }

        // Render frame
        this.renderer.render(this.scene, this.camera);
    }
}
