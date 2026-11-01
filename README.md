<h1>FitPose AI – Real-Time Posture Correction System for Home Fitness Using Human Pose Estimation</h1>
<br>An AI-powered mobile fitness application that helps users improve their exercise posture through real-time human pose estimation, movement analysis, and personalised feedback.
<p align="center"><img width="291" height="629" alt="image" src="https://github.com/user-attachments/assets/4b93dd38-aa52-48f2-a55f-396de6856670" />
<img width="293" height="634" alt="image" src="https://github.com/user-attachments/assets/36452851-c9ae-4b87-9145-fd32a72c7288" /></p>

<h2>📌 About the Project</h2>
FitPose AI is a mobile application developed as a Final Year Project (FYP) at Universiti Tunku Abdul Rahman (UTAR). It aims to make home fitness safer and more accessible by helping users monitor their exercise posture without requiring a personal trainer.
The application integrates a pretrained MoveNet Lightning human pose estimation model to detect body keypoints and analyse users' movements in real time. By processing the detected keypoints, the application calculates joint angles, evaluates exercise movements, tracks repetitions, and provides visual and audio feedback to help users maintain proper exercise form.
Additionally, FitPose AI incorporates an AI-powered coaching assistant and workout analytics to support users in monitoring their fitness progress.

<h2>✨ Key Features</h2>
1. Real-Time Human Pose Estimation
Integrates the pretrained MoveNet Lightning model for human pose detection.
Detects 17 body keypoints to identify important body positions.
Performs on-device pose estimation for real-time movement analysis.

2. Exercise Posture Analysis
Calculates joint angles using detected body keypoints.
Analyses exercise movements using predefined posture rules.
Uses a finite-state machine (FSM) to identify exercise stages and validate movements.
Provides feedback to help users improve their exercise form.

3. Exercise Repetition Counting
Automatically detects and counts exercise repetitions.
Tracks exercise movements based on changes in body positions and joint angles.
Supports five bodyweight exercises:
<br>-Squats
<br>-Push-ups
<br>-Lunges
<br>-Planks
<br>-Sit-ups

4. Real-Time Feedback
Provides visual feedback to guide users during exercises.
Uses audio feedback to notify users about posture and movement corrections.
Helps users identify incorrect exercise movements.

5. AI-Powered Coaching Assistant
Integrates the OpenAI API to provide an AI-powered fitness coaching experience.
Supports interactive fitness-related guidance and assistance.

6. Workout Tracking and Analytics
Uses Firebase to store and manage workout-related information.
Records exercise performance and workout history.
Supports workout progress monitoring and analytics.

<h2>🛠️ Technologies Used</h2>

Mobile Developmen --> React Native
<br>Programming Languages --> TypeScript, JavaScript
<br>Human Pose Estimation --> MoveNet Lightning
<br>Machine Learning Runtime --> TensorFlow Lite
<br>Backend / Database --> Firebase
<br>AI Integration --> OpenAI API
<br>Version Control --> Git, GitHub

<h2>🏗️ System Architecture</h2>

FitPose AI follows a workflow that combines on-device human pose estimation with application-level movement analysis.

        Mobile Phone Camera
                 |
                 v
       Camera Frame Processing
                 |
                 v
      TensorFlow Lite Runtime
                 |
                 v
       MoveNet Lightning Model
                 |
                 v
        Body Keypoint Detection
                 |
                 v
        Joint Angle Calculation
                 |
                 v
       Exercise Movement Analysis
                 |
                 v
       Finite-State Machine (FSM)
                 |
          +------+------+
          |             |
          v             v
    Repetition      Posture/Form
     Counting        Validation
          |             |
          +------+------+
                 |
                 v
       Real-Time User Feedback
          (Visual and Audio)
                 |
                 v
        Workout Data / Analytics
                 |
                 v
              Firebase

The application also integrates the OpenAI API for its AI-powered coaching assistant.

<h2>📱 Application Screenshots</h2>

<h3>Home Screen</h3>
<img width="620" height="1280" alt="image" src="https://github.com/user-attachments/assets/42330dfb-99fe-4b59-812d-b26366010678" />

