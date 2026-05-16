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

function buildSkeleton() { /* same structure - abbreviated */
    const g = new THREE.Group(), mb = new THREE.MeshPhongMaterial({color:0xf5f5dc,emissive:0x888866,emissiveIntensity:0.15,transparent:true,opacity:0.9});
    const mj = new THREE.MeshPhongMaterial({color:0xddddbb,emissive:0x666644,emissiveIntensity:0.1});
    function bn(a,b,r,c){ r=r||0.025; const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],l=Math.sqrt(dx*dx+dy*dy+dz*dz); if(l<0.01)return;
        const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,l,6),c?new THREE.MeshPhongMaterial({color:c}):mb);
        m.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx,dy,dz).normalize()); g.add(m); }
    function jn(p,r){const m=new THREE.Mesh(new THREE.SphereGeometry(r||0.04,8,8),mj);m.position.set(p[0],p[1],p[2]);g.add(m);}
    const L={nose:[0,1.1,0],neck:[0,0.9,0],ls:[-0.22,0.85,0],rs:[0.22,0.85,0],le:[-0.32,0.45,0.04],re:[0.32,0.45,0.04],lw:[-0.30,0.20,0.04],rw:[0.30,0.20,0.04],st:[0,0.75,-0.02],sm:[0,0.55,0],sl:[0,0.35,0.02],lh:[-0.15,0.30,0.02],rh:[0.15,0.30,0.02],lk:[-0.13,-0.10,0.04],rk:[0.13,-0.10,0.04],la:[-0.10,-0.45,0],ra:[0.10,-0.45,0],lf:[-0.10,-0.55,0.03],rf:[0.10,-0.55,0.03]};
    bn(L.neck,L.st,0.035);bn(L.st,L.sm,0.035);bn(L.sm,L.sl,0.035);
    for(let s=-1;s<=1;s+=2)for(let i=0;i<4;i++){const y=0.08*i,r=0.18-0.02*i,pts=[];for(let a=0;a<=Math.PI;a+=0.3)pts.push([s*r*Math.sin(a),0.73-y,-0.02+r*(1-Math.cos(a))*0.5]);for(let j=0;j<pts.length-1;j++)bn(pts[j],pts[j+1],0.012,0xd4c9a0);}
    bn(L.ls,L.le,0.03);bn(L.le,L.lw,0.025);bn(L.rs,L.re,0.03);bn(L.re,L.rw,0.025);
    bn(L.lh,L.lk,0.04);bn(L.lk,L.la,0.03);bn(L.la,L.lf,0.02);bn(L.rh,L.rk,0.04);bn(L.rk,L.ra,0.03);bn(L.ra,L.rf,0.02);
    bn(L.nose,L.neck,0.04);bn(L.neck,L.ls,0.02);bn(L.neck,L.rs,0.02);bn(L.lh,L.rh,0.035);bn(L.lh,L.sl,0.025);bn(L.rh,L.sl,0.025);
    jn(L.nose,0.03);jn(L.neck,0.035);jn(L.ls,0.04);jn(L.rs,0.04);jn(L.le,0.035);jn(L.re,0.035);jn(L.lw,0.03);jn(L.rw,0.03);
    jn(L.lh,0.04);jn(L.rh,0.04);jn(L.lk,0.035);jn(L.rk,0.035);jn(L.la,0.03);jn(L.ra,0.03); return g; }

