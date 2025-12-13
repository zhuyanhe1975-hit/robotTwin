
import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, Html, Line } from '@react-three/drei';
import { STLLoader, ColladaLoader } from 'three-stdlib';
import URDFLoader from 'urdf-loader';
import { RobotModel } from '../types';
import * as THREE from 'three';

type URDFRobot = THREE.Object3D & {
  joints: { [key: string]: any };
  setJointValue: (jointName: string, angle: number) => void;
};

interface VisualizerProps {
  robotModel: RobotModel | null;
  jointValues: Record<string, number>;
  urdfUrl: string | null;
  urdfContent: string | null;
  packages: Record<string, string>;
  blobMap?: Record<string, string>;
  onLog: (msg: string) => void;
  showTrace: boolean;
  traceVersion: number;
}

// Helper: Find the end effector (leaf node furthest from base)
const findEndEffector = (object: THREE.Object3D): THREE.Object3D | null => {
    let maxDepth = -1;
    let leaf: THREE.Object3D | null = null;

    const traverse = (obj: THREE.Object3D, depth: number) => {
        if (obj.children.length === 0) {
            if (depth > maxDepth) {
                maxDepth = depth;
                leaf = obj;
            }
        }
        obj.children.forEach(c => traverse(c, depth + 1));
    };
    traverse(object, 0);
    return leaf;
};

// Component: Renders the path trace of the end effector
const TrajectoryTrace: React.FC<{ robot: THREE.Object3D | null; active: boolean; version: number }> = ({ robot, active, version }) => {
    const [points, setPoints] = useState<THREE.Vector3[]>([]);
    const endEffectorRef = useRef<THREE.Object3D | null>(null);
    const lastPos = useRef<THREE.Vector3>(new THREE.Vector3());
    const frameCount = useRef(0);
    const lastVersion = useRef(version);

    if (version !== lastVersion.current) {
        setPoints([]);
        lastVersion.current = version;
    }

    useEffect(() => {
        if (robot) {
            let ee = robot.getObjectByName('tool0') || robot.getObjectByName('link_6') || robot.getObjectByName('end_effector');
            if (!ee) ee = findEndEffector(robot);
            endEffectorRef.current = ee || null;
            setPoints([]); 
        }
    }, [robot]);

    useFrame(() => {
        if (!active || !endEffectorRef.current) return;
        frameCount.current++;
        if (frameCount.current % 3 !== 0) return;

        const worldPos = new THREE.Vector3();
        endEffectorRef.current.getWorldPosition(worldPos);

        if (worldPos.distanceTo(lastPos.current) > 0.005) {
            setPoints(prev => {
                const next = [...prev, worldPos.clone()];
                if (next.length > 3000) next.shift(); 
                return next;
            });
            lastPos.current.copy(worldPos);
        }
    });

    if (points.length < 2) return null;
    return <Line points={points} color="#f59e0b" lineWidth={2} dashed={false} opacity={0.8} transparent />;
};

