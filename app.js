// app.js - AR Human Anatomy Viewer
// Uses THREE.js (r128 global) + MediaPipe Pose

// ── State ──
const state = { activeLayers: new Set(['skeleton']), tracking: false, landmarks: null };
let scene, camera, renderer, bodyGroup;
let skeletonGroup, muscleGroup, organGroup;
let animFrameId = null;
let modelLoaded = false;

// ── Show/Hide UI helpers ──
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function setStatus(msg) { document.getElementById('status-text').textContent = msg; }

// ── Init Three.js ──
function initThree() {
    const container = document.getElementById('three-container');
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 3);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dl1.position.set(1, 2, 3);
    scene.add(dl1);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dl2.position.set(-1, -1, -2);
    scene.add(dl2);

    bodyGroup = new THREE.Group();
    scene.add(bodyGroup);

    window.addEventListener('resize', () => {
        const w2 = container.clientWidth || window.innerWidth;
        const h2 = container.clientHeight || window.innerHeight;
        camera.aspect = w2 / h2;
        camera.updateProjectionMatrix();
        renderer.setSize(w2, h2);
    });

    skeletonGroup = buildSkeleton();
    muscleGroup = buildMuscles();
    organGroup = buildOrgans();
    bodyGroup.add(skeletonGroup);
    bodyGroup.add(muscleGroup);
    bodyGroup.add(organGroup);
    bodyGroup.visible = false;
}

// ── Build Skeleton ──
function buildSkeleton() {
    const group = new THREE.Group();
    const matBone = new THREE.MeshPhongMaterial({ color: 0xf5f5dc, emissive: 0x888866, emissiveIntensity: 0.15, transparent: true, opacity: 0.9 });
    const matJoint = new THREE.MeshPhongMaterial({ color: 0xddddbb, emissive: 0x666644, emissiveIntensity: 0.1 });

    function bone(a, b, radius, color) {
        radius = radius || 0.025;
        const dx = b[0]-a[0], dy = b[1]-a[1], dz = b[2]-a[2];
        const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (len < 0.01) return;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6),
            color ? new THREE.MeshPhongMaterial({color:color}) : matBone);
        m.position.set((a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2);
        const up = new THREE.Vector3(0,1,0);
        const dir = new THREE.Vector3(dx,dy,dz).normalize();
        m.quaternion.setFromUnitVectors(up, dir);
        group.add(m);
    }
    function joint(pos, r) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r||0.04, 8, 8), matJoint);
        m.position.set(pos[0], pos[1], pos[2]);
        group.add(m);
    }

    const L = {
        nose:[0,1.1,0], neck:[0,0.9,0],
        lshoulder:[-0.22,0.85,0], rshoulder:[0.22,0.85,0],
        lelbow:[-0.32,0.45,0.04], relbow:[0.32,0.45,0.04],
        lwrist:[-0.30,0.20,0.04], rwrist:[0.30,0.20,0.04],
        spine_top:[0,0.75,-0.02], spine_mid:[0,0.55,0], spine_low:[0,0.35,0.02],
        lhip:[-0.15,0.30,0.02], rhip:[0.15,0.30,0.02],
        lknee:[-0.13,-0.10,0.04], rknee:[0.13,-0.10,0.04],
        lankle:[-0.10,-0.45,0], rankle:[0.10,-0.45,0],
        lfoot:[-0.10,-0.55,0.03], rfoot:[0.10,-0.55,0.03],
    };

    // Spine
    bone(L.neck, L.spine_top, 0.035);
    bone(L.spine_top, L.spine_mid, 0.035);
    bone(L.spine_mid, L.spine_low, 0.035);
    // Ribs
    for (let s=-1; s<=1; s+=2)
        for (let i=0; i<4; i++) {
            const y=0.08*i, r=0.18-0.02*i, pts=[];
            for (let a=0; a<=Math.PI; a+=0.3)
                pts.push([s*r*Math.sin(a), 0.73-y, -0.02+r*(1-Math.cos(a))*0.5]);
            for (let j=0; j<pts.length-1; j++) bone(pts[j], pts[j+1], 0.012, 0xd4c9a0);
        }
    // Arms & Legs
    bone(L.lshoulder, L.lelbow, 0.03); bone(L.lelbow, L.lwrist, 0.025);
    bone(R.rshoulder, R.relbow, 0.03); bone(R.relbow, R.rwrist, 0.025);
    bone(L.lhip, L.lknee, 0.04); bone(L.lknee, L.lankle, 0.03); bone(L.lankle, L.lfoot, 0.02);
    bone(R.rhip, R.rknee, 0.04); bone(R.rknee, R.rankle, 0.03); bone(R.rankle, R.rfoot, 0.02);
    // Skull & Clavicles & Pelvis
    bone(L.nose, L.neck, 0.04);
    bone(L.neck, L.lshoulder, 0.02); bone(L.neck, R.rshoulder, 0.02);
    bone(L.lhip, R.rhip, 0.035);
    bone(L.lhip, L.spine_low, 0.025); bone(R.rhip, L.spine_low, 0.025);

    // Joints
    joint(L.nose,0.03); joint(L.neck,0.035);
    joint(L.lshoulder,0.04); joint(R.rshoulder,0.04);
    joint(L.lelbow,0.035); joint(R.relbow,0.035);
    joint(L.lwrist,0.03); joint(R.rwrist,0.03);
    joint(L.lhip,0.04); joint(R.rhip,0.04);
    joint(L.lknee,0.035); joint(R.rknee,0.035);
    joint(L.lankle,0.03); joint(R.rankle,0.03);
    group.visible = true;
    return group;
}