<h3>Exercise Selection</h3>
<img width="606" height="1280" alt="image" src="https://github.com/user-attachments/assets/f4a9381f-be59-4ccb-8440-bac020cd6e5e" />

<h3>Real-Time Exercise Monitoring</h3>
<img width="590" height="1280" alt="image" src="https://github.com/user-attachments/assets/18b9a52d-8ca2-4c57-9475-b03f91509290" />

<h3>Exercise Feedback</h3>
<img width="588" height="1280" alt="image" src="https://github.com/user-attachments/assets/2dc70e72-77d9-444a-88a9-f3cc90d102da" />

<h3>Workout History / Analytics</h3>
<img width="600" height="1280" alt="image" src="https://github.com/user-attachments/assets/c62519bf-3777-49ce-85e7-fa787bb23704" />
<img width="608" height="1280" alt="image" src="https://github.com/user-attachments/assets/cc6c44b8-2014-409c-97c9-a9a4de15c6f4" />

<h3>AI Coaching Assistant</h3>
<img width="606" height="1280" alt="image" src="https://github.com/user-attachments/assets/fdeed1fd-0efb-47e7-b75f-f2a08ceca8d5" />


<h2>⚙️ Installation and Setup</h2>
Follow these instructions to set up the FitPose AI project locally.

Prerequisites
<br>Ensure that the following tools are installed:
<br>-Node.js and npm
<br>-React Native development environment
<br>-Android Studio and Android SDK
<br>-Git
<br>-A physical Android device or Android emulator

1. Clone the Repository
<br>git clone https://github.com/YOUR-USERNAME/FitPose-AI.git

2. Navigate to the Project Directory
<br>cd FitPose-AI

3. Install Dependencies
<br>vnpm install

4. Configure Environment Variables and Services
<br>Configure the required Firebase and OpenAI API credentials according to the project's configuration.
<br>Important: Do not commit API keys, passwords, Firebase private credentials, or other sensitive configuration files to GitHub.

5. Run the Application
<br>For a React Native project using the appropriate Android build configuration:
<br>npx react-native run-android

Refer to the project's actual configuration and dependencies if additional setup steps are required.

<h2>🧠 My Contributions</h2>
As the developer of FitPose AI, my work focused on mobile application development, machine-learning model integration, and the implementation of exercise analysis functionalities.
<br><br>Key contributions include:
<br>-Developed the mobile application using React Native and TypeScript.
<br>-Integrated the pretrained MoveNet Lightning model for real-time human pose estimation.
<br>-Implemented joint-angle calculations using detected body keypoints.
<br>-Developed finite-state machine logic for exercise-stage detection, repetition counting, and posture validation.
<br>-Implemented visual and audio feedback mechanisms for exercise guidance.
<br>-Integrated Firebase for workout data management and progress tracking.
<br>-Integrated the OpenAI API for the AI-powered coaching assistant.
<br>Note: The project uses a pretrained pose estimation model. The machine-learning model was integrated into the application rather than trained from scratch.

<h2>🏆 Project Recognition</h2>
4th Prize – FYP Competition 2026

Recognised at the Final Year Project Competition 2026 for the development of FitPose AI, demonstrating the practical application of human pose estimation and AI integration in mobile fitness technology.

<h2>🎯 Project Objectives</h2>
-To develop an AI-assisted mobile application for home fitness.
<br>-To integrate human pose estimation for real-time exercise monitoring.
<br>-To analyse body movements and provide exercise posture feedback.
<br>-To implement automated repetition counting and exercise form validation.
<br>-To support users in tracking their workout performance and fitness progress.

<h2>👨‍💻 Author</h2>
Ng Wen See

Bachelor of Computer Science (Honours)
<br>Universiti Tunku Abdul Rahman (UTAR)

GitHub: https://github.com/wsee2
<br>LinkedIn: https://www.linkedin.com/in/ng-wen-see-080737355

<h2>📄 License</h2>
This project was developed for academic purposes as part of a Final Year Project at Universiti Tunku Abdul Rahman (UTAR).
<br>Unless a licence is added to this repository, all rights are reserved by the respective copyright holders. Please contact the author before reusing or distributing the project.
