import * as THREE from 'three';

// ── State ──
const state = { activeLayers: new Set(['skeleton']), tracking: false, landmarks: null };
let scene, camera, renderer, bodyGroup;
let skeletonGroup, muscleGroup, organGroup;
let animFrameId = null;

// ── Init Three.js ──
function initThree() {
    const container = document.getElementById('three-container');
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    scene = new THREE.Scene();
    // Transparent background (camera feed shows through)
    scene.background = null;

    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 3);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Ambient + directional light
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(1, 2, 3);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-1, -1, -2);
    scene.add(dirLight2);

    // Body group - everything is parented here for easy positioning
    bodyGroup = new THREE.Group();
    scene.add(bodyGroup);

    window.addEventListener('resize', () => {
        const w2 = container.clientWidth || window.innerWidth;
        const h2 = container.clientHeight || window.innerHeight;
        camera.aspect = w2 / h2;
        camera.updateProjectionMatrix();
        renderer.setSize(w2, h2);
    });

    // Build anatomy
    skeletonGroup = buildSkeleton();
    muscleGroup = buildMuscles();
    organGroup = buildOrgans();

    bodyGroup.add(skeletonGroup);
    bodyGroup.add(muscleGroup);
    bodyGroup.add(organGroup);

    // Start hidden until tracking
    bodyGroup.visible = false;
}

// ── Build Skeleton ──
function buildSkeleton() {
    const group = new THREE.Group();
    const matBone = new THREE.MeshPhongMaterial({
        color: 0xf5f5dc, emissive: 0x888866, emissiveIntensity: 0.15,
        transparent: true, opacity: 0.9, shininess: 30
    });
    const matJoint = new THREE.MeshPhongMaterial({
        color: 0xddddbb, emissive: 0x666644, emissiveIntensity: 0.1
    });

    function bone(a, b, radius = 0.025, color = null) {
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (len < 0.01) return;
        const mid = [(a[0] + b[0])/2, (a[1] + b[1])/2, (a[2] + b[2])/2];
        const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), color ? new THREE.MeshPhongMaterial({color}) : matBone);
        m.position.set(mid[0], mid[1], mid[2]);
        // Orient cylinder along vector
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        m.quaternion.copy(quat);
        group.add(m);
    }

    function joint(pos, radius = 0.04) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 8), matJoint);
        m.position.set(pos[0], pos[1], pos[2]);
        group.add(m);
    }

    // Define key landmarks (normalized coordinates, z gives depth cue)
    // Based on MediaPipe Pose landmarks (simplified)
    const L = {
        nose: [0, 1.1, 0],
        leye: [-0.07, 1.05, 0.03], reye: [0.07, 1.05, 0.03],
        lear: [-0.12, 1.02, -0.05], rear: [0.12, 1.02, -0.05],
        mouth: [0, 0.98, 0.03],
        neck: [0, 0.9, 0],
        lshoulder: [-0.22, 0.85, 0], rshoulder: [0.22, 0.85, 0],
        larm: [-0.30, 0.65, 0.02], rarm: [0.30, 0.65, 0.02],
        lelbow: [-0.32, 0.45, 0.04], relbow: [0.32, 0.45, 0.04],
        lwrist: [-0.30, 0.20, 0.04], rwrist: [0.30, 0.20, 0.04],
        spine_top: [0, 0.75, -0.02], spine_mid: [0, 0.55, 0], spine_low: [0, 0.35, 0.02],
        lhip: [-0.15, 0.30, 0.02], rhip: [0.15, 0.30, 0.02],
        lknee: [-0.13, -0.10, 0.04], rknee: [0.13, -0.10, 0.04],
        lankle: [-0.10, -0.45, 0], rankle: [0.10, -0.45, 0],
        lfoot: [-0.10, -0.55, 0.03], rfoot: [0.10, -0.55, 0.03],
    };

    // Spine
    bone(L.neck, L.spine_top, 0.035);
    bone(L.spine_top, L.spine_mid, 0.035);
    bone(L.spine_mid, L.spine_low, 0.035);

    // Rib cage (simplified - arch wires)
    for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 4; i++) {
            const yOff = 0.08 * i;
            const r = 0.18 - 0.02 * i;
            const pts = [];
            for (let a = 0; a <= Math.PI; a += 0.3) {
                pts.push([side * r * Math.sin(a), 0.73 - yOff, -0.02 + r * (1 - Math.cos(a)) * 0.5]);
            }
            for (let j = 0; j < pts.length - 1; j++) {
                bone(pts[j], pts[j+1], 0.012, 0xd4c9a0);
            }
        }
    }

    // Arms
    bone(L.lshoulder, L.lelbow, 0.03); bone(R.rshoulder, R.relbow, 0.03);
    bone(L.lelbow, L.lwrist, 0.025); bone(R.relbow, R.rwrist, 0.025);
    // Legs
    bone(L.lhip, L.lknee, 0.04); bone(R.rhip, R.rknee, 0.04);
    bone(L.lknee, L.lankle, 0.03); bone(R.rknee, R.rankle, 0.03);
    bone(L.lankle, L.lfoot, 0.02); bone(R.rankle, R.rfoot, 0.02);
    // Skull
    bone(L.nose, L.neck, 0.04);
    // Clavicles
    bone(L.neck, L.lshoulder, 0.02); bone(L.neck, R.rshoulder, 0.02);
    // Pelvis
    bone(L.lhip, R.rhip, 0.035);
    bone(L.lhip, L.spine_low, 0.025); bone(R.rhip, L.spine_low, 0.025);

    // Joints
    joint(L.nose, 0.03); joint(L.neck, 0.035);
    joint(L.lshoulder, 0.04); joint(R.rshoulder, 0.04);
    joint(L.lelbow, 0.035); joint(R.relbow, 0.035);
    joint(L.lwrist, 0.03); joint(R.rwrist, 0.03);
    joint(L.lhip, 0.04); joint(R.rhip, 0.04);
    joint(L.lknee, 0.035); joint(R.rknee, 0.035);
    joint(L.lankle, 0.03); joint(R.rankle, 0.03);

    group.visible = true;
    return group;
}

