# FitPose AI – Real-Time Posture Correction System for Home Fitness Using Human Pose Estimation

An AI-powered Android app that helps users improve exercise posture through on-device human pose estimation, movement analysis, and real-time visual and audio feedback.

<p align="center">
  <img width="220" alt="FitPose AI workout screen" src="https://github.com/user-attachments/assets/4b93dd38-aa52-48f2-a55f-396de6856670" />
  <img width="220" alt="FitPose AI feedback screen" src="https://github.com/user-attachments/assets/36452851-c9ae-4b87-9145-fd32a72c7288" />
</p>

🏆 **4th Prize – FYP Competition 2026**

## 📌 About the Project

FitPose AI is a mobile application developed as a Final Year Project (FYP) at Universiti Tunku Abdul Rahman (UTAR). It makes home fitness safer by helping users check their exercise form without a personal trainer.

The app runs a pretrained **MoveNet Lightning** pose-estimation model (TensorFlow Lite) fully on the device to detect 17 body keypoints. From those keypoints it calculates joint angles, tracks exercise phases with finite-state machines, counts repetitions, and gives real-time visual and audio feedback. An OpenAI-powered coach and Firebase-backed analytics support progress tracking.

## ✨ Key Features

**Real-time pose estimation**
- On-device MoveNet Lightning (INT8, TensorFlow Lite), 17 keypoints
- No camera frames leave the device

**Exercise analysis**
- Joint-angle calculation from keypoints with 5-frame moving-average smoothing
- Finite-state machine per exercise for phase detection, rep counting, and form validation
- Supports **squat, push-up, lunge, plank, and sit-up**
- Portrait and landscape camera orientation support

**Real-time feedback**
- Colour-coded skeleton overlay (green / orange / red / cyan)
- Audio (text-to-speech) correction cues
- Animated coach avatar

**AI coach and analytics**
- OpenAI GPT-5-mini coaching assistant, used between sets and sessions (not in the real-time loop)
- Firebase Realtime Database for workout history and progress analytics

## 🛠️ Technologies Used

| Area | Technology |
|---|---|
| Mobile app | React Native, Expo (Development Build), TypeScript |
| Camera / frame processing | react-native-vision-camera, react-native-worklets-core, vision-camera-resize-plugin |
| Pose estimation | MoveNet Lightning (INT8) |
| ML runtime | TensorFlow Lite via react-native-fast-tflite |
| Backend / database | Firebase (Realtime Database, Authentication) |
| AI coach | OpenAI API (GPT-5-mini) |
| Version control | Git, GitHub |

## 🏗️ System Architecture

```text
Phone camera
     │
VisionCamera frame processor (worklet)
     │  resize to 192×192
TensorFlow Lite runtime ── MoveNet Lightning
     │
17 body keypoints
     │
Joint-angle calculation + smoothing
     │
Finite-state machine (per exercise)
     ├── Repetition counting
     └── Posture / form validation
     │
Real-time feedback (visual + audio)
     │
Workout data ── Firebase
                  │
        OpenAI coach (non-real-time)
```

Real-time correction runs entirely on-device. The OpenAI coach is deliberately kept outside the real-time loop because network latency (about 0.5–2 s) is too high for live correction.

## 📱 Application Screenshots

| Home | Exercise Selection | Real-Time Monitoring |
|---|---|---|
| <img width="200" alt="Home screen" src="https://github.com/user-attachments/assets/42330dfb-99fe-4b59-812d-b26366010678" /> | <img width="200" alt="Exercise selection" src="https://github.com/user-attachments/assets/f4a9381f-be59-4ccb-8440-bac020cd6e5e" /> | <img width="200" alt="Real-time exercise monitoring" src="https://github.com/user-attachments/assets/18b9a52d-8ca2-4c57-9475-b03f91509290" /> |

| Exercise Feedback | Workout History | Analytics | AI Coach |
|---|---|---|---|
| <img width="170" alt="Exercise feedback" src="https://github.com/user-attachments/assets/2dc70e72-77d9-444a-88a9-f3cc90d102da" /> | <img width="170" alt="Workout history" src="https://github.com/user-attachments/assets/c62519bf-3777-49ce-85e7-fa787bb23704" /> | <img width="170" alt="Analytics" src="https://github.com/user-attachments/assets/cc6c44b8-2014-409c-97c9-a9a4de15c6f4" /> | <img width="170" alt="AI coach" src="https://github.com/user-attachments/assets/fdeed1fd-0efb-47e7-b75f-f2a08ceca8d5" /> |

## 📊 Evaluation Results

**Rep-counting accuracy** (10 repetitions per combination, counted reps vs. actual reps):

