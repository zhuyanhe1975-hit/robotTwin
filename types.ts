
export enum JointType {
  REVOLUTE = 'revolute',
  CONTINUOUS = 'continuous',
  PRISMATIC = 'prismatic',
  FIXED = 'fixed'
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface JointConfig {
  name: string;
  type: JointType;
  parentLink: string;
  childLink: string;
  origin: {
    xyz: Vector3;
    rpy: Vector3; // Roll Pitch Yaw (radians)
  };
  axis: Vector3;
  limit?: {
    lower: number;
    upper: number;
  };
  currentValue: number; // Current rotation/position
}

export interface LinkDynamics {
  mass: number;
  inertia: { ixx: number; iyy: number; izz: number; ixy: number; ixz: number; iyz: number };
}

export interface LinkConfig {
  name: string;
  dynamics?: LinkDynamics;
}

export interface RobotModel {
  name: string;
  rootLink: string;
  links: Record<string, LinkConfig>;
  joints: Record<string, JointConfig>;
  tree: RobotNode;
  warnings?: string[];
}

export interface RobotNode {
  linkName: string;
  children: Array<{
    jointName: string;
    childNode: RobotNode;
  }>;
}

export interface SimulationState {
  robot: RobotModel | null;
  jointValues: Record<string, number>; // Map joint name -> value
}

export interface TrajectoryPoint extends Record<string, number> {
    time?: number; // Time in seconds from start
}

// Cartesian Pose for Task Planning
export interface CartesianPose {
    x: number;
    y: number;
    z: number;
    roll: number;
    pitch: number;
    yaw: number;
    time?: number; // Desired arrival time
}

export interface AICommandResult {
  code: string;
  waypoints?: CartesianPose[];   // Key Cartesian points from AI
  trajectory?: TrajectoryPoint[]; // Final calculated joint trajectory
  explanation?: string;
}