// ── Build Muscles ──
function buildMuscles() {
    const group = new THREE.Group();
    const muscleMat = new THREE.MeshPhongMaterial({
        color: 0xcc6644, transparent: true, opacity: 0.4, emissive: 0x442211, emissiveIntensity: 0.1
    });

    function muscleShape(name, pos, scale, color = null) {
        const mat = color ? new THREE.MeshPhongMaterial({color, transparent: true, opacity: 0.4}) : muscleMat;
        const shapes = {
            'chest': new THREE.SphereGeometry(0.16, 12, 8),
            'bicep': new THREE.CylinderGeometry(0.05, 0.04, 0.2, 8),
            'thigh': new THREE.CylinderGeometry(0.07, 0.05, 0.3, 8),
            'calf': new THREE.CylinderGeometry(0.04, 0.03, 0.25, 8),
            'forearm': new THREE.CylinderGeometry(0.035, 0.025, 0.2, 8),
            'abs': new THREE.BoxGeometry(0.15, 0.2, 0.06),
            'shoulder': new THREE.SphereGeometry(0.06, 8, 6),
            'glute': new THREE.SphereGeometry(0.08, 8, 6),
            'back': new THREE.CylinderGeometry(0.15, 0.12, 0.25, 8),
        };
        const geo = shapes[name] || new THREE.SphereGeometry(0.05, 8, 6);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(pos[0], pos[1], pos[2]);
        if (scale) m.scale.set(scale[0]||1, scale[1]||1, scale[2]||1);
        group.add(m);
    }

    // Torso muscles
    muscleShape('chest', [0, 0.70, 0.06], [1, 0.7, 0.4]);
    muscleShape('abs', [0, 0.52, 0.07], [1, 0.8, 0.3]);
    muscleShape('back', [0, 0.65, -0.08], [0.8, 1, 0.4]);
    muscleShape('shoulder', [-0.20, 0.72, 0.02], [0.8, 0.8, 0.6]);
    muscleShape('shoulder', [0.20, 0.72, 0.02], [0.8, 0.8, 0.6]);
    muscleShape('glute', [-0.08, 0.28, -0.07], [1, 0.6, 0.5]);
    muscleShape('glute', [0.08, 0.28, -0.07], [1, 0.6, 0.5]);

    // Arms
    muscleShape('bicep', [-0.30, 0.62, 0], null, 0xcc6644);
    muscleShape('bicep', [0.30, 0.62, 0], null, 0xcc6644);
    muscleShape('forearm', [-0.30, 0.42, 0], null, 0xbb5533);
    muscleShape('forearm', [0.30, 0.42, 0], null, 0xbb5533);

    // Legs
    muscleShape('thigh', [-0.12, 0.15, 0], null, 0xcc6644);
    muscleShape('thigh', [0.12, 0.15, 0], null, 0xcc6644);

    group.visible = false;
    return group;
}

