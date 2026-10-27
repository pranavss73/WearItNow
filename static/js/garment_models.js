/**
 * WearItNow - 3D Garment Models Module
 * Landmark-Anchored Deformable 3D Cloth Engine using Three.js and MediaPipe BlazePose.
 *
 * Professional Architecture:
 * 1. 18-POINT ANATOMICAL CAGE ANCHORING:
 *    Instead of rigid solid blocks floating in midair, garment vertices are dynamically
 *    anchored and warped to the subject's 3D body landmarks (neck, clavicles, shoulders,
 *    armpits, sternum, ribs, waist, hips, and arms).
 * 2. SEAMLESS SLEEVE ARTICULATION:
 *    Sleeves originate precisely at the anatomical shoulder seams (landmarks 11 & 12)
 *    and dynamically drape along the 3D arm vectors towards the elbows (13 & 14).
 * 3. ANATOMICAL TORSO SHELL:
 *    Torso shell curves naturally across the chest with realistic forward depth volume,
 *    drapes at the collarbone, and tapers along the ribcage and waist down to the hips.
 * 4. DEDICATED UV MAPPING:
 *    Preserves clean fabric texture projection without stretching or duplicating graphics.
 */

import * as THREE from 'three';

export class GarmentModelFactory {
    /**
     * Create 3D deformable garment hierarchy for the specified category.
     * @param {'tshirt'|'hoodie'|'formal_shirt'|'jacket'} type 
     * @param {THREE.Texture} texture 
     * @returns {THREE.Group} Garment model root group
     */
    static createGarment(type, texture = null) {
        switch (type) {
            case 'hoodie':
                return this._createDeformableGarment('hoodie', texture, {
                    neckDrop: 0.028,
                    neckWidth: 0.34,
                    depthMultiplier: 1.15,
                    sleeveLengthFraction: 0.96,
                    sleeveRadiusScale: 1.10,
                    isHoodie: true,
                });
            case 'formal_shirt':
                return this._createDeformableGarment('formal_shirt', texture, {
                    neckDrop: 0.025,
                    neckWidth: 0.32,
                    depthMultiplier: 0.95,
                    sleeveLengthFraction: 0.94,
                    sleeveRadiusScale: 0.96,
                    isFormalShirt: true,
                });
            case 'jacket':
                return this._createDeformableGarment('jacket', texture, {
                    neckDrop: 0.035,
                    neckWidth: 0.34,
                    depthMultiplier: 1.20,
                    sleeveLengthFraction: 0.96,
                    sleeveRadiusScale: 1.12,
                    isJacket: true,
                });
            case 'tshirt':
            default:
                return this._createDeformableGarment('tshirt', texture, {
                    neckDrop: 0.022, // Natural shallow crew-neck scoop resting directly on collarbone hollow
                    neckWidth: 0.34, // Natural anatomical collar width across the trapezius
                    depthMultiplier: 1.0,
                    sleeveLengthFraction: 0.42, // short sleeves
                    sleeveRadiusScale: 1.0,
                });
        }
    }

    /**
     * Fabric material with realistic cloth lighting and clean alpha testing
     */
    static createFabricMaterial(texture = null, options = {}) {
        if (texture) {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.generateMipmaps = true;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
        }

        return new THREE.MeshStandardMaterial({
            map: texture || null,
            color: texture ? 0xffffff : 0x2563eb,
            roughness: 0.74,
            metalness: 0.02,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.05,
            depthWrite: true,
            ...options
        });
    }

