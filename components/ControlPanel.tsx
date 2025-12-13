import React, { useState } from 'react';
import { RobotModel, JointConfig, JointType } from '../types';
import { ROBOT_CATALOG, APP_VERSION } from '../constants';
import { Upload, Cpu, Play, Pause, Square, Terminal, Info, Code, RotateCcw, Box, FileCode, AlertTriangle, CheckCircle2, BookOpen, Activity, ArrowRightLeft, Zap } from 'lucide-react';

interface ControlPanelProps {
  robotModel: RobotModel | null;
  jointValues: Record<string, number>;
  onJointChange: (name: string, value: number) => void;
  onFilesUpload: (files: FileList) => void;
  onLoadPreset: (id: string) => void;
  onAnalyze: () => void;
  onGenerateCode: (task: string) => void;
  
  onStartSimulation: () => void;
  onPauseSimulation: () => void;
  onStopSimulation: () => void;
  playbackState: 'idle' | 'playing' | 'paused';
  playbackProgress: number;

  analysisResult: string;
  generatedCode: string;
  hasPendingTarget: boolean;
  isProcessing: boolean;
  
  showTrace: boolean;
  onToggleTrace: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  robotModel,
  jointValues,
  onJointChange,
  onFilesUpload,
  onLoadPreset,
  onAnalyze,
  onGenerateCode,
  
  onStartSimulation,
  onPauseSimulation,
  onStopSimulation,
  playbackState,
  playbackProgress,

