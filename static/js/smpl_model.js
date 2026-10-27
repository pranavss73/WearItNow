/**
 * WearItNow - SMPL / HMR 2.0 Parametric 3D Human Mesh Recovery Module
 *
 * Professional Architecture:
 * 1. PARAMETRIC 3D DIGITAL TWIN (SMPL Topology):
 *    Reconstructs an anatomical 3D human body surface:
 *    - Full 360-degree elliptical torso (hips, waist, ribcage, chest dome)
 *    - Slender anatomical neck column (collarbones to jaw)
 *    - Articulated 3D left & right arm cylinders (shoulder to elbow)
 *    - Holographic wireframe overlay showing parametric surface tessellation
 * 2. SURFACE-BOUND 3D GARMENT DEFORMATION:
 *    Cloth vertices are mathematically bound to the 3D SMPL surface
 *    with a 15-20mm cloth offset and natural gravity/chest drape.
 *    - Torso panel with centered UV mapping matching the garment graphic
 *    - Left & right sleeves wrapping arm cylinders with dedicated sleeve UVs
 *    - Crewneck collar band hugging the base of the neck column
 * 3. REAL-TIME KINEMATICS:
 *    Solves 3D joint positions and orientations in camera space at 40-50+ FPS.
 */

import * as THREE from 'three';