    /**
     * Internal factory for deformable garment assemblies
     */
    static _createDeformableGarment(type, texture, options = {}) {
        const root = new THREE.Group();
        root.name = `garment_${type}`;

        const material = this.createFabricMaterial(texture, {
            roughness: type === 'jacket' ? 0.60 : (type === 'formal_shirt' ? 0.65 : 0.75),
            metalness: type === 'jacket' ? 0.05 : 0.01,
        });

        // 1. Torso Mesh (Nx=28, Ny=28)
        const torsoGeo = this._initTorsoGeometry();
        const torsoMesh = new THREE.Mesh(torsoGeo, material);
        torsoMesh.castShadow = true;
        torsoMesh.receiveShadow = true;
        root.add(torsoMesh);

        // 2. Left Sleeve Mesh (N_len=18, N_circ=16)
        const leftSleeveGeo = this._initSleeveGeometry(true);
        const leftSleeveMesh = new THREE.Mesh(leftSleeveGeo, material);
        leftSleeveMesh.castShadow = true;
        root.add(leftSleeveMesh);

        // 3. Right Sleeve Mesh (N_len=18, N_circ=16)
        const rightSleeveGeo = this._initSleeveGeometry(false);
        const rightSleeveMesh = new THREE.Mesh(rightSleeveGeo, material);
        rightSleeveMesh.castShadow = true;
        root.add(rightSleeveMesh);

        // 4. Collar Band
        const collarGeo = this._initCollarGeometry();
        const collarMesh = new THREE.Mesh(collarGeo, material);
        root.add(collarMesh);

        // 5. Hood (if hoodie)
        let hoodMesh = null;
        if (options.isHoodie) {
            const hoodGeo = new THREE.SphereGeometry(0.25, 20, 14, 0, Math.PI, 0, Math.PI * 0.75);
            hoodGeo.rotateX(Math.PI);
            hoodGeo.scale(1.0, 1.15, 0.85);
            hoodMesh = new THREE.Mesh(hoodGeo, material);
            root.add(hoodMesh);
        }

        // 6. Forearm AR Occlusion Capsules (Depth Mask)
        // Writes strictly to Z-buffer with colorWrite: false so real webcam arms
        // naturally occlude virtual garments when arms are held across the chest
        const occluderGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.25, 8);
        const occluderMat = new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true,
        });
        const leftArmOccluder = new THREE.Mesh(occluderGeo, occluderMat);
        leftArmOccluder.renderOrder = -1;
        leftArmOccluder.visible = false;
        root.add(leftArmOccluder);

        const rightArmOccluder = new THREE.Mesh(occluderGeo, occluderMat);
        rightArmOccluder.renderOrder = -1;
        rightArmOccluder.visible = false;
        root.add(rightArmOccluder);

        // Attach dynamic Landmark-Anchored Deformer
        root.userData = {
            type,
            material,
            torso: torsoMesh,
            leftSleeve: leftSleeveMesh,
            rightSleeve: rightSleeveMesh,
            collar: collarMesh,
            hood: hoodMesh,
            leftArmOccluder,
            rightArmOccluder,
            options,

            /**
             * Dynamically deform the 3D garment mesh to match the detected anatomical body cage
             */
            updateDeformation: (bodyCage, camera, tweaks = {}) => {
                if (!bodyCage || !camera) return;

                const dist = camera.position.z;
                const fovRad = (camera.fov * Math.PI) / 180;
                const visibleHeight = 2.0 * Math.tan(fovRad / 2) * dist;
                const visibleWidth = visibleHeight * camera.aspect;

                // Project normalized cage points to 3D Camera-Space coordinates
                const to3D = (pt, zBias = 0) => {
                    if (!pt) return new THREE.Vector3(0, 0, 0);
                    const x = (pt.x - 0.5) * visibleWidth;
                    const y = (0.5 - pt.y) * visibleHeight;
                    // Negative MediaPipe depth corresponds to forward (+Z) in Three.js
                    const z = - (pt.z || 0) * visibleWidth * 0.85 + zBias;
                    return new THREE.Vector3(x, y, z);
                };

                const C_neck = to3D(bodyCage.neck);
                const C_ls = to3D(bodyCage.leftShoulder);
                const C_rs = to3D(bodyCage.rightShoulder);
                const C_sternum = to3D(bodyCage.sternum, 0.04);
                const C_solar = to3D(bodyCage.solarPlexus, 0.032);
                const C_navel = to3D(bodyCage.navel, 0.022);
                const C_hipCenter = to3D(bodyCage.hipCenter);
                const C_lh = to3D(bodyCage.leftHip);
                const C_rh = to3D(bodyCage.rightHip);
                const C_leftArmpit = to3D(bodyCage.leftArmpit);
                const C_rightArmpit = to3D(bodyCage.rightArmpit);
                const C_leftRib = to3D(bodyCage.leftRib);
                const C_rightRib = to3D(bodyCage.rightRib);
                const C_leftWaist = to3D(bodyCage.leftWaist);
                const C_rightWaist = to3D(bodyCage.rightWaist);
                const C_leftElbow = to3D(bodyCage.leftElbow);
                const C_rightElbow = to3D(bodyCage.rightElbow);
                const C_leftWrist = to3D(bodyCage.leftWrist);
                const C_rightWrist = to3D(bodyCage.rightWrist);
                const C_clavicleL = to3D(bodyCage.clavicleLeft);
                const C_clavicleR = to3D(bodyCage.clavicleRight);

                const shoulderWidth3D = Math.max(0.20, C_ls.distanceTo(C_rs));

                // 1. Deform Torso Mesh (with dynamic arm lift and silhouette bounds constraint)
                GarmentModelFactory._deformTorso(torsoMesh.geometry, {
                    C_neck, C_ls, C_rs, C_sternum, C_solar, C_navel,
                    C_hipCenter, C_lh, C_rh, C_leftArmpit, C_rightArmpit,
                    C_leftRib, C_rightRib, C_leftWaist, C_rightWaist,
                    leftArmLift: (bodyCage.leftArmLift || 0) * visibleHeight,
                    rightArmLift: (bodyCage.rightArmLift || 0) * visibleHeight,
                    shoulderWidth3D,
                    visibleWidth,
                    visibleHeight
                }, { ...options, ...tweaks });

                // 2. Deform Left Sleeve (seamless shoulder-to-armpit seam welding)
                GarmentModelFactory._deformSleeve(leftSleeveMesh.geometry, {
                    origin: C_ls,
                    armpit: C_leftArmpit,
                    elbow: C_leftElbow,
                    wrist: C_leftWrist,
                    wristVisibility: bodyCage.leftWrist?.visibility ?? 1.0,
                    shoulderWidth3D,
                    isLeft: true,
                    C_solar
                }, { ...options, ...tweaks });

                // 3. Deform Right Sleeve (seamless shoulder-to-armpit seam welding)
                GarmentModelFactory._deformSleeve(rightSleeveMesh.geometry, {
                    origin: C_rs,
                    armpit: C_rightArmpit,
                    elbow: C_rightElbow,
                    wrist: C_rightWrist,
                    wristVisibility: bodyCage.rightWrist?.visibility ?? 1.0,
                    shoulderWidth3D,
                    isLeft: false,
                    C_solar
                }, { ...options, ...tweaks });

                // 4. Deform Collar Band
                GarmentModelFactory._deformCollar(collarMesh.geometry, {
                    C_ls,
                    C_rs,
                    C_solar,
                    shoulderWidth3D
                }, { ...options, ...tweaks });

                // 5. Hood (if hoodie)
                if (hoodMesh) {
                    hoodMesh.position.copy(C_neck);
                    hoodMesh.position.y += 0.06 * shoulderWidth3D;
                    hoodMesh.position.z -= 0.08 * shoulderWidth3D;
                    const hoodScale = shoulderWidth3D * 1.7;
                    hoodMesh.scale.set(hoodScale, hoodScale * 1.15, hoodScale * 0.85);
                }

                // 6. Update Forearm Depth Occluders (real-time foreground arm occlusion)
                const updateOccluder = (mesh, pElbow, pWrist, vis) => {
                    if (!mesh) return;
                    if (pElbow && pWrist && (vis > 0.35)) {
                        const dir = pWrist.clone().sub(pElbow);
                        const len = dir.length();
                        if (len > 0.04) {
                            mesh.visible = true;
                            const mid = pElbow.clone().lerp(pWrist, 0.5);
                            mid.z += 0.025; // Forward bias towards camera for crisp foreground occlusion
                            mesh.position.copy(mid);
                            const scaleR = shoulderWidth3D * 0.22;
                            mesh.scale.set(scaleR, len / 0.25, scaleR);
                            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
                            return;
                        }
                    }
                    mesh.visible = false;
                };

                updateOccluder(leftArmOccluder, C_leftElbow, C_leftWrist, bodyCage.leftWrist?.visibility ?? 1.0);
                updateOccluder(rightArmOccluder, C_rightElbow, C_rightWrist, bodyCage.rightWrist?.visibility ?? 1.0);
            }
        };

        return root;
    }

    /**
     * Initializes the static topology (indices and UVs) for the Torso buffer geometry
     */
    static _initTorsoGeometry() {
        const Ny = 40;
        const Nx = 40;

        const numVerts = (Ny + 1) * (Nx + 1);
        const positions = new Float32Array(numVerts * 3);
        const uvs = new Float32Array(numVerts * 2);
        const indices = [];

        for (let j = 0; j <= Ny; j++) {
            const v = j / Ny;
            for (let i = 0; i <= Nx; i++) {
                const u = i / Nx;
                const idx = j * (Nx + 1) + i;

                // Dedicated Torso UV mapping: maps central garment region [0.31, 0.69] x [0.12, 0.86]
                uvs[idx * 2] = 0.31 + u * (0.69 - 0.31);
                uvs[idx * 2 + 1] = 0.12 + v * (0.86 - 0.12);
            }
        }

        for (let j = 0; j < Ny; j++) {
            for (let i = 0; i < Nx; i++) {
                const a = j * (Nx + 1) + i;
                const b = j * (Nx + 1) + (i + 1);
                const c = (j + 1) * (Nx + 1) + (i + 1);
                const d = (j + 1) * (Nx + 1) + i;

                // Front-facing winding (+Z towards camera)
                indices.push(a, d, b);
                indices.push(b, d, c);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        return geo;
    }

    /**
     * Initializes the static topology (indices and UVs) for a Sleeve buffer geometry
     */
    static _initSleeveGeometry(isLeft) {
        const N_len = 24;
        const N_circ = 24;

        const numVerts = (N_len + 1) * (N_circ + 1);
        const positions = new Float32Array(numVerts * 3);
        const uvs = new Float32Array(numVerts * 2);
        const indices = [];

        for (let j = 0; j <= N_len; j++) {
            const t = j / N_len;
            for (let i = 0; i <= N_circ; i++) {
                const frac = i / N_circ;
                const idx = j * (N_circ + 1) + i;

                // Dedicated Sleeve UV mapping
                let uTex;
                if (isLeft) {
                    uTex = 0.69 + frac * (0.93 - 0.69);
                } else {
                    uTex = 0.07 + frac * (0.31 - 0.07);
                }
                const vTex = (1.0 - t) * 0.84 + t * 0.20;

                uvs[idx * 2] = uTex;
                uvs[idx * 2 + 1] = vTex;
            }
        }

        for (let j = 0; j < N_len; j++) {
            for (let i = 0; i < N_circ; i++) {
                const a = j * (N_circ + 1) + i;
                const b = j * (N_circ + 1) + (i + 1);
                const c = (j + 1) * (N_circ + 1) + (i + 1);
                const d = (j + 1) * (N_circ + 1) + i;

                // Counter-clockwise front-facing winding
                indices.push(a, d, b);
                indices.push(b, d, c);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        return geo;
    }

    /**
     * Initializes the static topology for the Collar band
     */
    static _initCollarGeometry() {
        const segments = 32;
        const numVerts = (segments + 1) * 2;
        const positions = new Float32Array(numVerts * 3);
        const uvs = new Float32Array(numVerts * 2);
        const indices = [];

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const idxInner = i * 2;
            const idxOuter = i * 2 + 1;

            uvs[idxInner * 2] = 0.40 + t * 0.20;
            uvs[idxInner * 2 + 1] = 0.82;

            uvs[idxOuter * 2] = 0.40 + t * 0.20;
            uvs[idxOuter * 2 + 1] = 0.86;
        }

        for (let i = 0; i < segments; i++) {
            const a = i * 2;
            const b = i * 2 + 1;
            const c = (i + 1) * 2 + 1;
            const d = (i + 1) * 2;

            indices.push(a, d, b);
            indices.push(b, d, c);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        return geo;
    }

    /**
     * Real-time Torso Mesh Deformation across the 18-point anatomical body cage
     */
    static _deformTorso(geo, pts, options = {}) {
        const Ny = 40;
        const Nx = 40;
        const pos = geo.attributes.position.array;

        const {
            C_neck, C_ls, C_rs, C_sternum, C_solar, C_navel,
            C_hipCenter, C_lh, C_rh, C_leftArmpit, C_rightArmpit,
            C_leftRib, C_rightRib, C_leftWaist, C_rightWaist,
            leftArmLift = 0, rightArmLift = 0,
            shoulderWidth3D,
            visibleWidth = 1.0,
            visibleHeight = 1.0
        } = pts;

        const sw = shoulderWidth3D;
        const depthMul = options.depthMultiplier || 1.0;
        const silhouetteBounds = options.silhouetteBounds || null;

        // 1. ANATOMICAL TORSO LOCAL COORDINATE FRAME
        // Midpoint of shoulder tips (acromion processes)
        const C_midShoulder = C_ls.clone().lerp(C_rs, 0.5);

        // Lateral shoulder unit vector: points from right shoulder to left shoulder
        const u_shoulder = C_ls.clone().sub(C_rs).normalize();

        // Spine up-vector: points from solar plexus up to shoulder center
        const V_spine = C_midShoulder.clone().sub(C_solar);
        const v_up = (V_spine.lengthSq() > 0.001) ? V_spine.clone().normalize() : new THREE.Vector3(0, 1, 0);

        // Forward chest normal: points outwards toward the camera (+Z)
        let n_chest = v_up.clone().cross(u_shoulder).normalize();
        if (n_chest.z < 0) n_chest.negate();
        if (n_chest.lengthSq() < 0.5) n_chest = new THREE.Vector3(0, 0, 1);

        // Orthogonal lateral vector in coronal chest plane
        const u_lat = n_chest.clone().cross(v_up).normalize();

        // 2. CREW-NECK COLLAR & SHOULDER YOKE GEOMETRY
        const collarWidthFraction = options.neckWidth || 0.34;
        const collarHalfWidth = sw * collarWidthFraction * 0.5;
        const neckDropFraction = options.neckDrop || 0.022;
        const neckDrop = sw * neckDropFraction;

        // Trapezius peaks (anatomical collar base resting gracefully on trapezius slope)
        const P_trap_L = C_midShoulder.clone()
            .addScaledVector(u_lat, collarHalfWidth)
            .addScaledVector(v_up, sw * 0.026)
            .addScaledVector(n_chest, -sw * 0.012);

        const P_trap_R = C_midShoulder.clone()
            .addScaledVector(u_lat, -collarHalfWidth)
            .addScaledVector(v_up, sw * 0.026)
            .addScaledVector(n_chest, -sw * 0.012);

        // Front crewneck lowest dip (resting gently at clavicle hollow, perfectly proportional)
        const P_collarDip = C_midShoulder.clone()
            .addScaledVector(v_up, -neckDrop)
            .addScaledVector(n_chest, sw * 0.032);

        // Dynamic shoulder elevation when arms raise
        const P_shoulder_L = C_ls.clone();
        P_shoulder_L.y += leftArmLift * 0.25;

        const P_shoulder_R = C_rs.clone();
        P_shoulder_R.y += rightArmLift * 0.25;

        // Top edge boundary function P_top(s) for s in [-1.0, 1.0]
        const s_neck = Math.min(0.42, collarWidthFraction * 1.05);

        const getTopPoint = (s) => {
            const absS = Math.abs(s);
            if (absS <= s_neck) {
                // Smooth circular/cosine crew-neck scoop: flat at bottom, graceful curve up to collar corners
                const tau = absS / s_neck; // 0 to 1
                const blend = 1.0 - Math.cos(tau * (Math.PI / 2.0));
                const trap = (s >= 0) ? P_trap_L : P_trap_R;
                return P_collarDip.clone().lerp(trap, blend);
            } else {
                // Smooth shoulder slope from trapezius to shoulder tip
                if (s > s_neck) {
                    const lambda = (s - s_neck) / (1.0 - s_neck);
                    return P_trap_L.clone().lerp(P_shoulder_L, lambda);
                } else {
                    const lambda = (-s - s_neck) / (1.0 - s_neck);
                    return P_trap_R.clone().lerp(P_shoulder_R, lambda);
                }
            }
        };

        let idx = 0;
        for (let j = 0; j <= Ny; j++) {
            const v = j / Ny; // 0.0 (hem) to 1.0 (shoulders)

            let L, C, R;
            if (v <= 0.35) {
                const t = v / 0.35;
                L = C_lh.clone().lerp(C_leftWaist, t);
                C = C_hipCenter.clone().lerp(C_navel, t);
                R = C_rh.clone().lerp(C_rightWaist, t);
            } else if (v <= 0.70) {
                const t = (v - 0.35) / 0.35;
                L = C_leftWaist.clone().lerp(C_leftArmpit, t);
                C = C_navel.clone().lerp(C_solar, t);
                R = C_rightWaist.clone().lerp(C_rightArmpit, t);
            } else {
                // Upper torso region (chest to shoulders)
                const t = (v - 0.70) / 0.30;
                const L_armpit = C_leftArmpit.clone();
                L_armpit.y += leftArmLift * 0.35;
                const R_armpit = C_rightArmpit.clone();
                R_armpit.y += rightArmLift * 0.35;

                // 3D armhole arching that matches sleeve cylinder rim
                const armholeArch = Math.sin(t * Math.PI);
                L_armpit.addScaledVector(u_lat, sw * 0.03 * armholeArch);
                R_armpit.addScaledVector(u_lat, -sw * 0.03 * armholeArch);

                L = L_armpit.clone().lerp(P_shoulder_L, t);
                C = C_solar.clone().lerp(P_collarDip, t);
                R = R_armpit.clone().lerp(P_shoulder_R, t);
            }

            // Silhouette coordinate fitting (Elastic edge snapping & overshoot elimination)
            if (silhouetteBounds && silhouetteBounds.length >= 6) {
                const approxPy = (L.y + R.y) * 0.5;
                const sliceNormY = 0.5 - (approxPy / visibleHeight);

                let bestSlice = null;
                let minDist = 999;
                for (let k = 0; k < silhouetteBounds.length; k++) {
                    const d = Math.abs(silhouetteBounds[k].y - sliceNormY);
                    if (d < minDist) {
                        minDist = d;
                        bestSlice = silhouetteBounds[k];
                    }
                }

                if (bestSlice && minDist < 0.12) {
                    const targetLeft3D = (bestSlice.left - 0.5) * visibleWidth; // Screen left (-X) -> Person's Right (R)
                    const targetRight3D = (bestSlice.right - 0.5) * visibleWidth; // Screen right (+X) -> Person's Left (L)

                    const fitFactor = (v < 0.82) ? 0.65 : 0.20;
                    R.x = R.x * (1 - fitFactor) + targetLeft3D * fitFactor;
                    L.x = L.x * (1 - fitFactor) + targetRight3D * fitFactor;
                }
            }

            for (let i = 0; i <= Nx; i++) {
                const u = i / Nx;
                const s = (u - 0.5) * 2.0; // -1.0 (right seam) to +1.0 (left seam)

                let px, py, pz;
                if (v <= 0.70) {
                    // Lower and middle torso (hem to armpits)
                    if (s < 0) {
                        const tx = s + 1.0;
                        px = R.x * (1 - tx) + C.x * tx;
                        py = R.y * (1 - tx) + C.y * tx;
                        pz = R.z * (1 - tx) + C.z * tx;
                    } else {
                        const tx = s;
                        px = C.x * (1 - tx) + L.x * tx;
                        py = C.y * (1 - tx) + L.y * tx;
                        pz = C.z * (1 - tx) + L.z * tx;
                    }
                } else {
                    // Upper torso smoothly transitioning to the contoured crewneck scoop & shoulder line
                    const t = (v - 0.70) / 0.30;
                    let P_chest;
                    if (s < 0) {
                        const tx = s + 1.0;
                        P_chest = R.clone().multiplyScalar(1 - tx).addScaledVector(C, tx);
                    } else {
                        const tx = s;
                        P_chest = C.clone().multiplyScalar(1 - tx).addScaledVector(L, tx);
                    }
                    const P_top = getTopPoint(s);
                    const P_blended = P_chest.clone().lerp(P_top, t);
                    px = P_blended.x;
                    py = P_blended.y;
                    pz = P_blended.z;
                }

                // Anatomical chest curvature / 3D pectoral dome along true chest normal
                const chestCurve = Math.max(0, 1.0 - s * s);
                const vProfile = Math.sin(Math.min(1.0, v * 1.25) * Math.PI);
                const depth = sw * 0.135 * depthMul * chestCurve * (0.30 + 0.70 * vProfile);

                px += n_chest.x * depth;
                py += n_chest.y * depth;
                pz += n_chest.z * depth;

                pos[idx * 3] = px;
                pos[idx * 3 + 1] = py;
                pos[idx * 3 + 2] = pz;
                idx++;
            }
        }

        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
    }

    /**
     * Real-time Sleeve Mesh Deformation anchored at the shoulder and draped along the arm vector
     * Supports both short sleeves (tapered bicep ring) and articulated long sleeves (shoulder -> elbow -> wrist).
     * Includes seamless armhole seam welding so sleeves never tear or detach when arms raise.
     */
    static _deformSleeve(geo, pts, options = {}) {
        const N_len = 24;
        const N_circ = 24;
        const pos = geo.attributes.position.array;

        const { origin, armpit, elbow, wrist, wristVisibility, shoulderWidth3D, isLeft, C_solar } = pts;
        const sw = shoulderWidth3D;
        const isShortSleeve = options.sleeveLengthFraction && options.sleeveLengthFraction < 0.6;
        const radiusScale = options.sleeveRadiusScale || 1.0;

        const topRadius = sw * 0.155 * radiusScale;
        const bicepRadius = sw * 0.135 * radiusScale;
        const elbowRadius = sw * 0.120 * radiusScale;
        const wristRadius = sw * 0.090 * radiusScale;

        // 1. Arm bone vectors
        // Upper arm vector: from shoulder origin to elbow
        let V_upper;
        if (elbow && elbow.distanceTo(origin) > 0.04) {
            V_upper = elbow.clone().sub(origin);
        } else {
            const fallbackX = isLeft ? sw * 0.22 : -sw * 0.22;
            V_upper = new THREE.Vector3(fallbackX, -sw * 0.85, 0);
        }
        const dirUpper = V_upper.clone().normalize();
        const upperLen = V_upper.length();

        // Forearm vector: from elbow to wrist
        let V_fore;
        if (wrist && (wristVisibility > 0.35 || !isShortSleeve)) {
            V_fore = wrist.clone().sub(elbow);
            if (V_fore.length() < 0.04) {
                V_fore = dirUpper.clone().multiplyScalar(upperLen * 0.88);
            }
        } else {
            V_fore = dirUpper.clone().multiplyScalar(upperLen * 0.88);
        }
        const dirFore = V_fore.clone().normalize();

        // 2. Orthonormal basis (Phase-aligned non-twisting frame)
        // u_out: points laterally outward from body (isLeft -> +X, !isLeft -> -X)
        // v_fwd: points forward towards camera (+Z)
        const getBasis = (dir) => {
            const refTorso = C_solar || origin.clone().add(new THREE.Vector3(isLeft ? -0.3 * sw : 0.3 * sw, -0.2 * sw, 0));
            const T_out = origin.clone().sub(refTorso);

            // Project T_out perpendicular to dir
            let u = T_out.clone().sub(dir.clone().multiplyScalar(T_out.dot(dir))).normalize();
            if (u.lengthSq() < 0.1) {
                u = new THREE.Vector3(isLeft ? 1 : -1, 0, 0);
            }
            if (isLeft && u.x < 0) u.negate();
            if (!isLeft && u.x > 0) u.negate();

            // Forward depth vector (+Z towards camera)
            let v = u.clone().cross(dir).normalize();
            if (v.z < 0) v.negate();

            // Re-orthogonalize u
            u = dir.clone().cross(v).normalize();
            if (isLeft && u.x < 0) u.negate();
            if (!isLeft && u.x > 0) u.negate();

            return { u, v };
        };

        const basisUpper = getBasis(dirUpper);
        const basisFore = getBasis(dirFore);

        // 3. Armhole perimeter geometry (welded to shoulder and armpit seam)
        const armpitPt = armpit ? armpit.clone() : origin.clone().add(new THREE.Vector3(0, -sw * 0.35, 0));
        const armholeMid = origin.clone().lerp(armpitPt, 0.5);
        const armholeDir = origin.clone().sub(armpitPt);
        const armholeRadiusY = Math.max(0.04, armholeDir.length() * 0.5);
        const armholeDirNorm = armholeDir.clone().normalize();
        const armholeRadiusZ = sw * 0.125 * radiusScale;
        const deltoidCapBump = sw * 0.035 * radiusScale;

        let idx = 0;
        for (let j = 0; j <= N_len; j++) {
            const t = j / N_len; // 0.0 (shoulder seam) to 1.0 (cuff)

            let ringCenter, r, uAxis, vAxis;

            if (isShortSleeve) {
                const frac = t * (options.sleeveLengthFraction || 0.42);
                ringCenter = origin.clone().addScaledVector(V_upper, frac);
                r = topRadius * (1.0 - t) + bicepRadius * t;
                uAxis = basisUpper.u;
                vAxis = basisUpper.v;
            } else {
                if (t <= 0.50) {
                    const s = t / 0.50;
                    ringCenter = origin.clone().lerp(elbow, s);
                    r = topRadius * (1.0 - s) + elbowRadius * s;
                    uAxis = basisUpper.u;
                    vAxis = basisUpper.v;
                } else {
                    const s = (t - 0.50) / 0.50;
                    const wristTarget = (wrist && wristVisibility > 0.35) ? wrist : elbow.clone().add(V_fore);
                    ringCenter = elbow.clone().lerp(wristTarget, s);
                    r = elbowRadius * (1.0 - s) + wristRadius * s;
                    uAxis = basisFore.u;
                    vAxis = basisFore.v;
                }
            }

            // Smoothstep seam blend: 1.0 at shoulder/armhole seam (t=0) down to 0.0 along bicep (t >= 0.32)
            const seamWeight = Math.max(0, 1.0 - t / 0.32);
            const w = seamWeight * seamWeight * (3 - 2 * seamWeight);

            // Overlap bridge: extends sleeve cap inward under the shoulder seam to eliminate visible slits/holes
            const overlapBridge = Math.max(0, 1.0 - t / 0.18) * sw * 0.035;

            for (let i = 0; i <= N_circ; i++) {
                const theta = (i / N_circ) * Math.PI * 2.0;
                const cosT = Math.cos(theta);
                const sinT = Math.sin(theta);

                // Deltoid muscular curvature at upper sleeve
                const deltoidVolume = Math.max(0, cosT) * deltoidCapBump * (1.0 - t);

                // Bone cylinder coordinate
                const p_bone = ringCenter.clone()
                    .addScaledVector(uAxis, r * cosT + deltoidVolume)
                    .addScaledVector(vAxis, r * sinT);

                // Armhole seam coordinate (with overlap bridge into torso to eliminate any gap)
                const p_seam = armholeMid.clone()
                    .addScaledVector(armholeDirNorm, armholeRadiusY * cosT)
                    .addScaledVector(vAxis, armholeRadiusZ * sinT)
                    .addScaledVector(uAxis, deltoidVolume - overlapBridge);

                // Blended seamless position
                const p = p_seam.clone().lerp(p_bone, 1.0 - w);

                pos[idx * 3] = p.x;
                pos[idx * 3 + 1] = p.y;
                pos[idx * 3 + 2] = p.z;
                idx++;
            }
        }

        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
    }

    /**
     * Real-time Collar Band Deformation flush with the crew-neck scoop
     */
    static _deformCollar(geo, pts, options = {}) {
        const segments = 32;
        const pos = geo.attributes.position.array;
        const { C_ls, C_rs, C_solar, shoulderWidth3D } = pts;

        const sw = shoulderWidth3D;
        const collarThickness = sw * 0.020;
        const collarWidthFraction = options.neckWidth || 0.34;
        const collarHalfWidth = sw * collarWidthFraction * 0.5;
        const neckDropFraction = options.neckDrop || 0.022;
        const neckDrop = sw * neckDropFraction;

        const C_midShoulder = C_ls.clone().lerp(C_rs, 0.5);
        const u_shoulder = C_ls.clone().sub(C_rs).normalize();
        const V_spine = C_midShoulder.clone().sub(C_solar);
        const v_up = (V_spine.lengthSq() > 0.001) ? V_spine.clone().normalize() : new THREE.Vector3(0, 1, 0);

        let n_chest = v_up.clone().cross(u_shoulder).normalize();
        if (n_chest.z < 0) n_chest.negate();
        if (n_chest.lengthSq() < 0.5) n_chest = new THREE.Vector3(0, 0, 1);
        const u_lat = n_chest.clone().cross(v_up).normalize();

        const P_trap_L = C_midShoulder.clone()
            .addScaledVector(u_lat, collarHalfWidth)
            .addScaledVector(v_up, sw * 0.026)
            .addScaledVector(n_chest, -sw * 0.012);

        const P_trap_R = C_midShoulder.clone()
            .addScaledVector(u_lat, -collarHalfWidth)
            .addScaledVector(v_up, sw * 0.026)
            .addScaledVector(n_chest, -sw * 0.012);

        const P_collarDip = C_midShoulder.clone()
            .addScaledVector(v_up, -neckDrop)
            .addScaledVector(n_chest, sw * 0.032);

        let idx = 0;
        for (let i = 0; i <= segments; i++) {
            const tau = (i / segments) * 2.0 - 1.0; // -1 (right trap) to 0 (front dip) to +1 (left trap)
            const trap = (tau >= 0) ? P_trap_L : P_trap_R;
            const blend = 1.0 - Math.cos(Math.abs(tau) * (Math.PI / 2.0));

            // Inner crewneck seam
            const innerPt = P_collarDip.clone().lerp(trap, blend);

            // Outer ribbing collar band
            const outerPt = innerPt.clone()
                .addScaledVector(v_up, -collarThickness * (1.0 - 0.35 * tau * tau))
                .addScaledVector(u_lat, tau * collarThickness * 0.30)
                .addScaledVector(n_chest, 0.006);

            // Inner vertex
            pos[idx * 3] = innerPt.x;
            pos[idx * 3 + 1] = innerPt.y;
            pos[idx * 3 + 2] = innerPt.z + 0.005;
            idx++;

            // Outer vertex
            pos[idx * 3] = outerPt.x;
            pos[idx * 3 + 1] = outerPt.y;
            pos[idx * 3 + 2] = outerPt.z + 0.008;
            idx++;
        }

        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
    }

    /**
     * Update garment texture dynamically across all parts
     */
    static updateTexture(garmentGroup, imageElementOrTexture) {
        if (!garmentGroup) return;

        let texture = imageElementOrTexture;
        if (!(imageElementOrTexture instanceof THREE.Texture)) {
            texture = new THREE.CanvasTexture(imageElementOrTexture);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.generateMipmaps = true;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
        }

        garmentGroup.traverse((child) => {
            if (child.isMesh && child.material && child.name !== 'smpl_body_mesh' && child.name !== 'smpl_wireframe') {
                child.material.map = texture;
                child.material.color.set(0xffffff);
                child.material.needsUpdate = true;
            }
        });
    }
}
