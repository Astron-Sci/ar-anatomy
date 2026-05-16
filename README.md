# AR 人体解剖 - Body AR Anatomy

基于 WebAR 的人体解剖教学工具，通过手机摄像头识别人体姿态，叠加 3D 骨骼/肌肉/器官模型。

## 使用方法

### 方式一：本地 HTTP 服务运行（推荐）

```bash
# 安装一个简单的 HTTP 服务器（如果还没有）
npm install -g http-server
# 或使用 Python
python3 -m http.server 8080

# 在项目目录下启动
cd ar_anatomy
python3 -m http.server 8080
```

然后打开手机浏览器访问：`http://你的IP:8080`

**必须通过 HTTPS 访问（摄像头需要安全上下文），本地开发可以用：**
- `http://localhost:8080` （localhost 被视为安全）
- 手机访问局域网地址需使用 HTTPS（或使用 ngrok）

### 方式二：使用 ngrok 临时部署

```bash
ngrok http 8080
```
生成一个公网 HTTPS 链接，手机打开即可使用。

### 方式三：部署到 GitHub Pages

1. 将 `ar_anatomy/` 内容推送到 GitHub 仓库
2. 启用 GitHub Pages（Settings → Pages）
3. 通过 GitHub 提供的 HTTPS 链接访问

## 使用说明

1. **站在距手机 1.5-2 米处**，让全身进入画面
2. 点击下方按钮切换显示层次：
   - 🦴 **骨骼** — 人体骨架结构
   - 💪 **肌肉** — 主要肌群分布
   - 🫀 **器官** — 内脏器官位置
   - 👤 **全部** — 全部叠加显示

## 技术栈

- **MediaPipe Pose** — 实时人体姿态检测（33个关键点）
- **Three.js** — 3D 渲染
- **WebRTC** — 摄像头访问

## 注意事项

- 需要 **现代智能手机**（iPhone 8+/Android 8+）
- 推荐使用 **Chrome 或 Safari** 浏览器
- 首次使用需授予摄像头权限
- 检测准确性受光线、衣物颜色、背景复杂度影响
- 模型为示意性解剖结构，**不构成医学诊断依据**

## 后续可扩展

- [ ] 添加真实 CT/MRI 三维重建模型（需加载 .glb/.obj 文件）
- [ ] 器官详细信息弹窗
- [ ] 支持横屏/竖屏自适应
- [ ] 更好的全身跟踪（当前为刚性跟随，可改进为骨骼动画）
- [ ] 保存截图功能
