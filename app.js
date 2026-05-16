// app.js - AR Human Anatomy Viewer (AI Detection + Manual Fallback)
const state = { activeLayers: new Set(['skeleton']), tracking: false, landmarks: null, manualMode: false };
let scene, camera3d, renderer, bodyGroup, skelG, muscG, organG;
let zoomLevel = 1.0, dragSX, dragSY, modelSX, modelSY, isDragging = false;
let useFrontCam = false, curStream = null, poseInst = null, camInst = null;
let manualTimeout = null;

function $(id) { return document.getElementById(id); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function setStatus(m) { $('status-text').textContent = m; }

// ── Three.js ──
function initThree() {
    const c = $('three-container');
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    scene = new THREE.Scene(); scene.background = null;
    camera3d = new THREE.PerspectiveCamera(45, w/h, 0.1, 100);
    camera3d.position.set(0, 0, 3);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    c.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    let d = new THREE.DirectionalLight(0xffffff, 1); d.position.set(1,2,3); scene.add(d);
    d = new THREE.DirectionalLight(0xffffff, 0.3); d.position.set(-1,-1,-2); scene.add(d);
    bodyGroup = new THREE.Group(); scene.add(bodyGroup);
    window.addEventListener('resize', () => {
        camera3d.aspect = ($('three-container').clientWidth||innerWidth) / ($('three-container').clientHeight||innerHeight);
        camera3d.updateProjectionMatrix();
        renderer.setSize($('three-container').clientWidth||innerWidth, $('three-container').clientHeight||innerHeight);
    });
    skelG = buildSkeleton(); muscG = buildMuscles(); organG = buildOrgans();
    bodyGroup.add(skelG); bodyGroup.add(muscG); bodyGroup.add(organG);
    bodyGroup.position.set(0, 0.1, -0.5); bodyGroup.scale.set(0.6, 0.6, 0.6);
    bodyGroup.visible = true;
}

function buildSkeleton() { return buildSkeletonEnhanced(); }
function buildMuscles() { return buildMusclesEnhanced(); }
function buildOrgans() { return buildOrgansEnhanced(); }

// ── Manual drag ──
function enableDrag() {
    state.manualMode = true;
    if (poseInst) { try { camInst && camInst.stop(); } catch(e){} poseInst = null; }
    show('btn-manual');
    setStatus('手动模式 – 拖动骨架对准身体');
    const c = $('three-container');
    c.style.pointerEvents = 'auto'; c.style.touchAction = 'none';
    c.ontouchstart = (e) => { if (e.touches.length===1) { isDragging=true; dragSX=e.touches[0].clientX; dragSY=e.touches[0].clientY; modelSX=bodyGroup.position.x; modelSY=bodyGroup.position.y; } };
    c.ontouchmove = (e) => { if (!isDragging||e.touches.length!==1) return; e.preventDefault();
        bodyGroup.position.x = modelSX + (e.touches[0].clientX-dragSX)*0.005;
        bodyGroup.position.y = modelSY - (e.touches[0].clientY-dragSY)*0.005; };
    c.ontouchend = () => { isDragging = false; };
}

// ── Pose callback ──
function onPoseResults(r) {
    if (state.manualMode) return;
    if (!r||!r.poseLandmarks||r.poseLandmarks.length<33) {
        // Keep model visible at default position when no one detected
        if (state.tracking) { state.tracking = false; setStatus('未检测到人体 - 骨架显示在中央'); }
        return;
    }
    if (!state.tracking) { state.tracking = true; setStatus('已跟踪'); hide('manual-btn'); }
    if (manualTimeout) { clearTimeout(manualTimeout); manualTimeout = null; }
    state.landmarks = r.poseLandmarks;
    if (bodyGroup) { bodyGroup.visible = true;
        // Calculate frustum size at model depth for correct coordinate mapping
        const dist = 3.5; // camera at z=3, model at z=-0.5, distance = 3.5
        const fovRad = 45 * Math.PI / 180;
        const frustumH = 2 * dist * Math.tan(fovRad / 2);
        const frustumW = frustumH * (($('three-container').clientWidth || window.innerWidth) / ($('three-container').clientHeight || window.innerHeight));
        
        const g=(i)=>({
            x: (r.poseLandmarks[i].x - 0.5) * frustumW,
            y: -(r.poseLandmarks[i].y - 0.5) * frustumH,
            z: (r.poseLandmarks[i].z || 0) * 2
        });
        const ls=g(11),rs=g(12),lh=g(23),rh=g(24);
        const cx=(ls.x+rs.x+lh.x+rh.x)/4,cy=(ls.y+rs.y+lh.y+rh.y)/4;
        const bw=Math.abs(rs.x-ls.x);
        const s=bw>0.05 ? Math.min(3, Math.max(0.3, bw * 2.5)) : 0.5;
        bodyGroup.position.set(cx,cy,0); bodyGroup.scale.set(s,s,s);
    }
}

// ── Camera selection ──
let videoDevices = [];

async function listCameras() {
    const d = await navigator.mediaDevices.enumerateDevices();
    videoDevices = d.filter(x => x.kind === 'videoinput');
    console.log('Available cameras:');
    videoDevices.forEach((c, i) => console.log(i + ':', c.label || '(no label)', 'deviceId:', c.deviceId));
    return videoDevices;
}

// ── Start Camera ──
async function startCamera(deviceId) {
    try {
        setStatus('请求摄像头...');
        const constraints = deviceId
            ? { video: { deviceId: { exact: deviceId }, width:{ideal:640}, height:{ideal:480} } }
            : { video: { facingMode: 'environment', width:{ideal:640}, height:{ideal:480} } };
        curStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // After camera starts, list all cameras (iOS now reveals labels)
        const allCams = await listCameras();
        // Populate camera selector
        const sel = $('cam-select');
        sel.innerHTML = '<option value="">选择摄像头...</option>';
        allCams.forEach((c, i) => {
            const opt = document.createElement('option');
            opt.value = c.deviceId;
            opt.textContent = (i+1) + '. ' + (c.label || 'Camera ' + (i+1));
            sel.appendChild(opt);
        });
        sel.classList.remove('hidden');
        console.log('Cameras found:', allCams.length);
        allCams.forEach((c,i) => console.log(i+':', c.label, '->', c.deviceId));
        let video = $('video'); video.srcObject = curStream; await video.play();

        // Start AI detection
        poseInst = new window.Pose({ locateFile: (f) => 'https://unpkg.com/@mediapipe/pose/'+f });
        poseInst.setOptions({ modelComplexity:0, smoothLandmarks:true, minDetectionConfidence:0.3, minTrackingConfidence:0.3 });
        poseInst.onResults(onPoseResults);
        let frameRunning = true;
        camInst = { stop: ()=>{frameRunning=false} };
        async function pf() { if(!frameRunning)return; if(video.readyState>=2) try{await poseInst.send({image:video})}catch(e){} requestAnimationFrame(pf); }
        pf();
        setStatus('请面对摄像头，站1.5-2米处');

        // Auto-switch to manual after 25 seconds of no detection
        manualTimeout = setTimeout(() => {
            if (!state.tracking && !state.manualMode) {
                frameRunning = false;
                enableDrag();
            }
        }, 25000);
    } catch(e) {
        setStatus('摄像头错误: '+(e.name==='NotAllowedError'?'请允许摄像头':e.message));
    }
}

// ── Zoom (Buttons) ──
function updateZoom(v) {
    zoomLevel = Math.max(0.5, Math.min(5.0, v || zoomLevel));
    $('video').style.transform = 'scale('+zoomLevel+')';
    $('three-container').style.transform = 'scale('+zoomLevel+')';
    if (camera3d) { camera3d.zoom=1/zoomLevel; camera3d.updateProjectionMatrix(); }
    $('zoom-label').textContent = zoomLevel.toFixed(1)+'x';
}
function setupZoom() {
    $('zoom-in').addEventListener('click', ()=>updateZoom(+(zoomLevel+0.2).toFixed(1)));
    $('zoom-out').addEventListener('click', ()=>updateZoom(+(zoomLevel-0.2).toFixed(1)));
}

// ── Animation ──
function animate(t) {
    requestAnimationFrame(animate);
    if (state.manualMode && bodyGroup && !isDragging) {
        // subtle float animation for manual mode
        bodyGroup.position.y += Math.sin(t*0.001)*0.0001;
    }
    if (renderer && scene && camera3d) renderer.render(scene, camera3d);
}

// ── UI ──
function setupUI() {
    document.querySelectorAll('#controls button').forEach(b=>{
        b.addEventListener('click',()=>{
            const l=b.dataset.layer;
            if(l){
                if(state.activeLayers.has(l)){state.activeLayers.delete(l);b.classList.remove('active');}
                else{state.activeLayers.add(l);b.classList.add('active');}
            }else{
                const allOn=state.activeLayers.size===3;
                document.querySelectorAll('[data-layer]').forEach(x=>{
                    if(allOn){state.activeLayers.delete(x.dataset.layer);x.classList.remove('active');}
                    else{state.activeLayers.add(x.dataset.layer);x.classList.add('active');}
                });
            }
            skelG.visible=state.activeLayers.has('skeleton');
            muscG.visible=state.activeLayers.has('muscles');
            organG.visible=state.activeLayers.has('organs');
        });
    });
}

// ── Ensure THREE is loaded ──
function ensureThree() {
    return new Promise((resolve, reject) => {
        if (typeof THREE !== 'undefined') return resolve();
        // THREE not loaded yet - add a fallback script
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Three.js failed to load from all CDNs'));
        document.head.appendChild(s);
    });
}

// ── Init ──
$('btn-start').addEventListener('click', async ()=>{
    hide('start-overlay'); show('header'); show('status-bar'); show('controls'); show('camera-control'); show('zoom-control');
    setStatus('启动...');
    await ensureThree();
    await startCamera();
    initThree();
    // Add test indicator - red dot confirms Three.js is rendering
    const dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;bottom:60px;left:50%;transform:translateX(-50%);z-index:20;width:12px;height:12px;border-radius:50%;background:#0f0;';
    dot.id = 'three-dot';
    $('ui-overlay').appendChild(dot);
    setupUI(); setupZoom(); animate();
});

// Camera selector change
$('cam-select').addEventListener('change', async function() {
    if (!this.value) return;
    if (poseInst) { try{camInst&&camInst.stop()}catch(e){} poseInst=null; }
    if (curStream) curStream.getTracks().forEach(t=>t.stop());
    await startCamera(this.value);
});

// Manual mode button
$('btn-manual').addEventListener('click', ()=>{
    if (poseInst) { try{camInst&&camInst.stop()}catch(e){} poseInst=null; }
    if (manualTimeout) { clearTimeout(manualTimeout); manualTimeout=null; }
    enableDrag();
});


// Enhanced builders
// Enhanced 3D Anatomy Builder - Replace buildSkeleton/buildMuscles/buildOrgans in app.js
// More detailed procedural anatomy models

function buildSkeletonEnhanced() {
    const g = new THREE.Group();
    const boneMat = new THREE.MeshPhongMaterial({color:0xf0ead6, emissive:0x888866, emissiveIntensity:0.12, transparent:true, opacity:0.95, shininess:40});
    const jointMat = new THREE.MeshPhongMaterial({color:0xddd5b0, emissive:0x666644, emissiveIntensity:0.08, shininess:30});
    
    function cyl(a, b, r, c, segs) {
        const dx=b[0]-a[0], dy=b[1]-a[1], dz=b[2]-a[2], l=Math.sqrt(dx*dx+dy*dy+dz*dz);
        if(l<0.005)return;
        const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,l,segs||8), c?new THREE.MeshPhongMaterial({color:c, emissive:0x888866, emissiveIntensity:0.12, transparent:true, opacity:0.95}):boneMat);
        m.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx,dy,dz).normalize());
        g.add(m);
    }
    function sphere(p, r, c) {
        const m=new THREE.Mesh(new THREE.SphereGeometry(r||0.04,10,8), c?new THREE.MeshPhongMaterial({color:c}):jointMat);
        m.position.set(p[0],p[1],p[2]); g.add(m);
    }
    
    const L = {
        N:[0,1.12,0], NK:[0,0.9,0], ST:[0,0.75,-0.01], SM:[0,0.55,0.01], SL:[0,0.35,0.02],
        LS:[-0.22,0.85,0], RS:[0.22,0.85,0],
        LE:[-0.32,0.47,0.03], RE:[0.32,0.47,0.03],
        LW:[-0.30,0.22,0.04], RW:[0.30,0.22,0.04],
        LH:[-0.15,0.30,0.02], RH:[0.15,0.30,0.02],
        LK:[-0.13,-0.10,0.04], RK:[0.13,-0.10,0.04],
        LA:[-0.10,-0.45,0], RA:[0.10,-0.45,0],
        LF:[-0.10,-0.55,0.03], RF:[0.10,-0.55,0.03],
    };
    
    // ── SKULL ──
    const skullMat = new THREE.MeshPhongMaterial({color:0xe8dcc8, emissive:0x888866, emissiveIntensity:0.12, transparent:true, opacity:0.95});
    // Cranium - oval shape
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), skullMat);
    cranium.scale.set(1, 1.15, 0.9);
    cranium.position.set(0, 1.07, 0.01);
    g.add(cranium);
    // Jaw
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skullMat);
    jaw.scale.set(0.9, 0.7, 0.85);
    jaw.position.set(0, 0.98, 0.04);
    g.add(jaw);
    // Eye sockets
    const eyeMat = new THREE.MeshPhongMaterial({color:0x333333});
    const eoR = 0.025;
    sphere([-0.04, 1.05, 0.07], eoR, 0x222222);
    sphere([0.04, 1.05, 0.07], eoR, 0x222222);
    // Nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.03, 6), new THREE.MeshPhongMaterial({color:0xe8dcc8}));
    nose.position.set(0, 1.04, 0.08);
    nose.rotation.x = 0.3;
    g.add(nose);
    // Teeth hint
    cyl([-0.03,0.945,0.045], [0.03,0.945,0.045], 0.012, 0xeeeedd);
    
    // ── SPINE ──
    cyl(L.NK, L.ST, 0.028);
    // Vertebrae bumps
    for(let i=0; i<6; i++) {
        const y = 0.88 - i*0.09;
        const r = 0.035 - i*0.002;
        sphere([0, y, -0.01], r, 0xddd5b0);
    }
    cyl(L.ST, L.SM, 0.028);
    cyl(L.SM, L.SL, 0.025);
    
    // ── RIBCAGE ──
    const ribMat = new THREE.MeshPhongMaterial({color:0xd4c9a0, emissive:0x888866, emissiveIntensity:0.1, transparent:true, opacity:0.85});
    for(let side=-1; side<=1; side+=2) {
        // True ribs (7 pairs, connected to sternum)
        for(let i=0; i<7; i++) {
            const yOff = 0.07 * i;
            const depth = 0.14 - 0.012 * i;
            const width = 0.17 - 0.015 * i;
            const pts = [];
            for(let a=0; a<=Math.PI*0.85; a+=0.25) {
                const x = side * width * Math.sin(a);
                const z = -0.02 + depth * (1 - Math.cos(a)) * 0.7;
                pts.push([x, 0.74 - yOff, z]);
            }
            for(let j=0; j<pts.length-1; j++) cyl(pts[j], pts[j+1], 0.014 - i*0.001, 0xd4c9a0);
        }
        // False ribs (5 pairs)
        for(let i=0; i<5; i++) {
            const yOff = 0.07 * (i+7);
            const depth = 0.05 + 0.01 * i;
            const width = 0.12 - 0.015 * i;
            const pts = [];
            for(let a=0; a<=Math.PI*0.7; a+=0.3) {
                const x = side * width * Math.sin(a);
                const z = -0.01 + depth * (1 - Math.cos(a)) * 0.6;
                pts.push([x, 0.30 - i*0.04, z]);
            }
            for(let j=0; j<pts.length-1; j++) cyl(pts[j], pts[j+1], 0.01, 0xd4c9a0);
        }
    }
    // Sternum
    const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.25, 0.015), new THREE.MeshPhongMaterial({color:0xd4c9a0}));
    sternum.position.set(0, 0.62, 0.055);
    g.add(sternum);
    // Xiphoid process
    const xiphoid = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.04, 4), new THREE.MeshPhongMaterial({color:0xd4c9a0}));
    xiphoid.position.set(0, 0.48, 0.055);
    xiphoid.rotation.x = 0.3;
    g.add(xiphoid);
    
    // ── CLAVICLES ──
    cyl(L.NK, L.LS, 0.022, 0xddd5b0);
    cyl(L.NK, L.RS, 0.022, 0xddd5b0);
    // Scapulae (shoulder blades)
    for(let side=-1; side<=1; side+=2) {
        const scap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.08, 6), new THREE.MeshPhongMaterial({color:0xddd5b0}));
        scap.position.set(side*0.18, 0.78, -0.05);
        scap.rotation.z = side*0.3;
        g.add(scap);
    }
    
    // ── PELVIS ──
    const pelvis = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 12), new THREE.MeshPhongMaterial({color:0xddd5b0}));
    pelvis.position.set(0, 0.28, 0.01);
    pelvis.scale.set(1.1, 0.7, 0.8);
    pelvis.rotation.x = Math.PI/2.5;
    g.add(pelvis);
    // Iliac crests
    for(let side=-1; side<=1; side+=2) {
        sphere([side*0.14, 0.30, 0], 0.025, 0xddd5b0);
    }
    
    // ── LIMBS ──
    // Arms: thicker at top, thinner at bottom
    cyl(L.LS, L.LE, 0.035); cyl(L.LE, L.LW, 0.025);
    cyl(L.RS, L.RE, 0.035); cyl(L.RE, L.RW, 0.025);
    // Hand hint - small sphere at wrist
    sphere(L.LW, 0.018); sphere(L.RW, 0.018);
    
    // Legs
    cyl(L.LH, L.LK, 0.04); cyl(L.LK, L.LA, 0.03); cyl(L.LA, L.LF, 0.02);
    cyl(L.RH, L.RK, 0.04); cyl(L.RK, L.RA, 0.03); cyl(L.RA, L.RF, 0.02);
    // Foot
    for(let side=-1; side<=1; side+=2) {
        const ft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.015, 0.06), new THREE.MeshPhongMaterial({color:0xddd5b0}));
        ft.position.set(side*0.10, -0.53, 0.04);
        g.add(ft);
    }
    
    // ── JOINTS ──
    sphere(L.LS,0.035); sphere(L.RS,0.035);
    sphere(L.LE,0.03); sphere(L.RE,0.03);
    sphere(L.LH,0.035); sphere(L.RH,0.035);
    sphere(L.LK,0.03); sphere(L.RK,0.03);
    sphere(L.LA,0.025); sphere(L.RA,0.025);
    
    return g;
}