// ── Build Muscles ──
function buildMuscles() {
    const group = new THREE.Group();
    const mat = new THREE.MeshPhongMaterial({ color:0xcc6644, transparent:true, opacity:0.4, emissive:0x442211, emissiveIntensity:0.1 });
    
    function add(name, pos, scale, c) {
        const m = c ? new THREE.MeshPhongMaterial({color:c, transparent:true, opacity:0.4}) : mat;
        const geo = { 'chest':new THREE.SphereGeometry(0.16,12,8), 'bicep':new THREE.CylinderGeometry(0.05,0.04,0.2,8),
            'thigh':new THREE.CylinderGeometry(0.07,0.05,0.3,8), 'calf':new THREE.CylinderGeometry(0.04,0.03,0.25,8),
            'forearm':new THREE.CylinderGeometry(0.035,0.025,0.2,8), 'abs':new THREE.BoxGeometry(0.15,0.2,0.06),
            'shoulder':new THREE.SphereGeometry(0.06,8,6), 'glute':new THREE.SphereGeometry(0.08,8,6),
            'back':new THREE.CylinderGeometry(0.15,0.12,0.25,8) }[name] || new THREE.SphereGeometry(0.05,8,6);
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.set(pos[0], pos[1], pos[2]);
        if (scale) mesh.scale.set(scale[0]||1, scale[1]||1, scale[2]||1);
        group.add(mesh);
    }
    add('chest',[0,0.70,0.06],[1,0.7,0.4]);
    add('abs',[0,0.52,0.07],[1,0.8,0.3]);
    add('back',[0,0.65,-0.08],[0.8,1,0.4]);
    add('shoulder',[-0.20,0.72,0.02],[0.8,0.8,0.6]);
    add('shoulder',[0.20,0.72,0.02],[0.8,0.8,0.6]);
    add('glute',[-0.08,0.28,-0.07],[1,0.6,0.5]);
    add('glute',[0.08,0.28,-0.07],[1,0.6,0.5]);
    add('bicep',[-0.30,0.62,0],null,0xcc6644);
    add('bicep',[0.30,0.62,0],null,0xcc6644);
    add('forearm',[-0.30,0.42,0],null,0xbb5533);
    add('forearm',[0.30,0.42,0],null,0xbb5533);
    add('thigh',[-0.12,0.15,0],null,0xcc6644);
    add('thigh',[0.12,0.15,0],null,0xcc6644);
    group.visible = false;
    return group;
}

// ── Build Organs ──
function buildOrgans() {
    const group = new THREE.Group();
    function add(pos, geo, c, op) {
        const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({color:c, transparent:true, opacity:op||0.6, emissive:c, emissiveIntensity:0.05}));
        m.position.set(pos[0], pos[1], pos[2]); group.add(m);
    }
    add([0,1.02,0.04], new THREE.SphereGeometry(0.065,12,10), 0xe8b8b0, 0.7); // brain
    add([-0.04,0.97,0.07], new THREE.SphereGeometry(0.025,8,6), 0xffffff, 0.8); // eye L
    add([0.04,0.97,0.07], new THREE.SphereGeometry(0.025,8,6), 0xffffff, 0.8); // eye R
    const hg = new THREE.SphereGeometry(0.04,10,8); hg.scale(1,1.1,0.8);
    add([0.04,0.68,0.06], hg, 0xcc3333, 0.75); // heart
    const lg = new THREE.SphereGeometry(0.065,10,8); lg.scale(0.7,1.1,0.6);
    add([-0.08,0.66,0.04], lg, 0xff9999, 0.4); add([0.08,0.66,0.04], lg, 0xff9999, 0.4); // lungs
    add([0.04,0.48,0.04], new THREE.ConeGeometry(0.05,0.04,6), 0x884422, 0.6); // liver
    const sg = new THREE.SphereGeometry(0.035,8,6); sg.scale(1,1.2,0.8);
    add([-0.035,0.44,0.04], sg, 0x996633, 0.5); // stomach
    const kg = new THREE.SphereGeometry(0.025,8,6); kg.scale(0.7,1,0.5);
    add([-0.10,0.49,-0.02], kg, 0x884422, 0.5); add([0.10,0.49,-0.02], kg, 0x884422, 0.5); // kidneys
    add([0,0.33,0.04], new THREE.TorusGeometry(0.04,0.018,6,10), 0xccaa77, 0.4); // intestines
    add([0,0.28,0.03], new THREE.SphereGeometry(0.02,6,6), 0x88aacc, 0.5); // bladder
    group.visible = false;
    return group;
}

