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
                    neckDrop: 0.04,
                    neckWidth: 0.22,
                    depthMultiplier: 1.15,
                    sleeveLengthFraction: 0.96,
                    sleeveRadiusScale: 1.12,
                    isHoodie: true,
                });
            case 'formal_shirt':
                return this._createDeformableGarment('formal_shirt', texture, {
                    neckDrop: 0.035,
                    neckWidth: 0.20,
                    depthMultiplier: 0.95,
                    sleeveLengthFraction: 0.94,
                    sleeveRadiusScale: 0.98,
                    isFormalShirt: true,
                });
            case 'jacket':
                return this._createDeformableGarment('jacket', texture, {
                    neckDrop: 0.10,
                    neckWidth: 0.22,
                    depthMultiplier: 1.20,
                    sleeveLengthFraction: 0.96,
                    sleeveRadiusScale: 1.15,
                    isJacket: true,
                });
            case 'tshirt':
            default:
                return this._createDeformableGarment('tshirt', texture, {
                    neckDrop: 0.04, // Tamed from 0.10 to fit cleanly at the throat/clavicles
                    neckWidth: 0.23, // Tamed from 0.30 to avoid over-scooping
                    depthMultiplier: 1.0,
                    sleeveLengthFraction: 0.44, // short sleeves
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
                    isLeft: true
                }, { ...options, ...tweaks });

                // 3. Deform Right Sleeve (seamless shoulder-to-armpit seam welding)
                GarmentModelFactory._deformSleeve(rightSleeveMesh.geometry, {
                    origin: C_rs,
                    armpit: C_rightArmpit,
                    elbow: C_rightElbow,
                    wrist: C_rightWrist,
                    wristVisibility: bodyCage.rightWrist?.visibility ?? 1.0,
                    shoulderWidth3D,
                    isLeft: false
                }, { ...options, ...tweaks });

                // 4. Deform Collar Band
                GarmentModelFactory._deformCollar(collarMesh.geometry, {
                    C_neck, C_sternum, C_clavicleL, C_clavicleR,
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
        const Ny = 28;
        const Nx = 28;

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

                indices.push(a, b, d);
                indices.push(b, c, d);
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
        const N_len = 18;
        const N_circ = 16;

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
        const segments = 24;
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

            indices.push(a, b, d);
            indices.push(b, c, d);
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
        const Ny = 28;
        const Nx = 28;
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

        const neckDrop = options.neckDrop || 0.04;
        const neckWidth = options.neckWidth || 0.23;
        const depthMul = options.depthMultiplier || 1.0;
        const silhouetteBounds = options.silhouetteBounds || null;

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
                C = C_navel.clone().lerp(C_sternum, t);
                R = C_rightWaist.clone().lerp(C_rightArmpit, t);
            } else {
                const t = (v - 0.70) / 0.30;
                L = C_leftArmpit.clone().lerp(C_ls, t);
                C = C_sternum.clone().lerp(C_neck, t);
                R = C_rightArmpit.clone().lerp(C_rs, t);

                // Dynamic lateral torso elevation when arms are raised (stretches latissimus and shoulders)
                L.y += leftArmLift * t * 0.40;
                R.y += rightArmLift * t * 0.40;
            }

            // Silhouette coordinate fitting (Elastic edge snapping & overshoot elimination)
            if (silhouetteBounds && silhouetteBounds.length >= 4) {
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
                    const targetLeft3D = (bestSlice.left - 0.5) * visibleWidth;
                    const targetRight3D = (bestSlice.right - 0.5) * visibleWidth;

                    // Elastic blend factor: stronger around the ribcage/waist, soft around shoulders
                    const fitFactor = (v < 0.85) ? 0.38 : 0.18;
                    L.x = L.x * (1 - fitFactor) + targetLeft3D * fitFactor;
                    R.x = R.x * (1 - fitFactor) + targetRight3D * fitFactor;
                }
            }

            for (let i = 0; i <= Nx; i++) {
                const u = i / Nx;
                const s = (u - 0.5) * 2.0; // -1.0 (right seam) to +1.0 (left seam)

                let px, py, pz;
                if (s < 0) {
                    const tx = s + 1.0; // 0 at right seam, 1 at center
                    px = R.x * (1 - tx) + C.x * tx;
                    py = R.y * (1 - tx) + C.y * tx;
                    pz = R.z * (1 - tx) + C.z * tx;
                } else {
                    const tx = s; // 0 at center, 1 at left seam
                    px = C.x * (1 - tx) + L.x * tx;
                    py = C.y * (1 - tx) + L.y * tx;
                    pz = C.z * (1 - tx) + L.z * tx;
                }

                // Anatomical front chest curvature / depth volume
                const chestCurve = Math.max(0, 1.0 - s * s);
                const vProfile = Math.sin(Math.min(1.0, v * 1.15) * Math.PI);
                const depth = shoulderWidth3D * 0.16 * depthMul * chestCurve * (0.35 + 0.65 * vProfile);
                pz += depth;

                // Smooth neckline scoop
                if (v > 0.65) {
                    const topWeight = (v - 0.65) / 0.35;
                    const neckProfile = Math.exp(-Math.pow(s / neckWidth, 2));
                    const dip = neckDrop * shoulderWidth3D * topWeight * neckProfile;
                    py -= dip;
                    pz -= dip * 0.25;
                }

                // Outer shoulder natural slope
                if (v > 0.75) {
                    const shWeight = (v - 0.75) / 0.25;
                    py -= shoulderWidth3D * 0.05 * shWeight * (s * s);
                }

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
        const N_len = 18;
        const N_circ = 16;
        const pos = geo.attributes.position.array;

        const { origin, armpit, elbow, wrist, wristVisibility, shoulderWidth3D, isLeft } = pts;
        const isShortSleeve = options.sleeveLengthFraction && options.sleeveLengthFraction < 0.6;
        const radiusScale = options.sleeveRadiusScale || 1.0;

        const topRadius = shoulderWidth3D * 0.165 * radiusScale;
        const elbowRadius = shoulderWidth3D * 0.125 * radiusScale;
        const wristRadius = shoulderWidth3D * 0.095 * radiusScale;
        const bicepRadius = shoulderWidth3D * 0.138 * radiusScale;

        // Armhole seam geometry for seamless welding into torso
        const armpitPt = armpit || origin.clone().add(new THREE.Vector3(0, -shoulderWidth3D * 0.35, 0));
        const armholeMid = origin.clone().lerp(armpitPt, 0.5);
        const armholeVec = armpitPt.clone().sub(origin);
        const armholeRadiusY = Math.max(0.04, armholeVec.length() * 0.5);
        const armholeDirY = armholeVec.clone().normalize();
        const armholeDirZ = new THREE.Vector3(0, 0, 1);
        const armholeRadiusZ = shoulderWidth3D * 0.13 * radiusScale;

        // Upper arm vector: from shoulder (origin) to elbow
        const V_upper = (elbow ? elbow.clone().sub(origin) : new THREE.Vector3(0, -shoulderWidth3D * 0.9, 0));
        const upperLen = Math.max(0.04, V_upper.length());
        const dirUpper = V_upper.clone().normalize();

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

        // Helper to construct orthonormal basis perpendicular to bone direction
        const getBasis = (dir) => {
            let ref = new THREE.Vector3(0, 0, 1);
            if (Math.abs(dir.dot(ref)) > 0.90) {
                ref = new THREE.Vector3(0, 1, 0);
            }
            const u = new THREE.Vector3().crossVectors(dir, ref).normalize();
            const v = new THREE.Vector3().crossVectors(u, dir).normalize();
            if (!isLeft) u.negate();
            return { u, v };
        };

        const basisUpper = getBasis(dirUpper);
        const basisFore = getBasis(dirFore);

        let idx = 0;
        for (let j = 0; j <= N_len; j++) {
            const t = j / N_len; // 0.0 (shoulder seam) to 1.0 (cuff)

            let ringCenter, r, uAxis, vAxis;

            if (isShortSleeve) {
                // Short sleeve (T-Shirt): spans shoulder down to bicep
                const frac = t * (options.sleeveLengthFraction || 0.42);
                ringCenter = origin.clone().addScaledVector(V_upper, frac);
                r = topRadius * (1.0 - t) + bicepRadius * t;
                uAxis = basisUpper.u;
                vAxis = basisUpper.v;
            } else {
                // Long sleeve (Shirt, Hoodie, Jacket): spans shoulder -> elbow -> wrist
                if (t <= 0.50) {
                    const s = t / 0.50; // 0 (shoulder) to 1 (elbow)
                    ringCenter = origin.clone().lerp(elbow, s);
                    r = topRadius * (1.0 - s) + elbowRadius * s;
                    uAxis = basisUpper.u;
                    vAxis = basisUpper.v;
                } else {
                    const s = (t - 0.50) / 0.50; // 0 (elbow) to 1 (wrist)
                    const wristTarget = (wrist && wristVisibility > 0.35) ? wrist : elbow.clone().add(V_fore);
                    ringCenter = elbow.clone().lerp(wristTarget, s);
                    r = elbowRadius * (1.0 - s) + wristRadius * s;
                    uAxis = basisFore.u;
                    vAxis = basisFore.v;
                }
            }

            // Cubic smoothstep blend: 1.0 at shoulder/armhole seam (t=0) down to 0.0 along bicep (t >= 0.35)
            const seamWeight = Math.max(0, 1.0 - t / 0.35);
            const w = seamWeight * seamWeight * (3 - 2 * seamWeight);

            // Wrap complete 360-degree cylinder enclosing the arm
            for (let i = 0; i <= N_circ; i++) {
                const fracCirc = i / N_circ;
                // theta: wraps 360 degrees around the bone axis
                const theta = -Math.PI / 2.0 + fracCirc * Math.PI * 2.0;

                const sinT = Math.sin(theta);
                const cosT = Math.cos(theta);

                // Bone ring coordinate
                const p_bone_x = ringCenter.x + r * (sinT * uAxis.x + cosT * vAxis.x);
                const p_bone_y = ringCenter.y + r * (sinT * uAxis.y + cosT * vAxis.y);
                const p_bone_z = ringCenter.z + r * (sinT * uAxis.z + cosT * vAxis.z);

                // Armhole perimeter coordinate (welded to shoulder origin and armpit)
                const p_seam_x = armholeMid.x - cosT * armholeRadiusY * armholeDirY.x + sinT * armholeRadiusZ * armholeDirZ.x;
                const p_seam_y = armholeMid.y - cosT * armholeRadiusY * armholeDirY.y + sinT * armholeRadiusZ * armholeDirZ.y;
                const p_seam_z = armholeMid.z - cosT * armholeRadiusY * armholeDirY.z + sinT * armholeRadiusZ * armholeDirZ.z;

                // Seamlessly blended coordinate
                const px = p_seam_x * w + p_bone_x * (1 - w);
                const py = p_seam_y * w + p_bone_y * (1 - w);
                const pz = p_seam_z * w + p_bone_z * (1 - w);

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
     * Real-time Collar Band Deformation flush with the anatomical neckline
     */
    static _deformCollar(geo, pts, options = {}) {
        const segments = 24;
        const pos = geo.attributes.position.array;
        const { C_neck, C_sternum, C_clavicleL, C_clavicleR, shoulderWidth3D } = pts;

        const thickness = shoulderWidth3D * 0.035;

        let idx = 0;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = Math.PI * (1.0 - t);
            const sinA = Math.sin(angle);
            const cosA = Math.cos(angle);

            let centerPt;
            if (t < 0.5) {
                const tHalf = t * 2.0;
                centerPt = C_clavicleR.clone().lerp(C_sternum, tHalf);
            } else {
                const tHalf = (t - 0.5) * 2.0;
                centerPt = C_sternum.clone().lerp(C_clavicleL, tHalf);
            }

            // Inner vertex
            pos[idx * 3] = centerPt.x;
            pos[idx * 3 + 1] = centerPt.y;
            pos[idx * 3 + 2] = centerPt.z + 0.01;
            idx++;

            // Outer vertex
            pos[idx * 3] = centerPt.x + cosA * thickness * 0.5;
            pos[idx * 3 + 1] = centerPt.y + thickness * (0.8 + 0.2 * sinA);
            pos[idx * 3 + 2] = centerPt.z + 0.015;
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
            if (child.isMesh && child.material) {
                child.material.map = texture;
                child.material.color.set(0xffffff);
                child.material.needsUpdate = true;
            }
        });
    }
}