const Robot: React.FC<{ 
  content: string;
  baseUrl: string;
  jointValues: Record<string, number>;
  packages: Record<string, string>;
  blobMap?: Record<string, string>;
  onLoad?: () => void;
  onLog: (msg: string) => void;
  onError: (msg: string) => void;
  onRobotReady: (robot: URDFRobot) => void;
}> = ({ content, baseUrl, jointValues, packages, blobMap, onLoad, onLog, onError, onRobotReady }) => {
  const { scene } = useThree();
  const robotRef = useRef<URDFRobot | null>(null);
  const [loadedRobot, setLoadedRobot] = useState<URDFRobot | null>(null);
  const latestJointValues = useRef(jointValues);

  useEffect(() => {
      latestJointValues.current = jointValues;
  }, [jointValues]);

  useEffect(() => {
    if (!content || !content.trim()) return;

    onLog(`[Init] Starting URDF Load. BaseURL: ${baseUrl || 'None'}`);
    const trimmedContent = content.trim();

    if (trimmedContent.toLowerCase().startsWith('<!doctype html') || trimmedContent.toLowerCase().startsWith('<html')) {
        const msg = "Invalid URDF Content: Received HTML instead of XML.";
        onLog(`[Fatal] ${msg}`);
        onError(msg);
        return;
    }

    setLoadedRobot(null);
    const manager = new THREE.LoadingManager();
    const loader = new URDFLoader(manager);
    const urdfDir = baseUrl && baseUrl.includes('/') ? baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1) : '';

    const resolveStrictPath = (originalPath: string) => {
        if (!originalPath) return "";
        const fileName = originalPath.split(/[\\/]/).pop() || "";
        const lowerFileName = fileName.toLowerCase();

        if (blobMap) {
           const blobUrl = blobMap[fileName] || Object.entries(blobMap).find(([k]) => k.toLowerCase() === lowerFileName)?.[1];
           if (blobUrl) return blobUrl;
        }

        const isCollision = originalPath.toLowerCase().includes('collision');
        const subFolder = isCollision ? 'collision/' : 'visual/';
        try {
            const relativePath = `../meshes/${subFolder}${fileName}`;
            if (urdfDir && !urdfDir.startsWith('blob:')) {
                const base = new URL(urdfDir, window.location.href).href;
                return new URL(relativePath, base).href;
            }
            return `${urdfDir}${relativePath}`;
        } catch (e) {
             return `${urdfDir}../meshes/${subFolder}${fileName}`;
        }
    };

    (loader as any).packages = new Proxy({}, {
        get: (target, prop) => `package://${String(prop)}`,
        has: () => true,
        ownKeys: () => [],
        getOwnPropertyDescriptor: (target, prop) => ({ configurable: true, enumerable: true, value: `package://${String(prop)}` })
    });

    (loader as any).loadMeshCb = (path: string, manager: THREE.LoadingManager, done: (mesh: THREE.Object3D) => void) => {
      const cleanPath = resolveStrictPath(path);
      const ext = cleanPath.split('.').pop()?.toLowerCase();
      const isBlob = cleanPath.startsWith('blob:');

      const onMeshError = (err: any) => {
          onLog(`[Mesh Error] Failed: ${cleanPath} (${err.message || err})`);
          const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
          const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
          done(new THREE.Mesh(geometry, material));
      };

      try {
        if (ext === 'stl' || (isBlob && path.toLowerCase().endsWith('.stl'))) {
            new STLLoader(manager).load(cleanPath, (geom) => {
                const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide }));
                done(mesh);
            }, undefined, onMeshError);
        } else if (ext === 'dae' || (isBlob && path.toLowerCase().endsWith('.dae'))) {
            const colladaLoader = new ColladaLoader(manager);
            fetch(cleanPath).then(res => res.ok ? res.text() : Promise.reject(res.status))
                .then(text => {
                     const dae = colladaLoader.parse(text, cleanPath);
                     if (dae && dae.scene) {
                         dae.scene.traverse((child: any) => {
                             if (child.isMesh) {
                                 child.castShadow = true;
                                 child.receiveShadow = true;
                                 if (child.material) {
                                     child.material = child.material.clone(); 
                                     child.material.side = THREE.DoubleSide;
                                     child.userData.originalColor = child.material.color.clone();
                                     child.userData.originalEmissive = child.material.emissive.clone();
                                 }
                             }
                         });
                         done(dae.scene);
                     }
                }).catch(onMeshError);
        } else {
             done(new THREE.Object3D());
        }
      } catch (e) { onMeshError(e); }
    };

    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(trimmedContent, 'text/xml');
        const urdfRobot = loader.parse(xmlDoc.documentElement) as URDFRobot;

        urdfRobot.traverse((c: THREE.Object3D) => {
          c.castShadow = true;
          c.receiveShadow = true;
        });

        setLoadedRobot(urdfRobot);
        robotRef.current = urdfRobot;
        onRobotReady(urdfRobot);
        if (onLoad) onLoad();
    } catch (err: any) {
        onLog(`[Fatal Error] ${err.message}`);
        onError(`Failed to parse robot model: ${err.message}`);
    }

    return () => {
       setLoadedRobot(null);
       robotRef.current = null;
    };
  }, [content, baseUrl, packages, blobMap]);

  useFrame((state) => {
    if (robotRef.current) {
      const currentJoints = latestJointValues.current;
      Object.entries(currentJoints).forEach(([name, val]) => {
         const joint = robotRef.current!.joints[name];
         if (joint) {
             robotRef.current!.setJointValue(name, val);
             
             if (joint.limit && joint.limit.lower !== undefined && joint.limit.upper !== undefined) {
                 const lower = Number(joint.limit.lower);
                 const upper = Number(joint.limit.upper);
                 const range = upper - lower;
                 const currentVal = Number(val);
                 const normalized = (currentVal - lower) / range;
                 const isNearLimit = normalized < 0.02 || normalized > 0.98;
                 
                 joint.traverse((child: any) => {
                     if (child.isMesh && child.material) {
                         const mat = child.material as any;
                         if (isNearLimit) {
                             if (mat.emissive) mat.emissive.setHex(0xff0000);
                             if (mat.emissiveIntensity !== undefined) {
                                mat.emissiveIntensity = 0.5 + Math.sin(state.clock.elapsedTime * 10) * 0.2;
                             }
                         } else {
                             if (child.userData.originalEmissive && mat.emissive) {
                                 mat.emissive.copy(child.userData.originalEmissive);
                                 if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0;
                             }
                         }
                     }
                 });
             }
         }
      });
    }
  });

  return loadedRobot ? <primitive object={loadedRobot} dispose={null} /> : null;
};