// ── Update body position from landmarks ──
function updateBodyLandmarks(landmarks) {
    if (!landmarks || landmarks.length < 33) return;
    const get = (i) => ({ x: landmarks[i].x - 0.5, y: -(landmarks[i].y - 0.5) * 1.8, z: (landmarks[i].z || 0) * 3 });
    const ls = get(11), rs = get(12), lh = get(23), rh = get(24);
    const cx = (ls.x + rs.x + lh.x + rh.x) / 4;
    const cy = (ls.y + rs.y + lh.y + rh.y) / 4;
    const bw = Math.abs(rs.x - ls.x);
    const scale = bw > 0.1 ? bw * 1.5 : 0.5;
    bodyGroup.position.set(cx, cy, 0);
    bodyGroup.scale.set(scale, scale, scale);
}

// ── Pose Callback ──
function onPoseResults(results) {
    if (!results || !results.poseLandmarks) {
        if (state.tracking) {
            bodyGroup.visible = false;
            state.tracking = false;
            setStatus('👤 未检测到人体');
        }
        return;
    }
    if (!state.tracking) {
        state.tracking = true;
        setStatus('✅ 已跟踪');
    }
    state.landmarks = results.poseLandmarks;
    // Guard: Three.js might not be ready yet
    if (bodyGroup) {
        bodyGroup.visible = true;
        updateBodyLandmarks(results.poseLandmarks);
    }
}

// ── Animation ──
function animate(time) {
    animFrameId = requestAnimationFrame(animate);
    if (state.tracking && bodyGroup.visible) {
        // Gentle breathing
        if (organGroup.visible) {
            organGroup.children.forEach((child, i) => {
                if (child.type === 'Mesh') child.position.y += Math.sin(time * 0.002 + i) * 0.0005;
            });
        }
    }
    renderer.render(scene, camera);
}

// ── Start Camera ──
async function startCamera() {
    try {
        setStatus('⏳ 请求摄像头权限...');
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        const video = document.getElementById('video');
        video.srcObject = stream;
        await video.play();
        setStatus('⏳ 正在加载AI模型...');

        // Fallback: if MediaPipe Pose CDN is slow, show a timeout warning
        const timeoutId = setTimeout(() => {
            setStatus('⌛ AI模型下载中，首次加载约需30秒...');
        }, 8000);

        const pose = new window.Pose({
            locateFile: (file) => {
                clearTimeout(timeoutId);
                // Try multiple CDNs for Chinese users
                return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
            }
        });

        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        pose.onResults(onPoseResults);

        const cam = new window.Camera(video, {
            onFrame: async () => { try { await pose.send({ image: video }); } catch(e) {} },
            width: 640, height: 480
        });
        await cam.start();
        setStatus('✅ 运行中');
    } catch (err) {
        setStatus('❌ ' + (err.name === 'NotAllowedError' ? '摄像头被拒绝，请在设置中允许' : err.message));
        console.error('Camera error:', err);
    }
}

// ── UI Controls ──
function setupUI() {
    document.querySelectorAll('#controls button').forEach(btn => {
        btn.addEventListener('click', () => {
            const layer = btn.dataset.layer;
            if (layer) {
                if (state.activeLayers.has(layer)) {
                    state.activeLayers.delete(layer);
                    btn.classList.remove('active');
                } else {
                    state.activeLayers.add(layer);
                    btn.classList.add('active');
                }
            } else if (btn.id === 'btn-all') {
                const allOn = state.activeLayers.size === 3;
                document.querySelectorAll('[data-layer]').forEach(b => {
                    if (allOn) {
                        state.activeLayers.delete(b.dataset.layer);
                        b.classList.remove('active');
                    } else {
                        state.activeLayers.add(b.dataset.layer);
                        b.classList.add('active');
                    }
                });
            }
            skeletonGroup.visible = state.activeLayers.has('skeleton');
            muscleGroup.visible = state.activeLayers.has('muscles');
            organGroup.visible = state.activeLayers.has('organs');
        });
    });
}

// ── Start ──
let started = false;
document.getElementById('btn-start').addEventListener('click', async () => {
    if (started) return;
    started = true;
    hide('start-overlay');
    show('header');
    show('status-bar');
    show('controls');
    // iOS顺序至关重要：先启动摄像头，再初始化Three.js
    setStatus('📷 请求摄像头...');
    await startCamera();
    // Three.js在摄像头之后初始化，避免WebGL与摄像头冲突
    initThree();
    setupUI();
    animate();
});
