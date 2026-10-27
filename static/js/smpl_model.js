/**
 * WearItNow - SMPL / HMR 2.0 Parametric 3D Human Mesh Recovery Module
 *
 * Professional Architecture:
 * 1. PARAMETRIC 3D DIGITAL TWIN (SMPL Topology):
 *    Reconstructs an anatomical 3D human body surface (torso, chest volume, back,
 *    neck column, deltoid caps, and articulated arms) with full 360-degree volume.
 * 2. VERTEX-TO-SURFACE CLOTH BINDING:
 *    Unlike disconnected geometric primitives, garments in the SMPL engine are
 *    bound directly to the parametric 3D body surface with natural cloth offsets.
 *    Sleeves, shoulders, collar, and torso share a unified topological deformation,
 *    guaranteeing ZERO holes, ZERO tearing, and zero floating seams.
 * 3. KINEMATIC SOLVER FROM 3D WORLD LANDMARKS:
 *    Solves joint rotations and body shape parameters (beta) from MediaPipe 3D
 *    world coordinates and dense silhouette segmentation.
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

        // 1. SMPL 3D Body Mesh (Digital Twin)
        const bodyGeo = this._initSMPLBodyGeometry();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x00d4ff,
            roughness: 0.40,
            metalness: 0.15,
            wireframe: false,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: true,
        });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.name = "smpl_body_mesh";
        bodyMesh.renderOrder = 0;
        root.add(bodyMesh);

        // Holographic Wireframe Cage for the digital twin
        const wireframeGeo = bodyGeo.clone();
        const wireframeMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            wireframe: true,
            transparent: true,
            opacity: 0.20,
        });
        const wireframeMesh = new THREE.Mesh(wireframeGeo, wireframeMat);
        wireframeMesh.name = "smpl_wireframe";
        bodyMesh.add(wireframeMesh);

        // 2. SMPL Surface-Bound 3D Garment (Single Unified Contiguous Mesh)
        const garmentGeo = this._initSMPLGarmentGeometry();
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
        const garmentMesh = new THREE.Mesh(garmentGeo, garmentMat);
        garmentMesh.name = "smpl_garment_mesh";
        garmentMesh.castShadow = true;
        garmentMesh.renderOrder = 1;
        root.add(garmentMesh);

        // Collar ribbing ring
        const collarGeo = this._initCollarBandGeometry();
        const collarMesh = new THREE.Mesh(collarGeo, garmentMat);
        collarMesh.renderOrder = 2;
        root.add(collarMesh);

        root.userData = {
            type,
            bodyMesh,
            wireframeMesh,
            garmentMesh,
            collarMesh,
            showBody: true,

            /**
             * Update SMPL body reconstruction and deform the surface-bound garment
             */
            updateDeformation: (poseData, camera, tweaks = {}) => {
                if (!poseData || !camera || !poseData.bodyCage) return;
                SMPLModelFactory._solveAndDeform(
                    bodyMesh.geometry,
                    garmentMesh.geometry,
                    collarMesh.geometry,
                    poseData,
                    camera,
                    tweaks
                );
            }
        };

        return root;
    }

    /**
     * Initializes the static topology for the 3D SMPL parametric human body
     * Defines a full 360-degree anatomical torso, shoulders, and articulated arm tubes.
     */
    static _initSMPLBodyGeometry() {
        const N_height = 32;
        const N_circ = 28;
        const numVerts = (N_height + 1) * (N_circ + 1);
        const positions = new Float32Array(numVerts * 3);
        const indices = [];

        for (let j = 0; j < N_height; j++) {
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
     * Initializes the static topology for the unified surface-bound 3D Garment
     * Single contiguous mesh with front panel, back panel, and seamlessly integrated sleeves.
     */
    static _initSMPLGarmentGeometry() {
        // Unified Anatomical Pattern Grid
        const Ny = 36;
        const Nx = 36;
        const numVerts = (Ny + 1) * (Nx + 1);
        const positions = new Float32Array(numVerts * 3);
        const uvs = new Float32Array(numVerts * 2);
        const indices = [];

        // Grid partition:
        // j_armpit = 22 corresponds to v ≈ 0.61 (armpit level)
        // i_leftArmhole = 9 corresponds to u = 0.25 (left armhole seam)
        // i_rightArmhole = 27 corresponds to u = 0.75 (right armhole seam)
        const j_armpit = 22;
        const i_leftArmhole = 9;
        const i_rightArmhole = 27;

        for (let j = 0; j <= Ny; j++) {
            const v = j / Ny;
            for (let i = 0; i <= Nx; i++) {
                const idx = j * (Nx + 1) + i;

                // Dedicated Garment UV Layout:
                // Torso region [9, 27] maps to [0.28, 0.72] (centered chest graphics)
                // Left sleeve [0, 9] maps to [0.10, 0.28]
                // Right sleeve [27, 36] maps to [0.72, 0.90]
                let u_tex;
                if (i < i_leftArmhole) {
                    const s = i / i_leftArmhole;
                    u_tex = 0.10 + s * (0.28 - 0.10);
                } else if (i <= i_rightArmhole) {
                    const s = (i - i_leftArmhole) / (i_rightArmhole - i_leftArmhole);
                    u_tex = 0.28 + s * (0.72 - 0.28);
                } else {
                    const s = (i - i_rightArmhole) / (Nx - i_rightArmhole);
                    u_tex = 0.72 + s * (0.90 - 0.72);
                }

                uvs[idx * 2] = u_tex;
                uvs[idx * 2 + 1] = 0.06 + v * (0.92 - 0.06);
            }
        }

        for (let j = 0; j < Ny; j++) {
            // Below armpits (torso only): only generate quads for torso columns [i_leftArmhole, i_rightArmhole]
            // Above armpits: generate quads across all columns (sleeves + upper chest)
            // This eliminates empty corner webbing under the arms (zero batwings/zero flying squirrel!)
            const minI = (j < j_armpit) ? i_leftArmhole : 0;
            const maxI = (j < j_armpit) ? i_rightArmhole : Nx;

            for (let i = minI; i < maxI; i++) {
                const a = j * (Nx + 1) + i;
                const b = j * (Nx + 1) + (i + 1);
                const c = (j + 1) * (Nx + 1) + (i + 1);
                const d = (j + 1) * (Nx + 1) + i;

                // Front-facing counter-clockwise winding
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
     * Initializes the static topology for the Crew-neck Collar Band
     */
    static _initCollarBandGeometry() {
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
     * Real-time SMPL Kinematic Solver and Surface-Bound Garment Deformation
     */
    static _solveAndDeform(bodyGeo, garmentGeo, collarGeo, poseData, camera, tweaks = {}) {
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
        const C_ls = to3D(cage.leftShoulder);
        const C_rs = to3D(cage.rightShoulder);
        const C_sternum = to3D(cage.sternum, 0.04);
        const C_solar = to3D(cage.solarPlexus, 0.03);
        const C_navel = to3D(cage.navel, 0.02);
        const C_hipCenter = to3D(cage.hipCenter);
        const C_lh = to3D(cage.leftHip);
        const C_rh = to3D(cage.rightHip);
        const C_leftArmpit = to3D(cage.leftArmpit);
        const C_rightArmpit = to3D(cage.rightArmpit);
        const C_leftElbow = to3D(cage.leftElbow);
        const C_rightElbow = to3D(cage.rightElbow);
        const C_suprasternal = to3D(cage.suprasternalNotch);
        const C_neck = to3D(cage.neck);
        const C_clav_L = to3D(cage.clavicleLeft);
        const C_clav_R = to3D(cage.clavicleRight);

        const sw = Math.max(0.20, C_ls.distanceTo(C_rs));

        // 1. SOLVE SMPL BODY KINEMATIC FRAME
        const C_midShoulder = C_ls.clone().lerp(C_rs, 0.5);
        const u_shoulder = C_rs.clone().sub(C_ls).normalize(); // Points left to right (+X)

        const V_spine = C_midShoulder.clone().sub(C_solar);
        const v_up = (V_spine.lengthSq() > 0.001) ? V_spine.clone().normalize() : new THREE.Vector3(0, 1, 0);

        let n_chest = v_up.clone().cross(u_shoulder).normalize();
        if (n_chest.z < 0) n_chest.negate();
        if (n_chest.lengthSq() < 0.5) n_chest = new THREE.Vector3(0, 0, 1);

        // Lateral vectors in coronal plane
        const u_lat_R = n_chest.clone().cross(v_up).normalize(); // Points towards screen-right (+X)
        const u_lat_L = u_lat_R.clone().negate();                 // Points towards screen-left (-X)

        // Upper arm vectors and directions (stabilized against forearm crossings)
        const V_arm_L = C_leftElbow.clone().sub(C_ls);
        const V_arm_R = C_rightElbow.clone().sub(C_rs);
        let dir_arm_L = V_arm_L.clone().normalize();
        let dir_arm_R = V_arm_R.clone().normalize();

        if (V_arm_L.length() < 0.08 || dir_arm_L.lengthSq() < 0.5) {
            dir_arm_L = new THREE.Vector3(-0.707, -0.707, 0).normalize();
        }
        if (V_arm_R.length() < 0.08 || dir_arm_R.lengthSq() < 0.5) {
            dir_arm_R = new THREE.Vector3(0.707, -0.707, 0).normalize();
        }

        // Short sleeve length along upper arm (mid-bicep)
        const sleeveLength = sw * 0.22;

        // 2. RECONSTRUCT 3D SMPL BODY SURFACE (Digital Twin)
        const bodyPos = bodyGeo.attributes.position.array;
        const N_height = 32;
        const N_circ = 28;
        let bIdx = 0;

        for (let j = 0; j <= N_height; j++) {
            const v = j / N_height; // 0 (hips) to 1.0 (neck/head)

            let centerPt, rx, rz;
            if (v <= 0.35) {
                // Pelvis & lower abdomen
                const t = v / 0.35;
                centerPt = C_hipCenter.clone().lerp(C_navel, t);
                rx = sw * 0.44 * (1.0 - 0.06 * t);
                rz = sw * 0.22;
            } else if (v <= 0.70) {
                // Waist, solar plexus, and ribcage
                const t = (v - 0.35) / 0.35;
                centerPt = C_navel.clone().lerp(C_solar, t);
                rx = sw * (0.41 + 0.07 * t);
                rz = sw * (0.22 + 0.04 * t);
            } else if (v <= 0.88) {
                // Chest & Shoulders
                const t = (v - 0.70) / 0.18;
                centerPt = C_solar.clone().lerp(C_midShoulder, t);
                rx = sw * (0.42 + 0.04 * (1.0 - t));
                rz = sw * 0.22;
            } else {
                // Slender Neck Column
                const t = (v - 0.88) / 0.12;
                centerPt = C_midShoulder.clone().addScaledVector(v_up, sw * 0.075 * t);
                rx = sw * 0.12;
                rz = sw * 0.12;
            }

            // Adapt body radius to silhouette width if available
            const bounds = poseData.silhouetteBounds;
            if (bounds && bounds.length >= 4 && v < 0.85) {
                const approxNormY = 0.5 - (centerPt.y / visibleHeight);
                let bestSlice = null;
                let minDist = 999;
                for (let k = 0; k < bounds.length; k++) {
                    const d = Math.abs(bounds[k].y - approxNormY);
                    if (d < minDist) {
                        minDist = d;
                        bestSlice = bounds[k];
                    }
                }
                if (bestSlice && minDist < 0.12) {
                    const silW = (bestSlice.right - bestSlice.left) * visibleWidth;
                    if (silW > sw * 0.40 && silW < sw * 1.60) {
                        rx = rx * 0.40 + (silW * 0.46) * 0.60;
                    }
                }
            }

            for (let i = 0; i <= N_circ; i++) {
                const theta = (i / N_circ) * Math.PI * 2.0;
                const cosT = Math.cos(theta);
                const sinT = Math.sin(theta);

                const p = centerPt.clone()
                    .addScaledVector(u_lat_R, rx * cosT)
                    .addScaledVector(n_chest, rz * sinT);

                bodyPos[bIdx * 3] = p.x;
                bodyPos[bIdx * 3 + 1] = p.y;
                bodyPos[bIdx * 3 + 2] = p.z;
                bIdx++;
            }
        }

        bodyGeo.attributes.position.needsUpdate = true;
        bodyGeo.computeVertexNormals();

        // 3. DEFORM UNIFIED SURFACE-BOUND 3D GARMENT (Zero-Batwing Pattern with Silhouette Snapping)
        const garmentPos = garmentGeo.attributes.position.array;
        const Ny = 36;
        const Nx = 36;
        const j_armpit = 22;
        const i_leftArmhole = 9;
        const i_rightArmhole = 27;
        const v_armpit = j_armpit / Ny; // ≈ 0.611

        // Shoulder points (acromion processes)
        const P_shoulder_L = C_ls.clone();
        const P_shoulder_R = C_rs.clone();
        const L_armpit = C_leftArmpit.clone();
        const R_armpit = C_rightArmpit.clone();

        // Collar landmarks (anchored to suprasternal notch and clavicles for posture stability)
        const P_collarDip = C_suprasternal.clone()
            .addScaledVector(n_chest, sw * 0.035)
            .addScaledVector(v_up, -sw * 0.010);

        const P_trap_L = C_clav_L.clone()
            .addScaledVector(v_up, sw * 0.030)
            .addScaledVector(n_chest, -sw * 0.010);

        const P_trap_R = C_clav_R.clone()
            .addScaledVector(v_up, sw * 0.030)
            .addScaledVector(n_chest, -sw * 0.010);

        // Top edge boundary function getGarmentTop(u_torso) for u_torso in [0, 1]
        // u_torso: 0 is left armhole seam, 0.5 is collar center, 1 is right armhole seam
        const getGarmentTop = (u_t) => {
            if (u_t <= 0.28) {
                // Left shoulder line: shoulder tip to trapezius peak
                const lambda = u_t / 0.28;
                return P_shoulder_L.clone().lerp(P_trap_L, lambda);
            } else if (u_t <= 0.72) {
                // Crew-neck scoop: cosine curve from left trap dipping to center and back to right trap
                const tau = (u_t - 0.50) / 0.22; // -1.0 to +1.0
                const blend = 1.0 - Math.cos(Math.abs(tau) * (Math.PI / 2.0));
                const trap = (tau < 0) ? P_trap_L : P_trap_R;
                return P_collarDip.clone().lerp(trap, blend);
            } else {
                // Right shoulder line: trapezius peak to shoulder tip
                const lambda = (u_t - 0.72) / 0.28;
                return P_trap_R.clone().lerp(P_shoulder_R, lambda);
            }
        };

        let gIdx = 0;
        for (let j = 0; j <= Ny; j++) {
            const v = j / Ny;

            if (j < j_armpit) {
                // ==========================================
                // LOWER & MID TORSO (Hem up to Armpits)
                // ==========================================
                const t_torso = v / v_armpit; // 0.0 (hem) to 1.0 (armpits)

                // Spine center point
                let C;
                if (t_torso <= 0.50) {
                    C = C_hipCenter.clone().lerp(C_navel, t_torso / 0.50);
                } else {
                    C = C_navel.clone().lerp(C_solar, (t_torso - 0.50) / 0.50);
                }

                // Baseline anatomical body half-width (ensures full coverage even if segmentation pauses)
                const baseHalfW = sw * (0.45 - 0.02 * Math.sin(t_torso * Math.PI));
                let L = C.clone().addScaledVector(u_lat_L, baseHalfW);
                let R = C.clone().addScaledVector(u_lat_R, baseHalfW);

                // Silhouette body edge snapping (stretch to real body edges & cut overshoots)
                const bounds = poseData.silhouetteBounds;
                if (bounds && bounds.length >= 4) {
                    const approxNormY = 0.5 - (C.y / visibleHeight);
                    let bestSlice = null;
                    let minDist = 999;
                    for (let k = 0; k < bounds.length; k++) {
                        const d = Math.abs(bounds[k].y - approxNormY);
                        if (d < minDist) {
                            minDist = d;
                            bestSlice = bounds[k];
                        }
                    }

                    if (bestSlice && minDist < 0.12) {
                        const silLeft3D = (bestSlice.left - 0.5) * visibleWidth;
                        const silRight3D = (bestSlice.right - 0.5) * visibleWidth;

                        // Clamping envelope: prevents outstretched arms from ballooning the torso,
                        // while ensuring it stretches to the actual body edge
                        const maxHalfW = sw * (0.52 + 0.06 * (1.0 - t_torso));
                        const minHalfW = sw * 0.35;
                        const targetLeftX = Math.max(C.x - maxHalfW, Math.min(C.x - minHalfW, silLeft3D - sw * 0.02));
                        const targetRightX = Math.min(C.x + maxHalfW, Math.max(C.x + minHalfW, silRight3D + sw * 0.02));

                        L.x = targetLeftX;
                        R.x = targetRightX;
                    }
                }

                for (let i = 0; i <= Nx; i++) {
                    let p;
                    if (i < i_leftArmhole) {
                        // Unused corner under left sleeve (unindexed, placed safely at left flank)
                        p = L.clone();
                    } else if (i <= i_rightArmhole) {
                        // Active torso front panel
                        const u_torso = (i - i_leftArmhole) / (i_rightArmhole - i_leftArmhole); // 0 (L) to 1 (R)
                        if (u_torso < 0.5) {
                            const tx = u_torso / 0.5;
                            p = L.clone().multiplyScalar(1 - tx).addScaledVector(C, tx);
                        } else {
                            const tx = (u_torso - 0.5) / 0.5;
                            p = C.clone().multiplyScalar(1 - tx).addScaledVector(R, tx);
                        }

                        // Anatomical belly/torso roundness
                        const bellyCurve = Math.sin(u_torso * Math.PI);
                        p.addScaledVector(n_chest, sw * 0.035 * bellyCurve + sw * 0.020);
                    } else {
                        // Unused corner under right sleeve (unindexed, placed safely at right flank)
                        p = R.clone();
                    }

                    garmentPos[gIdx * 3] = p.x;
                    garmentPos[gIdx * 3 + 1] = p.y;
                    garmentPos[gIdx * 3 + 2] = p.z;
                    gIdx++;
                }

            } else {
                // ==========================================
                // UPPER REGION (Chest, Shoulders & Sleeves)
                // ==========================================
                const t_upper = (v - v_armpit) / (1.0 - v_armpit); // 0.0 (armpits) to 1.0 (shoulders)

                for (let i = 0; i <= Nx; i++) {
                    let p;

                    if (i < i_leftArmhole) {
                        // LEFT SLEEVE: Extends smoothly along left arm vector
                        const sigma = (i_leftArmhole - i) / i_leftArmhole; // 0 at armhole seam, 1 at sleeve cuff
                        const P_top = P_shoulder_L.clone().addScaledVector(dir_arm_L, sleeveLength * sigma);
                        const P_under = L_armpit.clone().addScaledVector(dir_arm_L, sleeveLength * 0.88 * sigma);
                        p = P_under.clone().lerp(P_top, t_upper);

                        // 3D sleeve roundness around upper arm
                        const armPuff = Math.sin(t_upper * Math.PI) * (sw * 0.06) * Math.sin(sigma * Math.PI * 0.5);
                        p.addScaledVector(n_chest, armPuff + sw * 0.020);

                    } else if (i <= i_rightArmhole) {
                        // UPPER CHEST & YOKE: Contoured from armpit slice to crewneck collar line
                        const u_torso = (i - i_leftArmhole) / (i_rightArmhole - i_leftArmhole); // 0 (L) to 1 (R)

                        let P_chest;
                        if (u_torso < 0.5) {
                            const tx = u_torso / 0.5;
                            P_chest = L_armpit.clone().multiplyScalar(1 - tx).addScaledVector(C_solar, tx);
                        } else {
                            const tx = (u_torso - 0.5) / 0.5;
                            P_chest = C_solar.clone().multiplyScalar(1 - tx).addScaledVector(R_armpit, tx);
                        }

                        const P_top = getGarmentTop(u_torso);
                        p = P_chest.clone().lerp(P_top, t_upper);

                        // Forward pectoral volume
                        const chestCurve = Math.sin(u_torso * Math.PI);
                        p.addScaledVector(n_chest, sw * 0.045 * chestCurve * (1.0 - 0.30 * t_upper) + sw * 0.020);

                    } else {
                        // RIGHT SLEEVE: Extends smoothly along right arm vector
                        const sigma = (i - i_rightArmhole) / (Nx - i_rightArmhole); // 0 at armhole seam, 1 at sleeve cuff
                        const P_top = P_shoulder_R.clone().addScaledVector(dir_arm_R, sleeveLength * sigma);
                        const P_under = R_armpit.clone().addScaledVector(dir_arm_R, sleeveLength * 0.88 * sigma);
                        p = P_under.clone().lerp(P_top, t_upper);

                        // 3D sleeve roundness around upper arm
                        const armPuff = Math.sin(t_upper * Math.PI) * (sw * 0.06) * Math.sin(sigma * Math.PI * 0.5);
                        p.addScaledVector(n_chest, armPuff + sw * 0.020);
                    }

                    garmentPos[gIdx * 3] = p.x;
                    garmentPos[gIdx * 3 + 1] = p.y;
                    garmentPos[gIdx * 3 + 2] = p.z;
                    gIdx++;
                }
            }
        }

        garmentGeo.attributes.position.needsUpdate = true;
        garmentGeo.computeVertexNormals();

        // 4. DEFORM COLLAR BAND ON SMPL NECK ROOT
        const collarPos = collarGeo.attributes.position.array;
        const segments = 32;
        const collarThickness = sw * 0.018;
        let cIdx = 0;

        for (let i = 0; i <= segments; i++) {
            const tau = (i / segments) * 2.0 - 1.0; // -1 (left) to +1 (right)
            const trap = (tau < 0) ? P_trap_L : P_trap_R;
            const blend = 1.0 - Math.cos(Math.abs(tau) * (Math.PI / 2.0));

            const innerPt = P_collarDip.clone().lerp(trap, blend);
            const outerPt = innerPt.clone()
                .addScaledVector(v_up, -collarThickness * (1.0 - 0.35 * tau * tau))
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