// Main Visualizer
const Visualizer3D: React.FC<VisualizerProps> = ({ 
  robotModel, jointValues, urdfUrl, urdfContent, packages, blobMap, onLog, showTrace, traceVersion 
}) => {
  const [error, setError] = useState<string | null>(null);
  const [activeRobot, setActiveRobot] = useState<THREE.Object3D | null>(null);

  useEffect(() => { setError(null); }, [urdfContent]);

  return (
    <div className="w-full h-full bg-gray-950 relative">
        <Canvas shadows camera={{ position: [3, 3, 3], up: [0, 0, 1], fov: 45 }} dpr={[1, 1.5]}>
          <Environment preset="city" />
          <ambientLight intensity={1.5} />
          <directionalLight position={[5, 10, 5]} intensity={2.0} castShadow shadow-mapSize={[2048, 2048]} />
          
          <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI} />
          <Grid position={[0, 0, 0]} args={[20, 20]} cellSize={0.5} cellThickness={0.5} cellColor="#4b5563" sectionSize={2} sectionThickness={1} sectionColor="#6b7280" fadeDistance={30} infiniteGrid rotation={[Math.PI / 2, 0, 0]} />
          <axesHelper args={[1]} />
          
          {/* Floor */}
          <mesh position={[0, 0, -0.01]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#111827" opacity={0.9} transparent />
          </mesh>

          {urdfContent && (
             <Robot 
                 content={urdfContent}
                 baseUrl={urdfUrl || ''} 
                 jointValues={jointValues} 
                 packages={packages}
                 blobMap={blobMap}
                 onLog={onLog}
                 onError={setError}
                 onRobotReady={setActiveRobot}
               />
          )}

          <TrajectoryTrace robot={activeRobot} active={showTrace} version={traceVersion} />

          {!urdfContent && (
             <Html center><div className="text-slate-500 text-sm">Waiting for Model...</div></Html>
          )}
        </Canvas>
        
        {error && (
             <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-8 z-50">
                 <div className="bg-slate-900 border border-red-500 rounded-lg shadow-2xl p-6 max-w-lg">
                     <h2 className="text-red-400 font-bold mb-2">Error Loading Robot</h2>
                     <p className="text-red-200 text-sm">{error}</p>
                     <button onClick={() => setError(null)} className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm">Dismiss</button>
                 </div>
             </div>
        )}
    </div>
  );
};

export default Visualizer3D;
