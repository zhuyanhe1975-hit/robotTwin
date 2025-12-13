
import { RobotModel, JointConfig, CartesianPose, Vector3, JointType } from '../types';
import * as THREE from 'three';

// Helper: Convert generic Vector3 to Three.js Vector3
const toThreeVec = (v: Vector3) => new THREE.Vector3(v.x, v.y, v.z);

// A simplified node structure for IK calculation
interface IKLink {
    name: string;
    jointName?: string; // The joint driving this link
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    axis: THREE.Vector3; // Local axis
    jointType: JointType;
    limit?: { lower: number, upper: number };
    angle: number;
    parent: IKLink | null;
    child: IKLink | null;
    offset: THREE.Vector3; // From parent
    rotation: THREE.Euler; // From parent (fixed)
}

/**
 * Builds a kinematic chain from the RobotModel for a specific end-effector path.
 * This simplifies the tree into a single serial chain (Base -> ... -> End Effector).
 */
export const buildKinematicChain = (model: RobotModel, jointValues: Record<string, number>): IKLink[] => {
    const chain: IKLink[] = [];
    
    // We need to traverse from Root to a Leaf (End Effector).
    // Logic: Prefer moving joints (Revolute/Prismatic) over Fixed joints to follow the main arm.
    
    const linksTemp: { linkName: string; jointName: string | null }[] = [{ linkName: model.rootLink, jointName: null }];
    let curr = model.tree;
    
    // Greedy traversal with priority
    while(curr.children.length > 0) {
        let nextChild = curr.children[0];
        
        // If there are multiple children, try to find a moving joint
        if (curr.children.length > 1) {
            const movingChild = curr.children.find(c => {
                const j = model.joints[c.jointName];
                return j && (j.type === JointType.REVOLUTE || j.type === JointType.CONTINUOUS || j.type === JointType.PRISMATIC);
            });
            if (movingChild) {
                nextChild = movingChild;
            }
        }

        linksTemp.push({ linkName: nextChild.childNode.linkName, jointName: nextChild.jointName });
        curr = nextChild.childNode;
    }

    // 2. Build IKLink Objects
    let parentLink: IKLink | null = null;

    linksTemp.forEach(item => {
        const joint = item.jointName ? model.joints[item.jointName] : null;
        
        const offset = joint ? toThreeVec(joint.origin.xyz) : new THREE.Vector3();
        const rot = joint ? new THREE.Euler(joint.origin.rpy.x, joint.origin.rpy.y, joint.origin.rpy.z) : new THREE.Euler();
        const axis = joint ? toThreeVec(joint.axis) : new THREE.Vector3(0,0,1);
        
        const link: IKLink = {
            name: item.linkName,
            jointName: item.jointName || undefined,
            position: new THREE.Vector3(),
            quaternion: new THREE.Quaternion(),
            axis: axis,
            jointType: joint ? joint.type : JointType.FIXED,
            limit: joint?.limit,
            angle: joint ? (jointValues[joint.name] || 0) : 0,
            parent: parentLink,
            child: null,
            offset,
            rotation: rot
        };

        if (parentLink) {
            parentLink.child = link;
        }
        
        chain.push(link);
        parentLink = link;
    });

    // Run Initial FK to set positions
    updateChainFK(chain);

    return chain;
};

/**
 * Updates the Position and Quaternion of every link in the chain based on current angles.
 */
export const updateChainFK = (chain: IKLink[]) => {
    chain.forEach((link, index) => {
        if (index === 0) {
            // Base Link (assume 0,0,0 identity)
            link.position.set(0, 0, 0);
            link.quaternion.identity();
        } else {
            const parent = link.parent!;
            
            // 1. Apply Fixed Transform from Parent (Joint Origin)
            const parentPos = parent.position.clone();
            const parentQuat = parent.quaternion.clone();
            
            // Offset rotated by parent's orientation
            const offsetVec = link.offset.clone().applyQuaternion(parentQuat);
            const currentPos = parentPos.add(offsetVec);
            
            // Fixed Rotation (Joint Origin RPY)
            const fixedRotQuat = new THREE.Quaternion().setFromEuler(link.rotation);
            const currentQuat = parentQuat.clone().multiply(fixedRotQuat);
            
            // 2. Apply Joint Rotation (The Variable)
            if (link.jointType === JointType.REVOLUTE || link.jointType === JointType.CONTINUOUS) {
                const jointRot = new THREE.Quaternion().setFromAxisAngle(link.axis, link.angle);
                currentQuat.multiply(jointRot);
            }
            
            link.position.copy(currentPos);
            link.quaternion.copy(currentQuat);
        }
    });
};