| Exercise | Slow | Normal | Fast |
|---|---|---|---|
| Squat | 100% | 100% | 100% |
| Push-up | 100% | 100% | 90% |
| Lunge | 100% | 100% | 90% |
| Sit-up | 100% | 100% | 100% |

- **98.3% mean accuracy** across 12 exercise-speed combinations; no over-counting at any speed
- **Plank hold-time accuracy: 93.3%** at 15 s, 30 s, and 45 s (a consistent offset of about 1 s per 15 s)

**On-device performance:**

| Device | Chipset | NPU | Approx. FPS |
|---|---|---|---|
| Samsung Galaxy S8 | Snapdragon 835 | No | ~10 |
| Poco F5 | Snapdragon 7+ Gen 2 | Yes | ~20–25 |

Real-time performance depends on NPU availability; CPU-only devices run, but the skeleton overlay lags.

### Known limitations

- Accuracy was measured with a single tester; broader multi-user testing is future work.
- Reference measurements for squat, lunge, push-up, and sit-up are captured per session, so switching to a person of a very different height mid-session can cause missed counts. Re-calibrate when the user changes.
- Skeleton rendering is not interpolated between detections, so fast movement can look choppy even when counting stays accurate.

## ⚙️ Installation and Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS) and npm
- [Git](https://git-scm.com/)
- [Android Studio](https://developer.android.com/studio) with:
  - Android SDK Platform 36
  - NDK `27.1.12297006`
  - CMake `3.22.1`
  - JDK 17
- A **physical Android device** with USB debugging enabled (recommended)

> **Expo Go is not supported.** The app uses native modules (VisionCamera, TensorFlow Lite, Worklets), so it must be run as an Expo Development Build.

### 1. Clone the repository

> **Windows users:** clone into a short path such as `C:\dev\`. Long paths (for example inside OneDrive) cause CMake/ninja build failures.

```bash
git clone https://github.com/wsee2/<repo-name>.git
cd <repo-name>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

**OpenAI (AI coach):** copy the example file and add your own key.

```bash
# macOS / Linux / PowerShell
cp .env.example .env.local
```

`.env.local`:

```dotenv
EXPO_PUBLIC_OPENAI_API_KEY=your-openai-key
```

**Firebase:** the app reads its config from `src/firebaseConfig.ts`. Create your own Firebase project with Realtime Database and Email/Password Authentication enabled, then replace the config values with your project's (Firebase console → Project settings → Your apps → Web app).

Restrict each user to their own data with these Realtime Database rules (adjust `users` to match your data paths):

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

> **Security note:** `EXPO_PUBLIC_*` variables are bundled into the app and can be extracted from a built APK. This setup is for development and demo only. For production, route OpenAI requests through a backend (for example Firebase Cloud Functions) so the key never ships in the client. Never commit API keys.

### 4. Generate the native Android project

```bash
npx expo prebuild --clean
```

### 5. Connect your phone and run

```bash
adb devices
npx expo run:android
```

The first build takes several minutes; later builds are faster.

### Troubleshooting

| Problem | Fix |
|---|---|
| `ninja: error: mkdir ... No such file or directory` | Project path too long. Move it to `C:\dev\` |
| `could not read ok from ADB Server` | `taskkill /F /IM adb.exe`, then `adb start-server` |
| Camera preview is black | Grant camera permission in the phone's app settings |

## 🧠 My Contributions

- Built the mobile app with React Native, Expo, and TypeScript
- Migrated the pose pipeline from a MediaPipe/WebView prototype to native on-device inference (VisionCamera + TensorFlow Lite + MoveNet Lightning)
- Implemented joint-angle calculation, smoothing, and per-exercise finite-state machines for phase detection, rep counting, and form validation
- Implemented visual and audio feedback
- Integrated Firebase for workout data and analytics, and the OpenAI API for the coaching assistant
- Designed and ran the accuracy and multi-device performance evaluation

> The project uses a pretrained pose-estimation model (MoveNet Lightning). The model was integrated into the app, not trained from scratch.

## 🎯 Project Objectives

1. Analyse exercise posture in real time and determine correctness of form
2. Provide immediate visual and audio feedback for posture correction
3. Recognise exercise phases and count completed repetitions accurately

## 👨‍💻 Author

**Ng Wen See**, Bachelor of Computer Science (Honours), Universiti Tunku Abdul Rahman (UTAR)

[GitHub](https://github.com/wsee2) · [LinkedIn](https://www.linkedin.com/in/ng-wen-see-080737355)

## 📄 License

Released under the [MIT License](LICENSE).