function buildMusclesEnhanced() {
    const g = new THREE.Group();
    
    // Improved muscle shapes using deformed geometries
    function add(name, pos, scale, color, opacity) {
        let geo;
        switch(name) {
            case 'pectoralis': // Chest
                geo = new THREE.SphereGeometry(0.07, 10, 8);
                break;
            case 'deltoid': // Shoulder
                geo = new THREE.SphereGeometry(0.05, 8, 6);
                break;
            case 'biceps':
                geo = new THREE.CylinderGeometry(0.035, 0.025, 0.15, 8);
                break;
            case 'triceps':
                geo = new THREE.CylinderGeometry(0.03, 0.02, 0.14, 8);
                break;
            case 'forearm':
                geo = new THREE.CylinderGeometry(0.025, 0.02, 0.18, 8);
                break;
            case 'trapezius': // Upper back/neck
                geo = new THREE.CylinderGeometry(0.08, 0.04, 0.1, 6);
                break;
            case 'latissimus': // Lats
                geo = new THREE.CylinderGeometry(0.06, 0.1, 0.15, 6);
                break;
            case 'rectus_abdominis':
                geo = new THREE.BoxGeometry(0.12, 0.18, 0.04);
                break;
            case 'gluteus':
                geo = new THREE.SphereGeometry(0.06, 8, 6);
                break;
            case 'quadriceps':
                geo = new THREE.CylinderGeometry(0.05, 0.035, 0.2, 8);
                break;
            case 'hamstring':
                geo = new THREE.CylinderGeometry(0.04, 0.03, 0.2, 8);
                break;
            case 'calf':
                geo = new THREE.CylinderGeometry(0.04, 0.025, 0.18, 8);
                break;
            default:
                geo = new THREE.SphereGeometry(0.04, 6, 6);
        }
        const mat = new THREE.MeshPhongMaterial({
            color: color || 0xcc6644,
            transparent: true, opacity: opacity || 0.35,
            emissive: color || 0x442211, emissiveIntensity: 0.08
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(pos[0], pos[1], pos[2]);
        if(scale) m.scale.set(scale[0]||1, scale[1]||1, scale[2]||1);
        g.add(m);
    }
    
    // Torso - front
    add('trapezius', [0, 0.80, 0.02], [1, 0.6, 0.5], 0xcc5544);
    add('pectoralis', [-0.08, 0.68, 0.055], [0.8, 0.5, 0.3], 0xcc5544);
    add('pectoralis', [0.08, 0.68, 0.055], [0.8, 0.5, 0.3], 0xcc5544);
    add('rectus_abdominis', [0, 0.52, 0.055], [1, 1, 0.3], 0xbb5533);
    // Torso - back
    add('trapezius', [0, 0.75, -0.07], [1.2, 0.8, 0.4], 0xbb5544);
    add('latissimus', [-0.10, 0.60, -0.07], [0.8, 1, 0.4], 0xbb5544);
    add('latissimus', [0.10, 0.60, -0.07], [0.8, 1, 0.4], 0xbb5544);
    
    // Shoulders
    add('deltoid', [-0.20, 0.72, 0.02], [0.8, 0.7, 0.5], 0xcc6644);
    add('deltoid', [0.20, 0.72, 0.02], [0.8, 0.7, 0.5], 0xcc6644);
    
    // Arms
    add('biceps', [-0.30, 0.58, 0.02], [1, 1, 0.8], 0xcc6644);
    add('biceps', [0.30, 0.58, 0.02], [1, 1, 0.8], 0xcc6644);
    add('triceps', [-0.30, 0.58, -0.04], [1, 1, 0.8], 0xbb5533);
    add('triceps', [0.30, 0.58, -0.04], [1, 1, 0.8], 0xbb5533);
    add('forearm', [-0.30, 0.38, 0.02], [1, 1, 0.7], 0xbb5533);
    add('forearm', [0.30, 0.38, 0.02], [1, 1, 0.7], 0xbb5533);
    
    // Glutes
    add('gluteus', [-0.08, 0.26, -0.06], [1, 0.7, 0.6], 0xcc6644);
    add('gluteus', [0.08, 0.26, -0.06], [1, 0.7, 0.6], 0xcc6644);
    
    // Legs
    add('quadriceps', [-0.11, 0.12, 0.03], [0.8, 1, 0.7], 0xcc6644);
    add('quadriceps', [0.11, 0.12, 0.03], [0.8, 1, 0.7], 0xcc6644);
    add('hamstring', [-0.11, 0.12, -0.04], [0.7, 1, 0.6], 0xbb5533);
    add('hamstring', [0.11, 0.12, -0.04], [0.7, 1, 0.6], 0xbb5533);
    add('calf', [-0.10, -0.20, 0.02], [0.7, 1, 0.6], 0xbb5533);
    add('calf', [0.10, -0.20, 0.02], [0.7, 1, 0.6], 0xbb5533);
    
    return g;
}

function buildOrgansEnhanced() {
    const g = new THREE.Group();
    function add(pos, geo, c, op) {
        const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({color:c, transparent:true, opacity:op||0.55, emissive:c, emissiveIntensity:0.06}));
        m.position.set(pos[0], pos[1], pos[2]); g.add(m);
    }
    // Brain - with hemispheres
    const brain = new THREE.SphereGeometry(0.055, 12, 10);
    add([0.012, 1.04, 0.04], brain, 0xe8b8b0, 0.75);
    add([-0.012, 1.04, 0.04], brain.clone(), 0xd8a8a0, 0.7);
    // Brainstem
    add([0, 0.96, 0.03], new THREE.CylinderGeometry(0.015, 0.01, 0.04, 6), 0xe8b8b0, 0.6);
    
    // Eyes
    add([-0.04, 0.97, 0.07], new THREE.SphereGeometry(0.022, 8, 6), 0xffffff, 0.85);
    add([0.04, 0.97, 0.07], new THREE.SphereGeometry(0.022, 8, 6), 0xffffff, 0.85);
    // Pupils
    add([-0.04, 0.97, 0.085], new THREE.SphereGeometry(0.008, 6, 4), 0x111111, 1);
    add([0.04, 0.97, 0.085], new THREE.SphereGeometry(0.008, 6, 4), 0x111111, 1);
    
    // Trachea
    add([0, 0.80, 0.04], new THREE.CylinderGeometry(0.015, 0.02, 0.10, 6), 0xccbbaa, 0.5);
    
    // Heart - more realistic shape
    const heart = new THREE.SphereGeometry(0.035, 10, 8);
    heart.scale(1.1, 1.2, 0.8);
    const heartMat = new THREE.MeshPhongMaterial({color:0xcc3333, transparent:true, opacity:0.8, emissive:0x661111, emissiveIntensity:0.1});
    const h = new THREE.Mesh(heart, heartMat);
    h.position.set(0.03, 0.66, 0.055);
    g.add(h);
    // Aorta arch
    const aorta = new THREE.TorusGeometry(0.025, 0.008, 6, 8);
    const aortaM = new THREE.Mesh(aorta, new THREE.MeshPhongMaterial({color:0xcc4444, transparent:true, opacity:0.6}));
    aortaM.position.set(0.02, 0.72, 0.05);
    aortaM.scale.set(1, 0.6, 0.5);
    g.add(aortaM);
    
    // Lungs - lobed
    for(let side=-1; side<=1; side+=2) {
        const lung = new THREE.SphereGeometry(0.05, 10, 8);
        lung.scale(0.8, 1.3, 0.5);
        const lm = new THREE.Mesh(lung, new THREE.MeshPhongMaterial({color:0xff9999, transparent:true, opacity:0.35, emissive:0x663333, emissiveIntensity:0.05}));
        lm.position.set(side*0.07, 0.64, 0.045);
        g.add(lm);
        // Lung lobe hint
        const lobe = new THREE.SphereGeometry(0.03, 6, 5);
        lobe.scale(0.7, 0.6, 0.5);
        const lb = new THREE.Mesh(lobe, new THREE.MeshPhongMaterial({color:0xffaaaa, transparent:true, opacity:0.3}));
        lb.position.set(side*0.08, 0.58, 0.04);
        g.add(lb);
    }
    
    // Diaphragm
    const diaph = new THREE.TorusGeometry(0.08, 0.008, 6, 12);
    const dm = new THREE.Mesh(diaph, new THREE.MeshPhongMaterial({color:0xcc9977, transparent:true, opacity:0.3}));
    dm.position.set(0, 0.56, 0.03);
    dm.scale.set(1.2, 0.3, 0.8);
    dm.rotation.x = Math.PI/3;
    g.add(dm);
    
    // Liver - more realistic wedge
    const liver = new THREE.ConeGeometry(0.04, 0.035, 6);
    const lm2 = new THREE.Mesh(liver, new THREE.MeshPhongMaterial({color:0x772211, transparent:true, opacity:0.7, emissive:0x442200, emissiveIntensity:0.08}));
    lm2.position.set(0.03, 0.47, 0.04);
    lm2.rotation.x = 0.3;
    g.add(lm2);
    
    // Gallbladder
    add([0.05, 0.45, 0.045], new THREE.SphereGeometry(0.012, 6, 5), 0x55aa44, 0.7);
    
    // Stomach - J-shaped tube
    const stomach = new THREE.TorusGeometry(0.03, 0.012, 6, 8);
    const sm = new THREE.Mesh(stomach, new THREE.MeshPhongMaterial({color:0x996633, transparent:true, opacity:0.55}));
    sm.position.set(-0.025, 0.42, 0.04);
    sm.scale.set(1.3, 0.8, 0.7);
    g.add(sm);
    
    // Pancreas
    add([0.01, 0.45, 0.01], new THREE.CylinderGeometry(0.01, 0.008, 0.06, 5), 0xccaa77, 0.5);
    
    // Spleen
    add([-0.08, 0.47, 0], new THREE.SphereGeometry(0.018, 6, 5), 0x664466, 0.5);
    
    // Kidneys - bean shaped
    for(let side=-1; side<=1; side+=2) {
        const k = new THREE.SphereGeometry(0.02, 8, 6);
        k.scale(0.8, 1, 0.5);
        const km = new THREE.Mesh(k, new THREE.MeshPhongMaterial({color:0x773322, transparent:true, opacity:0.6}));
        km.position.set(side*0.09, 0.48, -0.02);
        g.add(km);
    }
    
    // Intestines - coiled tubes
    for(let i=0; i<4; i++) {
        const ix = new THREE.TorusGeometry(0.028 + i*0.008, 0.01, 6, 8);
        const im = new THREE.Mesh(ix, new THREE.MeshPhongMaterial({color:0xbb9966, transparent:true, opacity:0.35}));
        im.position.set(0.01, 0.34 - i*0.025, 0.03);
        im.scale.set(1.2, 0.6, 0.8);
        im.rotation.y = i * 0.5;
        g.add(im);
    }
    
    // Bladder
    add([0, 0.27, 0.03], new THREE.SphereGeometry(0.015, 6, 6), 0x88aacc, 0.55);
    
    // Blood vessel hints (simple lines)
    const vesselMat = new THREE.LineBasicMaterial({color:0xcc4444, transparent:true, opacity:0.2});
    for(let i=0; i<5; i++) {
        const pts = [];
        const startY = 0.9 - i*0.1;
        for(let j=0; j<5; j++) {
            pts.push(new THREE.Vector3(0, startY - j*0.02, 0.03 + j*0.005));
        }
        const geo2 = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geo2, vesselMat);
        g.add(line);
    }
    
    return g;
}