function buildMuscles() {
    const g=new THREE.Group(),mat=new THREE.MeshPhongMaterial({color:0xcc6644,transparent:true,opacity:0.4,emissive:0x442211,emissiveIntensity:0.1});
    function ad(n,p,s,c){const m=c?new THREE.MeshPhongMaterial({color:c,transparent:true,opacity:0.4}):mat;
        const geo={'chest':new THREE.SphereGeometry(0.16,12,8),'bicep':new THREE.CylinderGeometry(0.05,0.04,0.2,8),
            'thigh':new THREE.CylinderGeometry(0.07,0.05,0.3,8),'forearm':new THREE.CylinderGeometry(0.035,0.025,0.2,8),
            'abs':new THREE.BoxGeometry(0.15,0.2,0.06),'shoulder':new THREE.SphereGeometry(0.06,8,6),
            'glute':new THREE.SphereGeometry(0.08,8,6),'back':new THREE.CylinderGeometry(0.15,0.12,0.25,8)}[n]||new THREE.SphereGeometry(0.05,8,6);
        const mesh=new THREE.Mesh(geo,m);mesh.position.set(p[0],p[1],p[2]);if(s)mesh.scale.set(s[0]||1,s[1]||1,s[2]||1);g.add(mesh);}
    ad('chest',[0,0.70,0.06],[1,0.7,0.4]);ad('abs',[0,0.52,0.07],[1,0.8,0.3]);ad('back',[0,0.65,-0.08],[0.8,1,0.4]);
    ad('shoulder',[-0.20,0.72,0.02],[0.8,0.8,0.6]);ad('shoulder',[0.20,0.72,0.02],[0.8,0.8,0.6]);
    ad('glute',[-0.08,0.28,-0.07],[1,0.6,0.5]);ad('glute',[0.08,0.28,-0.07],[1,0.6,0.5]);
    ad('bicep',[-0.30,0.62,0],null,0xcc6644);ad('bicep',[0.30,0.62,0],null,0xcc6644);
    ad('forearm',[-0.30,0.42,0],null,0xbb5533);ad('forearm',[0.30,0.42,0],null,0xbb5533);
    ad('thigh',[-0.12,0.15,0],null,0xcc6644);ad('thigh',[0.12,0.15,0],null,0xcc6644); return g; }

function buildOrgans() {
    const g=new THREE.Group();
    function ad(p,geo,c,op){const m=new THREE.Mesh(geo,new THREE.MeshPhongMaterial({color:c,transparent:true,opacity:op||0.6,emissive:c,emissiveIntensity:0.05}));m.position.set(p[0],p[1],p[2]);g.add(m);}
    ad([0,1.02,0.04],new THREE.SphereGeometry(0.065,12,10),0xe8b8b0,0.7);
    ad([-0.04,0.97,0.07],new THREE.SphereGeometry(0.025,8,6),0xffffff,0.8);ad([0.04,0.97,0.07],new THREE.SphereGeometry(0.025,8,6),0xffffff,0.8);
    const hg=new THREE.SphereGeometry(0.04,10,8);hg.scale(1,1.1,0.8);ad([0.04,0.68,0.06],hg,0xcc3333,0.75);
    const lg=new THREE.SphereGeometry(0.065,10,8);lg.scale(0.7,1.1,0.6);ad([-0.08,0.66,0.04],lg,0xff9999,0.4);ad([0.08,0.66,0.04],lg,0xff9999,0.4);
    ad([0.04,0.48,0.04],new THREE.ConeGeometry(0.05,0.04,6),0x884422,0.6);
    const sg=new THREE.SphereGeometry(0.035,8,6);sg.scale(1,1.2,0.8);ad([-0.035,0.44,0.04],sg,0x996633,0.5);
    const kg=new THREE.SphereGeometry(0.025,8,6);kg.scale(0.7,1,0.5);ad([-0.10,0.49,-0.02],kg,0x884422,0.5);ad([0.10,0.49,-0.02],kg,0x884422,0.5);
    ad([0,0.33,0.04],new THREE.TorusGeometry(0.04,0.018,6,10),0xccaa77,0.4);ad([0,0.28,0.03],new THREE.SphereGeometry(0.02,6,6),0x88aacc,0.5); return g; }

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
        const g=(i)=>({x:r.poseLandmarks[i].x-0.5,y:-(r.poseLandmarks[i].y-0.5)*1.8,z:(r.poseLandmarks[i].z||0)*3});
        const ls=g(11),rs=g(12),lh=g(23),rh=g(24);
        const cx=(ls.x+rs.x+lh.x+rh.x)/4,cy=(ls.y+rs.y+lh.y+rh.y)/4,bw=Math.abs(rs.x-ls.x),s=bw>0.1?bw*1.5:0.5;
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

// ── Zoom ──
function updateZoom(v) {
    zoomLevel = v||parseFloat($('zoom-slider').value);
    $('video').style.transform = 'scale('+zoomLevel+')';
    $('three-container').style.transform = 'scale('+zoomLevel+')';
    if (camera3d) { camera3d.zoom=1/zoomLevel; camera3d.updateProjectionMatrix(); }
    $('zoom-label').textContent = zoomLevel.toFixed(1)+'x';
}
function setupZoom() { $('zoom-slider').addEventListener('input', function(){updateZoom();}); }

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

// ── Init ──
$('btn-start').addEventListener('click', async ()=>{
    hide('start-overlay'); show('header'); show('status-bar'); show('controls'); show('camera-control'); show('zoom-control');
    setStatus('启动...'); await startCamera(); initThree(); setupUI(); setupZoom(); animate();
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