  analysisResult,
  generatedCode,
  hasPendingTarget,
  isProcessing,
  showTrace,
  onToggleTrace,
}) => {
  const [activeTab, setActiveTab] = useState<'controls' | 'library' | 'ai'>('library');
  const [taskPrompt, setTaskPrompt] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesUpload(e.target.files);
    }
  };

  const getSliderBackground = (val: number, min: number, max: number) => {
    const percentage = ((val - min) / (max - min)) * 100;
    // Show Warning color if near limits (<5% or >95%)
    const isNearLimit = percentage < 5 || percentage > 95;
    const color = isNearLimit ? '#ef4444' : '#f59e0b'; // Red or Amber
    return `linear-gradient(to right, ${color} ${percentage}%, #334155 ${percentage}%)`;
  };

  const setDemoPrompt = (type: 'pick' | 'weld') => {
      if (type === 'pick') {
          setTaskPrompt(
            "执行抓取码垛任务：\n1. 移动到取料点上方 (0.5, -0.4, 0.6)\n2. 下降抓取 (0.5, -0.4, 0.3)\n3. 抬升至安全高度 Z=0.6\n4. 移动到放置点上方 (0.5, 0.4, 0.6)\n5. 下降放置 (0.5, 0.4, 0.3)\n要求：全程保持末端垂直向下 (Z轴朝向 -Z)。\n提示：强制设置 Pitch=1.57 以保证末端垂直向下。"
          );
      } else {
          setTaskPrompt(
            "执行弧焊任务：\n在平面 Z=0.3 上，沿 Y 轴方向 (从 Y=-0.3 到 Y=0.3) 绘制正弦波轨迹，X轴方向振幅 0.05，频率 3。\n要求：轨迹平滑，焊接过程中保持末端垂直指向工件表面 (Z轴朝向 -Z)。\n提示：强制设置 Pitch=1.57 以保证末端垂直向下。"
          );
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-700 w-[400px] text-slate-100 shadow-xl overflow-hidden shrink-0">
      {/* Header */}
      <div className="p-5 border-b border-slate-700 bg-slate-800">
        <h1 className="text-xl font-bold flex items-center gap-2 text-amber-500">
          <Cpu className="w-6 h-6" /> RoboStudioX 
          <span className="text-[10px] bg-amber-900/50 text-amber-400 px-1.5 py-0.5 rounded border border-amber-800 ml-2">{APP_VERSION}</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">工业机器人仿真平台</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 bg-slate-800/50">
        <button
          onClick={() => setActiveTab('library')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'library' ? 'text-white border-b-2 border-amber-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          模型库
        </button>
        <button
          onClick={() => setActiveTab('controls')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'controls' ? 'text-white border-b-2 border-amber-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          控制
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'ai' ? 'text-white border-b-2 border-amber-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          智能/任务
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
        
        {/* === LIBRARY TAB (模型库) === */}
        {activeTab === 'library' && (
          <div className="space-y-6">
             <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-500" /> 机器人列表
              </h3>
              <div className="space-y-3">
                {ROBOT_CATALOG.map(robot => (
                  <button
                    key={robot.id}
                    onClick={() => onLoadPreset(robot.id)}
                    className="w-full text-left p-3 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-amber-500/50 transition-all group"
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-slate-200 group-hover:text-amber-400">{robot.name}</span>
                      <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400">{robot.manufacturer}</span>
                    </div>
                    {robot.description && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{robot.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-700"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                    <span className="bg-slate-900 px-2 text-slate-500">或上传本地模型</span>
                </div>
            </div>

            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors group">
                <div className="flex flex-col items-center justify-center pt-2 pb-3">
                  <Upload className="w-6 h-6 text-slate-400 mb-2 group-hover:text-amber-500 transition-colors" />
                  <p className="text-xs text-slate-400 text-center px-4">
                    拖入 <span className="text-amber-500 font-mono">.urdf</span> 和 <span className="text-amber-500 font-mono">.stl</span> 文件
                  </p>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  multiple 
                  accept=".urdf,.xml,.stl,.STL,.dae,.DAE" 
                  onChange={handleFileChange} 
                />
              </label>
            </div>
          </div>
        )}

        {/* === CONTROLS TAB (控制) === */}
        {activeTab === 'controls' && (
          <div className="space-y-6">
            
            {robotModel ? (
                  <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                    <div className="flex justify-between items-center text-xs text-slate-400 border-b border-slate-700 pb-2">
                        <span className="flex items-center gap-2"><FileCode className="w-3 h-3 text-amber-500"/> 模型名称:</span>
                        <span className="text-slate-200 font-mono">{robotModel.name}</span>
                    </div>
                    
                    {robotModel.warnings && robotModel.warnings.length > 0 ? (
                        <div className="bg-red-950/40 border border-red-900/50 rounded p-3 mt-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-red-400 mb-2">
                                <AlertTriangle className="w-3 h-3" /> 缺失 Mesh 文件 ({robotModel.warnings.length})
                            </div>
                            <ul className="text-[10px] text-red-300/70 font-mono max-h-24 overflow-y-auto space-y-1 pl-1 custom-scrollbar">
                                {robotModel.warnings.map((w, i) => (
                                    <li key={i} className="flex items-start gap-1">
                                        <span className="mt-0.5">•</span> 
                                        <span className="break-all">{w}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-xs text-emerald-500 mt-2 bg-emerald-900/20 p-2 rounded border border-emerald-900/30">
                            <CheckCircle2 className="w-3 h-3" /> 资源加载完整
                        </div>
                    )}
                  </div>
            ) : (
                <div className="text-slate-500 text-sm italic text-center py-4 bg-slate-800/50 rounded-lg border border-slate-700 border-dashed">
                    请先从模型库加载或上传文件。
                </div>
            )}

            {/* Joint Sliders */}
            {robotModel && (
            <div>
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-amber-500" /> 关节配置
                  </h3>
                  <button 
                    onClick={onToggleTrace}
                    className={`text-xs px-2 py-1 rounded flex items-center gap-1 border transition-colors ${showTrace ? 'bg-amber-900/40 border-amber-500/50 text-amber-400' : 'bg-slate-800 border-slate-600 text-slate-400'}`}
                  >
                      <Activity className="w-3 h-3" /> 轨迹显示 {showTrace ? 'ON' : 'OFF'}
                  </button>
              </div>
              
              <div className="space-y-5">
                {(Object.values(robotModel.joints) as JointConfig[])
                  .filter(j => j.type !== JointType.FIXED)
                  .map((joint) => {
                    const min = joint.limit?.lower ?? -3.14;
                    const max = joint.limit?.upper ?? 3.14;
                    const val = jointValues[joint.name] || 0;

                    return (
                      <div key={joint.name} className="group">
                        <div className="flex justify-between text-xs mb-1.5 font-mono text-slate-400">
                          <span className="group-hover:text-amber-400 transition-colors truncate max-w-[200px]" title={joint.name}>{joint.name}</span>
                          <span>{val.toFixed(2)} rad</span>
                        </div>
                        <div className="relative h-2 w-full rounded-full bg-slate-700">
                            <input
                              type="range"
                              min={min}
                              max={max}
                              step={0.01}
                              value={val}
                              onChange={(e) => onJointChange(joint.name, parseFloat(e.target.value))}
                              className="absolute w-full h-2 rounded-full appearance-none cursor-pointer z-10 opacity-0"
                            />
                            <div 
                                className="absolute top-0 left-0 h-2 rounded-full pointer-events-none"
                                style={{ width: '100%', background: getSliderBackground(val, min, max) }}
                            ></div>
                             <div 
                                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg pointer-events-none transition-transform group-active:scale-110"
                                style={{ left: `calc(${((val - min) / (max - min)) * 100}% - 8px)` }}
                             />
                        </div>
                      </div>
                    );
                })}
              </div>
            </div>
            )}
          </div>
        )}

        {/* === AI TAB === */}
        {activeTab === 'ai' && (
          <div className="space-y-6">
            {/* Analysis Section */}
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-500" /> 本地参数识别 (Local ID)
              </h3>
              <button
                onClick={onAnalyze}
                disabled={!robotModel}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-3"
              >
                提取参数 (Instant)
              </button>
              
              {analysisResult && (
                <div className="p-3 bg-slate-900 rounded text-xs text-slate-300 leading-relaxed max-h-48 overflow-y-auto border border-slate-700 custom-scrollbar whitespace-pre-line font-mono">
                  {analysisResult}
                </div>
              )}
            </div>

            {/* Code Gen Section */}
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
               <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-green-500" /> 智能任务规划
              </h3>
              <p className="text-xs text-slate-400 mb-2">快速演示场景:</p>
              
              <div className="flex gap-2 mb-3">
                 <button 
                   onClick={() => setDemoPrompt('pick')}
                   className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-amber-500/30 rounded text-xs text-slate-200 flex items-center justify-center gap-1.5 transition-colors group"
                 >
                   <Box className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform"/> 抓取码垛
                 </button>
                 <button 
                   onClick={() => setDemoPrompt('weld')}
                   className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-blue-500/30 rounded text-xs text-slate-200 flex items-center justify-center gap-1.5 transition-colors group"
                 >
                   <Zap className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform"/> 弧焊任务
                 </button>
              </div>

              <textarea 
                value={taskPrompt}
                onChange={(e) => setTaskPrompt(e.target.value)}
                placeholder="在此描述任务 (例如: 末端在xy平面内划圆...)"
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none h-24 resize-none mb-2"
              />
              <button
                onClick={() => onGenerateCode(taskPrompt)}
                disabled={isProcessing || !robotModel || !taskPrompt}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-3"
              >
                 {isProcessing ? "规划与解算中..." : "生成轨迹"}
              </button>

              {generatedCode && (
                <div className="relative group mb-3">
                    <div className="absolute top-2 right-2 p-1 bg-slate-700 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        <Code className="w-3 h-3 text-slate-300" />
                    </div>
                    <pre className="p-3 bg-black rounded text-xs text-green-400 font-mono overflow-x-auto border border-slate-700 max-h-40 scrollbar-thin">
                        {generatedCode}
                    </pre>
                </div>
              )}

              {/* Playback Control Toolbar */}
              <div className="border-t border-slate-700 pt-3">
                  <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-slate-300">轨迹仿真控制</span>
                      {hasPendingTarget && (
                          <span className="text-[10px] bg-amber-900/40 text-amber-400 px-1.5 rounded">Ready</span>
                      )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                      <button
                        onClick={playbackState === 'playing' ? onPauseSimulation : onStartSimulation}
                        disabled={!hasPendingTarget}
                        className={`flex-1 py-2 rounded text-sm font-medium transition-all flex items-center justify-center gap-2
                          ${hasPendingTarget 
                            ? (playbackState === 'playing' 
                                ? 'bg-amber-700 hover:bg-amber-600 text-white' 
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white') 
                            : 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                          }`}
                      >
                         {playbackState === 'playing' ? (
                             <><Pause className="w-4 h-4" /> 暂停</>
                         ) : (
                             <><Play className="w-4 h-4" /> {playbackState === 'paused' ? '继续' : '运行'}</>
                         )}
                      </button>

                      <button
                        onClick={onStopSimulation}
                        disabled={!hasPendingTarget || playbackState === 'idle'}
                        className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="停止并重置"
                      >
                         <Square className="w-4 h-4 fill-current" />
                      </button>
                  </div>

                  {/* Progress Bar */}
                  {hasPendingTarget && (
                    <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-amber-500 transition-all duration-300 ease-out"
                            style={{ width: `${playbackProgress}%` }}
                        ></div>
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700 bg-slate-800 text-center">
        <a 
          href="https://ai.google.dev" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-[10px] text-slate-500 hover:text-amber-500 transition-colors"
        >
          Powered by Google Gemini
        </a>
      </div>
    </div>
  );
};

export default ControlPanel;