// ── Build Organs ──
function buildOrgans() {
    const group = new THREE.Group();

    function organ(name, pos, geo, color, opacity = 0.6) {
        const mat = new THREE.MeshPhongMaterial({
            color, transparent: true, opacity, emissive: color, emissiveIntensity: 0.05,
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(pos[0], pos[1], pos[2]);
        group.add(m);
    }

    // Brain
    organ('brain', [0, 1.02, 0.04], new THREE.SphereGeometry(0.065, 12, 10), 0xe8b8b0, 0.7);
    // Eyes
    organ('eye_l', [-0.04, 0.97, 0.07], new THREE.SphereGeometry(0.025, 8, 6), 0xffffff, 0.8);
    organ('eye_r', [0.04, 0.97, 0.07], new THREE.SphereGeometry(0.025, 8, 6), 0xffffff, 0.8);
    // Heart
    const heartGeo = new THREE.SphereGeometry(0.04, 10, 8);
    heartGeo.scale(1, 1.1, 0.8);
    organ('heart', [0.04, 0.68, 0.06], heartGeo, 0xcc3333, 0.75);
    // Lungs
    const lungGeo = new THREE.SphereGeometry(0.065, 10, 8);
    lungGeo.scale(0.7, 1.1, 0.6);
    organ('lung_l', [-0.08, 0.66, 0.04], lungGeo, 0xff9999, 0.4);
    organ('lung_r', [0.08, 0.66, 0.04], lungGeo, 0xff9999, 0.4);
    // Liver
    const liverGeo = new THREE.ConeGeometry(0.05, 0.04, 6);
    organ('liver', [0.04, 0.48, 0.04], liverGeo, 0x884422, 0.6);
    // Stomach
    const stomachGeo = new THREE.SphereGeometry(0.035, 8, 6);
    stomachGeo.scale(1, 1.2, 0.8);
    organ('stomach', [-0.035, 0.44, 0.04], stomachGeo, 0x996633, 0.5);
    // Kidneys
    const kidneyGeo = new THREE.SphereGeometry(0.025, 8, 6);
    kidneyGeo.scale(0.7, 1.0, 0.5);
    organ('kidney_l', [-0.10, 0.49, -0.02], kidneyGeo, 0x884422, 0.5);
    organ('kidney_r', [0.10, 0.49, -0.02], kidneyGeo, 0x884422, 0.5);
    // Intestines
    const intestineGeo = new THREE.TorusGeometry(0.04, 0.018, 6, 10);
    organ('intestine', [0, 0.33, 0.04], intestineGeo, 0xccaa77, 0.4);
    // Bladder
    organ('bladder', [0, 0.28, 0.03], new THREE.SphereGeometry(0.02, 6, 6), 0x88aacc, 0.5);

    group.visible = false;
    return group;
}

// ── Update body from landmarks ──
function updateBodyLandmarks(landmarks) {
    if (!landmarks || landmarks.length < 33) return;

    // Extract key landmarks
    const getLm = (i) => ({ x: landmarks[i].x - 0.5, y: -(landmarks[i].y - 0.5) * 1.8, z: (landmarks[i].z || 0) * 3 });

    const nose = getLm(0);
    const lshoulder = getLm(11), rshoulder = getLm(12);
    const lelbow = getLm(13), relbow = getLm(14);
    const lwrist = getLm(15), rwrist = getLm(16);
    const lhip = getLm(23), rhip = getLm(24);
    const lknee = getLm(25), rknee = getLm(26);
    const lankle = getLm(27), rankle = getLm(28);

    // Calculate body center and scale
    const centerX = (lshoulder.x + rshoulder.x + lhip.x + rhip.x) / 4;
    const centerY = (lshoulder.y + rshoulder.y + lhip.y + rhip.y) / 4;
    const bodyWidth = Math.abs(rshoulder.x - lshoulder.x);
    const bodyHeight = Math.abs(lshoulder.y - lhip.y);
    const scale = bodyWidth > 0.1 ? bodyWidth * 1.5 : 0.5;

    // Position body group
    bodyGroup.position.set(centerX, centerY, 0);
    bodyGroup.scale.set(scale, scale, scale);

    // Animate skeleton bones to match pose
    // Simple approach: adjust individual bone positions would need rigging
    // For now we move the whole body as a unit
    // More advanced: use SkinnedMesh or per-bone IK
}

// ── Pose Detection Callback ──
function onPoseResults(results) {
    if (!results || !results.poseLandmarks) {
        bodyGroup.visible = false;
        state.tracking = false;
        document.getElementById('status-text').textContent = '👤 未检测到人体';
        return;
    }

    state.tracking = true;
    state.landmarks = results.poseLandmarks;
    bodyGroup.visible = true;
    document.getElementById('status-text').textContent = '✅ 已跟踪';

    updateBodyLandmarks(results.poseLandmarks);
}

// ── Animation Loop ──
function animate(time) {
    animFrameId = requestAnimationFrame(animate);

    if (state.tracking && bodyGroup.visible) {
        // Gentle breathing/movement animation
        const breathe = Math.sin(time * 0.002) * 0.003;
        if (organGroup.visible) {
            // Animate organs slightly with breathing
            organGroup.children.forEach((child, i) => {
                if (child.type === 'Mesh') {
                    child.position.y += Math.sin(time * 0.002 + i) * 0.0005;
                }
            });
        }
    }

    renderer.render(scene, camera);
}

// ── Camera + MediaPipe Pose ──
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        const video = document.getElementById('video');
        video.srcObject = stream;
        await video.play();

        document.getElementById('status-text').textContent = '📷 正在加载AI模型...';

        // MediaPipe Pose
        const pose = new window.Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            smoothSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        pose.onResults(onPoseResults);

        const camera2 = new window.Camera(video, {
            onFrame: async () => {
                try {
                    await pose.send({ image: video });
                } catch (e) {}
            },
            width: 640,
            height: 480
        });

        await camera2.start();
        document.getElementById('status-text').textContent = '✅ 运行中';
        return { pose, camera: camera2 };
    } catch (err) {
        document.getElementById('status-text').textContent = '❌ 错误: ' + err.message;
        console.error('Camera error:', err);
    }
}