/**
 * Solves Inverse Kinematics using CCD (Cyclic Coordinate Descent).
 * Iteratively adjusts joints from End-Effector to Base to minimize error.
 */
export const solveIK = (
    chain: IKLink[], 
    targetPos: THREE.Vector3, 
    targetRot?: THREE.Euler, // Optional orientation target
    maxIterations = 20, 
    threshold = 0.005
): Record<string, number> => {
    
    const endEffector = chain[chain.length - 1];
    if (!endEffector) return {};

    let iter = 0;
    let distError = endEffector.position.distanceTo(targetPos);

    while (iter < maxIterations && distError > threshold) {
        // Iterate backwards from second-to-last link (parent of EE) up to the first joint
        // Skip chain[0] as it's the base link
        for (let i = chain.length - 1; i >= 1; i--) {
            const link = chain[i];
            const parent = link.parent!;
            
            // Pivot is at: ParentWorldPos + ParentWorldRot * LinkOffset
            const pivot = parent.position.clone().add(link.offset.clone().applyQuaternion(parent.quaternion));
            
            const toEE = endEffector.position.clone().sub(pivot);
            const toTarget = targetPos.clone().sub(pivot);
            
            // The joint axis is local. We need it in World Space.
            // Joint Frame Orientation = ParentWorldQuat * FixedRotQuat
            const fixedRotQuat = new THREE.Quaternion().setFromEuler(link.rotation);
            const jointFrameQuat = parent.quaternion.clone().multiply(fixedRotQuat);
            const axisWorld = link.axis.clone().applyQuaternion(jointFrameQuat).normalize();
            
            // Project vectors onto the plane perpendicular to the joint axis
            const toEEProj = toEE.clone().projectOnPlane(axisWorld).normalize();
            const toTargetProj = toTarget.clone().projectOnPlane(axisWorld).normalize();
            
            // Angle between projected vectors
            let deltaAngle = toEEProj.angleTo(toTargetProj);
            
            // Direction (Cross product check)
            const cross = new THREE.Vector3().crossVectors(toEEProj, toTargetProj);
            if (cross.dot(axisWorld) < 0) {
                deltaAngle = -deltaAngle;
            }
            
            // Apply rotation with damping for stability
            const damping = 0.8; 
            let newAngle = link.angle + deltaAngle * damping;
            
            // Enforce Limits
            if (link.limit) {
                if (newAngle < link.limit.lower) newAngle = link.limit.lower;
                if (newAngle > link.limit.upper) newAngle = link.limit.upper;
            }
            
            link.angle = newAngle;
            
            // Update FK immediately so next joint sees correct EE position
            updateChainFK(chain);
        }
        
        distError = endEffector.position.distanceTo(targetPos);
        iter++;
    }

    // Extract final angles
    const result: Record<string, number> = {};
    chain.forEach(link => {
        if (link.jointName) {
            result[link.jointName] = link.angle;
        }
    });
    
    return result;
};

/**
 * Wrapper to generate a full joint trajectory from Cartesian Waypoints
 */
export const generateTrajectory = (
    model: RobotModel, 
    startJoints: Record<string, number>, 
    waypoints: CartesianPose[]
): Record<string, number>[] => {
    
    const trajectory: Record<string, number>[] = [];
    
    // 1. Build Chain with current state
    const chain = buildKinematicChain(model, startJoints);
    
    // 2. Interpolate and Solve
    let previousPose = new THREE.Vector3(0,0,0);
    // Initialize previousPose with current FK
    updateChainFK(chain);
    previousPose.copy(chain[chain.length-1].position);

    waypoints.forEach((wp) => {
        const targetPos = new THREE.Vector3(wp.x, wp.y, wp.z);
        const steps = 15; // Interpolation steps between waypoints
        
        for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            
            // Linear Interpolation (Lerp) for position
            const nextPos = new THREE.Vector3().lerpVectors(previousPose, targetPos, t);
            
            // Solve IK
            // The chain object maintains state (angles) from previous iteration, providing a "warm start" for CCD.
            solveIK(chain, nextPos, undefined, 15, 0.005);
            
            // Extract angles
            const frameJoints: Record<string, number> = {};
            chain.forEach(link => {
                if (link.jointName) {
                    frameJoints[link.jointName] = link.angle;
                }
            });
            
            trajectory.push(frameJoints);
        }
        previousPose.copy(targetPos);
    });

    return trajectory;
};
