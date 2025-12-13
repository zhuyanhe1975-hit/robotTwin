import React, { useState, useEffect, useRef } from 'react';
import Visualizer3D from './components/Visualizer3D';
import ControlPanel from './components/ControlPanel';
import { RobotModel, AICommandResult, TrajectoryPoint, JointConfig, LinkConfig } from './types';
import { ROBOT_CATALOG } from './constants';
import { parseURDF } from './utils/urdfParser';
import { generateControlCode } from './services/geminiService';
import { generateTrajectory } from './utils/kinematics';
import { Terminal } from 'lucide-react';

const App: React.FC = () => {
  const [robotModel, setRobotModel] = useState<RobotModel | null>(null);
  const [jointValues, setJointValues] = useState<Record<string, number>>({});
  
  // URDF Loader State
  const [urdfUrl, setUrdfUrl] = useState<string | null>(null);
  const [urdfContent, setUrdfContent] = useState<string | null>(null);
  const [packages, setPackages] = useState<Record<string, string>>({});
  const [blobMap, setBlobMap] = useState<Record<string, string>>({});

  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState("");
  
  // AI Command State
  const [generatedCode, setGeneratedCode] = useState("");
  const [targetTrajectory, setTargetTrajectory] = useState<TrajectoryPoint[] | null>(null);
  
  // Animation / Playback State
  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [playbackProgress, setPlaybackProgress] = useState(0); 
  const animationRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const activeTrajectoryRef = useRef<TrajectoryPoint[]>([]);
  const [showTrace, setShowTrace] = useState(true);
  const [traceVersion, setTraceVersion] = useState(0); // For resetting trace
  
  // System Logs
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const addSystemLog = (msg: string) => {
      const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      // Append to the end (newest at bottom), keep last 200
      setSystemLogs(prev => [...prev, `[${time}] ${msg}`].slice(-200));
  };

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (logContainerRef.current) {
        // Use requestAnimationFrame to ensure DOM update is rendered before scrolling
        requestAnimationFrame(() => {
            if (logContainerRef.current) {
               logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
            }
        });
    }
  }, [systemLogs]);

  useEffect(() => {
    handleLoadPreset('abb_irb2400');
  }, []);

  const loadRobotConfig = (url: string, pkgs: Record<string, string>, rawContent: string, blobs?: Record<string, string>) => {
    addSystemLog(`Loading configuration: ${url}`);
    const trimmedContent = rawContent.trim();
    
    setUrdfUrl(url);
    setUrdfContent(trimmedContent);
    setPackages({}); 
    if (blobs) setBlobMap(blobs);

    try {
      const parsedModel = parseURDF(trimmedContent);
      setRobotModel(parsedModel);
      
      const initialJoints: Record<string, number> = {};
      Object.values(parsedModel.joints).forEach(j => {
        initialJoints[j.name] = 0;
      });
      setJointValues(initialJoints);
      
      setAnalysisResult("");
      setGeneratedCode("");
      setTargetTrajectory(null);
      resetPlayback();
      addSystemLog(`URDF Parsed Successfully. Robot: ${parsedModel.name}`);
    } catch (e: any) {
      console.error("Failed to parse URDF metadata", e);
      addSystemLog(`Error parsing metadata: ${e.message}`);
    }
  };

  const handleFilesUpload = (files: FileList) => {
    addSystemLog(`Processing ${files.length} uploaded files...`);
    const newBlobMap: Record<string, string> = {};
    let urdfFile: File | null = null;

    Array.from(files).forEach(file => {
      const blobUrl = URL.createObjectURL(file);
      newBlobMap[file.name] = blobUrl;
      newBlobMap[file.name.toLowerCase()] = blobUrl;
      if (file.name.endsWith('.urdf') || file.name.endsWith('.xml')) {
        urdfFile = file;
      }
    });

    if (urdfFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const trimmed = content.trim();
          if (!trimmed.includes('<robot')) {
             alert("文件无效: 缺少 <robot> 标签");
             addSystemLog(`Error: Invalid URDF file uploaded.`);
             return;
          }
          loadRobotConfig(newBlobMap[(urdfFile as File).name], {}, trimmed, newBlobMap);
        }
      };
      reader.readAsText(urdfFile as Blob);
    } else {
      alert("未找到 .urdf 文件");
      addSystemLog(`Error: No .urdf file found in selection.`);
    }
  };

  const handleLoadPreset = async (catalogId: string) => {
    const entry = ROBOT_CATALOG.find(r => r.id === catalogId);
    if (!entry) return;

    try {
        addSystemLog(`Fetching preset: ${entry.name} (${entry.urdfPath})`);
        const response = await fetch(entry.urdfPath);
        if (!response.ok) throw new Error(`Failed to fetch URDF from ${entry.urdfPath}`);
        const urdfText = await response.text();
        loadRobotConfig(entry.urdfPath, {}, urdfText.trim());
    } catch (error: any) {
        console.error("Error loading preset:", error);
        addSystemLog(`Failed to load preset: ${error.message}`);
    }
  };

  const handleJointChange = (name: string, value: number) => {
    if (playbackState === 'playing') pausePlayback();
    setJointValues(prev => ({ ...prev, [name]: value }));
  };

  // Local Parameter ID (deterministic, fast)
  const handleAnalyze = () => {
    if (!robotModel) return;
    addSystemLog(`Performing local parameter identification...`);
    
    // Explicit types to avoid 'unknown' type errors with Object.values
    const activeJoints = (Object.values(robotModel.joints) as JointConfig[]).filter(j => j.type !== 'fixed');
    const linksWithDynamics = (Object.values(robotModel.links) as LinkConfig[]).filter(l => l.dynamics);

    let report = `**基本信息**\n`;
    report += `- 名称: ${robotModel.name}\n`;
    report += `- 自由度: ${activeJoints.length}\n`;
    report += `- 连杆数: ${Object.keys(robotModel.links).length}\n\n`;

    report += `**运动学参数 (URDF Data)**\n`;
    report += `| 关节 | 类型 | 下限 | 上限 | 原点 (XYZ) |\n`;
    report += `|---|---|---|---|---|\n`;
    activeJoints.forEach(j => {
        report += `| ${j.name} | ${j.type} | ${j.limit?.lower.toFixed(2)} | ${j.limit?.upper.toFixed(2)} | ${j.origin.xyz.x},${j.origin.xyz.y},${j.origin.xyz.z} |\n`;
    });

    report += `\n**动力学参数 (Parsed)**\n`;
    if (linksWithDynamics.length > 0) {
        report += `| 连杆 | 质量(kg) | 惯量(Ixx, Iyy, Izz) |\n`;
        report += `|---|---|---|\n`;
        linksWithDynamics.forEach(l => {
            const d = l.dynamics!;
            report += `| ${l.name} | ${d.mass.toFixed(3)} | ${d.inertia.ixx.toFixed(3)}, ${d.inertia.iyy.toFixed(3)}, ${d.inertia.izz.toFixed(3)} |\n`;
        });
    } else {
        report += `(未在URDF中发现Dynamics标签)\n`;
    }

    setAnalysisResult(report);
    addSystemLog(`Parameter ID complete.`);
  };

  const handleGenerateCode = async (task: string) => {
    if (!robotModel) return;
    setIsProcessing(true);
    addSystemLog(`Planner: Analyzing task "${task}"...`);
    resetPlayback();

    // 1. Ask AI for Cartesian Waypoints
    const result = await generateControlCode(robotModel, jointValues, task);
    setGeneratedCode(result.code);
    
    if (result.waypoints && result.waypoints.length > 0) {
        addSystemLog(`Planner: Received ${result.waypoints.length} Cartesian Waypoints. Solving Kinematics...`);
        
        // 2. Solve Inverse Kinematics locally to generate Joint Trajectory
        try {
            const trajectory = generateTrajectory(robotModel, jointValues, result.waypoints);
            
            // Post-process time distribution
            // Assign ~0.1s per step for smoothing
            const finalTrajectory = trajectory.map((pt, idx) => ({
                ...pt,
                time: idx * 0.05 // 50ms per step
            }));

            setTargetTrajectory(finalTrajectory);
            addSystemLog(`Success: Generated ${finalTrajectory.length} joint states via internal IK Solver.`);
        } catch (e: any) {
            addSystemLog(`Kinematics Error: ${e.message}`);
            setTargetTrajectory(null);
        }
    } else {
        setTargetTrajectory(null);
        addSystemLog(`Planner: No path generated from AI.`);
    }
    
    setIsProcessing(false);
  };
  
  // --- Animation Engine ---

  const resetPlayback = () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setPlaybackState('idle');
      setPlaybackProgress(0);
      playbackStartTimeRef.current = 0;
      activeTrajectoryRef.current = [];
  };

  const pausePlayback = () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setPlaybackState('paused');
      addSystemLog(`Simulation Paused.`);
  };

  const stopPlayback = () => {
      resetPlayback();
      addSystemLog(`Simulation Stopped.`);
  };

  const startPlayback = () => {
      if (!targetTrajectory || targetTrajectory.length === 0) return;

      let sequenceToPlay = activeTrajectoryRef.current;
      
      // If idle or empty sequence, generate new run
      if (playbackState === 'idle' || sequenceToPlay.length === 0) {
          // Trigger Trace Clear on new run
          setTraceVersion(v => v + 1);

          // Generate Bridge from current pos to first point
          const firstTarget = targetTrajectory[0];
          const transitionTime = 1.0; 
          const bridgeSteps = 20;
          const bridge: TrajectoryPoint[] = [];

          for(let i=0; i<=bridgeSteps; i++) {
             const t = i/bridgeSteps;
             const point: TrajectoryPoint = { time: t * transitionTime };
             // Use current jointValues as start
             Object.keys(firstTarget).forEach(key => {
                 if (key === 'time') return;
                 const startVal = jointValues[key] || 0;
                 const endVal = firstTarget[key] || 0;
                 const ease = 1 - Math.pow(1 - t, 3);
                 point[key] = startVal + (endVal - startVal) * ease;
             });
             bridge.push(point);
          }

          const adjustedTarget = targetTrajectory.map(pt => ({
              ...pt,
              time: (pt.time || 0) + transitionTime
          }));

          sequenceToPlay = [...bridge, ...adjustedTarget];
          activeTrajectoryRef.current = sequenceToPlay;
          playbackStartTimeRef.current = performance.now(); 
      } else {
          // Resume logic (simple restart from bridge for now to ensure smoothness)
           playbackStartTimeRef.current = performance.now() - (playbackProgress/100 * sequenceToPlay[sequenceToPlay.length-1].time! * 1000); 
      }

      setPlaybackState('playing');
      addSystemLog(`Executing Trajectory...`);

      const totalDuration = sequenceToPlay[sequenceToPlay.length - 1].time || 0;
      
      const loop = () => {
          const now = performance.now();
          // If we paused, the reference time needs offset logic, simplified here by resetting start on resume
          const elapsedSeconds = (now - playbackStartTimeRef.current) / 1000;

          if (elapsedSeconds >= totalDuration) {
              setJointValues(sequenceToPlay[sequenceToPlay.length - 1]);
              setPlaybackState('idle');
              setPlaybackProgress(100);
              activeTrajectoryRef.current = []; 
              addSystemLog(`Trajectory execution complete.`);
              return;
          }

          const nextIndex = sequenceToPlay.findIndex(pt => (pt.time || 0) > elapsedSeconds);
          
          if (nextIndex > 0) {
              const prev = sequenceToPlay[nextIndex - 1];
              const next = sequenceToPlay[nextIndex];
              const prevTime = prev.time || 0;
              const nextTime = next.time || 0;
              
              const factor = (elapsedSeconds - prevTime) / (nextTime - prevTime);
              const clampedFactor = Math.max(0, Math.min(1, factor));

              const interpolated: Record<string, number> = {};
              Object.keys(next).forEach(key => {
                  if (key === 'time') return;
                  const pVal = prev[key] || 0;
                  const nVal = next[key] || 0;
                  interpolated[key] = pVal + (nVal - pVal) * clampedFactor;
              });
              
              setJointValues(interpolated);
          }

          setPlaybackProgress((elapsedSeconds / totalDuration) * 100);
          animationRef.current = requestAnimationFrame(loop);
      };

      animationRef.current = requestAnimationFrame(loop);
  };

  return (
    <div className="flex flex-col w-full h-screen bg-black text-white overflow-hidden font-sans">
      <div className="flex flex-1 min-h-0 overflow-hidden">
          <ControlPanel 
            robotModel={robotModel}
            jointValues={jointValues}
            onJointChange={handleJointChange}
            onFilesUpload={handleFilesUpload}
            onLoadPreset={handleLoadPreset}
            onAnalyze={handleAnalyze}
            onGenerateCode={handleGenerateCode}
            onStartSimulation={startPlayback}
            onPauseSimulation={pausePlayback}
            onStopSimulation={stopPlayback}
            playbackState={playbackState}
            playbackProgress={playbackProgress}
            analysisResult={analysisResult}
            generatedCode={generatedCode}
            hasPendingTarget={!!targetTrajectory}
            isProcessing={isProcessing}
            showTrace={showTrace}
            onToggleTrace={() => setShowTrace(!showTrace)}
          />
          
          <div className="flex-1 relative">
            <Visualizer3D 
              robotModel={robotModel} 
              jointValues={jointValues}
              urdfUrl={urdfUrl}
              urdfContent={urdfContent}
              packages={packages}
              blobMap={blobMap}
              onLog={addSystemLog}
              showTrace={showTrace}
              traceVersion={traceVersion}
            />
          </div>
      </div>

      <div className="h-48 bg-slate-900 border-t border-slate-700 flex flex-col shrink-0 z-10">
         <div className="flex items-center px-4 py-1 bg-slate-800 border-b border-slate-700 text-xs font-semibold text-slate-300 gap-2">
            <Terminal className="w-3 h-3 text-blue-400" />
            OUTPUT / SYSTEM LOG
         </div>
         <div ref={logContainerRef} className="flex-1 overflow-y-auto p-2 font-mono text-[11px] text-slate-400 custom-scrollbar">
            {systemLogs.length === 0 && <span className="opacity-50 italic">System ready...</span>}
            {systemLogs.map((log, index) => (
                <div key={index} className={`whitespace-nowrap py-0.5 ${
                    log.includes('Error') || log.includes('Fatal') ? 'text-red-400' :
                    log.includes('Success') ? 'text-green-400' : 
                    log.includes('Loaded') ? 'text-blue-300' : ''
                }`}>
                    {log}
                </div>
            ))}
         </div>
      </div>
    </div>
  );
};

export default App;