// ── UI Controls ──
function setupUI() {
    ['skeleton', 'muscles', 'organs'].forEach(layer => {
        if (state.activeLayers.has(layer)) {
            document.querySelector(`[data-layer="${layer}"]`)?.classList.add('active');
        }
    });

    document.querySelectorAll('#controls button').forEach(btn => {
        btn.addEventListener('click', () => {
            const layer = btn.dataset.layer;
            if (layer) {
                // Toggle single layer
                if (state.activeLayers.has(layer)) {
                    state.activeLayers.delete(layer);
                    btn.classList.remove('active');
                } else {
                    state.activeLayers.add(layer);
                    btn.classList.add('active');
                }
            } else if (btn.id === 'btn-all') {
                // Toggle all
                const allOn = state.activeLayers.size === 3;
                document.querySelectorAll('[data-layer]').forEach(b => {
                    const l = b.dataset.layer;
                    if (allOn) {
                        state.activeLayers.delete(l);
                        b.classList.remove('active');
                    } else {
                        state.activeLayers.add(l);
                        b.classList.add('active');
                    }
                });
            }

            // Update layer visibility
            skeletonGroup.visible = state.activeLayers.has('skeleton');
            muscleGroup.visible = state.activeLayers.has('muscles');
            organGroup.visible = state.activeLayers.has('organs');
        });
    });
}

// ── Init ──
async function main() {
    initThree();
    setupUI();
    animate();
    await startCamera();
}

main().catch(console.error);