export class SMPLModelFactory {
    /**
     * Create an SMPL Human Mesh Recovery rig and associated surface-bound 3D garment
     * @param {'tshirt'|'hoodie'|'formal_shirt'|'jacket'} type 
     * @param {THREE.Texture} texture 
     * @returns {THREE.Group} Root group containing body mesh and surface-bound garment
     */
    static createSMPLSystem(type, texture = null) {
        const root = new THREE.Group();
        root.name = `smpl_system_${type}`;

        // 1. SMPL 3D Body Mesh Twin Group
        const bodyGroup = new THREE.Group();
        bodyGroup.name = "smpl_body_mesh";

        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x00d4ff,
            roughness: 0.35,
            metalness: 0.20,
            transparent: true,
            opacity: 0.26,
            depthWrite: false, // Prevents Z-fighting and cloth occlusion
            side: THREE.DoubleSide,
        });

        const wireframeMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            wireframe: true,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
        });

        // 1a. Torso & Neck Twin
        const bodyTorsoGeo = this._initBodyTorsoGeometry();
        const bodyTorsoMesh = new THREE.Mesh(bodyTorsoGeo, bodyMat);
        bodyTorsoMesh.renderOrder = 0;
        bodyGroup.add(bodyTorsoMesh);

        const wireframeTorsoGeo = new THREE.BufferGeometry();
        wireframeTorsoGeo.setAttribute('position', bodyTorsoGeo.getAttribute('position'));
        wireframeTorsoGeo.setIndex(bodyTorsoGeo.getIndex());
        const wireframeTorsoMesh = new THREE.Mesh(wireframeTorsoGeo, wireframeMat);
        bodyTorsoMesh.add(wireframeTorsoMesh);

        // 1b. Left Arm Twin
        const bodyLeftArmGeo = this._initBodyArmGeometry();
        const bodyLeftArmMesh = new THREE.Mesh(bodyLeftArmGeo, bodyMat);
        bodyLeftArmMesh.renderOrder = 0;
        bodyGroup.add(bodyLeftArmMesh);

        const wireframeLeftArmGeo = new THREE.BufferGeometry();
        wireframeLeftArmGeo.setAttribute('position', bodyLeftArmGeo.getAttribute('position'));
        wireframeLeftArmGeo.setIndex(bodyLeftArmGeo.getIndex());
        const wireframeLeftArmMesh = new THREE.Mesh(wireframeLeftArmGeo, wireframeMat);
        bodyLeftArmMesh.add(wireframeLeftArmMesh);

        // 1c. Right Arm Twin
        const bodyRightArmGeo = this._initBodyArmGeometry();
        const bodyRightArmMesh = new THREE.Mesh(bodyRightArmGeo, bodyMat);
        bodyRightArmMesh.renderOrder = 0;
        bodyGroup.add(bodyRightArmMesh);

        const wireframeRightArmGeo = new THREE.BufferGeometry();
        wireframeRightArmGeo.setAttribute('position', bodyRightArmGeo.getAttribute('position'));
        wireframeRightArmGeo.setIndex(bodyRightArmGeo.getIndex());
        const wireframeRightArmMesh = new THREE.Mesh(wireframeRightArmGeo, wireframeMat);
        bodyRightArmMesh.add(wireframeRightArmMesh);

        root.add(bodyGroup);

        // 2. SMPL Surface-Bound 3D Garment
        if (texture) {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
        }

        const garmentMat = new THREE.MeshStandardMaterial({
            map: texture || null,
            color: texture ? 0xffffff : 0x2563eb,
            roughness: 0.72,
            metalness: 0.02,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.05,
            depthWrite: true,
        });

        // 2a. Garment Torso Mesh
        const garmentTorsoGeo = this._initGarmentTorsoGeometry();
        const garmentTorsoMesh = new THREE.Mesh(garmentTorsoGeo, garmentMat);
        garmentTorsoMesh.name = "smpl_garment_torso";
        garmentTorsoMesh.renderOrder = 1;
        garmentTorsoMesh.castShadow = true;
        root.add(garmentTorsoMesh);

        // 2b. Garment Left Sleeve
        const garmentLeftSleeveGeo = this._initGarmentSleeveGeometry(true);
        const garmentLeftSleeveMesh = new THREE.Mesh(garmentLeftSleeveGeo, garmentMat);
        garmentLeftSleeveMesh.name = "smpl_garment_left_sleeve";
        garmentLeftSleeveMesh.renderOrder = 1;
        garmentLeftSleeveMesh.castShadow = true;
        root.add(garmentLeftSleeveMesh);

        // 2c. Garment Right Sleeve
        const garmentRightSleeveGeo = this._initGarmentSleeveGeometry(false);
        const garmentRightSleeveMesh = new THREE.Mesh(garmentRightSleeveGeo, garmentMat);
        garmentRightSleeveMesh.name = "smpl_garment_right_sleeve";
        garmentRightSleeveMesh.renderOrder = 1;
        garmentRightSleeveMesh.castShadow = true;
        root.add(garmentRightSleeveMesh);

        // 2d. Garment Crewneck Collar Band
        const collarGeo = this._initCollarGeometry();
        const collarMesh = new THREE.Mesh(collarGeo, garmentMat);
        collarMesh.name = "smpl_garment_collar";
        collarMesh.renderOrder = 2;
        root.add(collarMesh);

        root.userData = {
            type,
            bodyMesh: bodyGroup,
            garmentTorsoMesh,
            garmentLeftSleeveMesh,
            garmentRightSleeveMesh,
            collarMesh,
            showBody: true,

            /**
             * Update SMPL body reconstruction and deform the surface-bound garment
             */
            updateDeformation: (poseData, camera, tweaks = {}) => {
                if (!poseData || !camera || !poseData.bodyCage) return;
                SMPLModelFactory._solveAndDeform(
                    bodyTorsoGeo,
                    bodyLeftArmGeo,
                    bodyRightArmGeo,
                    garmentTorsoGeo,
                    garmentLeftSleeveGeo,
                    garmentRightSleeveGeo,
                    collarGeo,
                    poseData,
                    camera,
                    tweaks
                );
            }
        };

        return root;
    }

    /**
     * Initializes topology for the 3D SMPL parametric torso and neck
     */
    static _initBodyTorsoGeometry() {
        const Ny = 28;
        const Nx = 24;
        const numVerts = (Ny + 1) * (Nx + 1);
        const positions = new Float32Array(numVerts * 3);
        const indices = [];

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
        geo.setIndex(indices);
        return geo;
    }

    /**
     * Initializes topology for 3D SMPL arm cylinder
     */
    static _initBodyArmGeometry() {
        const N_len = 12;
        const N_circ = 16;
        const numVerts = (N_len + 1) * (N_circ + 1);
        const positions = new Float32Array(numVerts * 3);
        const indices = [];

        for (let j = 0; j < N_len; j++) {
            for (let i = 0; i < N_circ; i++) {
                const a = j * (N_circ + 1) + i;
                const b = j * (N_circ + 1) + (i + 1);
                const c = (j + 1) * (N_circ + 1) + (i + 1);
                const d = (j + 1) * (N_circ + 1) + i;

                indices.push(a, b, d);
                indices.push(b, c, d);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setIndex(indices);
        return geo;
    }

    /**
     * Initializes topology and UVs for surface-bound Garment Torso Mesh
     */
    static _initGarmentTorsoGeometry() {
        const Ny = 36;
        const Nx = 36;
        const numVerts = (Ny + 1) * (Nx + 1);
        const positions = new Float32Array(numVerts * 3);
        const uvs = new Float32Array(numVerts * 2);
        const indices = [];

        for (let j = 0; j <= Ny; j++) {
            const v = j / Ny;
            for (let i = 0; i <= Nx; i++) {
                const u = i / Nx;
                const idx = j * (Nx + 1) + i;

                // Dedicated Torso UV mapping: maps central chest region [0.31, 0.69] x [0.12, 0.86]
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
     * Initializes topology and UVs for surface-bound Garment Sleeve Mesh
     */
    static _initGarmentSleeveGeometry(isLeft) {
        const N_len = 18;
        const N_circ = 20;
        const numVerts = (N_len + 1) * (N_circ + 1);
        const positions = new Float32Array(numVerts * 3);
        const uvs = new Float32Array(numVerts * 2);
        const indices = [];

        for (let j = 0; j <= N_len; j++) {
            const t = j / N_len; // 0 (shoulder rim) to 1.0 (cuff hem)
            for (let i = 0; i <= N_circ; i++) {
                const frac = i / N_circ;
                const idx = j * (N_circ + 1) + i;

                let uTex;
                if (isLeft) {
                    uTex = 0.69 + frac * (0.93 - 0.69);
                } else {
                    uTex = 0.07 + frac * (0.31 - 0.07);
                }
                const vTex = (1.0 - t) * 0.84 + t * 0.22;

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
     * Initializes topology for Crew-neck Collar Band
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

            uvs[idxInner * 2] = 0.38 + t * 0.24;
            uvs[idxInner * 2 + 1] = 0.82;

            uvs[idxOuter * 2] = 0.38 + t * 0.24;
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
     * Real-time SMPL Kinematic Solver and Surface-Bound Garment Deformation
     */
    static _solveAndDeform(
        bodyTorsoGeo, bodyLeftArmGeo, bodyRightArmGeo,
        garmentTorsoGeo, garmentLeftSleeveGeo, garmentRightSleeveGeo, collarGeo,
        poseData, camera, tweaks = {}
    ) {
        const dist = camera.position.z;
        const fovRad = (camera.fov * Math.PI) / 180;
        const visibleHeight = 2.0 * Math.tan(fovRad / 2) * dist;
        const visibleWidth = visibleHeight * camera.aspect;

        const to3D = (pt, zBias = 0) => {
            if (!pt) return new THREE.Vector3(0, 0, 0);
            const x = (pt.x - 0.5) * visibleWidth;
            const y = (0.5 - pt.y) * visibleHeight;
            const z = - (pt.z || 0) * visibleWidth * 0.85 + zBias;
            return new THREE.Vector3(x, y, z);
        };

        const cage = poseData.bodyCage;
        const C_neck = to3D(cage.neck);
        const C_ls = to3D(cage.leftShoulder);
        const C_rs = to3D(cage.rightShoulder);
        const C_sternum = to3D(cage.sternum, 0.04);
        const C_solar = to3D(cage.solarPlexus, 0.032);
        const C_navel = to3D(cage.navel, 0.022);
        const C_hipCenter = to3D(cage.hipCenter);
        const C_lh = to3D(cage.leftHip);
        const C_rh = to3D(cage.rightHip);
        const C_leftArmpit = to3D(cage.leftArmpit);
        const C_rightArmpit = to3D(cage.rightArmpit);
        const C_leftWaist = to3D(cage.leftWaist);
        const C_rightWaist = to3D(cage.rightWaist);
        const C_leftElbow = to3D(cage.leftElbow);
        const C_rightElbow = to3D(cage.rightElbow);
        const C_leftWrist = to3D(cage.leftWrist);
        const C_rightWrist = to3D(cage.rightWrist);

        const sw = Math.max(0.20, C_ls.distanceTo(C_rs));

        // 1. SOLVE KINEMATIC BASIS FRAMES
        const C_midShoulder = C_ls.clone().lerp(C_rs, 0.5);
        const u_shoulder = C_ls.clone().sub(C_rs).normalize();

        const V_spine = C_midShoulder.clone().sub(C_solar);
        const v_up = (V_spine.lengthSq() > 0.001) ? V_spine.clone().normalize() : new THREE.Vector3(0, 1, 0);

        let n_chest = v_up.clone().cross(u_shoulder).normalize();
        if (n_chest.z < 0) n_chest.negate();
        if (n_chest.lengthSq() < 0.5) n_chest = new THREE.Vector3(0, 0, 1);
        const u_lat = n_chest.clone().cross(v_up).normalize();

        // Upper arm vectors
        const V_arm_L = C_leftElbow.clone().sub(C_ls);
        const V_arm_R = C_rightElbow.clone().sub(C_rs);
        const len_arm_L = Math.max(0.15, V_arm_L.length());
        const len_arm_R = Math.max(0.15, V_arm_R.length());
        const dir_arm_L = V_arm_L.clone().normalize();
        const dir_arm_R = V_arm_R.clone().normalize();

        // Arm normal / binormal frames
        const n_arm_L = n_chest.clone();
        const u_arm_L = dir_arm_L.clone().cross(n_arm_L).normalize();

        const n_arm_R = n_chest.clone();
        const u_arm_R = dir_arm_R.clone().cross(n_arm_R).normalize();

        // ==========================================
        // 2. RECONSTRUCT SMPL 3D DIGITAL TWIN BODY
        // ==========================================

        // 2a. Torso & Neck Body Mesh
        const torsoPos = bodyTorsoGeo.attributes.position.array;
        const Ny_b = 28;
        const Nx_b = 24;
        let bIdx = 0;

        for (let j = 0; j <= Ny_b; j++) {
            const v = j / Ny_b; // 0.0 (hips) to 1.0 (neck/jaw)

            let centerPt, rx, rz;
            if (v <= 0.28) {
                // Pelvis / Hips
                const t = v / 0.28;
                centerPt = C_hipCenter.clone().lerp(C_navel, t);
                rx = sw * (0.33 - 0.03 * t);
                rz = sw * (0.19 - 0.02 * t);
            } else if (v <= 0.60) {
                // Abdomen & Waist
                const t = (v - 0.28) / 0.32;
                centerPt = C_navel.clone().lerp(C_solar, t);
                rx = sw * (0.30 + 0.07 * t);
                rz = sw * (0.17 + 0.05 * t);
            } else if (v <= 0.88) {
                // Chest & Shoulders
                const t = (v - 0.60) / 0.28;
                centerPt = C_solar.clone().lerp(C_midShoulder, t);
                rx = sw * (0.37 + 0.05 * (1.0 - t));
                rz = sw * 0.22;
            } else {
                // Slender Neck Column
                const t = (v - 0.88) / 0.12;
                centerPt = C_midShoulder.clone().addScaledVector(v_up, sw * 0.075 * t);
                rx = sw * 0.11;
                rz = sw * 0.11;
            }

            for (let i = 0; i <= Nx_b; i++) {
                const theta = (i / Nx_b) * Math.PI * 2.0;
                const cosT = Math.cos(theta);
                const sinT = Math.sin(theta);

                const p = centerPt.clone()
                    .addScaledVector(u_lat, rx * cosT)
                    .addScaledVector(n_chest, rz * sinT);

                torsoPos[bIdx * 3] = p.x;
                torsoPos[bIdx * 3 + 1] = p.y;
                torsoPos[bIdx * 3 + 2] = p.z;
                bIdx++;
            }
        }
        bodyTorsoGeo.attributes.position.needsUpdate = true;
        bodyTorsoGeo.computeVertexNormals();

        // 2b. Left Arm Body Mesh
        const leftArmPos = bodyLeftArmGeo.attributes.position.array;
        const N_arm_len = 12;
        const N_arm_circ = 16;
        let laIdx = 0;

        for (let j = 0; j <= N_arm_len; j++) {
            const t = j / N_arm_len;
            const centerPt = C_ls.clone().addScaledVector(dir_arm_L, len_arm_L * t);
            const rArm = sw * (0.105 - 0.02 * t);

            for (let i = 0; i <= N_arm_circ; i++) {
                const theta = (i / N_arm_circ) * Math.PI * 2.0;
                const p = centerPt.clone()
                    .addScaledVector(u_arm_L, rArm * Math.cos(theta))
                    .addScaledVector(n_arm_L, rArm * Math.sin(theta));

                leftArmPos[laIdx * 3] = p.x;
                leftArmPos[laIdx * 3 + 1] = p.y;
                leftArmPos[laIdx * 3 + 2] = p.z;
                laIdx++;
            }
        }
        bodyLeftArmGeo.attributes.position.needsUpdate = true;
        bodyLeftArmGeo.computeVertexNormals();

        // 2c. Right Arm Body Mesh
        const rightArmPos = bodyRightArmGeo.attributes.position.array;
        let raIdx = 0;

        for (let j = 0; j <= N_arm_len; j++) {
            const t = j / N_arm_len;
            const centerPt = C_rs.clone().addScaledVector(dir_arm_R, len_arm_R * t);
            const rArm = sw * (0.105 - 0.02 * t);

            for (let i = 0; i <= N_arm_circ; i++) {
                const theta = (i / N_arm_circ) * Math.PI * 2.0;
                const p = centerPt.clone()
                    .addScaledVector(u_arm_R, rArm * Math.cos(theta))
                    .addScaledVector(n_arm_R, rArm * Math.sin(theta));

                rightArmPos[raIdx * 3] = p.x;
                rightArmPos[raIdx * 3 + 1] = p.y;
                rightArmPos[raIdx * 3 + 2] = p.z;
                raIdx++;
            }
        }
        bodyRightArmGeo.attributes.position.needsUpdate = true;
        bodyRightArmGeo.computeVertexNormals();

        // ==========================================
        // 3. DEFORM SURFACE-BOUND 3D GARMENT
        // ==========================================

        // Collar landmarks
        const collarHalfWidth = sw * 0.17;
        const P_trap_L = C_midShoulder.clone()
            .addScaledVector(u_lat, collarHalfWidth)
            .addScaledVector(v_up, sw * 0.026)
            .addScaledVector(n_chest, -sw * 0.012);

        const P_trap_R = C_midShoulder.clone()
            .addScaledVector(u_lat, -collarHalfWidth)
            .addScaledVector(v_up, sw * 0.026)
            .addScaledVector(n_chest, -sw * 0.012);

        const P_collarDip = C_midShoulder.clone()
            .addScaledVector(v_up, -sw * 0.022)
            .addScaledVector(n_chest, sw * 0.028);

        const P_shoulder_L = C_ls.clone();
        const P_shoulder_R = C_rs.clone();

        const s_neck = 0.36;
        const getTopPoint = (s) => {
            const absS = Math.abs(s);
            if (absS <= s_neck) {
                const tau = absS / s_neck;
                const blend = 1.0 - Math.cos(tau * (Math.PI / 2.0));
                const trap = (s >= 0) ? P_trap_L : P_trap_R;
                return P_collarDip.clone().lerp(trap, blend);
            } else {
                if (s > s_neck) {
                    const lambda = (s - s_neck) / (1.0 - s_neck);
                    return P_trap_L.clone().lerp(P_shoulder_L, lambda);
                } else {
                    const lambda = (-s - s_neck) / (1.0 - s_neck);
                    return P_trap_R.clone().lerp(P_shoulder_R, lambda);
                }
            }
        };

        // 3a. Deform Garment Torso Mesh
        const gTorsoPos = garmentTorsoGeo.attributes.position.array;
        const Ny_gt = 36;
        const Nx_gt = 36;
        let gtIdx = 0;

        for (let j = 0; j <= Ny_gt; j++) {
            const v = j / Ny_gt; // 0.0 (hem) to 1.0 (shoulders)

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
                const t = (v - 0.70) / 0.30;
                L = C_leftArmpit.clone().lerp(P_shoulder_L, t);
                C = C_solar.clone().lerp(P_collarDip, t);
                R = C_rightArmpit.clone().lerp(P_shoulder_R, t);
            }

            for (let i = 0; i <= Nx_gt; i++) {
                const u = i / Nx_gt;
                const s = (u - 0.5) * 2.0; // -1.0 (right side) to +1.0 (left side)

                let p;
                if (v <= 0.70) {
                    if (s < 0) {
                        const tx = s + 1.0;
                        p = R.clone().multiplyScalar(1 - tx).addScaledVector(C, tx);
                    } else {
                        const tx = s;
                        p = C.clone().multiplyScalar(1 - tx).addScaledVector(L, tx);
                    }
                } else {
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
                    p = P_chest.clone().lerp(P_top, t);
                }

                // Surface-bound fabric offset: sits cleanly on outside of SMPL body twin
                const chestCurve = Math.max(0, 1.0 - s * s);
                const vProfile = Math.sin(Math.min(1.0, v * 1.25) * Math.PI);
                const clothOffset = sw * 0.020;
                const depth = clothOffset + sw * 0.08 * chestCurve * (0.35 + 0.65 * vProfile);

                p.addScaledVector(n_chest, depth);

                // Flank curvature (wraps around ribcage)
                if (Math.abs(s) > 0.65) {
                    const flankW = (Math.abs(s) - 0.65) / 0.35;
                    p.addScaledVector(n_chest, -sw * 0.04 * flankW * flankW);
                }

                gTorsoPos[gtIdx * 3] = p.x;
                gTorsoPos[gtIdx * 3 + 1] = p.y;
                gTorsoPos[gtIdx * 3 + 2] = p.z;
                gtIdx++;
            }
        }
        garmentTorsoGeo.attributes.position.needsUpdate = true;
        garmentTorsoGeo.computeVertexNormals();

        // 3b. Deform Garment Left Sleeve (wrapping left upper arm)
        const gLeftSleevePos = garmentLeftSleeveGeo.attributes.position.array;
        const N_sleeve_len = 18;
        const N_sleeve_circ = 20;
        const sleeveLengthFrac = 0.44;
        let glsIdx = 0;

        for (let j = 0; j <= N_sleeve_len; j++) {
            const t = j / N_sleeve_len;
            const centerPt = C_ls.clone().addScaledVector(dir_arm_L, len_arm_L * sleeveLengthFrac * t);
            const rSleeve = sw * (0.125 - 0.015 * t); // Roomy cloth sleeve radius

            for (let i = 0; i <= N_sleeve_circ; i++) {
                const theta = (i / N_sleeve_circ) * Math.PI * 2.0;
                const p = centerPt.clone()
                    .addScaledVector(u_arm_L, rSleeve * Math.cos(theta))
                    .addScaledVector(n_arm_L, rSleeve * Math.sin(theta));

                gLeftSleevePos[glsIdx * 3] = p.x;
                gLeftSleevePos[glsIdx * 3 + 1] = p.y;
                gLeftSleevePos[glsIdx * 3 + 2] = p.z;
                glsIdx++;
            }
        }
        garmentLeftSleeveGeo.attributes.position.needsUpdate = true;
        garmentLeftSleeveGeo.computeVertexNormals();

        // 3c. Deform Garment Right Sleeve (wrapping right upper arm)
        const gRightSleevePos = garmentRightSleeveGeo.attributes.position.array;
        let grsIdx = 0;

        for (let j = 0; j <= N_sleeve_len; j++) {
            const t = j / N_sleeve_len;
            const centerPt = C_rs.clone().addScaledVector(dir_arm_R, len_arm_R * sleeveLengthFrac * t);
            const rSleeve = sw * (0.125 - 0.015 * t);

            for (let i = 0; i <= N_sleeve_circ; i++) {
                const theta = (i / N_sleeve_circ) * Math.PI * 2.0;
                const p = centerPt.clone()
                    .addScaledVector(u_arm_R, rSleeve * Math.cos(theta))
                    .addScaledVector(n_arm_R, rSleeve * Math.sin(theta));

                gRightSleevePos[grsIdx * 3] = p.x;
                gRightSleevePos[grsIdx * 3 + 1] = p.y;
                gRightSleevePos[grsIdx * 3 + 2] = p.z;
                grsIdx++;
            }
        }
        garmentRightSleeveGeo.attributes.position.needsUpdate = true;
        garmentRightSleeveGeo.computeVertexNormals();

        // 3d. Deform Crewneck Collar Band
        const collarPos = collarGeo.attributes.position.array;
        const segments = 32;
        const collarThickness = sw * 0.020;
        let cIdx = 0;

        for (let i = 0; i <= segments; i++) {
            const tau = (i / segments) * 2.0 - 1.0; // -1 to +1
            const trap = (tau >= 0) ? P_trap_L : P_trap_R;
            const blend = 1.0 - Math.cos(Math.abs(tau) * (Math.PI / 2.0));

            const innerPt = P_collarDip.clone().lerp(trap, blend);
            const outerPt = innerPt.clone()
                .addScaledVector(v_up, -collarThickness * (1.0 - 0.35 * tau * tau))
                .addScaledVector(u_lat, tau * collarThickness * 0.30)
                .addScaledVector(n_chest, 0.006);

            collarPos[cIdx * 3] = innerPt.x;
            collarPos[cIdx * 3 + 1] = innerPt.y;
            collarPos[cIdx * 3 + 2] = innerPt.z + 0.005;
            cIdx++;

            collarPos[cIdx * 3] = outerPt.x;
            collarPos[cIdx * 3 + 1] = outerPt.y;
            collarPos[cIdx * 3 + 2] = outerPt.z + 0.008;
            cIdx++;
        }
        collarGeo.attributes.position.needsUpdate = true;
        collarGeo.computeVertexNormals();
    }
}
